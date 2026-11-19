const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const S = require("./spessa-core.cjs");
S.SpessaLog.setLogLevel(false, false, false);
test("WAV and bundled MP3 encoder export actual SpessaSynth PCM", async () => {
  const s = new S.SpessaSynthProcessor(44100, {
    eventsEnabled: false,
    effectsEnabled: false,
  });
  const bank = fs.readFileSync("dist/vendor/aurora-demo.sf2");
  s.soundBankManager.addSoundBank(
    S.SoundBankLoader.fromArrayBuffer(
      bank.buffer.slice(bank.byteOffset, bank.byteOffset + bank.length),
    ),
    "formats",
  );
  await s.processorInitialized;
  const left = new Float32Array(44100),
    right = new Float32Array(44100);
  s.noteOn(0, 60, 100);
  for (let offset = 0; offset < left.length; offset += 128)
    s.process(left, right, offset, Math.min(128, left.length - offset));
  s.destroySynthProcessor();
  const scope = vm.createContext({
    console,
    ArrayBuffer,
    Float32Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    DataView,
  });
  vm.runInContext(
    fs.readFileSync("dist/js/audio/audio-engine.js", "utf8"),
    scope,
  );
  vm.runInContext(fs.readFileSync("dist/vendor/lame.min.js", "utf8"), scope);
  const wav = Buffer.from(
    scope.wavBytes({
      numberOfChannels: 2,
      length: left.length,
      sampleRate: 44100,
      getChannelData: (c) => (c ? right : left),
    }),
  );
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.length, 176444);
  const encoder = new scope.lamejs.Mp3Encoder(2, 44100, 192),
    parts = [];
  for (let offset = 0; offset < left.length; offset += 1152) {
    const l = Int16Array.from(
        left.subarray(offset, offset + 1152),
        (x) => Math.max(-1, Math.min(1, x)) * 32767,
      ),
      r = Int16Array.from(
        right.subarray(offset, offset + 1152),
        (x) => Math.max(-1, Math.min(1, x)) * 32767,
      );
    parts.push(Buffer.from(encoder.encodeBuffer(l, r)));
  }
  parts.push(Buffer.from(encoder.flush()));
  const mp3 = Buffer.concat(parts);
  assert.equal(mp3[0], 255);
  assert.equal(mp3[1] & 224, 224);
  assert(mp3.length > 20000 && mp3.length < 30000);
  if (process.env.AURORA_AUDIO_TEST_DIR) {
    fs.mkdirSync(process.env.AURORA_AUDIO_TEST_DIR, { recursive: true });
    fs.writeFileSync(process.env.AURORA_AUDIO_TEST_DIR + "/soundfont.wav", wav);
    fs.writeFileSync(process.env.AURORA_AUDIO_TEST_DIR + "/soundfont.mp3", mp3);
  }
});
