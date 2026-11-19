"use strict";
function preservePlayback(change) {
  const running = transport.state === "playing";
  if (running) pauseAudio();
  change();
  updateSoundHint();
  if (running) startAudio();
}
function applyPreferences() {
  language = prefGet("language", "pt-BR") === "en" ? "en" : "pt-BR";
  theme = prefGet("theme", "dark") === "light" ? "light" : "dark";
  $("animate").checked = prefGet("animate", "true") === "true";
  $("follow").checked = prefGet("follow", "true") === "true";
  applyLabels();
  updateAccompanimentUI();
  populateInstruments();
  drawLiveStrings();
  updateSoundHint();
}
function changeLanguage() {
  language = $("language").value === "en" ? "en" : "pt-BR";
  prefSet("language", language);
  applyLabels();
  updateAccompanimentUI();
  populateInstruments();
  refreshTrackLabels();
  if (result.length && pages.length) {
    render();
    report();
  } else if (lastStatus.text) setStatus(lastStatus.text, lastStatus.error);
  if (document.body.classList.contains("busy"))
    $("convert").textContent = t("calculating");
  updateSoundHint();
  if (selected !== null) {
    selected = null;
    $("edit").classList.remove("visible");
  }
  refreshTransport();
}
function applyPosition() {
  const n = result.find((n) => n.id === selected),
    s = Number($("positions").value);
  if (!n) return;
  if (
    s >= 0 &&
    result.some(
      (o) =>
        o.id !== n.id &&
        o.s === s &&
        o.start < n.end - 1e-7 &&
        o.end > n.start + 1e-7,
    )
  ) {
    setStatus(t("occupied"), true);
    return;
  }
  editHistory.push({ id: n.id, s: n.s, f: n.f });
  if (editHistory.length > 100) editHistory.shift();
  n.s = s;
  n.f = s < 0 ? -1 : n.pitch - tuning[s];
  selected = null;
  $("edit").classList.remove("visible");
  $("undo").disabled = false;
  try {
    buildScoreIndex();
    refreshScore();
  } catch (e) {
    setStatus(e.message, true);
  }
}
function undoPosition() {
  const item = editHistory.pop();
  if (!item) return;
  const n = result.find((n) => n.id === item.id);
  if (n) {
    n.s = item.s;
    n.f = item.f;
    buildScoreIndex();
    refreshScore();
  }
  $("undo").disabled = !editHistory.length;
}
$("language").onchange = changeLanguage;
$("theme").onchange = () => {
  theme = $("theme").value === "light" ? "light" : "dark";
  prefSet("theme", theme);
  applyLabels();
  updateAccompanimentUI();
  if (result.length) report();
  refreshTransport();
};
$("choose").onclick = () => $("file").click();
$("file").onchange = (e) => load(e.target.files[0]);
$("drop").ondragover = (e) => {
  e.preventDefault();
  $("drop").classList.add("over");
};
$("drop").ondragleave = () => $("drop").classList.remove("over");
$("drop").ondrop = (e) => {
  e.preventDefault();
  $("drop").classList.remove("over");
  load(e.dataTransfer.files[0]);
};
$("convert").onclick = convert;
$("play").onclick = play;
$("stop").onclick = stopAudio;
$("track").onchange = convert;
$("preset").onchange = () => {
  const i = INSTRUMENTS.find((i) => i.id === $("preset").value);
  if (i) {
    targetVoice = i.voice;
    $("tuning").value = i.notes.map(noteName).join(" ");
    $("frets").value = i.frets;
  }
  updateInstrumentHint();
  updateSoundHint();
  if (midi) convert();
  else refreshTransport();
};
$("tuning").oninput = () => {
  $("preset").value = "custom";
  updateInstrumentHint();
};
for (const id of ["frets", "transpose", "quant", "start", "tuning"])
  $(id).addEventListener("change", () => {
    if (midi) convert();
  });
for (const id of ["density", "title"])
  $(id).addEventListener("change", () => {
    if (midi) refreshScore();
  });
$("seek").oninput = () => {
  if (timeline)
    seekBeat(playbackBeat((transport.total * Number($("seek").value)) / 1000));
};
$("speed").oninput = () => changeTiming();
$("volume").oninput = () => {
  if (audioMaster)
    audioMaster.gain.setTargetAtTime(
      ((Number($("volume").value) / 100) * 0.28) /
        Math.sqrt(Math.max(1, tuning.length)),
      audio.currentTime,
      0.02,
    );
  refreshTransport();
};
$("tempoMode").onchange = () => {
  tempoSettings.mode = $("tempoMode").value;
  $("bpm").disabled = tempoSettings.mode !== "fixed";
  changeTiming(true);
};
$("bpm").onchange = () => {
  const value = Number($("bpm").value);
  if (!Number.isFinite(value) || value < 20 || value > 400) {
    $("bpm").value = tempoSettings.bpm;
    setStatus(t("bpmInvalid"), true);
    return;
  }
  tempoSettings.bpm = value;
  changeTiming(true);
};
$("accompaniment").onchange = changeAccompaniment;
for (const [id, route] of [
  ["selectedVolume", "_selected"],
  ["backingVolume", "_backing"],
])
  $(id).oninput = () => {
    if (audioMaster?.[route])
      audioMaster[route].gain.setTargetAtTime(
        Number($(id).value) / 100,
        audio.currentTime,
        0.02,
      );
    updateAccompanimentUI();
  };
$("metro").onchange = () => {
  if (transport.state === "playing") {
    pauseAudio();
    startAudio();
  }
};
$("animate").onchange = () => {
  prefSet("animate", $("animate").checked);
  refreshTransport();
};
$("follow").onchange = () => prefSet("follow", $("follow").checked);
$("soundMode").onchange = () => preservePlayback(() => {});
$("chooseSample").onclick = () => $("sampleFile").click();
$("sampleFile").onchange = (e) => importSample(e.target.files[0]);
$("sampleRoot").onchange = () => {
  const n = parsePitch($("sampleRoot").value);
  if (n === null) {
    $("sampleRoot").value = noteName(customRoot);
    setStatus(t("rootInvalid"), true);
    return;
  }
  preservePlayback(() => {
    pendingProjectRoot = null;
    customRoot = n;
    $("sampleRoot").value = noteName(n);
  });
};
$("audition").onclick = audition;
$("apply").onclick = applyPosition;
$("cancel").onclick = () => {
  selected = null;
  $("edit").classList.remove("visible");
};
$("undo").onclick = undoPosition;
$("saveProject").onclick = saveProject;
$("openProject").onclick = () => $("projectFile").click();
$("projectFile").onchange = (e) => loadProject(e.target.files[0]);
$("demo").onclick = () => {
  generation++;
  cancelParsing();
  const ppq = 480,
    notes = [];
  const melody = [
    64, 67, 69, 67, 64, 62, 60, 62, 64, 67, 72, 71, 69, 67, 64, 62,
  ];
  melody.forEach((pitch, i) =>
    notes.push({
      pitch,
      start: i * 240,
      end: i * 240 + 210,
      velocity: 92,
      ch: 0,
      track: 0,
      program: 24,
    }),
  );
  for (let j = 0; j < 4; j++)
    [40, 47, 52].forEach((pitch) =>
      notes.push({
        pitch,
        start: (j + 4) * 1920,
        end: (j + 4) * 1920 + 1440,
        velocity: 80,
        ch: 0,
        track: 0,
        program: 26,
      }),
    );
  populate(
    {
      ppq,
      format: 1,
      total: 15360,
      tracks: [
        {
          name: language === "en" ? "Guitar" : "Violão",
          notes,
          programs: { 0: 24 },
          bend: false,
        },
      ],
      tempos: [
        { tick: 0, us: 600000 },
        { tick: 7680, us: 500000 },
      ],
      sigs: [{ tick: 0, num: 4, den: 4 }],
      warnings: [],
    },
    language === "en" ? "A walk in E" : "Passeio em Mi",
  ).catch((e) => setStatus(e.message, true));
};
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(
      document.activeElement.tagName,
    ) &&
    !$("play").disabled
  ) {
    e.preventDefault();
    play();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && transport.state === "playing") pauseAudio();
});
window.addEventListener("beforeunload", () => {
  stopAudio();
  cancelParsing();
  cancelConversion();
});
window.addEventListener("resize", () => {
  refreshTransport();
});
applyPreferences();
$("frets").value = currentInstrument().frets;
setStatus(t("ready"));
refreshTransport();
