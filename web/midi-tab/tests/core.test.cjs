const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const context = vm.createContext({
  TextDecoder,
  Uint8Array,
  Blob,
  URL,
  console,
  document: {
    getElementById() {
      return null;
    },
  },
});
const root = path.resolve(__dirname, "../assets/js");
for (const file of [
  "core/state.js",
  "core/midi.js",
  "core/fingering.js",
  "audio/arrangement.js",
  "audio/transport.js",
  "data/instruments.js",
  "data/gm.js",
])
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
function evaluate(code) {
  return vm.runInContext(code, context);
}
function midi(tracks, format = 0, ppq = 480) {
  const chunk = (t) => [
    77,
    84,
    114,
    107,
    (t.length >>> 24) & 255,
    (t.length >>> 16) & 255,
    (t.length >>> 8) & 255,
    t.length & 255,
    ...t,
  ];
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    format,
    0,
    tracks.length,
    ppq >> 8,
    ppq & 255,
    ...tracks.flatMap(chunk),
  ]).buffer;
}
function parse(tracks, format) {
  context.bytes = midi(tracks, format);
  return evaluate("parseMidi(bytes)");
}
test("MIDI running status and note-on velocity zero", () => {
  const m = parse([[0, 144, 64, 100, 131, 96, 64, 0, 0, 255, 47, 0]]);
  assert.equal(m.tracks[0].notes[0].end, 480);
});
test("program changes are captured for each note", () => {
  const m = parse([
    [
      0, 192, 24, 0, 144, 64, 100, 120, 128, 64, 0, 0, 192, 26, 0, 144, 67, 100,
      120, 128, 67, 0, 0, 255, 47, 0,
    ],
  ]);
  assert.deepEqual(m.tracks[0].notes.map((n) => n.program).join(","), "24,26");
});
test("sustain works across tracks on a shared channel", () => {
  const m = parse(
    [
      [0, 176, 64, 127, 129, 112, 176, 64, 0, 0, 255, 47, 0],
      [0, 144, 64, 100, 120, 128, 64, 0, 0, 255, 47, 0],
    ],
    1,
  );
  assert.equal(m.tracks[1].notes[0].end, 240);
});
test("All Notes Off respects sustain and Reset All Controllers releases it", () => {
  const m = parse([
    [
      0, 144, 64, 100, 0, 176, 64, 127, 120, 176, 123, 0, 120, 176, 121, 0, 0,
      255, 47, 0,
    ],
  ]);
  assert.equal(m.tracks[0].notes[0].end, 240);
});
test("truncated tracks and malformed tempo events are rejected", () => {
  assert.throws(() => parse([[0, 144, 64]]));
  assert.throws(() => parse([[0, 255, 81, 2, 1, 2]]));
});
test("tempo maps and inverse conversion preserve timing", () => {
  assert.equal(
    evaluate(
      "new TempoTimeline([{tick:0,us:500000},{tick:1920,us:1000000}],480).seconds(8)",
    ),
    6,
  );
  assert.equal(
    evaluate(
      "new TempoTimeline([{tick:0,us:500000},{tick:1920,us:1000000}],480,5).seconds(1)",
    ),
    1,
  );
  for (const beat of [0, 0.125, 2, 4, 6, 30])
    assert.ok(
      evaluate(
        `Math.abs(new TempoTimeline([{tick:0,us:500000},{tick:1920,us:1000000}],480).beat(new TempoTimeline([{tick:0,us:500000},{tick:1920,us:1000000}],480).seconds(${beat}))-${beat})<1e-9`,
      ),
    );
});
test("overlapping notes use separate strings without changing pitches", () => {
  const r = evaluate(
    "assignNotes([{pitch:64,start:0,end:2},{pitch:64,start:1,end:3}],[64,59,55,50,45,40],24)",
  );
  assert.notEqual(r[0].s, r[1].s);
  for (const n of r) assert.equal([64, 59, 55, 50, 45, 40][n.s] + n.f, n.pitch);
});
test("unplayable notes remain explicitly unassigned", () =>
  assert.equal(
    evaluate(
      "assignNotes([{pitch:10,start:0,end:1}],[64,59,55,50,45,40],24)[0].s",
    ),
    -1,
  ));
test("time signatures split measures at the actual change", () =>
  assert.equal(
    evaluate(
      'makeBars(9,[{tick:0,num:4,den:4},{tick:2880,num:3,den:4}],480,0).map(b=>b.start).join(",")',
    ),
    "0,4,6",
  ));
test("all tuning presets stay within the supported string and pitch ranges", () => {
  assert.equal(evaluate("INSTRUMENTS.length"), 21);
  assert.equal(
    evaluate(
      "INSTRUMENTS.every(i=>i.notes.length>=3&&i.notes.length<=8&&i.notes.every(n=>Number.isInteger(n)&&n>=0&&n<=127))",
    ),
    true,
  );
  assert.equal(evaluate("GM_NAMES.length"), 128);
});

test("Brazilian cavaquinho uses sounding pitches D4 G4 B4 D5", () =>
  assert.equal(
    evaluate('INSTRUMENTS.find(i=>i.id==="cavaquinho").notes.join(",")'),
    "74,71,67,62",
  ));

test("backing replaces exactly the selected track and channel", () => {
  const song = {
    ppq: 480,
    total: 3840,
    tracks: [
      {
        notes: [
          { pitch: 60, start: 480, end: 960, ch: 0, program: 68 },
          { pitch: 48, start: 0, end: 960, ch: 1, program: 32 },
        ],
      },
      { notes: [{ pitch: 64, start: 0, end: 3840, ch: 0, program: 0 }] },
    ],
  };
  context.song = song;
  const r = evaluate(
    'createArrangement(song,[{pitch:72,start:0,end:1,ch:0,track:0,program:68}],"0:0",1,true)',
  );
  assert.equal(r.events.length, 3);
  assert.equal(r.events.filter((n) => n.role === "selected").length, 1);
  assert.equal(
    r.events
      .filter((n) => n.role === "backing")
      .map((n) => n.pitch)
      .sort()
      .join(","),
    "48,64",
  );
  assert.equal(r.startBeat, -1);
  assert.equal(r.endBeat, 7);
});
test("all melodic parts are not duplicated and percussion stays backing", () => {
  context.song = {
    ppq: 480,
    total: 960,
    tracks: [
      {
        notes: [
          { pitch: 60, start: 0, end: 960, ch: 0, program: 0 },
          { pitch: 36, start: 0, end: 240, ch: 9, program: 0 },
        ],
      },
    ],
  };
  const r = evaluate(
    'createArrangement(song,[{pitch:60,start:0,end:2,ch:0,track:0}],"all",0,true)',
  );
  assert.equal(r.events.length, 2);
  assert.equal(r.events.find((n) => n.ch === 9).role, "backing");
});
test("solo arrangement keeps transformed selected notes only", () =>
  assert.equal(
    evaluate(
      'createArrangement(song,[{pitch:72,start:0,end:1}],"0:0",0,false).events.length',
    ),
    1,
  ));
