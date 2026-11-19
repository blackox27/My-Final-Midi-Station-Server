const test = require("node:test"),
  assert = require("node:assert/strict");
global.Core = require("../dist/js/core/model.js");
const Midi = require("../dist/js/core/midi.js");
const project = () =>
  Core.validate({
    title: "Teste",
    bpm: 120,
    lengthBeats: 16,
    tracks: [
      {
        ...Core.makeTrack("Piano"),
        notes: [
          { id: "n", start: 1.125, duration: 0.875, pitch: 60, velocity: 91 },
        ],
      },
    ],
  });
test("tempo map converts and inverts piecewise time", () => {
  const p = project();
  p.tempos = [
    { beat: 0, bpm: 120 },
    { beat: 4, bpm: 60 },
    { beat: 8, bpm: 180 },
  ];
  const c = Core.clock(p);
  assert.equal(c.toSeconds(6), 4);
  for (const b of [0, 1, 4, 6, 8, 9.5, 16])
    assert(Math.abs(c.toBeat(c.toSeconds(b)) - b) < 1e-10);
});
test("MIDI round trip preserves maps, channel 10, banks, program, pressure and sustain", () => {
  const p = project();
  p.tempos = [
    { beat: 0, bpm: 120 },
    { beat: 8, bpm: 90 },
  ];
  p.signatures = [
    { beat: 0, numerator: 4, denominator: 4 },
    { beat: 8, numerator: 3, denominator: 4 },
  ];
  const t = p.tracks[0];
  Object.assign(t, {
    channel: 9,
    drum: true,
    bankMSB: 2,
    bankLSB: 3,
    program: 12,
    volume: 1,
  });
  t.cc.push(
    { beat: 2, type: "pitch", value: 12345 },
    { beat: 1, type: "64", value: 127 },
    { beat: 4, type: "64", value: 0 },
    { beat: 3, type: "11", value: 77 },
  );
  t.events = [
    { beat: 2, type: "program", value: 13 },
    { beat: 3, type: "pressure", value: 60 },
  ];
  const b = Midi.write(p),
    r = Midi.read(b.buffer);
  assert.equal(r.tracks[0].channel, 9);
  assert.equal(r.tracks[0].drum, true);
  assert.equal(r.tracks[0].bankMSB, 2);
  assert.equal(r.tracks[0].bankLSB, 3);
  assert.equal(r.tracks[0].program, 12);
  assert.equal(r.tempos.length, 2);
  assert(Math.abs(r.tempos[1].bpm - 90) < 0.001);
  assert.deepEqual(r.signatures, p.signatures);
  assert.equal(r.tracks[0].notes[0].start, 1.125);
  assert(r.tracks[0].cc.some((c) => c.type === "pitch" && c.value === 12345));
  assert(
    r.tracks[0].events.some((e) => e.type === "program" && e.value === 13),
  );
  assert(r.tracks[0].events.some((e) => e.type === "pressure"));
});
function smf(events) {
  const h = [
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    0,
    0,
    0,
    events.length,
  ];
  return Uint8Array.from([...h, ...events]).buffer;
}
test("dangling notes end on their own track even after a longer conductor track", () => {
  const first = new Uint8Array(smf([0x8f, 0, 255, 47, 0])); // four quarter notes
  const second = new Uint8Array(smf([0, 144, 60, 100, 120, 255, 47, 0]));
  first[9] = 1;
  first[11] = 2;
  const data = new Uint8Array(first.length + second.length - 14);
  data.set(first);
  data.set(second.subarray(14), first.length);
  const p = Midi.read(data.buffer);
  assert.equal(p.tracks[0].notes[0].duration, 0.25);
  assert.equal(p.lengthBeats, 4);
});
test("RIFF MIDI accepts padded unknown chunks and rejects truncated wrappers", () => {
  const data = Buffer.from(Midi.write(project()));
  const junk = Buffer.from([74, 85, 78, 75, 1, 0, 0, 0, 42, 0]);
  const chunk = Buffer.alloc(8);
  chunk.write("data");
  chunk.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from("RMID"), junk, chunk, data]);
  const header = Buffer.alloc(8);
  header.write("RIFF");
  header.writeUInt32LE(body.length, 4);
  const file = Uint8Array.from(Buffer.concat([header, body]));
  assert.equal(Midi.read(file.buffer).tracks[0].notes.length, 1);
  assert.throws(() => Midi.read(file.buffer.slice(0, -2)), /RIFF/);
});
test("malformed end-of-track events and format-0 multi-track headers are rejected", () => {
  assert.throws(() => Midi.read(smf([0, 255, 47, 1, 0])), /Fim de pista/);
  const bytes = new Uint8Array(smf([0, 255, 47, 0]));
  bytes[11] = 2;
  assert.throws(() => Midi.read(bytes.buffer), /formato 0/);
});
test("MIDI with high PPQ and sub-editor-tick notes imports without invalid durations", () => {
  const bytes = new Uint8Array(
    smf([0, 144, 60, 90, 1, 128, 60, 0, 0, 255, 47, 0]),
  );
  bytes[12] = 0x7f;
  bytes[13] = 0xff;
  assert.equal(Midi.read(bytes.buffer).tracks[0].notes[0].duration, 1 / 3840);
});
test("SysEx length does not corrupt next event", () => {
  const p = Midi.read(
    smf([
      0, 240, 3, 1, 2, 247, 0, 144, 60, 100, 120, 128, 60, 0, 0, 255, 47, 0,
    ]),
  );
  assert.equal(p.tracks[0].notes.length, 1);
  assert.equal(p.tracks[0].notes[0].duration, 0.25);
  assert(p.warnings.some((x) => x.includes("SysEx")));
});
test("running status and simultaneous repeated pitches preserve FIFO notes", () => {
  const p = Midi.read(
    smf([
      0, 144, 60, 100, 0, 60, 90, 120, 128, 60, 0, 120, 60, 0, 0, 255, 47, 0,
    ]),
  );
  assert.equal(p.tracks[0].notes.length, 2);
  assert.deepEqual(
    p.tracks[0].notes.map((n) => n.duration),
    [0.25, 0.5],
  );
});
test("truncated and malformed files fail intentionally", () => {
  const b = Midi.write(project());
  assert.throws(() => Midi.read(b.buffer.slice(0, b.length - 2)));
  assert.throws(() => Midi.read(smf([0, 240, 7, 1, 2])));
  assert.throws(() => Midi.read(smf([128, 128, 128, 128])));
  assert.throws(() => Midi.read(new ArrayBuffer(4)));
});
test("quantization strength, swing and note ends follow PulseForge", () => {
  const ns = [{ start: 0.4, duration: 0.3 }];
  Core.quantize(ns, { grid: 0.5, strength: 0.5, swing: 0.4, ends: false }, 16);
  assert(Math.abs(ns[0].start - 0.5) < 1e-9);
  assert(Math.abs(ns[0].duration - 0.3) < 1e-9);
  const n = [{ start: 0.1, duration: 0.55 }];
  Core.quantize(n, { grid: 0.25, strength: 1, swing: 0, ends: true }, 16);
  assert.equal(n[0].start, 0);
  assert.equal(n[0].duration, 0.75);
});
test("PFM import preserves note channel, CC pan and glide curve", () => {
  const p = Core.pulseForge({
    format: "PulseForge MIDI Project",
    title: "PF",
    tempo: 100,
    lengthBeats: 12,
    numerator: 3,
    denominator: 4,
    tracks: [
      {
        name: "Lead",
        channel: 2,
        notes: [
          {
            start: 1,
            length: 2,
            pitch: 60,
            velocity: 100,
            channel: 2,
            glideSemitones: 2,
            glideBeats: 0.5,
          },
        ],
        automation: [{ beat: 0, lane: 3, value: 0.75, channel: 2 }],
      },
    ],
  });
  assert.equal(p.tracks[0].channel, 1);
  assert.equal(p.tracks[0].notes[0].duration, 2);
  assert.equal(p.tracks[0].cc[0].type, "10");
  assert(p.tracks[0].cc.some((c) => c.type === "pitch" && c.value === 16383));
  assert.equal(Core.measures(p).length, 4);
});
test("validation keeps stable ids and rejects NaN, fractional pitches and out-of-bounds notes", () => {
  const p = project();
  assert.equal(Core.validate(p).tracks[0].notes[0].id, "n");
  for (const change of [{ pitch: 60.5 }, { start: NaN }, { duration: 20 }]) {
    const q = structuredClone(p);
    Object.assign(q.tracks[0].notes[0], change);
    assert.throws(() => Core.validate(q));
  }
});
test("100-step history: redo after undo, edits invalidate redo", () => {
  const h = new Core.History(),
    p = project();
  h.push(p);
  const p2 = structuredClone(p);
  p2.title = "After";
  assert.equal(h.undo(p2).title, "Teste");
  assert.equal(h.redo(p).title, "After");
  h.undo(p2);
  h.push(p2);
  assert.equal(h.future.length, 0);
});
test("events sort note-off before note-on at retrigger and respect mute/solo", () => {
  const p = project(),
    t = p.tracks[0];
  t.notes.push({ id: "next", start: 2, duration: 1, pitch: 60, velocity: 90 });
  const second = Core.makeTrack("Mute");
  second.mute = true;
  p.tracks.push(second);
  const events = Core.events(p);
  assert.deepEqual(
    events.filter((e) => e.beat === 2).map((e) => e.type),
    ["off", "on"],
  );
  assert(!events.some((e) => e.track === 1));
  assert(Core.events(p, { audible: false }).some((e) => e.track === 1));
});

test("single-bank Aurora projects migrate without changing assignments; dangling banks are rejected", () => {
  const old = project();
  delete old.soundBanks;
  old.version = 2;
  old.soundBank = { id: "old-sf", name: "Old.sf2" };
  old.tracks[0].instrument = "soundfont";
  delete old.tracks[0].soundBankId;
  const migrated = Core.validate(old);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.tracks[0].soundBankId, "old-sf");
  assert.deepEqual(migrated.soundBanks, [{ id: "old-sf", name: "Old.sf2" }]);
  assert(!("soundBank" in migrated));
  migrated.tracks[0].soundBankId = "missing";
  assert.throws(() => Core.validate(migrated), /banco de sons ausente/);
  migrated.tracks[0].soundBankId = "old-sf";
  migrated.soundBanks.push({ ...migrated.soundBanks[0] });
  assert.throws(() => Core.validate(migrated), /duplicada/);
});

test("sub-tick notes export with at least one tick and never become stuck", () => {
  const p = project();
  p.tracks[0].notes = [
    { id: "tiny", start: 1, duration: 1 / 3840, pitch: 60, velocity: 90 },
  ];
  const restored = Midi.read(Midi.write(p).buffer);
  assert.equal(restored.tracks[0].notes[0].duration, 1 / 960);
  assert(!(restored.warnings || []).some((w) => w.includes("sem Note Off")));
});
test("full 1/32 song remains navigable and duplicate signatures use last value", () => {
  const p = project();
  p.lengthBeats = 4096;
  p.signatures = [
    { beat: 0, numerator: 4, denominator: 4 },
    { beat: 0, numerator: 1, denominator: 32 },
  ];
  const q = Core.validate(p);
  assert.equal(q.signatures.length, 1);
  assert.equal(Core.measures(q).at(-1).end, 4096);
  assert.equal(Core.measures(q).length, 32768);
});
test("malformed project collections and fractional pressure pitches reject cleanly", () => {
  for (const mutate of [
    (p) => (p.tempos = {}),
    (p) => (p.signatures = [null]),
    (p) => (p.tracks = [null]),
    (p) => (p.tracks[0].notes = [null]),
    (p) => (p.tracks[0].events = {}),
    (p) => (p.tracks[0].cc = [null]),
    (p) =>
      (p.tracks[0].events = [
        { beat: 0, type: "polyPressure", pitch: 60.5, value: 40 },
      ]),
  ]) {
    const p = project();
    mutate(p);
    assert.throws(
      () => Core.validate(p),
      (e) => e instanceof Error && !(e instanceof TypeError),
    );
  }
});
