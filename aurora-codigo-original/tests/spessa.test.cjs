const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const S = require("./spessa-core.cjs");
S.SpessaLog.setLogLevel(false, false, false);
const bytes = () => {
  const b = fs.readFileSync("dist/vendor/aurora-demo.sf2");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};
async function synth() {
  const s = new S.SpessaSynthProcessor(44100, {
    eventsEnabled: false,
    effectsEnabled: false,
  });
  s.soundBankManager.addSoundBank(
    S.SoundBankLoader.fromArrayBuffer(bytes()),
    "test",
  );
  await s.processorInitialized;
  return s;
}
function render(s, seconds) {
  const length = Math.ceil(seconds * 44100),
    l = new Float32Array(length),
    r = new Float32Array(length);
  for (let i = 0; i < length; i += 128)
    s.process(l, r, i, Math.min(128, length - i));
  return l;
}
const rms = (a) => Math.sqrt(a.reduce((v, x) => v + x * x, 0) / a.length);
test("actual supplied Spessa core decodes SF2 and renders an audible finite signal", async () => {
  const s = await synth();
  s.programChange(0, 0);
  s.noteOn(0, 60, 100);
  const out = render(s, 0.2);
  assert(out.every(Number.isFinite));
  assert(rms(out) > 0.001);
  s.noteOff(0, 60);
  const tail = render(s, 1);
  assert(rms(tail.slice(-4410)) < rms(out) * 0.05);
  s.destroySynthProcessor();
});
test("forced cancellation removes future scheduled note-ons", async () => {
  const s = await synth();
  s.processMessage([144, 60, 127], 0, { time: 0.1 });
  s.clearScheduledEvents();
  s.stopAllChannels(true);
  const out = render(s, 0.3);
  assert.equal(rms(out), 0);
  s.destroySynthProcessor();
});
test("sustain holds after key-up and releases after pedal-off", async () => {
  const s = await synth();
  s.noteOn(0, 60, 100);
  render(s, 0.1);
  s.controllerChange(0, 64, 127);
  s.noteOff(0, 60);
  const held = render(s, 0.4);
  assert(rms(held) > 0.001);
  s.controllerChange(0, 64, 0);
  const released = render(s, 1);
  assert(rms(released.slice(-4410)) < rms(held) * 0.05);
  s.destroySynthProcessor();
});
test("core validates exported MIDI with a changing tempo map", () => {
  global.Core = require("../dist/js/core/model.js");
  const M = require("../dist/js/core/midi.js"),
    t = Core.makeTrack();
  t.notes = [{ id: "n", pitch: 60, velocity: 100, start: 6, duration: 1 }];
  const p = Core.validate({
    title: "tempo",
    bpm: 120,
    lengthBeats: 8,
    tempos: [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 60 },
    ],
    tracks: [t],
  });
  const midi = S.BasicMIDI.fromArrayBuffer(M.write(p).buffer);
  assert(Math.abs(midi.duration - 5) < 0.01);
});
