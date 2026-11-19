const test = require("node:test"),
  assert = require("node:assert/strict");
global.Core = require("../dist/js/core/model.js");
const Tools = require("../dist/js/core/note-tools.js");
const note = (id, extra = {}) => ({
  id,
  pitch: 60,
  start: 1,
  duration: 1,
  velocity: 90,
  ...extra,
});
test("humanization preserves durations and project boundaries at both extremes", () => {
  const notes = [
    note("a", { start: 0, velocity: 1 }),
    note("b", { start: 3, velocity: 127 }),
  ];
  Tools.humanize(notes, 4, { timing: 0.5, velocity: 40, random: () => 0 });
  assert.equal(notes[0].start, 0);
  assert.equal(notes[0].velocity, 1);
  assert.equal(notes[1].start, 2.5);
  Tools.humanize(notes, 4, { timing: 0.5, velocity: 40, random: () => 1 });
  assert.equal(notes[1].start, 3);
  assert.equal(notes[1].velocity, 127);
  assert(notes.every((n) => n.duration === 1 && n.start + n.duration <= 4));
});
test("humanization refuses non-finite parameters before changing notes", () => {
  const ns = [note("a")],
    copy = structuredClone(ns);
  assert.throws(() => Tools.humanize(ns, 4, { timing: NaN }));
  assert.deepEqual(ns, copy);
});
test("duplicate removal preserves velocity layers and nonidentical timing", () => {
  const ns = [
    note("a"),
    note("b"),
    note("layer", { velocity: 91 }),
    note("late", { start: 1.000001 }),
  ];
  const r = Tools.deduplicate(ns);
  assert.deepEqual(
    r.notes.map((n) => n.id),
    ["a", "layer", "late"],
  );
  assert.deepEqual([...r.removed], ["b"]);
});
test("cleanup only removes selected duplicates and preserves unselected originals", () => {
  const ns = [note("selected"), note("original")];
  assert.deepEqual(
    Tools.deduplicate(ns, new Set(["selected"])).notes.map((n) => n.id),
    ["original"],
  );
});
test("track duplication creates independent notes and automation but shares sound assets", () => {
  const source = {
    ...Core.makeTrack("Source"),
    sampleId: "sample",
    soundBankId: "bank",
    notes: [note("n")],
    cc: [{ id: "cc", beat: 0, type: "64", value: 127 }],
  };
  const copy = Tools.cloneTrack(source, "Copy", 2);
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copy.notes[0].id, "n");
  assert.notEqual(copy.cc[0].id, "cc");
  assert.equal(copy.sampleId, "sample");
  assert.equal(copy.soundBankId, "bank");
  copy.notes[0].pitch = 70;
  assert.equal(source.notes[0].pitch, 60);
  assert.equal(copy.channel, 2);
});
