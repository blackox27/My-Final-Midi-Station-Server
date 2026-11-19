"use strict";
const decodedBanks = new Map(),
  generatedSamples = new Map();
let customSample = null,
  customRoot = 60,
  sampleGeneration = 0,
  pendingProjectRoot = null,
  auditionTimer = null;
function ensureAudio() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  return audio;
}
function parsePitch(value) {
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n <= 127) return n;
  }
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(s);
  if (!m) return null;
  const n =
    { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] +
    (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) +
    (Number(m[3]) + 1) * 12;
  return n >= 0 && n <= 127 ? n : null;
}
function recordedVoice(voice) {
  return Object.hasOwn(SAMPLE_BANK, voice);
}
function decodeBase64(s) {
  const raw = atob(s),
    bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
async function prepareBank(voice) {
  if (!recordedVoice(voice)) return;
  if (decodedBanks.has(voice)) return decodedBanks.get(voice);
  const promise = Promise.all(
    SAMPLE_BANK[voice].map(async (s) => ({
      root: s.root,
      buffer: await ensureAudio().decodeAudioData(decodeBase64(s.wav)),
    })),
  );
  decodedBanks.set(voice, promise);
  try {
    const bank = await promise;
    decodedBanks.set(voice, bank);
    return bank;
  } catch (e) {
    decodedBanks.delete(voice);
    throw e;
  }
}
async function preparePlayback() {
  const mode = $("soundMode").value;
  if (
    mode === "custom" &&
    !customSample &&
    Number($("selectedVolume").value) > 0
  )
    throw Error(t("needSample"));
  const voices = new Set();
  if (mode === "target") voices.add(targetVoice);
  for (const n of playEvents) {
    if (
      (n.role === "backing" || mode === "midi") &&
      !(n.role === "backing" && n.ch === 9)
    )
      voices.add(programVoice(n.program ?? 0));
  }
  await Promise.all([...voices].map(prepareBank));
  // Prepare the next scheduling window before starting the common audio clock.
  const now = transport.pos,
    horizon = now + 0.4 * (Number($("speed").value) / 100),
    warmed = new Set();
  for (const n of playEvents) {
    if (n.secs > horizon) break;
    if (n.endSecs <= now) continue;
    if (n.role === "backing" && n.ch === 9) {
      percussionSample(n.pitch);
      continue;
    }
    const partMode = n.role === "backing" ? "midi" : mode;
    if (partMode === "simple" || partMode === "custom") continue;
    const voice =
      partMode === "midi" ? programVoice(n.program ?? 0) : targetVoice;
    if (recordedVoice(voice)) continue;
    const key = voice + ":" + Math.round(n.pitch / 12);
    if (warmed.has(key)) continue;
    warmed.add(key);
    generatedSample(voice, n.pitch);
    if (warmed.size % 8 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    if (warmed.size >= 64) break;
  }
}
function generatedSample(voice, pitch) {
  const root = Math.max(12, Math.min(108, Math.round(pitch / 12) * 12)),
    key = voice + ":" + root;
  if (generatedSamples.has(key)) return generatedSamples.get(key);
  const sr = 22050,
    duration = voice === "banjo" ? 2.3 : 4,
    buffer = ensureAudio().createBuffer(1, Math.ceil(sr * duration), sr),
    data = buffer.getChannelData(0),
    freq = 440 * 2 ** ((root - 69) / 12),
    sustain = ["organ", "strings", "brass", "flute", "synth"].includes(voice);
  let peak = 0;
  const harmonics =
    voice === "flute" ? 3 : Math.min(18, Math.floor((sr * 0.45) / freq));
  // Oscillator recurrences avoid millions of sin/exp calls on the audio scheduling path.
  for (let h = 1; h <= harmonics; h++) {
    let amp =
      1 /
      h **
        (voice === "bass"
          ? 2
          : voice === "steel" || voice === "banjo"
            ? 1.1
            : voice === "piano"
              ? 1.8
              : 1.5);
    if (voice === "organ") amp = [0, 1, 0.35, 0.25, 0.1, 0.08][h] ?? 0;
    if (voice === "flute") amp = h === 1 ? 1 : 0.035 / h;
    if (voice === "bell") amp *= h % 2 ? 0.8 : 0.2;
    if (voice === "brass") amp *= h % 2 ? 1 : 0.5;
    if (!amp) continue;
    const f = voice === "bell" ? freq * h * (1 + 0.002 * h * h) : freq * h;
    if (f >= sr * 0.48) continue;
    const angle = (2 * Math.PI * f) / sr,
      sinStep = Math.sin(angle),
      cosStep = Math.cos(angle),
      fall = sustain
        ? 1
        : Math.exp(
            (-h *
              (voice === "banjo"
                ? 3
                : voice === "mandolin"
                  ? 1.8
                  : voice === "piano"
                    ? 0.6
                    : voice === "bass"
                      ? 0.55
                      : 1)) /
              sr,
          );
    let phaseSin = 0,
      phaseCos = 1,
      env = amp;
    for (let i = 0; i < data.length; i++) {
      data[i] += phaseSin * env;
      const nextSin = phaseSin * cosStep + phaseCos * sinStep;
      phaseCos = phaseCos * cosStep - phaseSin * sinStep;
      phaseSin = nextSin;
      env *= fall;
    }
  }
  for (let i = 0; i < data.length; i++) {
    const time = i / sr;
    data[i] *=
      Math.min(1, time / (sustain ? 0.035 : 0.004)) *
      Math.min(1, (duration - time) / 0.06);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0)
    for (let i = 0; i < data.length; i++) data[i] = (data[i] / peak) * 0.8;
  const entry = { root, buffer };
  if (generatedSamples.size >= 64)
    generatedSamples.delete(generatedSamples.keys().next().value);
  generatedSamples.set(key, entry);
  return entry;
}
function sampleForNote(n) {
  if (n.role === "backing" && n.ch === 9) return percussionSample(n.pitch);
  const mode = n.role === "backing" ? "midi" : $("soundMode").value;
  if (mode === "custom")
    return customSample
      ? { root: customRoot, buffer: customSample.buffer }
      : null;
  const voice = mode === "midi" ? programVoice(n.program ?? 0) : targetVoice,
    bank = decodedBanks.get(voice);
  if (Array.isArray(bank))
    return bank.reduce((a, b) =>
      Math.abs(b.root - n.pitch) < Math.abs(a.root - n.pitch) ? b : a,
    );
  return generatedSample(voice, n.pitch);
}
function makeMaster() {
  const ctx = ensureAudio(),
    master = ctx.createGain(),
    limiter = ctx.createDynamicsCompressor();
  master.gain.value =
    ((Number($("volume").value) / 100) * 0.28) /
    Math.sqrt(Math.max(1, tuning.length));
  limiter.threshold.value = -8;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  master._selected = ctx.createGain();
  master._selected.gain.value = Number($("selectedVolume").value) / 100;
  master._selected.connect(master);
  master._backing = ctx.createGain();
  master._backing.gain.value = Number($("backingVolume").value) / 100;
  master._backing.connect(master);
  master._limiter = limiter;
  return master;
}
function scheduleTone(n, origin, pos, speed, master, click = false) {
  if (n.endSecs <= pos + 1e-7) return;
  const ctx = ensureAudio(),
    nominal = origin + (n.secs - pos) / speed,
    start = Math.max(ctx.currentTime, nominal),
    remaining = (n.endSecs - pos) / speed - (start - origin);
  if (remaining <= 0) return;
  const duration = Math.max(0.008, remaining),
    gain = ctx.createGain();
  let osc,
    bufferOffset = 0,
    life = duration;
  if (click || (n.role !== "backing" && $("soundMode").value === "simple")) {
    osc = ctx.createOscillator();
    osc.type = click ? "sine" : "triangle";
    osc.frequency.value = click
      ? n.accent
        ? 1500
        : 1000
      : 440 * 2 ** ((n.pitch - 69) / 12);
  } else {
    const sample = sampleForNote(n);
    if (!sample) return;
    const rate = sample.unpitched ? 1 : 2 ** ((n.pitch - sample.root) / 12);
    bufferOffset = Math.max(0, start - nominal) * rate;
    if (bufferOffset >= sample.buffer.duration) return;
    life = Math.min(duration, (sample.buffer.duration - bufferOffset) / rate);
    osc = ctx.createBufferSource();
    osc.buffer = sample.buffer;
    osc.playbackRate.value = rate;
  }
  const peak = click ? 0.2 : Math.max(0.001, n.velocity / 127) * 0.8,
    attack = Math.min(0.006, life / 4),
    release = Math.min(0.04, life / 3);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, start + Math.max(attack, life - release));
  gain.gain.linearRampToValueAtTime(0, start + life);
  osc.connect(gain);
  gain.connect(
    click
      ? master
      : n.role === "backing"
        ? (master._backing ?? master)
        : (master._selected ?? master),
  );
  // Bound polyphony and drop finished entries, including audition nodes.
  audioNodes = audioNodes.filter((v) => !v.done);
  if (audioNodes.length >= 128) {
    const backing = audioNodes.findIndex((v) => v.role === "backing");
    if (n.role === "backing" && backing < 0) {
      osc.disconnect();
      gain.disconnect();
      return;
    }
    const old = audioNodes.splice(backing >= 0 ? backing : 0, 1)[0];
    try {
      old.osc.stop();
      old.osc.disconnect();
      old.gain.disconnect();
    } catch {}
    old.done = true;
  }
  const node = {
    osc,
    gain,
    done: false,
    role: click ? "metronome" : (n.role ?? "selected"),
    pitch: n.pitch,
    program: n.program ?? 0,
  };
  osc.onended = () => {
    node.done = true;
    osc.disconnect();
    gain.disconnect();
  };
  audioNodes.push(node);
  if (osc.buffer) osc.start(start, bufferOffset);
  else osc.start(start);
  osc.stop(start + life + 0.006);
}
function updateSoundHint() {
  const mode = $("soundMode").value;
  if (mode === "target")
    $("soundHint").textContent = t(
      recordedVoice(targetVoice) ? "targetRecorded" : "targetSynth",
      { instrument: instrumentName() },
    );
  else if (mode === "midi") {
    const programs = [...new Set(result.map((n) => n.program ?? 0))];
    $("soundHint").textContent = t("midiSound", {
      names: programs.length
        ? programs
            .slice(0, 5)
            .map((p) => "GM " + (p + 1) + " " + GM_NAMES[p])
            .join(", ")
        : "—",
    });
  } else
    $("soundHint").textContent = t(
      mode === "custom"
        ? customSample
          ? "customSound"
          : "needSample"
        : "simpleSound",
      { root: noteName(customRoot) },
    );
  $("sampleInfo").textContent = customSample
    ? t("sampleHelp", {
        name: customSample.name,
        seconds: customSample.buffer.duration.toFixed(2),
        root: noteName(customRoot),
      })
    : t("noSample");
}
async function importSample(file) {
  if (!file) return;
  const token = ++sampleGeneration,
    rootAtStart = customRoot;
  pauseAudio();
  try {
    if (file.size > 16 * 1024 * 1024) throw Error(t("sampleInvalid"));
    setStatus(t("sampleLoading"));
    const bytes = await file.arrayBuffer();
    if (token !== sampleGeneration) return;
    const sig = new DataView(bytes);
    if (
      bytes.byteLength < 12 ||
      sig.getUint32(0, false) !== 0x52494646 ||
      sig.getUint32(8, false) !== 0x57415645
    )
      throw Error(t("sampleInvalid"));
    let buffer;
    try {
      buffer = await ensureAudio().decodeAudioData(bytes);
    } catch {
      throw Error(t("sampleDecode"));
    }
    if (token !== sampleGeneration) return;
    if (buffer.duration > 15 || buffer.duration <= 0)
      throw Error(t("sampleInvalid"));
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++)
        peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak < 0.00001) throw Error(t("sampleSilent"));
    const factor = Math.min(4, 0.8 / peak);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= factor;
    }
    const named = /(?:^|[ _-])([A-Ga-g][#b]?-?\d+)(?:[ _.-]|$)/.exec(file.name);
    if (pendingProjectRoot !== null) {
      customRoot = pendingProjectRoot;
      pendingProjectRoot = null;
    } else if (
      customRoot === rootAtStart &&
      named &&
      parsePitch(named[1]) !== null
    )
      customRoot = parsePitch(named[1]);
    $("sampleRoot").value = noteName(customRoot);
    customSample = { buffer, name: file.name.slice(0, 140) };
    $("soundMode").value = "custom";
    updateSoundHint();
    if (result.length) report();
    else setStatus(t("customSound", { root: noteName(customRoot) }));
  } catch (e) {
    if (token === sampleGeneration) setStatus(e.message, true);
  } finally {
    if (token === sampleGeneration) $("sampleFile").value = "";
  }
}
async function audition() {
  const wasPlaying = transport.state === "playing";
  if (wasPlaying) pauseAudio();
  else clearAudio();
  const token = ++playToken;
  try {
    await ensureAudio().resume();
    await preparePlayback();
    if (token !== playToken) return;
    const master = makeMaster();
    audioMaster = master;
    const pitch =
        $("soundMode").value === "custom"
          ? customRoot
          : (currentInstrument().notes?.[0] ?? 64),
      program = result[0]?.program ?? 24;
    scheduleTone(
      { pitch, velocity: 100, program, secs: 0, endSecs: 1.5 },
      audio.currentTime + 0.02,
      0,
      1,
      master,
    );
    auditionTimer = setTimeout(() => {
      if (token === playToken) {
        clearAudio();
        refreshTransport();
      }
    }, 1600);
  } catch (e) {
    if (token === playToken) {
      clearAudio();
      setStatus(e.message, true);
    }
  }
}
