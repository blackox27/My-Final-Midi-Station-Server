class TempoTimeline {
  constructor(tempos, ppq, off = 0) {
    this.segments = tempos.map((t) => ({
      beat: t.tick / ppq,
      spb: t.us / 1000000,
      sec: 0,
    }));
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1],
        cur = this.segments[i];
      cur.sec = prev.sec + (cur.beat - prev.beat) * prev.spb;
    }
    this.offset = off;
    this.zero = this.absolute(off);
  }
  segment(value, key) {
    let lo = 0,
      hi = this.segments.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (this.segments[m][key] <= value) lo = m + 1;
      else hi = m - 1;
    }
    return this.segments[Math.max(0, hi)];
  }
  absolute(beat) {
    const s = this.segment(beat, "beat");
    return s.sec + (beat - s.beat) * s.spb;
  }
  seconds(beat) {
    return this.absolute(beat + this.offset) - this.zero;
  }
  beat(sec) {
    const val = sec + this.zero,
      s = this.segment(val, "sec");
    return s.beat + (val - s.sec) / s.spb - this.offset;
  }
  bpm(beat) {
    return 60 / this.segment(beat + this.offset, "beat").spb;
  }
}
let tempoSettings = { mode: "original", bpm: 120 };
let timeline = null,
  playEvents = [],
  metroEvents = [],
  transport = {
    state: "stopped",
    pos: 0,
    anchor: 0,
    startClock: 0,
    speed: 1,
    total: 0,
  },
  audioMaster = null,
  playToken = 0,
  raf = null,
  scoreEnd = 0,
  playbackZeroSec = 0;
function scoreTempos() {
  if (tempoSettings.mode === "fixed")
    return [{ tick: 0, us: 60000000 / tempoSettings.bpm }];
  return midi.tempos;
}
function beatSeconds(beat) {
  return timeline ? timeline.seconds(beat) : 0;
}
function playbackSeconds(beat) {
  return timeline ? timeline.seconds(beat) - playbackZeroSec : 0;
}
function playbackBeat(seconds) {
  return timeline ? timeline.beat(seconds + playbackZeroSec) : 0;
}
function rebuildTimeline() {
  if (!midi || !result.length) {
    timeline = null;
    playEvents = [];
    metroEvents = [];
    scoreEnd = 0;
    playbackZeroSec = 0;
    transport.total = 0;
    transport.pos = 0;
    refreshTransport();
    return;
  }
  const nextTimeline = new TempoTimeline(scoreTempos(), midi.ppq, offset),
    full = $("accompaniment").checked;
  const arrangement = createArrangement(
      midi,
      result,
      $("track").value,
      offset,
      full,
    ),
    zero = nextTimeline.seconds(arrangement.startBeat);
  const nextEvents = arrangement.events.map((n) => ({
    ...n,
    secs: nextTimeline.seconds(n.start) - zero,
    endSecs: nextTimeline.seconds(n.end) - zero,
  }));
  const nextEnd = result.reduce((v, n) => Math.max(v, n.end), 0),
    nextMetro = [];
  const metroBars = full
    ? makeBars(arrangement.endBeat + offset, midi.sigs, midi.ppq, 0)
    : bars;
  for (const bar of metroBars)
    for (
      let beat = bar.start, k = 0;
      beat <
      Math.min(bar.end, full ? arrangement.endBeat + offset : nextEnd) - 1e-7;
      beat += 4 / bar.den, k++
    ) {
      if (nextMetro.length >= 100000)
        throw Error("O metrônomo excede 100.000 pulsos. Recorte o MIDI.");
      const relativeBeat = full ? beat - offset : beat,
        sec = nextTimeline.seconds(relativeBeat) - zero;
      nextMetro.push({ secs: sec, endSecs: sec + 0.045, accent: k === 0 });
    }
  timeline = nextTimeline;
  playbackZeroSec = zero;
  playEvents = nextEvents;
  metroEvents = nextMetro;
  scoreEnd = nextEnd;
  transport.total = nextTimeline.seconds(arrangement.endBeat) - zero;
  transport.pos = Math.max(0, Math.min(transport.pos, transport.total));
  refreshTransport();
}
function updateAccompanimentUI() {
  const full = $("accompaniment").checked;
  $("backingVolume").disabled = !full;
  $("selectedVolumeLabel").textContent = $("selectedVolume").value + "%";
  $("backingVolumeLabel").textContent = $("backingVolume").value + "%";
  $("accompanimentHint").textContent = t(
    full
      ? $("track").value === "all"
        ? "accompanimentAll"
        : "accompanimentFull"
      : "accompanimentSolo",
  );
}
function changeAccompaniment() {
  const pos = playbackPosition(),
    beat = playbackBeat(pos),
    running = transport.state === "playing",
    oldState = transport.state,
    desired = $("accompaniment").checked,
    oldMode = $("soundMode").value;
  pauseAudio();
  if (desired) $("soundMode").value = "target";
  if (midi && !result.length && !document.body.classList.contains("busy")) {
    updateAccompanimentUI();
    updateSoundHint();
    convert();
    return;
  }
  try {
    rebuildTimeline();
    transport.pos =
      oldState === "stopped"
        ? 0
        : Math.max(0, Math.min(transport.total, playbackSeconds(beat)));
    transport.state = oldState === "stopped" ? "stopped" : "paused";
    updateAccompanimentUI();
    updateSoundHint();
    refreshTransport();
    if (running) startAudio();
  } catch (e) {
    $("accompaniment").checked = !desired;
    $("soundMode").value = oldMode;
    rebuildTimeline();
    transport.pos =
      oldState === "stopped"
        ? 0
        : Math.max(0, Math.min(transport.total, playbackSeconds(beat)));
    transport.state = oldState === "stopped" ? "stopped" : "paused";
    updateAccompanimentUI();
    updateSoundHint();
    refreshTransport();
    setStatus(e.message, true);
    if (running) startAudio();
  }
}
function playbackPosition() {
  return transport.state === "playing" && audio
    ? Math.min(
        transport.total,
        transport.anchor +
          Math.max(0, audio.currentTime - transport.startClock) *
            transport.speed,
      )
    : transport.pos;
}
function formatClock(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60),
    s = Math.floor(sec % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function refreshTransport() {
  const pos = playbackPosition(),
    speed =
      transport.state === "playing"
        ? transport.speed
        : Number($("speed").value) / 100;
  $("rateLabel").textContent =
    speed.toFixed(2).replace(".", language === "en" ? "." : ",") + "×";
  $("volumeLabel").textContent = $("volume").value + "%";
  $("clock").textContent =
    formatClock(pos / speed) + " / " + formatClock(transport.total / speed);
  $("seek").value = transport.total
    ? Math.round((pos / transport.total) * 1000)
    : 0;
  $("currentBpm").textContent = timeline
    ? Math.round(timeline.bpm(playbackBeat(pos)) * speed) + " BPM"
    : "— BPM";
  $("play").textContent = t(
    transport.state === "playing"
      ? "pause"
      : transport.state === "paused"
        ? "resume"
        : "play",
  );
  paintPlayback(playbackBeat(pos));
}
function clearAudio() {
  playToken++;
  playing = false;
  clearTimeout(auditionTimer);
  auditionTimer = null;
  clearInterval(timer);
  timer = null;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  for (const node of audioNodes) {
    try {
      node.osc.stop();
    } catch {}
    try {
      node.osc.disconnect();
      node.gain.disconnect();
    } catch {}
  }
  audioNodes = [];
  if (audioMaster) {
    audioMaster._selected?.disconnect();
    audioMaster._backing?.disconnect();
    audioMaster.disconnect();
    audioMaster._limiter?.disconnect();
    audioMaster = null;
  }
}
function stopAudio() {
  clearAudio();
  transport.state = "stopped";
  transport.pos = 0;
  refreshTransport();
}
function pauseAudio() {
  if (transport.state === "playing") transport.pos = playbackPosition();
  clearAudio();
  transport.state = "paused";
  refreshTransport();
}
function seekBeat(beat) {
  if (!timeline) return;
  const running = transport.state === "playing";
  clearAudio();
  transport.pos = Math.max(0, Math.min(transport.total, playbackSeconds(beat)));
  transport.state = "paused";
  refreshTransport();
  if (running) startAudio();
}
async function startAudio() {
  if (!timeline || !result.length || !pages.length) return;
  clearAudio();
  const token = ++playToken;
  try {
    ensureAudio();
    await audio.resume();
    await preparePlayback();
    if (token !== playToken) return;
    if (transport.pos >= transport.total - 1e-6) transport.pos = 0;
    const pos = transport.pos,
      speed = Number($("speed").value) / 100,
      origin = audio.currentTime + 0.04;
    transport.anchor = pos;
    transport.startClock = origin;
    transport.speed = speed;
    transport.state = "playing";
    playing = true;
    const master = makeMaster();
    audioMaster = master;
    let i = 0,
      mi = 0;
    while (i < playEvents.length && playEvents[i].endSecs <= pos) i++;
    while (mi < metroEvents.length && metroEvents[mi].secs < pos - 1e-7) mi++;
    const schedule = () => {
      if (token !== playToken) return;
      const current = playbackPosition(),
        horizon = current + 0.12 * speed;
      audioNodes = audioNodes.filter((n) => !n.done);
      while (i < playEvents.length && playEvents[i].secs <= horizon) {
        const n = playEvents[i++];
        if (n.pitch >= 0 && n.pitch <= 127 && n.endSecs > current)
          scheduleTone(n, origin, pos, speed, master);
      }
      while (mi < metroEvents.length && metroEvents[mi].secs <= horizon) {
        const n = metroEvents[mi++];
        if ($("metro").checked && n.secs >= current - 0.01)
          scheduleTone(n, origin, pos, speed, master, true);
      }
      if (current >= transport.total && i >= playEvents.length) {
        clearAudio();
        transport.pos = transport.total;
        transport.state = "paused";
        refreshTransport();
      }
    };
    schedule();
    if (token !== playToken) return;
    timer = setInterval(schedule, 25);
    let lastFrame = 0;
    const frame = (stamp) => {
      if (token !== playToken) return;
      if (!lastFrame || stamp - lastFrame >= 30) {
        refreshTransport();
        lastFrame = stamp;
      }
      raf = requestAnimationFrame(frame);
    };
    frame(0);
  } catch (e) {
    if (token !== playToken) return;
    clearAudio();
    transport.state = "paused";
    refreshTransport();
    setStatus(t("audioFailed") + localizeError(e.message), true);
  }
}
function play() {
  if (transport.state === "playing") pauseAudio();
  else startAudio();
}
function changeTiming(redraw = false) {
  const pos = playbackPosition(),
    beat = playbackBeat(pos),
    running = transport.state === "playing",
    oldState = transport.state;
  clearAudio();
  transport.state = "paused";
  rebuildTimeline();
  transport.pos = timeline
    ? Math.max(0, Math.min(transport.total, playbackSeconds(beat)))
    : 0;
  transport.state = oldState === "stopped" ? "stopped" : "paused";
  if (redraw && pages.length) {
    render();
    report();
  }
  refreshTransport();
  if (running) startAudio();
}
