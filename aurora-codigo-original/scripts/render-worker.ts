import {
  SpessaSynthProcessor,
  SoundBankLoader,
  SpessaLog,
} from "../vendor-source/spessasynth_core/src/index.ts";
SpessaLog.setLogLevel(false, false, false);

self.onmessage = async ({ data }) => {
  const synths: SpessaSynthProcessor[] = [];
  try {
    const { banks, sampleRate, frames, events, tracks } = data;
    const groups: any[] = [];
    // One processor per file keeps identical bank/program numbers independent.
    const used = new Set(
      tracks.filter((t: any) => t.enabled).map((t: any) => t.soundBankId),
    );
    for (const id of used) {
      const bank = banks.find((b: any) => b.id === id);
      if (!bank) throw Error("Banco de sons ausente na exportação.");
      const synth = new SpessaSynthProcessor(sampleRate, {
        eventsEnabled: false,
        effectsEnabled: false,
        maxBufferSize: 128,
      });
      synths.push(synth);
      synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(bank.bytes),
        id as string,
      );
      await synth.processorInitialized;
      const indices: number[] = [];
      tracks.forEach((t: any, i: number) => {
        if (t.enabled && t.soundBankId === id) {
          indices.push(i);
          synth.midiChannels[i].setDrums(!!t.drum);
        }
      });
      groups.push({
        synth,
        indices,
        cursor: 0,
        events: events.filter((e: any) => indices.includes(e.message[0] & 15)),
      });
    }
    const left = new Float32Array(frames),
      right = new Float32Array(frames);
    const channels = Array.from({ length: 16 }, () => [
      new Float32Array(128),
      new Float32Array(128),
    ]);
    const fxL = new Float32Array(128),
      fxR = new Float32Array(128);
    const rings = tracks.map((t: any) => [
      new Float32Array(Math.max(1, Math.round(t.delay * sampleRate))),
      new Float32Array(Math.max(1, Math.round(t.delay * sampleRate))),
    ]);
    for (let offset = 0; offset < frames; ) {
      const size = Math.min(128, frames - offset),
        until = (offset + size) / sampleRate;
      for (const group of groups) {
        while (
          group.cursor < group.events.length &&
          group.events[group.cursor].time < until
        ) {
          const e = group.events[group.cursor++];
          group.synth.processMessage(e.message, 0, { time: e.time });
        }
        // processSplit adds to output: clear shared blocks before each bank.
        for (const pair of channels) {
          pair[0].fill(0);
          pair[1].fill(0);
        }
        fxL.fill(0);
        fxR.fill(0);
        group.synth.processSplit(channels, fxL, fxR, 0, size);
        for (const t of group.indices) {
          const ring = rings[t],
            gain = tracks[t].volume,
            echo = tracks[t].echo;
          for (let j = 0; j < size; j++) {
            const k = (offset + j) % ring[0].length;
            left[offset + j] += (channels[t][0][j] + ring[0][k] * echo) * gain;
            right[offset + j] += (channels[t][1][j] + ring[1][k] * echo) * gain;
            ring[0][k] = channels[t][0][j];
            ring[1][k] = channels[t][1][j];
          }
        }
      }
      offset += size;
      if (offset % 131072 === 0)
        self.postMessage({ progress: offset / frames });
    }
    self.postMessage({ left, right }, [left.buffer, right.buffer]);
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    for (const synth of synths) synth.destroySynthProcessor();
  }
};
