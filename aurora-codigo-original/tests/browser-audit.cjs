/* Real-browser regression suite. Install Playwright and Chromium for development only.
   Optional AURORA_BROWSER_PATH selects an installed Chromium; no relaxed origin flags. */
const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-audit-"));
  const browser = await chromium.launch({
    executablePath: process.env.AURORA_BROWSER_PATH || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const report = {
    browser: browser.version(),
    mode: "file://, network blocked, default origin and autoplay security",
    checks: [],
  };
  const check = (name) => {
    report.checks.push(name);
    console.log("PASS", name);
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [],
      network = [];
    await context.route(/^https?:/, (route) => {
      network.push(route.request().url());
      return route.abort();
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("dist/Aurora-MIDI.html"));
    await page.waitForFunction(
      () => typeof restoring !== "undefined" && !restoring,
    );
    assert.equal(await page.evaluate(() => project.tracks.length), 3);
    check("Self-contained file starts offline");
    await page.click("#new");
    await page.click("#confirmNew");
    const roll = await page.locator("#roll").boundingBox();
    await page.mouse.click(roll.x + 160, roll.y + 160);
    assert.equal(await page.evaluate(() => track().notes.length), 1);
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => track().notes.length), 0);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.evaluate(() => track().notes.length), 1);
    check("Mouse drawing and keyboard undo/redo");
    const banks = await require("./sf-fixtures.cjs").twoBanks();
    await page.setInputFiles(
      "#bankInput",
      banks.map((bytes, i) => ({
        name: `Bank-${i}.sf2`,
        mimeType: "application/octet-stream",
        buffer: Buffer.from(bytes),
      })),
    );
    await page.waitForFunction(
      () => !bankUploadBusy && project.soundBanks.length === 2,
    );
    await page.click("#add");
    await page.selectOption("#instrument", "soundfont");
    await page.selectOption(
      "#bankSelect",
      await page.evaluate(() => project.soundBanks[1].id),
    );
    await page.evaluate(() => {
      project.lengthBeats = 4;
      project.bpm = 120;
      project.tempos = [{ beat: 0, bpm: 120 }];
      project.tracks.forEach((t, i) => {
        t.notes = [
          { id: uid(), start: 0, duration: 1, pitch: 60 + 7 * i, velocity: 95 },
        ];
        t.echo = 0;
        t.cc = [
          { beat: 0.5, type: "64", value: 127 },
          { beat: 1.5, type: "64", value: 0 },
        ];
      });
      loadUI();
    });
    await page.click("#play");
    await page.waitForFunction(() => playing);
    assert.equal(
      await page.evaluate(
        () => [...audio.banks.values()].filter((b) => b.synth).length,
      ),
      2,
    );
    const peak = await page.evaluate(async () => {
      const a = audio.ctx.createAnalyser();
      a.fftSize = 2048;
      audio.compressor.connect(a);
      let peak = 0;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 25));
        const x = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(x);
        for (const v of x) peak = Math.max(peak, Math.abs(v));
      }
      audio.compressor.disconnect(a);
      a.disconnect();
      return peak;
    });
    assert(peak > 0.00001, "Both banks must produce audible PCM");
    await page.click("#stop");
    check(
      "Two independent SF2 files: real AudioWorklet playback and nonzero PCM",
    );
    await page.click("#scoreTab");
    assert(await page.locator("#scorePanel").isVisible());
    await page.click("#rollTab");
    check("Score and piano roll switching");
    const download = async (action, extension) => {
      const promise = page.waitForEvent("download", { timeout: 90000 });
      await action();
      const file = await promise;
      assert(file.suggestedFilename().endsWith(extension));
      const dest = path.join(directory, "output" + extension);
      await file.saveAs(dest);
      return fs.readFile(dest);
    };
    const portable = await download(() => page.click("#save"), ".aurora");
    const saved = JSON.parse(portable);
    assert.equal(saved.assets.length, 2);
    await page.click("#new");
    await page.click("#confirmNew");
    await page.setInputFiles("#fileInput", {
      name: "test.aurora",
      mimeType: "application/json",
      buffer: portable,
    });
    await page.waitForFunction(() => project.soundBanks.length === 2);
    assert(
      await page.evaluate(
        () => project.tracks[0].soundBankId !== project.tracks[1].soundBankId,
      ),
    );
    check("Portable save and reopen preserve both banks");
    await page.click("#export");
    const midi = await download(() => page.click("#exportMidi"), ".mid");
    assert.equal(midi.subarray(0, 4).toString(), "MThd");
    const wav = await download(() => page.click("#exportWav"), ".wav");
    assert.equal(wav.subarray(0, 4).toString(), "RIFF");
    assert.equal(wav.readUInt32LE(24), 44100);
    let energy = 0;
    for (let n = 44; n < wav.length; n += 2) energy += wav.readInt16LE(n) ** 2;
    assert(energy > 0);
    check("Real Worker + OfflineAudioContext produce non-silent stereo WAV");
    const mp3 = await download(() => page.click("#exportMp3"), ".mp3");
    assert(mp3.length > 1000);
    assert(mp3[0] === 255 && (mp3[1] & 224) === 224);
    check("MIDI, WAV and MP3 browser downloads");
    await page.click("#closeDialog");
    await page.click("#add");
    await page.setInputFiles("#sampleInput", {
      name: "Mix.wav",
      mimeType: "audio/wav",
      buffer: wav,
    });
    await page.waitForFunction(() => track().instrument === "sample");
    await page.evaluate(() => {
      track().notes = [
        { id: uid(), start: 0, duration: 1, pitch: 60, velocity: 90 },
      ];
      changed();
    });
    await page.click("#play");
    await page.waitForFunction(() => playing);
    await page.click("#stop");
    check("WAV sample decoding and playback alongside both SoundFonts");
    await page.fill("#title", "Última edição salva");
    await page.locator("#title").blur();
    await page.reload();
    await page.waitForFunction(
      () => typeof restoring !== "undefined" && !restoring,
    );
    assert.equal(await page.inputValue("#title"), "Última edição salva");
    assert.equal(await page.evaluate(() => project.soundBanks.length), 2);
    await page.click("#play");
    await page.waitForFunction(() => playing);
    await page.click("#stop");
    check("Immediate reload restores latest edit, IndexedDB banks and sample");
    await page.click("#help");
    const manual = await download(
      () => page.getByText("Manual e limites", { exact: true }).click(),
      ".txt",
    );
    assert(manual.toString().includes("COMO ABRIR"));
    await page.click("#closeDialog");
    check("Embedded manual download");
    const beforeLanguage = await page.evaluate(() => JSON.stringify(project));
    await page.selectOption("#language", "en");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal((await page.textContent("#save")).trim(), "Save project");
    assert.equal(await page.evaluate(() => JSON.stringify(project)), beforeLanguage);
    await page.click("#editorTools");
    assert.equal((await page.textContent("#cloneTrack")).trim(), "Duplicate track");
    await page.click("#humanize");
    await page.fill("#humanTiming", "0");
    await page.fill("#humanVelocity", "0");
    await page.click("#humanApply");
    await page.click("#fitNotes");
    await page.click("#editorTools");
    const trackCount = await page.evaluate(() => project.tracks.length);
    await page.click("#cloneTrack");
    assert.equal(await page.evaluate(() => project.tracks.length), trackCount + 1);
    await page.click("#undo");
    assert.equal(await page.evaluate(() => project.tracks.length), trackCount);
    check("English UI, humanization, fit view, duplicate track and undo");
    await page.click("#help");
    const englishManual = await download(
      () => page.getByText("Manual and limitations", { exact: true }).click(), ".txt",
    );
    assert(englishManual.toString().includes("OPENING THE APPLICATION"));
    await page.click("#closeDialog");
    check("English manual is embedded and downloadable offline");
    await page.reload();
    await page.waitForFunction(() => !restoring);
    assert.equal(await page.inputValue("#language"), "en");
    assert.equal((await page.textContent("#new")).trim(), "New");
    await page.screenshot({ path: path.join(directory, "english.png") });
    await page.selectOption("#language", "pt-BR");
    assert.equal((await page.textContent("#new")).trim(), "Novo");
    check("Language preference survives reload and switches back to Portuguese");
    await page.click("#follow");
    assert.equal(await page.locator("#follow").getAttribute("aria-pressed"), "true");
    await page.evaluate(() => { project.lengthBeats = 32; zoom = 240; resize(); position = 20; followCursor(); });
    assert(await page.evaluate(() => $("rollScroll").scrollLeft > 0));
    await page.click("#play");
    await page.waitForFunction(() => playing);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => playing), false);
    assert.equal(await page.evaluate(() => recorded.size), 0);
    check("Follow cursor scrolls and Escape panic stops playback");
    // Keep the final visual representative of the editor.
    await page.evaluate(() => { position = 0; fitNotes(); });
    await page.screenshot({
      path:
        process.env.AURORA_SCREENSHOT || path.join(directory, "desktop.png"),
    });
    for (const width of [1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: path.join(directory, `width-${width}.png`),
      });
      assert(await page.locator("#export").isVisible());
      const help = await page.locator("#help").boundingBox();
      assert(help.x + help.width <= width, "Help must remain inside viewport");
    }
    check("Desktop and compact view render without JavaScript errors");
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    check("No uncaught page errors or external network requests");
    report.passed = report.checks.length;
    report.outputDirectory = directory;
    console.log(JSON.stringify(report, null, 2));
    if (process.env.AURORA_BROWSER_REPORT)
      await fs.writeFile(
        process.env.AURORA_BROWSER_REPORT,
        JSON.stringify(report, null, 2),
      );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
