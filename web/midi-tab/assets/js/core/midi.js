function parseMidi(buffer) {
  const d = new Uint8Array(buffer);
  let p = 0;
  const need = (n, end = d.length) => {
    if (p + n > end) throw Error("Arquivo MIDI truncado ou inválido.");
  };
  const u8 = () => {
      need(1);
      return d[p++];
    },
    u16 = () => u8() * 256 + u8(),
    u32 = () => u8() * 16777216 + u8() * 65536 + u8() * 256 + u8(),
    str = (n) => {
      need(n);
      let s = String.fromCharCode(...d.subarray(p, p + n));
      p += n;
      return s;
    },
    vlq = (end) => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        need(1, end);
        const b = d[p++];
        v = v * 128 + (b & 127);
        if (!(b & 128)) return v;
      }
      throw Error("Número MIDI de tamanho variável inválido.");
    };
  if (str(4) !== "MThd")
    throw Error("Este arquivo não é um MIDI padrão (.mid).");
  const hl = u32();
  if (hl < 6) throw Error("Cabeçalho MIDI inválido.");
  need(hl);
  const he = p + hl,
    format = u16(),
    nt = u16(),
    ppq = u16();
  p = he;
  if (format > 1)
    throw Error("MIDI tipo 2 não é suportado. Exporte como tipo 0 ou 1.");
  if (ppq & 32768)
    throw Error("Tempo SMPTE não é suportado. Exporte o MIDI com divisão PPQ.");
  if (format === 0 && nt !== 1)
    throw Error("MIDI tipo 0 deve conter uma única pista.");
  if (!ppq || !nt || nt > 1024)
    throw Error("Divisão de tempo ou quantidade de pistas inválida.");
  const tracks = [],
    tempos = [],
    sigs = [],
    warnings = new Set(),
    events = [];
  let total = 0,
    evcount = 0;
  for (let ti = 0; ti < nt; ti++) {
    if (str(4) !== "MTrk") throw Error("Bloco de pista MIDI inválido.");
    const len = u32();
    need(len);
    const end = p + len;
    let tick = 0,
      running = 0,
      name = "",
      programs = {},
      bend = false,
      eot = false;
    while (p < end) {
      if (++evcount > 2000000)
        throw Error("MIDI muito grande (mais de 2 milhões de eventos).");
      tick += vlq(end);
      need(1, end);
      let status = d[p];
      if (status & 128) {
        p++;
        if (status < 240) running = status;
        else if (status !== 255) running = 0;
      } else {
        if (!running) throw Error("Running status inválido.");
        status = running;
      }
      if (status === 255) {
        need(1, end);
        const type = u8(),
          size = vlq(end);
        need(size, end);
        const bytes = d.subarray(p, p + size);
        p += size;
        if (type === 3)
          name = new TextDecoder()
            .decode(bytes.subarray(0, 256))
            .replace(/[\x00-\x1f]/g, " ")
            .trim();
        if (type === 81) {
          if (size !== 3) throw Error("Evento de andamento MIDI inválido.");
          const us = bytes[0] * 65536 + bytes[1] * 256 + bytes[2];
          if (us > 0) tempos.push({ tick, us });
          else
            warnings.add(
              "Evento de andamento zero ignorado; aplicado o último andamento válido.",
            );
        }
        if (type === 88) {
          if (size === 4 && bytes[0] > 0 && bytes[1] <= 6)
            sigs.push({ tick, num: bytes[0], den: 2 ** bytes[1] });
          else warnings.add("Fórmula de compasso inválida ignorada.");
        }
        if (type === 47) {
          if (size !== 0) throw Error("Fim de pista MIDI inválido.");
          eot = true;
          p = end;
          break;
        }
      } else if (status === 240 || status === 247) {
        const size = vlq(end);
        need(size, end);
        p += size;
      } else if (status >= 128 && status < 240) {
        const kind = status >> 4,
          ch = status & 15;
        need(kind === 12 || kind === 13 ? 1 : 2, end);
        const a = u8(),
          b = kind === 12 || kind === 13 ? 0 : u8();
        if (a > 127 || b > 127) throw Error("Dados MIDI inválidos.");
        if (
          kind === 8 ||
          kind === 9 ||
          kind === 12 ||
          (kind === 11 && [64, 120, 121, 123].includes(a))
        )
          events.push({ tick, kind, ch, a, b, track: ti, order: evcount });
        if (kind === 12) programs[ch] = a;
        if (kind === 14 && (a !== 0 || b !== 64)) bend = true;
      } else throw Error("Evento MIDI de sistema não suportado.");
    }
    if (!eot)
      warnings.add(
        "Uma pista não tem marcador de fim; usada a duração disponível.",
      );
    total = Math.max(total, tick);
    tracks.push({
      name: name || "Pista " + (ti + 1),
      notes: [],
      programs,
      bend,
    });
    p = end;
  }
  // A MIDI channel is shared between tracks: pedal and all-notes-off can live in a conductor track.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const active = new Map(),
    held = Array.from({ length: 16 }, () => []),
    pedal = Array(16).fill(false),
    channelPrograms = Array(16).fill(0);
  const finish = (n, t) => {
      n.end = Math.max(t, n.start + 1);
      tracks[n.track].notes.push(n);
    },
    release = (ch, t) => {
      held[ch].forEach((n) => finish(n, t));
      held[ch] = [];
    };
  for (const e of events) {
    const { kind, ch, a, b, tick, track } = e,
      key = ch * 128 + a;
    if (kind === 9 && b > 0) {
      const n = {
        pitch: a,
        start: tick,
        end: tick + 1,
        velocity: b,
        ch,
        track,
        program: channelPrograms[ch],
      };
      if (!active.has(key)) active.set(key, []);
      active.get(key).push(n);
    } else if (kind === 8 || (kind === 9 && b === 0)) {
      const list = active.get(key);
      if (list?.length) {
        let i = list.findIndex((n) => n.track === track);
        if (i < 0) i = 0;
        const n = list.splice(i, 1)[0];
        if (pedal[ch]) held[ch].push(n);
        else finish(n, tick);
        if (!list.length) active.delete(key);
      }
    } else if (kind === 12) {
      channelPrograms[ch] = a;
    } else if (kind === 11 && a === 64) {
      if (b < 64 && pedal[ch]) release(ch, tick);
      pedal[ch] = b >= 64;
    } else if (kind === 11 && a === 121) {
      pedal[ch] = false;
      release(ch, tick);
    } else if (kind === 11 && (a === 120 || a === 123)) {
      for (const [k, list] of active)
        if (Math.floor(k / 128) === ch) {
          list.forEach((n) => {
            if (a === 123 && pedal[ch]) held[ch].push(n);
            else finish(n, tick);
          });
          active.delete(k);
        }
      if (a === 120) release(ch, tick);
    }
  }
  for (const list of active.values()) {
    list.forEach((n) => finish(n, total));
    warnings.add("Notas sem note-off foram encerradas no fim do arquivo.");
  }
  held.flat().forEach((n) => finish(n, total));
  function unique(a, fallback) {
    a.sort((a, b) => a.tick - b.tick);
    const out = [];
    for (const e of a) {
      if (out.length && out.at(-1).tick === e.tick) out[out.length - 1] = e;
      else out.push(e);
    }
    if (!out.length || out[0].tick > 0) out.unshift(fallback);
    return out;
  }
  return {
    tracks,
    ppq,
    format,
    total,
    tempos: unique(tempos, { tick: 0, us: 500000 }),
    sigs: unique(sigs, { tick: 0, num: 4, den: 4 }),
    warnings: [...warnings],
  };
}
let parserWorker = null,
  parserReject = null;
function cancelParsing() {
  if (parserWorker) {
    parserWorker.terminate();
    parserWorker = null;
  }
  if (parserReject) {
    const reject = parserReject;
    parserReject = null;
    reject(Error("cancelled"));
  }
}
function parseAsync(buffer) {
  cancelParsing();
  return new Promise((resolve, reject) => {
    parserReject = reject;
    let url;
    try {
      url = URL.createObjectURL(
        new Blob(
          [
            parseMidi.toString() +
              "\nonmessage=e=>{try{postMessage({midi:parseMidi(e.data)})}catch(err){postMessage({error:err.message})}}",
          ],
          { type: "text/javascript" },
        ),
      );
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      parserWorker = w;
      w.onmessage = (e) => {
        parserReject = null;
        w.terminate();
        parserWorker = null;
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data.midi);
      };
      w.onerror = (e) => {
        parserReject = null;
        w.terminate();
        parserWorker = null;
        reject(Error(e.message || "MIDI parse error"));
      };
      w.postMessage(buffer, [buffer]);
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      parserReject = null;
      try {
        resolve(parseMidi(buffer));
      } catch (err) {
        reject(err);
      }
    }
  });
}
