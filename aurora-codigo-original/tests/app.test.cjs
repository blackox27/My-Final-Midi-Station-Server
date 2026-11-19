const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { JSDOM } = require("jsdom");
class Param {
  constructor() {
    this.value = 0;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.value = v;
    this.events.push(["set", v, t]);
  }
  linearRampToValueAtTime(v, t) {
    this.events.push(["linear", v, t]);
  }
  exponentialRampToValueAtTime(v, t) {
    this.events.push(["exponential", v, t]);
  }
  setTargetAtTime(v, t) {
    this.events.push(["target", v, t]);
  }
  cancelScheduledValues() {}
}
class Node {
  constructor() {
    this.gain = new Param();
    this.frequency = new Param();
    this.detune = new Param();
    this.pan = new Param();
    this.playbackRate = new Param();
    this.delayTime = new Param();
    this.connections = [];
  }
  connect(n) {
    this.connections.push(n);
    return n;
  }
  disconnect() {
    this.connections = [];
  }
  start(t) {
    this.started = t;
  }
  stop(t) {
    this.stopped = t;
  }
}
class Context {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.destination = new Node();
    this.sampleRate = 44100;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return new Node();
  }
  createDynamicsCompressor() {
    return new Node();
  }
  createDelay() {
    return new Node();
  }
  createStereoPanner() {
    return new Node();
  }
  createBiquadFilter() {
    return new Node();
  }
  createOscillator() {
    return new Node();
  }
  createBufferSource() {
    return new Node();
  }
  async decodeAudioData(bytes) {
    return {
      duration: 1,
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100),
    };
  }
}
async function setup({ brokenTool = false } = {}) {
  const html = fs.readFileSync("dist/index.html", "utf8");
  const dom = new JSDOM(html, {
      url: "http://localhost/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }),
    w = dom.window;
  Object.assign(w, {
    structuredClone,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    DataView,
    Float32Array,
    AudioContext: Context,
    OfflineAudioContext: Context,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  });
  const fake = new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
  w.HTMLCanvasElement.prototype.getContext = () => fake;
  w.HTMLElement.prototype.setPointerCapture = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  const registry = [];
  w.document.modelContext = {
    registerTool(t) {
      if (brokenTool) throw Error("Optional API unavailable");
      registry.push(t);
    },
  };
  const context = dom.getInternalVMContext(),
    run = (source) => vm.runInContext(source, context);
  try {
    for (const f of [...w.document.querySelectorAll("script[src]")]
      .map((script) => script.getAttribute("src"))
      .filter((src) => !src.startsWith("vendor/")))
      run(fs.readFileSync("dist/" + f, "utf8"));
    await run("startup");
  } catch (error) {
    dom.window.close();
    throw error;
  }
  return {
    dom,
    w,
    registry,
    run,
    cleanup() {
      run("stop(); clearTimeout(persistTimer); clearTimeout(toast.timer)");
      dom.window.close();
    },
  };
}
test("app initializes, all referenced controls exist, large songs use viewport-sized canvases", async () => {
  const env = await setup();
  try {
    assert.equal(env.run("project.tracks.length"), 3);
    assert.equal(env.run("track().notes.length"), 64);
    env.run("project.lengthBeats=4096;zoom=240;resize()");
    assert(env.w.document.getElementById("roll").width <= 2000);
    assert(env.w.document.getElementById("roll").height <= 800);
    for (const f of ["js/ui/app.js"]) {
      const src = fs.readFileSync("dist/" + f, "utf8");
      const ids = [...src.matchAll(/\$\("([\w]+)"\)/g)].map((m) => m[1]);
      assert(ids.includes("play"));
    }
  } finally {
    env.cleanup();
  }
});
test("duplicate extends project, undo/redo restores stable identities", async () => {
  const e = await setup();
  try {
    e.run(
      "selection=new Set([track().notes.at(-1).id]); const originalID=track().notes.at(-1).id; duplicate()",
    );
    assert.equal(e.run("track().notes.length"), 65);
    e.run("undo()");
    assert.equal(e.run("track().notes.length"), 64);
    assert.equal(e.run("track().notes.at(-1).id===originalID"), true);
    e.run("undo(true)");
    assert.equal(e.run("track().notes.length"), 65);
  } finally {
    e.cleanup();
  }
});
test("structured action validates the whole batch before editing state", async () => {
  const e = await setup();
  try {
    const t = e.registry[0],
      before = e.run("track().notes.length");
    assert.throws(() =>
      t.execute({
        notes: [
          { pitch: 60, start: 1, duration: 1, velocity: 90 },
          { pitch: 200, start: 1, duration: 1, velocity: 90 },
        ],
      }),
    );
    assert.equal(e.run("track().notes.length"), before);
    t.execute({
      notes: [{ pitch: 60, start: 1, duration: 0.5, velocity: 90 }],
    });
    assert.equal(e.run("track().notes.length"), before + 1);
  } finally {
    e.cleanup();
  }
});
test("double Play while audio initialization is pending cancels cleanly", async () => {
  const e = await setup();
  try {
    await e.run("(async()=>{const p=play();play();await p})()");
    assert.equal(e.run("playing"), false);
    assert.equal(e.run("playPending"), false);
    assert.equal(e.run("audio.voices.size"), 0);
  } finally {
    e.cleanup();
  }
});
test("recording separates same pitch on two devices and clamps stop at song end", async () => {
  const e = await setup();
  try {
    await e.run("play()");
    e.run("armed=true; audio.ctx.currentTime=.2");
    await e.run('Promise.all([noteOn(65,100,"dev1"),noteOn(65,80,"dev2")])');
    const before = e.run("track().notes.length");
    e.run('audio.ctx.currentTime=.6;noteOff("dev1");noteOff("dev2")');
    assert.equal(e.run("track().notes.length"), before + 2);
    assert.equal(e.run("recorded.size"), 0);
    assert(
      e.run(
        "track().notes.slice(-2).every(n=>n.duration>0 && n.start+n.duration<=length())",
      ),
    );
  } finally {
    e.cleanup();
  }
});
test("built-in sustain releases held notes only at pedal-off and frees graph on stop", async () => {
  const e = await setup();
  try {
    await e.run("audio.init()");
    e.run(
      'audio.configure(project); const t=track();const id="sustain-test";audio.dispatch({type:"on",track:0,note:id,pitch:60,value:100},project,0);audio.dispatch({type:"cc",track:0,controller:64,value:127},project,.1);audio.dispatch({type:"off",track:0,note:id,pitch:60,value:0},project,.2)',
    );
    assert.equal(e.run('audio.voices.get("sustain-test").sustained'), true);
    assert.equal(e.run('audio.voices.get("sustain-test").released'), false);
    e.run(
      'audio.dispatch({type:"cc",track:0,controller:64,value:0},project,.3)',
    );
    assert.equal(e.run('audio.voices.get("sustain-test").released'), true);
    e.run("audio.stop()");
    assert.equal(e.run("audio.voices.size"), 0);
  } finally {
    e.cleanup();
  }
});
test("portable project embeds assets and imports exact audio bytes", async () => {
  const e = await setup();
  try {
    await e.run(
      '(async()=>{const bytes=new Uint8Array([0,1,2,255]).buffer;await storage.putAsset({id:"asset",name:"test.wav",type:"audio/wav",bytes});track().sampleId="asset";track().sampleName="test.wav";track().instrument="sample";const json=await storage.portable(project);const other=new ProjectStorage();const restored=await other.importPortable(JSON.parse(json));globalThis.assetResult={id:restored.tracks[0].sampleId,data:Array.from(new Uint8Array((await other.getAsset(restored.tracks[0].sampleId)).bytes))};})()',
    );
    assert.notEqual(e.w.assetResult.id, "asset");
    assert.deepEqual(Array.from(e.w.assetResult.data), [0, 1, 2, 255]);
  } finally {
    e.cleanup();
  }
});
test("score view, pagination and editing controls open without missing elements", async () => {
  const e = await setup();
  try {
    e.run("switchView(true)");
    assert.equal(e.w.document.getElementById("scorePanel").hidden, false);
    assert.match(
      e.w.document.getElementById("scoreMeta").textContent,
      /página 1\/2/,
    );
    e.run("scorePage=1;renderScore()");
    assert(e.run("scoreHits.some(hit=>hit.bar?.beat===16)"));
    e.run("selection=new Set([track().notes[0].id])");
    for (const id of [
      "help",
      "export",
      "quantizeOptions",
      "tempoMap",
      "transpose",
    ]) {
      e.run(`$("${id}").onclick()`);
      assert.equal(e.w.document.getElementById("dialog").open, true);
      e.run("closeDialog()");
    }
    e.run("switchView(false)");
    assert.equal(e.w.document.getElementById("rollScroll").hidden, false);
  } finally {
    e.cleanup();
  }
});
test("sample cache follows asset identity when undo restores another sample", async () => {
  const e = await setup();
  try {
    await e.run(
      '(async()=>{await storage.putAsset({id:"old",name:"old.wav",bytes:new Uint8Array([1]).buffer});await storage.putAsset({id:"new",name:"new.wav",bytes:new Uint8Array([2]).buffer});track().instrument="sample";track().sampleId="old";await prepareAudio();history.push(project);track().sampleId="new";await prepareAudio()})()',
    );
    assert.equal(e.run("audio.bufferIds.get(track().id)"), "new");
    e.run("undo()");
    await e.run("prepareAudio()");
    assert.equal(e.run("audio.bufferIds.get(track().id)"), "old");
  } finally {
    e.cleanup();
  }
});
test("Stop disconnects echo buffers and preview uses current track gain and pan", async () => {
  const e = await setup();
  try {
    await e.run("prepareAudio()");
    await e.run("audio.preview(track(),60)");
    e.run("const previousGraph=audio.graphs.get(track().id);audio.stop()");
    assert.equal(e.run("audio.graphs.size"), 0);
    assert(e.run("previousGraph.nodes.every(n=>!n.connections.length)"));
    e.run("track().volume=.35;track().pan=-1");
    await e.run("audio.preview(track(),62)");
    assert.equal(e.run("audio.graphs.get(track().id).volume.gain.value"), 0.35);
    assert.equal(e.run("audio.state(track().id).pan"), -1);
  } finally {
    e.cleanup();
  }
});

test("two SoundFont files stay independent across tracks, preset selection, failed loads and undo", async () => {
  const e = await setup();
  try {
    e.w.Spessa = require("./spessa-core.cjs");
    e.w.sfFixtures = await require("./sf-fixtures.cjs").twoBanks();
    await e.run('loadBankFile(sfFixtures[0], "Primeiro.sf2")');
    const first = e.run("track().soundBankId");
    e.run("active=project.tracks[1].id; syncTrack()");
    await e.run('loadBankFile(sfFixtures[1], "Segundo.sf2")');
    const second = e.run("track().soundBankId");
    assert.notEqual(first, second);
    assert.equal(e.run("project.tracks[0].soundBankId"), first);
    assert.equal(e.run("project.soundBanks.length"), 2);
    assert.equal(e.run("audio.banks.size"), 2);
    assert.equal(e.w.document.getElementById("bankSelect").options.length, 3);
    assert.equal(e.w.document.getElementById("bankInput").multiple, true);
    assert.equal(
      e.run("audio.ctx"),
      null,
      "Catalog loading must not require audio permission",
    );
    await assert.rejects(
      e.run('loadBankFile(new ArrayBuffer(3), "Inválido.sf2")'),
    );
    assert.equal(e.run("project.soundBanks.length"), 2);
    e.w.bankChoice = first;
    await e.run('$("bankSelect").onchange({target:{value:bankChoice}})');
    assert.equal(e.run("track().soundBankId"), first);
    e.run("undo()");
    assert.equal(e.run("track().soundBankId"), second);
    assert.equal(e.run("project.tracks[0].soundBankId"), first);
    e.run('$("removeBank").onclick()');
    assert.equal(
      e.run("project.soundBanks.length"),
      2,
      "Do not remove an in-use bank",
    );
  } finally {
    e.cleanup();
  }
});

test("portable project embeds both banks once and restores exact bytes and per-track choices", async () => {
  const e = await setup();
  try {
    e.w.Spessa = require("./spessa-core.cjs");
    e.w.sfFixtures = await require("./sf-fixtures.cjs").twoBanks();
    await e.run('loadBankFile(sfFixtures[0], "A.sf2")');
    e.run("active=project.tracks[1].id");
    await e.run('loadBankFile(sfFixtures[1], "B.sf2")');
    await e.run(`(async()=>{
    const data=JSON.parse(await storage.portable(project));
    const restoredStorage=new ProjectStorage();
    const restored=await restoredStorage.importPortable(data);
    globalThis.portableCheck={data, restored, bytes:await Promise.all(restored.soundBanks.map(async b=>Array.from(new Uint8Array((await restoredStorage.getAsset(b.id)).bytes))))};
    const missing=structuredClone(data);missing.assets.pop();
    try {await new ProjectStorage().importPortable(missing);globalThis.missingRejected=false}catch{globalThis.missingRejected=true}
  })()`);
    assert.equal(e.w.portableCheck.data.assets.length, 2);
    assert.deepEqual(
      Array.from(e.w.portableCheck.restored.tracks, (t) => t.soundBankId),
      [
        e.w.portableCheck.restored.soundBanks[0].id,
        e.w.portableCheck.restored.soundBanks[1].id,
        null,
      ],
    );
    for (let i = 0; i < 2; i++)
      assert.deepEqual(
        Array.from(e.w.portableCheck.bytes[i]),
        Array.from(new Uint8Array(e.w.sfFixtures[i])),
      );
    assert(e.w.missingRejected);
  } finally {
    e.cleanup();
  }
});

test("missing muted and non-solo assets do not block playback; preview prepares only its track", async () => {
  const e = await setup();
  try {
    e.run(
      'project.tracks[1].instrument="soundfont";project.tracks[1].soundBankId=null;project.tracks[1].mute=true',
    );
    await e.run("prepareAudio()");
    await e.run("play()");
    assert(e.run("playing"));
    e.run("stop();project.tracks[1].mute=false;project.tracks[0].solo=true");
    await e.run("prepareAudio()");
    e.run("project.tracks[0].solo=false");
    await e.run("previewNote(track(),60)");
    await assert.rejects(e.run("prepareAudio()"), /Escolha um banco/);
  } finally {
    e.cleanup();
  }
});
test("external MIDI playback does not require internal samples or SoundFonts", async () => {
  const e = await setup();
  try {
    e.run('track().instrument="soundfont";output={send(){},clear(){}}');
    await e.run("play()");
    assert(e.run("playing"));
    assert.equal(e.run("audio.voices.size"), 0);
    e.run('stop();track().instrument="sample";track().sampleId="missing"');
    await e.run("play()");
    assert(e.run("playing"));
    assert.equal(e.run("audio.voices.size"), 0);
    e.run(
      'output.send=()=>{throw Error("Disconnected")};audio.ctx.currentTime=1;schedule()',
    );
    assert.equal(e.run("playing"), false);
  } finally {
    e.cleanup();
  }
});
test("portable import with colliding ids never overwrites audio needed by undo", async () => {
  const e = await setup();
  try {
    await e.run(
      `(async()=>{await storage.putAsset({id:'shared',bytes:new Uint8Array([1]).buffer});track().sampleId='shared';track().instrument='sample';const incoming=JSON.parse(await storage.portable(project));incoming.assets[0].base64=btoa(String.fromCharCode(2));globalThis.imported=await storage.importPortable(incoming);globalThis.oldBytes=Array.from(new Uint8Array((await storage.getAsset('shared')).bytes));globalThis.newBytes=Array.from(new Uint8Array((await storage.getAsset(imported.tracks[0].sampleId)).bytes));})()`,
    );
    assert.notEqual(e.w.imported.tracks[0].sampleId, "shared");
    assert.deepEqual(Array.from(e.w.oldBytes), [1]);
    assert.deepEqual(Array.from(e.w.newBytes), [2]);
  } finally {
    e.cleanup();
  }
});
test("newer checkpoint wins over old IndexedDB and queued saves; legacy projects still load", async () => {
  const e = await setup();
  try {
    await e.run(
      `(async()=>{const stale=storage.capture(project);project.title='Newest';storage.checkpoint(project);storage.db=async()=>({transaction:()=>({objectStore:()=>({get:()=>{const r={result:stale};queueMicrotask(()=>r.onsuccess());return r;}})})});globalThis.recovered=await storage.load();storage.writeCheckpoint(stale);globalThis.recoveredAgain=await storage.load();})()`,
    );
    assert.equal(e.w.recovered.title, "Newest");
    assert.equal(e.w.recoveredAgain.title, "Newest");
    e.run(
      'project.title="Last edit before close";window.dispatchEvent(new Event("pagehide"))',
    );
    assert.equal(
      JSON.parse(e.w.localStorage.getItem("aurora-midi-v2")).project.title,
      "Last edit before close",
    );
  } finally {
    e.cleanup();
  }
});
test("optional WebMCP registration failure does not stop startup", async () => {
  const e = await setup({ brokenTool: true });
  try {
    assert.equal(e.run("restoring"), false);
    assert.equal(e.run("project.tracks.length"), 3);
  } finally {
    e.cleanup();
  }
});

test("language switching translates controls and dialogs without changing user data", async () => {
  const e = await setup();
  try {
    e.run(
      'project.title="Nome"; track().name="Excluir pista"; loadUI(); I18n.setLanguage("en")',
    );
    assert.equal(e.w.document.documentElement.lang, "en");
    assert.equal(
      e.w.document.getElementById("save").textContent.trim(),
      "Save project",
    );
    assert.equal(e.run("project.title"), "Nome");
    assert.equal(e.run("track().name"), "Excluir pista");
    assert.equal(
      e.w.document.getElementById("trackTitle").textContent,
      "Excluir pista",
    );
    e.run('$("transpose").click(); $("transAmount").value="7"');
    assert.equal(
      e.w.document.querySelector("#dialogContent h2").textContent,
      "Transpose",
    );
    e.run('I18n.setLanguage("pt-BR")');
    assert.equal(
      e.w.document.querySelector("#dialogContent h2").textContent,
      "Transpor",
    );
    assert.equal(e.w.document.getElementById("transAmount").value, "7");
    assert.equal(e.w.localStorage.getItem("aurora-language"), "pt-BR");
  } finally {
    e.cleanup();
  }
});
test("translated text treats user values as text and translates error messages", async () => {
  const e = await setup();
  try {
    e.run('I18n.setLanguage("en"); toast("Arquivo MIDI truncado.")');
    assert.equal(
      e.w.document.getElementById("toast").textContent,
      "Truncated MIDI file.",
    );
    e.run(
      'toast(T("Humanização aplicada a {count} nota(s).",{count:"<img src=x onerror=alert(1)>"}))',
    );
    assert.equal(e.w.document.querySelectorAll("#toast img").length, 0);
    assert(e.w.document.getElementById("toast").textContent.includes("<img"));
  } finally {
    e.cleanup();
  }
});
test("measure cache reuses the map and invalidates when song length or signatures change", async () => {
  const e = await setup();
  try {
    assert(e.run("measures()===measures()"));
    e.run("const cached=measures(); project.lengthBeats=4");
    assert(e.run("measures()!==cached"));
    e.run(
      "const beforeSignatures=measures(); project.signatures=[{beat:0,numerator:3,denominator:4}]",
    );
    assert(e.run("measures()!==beforeSignatures"));
    assert.equal(e.run("measures()[0].end"), 3);
  } finally {
    e.cleanup();
  }
});
test("slow import cannot overwrite edits made while its file is being read", async () => {
  const e = await setup();
  try {
    e.run(
      'let finishRead; const slowFile={name:"slow.aurora",size:100,text:()=>new Promise(r=>finishRead=r)}; const inputJSON=JSON.stringify(project); const incoming=importFile(slowFile).catch(err=>err.message); snapshot(); project.title="Keep edits"; finishRead(inputJSON)',
    );
    const result = await e.run("incoming");
    assert.match(result, /editado durante/);
    assert.equal(e.run("project.title"), "Keep edits");
  } finally {
    e.cleanup();
  }
});
test("editing tools duplicate tracks with undo, and panic releases held notes", async () => {
  const e = await setup();
  try {
    e.run('$("editorTools").click(); $("cloneTrack").click()');
    assert.equal(e.run("project.tracks.length"), 4);
    assert.equal(e.run("track().notes.length"), 64);
    e.run("undo()");
    assert.equal(e.run("project.tracks.length"), 3);
    await e.run('noteOn(60,90,"panic-test")');
    assert.equal(e.run("recorded.size"), 1);
    e.run("panic()");
    assert.equal(e.run("recorded.size"), 0);
    assert.equal(e.run("audio.voices.size"), 0);
  } finally {
    e.cleanup();
  }
});
test("drawing notes rounds fractional velocity to a valid MIDI integer", async () => {
  const e = await setup();
  try {
    e.run(
      '$("new").click(); $("confirmNew").click(); $("velocity").value="90.5"; $("roll").onpointerdown({button:0,clientX:164,clientY:200,pointerId:1,preventDefault(){}}); drag=null; Core.validate(project)',
    );
    assert.equal(e.run("track().notes[0].velocity"), 91);
    await e.run("new Promise(r=>setTimeout(r,0))");
  } finally {
    e.cleanup();
  }
});

test("seeking the stopped ruler immediately updates the transport display", async () => {
  const e = await setup();
  try {
    e.run(
      '$("roll").onpointerdown({button:0,clientX:KEY+5*zoom,clientY:10,pointerId:1,preventDefault(){}})',
    );
    assert.equal(e.run("position"), 5);
    assert.equal(
      e.w.document.getElementById("time").textContent,
      "002 : 02 : 00",
    );
  } finally {
    e.cleanup();
  }
});
