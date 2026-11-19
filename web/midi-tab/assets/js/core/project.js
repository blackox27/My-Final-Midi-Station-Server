"use strict";
function projectConfig() {
  return {
    track: $("track").value,
    preset: $("preset").value,
    tuning: $("tuning").value,
    frets: Number($("frets").value),
    transpose: Number($("transpose").value),
    quant: Number($("quant").value),
    start: $("start").value,
    density: $("density").value,
    title: $("title").value,
    tempoMode: tempoSettings.mode,
    bpm: tempoSettings.bpm,
    speed: Number($("speed").value),
    targetVoice,
    soundMode: $("soundMode").value,
    sampleRoot: customRoot,
    accompaniment: $("accompaniment").checked,
    masterVolume: Number($("volume").value),
    selectedVolume: Number($("selectedVolume").value),
    backingVolume: Number($("backingVolume").value),
  };
}
function projectDocument() {
  return {
    type: "MIDI-Tab-Studio",
    version: 3,
    filename,
    midi,
    config: projectConfig(),
    positions: result.map((n) => ({ id: n.id, s: n.s, f: n.f })),
  };
}
function saveProject() {
  if (!midi || !result.length) {
    setStatus(t("noProject"), true);
    return;
  }
  if (midi.tracks.reduce((n, tr) => n + tr.notes.length, 0) > 200000) {
    setStatus(t("projectTooLarge"), true);
    return;
  }
  const blob = new Blob([JSON.stringify(projectDocument())], {
    type: "application/json",
  });
  if (blob.size > 16 * 1024 * 1024) {
    setStatus(t("projectTooLarge"), true);
    return;
  }
  download(blob, safeName() + ".miditab");
  setStatus(t("projectSaved"));
}
function validateProject(doc) {
  const fail = () => {
      throw Error(t("projectInvalid"));
    },
    int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max,
    num = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  if (
    !doc ||
    doc.type !== "MIDI-Tab-Studio" ||
    doc.version !== 3 ||
    !doc.midi ||
    !doc.config ||
    !Array.isArray(doc.positions)
  )
    fail();
  const m = doc.midi,
    c = doc.config;
  if (
    !int(m.ppq, 1, 32767) ||
    !int(m.format, 0, 1) ||
    !Array.isArray(m.tracks) ||
    m.tracks.length < 1 ||
    m.tracks.length > 1024 ||
    !Array.isArray(m.tempos) ||
    !m.tempos.length ||
    m.tempos.length > 20000 ||
    !Array.isArray(m.sigs) ||
    !m.sigs.length ||
    m.sigs.length > 4000
  )
    fail();
  let count = 0;
  const tracks = m.tracks.map((tr, ti) => {
    if (
      !tr ||
      typeof tr.name !== "string" ||
      tr.name.length > 256 ||
      !Array.isArray(tr.notes)
    )
      fail();
    count += tr.notes.length;
    if (count > 200000) fail();
    const notes = tr.notes.map((n) => {
      if (
        !n ||
        !int(n.pitch, 0, 127) ||
        !int(n.velocity, 1, 127) ||
        !int(n.ch, 0, 15) ||
        !num(n.start, 0, 1e12) ||
        !num(n.end, 0, 1e12) ||
        n.end <= n.start ||
        !int(n.program ?? 0, 0, 127)
      )
        fail();
      return {
        pitch: n.pitch,
        velocity: n.velocity,
        ch: n.ch,
        start: n.start,
        end: n.end,
        track: ti,
        program: n.program ?? 0,
      };
    });
    return { name: tr.name, notes, bend: !!tr.bend, programs: {} };
  });
  function ordered(list, map) {
    let last = -1;
    return list.map((x) => {
      if (!x || !num(x.tick, 0, 1e12) || x.tick <= last) fail();
      last = x.tick;
      return map(x);
    });
  }
  const tempos = ordered(m.tempos, (x) => {
      if (!num(x.us, 0.1, 16777215)) fail();
      return { tick: x.tick, us: x.us };
    }),
    sigs = ordered(m.sigs, (x) => {
      if (!int(x.num, 1, 255) || ![1, 2, 4, 8, 16, 32, 64].includes(x.den))
        fail();
      return { tick: x.tick, num: x.num, den: x.den };
    });
  if (tempos[0].tick !== 0 || sigs[0].tick !== 0) fail();
  if (
    typeof c.track !== "string" ||
    !(c.track === "all" || /^\d+:\d+$/.test(c.track)) ||
    typeof c.tuning !== "string" ||
    c.tuning.length > 160 ||
    !int(c.frets, 1, 36) ||
    !int(c.transpose, -48, 48) ||
    ![0, 1, 0.5, 0.25, 0.125, 1 / 3].some(
      (q) => Math.abs(q - c.quant) < 1e-12,
    ) ||
    !["0", "1"].includes(c.start) ||
    !["130", "180", "260"].includes(c.density) ||
    typeof c.title !== "string" ||
    c.title.length > 100 ||
    !["original", "fixed"].includes(c.tempoMode) ||
    !num(c.bpm, 20, 400) ||
    !int(c.speed, 25, 200) ||
    c.speed % 5 !== 0 ||
    !int(c.sampleRoot ?? 60, 0, 127) ||
    (c.accompaniment !== undefined && typeof c.accompaniment !== "boolean") ||
    !int(c.masterVolume ?? 70, 0, 100) ||
    !int(c.selectedVolume ?? 100, 0, 100) ||
    !int(c.backingVolume ?? 60, 0, 100) ||
    !["target", "midi", "custom", "simple"].includes(c.soundMode) ||
    !["custom", ...INSTRUMENTS.map((i) => i.id)].includes(c.preset) ||
    !INSTRUMENTS.some((i) => i.voice === c.targetVoice)
  )
    fail();
  const tune = c.tuning
    .trim()
    .split(/[\s,;]+/)
    .map(parsePitch);
  if (tune.length < 3 || tune.length > 8 || tune.some((n) => n === null))
    fail();
  let src;
  if (c.track === "all")
    src = tracks.flatMap((t) => t.notes.filter((n) => n.ch !== 9));
  else {
    const [ti, ch] = c.track.split(":").map(Number);
    if (!tracks[ti] || !int(ch, 0, 15)) fail();
    src = tracks[ti].notes.filter((n) => n.ch === ch);
  }
  if (!src.length || src.length > 20000 || doc.positions.length !== src.length)
    fail();
  const seen = new Set(),
    perString = tune.map(() => []),
    off =
      c.start === "1"
        ? src.reduce((v, n) => Math.min(v, n.start), Infinity) / m.ppq
        : 0;
  for (const p of doc.positions) {
    if (
      !p ||
      !int(p.id, 0, src.length - 1) ||
      seen.has(p.id) ||
      !int(p.s, -1, tune.length - 1) ||
      !int(p.f, -1, c.frets)
    )
      fail();
    seen.add(p.id);
    if (p.s === -1) {
      if (p.f !== -1) fail();
      continue;
    }
    if (p.f < 0 || tune[p.s] + p.f !== src[p.id].pitch + c.transpose) fail();
    let start = src[p.id].start / m.ppq - off,
      end = src[p.id].end / m.ppq - off;
    if (c.quant) {
      start = Math.round(start / c.quant) * c.quant;
      end = Math.max(start + c.quant, Math.round(end / c.quant) * c.quant);
    }
    perString[p.s].push({ start, end });
  }
  for (const notes of perString) {
    notes.sort((a, b) => a.start - b.start);
    for (let i = 1; i < notes.length; i++)
      if (notes[i].start < notes[i - 1].end - 1e-7) fail();
  }
  const maxEnd = tracks.reduce(
    (v, tr) => tr.notes.reduce((end, n) => Math.max(end, n.end), v),
    0,
  );
  if (m.total !== undefined && !num(m.total, 0, 1e12)) fail();
  return {
    midi: {
      ppq: m.ppq,
      format: m.format,
      total: Math.max(maxEnd, m.total ?? maxEnd),
      tracks,
      tempos,
      sigs,
      warnings: Array.isArray(m.warnings)
        ? m.warnings
            .filter((s) => typeof s === "string")
            .slice(0, 20)
            .map((s) => s.slice(0, 500))
        : [],
    },
    config: c,
    positions: doc.positions,
    filename:
      typeof doc.filename === "string" ? doc.filename.slice(0, 100) : c.title,
  };
}
async function loadProject(file) {
  if (!file) return;
  const token = ++generation;
  sampleGeneration++;
  cancelParsing();
  cancelConversion();
  stopAudio();
  actionButtons(false);
  try {
    if (file.size > 16 * 1024 * 1024) throw Error(t("projectInvalid"));
    const text = await file.text();
    if (token !== generation) return;
    let doc;
    try {
      doc = validateProject(JSON.parse(text));
    } catch {
      throw Error(t("projectInvalid"));
    }
    const c = doc.config;
    for (const id of [
      "tuning",
      "frets",
      "transpose",
      "quant",
      "start",
      "density",
      "speed",
    ])
      $(id).value = c[id];
    $("preset").value = c.preset;
    targetVoice = c.targetVoice;
    customSample = null;
    customRoot = c.sampleRoot ?? 60;
    $("sampleRoot").value = noteName(customRoot);
    tempoSettings = { mode: c.tempoMode, bpm: c.bpm };
    $("tempoMode").value = c.tempoMode;
    $("bpm").value = c.bpm;
    $("bpm").disabled = c.tempoMode !== "fixed";
    $("soundMode").value = c.soundMode;
    $("accompaniment").checked = !!c.accompaniment;
    $("volume").value = c.masterVolume ?? 70;
    $("selectedVolume").value = c.selectedVolume ?? 100;
    $("backingVolume").value = c.backingVolume ?? 60;
    updateAccompanimentUI();
    await populate(doc.midi, doc.filename, c.track);
    if (token !== generation || !result.length) return;
    const positions = new Map(doc.positions.map((p) => [p.id, p]));
    for (const n of result) {
      const p = positions.get(n.id);
      n.s = p.s;
      n.f = p.f;
    }
    $("title").value = c.title;
    buildScoreIndex();
    rebuildTimeline();
    render();
    report();
    pendingProjectRoot = customRoot;
    updateInstrumentHint();
    updateSoundHint();
    actionButtons(true);
    setStatus(t("projectLoaded"));
  } catch (e) {
    if (token === generation) {
      setStatus(e.message, true);
      if (pages.length) actionButtons(true);
    }
  } finally {
    if (token === generation) $("projectFile").value = "";
  }
}
