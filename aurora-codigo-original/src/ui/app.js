"use strict";
const T = I18n.t;
const $ = (id) => document.getElementById(id),
  colors = ["#b3e879", "#78c8cf", "#b69be9", "#e6ad74", "#e78caa", "#78a7ef"],
  { uid, clamp, makeTrack } = Core,
  names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"],
  noteName = (n) => names[n % 12] + (Math.floor(n / 12) - 1);
function demo() {
  let a = makeTrack(T("Piano elétrico")),
    b = makeTrack(T("Baixo suave"), "triangle"),
    c = makeTrack(T("Textura analógica"), "sine");
  let chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];
  for (let bar = 0; bar < 8; bar++) {
    let chord = chords[bar % 4];
    for (let j = 0; j < 8; j++)
      a.notes.push({
        id: uid(),
        pitch: chord[j % 3] + (j % 4 === 3 ? 12 : 0),
        start: bar * 4 + j * 0.5,
        duration: 0.4,
        velocity: 70 + (j % 3) * 14,
      });
    b.notes.push({
      id: uid(),
      pitch: chord[0] - 12,
      start: bar * 4,
      duration: 3.5,
      velocity: 95,
    });
    for (const pitch of chord)
      c.notes.push({
        id: uid(),
        pitch: pitch + 12,
        start: bar * 4,
        duration: 3.8,
        velocity: 40,
      });
  }
  c.volume = 0.4;
  [a, b, c].forEach((t, i) => (t.channel = i));
  return {
    version: 1,
    title: T("Órbita — estudo em dó"),
    bpm: 112,
    bars: 8,
    master: 0.7,
    tracks: [a, b, c],
  };
}
let project = Core.validate(demo()),
  active = project.tracks[0].id,
  selection = new Set(),
  tool = "draw",
  zoom = 66,
  row = 20,
  grid = 0.25,
  clipboard = [],
  scoreMode = false,
  drag = null,
  autoDrag = false,
  playing = false,
  armed = false,
  loop = true,
  position = 0,
  playToken = 0,
  playPending = false,
  transportTime = null,
  startTime = 0,
  startSeconds = 0,
  timeline = [],
  eventIndex = 0,
  timer = null,
  raf = null,
  output = null,
  midiAccess = null,
  restoring = true;
const KEY = 64,
  TOP = 32,
  MAX = 127,
  MIN = 0,
  history = new Core.History(),
  audio = new AudioEngine(),
  storage = new ProjectStorage(),
  recorded = new Map(),
  heldKeys = new Map(),
  quantOptions = { strength: 1, swing: 0, ends: false },
  track = () => project.tracks.find((t) => t.id === active),
  length = () => Core.length(project);
let persistTimer,
  revision = 0,
  saveQueue = Promise.resolve(),
  exportAbort = null;
let measureCache = null;
function measures() {
  if (
    !measureCache ||
    measureCache.project !== project ||
    measureCache.signatures !== project.signatures ||
    measureCache.length !== length()
  ) {
    measureCache = {
      project,
      signatures: project.signatures,
      length: length(),
      value: Core.measures(project),
    };
  }
  return measureCache.value;
}
function toast(message) {
  message = T(message);
  $("toast").textContent = message;
  $("toast").style.opacity = "1";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.opacity = "0"), 5000);
  $("status").textContent = message;
}
function persist() {
  if (restoring) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const state = storage.capture(project);
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => storage.save(state.project, state.savedAt))
      .then(
        () =>
          (document.querySelector(".local-label").textContent = T(
            "◈ Projeto salvo neste navegador",
          )),
      )
      .catch((e) => {
        document.querySelector(".local-label").textContent = T(
          "◈ Salve uma cópia portátil",
        );
        toast(e.message);
      });
  }, 350);
}
function snapshot() {
  if (playing || playPending) stop(false);
  revision++;
  history.push(project);
}
function changed() {
  revision++;
  persist();
  draw();
  renderScore();
  updateCount();
  renderTrackCounts();
}
function loadUI() {
  audio.project = project;
  audio.retainSamples(project.tracks);
  audio.retainBanks(project.soundBanks.map((bank) => bank.id));
  if (!project.tracks.some((t) => t.id === active))
    active = project.tracks[0].id;
  $("title").value = project.title;
  $("bpm").value = Math.round(project.bpm * 100) / 100;
  $("bars").value = measures().length;
  $("master").value = project.master * 100;
  const sig = project.signatures[0];
  $("tempoMap").textContent =
    `${sig.numerator} / ${sig.denominator}${project.tempos.length > 1 ? T(" · mapa") : ""}`;
  renderTracks();
  syncTrack();
  resize();
  persist();
}
function renderTrackCounts() {
  document.querySelectorAll(".track small").forEach((el, i) => {
    const t = project.tracks[i];
    if (t)
      el.textContent = T("{v0} notas · canal {v1}", {
        v0: t.notes.length,
        v1: t.channel + 1,
      });
  });
}
function renderTracks() {
  const box = $("tracks");
  box.replaceChildren();
  project.tracks.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "track" + (active === t.id ? " selected" : "");
    item.style.setProperty("--track", colors[i % colors.length]);
    const top = document.createElement("div");
    top.className = "track-top";
    const select = document.createElement("button");
    select.className = "track-name";
    select.textContent = t.name;
    select.title = T("Selecionar ") + t.name;
    select.onclick = () => selectTrack(t.id);
    top.append(select);
    for (const [prop, label] of [
      ["mute", "M"],
      ["solo", "S"],
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = prop === "mute" ? T("Silenciar") : "Solo";
      b.setAttribute("aria-pressed", String(t[prop]));
      b.classList.toggle("active", t[prop]);
      b.onclick = () => {
        snapshot();
        t[prop] = !t[prop];
        renderTracks();
        changed();
      };
      top.append(b);
    }
    const sub = document.createElement("small");
    item.append(top, sub);
    item.ondblclick = () => renameTrack(t);
    box.append(item);
  });
  renderTrackCounts();
}
function selectTrack(id) {
  for (const key of [...recorded.keys()]) noteOff(key);
  active = id;
  selection.clear();
  renderTracks();
  syncTrack();
  draw();
  renderScore();
}
function renameTrack(t) {
  showDialog(
    '<h2>Nome da pista</h2><label>Nome <input id="newTrackName" maxlength="80"></label><button id="renameApply" class="primary">Salvar nome</button>',
  );
  $("newTrackName").value = t.name;
  $("renameApply").onclick = () => {
    const name = $("newTrackName").value.trim();
    if (name) {
      snapshot();
      t.name = name;
      loadUI();
      closeDialog();
    }
  };
}
function syncTrack() {
  const t = track();
  $("trackTitle").textContent = t.name;
  for (const [id, value] of [
    ["instrument", t.instrument],
    ["trackVolume", t.volume * 100],
    ["glide", t.glide],
    ["echo", t.echo * 100],
    ["root", t.root],
    ["channel", t.channel + 1],
    ["pan", t.pan * 100],
  ])
    $(id).value = value;
  $("drum").checked = t.drum;
  $("glideValue").textContent = t.glide + " ms";
  $("sampleName").textContent =
    t.sampleName || T("WAV, MP3 ou OGG · nota base C4");
  renderBanks();
  renderPresets();
  hydrateCurrentBank();
  updateCount();
}
function renderBanks() {
  const select = $("bankSelect"),
    t = track();
  select.replaceChildren(new Option(T("Escolha o banco desta pista"), ""));
  for (const [index, bank] of project.soundBanks.entries())
    select.add(new Option(`${index + 1}. ${bank.name}`, bank.id));
  select.value = t.soundBankId || "";
  select.disabled = !project.soundBanks.length;
  $("bankName").textContent = T("{v0}/16 bancos no projeto", {
    v0: project.soundBanks.length,
  });
  $("removeBank").disabled = !t.soundBankId;
}
const bankCatalogLoads = new Map();
async function ensureBankCatalog(id, owner = project) {
  if (!owner.soundBanks.some((bank) => bank.id === id))
    throw Error(T("Escolha um banco de sons para esta pista."));
  if (audio.banks.has(id)) return audio.banks.get(id);
  if (bankCatalogLoads.has(id)) return bankCatalogLoads.get(id);
  const pending = (async () => {
    const asset = await storage.getAsset(id);
    if (project !== owner)
      throw Error(T("O projeto mudou durante o carregamento."));
    const entry = await audio.loadBank(asset.bytes, id);
    if (!project.soundBanks.some((bank) => bank.id === id)) {
      audio.retainBanks(project.soundBanks.map((bank) => bank.id));
      throw Error(T("O banco foi removido durante o carregamento."));
    }
    return entry;
  })();
  bankCatalogLoads.set(id, pending);
  try {
    return await pending;
  } finally {
    if (bankCatalogLoads.get(id) === pending) bankCatalogLoads.delete(id);
  }
}
function hydrateCurrentBank() {
  const t = track(),
    id = t.soundBankId,
    owner = project;
  if (!id || audio.banks.has(id)) return;
  ensureBankCatalog(id, owner)
    .then(() => {
      if (project === owner && track() === t && t.soundBankId === id)
        renderPresets();
    })
    .catch((e) => {
      if (project === owner && track() === t && t.soundBankId === id)
        toast(e.message);
    });
}
function renderPresets() {
  const select = $("preset"),
    t = track(),
    presets = audio.banks.get(t.soundBankId)?.presets || [];
  select.replaceChildren(
    new Option(
      t.soundBankId && !presets.length
        ? T("Carregando presets…")
        : T("Selecione um preset"),
      "",
    ),
  );
  select.disabled = !presets.length;
  presets.forEach((p, i) =>
    select.add(
      new Option(
        `${p.drum ? T("Bateria · ") : ""}${p.name} · ${p.bankMSB}:${p.bankLSB}:${p.program + 1}`,
        i,
      ),
    ),
  );
  const i = presets.findIndex(
    (p) =>
      p.program === t.program &&
      p.bankMSB === t.bankMSB &&
      p.bankLSB === t.bankLSB &&
      p.drum === t.drum,
  );
  if (i >= 0) select.value = i;
}
function updateCount() {
  $("noteCount").textContent = T("{v0} notas · {v1} compassos", {
    v0: track().notes.length,
    v1: measures().length,
  });
  $("selection").textContent = selection.size
    ? selection.size + T(" nota(s) selecionada(s)")
    : T("Nenhuma nota selecionada");
  $("undo").disabled = !history.past.length;
  $("redo").disabled = !history.future.length;
  const n = track().notes.find((n) => selection.has(n.id));
  if (n) $("velocity").value = n.velocity;
}
function setupCanvas(c, w, h) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.style.width = w + "px";
  c.style.height = h + "px";
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function resize() {
  const view = $("rollScroll"),
    w = Math.max(280, view.clientWidth || 1000),
    h = Math.max(200, view.clientHeight || 400);
  const spacer = document.querySelector(".roll-content");
  spacer.style.width = Math.max(w, KEY + length() * zoom) + "px";
  spacer.style.height = TOP + 128 * row + "px";
  setupCanvas($("roll"), w, h);
  setupCanvas($("automation"), w, 130);
  draw();
  renderScore();
}
function updateTime() {
  const bars = measures(),
    bar = Math.max(
      0,
      bars.findLastIndex((m) => m.beat <= position),
    ),
    inside = position - bars[bar].beat;
  $("time").textContent =
    String(bar + 1).padStart(3, "0") +
    " : " +
    String(Math.floor(inside) + 1).padStart(2, "0") +
    " : " +
    String(Math.floor((inside % 1) * 100)).padStart(2, "0");
}
function draw() {
  updateTime();
  const c = $("roll"),
    ctx = c.getContext("2d"),
    w = parseFloat(c.style.width) || 1000,
    h = parseFloat(c.style.height) || 400,
    sx = $("rollScroll").scrollLeft,
    sy = $("rollScroll").scrollTop;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#151b17";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "12px Segoe UI";
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEY, TOP, w - KEY, h - TOP);
  ctx.clip();
  for (
    let p = Math.max(MIN, MAX - Math.ceil((sy + h - TOP) / row));
    p <= Math.min(MAX, MAX - Math.floor((sy - TOP) / row));
    p++
  ) {
    const y = TOP + (MAX - p) * row - sy;
    ctx.fillStyle = [1, 3, 6, 8, 10].includes(p % 12) ? "#151b17" : "#1c231e";
    ctx.fillRect(KEY, y, w - KEY, row);
    ctx.strokeStyle = p % 12 === 0 ? "#4a5844" : "#2a342b";
    ctx.beginPath();
    ctx.moveTo(KEY, y + row);
    ctx.lineTo(w, y + row);
    ctx.stroke();
  }
  const step = Math.max(grid || 0.25, zoom < 35 ? 0.5 : 0.125);
  for (
    let b = Math.floor(sx / zoom / step) * step;
    b < Math.min(length(), (sx + w) / zoom) + step;
    b += step
  ) {
    const x = KEY + b * zoom - sx;
    ctx.strokeStyle =
      Math.abs(b - Math.round(b)) < 1e-7 ? "#354331" : "#253126";
    ctx.beginPath();
    ctx.moveTo(x, TOP);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (const bar of measures()) {
    const x = KEY + bar.beat * zoom - sx;
    if (x < KEY - 1 || x > w) continue;
    ctx.strokeStyle = "#526448";
    ctx.beginPath();
    ctx.moveTo(x, TOP);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (const t of project.tracks) {
    const ghost = t.id !== active;
    for (const n of t.notes) {
      const x = KEY + n.start * zoom - sx,
        y = TOP + (MAX - n.pitch) * row - sy + 2,
        nw = Math.max(3, n.duration * zoom - 2);
      if (x + nw < KEY || x > w || y + row < TOP || y > h) continue;
      ctx.globalAlpha = ghost ? 0.14 : 0.55 + n.velocity / 282;
      ctx.fillStyle = ghost
        ? "#94ba7b"
        : selection.has(n.id)
          ? "#efffdc"
          : colors[project.tracks.indexOf(t) % colors.length];
      ctx.beginPath();
      ctx.roundRect(x, y, nw, row - 4, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!ghost && nw > 32 && row > 15) {
        ctx.fillStyle = "#263820";
        ctx.fillText(noteName(n.pitch), x + 4, y + Math.min(14, row - 5));
      }
    }
  }
  if (drag?.box) {
    const b = drag.box;
    ctx.fillStyle = "#bcf18b22";
    ctx.strokeStyle = "#b1ef78";
    ctx.fillRect(b.x - sx, b.y - sy, b.w, b.h);
    ctx.strokeRect(b.x - sx, b.y - sy, b.w, b.h);
  }
  ctx.restore();
  for (let p = MIN; p <= MAX; p++) {
    const y = TOP + (MAX - p) * row - sy;
    if (y + row < TOP || y > h) continue;
    const black = [1, 3, 6, 8, 10].includes(p % 12);
    ctx.fillStyle = black ? "#252f27" : "#c7d0c5";
    ctx.fillRect(
      0,
      Math.max(TOP, y),
      KEY - 1,
      Math.min(row - 1, y + row - TOP),
    );
    ctx.fillStyle = black ? "#a3b4a3" : "#354433";
    if (y >= TOP && row > 14) ctx.fillText(noteName(p), 16, y + row * 0.7);
  }
  ctx.fillStyle = "#242e23";
  ctx.fillRect(0, 0, w, TOP);
  ctx.fillStyle = "#bdccb3";
  measures().forEach((bar, i) => {
    const x = KEY + bar.beat * zoom - sx;
    if (x >= KEY && x < w) ctx.fillText(String(i + 1), x + 8, 21);
  });
  ctx.fillStyle = "#273024";
  ctx.fillRect(0, 0, KEY, TOP);
  ctx.fillStyle = "#bdccb3";
  ctx.fillText(T("NOTA"), 12, 21);
  drawPlayhead();
  drawAutomation();
}
function drawPlayhead() {
  if (!position) return;
  const ctx = $("roll").getContext("2d"),
    x = KEY + position * zoom - $("rollScroll").scrollLeft;
  if (x < KEY) return;
  ctx.fillStyle = "#f0f6df";
  ctx.fillRect(x, 0, 1.5, parseFloat($("roll").style.height));
}
function drawAutomation() {
  const c = $("automation"),
    ctx = c.getContext("2d"),
    w = parseFloat(c.style.width) || 1000,
    sx = $("rollScroll").scrollLeft,
    type = $("lane").value;
  ctx.fillStyle = "#141d16";
  ctx.fillRect(0, 0, w, 130);
  ctx.font = "12px Segoe UI";
  ctx.fillStyle = "#99ad95";
  ctx.fillText(type === "pitch" ? "+2" : "127", 22, 20);
  ctx.fillText(type === "pitch" ? "−2" : "0", 29, 115);
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEY, 0, w - KEY, 130);
  ctx.clip();
  for (
    let b = Math.floor(sx / zoom);
    b < Math.min(length(), (sx + w) / zoom) + 1;
    b++
  ) {
    ctx.strokeStyle = "#2c3b2a";
    ctx.beginPath();
    ctx.moveTo(KEY + b * zoom - sx, 0);
    ctx.lineTo(KEY + b * zoom - sx, 130);
    ctx.stroke();
  }
  ctx.fillStyle = colors[project.tracks.indexOf(track()) % colors.length];
  ctx.strokeStyle = ctx.fillStyle;
  if (type === "velocity") {
    for (const n of track().notes) {
      const x = KEY + n.start * zoom - sx;
      if (x < KEY - 8 || x > w) continue;
      const y = 114 - (n.velocity / 127) * 100;
      ctx.globalAlpha = selection.size && !selection.has(n.id) ? 0.3 : 1;
      ctx.fillRect(x, y, 6, 114 - y);
      ctx.beginPath();
      ctx.arc(x + 3, y, 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const points = track()
        .cc.filter((c) => c.type === type)
        .sort((a, b) => a.beat - b.beat),
      max = type === "pitch" ? 16383 : 127;
    let prev =
      type === "pitch"
        ? 8192
        : ["7", "11"].includes(type)
          ? 127
          : type === "10"
            ? 64
            : 0;
    ctx.beginPath();
    ctx.moveTo(KEY - sx, 114 - (prev / max) * 100);
    for (const p of points) {
      const x = KEY + p.beat * zoom - sx,
        y = 114 - (p.value / max) * 100;
      if (x >= KEY - 1) {
        ctx.lineTo(x, 114 - (prev / max) * 100);
        ctx.lineTo(x, y);
      } else ctx.moveTo(x, y);
      prev = p.value;
      if (x > w) break;
    }
    ctx.lineTo(w, 114 - (prev / max) * 100);
    ctx.stroke();
    for (const p of points) {
      const x = KEY + p.beat * zoom - sx;
      if (x < KEY || x > w) continue;
      ctx.beginPath();
      ctx.arc(x, 114 - (p.value / max) * 100, 3, 0, 7);
      ctx.fill();
    }
  }
  const px = KEY + position * zoom - sx;
  if (position && px >= KEY) {
    ctx.fillStyle = "#f0f6df";
    ctx.fillRect(px, 0, 1, 130);
  }
  ctx.restore();
}
function point(e, c) {
  const r = c.getBoundingClientRect();
  return {
    x:
      e.clientX -
      r.left +
      (c.id === "roll" || c.id === "automation"
        ? $("rollScroll").scrollLeft
        : 0),
    y: e.clientY - r.top + (c.id === "roll" ? $("rollScroll").scrollTop : 0),
  };
}
const snap = (n) => Core.snap(n, grid),
  hit = (x, y) =>
    track()
      .notes.slice()
      .reverse()
      .find(
        (n) =>
          x >= KEY + n.start * zoom &&
          x <= KEY + (n.start + n.duration) * zoom &&
          y >= TOP + (MAX - n.pitch) * row &&
          y < TOP + (MAX - n.pitch + 1) * row,
      );
$("roll").oncontextmenu = (e) => e.preventDefault();
$("roll").onpointerdown = (e) => {
  if (![0, 2].includes(e.button)) return;
  e.preventDefault();
  $("roll").focus({ preventScroll: true });
  const { x, y } = point(e, $("roll")),
    localX = x - $("rollScroll").scrollLeft,
    localY = y - $("rollScroll").scrollTop;
  if (localY < TOP) {
    stop(false);
    position = clamp(snap((x - KEY) / zoom), 0, length());
    draw();
    return;
  }
  const pitch = clamp(MAX - Math.floor((y - TOP) / row), 0, 127);
  if (localX < KEY) {
    noteOn(pitch, 90, "pointer-" + e.pointerId);
    $("roll").setPointerCapture(e.pointerId);
    return;
  }
  let n = hit(x, y);
  if (e.button === 2 || tool === "erase") {
    if (n) {
      snapshot();
      track().notes = track().notes.filter((a) => a.id !== n.id);
      selection.delete(n.id);
      changed();
    }
    return;
  }
  if (tool === "cut") {
    if (n) {
      const at = snap((x - KEY) / zoom);
      if (at > n.start && at < n.start + n.duration) {
        snapshot();
        const end = n.start + n.duration;
        n.duration = at - n.start;
        track().notes.push({ ...n, id: uid(), start: at, duration: end - at });
        changed();
      }
    }
    return;
  }
  if (!n && tool === "select") {
    if (!e.shiftKey) selection.clear();
    drag = { x, y, base: new Set(selection), box: { x, y, w: 0, h: 0 } };
    $("roll").setPointerCapture(e.pointerId);
    draw();
    return;
  }
  if (n && e.shiftKey && selection.has(n.id)) {
    selection.delete(n.id);
    changed();
    return;
  }
  snapshot();
  if (n) {
    if (!e.shiftKey && !selection.has(n.id)) selection.clear();
    selection.add(n.id);
    drag = {
      x,
      y,
      resize: KEY + (n.start + n.duration) * zoom - x < 9,
      original: track()
        .notes.filter((n) => selection.has(n.id))
        .map((n) => ({ ...n })),
    };
  } else {
    const start = clamp(
      grid ? Math.floor((x - KEY) / zoom / grid) * grid : (x - KEY) / zoom,
      0,
      length() - 1 / 3840,
    );
    n = {
      id: uid(),
      pitch,
      start,
      duration: Math.min(grid || 0.25, length() - start),
      velocity: clamp(Math.round(+$("velocity").value || 90), 1, 127),
    };
    track().notes.push(n);
    selection = new Set([n.id]);
    drag = { x, y, resize: true, original: [{ ...n }] };
    previewNote(track(), pitch, n.velocity).catch((e) => toast(e.message));
  }
  $("roll").setPointerCapture(e.pointerId);
  changed();
};
$("roll").onpointermove = (e) => {
  if (!drag) return;
  const { x, y } = point(e, $("roll"));
  if (drag.box) {
    drag.box = {
      x: Math.min(x, drag.x),
      y: Math.min(y, drag.y),
      w: Math.abs(x - drag.x),
      h: Math.abs(y - drag.y),
    };
    selection = new Set(drag.base);
    const b = drag.box;
    for (const n of track().notes)
      if (
        KEY + n.start * zoom < b.x + b.w &&
        KEY + (n.start + n.duration) * zoom > b.x &&
        TOP + (MAX - n.pitch) * row < b.y + b.h &&
        TOP + (MAX - n.pitch + 1) * row > b.y
      )
        selection.add(n.id);
  } else if (drag.original.length) {
    let dt = grid
        ? Math.round((x - drag.x) / zoom / grid) * grid
        : (x - drag.x) / zoom,
      dp = -Math.round((y - drag.y) / row);
    if (!drag.resize) {
      const bounds = drag.original.reduce(
        (a, n) => [
          Math.min(a[0], n.start),
          Math.max(a[1], n.start + n.duration),
          Math.min(a[2], n.pitch),
          Math.max(a[3], n.pitch),
        ],
        [Infinity, 0, 127, 0],
      );
      dt = clamp(dt, -bounds[0], length() - bounds[1]);
      dp = clamp(dp, -bounds[2], 127 - bounds[3]);
    }
    for (const old of drag.original) {
      const n = track().notes.find((n) => n.id === old.id);
      if (!n) continue;
      if (drag.resize)
        n.duration = clamp(old.duration + dt, 1 / 3840, length() - n.start);
      else {
        n.start = old.start + dt;
        n.pitch = old.pitch + dp;
      }
    }
  }
  draw();
  updateCount();
};
$("roll").onpointerup = $("roll").onpointercancel = (e) => {
  noteOff("pointer-" + e.pointerId);
  if (drag) {
    drag = null;
    changed();
  }
};
let scrollFrame = 0;
$("rollScroll").onscroll = () => {
  if (!scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      draw();
    });
};
$("rollScroll").addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const local = e.clientX - $("rollScroll").getBoundingClientRect().left,
        b = ($("rollScroll").scrollLeft + local - KEY) / zoom;
      zoom = clamp(zoom * Math.exp(-e.deltaY * 0.002), 12, 240);
      $("zoom").value = zoom;
      resize();
      $("rollScroll").scrollLeft = b * zoom - local + KEY;
      draw();
    } else if (e.altKey) {
      e.preventDefault();
      const local = e.clientY - $("rollScroll").getBoundingClientRect().top,
        n = ($("rollScroll").scrollTop + local - TOP) / row;
      row = clamp(row - e.deltaY * 0.02, 12, 36);
      resize();
      $("rollScroll").scrollTop = n * row - local + TOP;
      draw();
    } else if (e.shiftKey) {
      e.preventDefault();
      $("rollScroll").scrollLeft += e.deltaY || e.deltaX;
    }
  },
  { passive: false },
);
function editAuto(e) {
  const { x, y } = point(e, $("automation"));
  if (x - $("rollScroll").scrollLeft < KEY) return;
  const beat = clamp(snap((x - KEY) / zoom), 0, length()),
    type = $("lane").value,
    max = type === "pitch" ? 16383 : 127;
  let value = Math.round(clamp((114 - y) / 100, 0, 1) * max);
  if (type === "velocity") {
    const near = track().notes.filter(
      (n) =>
        Math.abs(n.start * zoom + KEY - x) < 9 &&
        (!selection.size || selection.has(n.id)),
    );
    for (const n of near) n.velocity = Math.max(1, value);
  } else {
    if (type === "64") value = value >= 64 ? 127 : 0;
    const tolerance = grid ? grid * 0.25 : 2 / zoom,
      p = track().cc.find(
        (c) => c.type === type && Math.abs(c.beat - beat) < tolerance,
      );
    if (e.buttons === 2) {
      track().cc = track().cc.filter((c) => c !== p);
    } else if (p) {
      p.beat = beat;
      p.value = value;
    } else track().cc.push({ id: uid(), beat, type, value });
    audio.control(track(), type, value);
    sendOutput(
      {
        track: project.tracks.indexOf(track()),
        type: type === "pitch" ? "pitch" : "cc",
        controller: +type,
        value,
      },
      performance.now(),
    );
  }
  changed();
}
$("automation").oncontextmenu = (e) => e.preventDefault();
$("automation").onpointerdown = (e) => {
  snapshot();
  autoDrag = true;
  $("automation").setPointerCapture(e.pointerId);
  editAuto(e);
};
$("automation").onpointermove = (e) => {
  if (autoDrag) editAuto(e);
};
$("automation").onpointerup = $("automation").onpointercancel = () =>
  (autoDrag = false);
function undo(redo = false) {
  stop(false);
  const p = redo ? history.redo(project) : history.undo(project);
  if (p) {
    revision++;
    project = p;
    selection.clear();
    loadUI();
  }
}
function removeSelected() {
  if (!selection.size) return;
  snapshot();
  track().notes = track().notes.filter((n) => !selection.has(n.id));
  selection.clear();
  changed();
}
function quantize() {
  if (!grid) {
    toast(T("Selecione uma grade antes de quantizar."));
    return;
  }
  snapshot();
  Core.quantize(
    track().notes.filter((n) => !selection.size || selection.has(n.id)),
    { grid, ...quantOptions },
    length(),
  );
  changed();
  toast(T("Quantização aplicada"));
}
function copy() {
  clipboard = track()
    .notes.filter((n) => selection.has(n.id))
    .map((n) => ({ ...n }));
  if (clipboard.length) toast(clipboard.length + T(" notas copiadas"));
}
function paste(at = position) {
  if (!clipboard.length) return;
  const min = clipboard.reduce((v, n) => Math.min(v, n.start), Infinity),
    span = clipboard.reduce(
      (v, n) => Math.max(v, n.start + n.duration - min),
      0,
    );
  if (at + span > 4096) {
    toast(T("A colagem excede o limite do projeto."));
    return;
  }
  snapshot();
  project.lengthBeats = Math.max(length(), Math.ceil((at + span) * 4) / 4);
  selection.clear();
  for (const n of clipboard) {
    const c = { ...n, id: uid(), start: at + n.start - min };
    track().notes.push(c);
    selection.add(c.id);
  }
  loadUI();
  changed();
}
function duplicate() {
  copy();
  if (!clipboard.length) return;
  const end = clipboard.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  paste(grid ? Math.ceil(end / grid) * grid : end);
}
function setTool(next) {
  tool = next;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === next);
    b.setAttribute("aria-pressed", String(b.dataset.tool === next));
  });
}
function currentBeat() {
  return playing && audio.ctx
    ? clamp(
        transportTime.toBeat(
          startSeconds + Math.max(0, audio.ctx.currentTime - startTime),
        ),
        0,
        length(),
      )
    : position;
}
async function prepareAudio({ tracks, internal = true } = {}) {
  await audio.init();
  const p = project;
  audio.project = p;
  if (!internal) return;
  const solo = p.tracks.some((t) => t.solo);
  tracks ??= p.tracks.filter((t) => !t.mute && (!solo || t.solo));
  for (const t of tracks)
    if (
      t.instrument === "sample" &&
      (!audio.buffers.has(t.id) || audio.bufferIds.get(t.id) !== t.sampleId)
    ) {
      if (!t.sampleId) throw Error(T("Recarregue o sample da pista ") + t.name);
      const asset = await storage.getAsset(t.sampleId);
      audio.buffers.set(
        t.id,
        await audio.ctx.decodeAudioData(asset.bytes.slice(0)),
      );
      audio.bufferIds.set(t.id, t.sampleId);
      if (project !== p)
        throw Error(T("O projeto mudou durante o carregamento."));
    }
  for (const t of tracks.filter((t) => t.instrument === "soundfont")) {
    if (!t.soundBankId)
      throw Error(T("Escolha um banco de sons para a pista ") + t.name);
    await ensureBankCatalog(t.soundBankId, p);
    await audio.ensureBank(t.soundBankId);
    if (project !== p)
      throw Error(T("O projeto mudou durante o carregamento."));
  }
  renderPresets();
}
async function previewNote(t, pitch, velocity = 90) {
  await prepareAudio({ tracks: [t] });
  if (project.tracks.includes(t)) return audio.preview(t, pitch, velocity);
}
function sendOutput(e, ms) {
  if (!output) return;
  const t = project.tracks[e.track];
  let event = e;
  if (e.type === "cc" && e.controller === 7)
    event = { ...e, value: Math.round(e.value * t.volume) };
  try {
    output.send(Core.message(event, t.channel), ms);
  } catch (err) {
    toast(T("Saída MIDI desconectada: ") + err.message);
    stop(false);
    output = null;
    audio.setMaster(project.master);
  }
}
function chase(beat) {
  const all = timeline.filter((e) => e.beat < beat),
    states = [],
    held = new Map(),
    pedals = new Map();
  for (const e of all) {
    if (e.type === "on") held.set(e.note, { ...e });
    else if (e.type === "off") {
      if (pedals.get(e.track)) {
        const n = held.get(e.note);
        if (n) n.sustained = true;
      } else held.delete(e.note);
    } else {
      states.push(e);
      if (e.type === "cc" && e.controller === 64) {
        pedals.set(e.track, e.value >= 64);
        if (e.value < 64)
          for (const [id, n] of held)
            if (n.track === e.track && n.sustained) held.delete(id);
      }
    }
  }
  for (const e of states) {
    if (!output) audio.dispatch(e, project, startTime);
    sendOutput(e, performance.now() + 60);
    if (!playing) return;
  }
  for (const e of held.values()) {
    if (!output) audio.dispatch(e, project, startTime);
    sendOutput(e, performance.now() + 60);
    if (!playing) return;
    if (e.sustained) {
      const off = { ...e, type: "off", value: 0 };
      if (!output) audio.dispatch(off, project, startTime + 0.001);
      sendOutput(off, performance.now() + 61);
    }
  }
}
async function play() {
  if (playing || playPending) {
    stop(false);
    return;
  }
  const token = ++playToken;
  playPending = true;
  $("audioState").textContent = T("Preparando instrumentos…");
  try {
    await prepareAudio({ internal: !output });
    if (token !== playToken) return;
    if (position >= length()) position = 0;
    audio.configure(project);
    audio.setMaster(output ? 0 : project.master);
    transportTime = Core.clock(project);
    timeline = Core.events(project);
    startSeconds = transportTime.toSeconds(position);
    startTime = audio.ctx.currentTime + 0.06;
    eventIndex = timeline.findIndex((e) => e.beat >= position);
    if (eventIndex < 0) eventIndex = timeline.length;
    playing = true;
    playPending = false;
    chase(position);
    if (!playing) return;
    $("play").textContent = "Ⅱ";
    $("audioState").textContent = T("Reproduzindo");
    schedule();
    timer = setInterval(schedule, 25);
    animate();
  } catch (e) {
    if (token === playToken) {
      playPending = false;
      playing = false;
      $("audioState").textContent = T("Áudio pronto");
      toast(e.message);
    }
  }
}
function schedule() {
  if (!playing) return;
  const now = audio.ctx.currentTime;
  while (eventIndex < timeline.length) {
    const e = timeline[eventIndex],
      at = startTime + transportTime.toSeconds(e.beat) - startSeconds;
    if (at > now + 0.12) break;
    eventIndex++;
    if (!output) audio.dispatch(e, project, Math.max(now, at));
    sendOutput(e, performance.now() + Math.max(0, at - now) * 1000);
    if (!playing) return;
  }
  if (now >= startTime + transportTime.toSeconds(length()) - startSeconds) {
    position = length();
    stop(false);
    position = 0;
    if (loop) play();
    else draw();
  }
}
let lastPaint = 0;
function animate(ts = 0) {
  if (!playing) return;
  position = currentBeat();
  followCursor();
  updateTime();
  if (ts - lastPaint > 33) {
    lastPaint = ts;
    draw();
  }
  raf = requestAnimationFrame(animate);
}
function stop(reset = true) {
  position = currentBeat();
  playToken++;
  playPending = false;
  clearInterval(timer);
  cancelAnimationFrame(raf);
  for (const key of [...recorded.keys()]) noteOff(key, position);
  playing = false;
  audio.stop();
  if (output) {
    try {
      output.clear();
      for (let ch = 0; ch < 16; ch++) {
        output.send([176 | ch, 64, 0]);
        output.send([176 | ch, 123, 0]);
        output.send([176 | ch, 120, 0]);
      }
    } catch {
      output = null;
    }
  }
  if (reset) position = 0;
  $("play").textContent = "▶";
  $("audioState").textContent = T("Áudio pronto");
  if (reset) $("time").textContent = "001 : 01 : 00";
  draw();
}
async function noteOn(pitch, velocity, key = "key-" + pitch) {
  if (recorded.has(key) || restoring) return;
  const t = track(),
    start = currentBeat(),
    token = {
      pitch,
      trackId: t.id,
      channel: t.channel,
      record: armed && playing,
      start,
      velocity,
      voice: null,
    };
  if (token.record && ![...recorded.values()].some((n) => n.record))
    history.push(project);
  recorded.set(key, token);
  try {
    await prepareAudio({ tracks: [t], internal: !output });
    if (recorded.get(key) !== token) return;
    if (output) {
      output.send([144 | token.channel, pitch, velocity]);
      token.voice = {
        stop: () => output?.send([128 | token.channel, pitch, 0]),
      };
    } else {
      const voice = await audio.preview(t, pitch, velocity, true);
      if (recorded.get(key) === token) token.voice = voice;
      else voice.stop();
    }
  } catch (e) {
    recorded.delete(key);
    toast(e.message);
  }
}
function noteOff(key, end = currentBeat()) {
  const n = recorded.get(key);
  if (!n) return;
  recorded.delete(key);
  try {
    n.voice?.stop();
  } catch {}
  if (n.record) {
    const t = project.tracks.find((t) => t.id === n.trackId);
    if (t && n.start < length()) {
      t.notes.push({
        id: uid(),
        pitch: n.pitch,
        start: n.start,
        duration: clamp(end - n.start, 1 / 3840, length() - n.start),
        velocity: n.velocity,
      });
      changed();
    }
  }
}
function midiController(type, value) {
  audio.control(track(), type, value);
  if (armed && playing) {
    if (!recorded.size && !midiController.group) history.push(project);
    midiController.group = true;
    clearTimeout(midiController.timer);
    midiController.timer = setTimeout(
      () => (midiController.group = false),
      500,
    );
    track().cc.push({ id: uid(), beat: currentBeat(), type, value });
    changed();
  }
  sendOutput(
    {
      track: project.tracks.indexOf(track()),
      type: type === "pitch" ? "pitch" : "cc",
      controller: +type,
      value,
    },
    performance.now(),
  );
}
let scorePage = 0,
  scoreHits = [];
const diatonic = (p) =>
  Math.floor(p / 12) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][p % 12];
function renderScore() {
  if (!scoreMode) return;
  const bars = measures(),
    pages = Math.ceil(bars.length / 4);
  scorePage = clamp(scorePage, 0, pages - 1);
  $("scoreMeta").textContent = T("Pauta dupla · página {v0}/{v1}", {
    v0: scorePage + 1,
    v1: pages,
  });
  const w = Math.max(700, $("scorePanel").clientWidth || 1000),
    ctx = setupCanvas($("score"), w, 570);
  ctx.fillStyle = "#f6f5ed";
  ctx.fillRect(0, 0, w, 570);
  ctx.strokeStyle = "#626e5a";
  ctx.fillStyle = "#273323";
  scoreHits = [];
  const bw = (w - 100) / 2;
  for (let system = 0; system < 2; system++) {
    const top = 60 + system * 270;
    for (const sy of [top, top + 90])
      for (let line = 0; line < 5; line++) {
        ctx.beginPath();
        ctx.moveTo(40, sy + line * 10);
        ctx.lineTo(w - 20, sy + line * 10);
        ctx.stroke();
      }
    ctx.font = "42px serif";
    ctx.fillText("𝄞", 40, top + 37);
    ctx.fillText("𝄢", 40, top + 125);
    for (let j = 0; j < 2; j++) {
      const index = scorePage * 4 + system * 2 + j,
        bar = bars[index];
      if (!bar) continue;
      const x = 82 + j * bw;
      ctx.font = "13px Segoe UI";
      ctx.fillText(
        `${index + 1} · ${bar.numerator}/${bar.denominator}`,
        x + 5,
        top - 20,
      );
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + 130);
      ctx.stroke();
      const ns = track().notes.filter(
        (n) => n.start >= bar.beat && n.start < bar.end,
      );
      if (!ns.length) {
        ctx.font = "27px serif";
        ctx.fillText("𝄽", x + bw * 0.45, top + 28);
      }
      for (const n of ns) {
        const px =
            x + 25 + ((n.start - bar.beat) / (bar.end - bar.beat)) * (bw - 40),
          bass = n.pitch < 60,
          base = bass ? top + 130 : top + 40,
          ref = bass ? diatonic(43) : diatonic(64),
          py = base - (diatonic(n.pitch) - ref) * 5;
        ctx.fillStyle = selection.has(n.id) ? "#4c8027" : "#263422";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        ctx.ellipse(px, py, 6, 4, -0.3, 0, 7);
        if (n.duration >= 2) ctx.stroke();
        else ctx.fill();
        if (n.duration < 4) {
          ctx.beginPath();
          ctx.moveTo(px + 5, py);
          ctx.lineTo(px + 5, py - 27);
          ctx.stroke();
          for (
            let f = 0;
            f < (n.duration < 0.5 ? 2 : n.duration < 1 ? 1 : 0);
            f++
          ) {
            ctx.beginPath();
            ctx.moveTo(px + 5, py - 27 + f * 7);
            ctx.quadraticCurveTo(
              px + 20,
              py - 18 + f * 7,
              px + 8,
              py - 10 + f * 7,
            );
            ctx.stroke();
          }
        }
        if ([1, 3, 6, 8, 10].includes(n.pitch % 12)) {
          ctx.font = "16px serif";
          ctx.fillText("♯", px - 18, py + 4);
        }
        const staffTop = bass ? top + 90 : top;
        for (let ly = staffTop - 10; ly >= py - 2 && ly > top - 45; ly -= 10) {
          ctx.beginPath();
          ctx.moveTo(px - 10, ly);
          ctx.lineTo(px + 10, ly);
          ctx.stroke();
        }
        for (let ly = staffTop + 50; ly <= py + 2 && ly < top + 170; ly += 10) {
          ctx.beginPath();
          ctx.moveTo(px - 10, ly);
          ctx.lineTo(px + 10, ly);
          ctx.stroke();
        }
        scoreHits.push({ id: n.id, x: px, y: py });
      }
      scoreHits.push({ bar, index, x, width: bw, top });
    }
  }
}
$("score").onpointerdown = (e) => {
  const { x, y } = point(e, $("score"));
  const note = scoreHits.find(
    (n) => n.id && Math.abs(n.x - x) < 12 && Math.abs(n.y - y) < 12,
  );
  if (note) {
    selection = new Set([note.id]);
    changed();
    return;
  }
  const area = scoreHits.find(
    (a) =>
      a.bar &&
      x >= a.x + 18 &&
      x < a.x + a.width &&
      y >= a.top - 25 &&
      y <= a.top + 150,
  );
  if (!area) return;
  const bass = y > area.top + 70,
    base = bass ? area.top + 130 : area.top + 40,
    degree = (bass ? diatonic(43) : diatonic(64)) + Math.round((base - y) / 5),
    pitch =
      Math.floor(degree / 7) * 12 +
      [0, 2, 4, 5, 7, 9, 11][((degree % 7) + 7) % 7],
    start = clamp(
      snap(
        area.bar.beat +
          ((x - area.x - 25) / (area.width - 40)) *
            (area.bar.end - area.bar.beat),
      ),
      area.bar.beat,
      area.bar.end - 1 / 3840,
    );
  snapshot();
  const n = {
    id: uid(),
    pitch: clamp(pitch, 0, 127),
    start,
    duration: Math.min(+$("scoreDuration").value, length() - start),
    velocity: 90,
  };
  track().notes.push(n);
  selection = new Set([n.id]);
  changed();
  previewNote(track(), n.pitch).catch((e) => toast(e.message));
};
function switchView(value) {
  scoreMode = value;
  $("rollScroll").hidden = value;
  $("scorePanel").hidden = !value;
  $("rollTab").classList.toggle("active", !value);
  $("scoreTab").classList.toggle("active", value);
  resize();
}
function showDialog(html) {
  $("dialogContent").innerHTML = html;
  I18n.mark($("dialogContent"));
  if (!$("dialog").open) $("dialog").showModal();
}
function closeDialog() {
  if (exportAbort) exportAbort.abort();
  $("dialog").close();
}
$("closeDialog").onclick = closeDialog;
$("dialog").addEventListener("cancel", () => exportAbort?.abort());
$("dialog").onclick = (e) => {
  if (e.target === $("dialog")) closeDialog();
};
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const filename = () =>
  project.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "Aurora";
$("help").onclick = () =>
  showDialog(
    `<h2>Aurora MIDI Studio 2.3</h2><p>${location.protocol !== "file:" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ? '<a href="aurora-midi.zip" download>Baixar aplicativo HTML</a> · ' : ""}<a href="${globalThis.AURORA_MANUAL ? "data:text/plain;charset=utf-8," + encodeURIComponent(I18n.language === "en" ? globalThis.AURORA_MANUAL_EN || AURORA_MANUAL : AURORA_MANUAL) : I18n.language === "en" ? "README-EN.txt" : "LEIA-ME.txt"}" download="Manual-Aurora.txt">Manual e limites</a></p><p><b>Espaço</b> toca/pausa; <b>B/V/E/C</b> desenha/seleciona/apaga/divide. <b>Shift + clique</b> alterna seleção. Ctrl/Cmd + A/C/X/V/D/Z seleciona, copia, recorta, cola, duplica e desfaz. A colagem começa no cursor da régua.</p><p>Ctrl + roda: zoom horizontal ancorado no cursor. Alt + roda: altura das notas. Shift + roda: navegar no tempo. Nos controles de automação, botão direito apaga pontos.</p><p><b>Teclado musical:</b> A W S X D F T G Y H U J K toca C4 a C5 (X = D♯). Arme ● e toque durante a reprodução para gravar. A edição pausa o transporte para evitar eventos antigos.</p><p>Carregue um <b>SF2/SF3/DLS</b>, escolha SpessaSynth na pista e selecione um preset. Adicione vários arquivos e escolha o banco e o preset de cada pista. Os bancos tocam juntos e também entram na exportação de áudio. Salvar projeto gera um <b>.aurora portátil</b> com samples e todos os bancos de sons incluídos.</p><p>VST3/AU continuam exigindo um host instalado, conectado por MIDI virtual. A partitura é básica; a impressão cobre a página visível. SysEx e letras não são preservados pelo importador.</p><p>Base: PulseForge MIDI (MIT); SpessaSynth core 4.3.22 e lib 4.3.14 (Apache-2.0); MP3: lamejs 1.2.1/LAME (LGPL). Licenças e alterações estão no download.</p>`,
  );
$("export").onclick = () => {
  showDialog(
    '<h2>Exportar música</h2><p>MIDI inclui todas as pistas. WAV e MP3 respeitam mute, solo, samples, SoundFont e automações.</p><div class="exports"><button id="exportMidi" class="primary">MIDI .mid</button><button id="exportWav">WAV 44,1 kHz</button><button id="exportMp3">MP3 192 kbps</button><button id="cancelExport" hidden>Cancelar</button></div><p id="exportProgress">Áudio estéreo com 4 segundos de cauda.</p>',
  );
  $("exportMidi").onclick = () => {
    try {
      download(Midi.write(project), filename() + ".mid", "audio/midi");
      toast(T("MIDI exportado"));
    } catch (e) {
      toast(e.message);
    }
  };
  for (const format of ["Wav", "Mp3"])
    $("export" + format).onclick = () => exportAudio(format.toLowerCase());
  $("cancelExport").onclick = () => exportAbort?.abort();
};
async function exportAudio(format) {
  if (exportAbort) return;
  exportAbort = new AbortController();
  const signal = exportAbort.signal,
    progress = $("exportProgress");
  for (const id of ["exportMidi", "exportWav", "exportMp3"])
    $(id).disabled = true;
  $("cancelExport").hidden = false;
  stop(false);
  try {
    await prepareAudio();
    const frozen = structuredClone(project),
      name = filename();
    const buffer = await audio.render(frozen, {
      signal,
      onProgress: (s) => (progress.textContent = T(s)),
    });
    if (signal.aborted) throw Error(T("Exportação cancelada."));
    if (format === "wav")
      download(wavBytes(buffer), name + ".wav", "audio/wav");
    else {
      const encoder = new lamejs.Mp3Encoder(2, 44100, 192),
        left = buffer.getChannelData(0),
        right = buffer.getChannelData(1),
        chunks = [];
      for (let i = 0; i < left.length; i += 1152) {
        if (signal.aborted) throw Error(T("Exportação cancelada."));
        const len = Math.min(1152, left.length - i),
          l = new Int16Array(len),
          r = new Int16Array(len);
        for (let j = 0; j < len; j++) {
          l[j] = clamp(left[i + j], -1, 1) * 32767;
          r[j] = clamp(right[i + j], -1, 1) * 32767;
        }
        const bytes = encoder.encodeBuffer(l, r);
        if (bytes.length) chunks.push(new Uint8Array(bytes));
        if (i % (1152 * 90) === 0) {
          progress.textContent =
            T("Codificando MP3… ") + Math.round((i / left.length) * 100) + "%";
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      chunks.push(new Uint8Array(encoder.flush()));
      download(new Blob(chunks), name + ".mp3", "audio/mpeg");
    }
    progress.textContent = T("Exportação concluída.");
  } catch (e) {
    progress.textContent = T(e.message);
  } finally {
    exportAbort = null;
    for (const id of ["exportMidi", "exportWav", "exportMp3"])
      if ($(id)) $(id).disabled = false;
    if ($("cancelExport")) $("cancelExport").hidden = true;
  }
}
$("save").onclick = async () => {
  const button = $("save");
  button.disabled = true;
  try {
    const frozen = structuredClone(project);
    const savedName = filename();
    const data = await storage.portable(frozen);
    download(data, savedName + ".aurora", "application/json");
    toast(T("Projeto portátil salvo com os arquivos de áudio."));
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
$("import").onclick = () => $("fileInput").click();
let importToken = 0;
async function importFile(file) {
  const token = ++importToken,
    owner = project,
    initialRevision = revision;
  if (file.size > 260 * 1024 * 1024)
    throw Error(T("Arquivo maior que 260 MB."));
  let p,
    warnings = [];
  if (/\.(json|aurora|pfm)$/i.test(file.name)) {
    const input = JSON.parse(await file.text());
    p =
      input.format === "Aurora portable project"
        ? await storage.importPortable(input)
        : input.format === "PulseForge MIDI Project"
          ? Core.pulseForge(input)
          : Core.validate(input);
  } else {
    p = Midi.read(await file.arrayBuffer());
    warnings = p.warnings;
    delete p.warnings;
    p.title = file.name.replace(/\.(midi?|rmi)$/i, "");
  }
  if (token !== importToken) return;
  if (project !== owner || revision !== initialRevision)
    throw Error(
      T(
        "O projeto foi editado durante a importação. Abra o arquivo novamente.",
      ),
    );
  stop();
  snapshot();
  project = p;
  active = project.tracks[0].id;
  selection.clear();
  audio.buffers.clear();
  audio.resetBanks();
  bankCatalogLoads.clear();
  scorePage = 0;
  loadUI();
  $("rollScroll").scrollTop = (127 - 76) * row;
  toast(
    warnings.length
      ? warnings.map((message) => T(message)).join(" ")
      : T("Projeto aberto. Os áudios são restaurados ao tocar."),
  );
}
$("fileInput").onchange = async (e) => {
  const f = e.target.files[0];
  if (f)
    try {
      await importFile(f);
    } catch (err) {
      toast(err.message);
    }
  e.target.value = "";
};
$("new").onclick = () => {
  showDialog(
    '<h2>Novo projeto</h2><p>Salve uma cópia portátil para guardar o trabalho atual. A criação também pode ser desfeita.</p><button id="confirmNew" class="primary">Criar projeto vazio</button>',
  );
  $("confirmNew").onclick = () => {
    snapshot();
    project = Core.validate({
      title: T("Sem título"),
      bpm: 120,
      lengthBeats: 32,
      master: 0.7,
      tracks: [makeTrack(T("Piano elétrico"))],
    });
    active = project.tracks[0].id;
    selection.clear();
    position = 0;
    scorePage = 0;
    loadUI();
    closeDialog();
  };
};
$("add").onclick = () => {
  if (project.tracks.length >= 16) return toast(T("Limite de 16 pistas."));
  snapshot();
  const used = new Set(project.tracks.map((t) => t.channel));
  const channel =
    Array.from({ length: 16 }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
  const t = makeTrack(
    T("Instrumento ") + (project.tracks.length + 1),
    "piano",
    channel,
  );
  project.tracks.push(t);
  active = t.id;
  selection.clear();
  loadUI();
};
$("removeTrack").onclick = () => {
  if (project.tracks.length === 1)
    return toast(T("Mantenha pelo menos uma pista."));
  const id = active;
  showDialog(
    '<h2>Excluir pista?</h2><p>As notas e automações desta pista serão removidas. Você pode desfazer.</p><button id="confirmRemove">Excluir pista</button>',
  );
  $("confirmRemove").onclick = () => {
    snapshot();
    project.tracks = project.tracks.filter((t) => t.id !== id);
    active = project.tracks[0].id;
    selection.clear();
    loadUI();
    closeDialog();
  };
};
$("sample").onclick = () => $("sampleInput").click();
$("sampleInput").onchange = async (e) => {
  const f = e.target.files[0],
    t = track();
  if (f)
    try {
      if (f.size > 50 * 1024 * 1024)
        throw Error(T("O sample deve ter até 50 MB."));
      await audio.init();
      const bytes = await f.arrayBuffer(),
        buffer = await audio.ctx.decodeAudioData(bytes.slice(0)),
        id = uid();
      await storage.putAsset({ id, name: f.name, type: f.type, bytes });
      if (!project.tracks.includes(t)) return;
      snapshot();
      t.instrument = "sample";
      t.sampleName = f.name;
      t.sampleId = id;
      audio.buffers.set(t.id, buffer);
      audio.bufferIds.set(t.id, id);
      syncTrack();
      changed();
      toast(T("Sample carregado e guardado no projeto."));
    } catch (err) {
      toast(err.message);
    }
  e.target.value = "";
};
function applyPreset(t, preset) {
  Object.assign(t, {
    instrument: "soundfont",
    program: preset.program,
    bankMSB: preset.bankMSB,
    bankLSB: preset.bankLSB,
    drum: preset.drum,
  });
}
async function loadBankFile(bytes, name, assign = true, target = track()) {
  if (project.soundBanks.length >= 16)
    throw Error(
      T("Limite de 16 bancos. Remova um banco sem uso para adicionar outro."),
    );
  if (bytes.byteLength > 128 * 1024 * 1024)
    throw Error(T("Cada banco deve ter até 128 MB."));
  const owner = project,
    id = uid();
  stop(false);
  const entry = await audio.loadBank(bytes, id);
  if (project !== owner || !project.tracks.includes(target)) {
    audio.retainBanks(project.soundBanks.map((bank) => bank.id));
    return false;
  }
  await storage.putAsset({
    id,
    name,
    type: "audio/soundfont",
    bytes: bytes.slice(0),
  });
  if (project !== owner || !project.tracks.includes(target)) {
    audio.retainBanks(project.soundBanks.map((bank) => bank.id));
    return false;
  }
  snapshot();
  project.soundBanks.push({ id, name });
  if (assign) {
    target.soundBankId = id;
    applyPreset(
      target,
      entry.presets.find((preset) => preset.drum === target.drum) ||
        entry.presets[0],
    );
  }
  syncTrack();
  changed();
  toast(
    T("Banco adicionado · ") +
      entry.presets.length +
      T(" presets. As outras pistas mantêm seus bancos."),
  );
  return true;
}
let bankUploadBusy = false;
function setBankUploadBusy(value) {
  bankUploadBusy = value;
  $("loadBank").disabled = value;
  $("demoBank").disabled = value;
}
$("loadBank").onclick = () => $("bankInput").click();
$("bankInput").onchange = async (e) => {
  if (bankUploadBusy) return;
  const files = [...e.target.files],
    target = track(),
    owner = project;
  e.target.value = "";
  setBankUploadBusy(true);
  const errors = [];
  let added = 0;
  try {
    for (const file of files) {
      if (project !== owner || !project.tracks.includes(target)) break;
      try {
        if (file.size > 128 * 1024 * 1024)
          throw Error(T("limite de 128 MB por banco"));
        if (
          await loadBankFile(
            await file.arrayBuffer(),
            file.name,
            added === 0,
            target,
          )
        )
          added++;
      } catch (error) {
        errors.push(file.name + ": " + error.message);
      }
    }
  } finally {
    setBankUploadBusy(false);
    syncTrack();
  }
  if (errors.length)
    toast(T("{v0} banco(s) adicionado(s). ", { v0: added }) + errors.join(" "));
  else if (added > 1)
    toast(
      T("{v0} bancos adicionados. Escolha um banco em cada pista.", {
        v0: added,
      }),
    );
};
$("demoBank").onclick = async () => {
  if (bankUploadBusy) return;
  setBankUploadBusy(true);
  try {
    await loadBankFile(
      Uint8Array.from(atob(AURORA_DEMO_BANK), (c) => c.charCodeAt(0)).buffer,
      T("Aurora · banco sintético de demonstração"),
    );
  } catch (error) {
    toast(error.message);
  } finally {
    setBankUploadBusy(false);
  }
};
$("bankSelect").onchange = async (e) => {
  const id = e.target.value,
    t = track(),
    owner = project;
  if (!id) {
    renderBanks();
    return;
  }
  stop(false);
  // Commit the selection only after this bank is available; keep the previous sound on failure.
  const token = ++bankSelectionToken;
  try {
    const entry = await ensureBankCatalog(id, owner);
    if (token !== bankSelectionToken || project !== owner || track() !== t)
      return;
    snapshot();
    t.soundBankId = id;
    applyPreset(
      t,
      entry.presets.find(
        (p) =>
          p.program === t.program &&
          p.bankMSB === t.bankMSB &&
          p.bankLSB === t.bankLSB &&
          p.drum === t.drum,
      ) ||
        entry.presets.find((p) => p.drum === t.drum) ||
        entry.presets[0],
    );
    syncTrack();
    changed();
  } catch (error) {
    if (project === owner && track() === t) {
      renderBanks();
      toast(error.message);
    }
  }
};
let bankSelectionToken = 0;
$("removeBank").onclick = () => {
  const id = track().soundBankId;
  if (!id) return;
  if (
    project.tracks.some(
      (t) => t.instrument === "soundfont" && t.soundBankId === id,
    )
  ) {
    toast(
      T(
        "Este banco está em uso. Troque o banco ou o timbre das pistas que o utilizam antes de removê-lo.",
      ),
    );
    return;
  }
  stop(false);
  snapshot();
  project.soundBanks = project.soundBanks.filter((bank) => bank.id !== id);
  for (const t of project.tracks)
    if (t.soundBankId === id) t.soundBankId = null;
  audio.retainBanks(project.soundBanks.map((bank) => bank.id));
  syncTrack();
  changed();
};
$("preset").onchange = (e) => {
  const p = audio.banks.get(track().soundBankId)?.presets[+e.target.value];
  if (e.target.value === "" || !p) return;
  snapshot();
  Object.assign(track(), {
    instrument: "soundfont",
    program: p.program,
    bankMSB: p.bankMSB,
    bankLSB: p.bankLSB,
    drum: p.drum,
  });
  syncTrack();
  changed();
};
$("instrument").onchange = (e) => {
  snapshot();
  const t = track();
  t.instrument = e.target.value;
  if (t.instrument === "soundfont" && !t.soundBankId)
    t.soundBankId = project.soundBanks[0]?.id || null;
  if (t.instrument !== "soundfont")
    t.program = {
      piano: 4,
      sine: 80,
      triangle: 38,
      sawtooth: 81,
      square: 80,
      sample: 0,
    }[t.instrument];
  syncTrack();
  changed();
};
for (const [id, key, min, max, scale] of [
  ["glide", "glide", 0, 400, 1],
  ["echo", "echo", 0, 0.65, 100],
  ["trackVolume", "volume", 0, 1, 100],
  ["root", "root", 0, 127, 1],
  ["pan", "pan", -1, 1, 100],
]) {
  $(id).addEventListener("pointerdown", () => snapshot());
  $(id).addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      snapshot();
  });
  $(id).oninput = (e) => {
    track()[key] = clamp(+e.target.value / scale, min, max);
    if (id === "glide") $("glideValue").textContent = track().glide + " ms";
    changed();
  };
}
$("channel").onchange = (e) => {
  const value = clamp(Math.round(+e.target.value || 1), 1, 16) - 1;
  snapshot();
  track().channel = value;
  renderTracks();
  changed();
  if (project.tracks.some((t) => t.id !== active && t.channel === value))
    toast(T("Pistas com o mesmo canal compartilham controles na saída MIDI."));
};
$("drum").onchange = (e) => {
  snapshot();
  track().drum = e.target.checked;
  changed();
};
$("bpm").onchange = (e) => {
  const v = clamp(+e.target.value || 120, 10, 1000);
  snapshot();
  project.bpm = v;
  project.tempos[0].bpm = v;
  loadUI();
  if (project.tempos.length > 1)
    toast(T("BPM inicial alterado. Os outros andamentos foram preservados."));
};
$("bars").onchange = (e) => {
  const bars = clamp(Math.round(+e.target.value || 8), 1, 1024),
    sig = project.signatures.at(-1),
    existing = measures();
  let target;
  if (bars <= existing.length) target = existing[bars - 1].end;
  else
    target =
      length() +
      ((bars - existing.length) * sig.numerator * 4) / sig.denominator;
  const last = project.tracks.reduce(
    (a, t) =>
      Math.max(
        a,
        t.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0),
        t.cc.reduce((m, c) => Math.max(m, c.beat), 0),
        t.events.reduce((m, c) => Math.max(m, c.beat), 0),
      ),
    0,
  );
  if (target < last || target > 4096) {
    $("bars").value = existing.length;
    toast(
      target > 4096
        ? T("Limite de 4096 tempos.")
        : T("Mova ou apague os eventos finais antes de reduzir."),
    );
    return;
  }
  snapshot();
  project.lengthBeats = target;
  project.tempos = project.tempos.filter((t) => t.beat <= target);
  project.signatures = project.signatures.filter((s) => s.beat < target);
  loadUI();
};
$("master").oninput = (e) => {
  project.master = +e.target.value / 100;
  audio.setMaster(output ? 0 : project.master);
  persist();
};
$("title").onchange = (e) => {
  snapshot();
  project.title = e.target.value.trim() || T("Sem título");
  persist();
};
$("zoom").oninput = (e) => {
  zoom = +e.target.value;
  resize();
};
$("grid").onchange = (e) => {
  grid = +e.target.value;
  draw();
};
$("lane").onchange = drawAutomation;
$("clearLane").onclick = () => {
  if ($("lane").value === "velocity")
    return toast(T("Selecione notas e use o campo Velocity."));
  snapshot();
  track().cc = track().cc.filter((c) => c.type !== $("lane").value);
  changed();
};
$("velocity").onchange = (e) => {
  const v = clamp(Math.round(+e.target.value || 90), 1, 127);
  e.target.value = v;
  if (selection.size) {
    snapshot();
    for (const n of track().notes) if (selection.has(n.id)) n.velocity = v;
    changed();
  }
};
$("play").onclick = play;
$("stop").onclick = () => stop();
$("loop").onclick = () => {
  loop = !loop;
  $("loop").classList.toggle("active", loop);
  $("loop").setAttribute("aria-pressed", String(loop));
};
$("record").onclick = () => {
  armed = !armed;
  $("record").classList.toggle("armed", armed);
  $("record").setAttribute("aria-pressed", String(armed));
  if (!armed) for (const key of [...recorded.keys()]) noteOff(key);
  toast(
    armed
      ? T("Gravação armada · toque durante a reprodução")
      : T("Gravação desarmada"),
  );
};
$("undo").onclick = () => undo();
$("redo").onclick = () => undo(true);
$("quantize").onclick = quantize;
$("duplicate").onclick = duplicate;
$("deleteNotes").onclick = removeSelected;
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("rollTab").onclick = () => switchView(false);
$("scoreTab").onclick = () => switchView(true);
$("print").onclick = () => window.print();
$("quantizeOptions").onclick = () => {
  showDialog(
    '<h2>Quantização</h2><label>Força (%) <input id="qStrength" type="number" min="0" max="100"></label><label>Swing (%) <input id="qSwing" type="number" min="-95" max="95"></label><label><input id="qEnds" type="checkbox"> Quantizar também o fim das notas</label><p>Força parcial mantém parte da variação original. Swing desloca as subdivisões ímpares.</p><button id="qApply" class="primary">Aplicar às notas</button>',
  );
  $("qStrength").value = quantOptions.strength * 100;
  $("qSwing").value = quantOptions.swing * 100;
  $("qEnds").checked = quantOptions.ends;
  $("qApply").onclick = () => {
    quantOptions.strength = clamp(+$("qStrength").value / 100, 0, 1);
    quantOptions.swing = clamp(+$("qSwing").value / 100, -0.95, 0.95);
    quantOptions.ends = $("qEnds").checked;
    quantize();
    closeDialog();
  };
};
$("transpose").onclick = () => {
  showDialog(
    '<h2>Transpor</h2><label>Semitons <input id="transAmount" type="number" min="-48" max="48" value="12"></label><p>Aplica às notas selecionadas; sem seleção, à pista inteira.</p><button id="transApply" class="primary">Transpor notas</button>',
  );
  $("transApply").onclick = () => {
    const amount = clamp(Math.round(+$("transAmount").value || 0), -48, 48),
      notes = track().notes.filter(
        (n) => !selection.size || selection.has(n.id),
      );
    if (notes.some((n) => n.pitch + amount < 0 || n.pitch + amount > 127))
      return toast(T("A transposição ultrapassa o intervalo MIDI."));
    snapshot();
    for (const n of notes) n.pitch += amount;
    changed();
    closeDialog();
  };
};
$("glideCurve").onclick = () => {
  if (!selection.size)
    return toast(T("Selecione as notas para criar o glide."));
  showDialog(
    '<h2>Glide por pitch bend</h2><label>Deslocamento <input id="gAmount" type="number" min="-2" max="2" step="0.1" value="2"> semitons</label><label>Duração <input id="gDuration" type="number" min="0.0625" max="8" step="0.25" value="0.5"> tempos</label><p>Pitch bend afeta todas as notas do canal. A curva volta ao centro no fim de cada nota.</p><button id="gApply" class="primary">Criar curva</button>',
  );
  $("gApply").onclick = () => {
    const amount = clamp(+$("gAmount").value || 0, -2, 2),
      span = clamp(+$("gDuration").value || 0.5, 0.0625, 8);
    snapshot();
    for (const n of track().notes)
      if (selection.has(n.id)) {
        track().cc = track().cc.filter(
          (c) =>
            c.type !== "pitch" ||
            c.beat < n.start ||
            c.beat > n.start + n.duration,
        );
        for (let j = 0; j <= 24; j++)
          track().cc.push({
            id: uid(),
            beat: n.start + (Math.min(span, n.duration) * j) / 24,
            type: "pitch",
            value: Math.round(clamp(8192 + (amount * 4096 * j) / 24, 0, 16383)),
          });
        track().cc.push({
          id: uid(),
          beat: n.start + n.duration,
          type: "pitch",
          value: 8192,
        });
      }
    $("lane").value = "pitch";
    changed();
    closeDialog();
  };
};
$("tempoMap").onclick = () => {
  showDialog(
    '<h2>Andamentos e compassos</h2><label>Andamento: tempo de semínima, BPM</label><textarea id="tempoText" aria-label="Mapa de andamento"></textarea><label>Compasso: tempo de semínima, numerador/denominador</label><textarea id="sigText" aria-label="Mapa de compassos"></textarea><p>A posição começa em 0. Uma mudança por linha. Exemplo: 16, 90 ou 16, 3/4.</p><button id="mapApply" class="primary">Aplicar mapas</button>',
  );
  $("tempoText").value = project.tempos
    .map((t) => `${t.beat}, ${t.bpm}`)
    .join("\n");
  $("sigText").value = project.signatures
    .map((s) => `${s.beat}, ${s.numerator}/${s.denominator}`)
    .join("\n");
  $("mapApply").onclick = () => {
    try {
      const next = structuredClone(project);
      next.tempos = $("tempoText")
        .value.trim()
        .split(/\n/)
        .map((line) => {
          const a = line.split(",").map((x) => Number(x.trim()));
          if (a.length !== 2) throw Error(T("Use posição, BPM em cada linha."));
          return { beat: a[0], bpm: a[1] };
        });
      next.signatures = $("sigText")
        .value.trim()
        .split(/\n/)
        .map((line) => {
          const m = line.match(/^\s*([\d.]+)\s*,\s*(\d+)\s*\/\s*(\d+)\s*$/);
          if (!m) throw Error(T("Use posição, numerador/denominador."));
          return { beat: +m[1], numerator: +m[2], denominator: +m[3] };
        });
      const checked = Core.validate(next);
      snapshot();
      project = checked;
      loadUI();
      closeDialog();
    } catch (e) {
      toast(e.message);
    }
  };
};
const scoreButtons = document.createElement("div");
scoreButtons.className = "dialog-row";
for (const [title, dir] of [
  [T("Página anterior"), -1],
  [T("Próxima página"), 1],
]) {
  const b = document.createElement("button");
  b.textContent = title;
  b.onclick = () => {
    scorePage += dir;
    renderScore();
  };
  scoreButtons.append(b);
}
document.querySelector(".score-controls").append(scoreButtons);
$("midi").onclick = async () => {
  try {
    if (!navigator.requestMIDIAccess)
      throw Error(
        T(
          "Web MIDI não disponível. Use Chrome ou Edge e abra por HTTPS ou localhost.",
        ),
      );
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    const refresh = () => {
      for (const input of midiAccess.inputs.values())
        input.onmidimessage = ({ data }) => {
          const [s, p, v] = data,
            kind = s & 240,
            key = `midi-${input.id}-${s & 15}-${p}`;
          if (kind === 144 && v) noteOn(p, v, key);
          else if (kind === 128 || kind === 144) noteOff(key);
          else if (kind === 176) midiController(String(p), v);
          else if (kind === 224) midiController("pitch", p + (v << 7));
        };
      const current = $("midiOut").value;
      $("midiOut").replaceChildren(
        new Option(T("Saída: sintetizador interno"), ""),
      );
      for (const o of midiAccess.outputs.values())
        $("midiOut").add(new Option(o.name, o.id));
      $("midiOut").value = current;
      if (output && !midiAccess.outputs.has(output.id)) {
        stop(false);
        output = null;
        audio.setMaster(project.master);
        toast(T("Saída MIDI desconectada."));
      } else output = midiAccess.outputs.get(current) || null;
    };
    refresh();
    midiAccess.onstatechange = refresh;
    toast(T("MIDI conectado · ") + midiAccess.inputs.size + T(" entrada(s)"));
  } catch (e) {
    toast(e.message);
  }
};
$("midiOut").onchange = (e) => {
  stop(false);
  output = midiAccess?.outputs.get(e.target.value) || null;
  audio.setMaster(output ? 0 : project.master);
  toast(
    output ? T("Saída externa selecionada") : T("Saída interna selecionada"),
  );
};
const keys = {
  a: 60,
  w: 61,
  s: 62,
  x: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
};
document.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable ||
    $("dialog").open ||
    restoring
  )
    return;
  const key = e.key.toLowerCase(),
    mod = e.ctrlKey || e.metaKey;
  if (e.repeat) return;
  if (mod) {
    if (["a", "c", "x", "v", "d", "z", "y", "s"].includes(key))
      e.preventDefault();
    if (key === "a") {
      selection = new Set(track().notes.map((n) => n.id));
      draw();
      updateCount();
    }
    if (key === "c" || key === "x") {
      copy();
      if (key === "x") removeSelected();
    }
    if (key === "v") paste();
    if (key === "d") duplicate();
    if (key === "z") undo(e.shiftKey);
    if (key === "y") undo(true);
    if (key === "s") $("save").click();
    return;
  }
  if (e.code === "Space") {
    e.preventDefault();
    play();
    return;
  }
  if (["delete", "backspace"].includes(key)) {
    e.preventDefault();
    removeSelected();
    return;
  }
  if (key === "b") setTool("draw");
  else if (key === "v") setTool("select");
  else if (key === "e") setTool("erase");
  else if (key === "c") setTool("cut");
  else if (key === "q") quantize();
  else if (keys[key] !== undefined) {
    const id = "keyboard-" + e.code;
    heldKeys.set(e.code, id);
    noteOn(keys[key], 90, id);
  }
});
document.addEventListener("keyup", (e) => {
  const key = heldKeys.get(e.code);
  if (key) {
    noteOff(key);
    heldKeys.delete(e.code);
  }
});
window.addEventListener("blur", () => {
  for (const key of [...recorded.keys()]) noteOff(key);
  heldKeys.clear();
});
window.addEventListener("resize", resize);
const allBank = document.createElement("button");
allBank.textContent = T("Aplicar este banco a todas as pistas");
allBank.onclick = () => {
  const id = track().soundBankId;
  if (!id) return toast(T("Escolha um banco nesta pista primeiro."));
  stop(false);
  snapshot();
  for (const t of project.tracks) {
    t.instrument = "soundfont";
    t.soundBankId = id;
  }
  syncTrack();
  changed();
};
$("bankName").after(allBank);
const lifecycle = new AbortController();
if (typeof document.modelContext?.registerTool === "function") {
  Promise.resolve()
    .then(() =>
      document.modelContext.registerTool(
        {
          name: "add_midi_notes",
          description: T("Adicionar notas à pista ativa do Aurora."),
          inputSchema: {
            type: "object",
            properties: {
              notes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pitch: { type: "integer", minimum: 0, maximum: 127 },
                    start: { type: "number", minimum: 0 },
                    duration: { type: "number", exclusiveMinimum: 0 },
                    velocity: { type: "integer", minimum: 1, maximum: 127 },
                  },
                  required: ["pitch", "start", "duration", "velocity"],
                  additionalProperties: false,
                },
              },
            },
            required: ["notes"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input) {
            if (
              !input ||
              !Array.isArray(input.notes) ||
              input.notes.length > 10000
            )
              throw Error(T("Notas inválidas."));
            const next = structuredClone(project);
            next.tracks
              .find((t) => t.id === active)
              .notes.push(...input.notes.map((n) => ({ ...n, id: uid() })));
            const checked = Core.validate(next);
            snapshot();
            project = checked;
            changed();
            return { added: input.notes.length, total: track().notes.length };
          },
        },
        { signal: lifecycle.signal },
      ),
    )
    .catch(() => {});
}
function checkpointProject() {
  if (restoring) return;
  clearTimeout(persistTimer);
  try {
    storage.checkpoint(project);
  } catch (e) {
    toast(e.message);
  }
}
window.addEventListener("pagehide", () => {
  lifecycle.abort();
  stop(false);
  checkpointProject();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") checkpointProject();
});
// Do not let an asynchronous restore replace edits made during startup.
const startupPanels = [
  ...document.querySelectorAll("header, .transport, .workspace"),
];
for (const panel of startupPanels) panel.inert = true;
storage.onWarning = toast;
loadUI();
$("rollScroll").scrollTop = (127 - 76) * row;
const startup = storage
  .load()
  .then((saved) => {
    if (saved) {
      project = Core.validate(saved);
      active = project.tracks[0].id;
    }
    restoring = false;
    for (const panel of startupPanels) panel.inert = false;
    loadUI();
    draw();
  })
  .catch((e) => {
    restoring = false;
    for (const panel of startupPanels) panel.inert = false;
    loadUI();
    toast(T("Não foi possível restaurar o projeto: ") + e.message);
  });
