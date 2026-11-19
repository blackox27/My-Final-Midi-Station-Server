const fs = require("node:fs");
const S = require("../tests/spessa-core.cjs");
S.SpessaLog.setLogLevel(false, false, false);
async function main() {
  await S.BasicSoundBank.isSF3DecoderReady;
  const bank = new S.BasicSoundBank();
  bank.soundBankInfo.name = "Aurora Synthetic Starter";
  const kinds = [
    ["Sine Keys", 0],
    ["Triangle Bass", 38],
    ["Soft Pad", 89],
    ["Saw Lead", 81],
  ];
  for (const [index, [name, program]] of kinds.entries()) {
    const data = new Float32Array(512);
    for (let i = 0; i < data.length; i++) {
      const phase = i / data.length;
      data[i] =
        index === 0
          ? Math.sin(2 * Math.PI * phase)
          : index === 1
            ? (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * phase))
            : index === 2
              ? 0.7 * Math.sin(2 * Math.PI * phase) +
                0.15 * Math.sin(4 * Math.PI * phase)
              : 2 * phase - 1;
    }
    const sample = new S.EmptySample();
    sample.name = name;
    sample.originalKey = 60;
    sample.loopEnd = data.length;
    sample.setAudioData(data, Math.round(261.625565 * 512));
    bank.addSamples(sample);
    const inst = new S.BasicInstrument();
    inst.name = name;
    inst.globalZone.addGenerators(
      new S.Generator(48, 100),
      new S.Generator(34, -7000),
      new S.Generator(38, -3000),
      new S.Generator(54, 1),
    );
    inst.createZone(sample);
    bank.addInstruments(inst);
    const preset = new S.BasicPreset(bank);
    preset.name = name;
    preset.program = program;
    preset.createZone(inst);
    bank.addPresets(preset);
  }
  bank.flush();
  const bytes = new Uint8Array(bank.writeSF2());
  fs.writeFileSync("dist/vendor/aurora-demo.sf2", bytes);
  fs.writeFileSync(
    "dist/vendor/demo-bank.js",
    "globalThis.AURORA_DEMO_BANK=" +
      JSON.stringify(Buffer.from(bytes).toString("base64")) +
      ";\n",
  );
  console.log(
    "Created synthetic demonstration SF2:",
    bytes.length,
    "bytes,",
    bank.presets.length,
    "presets.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
