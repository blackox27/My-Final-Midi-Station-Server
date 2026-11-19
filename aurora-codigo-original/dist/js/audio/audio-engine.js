/* Shared live/offline event semantics for built-in voices and SpessaSynth. */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.graphs = new Map();
    this.buffers = new Map();
    this.bufferIds = new Map();
    this.voices = new Map();
    this.controllers = new Map();
    this.banks = new Map();
    this.workletPromise = null;
    this.bankEpoch = 0;
    this.epoch = 0;
    this.initPromise = null;
    this.nextVoice = 0;
  }
  async init() {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.compressor = this.ctx.createDynamicsCompressor();
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    return this.ctx;
  }
  async loadBank(bytes, id) {
    if (!id) throw Error("Banco sem identificação.");
    if (this.banks.has(id)) return this.banks.get(id);
    const epoch = this.bankEpoch;
    const bank = Spessa.SoundBankLoader.fromArrayBuffer(bytes.slice(0));
    await Spessa.BasicSoundBank.isSF3DecoderReady;
    const presets = bank.presets.map((p) => ({
      name: p.name,
      program: p.program,
      bankMSB: p.bankMSB,
      bankLSB: p.bankLSB,
      drum: p.isDrum,
    }));
    if (!presets.length) throw Error("O banco não contém instrumentos.");
    if (epoch !== this.bankEpoch)
      throw Error("Carregamento do banco cancelado.");
    const entry = {
      id,
      bytes: bytes.slice(0),
      presets,
      synth: null,
      pending: null,
    };
    if (!this.banks.has(id)) this.banks.set(id, entry);
    return this.banks.get(id);
  }
  async ensureBank(id) {
    const entry = this.banks.get(id);
    if (!entry) throw Error("Recarregue o banco de sons desta pista.");
    if (entry.synth) return entry.synth;
    if (entry.pending) return entry.pending;
    entry.pending = (async () => {
      await this.init();
      if (!this.ctx.audioWorklet)
        throw Error(
          "Este navegador não disponibilizou AudioWorklet. Abra o HTML em Chrome/Edge atualizado ou use a versão online.",
        );
      if (!this.workletPromise) {
        this.workletPromise = (async () => {
          // file:// has an opaque origin: Chromium rejects blob: worklet modules.
          // A self-contained data: module loads without a server or security flags.
          const localFile =
            typeof location !== "undefined" && location.protocol === "file:";
          const url = localFile
            ? "data:text/javascript;charset=utf-8," +
              encodeURIComponent(SPESSA_WORKLET_SOURCE)
            : URL.createObjectURL(
                new Blob([SPESSA_WORKLET_SOURCE], { type: "text/javascript" }),
              );
          try {
            await this.ctx.audioWorklet.addModule(url);
          } finally {
            if (!localFile) URL.revokeObjectURL(url);
          }
        })().catch((error) => {
          this.workletPromise = null;
          throw error;
        });
      }
      await this.workletPromise;
      const next = new Spessa.WorkletSynthesizer(this.ctx);
      let timeout;
      try {
        await Promise.race([
          (async () => {
            await next.isReady;
            await next.soundBankManager.addSoundBank(entry.bytes.slice(0), id);
          })(),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(Error("O banco demorou demais para carregar.")),
              30000,
            );
          }),
        ]);
        if (this.banks.get(id) !== entry)
          throw Error("Carregamento do banco cancelado.");
        next.setSystemParameter("effectsEnabled", false);
        entry.synth = next;
        return next;
      } catch (error) {
        next.destroy();
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();
    try {
      return await entry.pending;
    } finally {
      entry.pending = null;
    }
  }
  synthFor(t) {
    return t.instrument === "soundfont"
      ? this.banks.get(t.soundBankId)?.synth
      : null;
  }
  retainBanks(ids) {
    const keep = new Set(ids);
    for (const [id, bank] of this.banks) {
      if (!keep.has(id)) {
        bank.synth?.destroy();
        this.banks.delete(id);
      }
    }
  }
  resetBanks() {
    this.bankEpoch++;
    this.stop();
    this.retainBanks([]);
  }
  retainSamples(tracks) {
    const active = new Map(tracks.map((t) => [t.id, t.sampleId]));
    for (const id of new Set([
      ...this.buffers.keys(),
      ...this.bufferIds.keys(),
    ])) {
      if (!active.has(id) || this.bufferIds.get(id) !== active.get(id)) {
        this.buffers.delete(id);
        this.bufferIds.delete(id);
      }
    }
  }
  connectTrack(g, t) {
    const sf = this.synthFor(t);
    g.sf = sf;
    if (sf) {
      sf.connectChannel(g.input, g.index);
      sf.midiChannels[g.index].setDrums(t.drum);
    }
  }
  setMaster(value) {
    if (this.master)
      this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }
  graph(ctx, t, index, dest, bpm) {
    const input = ctx.createGain(),
      volume = ctx.createGain();
    volume.gain.value = t.volume;
    input.connect(volume);
    volume.connect(dest);
    const delay = ctx.createDelay(10),
      wet = ctx.createGain();
    delay.delayTime.value = 45 / bpm;
    wet.gain.value = t.echo;
    input.connect(delay);
    delay.connect(wet);
    wet.connect(volume);
    return {
      input,
      volume,
      delay,
      wet,
      index,
      drum: t.drum,
      trackPan: t.pan,
      nodes: [input, volume, delay, wet],
    };
  }
  configure(p) {
    if (!this.ctx) return;
    this.stop();
    p.tracks.forEach((t, i) => {
      const g = this.graph(this.ctx, t, i, this.master, p.bpm);
      this.graphs.set(t.id, g);
      this.connectTrack(g, t);
    });
    this.setMaster(p.master);
    this.project = p;
  }
  state(id) {
    if (!this.controllers.has(id))
      this.controllers.set(id, {
        volume: 1,
        expression: 1,
        pan: 0,
        pitch: 0,
        mod: 0,
        sustain: false,
        lastPitch: null,
      });
    return this.controllers.get(id);
  }
  stop() {
    this.epoch++;
    for (const bank of this.banks.values()) bank.synth?.stopAll(true);
    // Disconnect the delay buffers too: Stop must leave no queued echoes.
    for (const g of this.graphs.values()) {
      if (g.sf) {
        try {
          g.sf.disconnectChannel(g.input, g.index);
        } catch {}
      }
      for (const node of g.nodes) node.disconnect();
    }
    this.graphs.clear();
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
      } catch {}
      try {
        v.lfo.stop();
      } catch {}
      for (const n of v.nodes)
        try {
          n.disconnect();
        } catch {}
    }
    this.voices.clear();
    this.controllers.clear();
  }
  controller(t, type, value, when = this.ctx?.currentTime || 0, live = true) {
    type = String(type);
    const state = this.state(t.id);
    const key = {
      7: "volume",
      11: "expression",
      10: "pan",
      pitch: "pitch",
      1: "mod",
    }[type];
    if (key)
      state[key] =
        type === "pitch"
          ? ((value - 8192) / 8192) * 200
          : type === "10"
            ? (value - 64) / 64
            : type === "1"
              ? (value / 127) * 40
              : value / 127;
    if (type === "64") {
      state.sustain = value >= 64;
      if (!state.sustain)
        for (const v of [...this.voices.values()])
          if (v.track === t.id && v.sustained) this.release(v, when);
    }
    if (type === "120" || type === "123") {
      for (const v of [...this.voices.values()])
        if (v.track === t.id) this.release(v, when);
    }
    for (const v of this.voices.values())
      if (v.track === t.id) {
        const time = Math.max(when, v.start);
        if (key === "volume" || key === "expression")
          v.vol.gain.setValueAtTime(state.volume * state.expression, time);
        if (key === "pitch") v.osc.detune.setValueAtTime(state.pitch, time);
        if (key === "pan") v.pan.pan.setValueAtTime(state.pan, time);
        if (key === "mod") v.depth.gain.setValueAtTime(state.mod, time);
      }
  }
  startVoice(ctx, t, n, when, input) {
    const state = this.state(t.id),
      start = Math.max(ctx.currentTime, when),
      gain = ctx.createGain(),
      vol = ctx.createGain(),
      pan = ctx.createStereoPanner(),
      filter = ctx.createBiquadFilter(),
      depth = ctx.createGain(),
      lfo = ctx.createOscillator();
    const sample = t.instrument === "sample";
    if (sample && !this.buffers.has(t.id))
      throw Error("Sample ausente na pista " + t.name);
    const osc = sample ? ctx.createBufferSource() : ctx.createOscillator();
    if (sample) {
      osc.buffer = this.buffers.get(t.id);
      osc.playbackRate.setValueAtTime(2 ** ((n.pitch - t.root) / 12), start);
    } else {
      osc.type = t.instrument === "piano" ? "sine" : t.instrument;
      const frequency = 440 * 2 ** ((n.pitch - 69) / 12);
      osc.frequency.setValueAtTime(
        t.glide && state.lastPitch !== null
          ? 440 * 2 ** ((state.lastPitch - 69) / 12)
          : frequency,
        start,
      );
      if (t.glide)
        osc.frequency.exponentialRampToValueAtTime(
          frequency,
          start + t.glide / 1000,
        );
    }
    state.lastPitch = n.pitch;
    osc.detune.setValueAtTime(state.pitch, start);
    lfo.frequency.value = 5;
    depth.gain.setValueAtTime(state.mod, start);
    lfo.connect(depth);
    depth.connect(osc.detune);
    filter.type = "lowpass";
    filter.frequency.value = t.instrument === "sawtooth" ? 5000 : 18000;
    pan.pan.setValueAtTime(state.pan, start);
    vol.gain.setValueAtTime(state.volume * state.expression, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime((n.velocity / 127) * 0.24, start + 0.008);
    if (t.instrument === "piano")
      gain.gain.setTargetAtTime((n.velocity / 127) * 0.07, start + 0.025, 0.3);
    osc.connect(gain);
    gain.connect(filter);
    filter.connect(vol);
    vol.connect(pan);
    pan.connect(input);
    const id = n.id || "preview-" + ++this.nextVoice,
      v = {
        id,
        track: t.id,
        osc,
        lfo,
        gain,
        vol,
        pan,
        depth,
        start,
        pitch: n.pitch,
        nodes: [osc, lfo, gain, filter, vol, pan, depth],
        released: false,
      };
    this.voices.set(id, v);
    osc.onended = () => {
      if (this.voices.get(id) === v) this.voices.delete(id);
      try {
        lfo.stop();
      } catch {}
      for (const node of v.nodes) node.disconnect();
    };
    osc.start(start);
    lfo.start(start);
    return v;
  }
  release(v, when) {
    if (!v || v.released) return;
    v.released = true;
    const at = Math.max(v.start + 0.009, when);
    v.gain.gain.setTargetAtTime(0.00001, at, 0.04);
    try {
      v.osc.stop(at + 0.3);
      v.lfo.stop(at + 0.3);
    } catch {}
  }
  dispatch(
    event,
    p,
    when,
    ctx = this.ctx,
    graphs = this.graphs,
    allowSF = true,
  ) {
    const t = p.tracks[event.track];
    if (!t) return;
    if (t.instrument === "soundfont") {
      const sf = this.synthFor(t);
      if (allowSF && sf)
        sf.sendMessage(Core.message(event, event.track), 0, {
          time: when,
        });
      return;
    }
    const graph = graphs.get(t.id);
    if (!graph) return;
    switch (event.type) {
      case "on":
        this.startVoice(
          ctx,
          t,
          { id: event.note, pitch: event.pitch, velocity: event.value },
          when,
          graph.input,
        );
        break;
      case "off": {
        const v = this.voices.get(event.note);
        if (v) {
          if (this.state(t.id).sustain) v.sustained = true;
          else this.release(v, when);
        }
        break;
      }
      case "cc":
        this.controller(t, String(event.controller), event.value, when);
        break;
      case "pitch":
        this.controller(t, "pitch", event.value, when);
        break;
    }
  }
  control(t, type, value) {
    if (!this.ctx) return;
    this.controller(t, type, value);
    const sf = this.synthFor(t);
    if (sf) {
      const i = this.project?.tracks.findIndex((x) => x.id === t.id) ?? 0;
      sf.sendMessage(
        type === "pitch"
          ? [224 | i, value & 127, value >> 7]
          : [176 | i, +type, value],
      );
    }
  }
  async preview(t, pitch, velocity = 90, held = false) {
    await this.init();
    const sf = this.synthFor(t);
    if (t.instrument === "soundfont" && !sf)
      throw Error("Carregue o banco de sons desta pista.");
    const previous = this.graphs.get(t.id);
    if (previous && previous.sf !== sf) {
      previous.sf?.disconnectChannel(previous.input, previous.index);
      for (const node of previous.nodes) node.disconnect();
      this.graphs.delete(t.id);
      this.controllers.delete(t.id);
    }
    if (!this.graphs.has(t.id)) {
      const i = this.project?.tracks.findIndex((x) => x.id === t.id) ?? 0;
      const g = this.graph(this.ctx, t, Math.max(0, i), this.master, 120);
      this.graphs.set(t.id, g);
      this.connectTrack(g, t);
    }
    const g = this.graphs.get(t.id);
    g.volume.gain.setValueAtTime(t.volume, this.ctx.currentTime);
    g.wet.gain.setValueAtTime(t.echo, this.ctx.currentTime);
    g.delay.delayTime.setValueAtTime(
      45 / (this.project?.bpm || 120),
      this.ctx.currentTime,
    );
    if (!this.controllers.has(t.id)) {
      for (const e of Core.initialEvents(t, g.index)) {
        if (e.type === "cc") this.controller(t, e.controller, e.value);
        if (e.type === "pitch") this.controller(t, "pitch", e.value);
        if (t.instrument === "soundfont" && sf)
          sf.sendMessage(Core.message(e, g.index));
      }
    }
    if (g.trackPan !== t.pan) {
      this.controller(t, "10", Math.round(64 + t.pan * (t.pan > 0 ? 63 : 64)));
      if (t.instrument === "soundfont" && sf)
        sf.controllerChange(
          g.index,
          10,
          Math.round(64 + t.pan * (t.pan > 0 ? 63 : 64)),
        );
      g.trackPan = t.pan;
    }
    if (t.instrument === "soundfont") {
      if (!sf) throw Error("Carregue um banco SF2/SF3/DLS.");
      sf.midiChannels[g.index].setDrums(t.drum);
      for (const e of Core.initialEvents(t, g.index))
        if (
          e.type === "program" ||
          (e.type === "cc" && [0, 32].includes(e.controller))
        )
          sf.sendMessage(Core.message(e, g.index));
      sf.noteOn(g.index, pitch, velocity);
      let stopped = false;
      const voice = {
        stop: () => {
          if (!stopped) {
            stopped = true;
            sf?.noteOff(g.index, pitch);
          }
        },
      };
      if (!held) setTimeout(voice.stop, 240);
      return voice;
    }
    const v = this.startVoice(
      this.ctx,
      t,
      { pitch, velocity },
      this.ctx.currentTime,
      g.input,
    );
    if (!held) this.release(v, this.ctx.currentTime + 0.24);
    return {
      stop: () => {
        if (this.state(t.id).sustain) v.sustained = true;
        else this.release(v, this.ctx.currentTime);
      },
    };
  }
  async render(p, { signal, onProgress = () => {} } = {}) {
    p = Core.validate(p);
    const time = Core.clock(p),
      duration = time.toSeconds(Core.length(p)) + 4;
    if (duration > 600) throw Error("Exporte até 10 minutos por vez.");
    const frames = Math.ceil(duration * 44100),
      ctx = new OfflineAudioContext(2, frames, 44100),
      dest = ctx.createGain(),
      compressor = ctx.createDynamicsCompressor();
    dest.gain.value = p.master;
    dest.connect(compressor);
    compressor.connect(ctx.destination);
    const engine = new AudioEngine();
    engine.buffers = this.buffers;
    const graphs = new Map();
    p.tracks.forEach((t, i) =>
      graphs.set(t.id, engine.graph(ctx, t, i, dest, p.bpm)),
    );
    const events = Core.events(p);
    let worker;
    const abort = () => {
      worker?.terminate();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) throw Error("Exportação cancelada.");
      if (events.some((e) => p.tracks[e.track].instrument === "soundfont")) {
        onProgress("Renderizando SoundFont…");
        const url = URL.createObjectURL(
          new Blob([SPESSA_RENDER_SOURCE], { type: "text/javascript" }),
        );
        try {
          worker = new Worker(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        const result = await new Promise((resolve, reject) => {
          const onAbort = () => reject(Error("Exportação cancelada."));
          signal?.addEventListener("abort", onAbort, { once: true });
          worker.onerror = (e) => {
            signal?.removeEventListener("abort", onAbort);
            reject(Error(e.message || "Falha no render de SoundFont"));
          };
          worker.onmessage = ({ data }) => {
            if (data.error) {
              signal?.removeEventListener("abort", onAbort);
              reject(Error(data.error));
            } else if (data.left) {
              signal?.removeEventListener("abort", onAbort);
              resolve(data);
            } else
              onProgress(
                "Renderizando SoundFont… " +
                  Math.round(data.progress * 100) +
                  "%",
              );
          };
          const sfEvents = events
            .filter((e) => p.tracks[e.track].instrument === "soundfont")
            .map((e) => ({
              time: time.toSeconds(e.beat),
              message: Core.message(e, e.track),
            }));
          // Release a pedal left down at the end before rendering the effect tail.
          p.tracks.forEach((t, i) => {
            if (t.instrument === "soundfont") {
              sfEvents.push({
                time: time.toSeconds(Core.length(p)),
                message: [176 | i, 64, 0],
              });
              sfEvents.push({
                time: time.toSeconds(Core.length(p)),
                message: [176 | i, 123, 0],
              });
            }
          });
          const usedBanks = new Set(
            events
              .filter((e) => p.tracks[e.track].instrument === "soundfont")
              .map((e) => p.tracks[e.track].soundBankId),
          );
          const banks = [...usedBanks].map((id) => {
            const bank = this.banks.get(id);
            if (!bank)
              throw Error("Recarregue os bancos de sons antes de exportar.");
            return { id, bytes: bank.bytes.slice(0) };
          });
          const audible = new Set(events.map((e) => e.track));
          worker.postMessage(
            {
              banks,
              frames,
              sampleRate: 44100,
              events: sfEvents,
              tracks: p.tracks.map((t, i) => ({
                ...t,
                enabled: t.instrument === "soundfont" && audible.has(i),
                delay: 45 / p.bpm,
              })),
            },
            banks.map((bank) => bank.bytes),
          );
        });
        worker.terminate();
        const buffer = ctx.createBuffer(2, frames, 44100);
        buffer.copyToChannel(result.left, 0);
        buffer.copyToChannel(result.right, 1);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(dest);
        src.start(0);
      }
      onProgress("Renderizando sintetizadores e samples…");
      for (const e of events)
        engine.dispatch(e, p, time.toSeconds(e.beat), ctx, graphs, false);
      for (const t of p.tracks)
        engine.controller(t, "64", 0, time.toSeconds(Core.length(p)));
      for (const v of engine.voices.values())
        if (!v.released) engine.release(v, time.toSeconds(Core.length(p)));
      const rendered = await ctx.startRendering();
      if (signal?.aborted) throw Error("Exportação cancelada.");
      return rendered;
    } finally {
      worker?.terminate();
      signal?.removeEventListener("abort", abort);
    }
  }
}
function wavBytes(buffer) {
  const channels = buffer.numberOfChannels,
    len = buffer.length,
    a = new ArrayBuffer(44 + len * channels * 2),
    v = new DataView(a);
  const s = (o, x) => {
    for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i));
  };
  s(0, "RIFF");
  v.setUint32(4, a.byteLength - 8, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, a.byteLength - 44, true);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const x = Math.max(-1, Math.min(1, data[i]));
      v.setInt16(
        44 + (i * channels + c) * 2,
        x * (x < 0 ? 32768 : 32767),
        true,
      );
    }
  }
  return a;
}
globalThis.AudioEngine = AudioEngine;
globalThis.wavBytes = wavBytes;
