const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
function vlq(value) {
  const a = [value & 127];
  while ((value >>= 7)) a.unshift((value & 127) | 128);
  return a;
}
function track(events, end = 7680) {
  let bytes = [],
    tick = 0;
  for (const e of events.sort((a, b) => a[0] - b[0])) {
    bytes.push(...vlq(e[0] - tick), ...e.slice(1));
    tick = e[0];
  }
  bytes.push(...vlq(end - tick), 255, 47, 0);
  const n = bytes.length;
  return [
    77,
    84,
    114,
    107,
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
    ...bytes,
  ];
}
function fixture() {
  const conductor = [
      [0, 255, 81, 3, 7, 161, 32],
      [3840, 255, 81, 3, 15, 66, 64],
    ],
    melody = [
      [0, 192, 68],
      [1920, 144, 60, 100],
      [2400, 128, 60, 0],
      [4320, 144, 67, 100],
      [4800, 128, 67, 0],
    ],
    piano = [
      [0, 193, 0],
      [0, 145, 60, 85],
      [7680, 129, 60, 0],
    ],
    bass = [[0, 194, 32]],
    drums = [];
  for (let i = 0; i < 4; i++) {
    bass.push([i * 1920, 146, 40, 90], [(i + 1) * 1920, 130, 40, 0]);
  }
  for (const tick of [0, 480, 1920, 3840, 5760])
    drums.push([tick, 153, 36, 100], [tick + 120, 137, 36, 0]);
  const tracks = [conductor, melody, piano, bass, drums].map((e) => track(e));
  return Buffer.from([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    1,
    0,
    5,
    1,
    224,
    ...tracks.flat(),
  ]);
}
(async () => {
  const b = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    }),
    p = await b.newPage({ viewport: { width: 1500, height: 1100 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(pathToFileURL(process.env.MIDITAB_ENTRY?path.resolve(process.env.MIDITAB_ENTRY):path.resolve(__dirname, "../index.html")).href);
  await p
    .locator("#file")
    .setInputFiles({
      name: "ensemble.mid",
      mimeType: "audio/midi",
      buffer: fixture(),
    });
  await p.waitForFunction(
    () =>
      result.length === 2 &&
      pages.length > 0 &&
      !document.body.classList.contains("busy"),
  );
  assert.equal(await p.locator("#track").inputValue(), "1:0");
  await p
    .locator("aside details")
    .first()
    .evaluate((e) => (e.open = true));
  await p.selectOption("#start", "1");
  await p.waitForFunction(
    () => offset === 4 && !document.body.classList.contains("busy"),
  );
  await p.locator("#transpose").fill("12");
  await p.locator("#transpose").blur();
  await p.waitForFunction(
    () => result[0]?.pitch === 72 && !document.body.classList.contains("busy"),
  );
  await p.selectOption("#soundMode", "midi");
  await p.check("#accompaniment");
  assert.equal(await p.locator("#soundMode").inputValue(), "target");
  const data = await p.evaluate(() => ({
    start: transport.pos,
    total: transport.total,
    events: playEvents.map((n) => ({
      role: n.role,
      pitch: n.pitch,
      ch: n.ch,
      track: n.track,
      secs: n.secs,
      end: n.endSecs,
    })),
    zero: playbackZeroSec,
    firstBeat: playbackBeat(0),
    metroFirst: metroEvents[0].secs,
  }));
  assert.equal(data.start, 0);
  assert.equal(data.total, 12);
  assert.equal(data.firstBeat, -4);
  assert.equal(data.metroFirst, 0);
  assert.equal(data.events.length, 12);
  assert.deepEqual(
    data.events
      .filter((n) => n.role === "selected")
      .map((n) => [n.pitch, n.secs]),
    [
      [72, 2],
      [79, 5],
    ],
  );
  assert.ok(
    data.events.filter((n) => n.role === "backing").every((n) => n.track !== 1),
  );
  assert.ok(data.events.some((n) => n.role === "backing" && n.pitch === 40));
  await p.evaluate(() => seekBeat(-4));
  assert.match(await p.locator("#liveNotes").innerText(), /Introdução/);
  assert.ok(
    await p.evaluate(() => fxSurfaces.every((f) => f.canvas.width === 1)),
  );
  await p.evaluate(() => seekBeat(5));
  await p.selectOption("#tempoMode", "fixed");
  await p.locator("#bpm").fill("60");
  await p.locator("#bpm").blur();
  assert.equal(await p.evaluate(() => transport.total), 16);
  assert.equal(await p.evaluate(() => transport.pos), 9);
  assert.equal(await p.evaluate(() => playbackBeat(transport.pos)), 5);
  await p.evaluate(() => {
    $("speed").value = "200";
    $("speed").dispatchEvent(new Event("input"));
    seekBeat(0);
  });
  await p.click("#play");
  await p.waitForFunction(
    () =>
      transport.state === "playing" &&
      audioNodes.some((n) => n.role === "selected") &&
      audioNodes.some((n) => n.role === "backing"),
  );
  assert.ok(
    await p.evaluate(() =>
      audioNodes.some(
        (n) =>
          n.role === "backing" &&
          n.pitch === 36 &&
          n.osc.playbackRate.value === 1,
      ),
    ),
  );
  assert.equal(
    await p.evaluate(() => audioMaster._backing.gain.value),
    Math.fround(0.6),
  );
  await p.evaluate(() => {
    $("backingVolume").value = "25";
    $("backingVolume").dispatchEvent(new Event("input"));
  });
  await p.waitForTimeout(90);
  assert.ok(
    await p.evaluate(
      () => Math.abs(audioMaster._backing.gain.value - 0.25) < 0.02,
    ),
  );
  await p.click("#play");
  assert.equal(await p.evaluate(() => audioNodes.length), 0);
  assert.equal(await p.evaluate(() => audioMaster), null);
  await p.evaluate(() => seekBeat(0));
  await p.selectOption("#soundMode", "simple");
  await p.click("#play");
  await p.waitForFunction(
    () =>
      transport.state === "playing" &&
      audioNodes.some((n) => n.role === "selected"),
  );
  assert.ok(
    await p.evaluate(() =>
      audioNodes.some((n) => n.role === "selected" && !!n.osc.frequency),
    ),
  );
  assert.ok(
    await p.evaluate(() =>
      audioNodes.some((n) => n.role === "backing" && !!n.osc.buffer),
    ),
  );
  await p.click("#stop");
  await p.evaluate(() => {
    $("selectedVolume").value = "0";
    $("selectedVolume").dispatchEvent(new Event("input"));
    seekBeat(0);
  });
  await p.selectOption("#soundMode", "custom");
  await p.click("#play");
  await p.waitForFunction(() => transport.state === "playing");
  assert.equal(await p.evaluate(() => audioMaster._selected.gain.value), 0);
  assert.ok(
    await p.evaluate(() => audioNodes.some((n) => n.role === "backing")),
  );
  await p.click("#stop");
  await p.selectOption("#soundMode", "target");
  await p.evaluate(() => {
    $("selectedVolume").value = "100";
    $("selectedVolume").dispatchEvent(new Event("input"));
  });
  await p.evaluate(() => seekBeat(7));
  assert.match(
    await p.locator("#liveNotes").innerText(),
    /pista selecionada concluída/,
  );
  await p.uncheck("#accompaniment");
  assert.equal(await p.evaluate(() => playEvents.length), 2);
  await p.check("#accompaniment");
  await p.click("#stop");
  assert.equal(await p.evaluate(() => transport.pos), 0);
  await p.selectOption("#track", "2:1");
  await p.waitForFunction(
    () =>
      !document.body.classList.contains("busy") &&
      result.length === 1 &&
      source[0].track === 2,
  );
  assert.equal(
    await p.evaluate(
      () => playEvents.filter((n) => n.role === "selected").length,
    ),
    1,
  );
  assert.ok(
    await p.evaluate(() =>
      playEvents.some(
        (n) => n.role === "backing" && n.track === 1 && n.pitch === 60,
      ),
    ),
  );
  assert.ok(
    await p.evaluate(
      () => !playEvents.some((n) => n.role === "backing" && n.track === 2),
    ),
  );
  await p.selectOption("#language", "en");
  await p.selectOption("#theme", "light");
  assert.match(
    await p.locator("#accompanimentHint").innerText(),
    /other parts keep their MIDI programs/,
  );
  await p
    .locator("aside details")
    .last()
    .evaluate((e) => (e.open = true));
  const [d] = await Promise.all([
      p.waitForEvent("download"),
      p.click("#saveProject"),
    ]),
    file = path.join(os.tmpdir(), "miditab-backing-" + Date.now() + ".miditab");
  await d.saveAs(file);
  const saved = JSON.parse(fs.readFileSync(file));
  const trailing = JSON.parse(JSON.stringify(saved));
  trailing.midi.total += 960;
  assert.equal(
    await p.evaluate((doc) => validateProject(doc).midi.total, trailing),
    trailing.midi.total,
  );
  assert.equal(saved.config.accompaniment, true);
  assert.equal(saved.config.backingVolume, 25);
  await p.uncheck("#accompaniment");
  await p.locator("#projectFile").setInputFiles(file);
  await p.waitForFunction(
    () =>
      $("accompaniment").checked && !document.body.classList.contains("busy"),
  );
  assert.equal(await p.locator("#backingVolume").inputValue(), "25");
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        events: data.events.length,
        trimmedOffset: 4,
        originalDuration: 12,
        errors,
      },
      null,
      2,
    ),
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
