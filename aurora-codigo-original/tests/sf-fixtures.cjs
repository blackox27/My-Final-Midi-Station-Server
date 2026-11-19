const S = require("./spessa-core.cjs");
S.SpessaLog.setLogLevel(false, false, false);
// Both files deliberately use bank 0, program 0 and the same preset name.
// Their sample waveforms differ, exposing accidental bank priority overrides.
async function twoBanks() {
  await S.BasicSoundBank.isSF3DecoderReady;
  return [1, 2].map((harmonic) => {
    const bank = new S.BasicSoundBank();
    bank.soundBankInfo.name = "Fixture " + harmonic;
    const sample = new S.EmptySample(),
      data = new Float32Array(512);
    for (let i = 0; i < data.length; i++)
      data[i] = Math.sin((harmonic * 2 * Math.PI * i) / data.length);
    sample.name = "Wave";
    sample.originalKey = 60;
    sample.loopEnd = data.length;
    sample.setAudioData(data, Math.round(261.625565 * 512));
    bank.addSamples(sample);
    const instrument = new S.BasicInstrument();
    instrument.name = "Instrument";
    instrument.globalZone.addGenerators(
      new S.Generator(48, 100),
      new S.Generator(34, -7000),
      new S.Generator(38, -3000),
      new S.Generator(54, 1),
    );
    instrument.createZone(sample);
    bank.addInstruments(instrument);
    const preset = new S.BasicPreset(bank);
    preset.name = "Same preset";
    preset.program = 0;
    preset.createZone(instrument);
    bank.addPresets(preset);
    bank.flush();
    const bytes = new Uint8Array(bank.writeSF2());
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.length,
    );
  });
}
module.exports = { twoBanks };
