"use strict";
const drumCache = new Map();
function percussionSample(pitch) {
  const kind = [35, 36].includes(pitch)
    ? "kick"
    : [38, 40].includes(pitch)
      ? "snare"
      : [42, 44].includes(pitch)
        ? "hat"
        : pitch === 46
          ? "openhat"
          : [49, 51, 52, 55, 57, 59].includes(pitch)
            ? "cymbal"
            : [41, 43, 45, 47, 48, 50].includes(pitch)
              ? "tom"
              : "tap";
  const key = kind + (["tom", "tap"].includes(kind) ? pitch : "");
  if (drumCache.has(key)) return drumCache.get(key);
  const sr = 22050,
    duration =
      kind === "cymbal"
        ? 0.9
        : kind === "openhat"
          ? 0.45
          : kind === "hat"
            ? 0.09
            : 0.38,
    buffer = ensureAudio().createBuffer(1, Math.ceil(sr * duration), sr),
    data = buffer.getChannelData(0);
  let phase = 0,
    seed = (pitch + 1) * 1234567,
    previous = 0;
  for (let i = 0; i < data.length; i++) {
    const time = i / sr;
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    const noise = seed / 2147483648,
      high = noise - previous;
    previous = noise;
    let value;
    if (kind === "kick") {
      phase += (2 * Math.PI * (45 + 110 * Math.exp(-time * 28))) / sr;
      value = Math.sin(phase) * Math.exp(-time * 12);
    } else if (kind === "snare")
      value =
        (noise * 0.7 + Math.sin(2 * Math.PI * 185 * time) * 0.3) *
        Math.exp(-time * 18);
    else if (kind === "tom")
      value =
        Math.sin(2 * Math.PI * (70 + Math.max(0, pitch - 41) * 12) * time) *
        Math.exp(-time * 12);
    else
      value =
        high *
        0.5 *
        Math.exp(
          -time * (kind === "cymbal" ? 5 : kind === "openhat" ? 11 : 55),
        );
    data[i] =
      value *
      Math.min(1, time / 0.0015) *
      Math.min(1, (duration - time) / 0.008) *
      0.8;
  }
  const sample = { root: pitch, buffer, unpitched: true };
  if (drumCache.size >= 32) drumCache.delete(drumCache.keys().next().value);
  drumCache.set(key, sample);
  return sample;
}
