function chosenSource() {
  let v = $("track").value;
  if (v === "all")
    return midi.tracks.flatMap((t) => t.notes.filter((n) => n.ch !== 9));
  let [ti, ch] = v.split(":").map(Number);
  return midi.tracks[ti].notes.filter((n) => n.ch === ch);
}
function setStatus(s, error = false) {
  lastStatus = { text: s, error };
  $("status").textContent = localizeError(s);
  $("status").classList.toggle("error", error);
}
function actionButtons(enabled) {
  for (const id of ["play", "stop", "seek", "pdf", "png", "saveProject"])
    $(id).disabled = !enabled || (id === "pdf" && exportInProgress);
}
function cancelConversion() {
  conversionToken++;
  if (pendingAssignReject) {
    const reject = pendingAssignReject;
    pendingAssignReject = null;
    reject(Error("cancelled"));
  }
  if (assignmentWorker) {
    assignmentWorker.terminate();
    assignmentWorker = null;
  }
  document.body.classList.remove("busy");
  $("convert").textContent = t("generate");
}
function populate(data, title, desiredTrack = null) {
  const entries = [];
  data.tracks.forEach((t, ti) => {
    let counts = new Map();
    for (const n of t.notes) counts.set(n.ch, (counts.get(n.ch) || 0) + 1);
    for (const [ch, n] of [...counts].sort((a, b) => a[0] - b[0]))
      entries.push({ ti, ch, n, name: t.name });
  });
  if (!entries.length) throw Error("O MIDI não contém notas.");
  cancelConversion();
  pendingProjectRoot = null;
  midi = data;
  sourceMidiFile = null;
  filename = title.replace(/\.(mid|midi)$/i, "").slice(0, 100);
  $("title").value = filename;
  $("loadedName").removeAttribute("data-i18n");
  $("loadedName").textContent = title;
  const sel = $("track");
  sel.replaceChildren();
  for (const e of entries) {
    let op = document.createElement("option");
    op.value = e.ti + ":" + e.ch;
    op.textContent =
      e.name +
      " · " +
      t("channel") +
      " " +
      (e.ch + 1) +
      (e.ch === 9 ? " (" + t("percussion") + ")" : "") +
      " · " +
      t("nNotes", { n: e.n });
    sel.append(op);
  }
  if (entries.length > 1) {
    let op = document.createElement("option");
    op.value = "all";
    op.textContent = t("allTracks");
    sel.append(op);
  }
  sel.disabled = false;
  $("convert").disabled = false;
  const melodic = entries.find((e) => e.ch !== 9);
  if (melodic) sel.value = melodic.ti + ":" + melodic.ch;
  if (
    desiredTrack !== null &&
    [...sel.options].some((o) => o.value === desiredTrack)
  )
    sel.value = desiredTrack;
  return convert();
}
async function load(file, propagateError = false) {
  if (!file) return;
  const g = ++generation;
  cancelParsing();
  cancelConversion();
  stopAudio();
  actionButtons(false);
  $("track").disabled = true;
  try {
    if (file.size > 32 * 1024 * 1024) throw Error("Limite de arquivo: 32 MB.");
    setStatus(t("loading", { name: file.name }));
    const buf = await file.arrayBuffer();
    if (g !== generation) { if (propagateError) throw Error("Importação cancelada por outra ação."); return; }
    const parsed = await parseAsync(buf);
    if (g !== generation) { if (propagateError) throw Error("Importação cancelada por outra ação."); return; }
    await populate(parsed, file.name);
    if(g === generation) sourceMidiFile = file;
    if (propagateError && (!pages.length || !result.length || g !== generation)) throw Error(lastStatus.text || "Conversão cancelada.");
  } catch (e) {
    if (g === generation) {
      setStatus(e.message + (midi ? t("oldAvailable") : ""), true);
      if (midi) {
        $("track").disabled = false;
        actionButtons(pages.length > 0);
      }
    }
    if (propagateError) throw e;
  } finally {
    if (g === generation) $("file").value = "";
  }
}
async function convert() {
  if (!midi) return;
  cancelConversion();
  const token = conversionToken;
  stopAudio();
  actionButtons(false);
  document.body.classList.add("busy");
  $("convert").textContent = t("calculating");
  releaseScoreCanvases();
  result = [];
  bars = [];
  pages = [];
  pageCommands = [];
  geometry = [];
  scoreIndex = [];
  $("pages").replaceChildren();
  for (const id of ["statnotes", "statbars", "statplaced"])
    $(id).textContent = "—";
  rebuildTimeline();
  try {
    const tune = getTuning(),
      max = Number($("frets").value),
      tr = Number($("transpose").value);
    if (
      $("frets").value === "" ||
      $("transpose").value === "" ||
      !Number.isInteger(max) ||
      max < 1 ||
      max > 36 ||
      !Number.isInteger(tr) ||
      Math.abs(tr) > 48
    )
      throw Error("Use 1–36 casas e transposição de −48 a +48 semitons.");
    const src = chosenSource();
    if (!src.length) throw Error("A seleção não contém notas melódicas.");
    if (src.length > 20000)
      throw Error(
        "Limite de conversão: 20.000 notas por seleção. Recorte a pista.",
      );
    const off =
        $("start").value === "1"
          ? src.reduce((v, n) => Math.min(v, n.start), Infinity) / midi.ppq
          : 0,
      q = Number($("quant").value);
    const ns = src
      .map((n, i) => {
        let start = n.start / midi.ppq - off,
          end = n.end / midi.ppq - off;
        if (q) {
          start = Math.round(start / q) * q;
          end = Math.max(start + q, Math.round(end / q) * q);
        }
        return { ...n, id: i, start, end, pitch: n.pitch + tr };
      })
      .sort((a, b) => a.start - b.start || b.pitch - a.pitch);
    const b = makeBars(
      ns.reduce((v, n) => Math.max(v, n.end), 0),
      midi.sigs,
      midi.ppq,
      off,
    );
    setStatus(t("finding", { n: ns.length }));
    const assigned = await assignAsync(ns, tune, max);
    if (token !== conversionToken) return;
    tuning = tune;
    source = src;
    offset = off;
    result = assigned;
    bars = b;
    selected = null;
    editHistory = [];
    $("undo").disabled = true;
    $("edit").classList.remove("visible");
    buildScoreIndex();
    rebuildTimeline();
    render();
    report();
    updateSoundHint();
    updateAccompanimentUI();
    actionButtons(true);
  } catch (e) {
    if (token !== conversionToken) return;
    $("pages").replaceChildren();
    pages = [];
    pageCommands = [];
    result = [];
    setStatus(e.message, true);
    rebuildTimeline();
  } finally {
    if (token === conversionToken) {
      document.body.classList.remove("busy");
      $("convert").textContent = t("generate");
    }
  }
}
function report() {
  const lost = result.filter((n) => n.s < 0),
    wide = scoreIndex.filter((b) => b.hi - b.lo > 7).length;
  let msg = t("summary", {
    n: result.length,
    placed: result.length - lost.length,
    bars: bars.length,
  });
  if (lost.length) msg += "\n" + t("lost", { n: lost.length });
  if (wide) msg += "\n" + t("largeShifts");
  const sourceTracks = new Set(source.map((n) => n.track));
  if ([...sourceTracks].some((i) => midi.tracks[i].bend))
    msg += "\n" + t("bendWarning");
  if (source.some((n) => n.ch === 9)) msg += "\n" + t("drumWarning");
  if (midi.warnings.length)
    msg += "\n" + midi.warnings.map(localizeError).join(" ");
  setStatus(msg, !!lost.length);
  $("meta").replaceChildren();
  for (const txt of [
    filename,
    instrumentName(),
    t("nStrings", { n: tuning.length }),
    tuning.map(noteName).join(" · "),
    $("quant").selectedOptions[0].textContent,
  ]) {
    const el = document.createElement("span");
    el.className = "pill";
    el.textContent = txt;
    $("meta").append(el);
  }
  $("statnotes").textContent = result.length;
  $("statbars").textContent = bars.length;
  $("statplaced").textContent = result.length
    ? Math.round(((result.length - lost.length) / result.length) * 100) + "%"
    : "—";
}
function refreshTrackLabels() {
  if (!midi) return;
  const val = $("track").value;
  for (const op of $("track").options) {
    if (op.value === "all") {
      op.textContent = t("allTracks");
      continue;
    }
    const [ti, ch] = op.value.split(":").map(Number),
      tr = midi.tracks[ti],
      count = tr.notes.filter((n) => n.ch === ch).length;
    op.textContent =
      tr.name +
      " · " +
      t("channel") +
      " " +
      (ch + 1) +
      (ch === 9 ? " (" + t("percussion") + ")" : "") +
      " · " +
      t("nNotes", { n: count });
  }
  $("track").value = val;
}
