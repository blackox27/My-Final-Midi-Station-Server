const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Worker } = require("node:worker_threads");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const bankBytes = () => {
  const b = fs.readFileSync("dist/vendor/aurora-demo.sf2");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};
const rms = (a) => Math.sqrt(a.reduce((n, x) => n + x * x, 0) / a.length);

function workletHost() {
  let Processor, nextPort;
  const silentConsole = {
    log() {},
    info() {},
    warn() {},
    debug() {},
    group() {},
    groupCollapsed() {},
    groupEnd() {},
    error: console.error,
  };
  const scope = vm.createContext({
    console: silentConsole,
    TextEncoder,
    TextDecoder,
    performance,
    WebAssembly,
    ArrayBuffer,
    Uint8Array,
    Float32Array,
    Float64Array,
    Int16Array,
    Int32Array,
    Uint32Array,
    DataView,
    setTimeout,
    clearTimeout,
    sampleRate: 44100,
    currentTime: 0,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = nextPort;
      }
    },
    registerProcessor(name, p) {
      Processor = p;
    },
  });
  vm.runInContext(
    fs.readFileSync("dist/vendor/spessa-worklet.js", "utf8"),
    scope,
  );
  class WorkletNode {
    constructor(context, name, options) {
      this.context = context;
      this.port = { onmessage: null };
      const processorPort = { onmessage: null };
      this.port.postMessage = (data) =>
        queueMicrotask(() =>
          processorPort.onmessage?.({ data: structuredClone(data) }),
        );
      processorPort.postMessage = (data) =>
        queueMicrotask(() =>
          this.port.onmessage?.({ data: structuredClone(data) }),
        );
      nextPort = processorPort;
      this.processor = new Processor(options);
      this.connections = [];
    }
    connect(target, index) {
      this.connections.push({ target, index });
    }
    disconnect() {
      this.connections = [];
    }
    render(seconds, channel = 0) {
      const length = Math.ceil(seconds * 44100),
        result = new Float32Array(length);
      for (let i = 0; i < length; i += 128) {
        const outputs = Array.from({ length: 17 }, () => [
          new Float32Array(128),
          new Float32Array(128),
        ]);
        this.processor.process([], outputs);
        result.set(
          outputs[channel + 1][0].subarray(0, Math.min(128, length - i)),
          i,
        );
      }
      return result;
    }
  }
  scope.AudioWorkletNode = WorkletNode;
  vm.runInContext(fs.readFileSync("dist/vendor/spessasynth.js", "utf8"), scope);
  vm.runInContext("Spessa.SpessaLog.setLogLevel(false,false,false)", scope);
  scope.Spessa.testScope = scope;
  return scope.Spessa;
}

test(
  "supplied Lib + Worklet + Core load the bank, route channels, sound notes and cancel queued events",
  { timeout: 10000 },
  async () => {
    const S = workletHost(),
      sf = new S.WorkletSynthesizer({ sampleRate: 44100, currentTime: 0 });
    await sf.isReady;
    await sf.soundBankManager.addSoundBank(bankBytes(), "aurora");
    sf.setSystemParameter("effectsEnabled", false);
    sf.midiChannels[0].setDrums(false);
    const target = {};
    sf.connectChannel(target, 0);
    assert.equal(sf.worklet.connections[0].index, 1);
    sf.noteOn(0, 60, 110);
    await tick();
    assert(rms(sf.worklet.render(0.2)) > 0.001);
    sf.noteOff(0, 60);
    await tick();
    assert(rms(sf.worklet.render(1).slice(-4410)) < 0.0001);
    sf.sendMessage([144, 60, 127], 0, { time: 2 });
    sf.stopAll(true);
    await tick();
    assert.equal(rms(sf.worklet.render(1.5)), 0);
    sf.destroy();
    await tick();
  },
);

test(
  "bundled export worker produces stereo PCM with scheduled sustain and note releases",
  { timeout: 10000 },
  async () => {
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};parentPort.on('message',data=>self.onmessage({data}));require(${JSON.stringify(require("node:path").resolve("dist/vendor/render-worker.js"))});`,
      { eval: true },
    );
    try {
      const result = await new Promise((resolve, reject) => {
        worker.on("error", reject);
        worker.on("message", (data) =>
          data.error ? reject(Error(data.error)) : data.left && resolve(data),
        );
        worker.postMessage({
          banks: [{ id: "first", bytes: bankBytes() }],
          sampleRate: 44100,
          frames: 88200,
          events: [
            { time: 0, message: [144, 60, 110] },
            { time: 0.1, message: [176, 64, 127] },
            { time: 0.2, message: [128, 60, 0] },
            { time: 0.5, message: [176, 64, 0] },
          ],
          tracks: [
            {
              soundBankId: "first",
              drum: false,
              enabled: true,
              volume: 0.8,
              echo: 0.2,
              delay: 0.25,
            },
          ],
        });
      });
      assert.equal(result.left.length, 88200);
      assert.equal(result.right.length, 88200);
      assert(result.left.every(Number.isFinite));
      assert(rms(result.left.slice(13230, 17640)) > 0.001);
      assert(rms(result.left.slice(-4410)) < 0.0001);
    } finally {
      await worker.terminate();
    }
  },
);

test(
  "AudioEngine routes real Worklet/Core notes to two files sharing bank and program numbers",
  { timeout: 15000 },
  async () => {
    const S = workletHost(),
      scope = S.testScope;
    class Param {
      setValueAtTime(v) {
        this.value = v;
      }
      setTargetAtTime(v) {
        this.value = v;
      }
    }
    class AudioNode {
      constructor() {
        this.gain = new Param();
        this.delayTime = new Param();
      }
      connect() {}
      disconnect() {}
    }
    class Context {
      constructor() {
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.state = "running";
        this.destination = new AudioNode();
        this.audioWorklet = { addModule: async () => {} };
      }
      createGain() {
        return new AudioNode();
      }
      createDynamicsCompressor() {
        return new AudioNode();
      }
      createDelay() {
        return new AudioNode();
      }
    }
    Object.assign(scope, {
      AudioContext: Context,
      Core: require("../dist/js/core/model.js"),
      Blob,
      URL,
      SPESSA_WORKLET_SOURCE: "",
    });
    vm.runInContext(
      fs.readFileSync("dist/js/audio/audio-engine.js", "utf8"),
      scope,
    );
    const engine = new scope.AudioEngine(),
      [a, b] = await require("./sf-fixtures.cjs").twoBanks();
    await engine.loadBank(a, "a");
    await engine.loadBank(b, "b");
    assert.equal(engine.ctx, null);
    await Promise.all([
      engine.ensureBank("a"),
      engine.ensureBank("a"),
      engine.ensureBank("b"),
    ]);
    const first = {
        ...scope.Core.makeTrack("A", "soundfont", 0),
        soundBankId: "a",
      },
      second = {
        ...scope.Core.makeTrack("B", "soundfont", 1),
        soundBankId: "b",
      };
    const project = scope.Core.validate({
      bpm: 120,
      lengthBeats: 4,
      soundBanks: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      tracks: [first, second],
    });
    try {
      engine.configure(project);
      assert.equal(engine.graphs.get(first.id).sf, engine.banks.get("a").synth);
      assert.equal(
        engine.graphs.get(second.id).sf,
        engine.banks.get("b").synth,
      );
      for (const i of [0, 1]) {
        for (const e of scope.Core.initialEvents(project.tracks[i], i))
          engine.dispatch(e, project, 0);
        engine.dispatch(
          { type: "on", track: i, pitch: 60, value: 110 },
          project,
          0,
        );
      }
      await tick();
      const outA = engine.banks.get("a").synth.worklet.render(0.2, 0),
        outB = engine.banks.get("b").synth.worklet.render(0.2, 1);
      assert(rms(outA) > 0.001 && rms(outB) > 0.001);
      assert(
        rms(outA.map((v, i) => v - outB[i])) > 0.001,
        "Distinct samples must survive matching program numbers",
      );
      engine.control(second, "7", 0);
      await tick();
      assert(
        rms(engine.banks.get("a").synth.worklet.render(0.2, 0)) > 0.001,
        "CC on B must not affect A",
      );
      assert(
        rms(engine.banks.get("b").synth.worklet.render(0.2, 1).slice(-2000)) <
          0.0001,
      );
      engine.stop();
      await tick();
      assert.equal(rms(engine.banks.get("a").synth.worklet.render(0.2, 0)), 0);
      assert.equal(rms(engine.banks.get("b").synth.worklet.render(0.2, 1)), 0);
    } finally {
      engine.resetBanks();
      await tick();
    }
  },
);

async function renderBanks(banks, tracks, events) {
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads');global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};parentPort.on('message',data=>self.onmessage({data}));require(${JSON.stringify(require("node:path").resolve("dist/vendor/render-worker.js"))});`,
    { eval: true },
  );
  try {
    return await new Promise((resolve, reject) => {
      worker.on("error", reject);
      worker.on("message", (data) =>
        data.error ? reject(Error(data.error)) : data.left && resolve(data),
      );
      worker.postMessage({
        banks,
        tracks,
        events,
        sampleRate: 44100,
        frames: 44100,
      });
    });
  } finally {
    await worker.terminate();
  }
}
test(
  "export worker mixes both SoundFonts exactly once and excludes muted banks",
  { timeout: 15000 },
  async () => {
    const [a, b] = await require("./sf-fixtures.cjs").twoBanks();
    const banks = [
      { id: "a", bytes: a },
      { id: "b", bytes: b },
    ];
    const tracks = ["a", "b"].map((soundBankId) => ({
      soundBankId,
      enabled: true,
      drum: false,
      volume: 0.5,
      echo: 0.1,
      delay: 0.12,
    }));
    const events = [
      { time: 0, message: [144, 60, 110] },
      { time: 0, message: [145, 60, 110] },
      { time: 0.3, message: [128, 60, 0] },
      { time: 0.3, message: [129, 60, 0] },
    ];
    const combined = await renderBanks(banks, tracks, events);
    const onlyA = await renderBanks(
      [banks[0]],
      tracks.map((t, i) => ({ ...t, enabled: i === 0 })),
      events,
    );
    const onlyB = await renderBanks(
      [banks[1]],
      tracks.map((t, i) => ({ ...t, enabled: i === 1 })),
      events,
    );
    assert(rms(onlyA.left) > 0.001 && rms(onlyB.left) > 0.001);
    assert(rms(onlyA.left.map((v, i) => v - onlyB.left[i])) > 0.001);
    for (const side of ["left", "right"])
      assert(
        rms(combined[side].map((v, i) => v - onlyA[side][i] - onlyB[side][i])) <
          1e-7,
      );
  },
);
