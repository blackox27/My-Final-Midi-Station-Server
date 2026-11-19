/* Standard MIDI File I/O: bounded parsing, preserved tempo/signature maps and channels. */
(function (root) {
  const encoder = new TextEncoder(),
    decoder = new TextDecoder();
  const variable = (n) => {
    n = Math.max(0, Math.round(n));
    if (n > 0x0fffffff) throw Error("Evento MIDI muito distante.");
    const a = [n & 127];
    while ((n >>>= 7)) a.unshift((n & 127) | 128);
    return a;
  };
  const u32 = (n) => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];
  function pack(name, data) {
    const out = new Uint8Array(8 + data.length);
    out.set(encoder.encode(name));
    out.set(u32(data.length), 4);
    out.set(data, 8);
    return out;
  }
  function write(project) {
    const p = Core.validate(project),
      ppq = 960,
      chunks = [];
    function encodeTrack(events) {
      events.sort((a, b) => a.tick - b.tick || (a.order ?? 1) - (b.order ?? 1));
      let last = 0;
      const bytes = [];
      for (const e of events) {
        bytes.push(...variable(e.tick - last));
        for (const b of e.data) bytes.push(b);
        last = e.tick;
      }
      bytes.push(
        ...variable(Math.max(last, Math.round(Core.length(p) * ppq)) - last),
        255,
        47,
        0,
      );
      return pack("MTrk", bytes);
    }
    const meta = [];
    for (const t of p.tempos) {
      const us = Math.round(60000000 / t.bpm);
      meta.push({
        tick: Math.round(t.beat * ppq),
        data: [255, 81, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255],
      });
    }
    for (const s of p.signatures)
      meta.push({
        tick: Math.round(s.beat * ppq),
        data: [255, 88, 4, s.numerator, Math.log2(s.denominator), 24, 8],
      });
    chunks.push(encodeTrack(meta));
    const events = Core.events(p, { audible: false });
    const starts = new Map(
      events
        .filter((e) => e.type === "on")
        .map((e) => [e.note, Math.round(e.beat * ppq)]),
    );
    p.tracks.forEach((t, i) => {
      const name = [...encoder.encode(t.name)],
        ev = [
          {
            tick: 0,
            order: -1,
            data: [255, 3, ...variable(name.length), ...name],
          },
        ];
      for (const e of events)
        if (e.track === i) {
          let e2 = e;
          if (e.type === "cc" && e.controller === 7)
            e2 = { ...e, value: Math.round(e.value * t.volume) };
          ev.push({
            tick:
              e.type === "off"
                ? Math.max(
                    Math.round(e.beat * ppq),
                    (starts.get(e.note) ?? 0) + 1,
                  )
                : Math.round(e.beat * ppq),
            order: e.type === "off" ? 0 : e.type === "on" ? 3 : 1,
            data: Core.message(e2, t.channel),
          });
        }
      chunks.push(encodeTrack(ev));
    });
    const head = pack("MThd", [
        0,
        1,
        chunks.length >> 8,
        chunks.length & 255,
        ppq >> 8,
        ppq & 255,
      ]),
      out = new Uint8Array(
        head.length + chunks.reduce((n, c) => n + c.length, 0),
      );
    out.set(head);
    let at = head.length;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
  function read(buffer) {
    if (
      !(buffer instanceof ArrayBuffer) ||
      buffer.byteLength < 14 ||
      buffer.byteLength > 40 * 1024 * 1024
    )
      throw Error("Arquivo MIDI inválido ou maior que 40 MB.");
    // RIFF MIDI stores an SMF in a padded, little-endian data chunk.
    const wrapper = new DataView(buffer);
    const isRIFF =
      new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) === "RIFF";
    const tag = (at) => String.fromCharCode(...new Uint8Array(buffer, at, 4));
    if (isRIFF) {
      const end = wrapper.getUint32(4, true) + 8;
      if (tag(8) !== "RMID" || end > buffer.byteLength || end < 12)
        throw Error("Contêiner RIFF MIDI inválido.");
      let at = 12,
        found = false;
      while (at + 8 <= end) {
        const size = wrapper.getUint32(at + 4, true);
        if (at + 8 + size > end) throw Error("Contêiner RIFF MIDI truncado.");
        if (tag(at) === "data") {
          buffer = buffer.slice(at + 8, at + 8 + size);
          found = true;
          break;
        }
        at += 8 + size + (size & 1);
      }
      if (!found || buffer.byteLength < 14)
        throw Error("Contêiner RIFF MIDI sem dados SMF.");
    }
    const data = new Uint8Array(buffer),
      view = new DataView(buffer);
    let pos = 0,
      limit = data.length,
      totalEvents = 0;
    const ensure = (n) => {
      if (n < 0 || pos + n > limit) throw Error("Arquivo MIDI truncado.");
    };
    const byte = () => {
      ensure(1);
      return data[pos++];
    };
    const str = (n) => {
      ensure(n);
      const s = decoder.decode(data.subarray(pos, pos + n));
      pos += n;
      return s;
    };
    const int16 = () => {
      ensure(2);
      const v = view.getUint16(pos);
      pos += 2;
      return v;
    };
    const int32 = () => {
      ensure(4);
      const v = view.getUint32(pos);
      pos += 4;
      return v;
    };
    const vl = () => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        const b = byte();
        v = (v << 7) | (b & 127);
        if (!(b & 128)) return v;
      }
      throw Error("Delta MIDI inválido.");
    };
    if (str(4) !== "MThd") throw Error("Use um arquivo Standard MIDI (.mid).");
    const header = int32();
    if (header < 6) throw Error("Cabeçalho MIDI inválido.");
    ensure(header);
    const format = int16(),
      nTracks = int16(),
      ppq = int16();
    pos += header - 6;
    if (format > 1)
      throw Error(
        "Formato 2 contém sequências independentes. Converta para formato 0 ou 1.",
      );
    if (ppq & 0x8000 || !ppq)
      throw Error("Divisão SMPTE não suportada; use MIDI PPQ.");
    if (!nTracks || nTracks > 1024) throw Error("Número de pistas inválido.");
    if (format === 0 && nTracks !== 1)
      throw Error("MIDI formato 0 deve conter uma única pista.");
    const tracks = [],
      tempos = [],
      signatures = [],
      warnings = new Set();
    if (isRIFF)
      warnings.add(
        "RIFF MIDI: bancos embutidos e metadados externos ao SMF não são importados.",
      );
    let extent = 0;
    for (let k = 0; k < nTracks; k++) {
      limit = data.length;
      if (str(4) !== "MTrk") throw Error("Chunk de pista MIDI inválido.");
      const bytes = int32();
      ensure(bytes);
      limit = pos + bytes;
      let tick = 0,
        running = 0,
        name = "";
      const byChannel = new Map();
      const get = (ch) => {
        if (!byChannel.has(ch)) {
          const t = Core.makeTrack("", ch === 9 ? "soundfont" : "piano", ch);
          t.volume = 1;
          t.echo = 0;
          t.open = new Map();
          byChannel.set(ch, t);
        }
        return byChannel.get(ch);
      };
      while (pos < limit) {
        if (++totalEvents > 1000000)
          throw Error("O MIDI excede um milhão de eventos.");
        tick += vl();
        extent = Math.max(extent, tick / ppq);
        if (extent > 4096)
          throw Error("O MIDI excede 4096 tempos de semínima.");
        let status = byte();
        if (status < 128) {
          if (!running) throw Error("Running status inválido.");
          pos--;
          status = running;
        }
        if (status === 255) {
          const type = byte(),
            n = vl();
          ensure(n);
          if (type === 47 && n !== 0)
            throw Error("Fim de pista MIDI inválido.");
          if (type === 3) name = decoder.decode(data.subarray(pos, pos + n));
          else if (type === 81) {
            if (n !== 3) throw Error("Evento de andamento inválido.");
            const us = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
            if (!us) throw Error("Andamento nulo.");
            tempos.push({ beat: tick / ppq, bpm: 60000000 / us });
          } else if (type === 88) {
            if (n < 2) throw Error("Compasso inválido.");
            signatures.push({
              beat: tick / ppq,
              numerator: data[pos],
              denominator: 2 ** data[pos + 1],
            });
          } else if (![47, 32, 33].includes(type))
            warnings.add(
              "Textos, letras e metadados não musicais não entram no projeto.",
            );
          pos += n;
          if (type === 47) {
            pos = limit;
            break;
          }
          continue;
        }
        if (status === 240 || status === 247) {
          const n = vl();
          ensure(n);
          pos += n;
          running = 0;
          warnings.add("Mensagens SysEx foram omitidas.");
          continue;
        }
        if (status >= 240)
          throw Error("Mensagem de sistema inválida para SMF.");
        running = status;
        const ch = status & 15,
          kind = status & 240,
          x = byte(),
          y = [192, 208].includes(kind) ? 0 : byte();
        if (x > 127 || y > 127) throw Error("Dado MIDI fora da faixa.");
        const t = get(ch),
          beat = tick / ppq;
        if (kind === 144 && y) {
          const q = t.open.get(x) || [];
          q.push({ start: beat, velocity: y });
          t.open.set(x, q);
        } else if (kind === 128 || kind === 144) {
          const q = t.open.get(x);
          if (q?.length) {
            const n = q.shift();
            t.notes.push({
              id: Core.uid(),
              start: n.start,
              pitch: x,
              velocity: n.velocity,
              duration: Math.max(1 / 3840, 1 / ppq, beat - n.start),
            });
          }
        } else if (kind === 176) {
          t.cc.push({ beat, type: String(x), value: y });
          if (beat === 0 && x === 0) t.bankMSB = y;
          if (beat === 0 && x === 32) t.bankLSB = y;
        } else if (kind === 224)
          t.cc.push({ beat, type: "pitch", value: x + (y << 7) });
        else if (kind === 192) {
          if (beat === 0) t.program = x;
          else t.events.push({ beat, type: "program", value: x });
        } else if (kind === 208)
          t.events.push({ beat, type: "pressure", value: x });
        else if (kind === 160)
          t.events.push({ beat, type: "polyPressure", pitch: x, value: y });
      }
      for (const [ch, t] of byChannel) {
        for (const [pitch, queue] of t.open)
          for (const n of queue) {
            t.notes.push({
              id: Core.uid(),
              ...n,
              pitch,
              duration: Math.max(1 / 3840, 1 / ppq, tick / ppq - n.start),
            });
            warnings.add(
              "Notas sem Note Off foram encerradas no fim da pista.",
            );
          }
        delete t.open;
        t.name = name || `Pista ${k + 1} · canal ${ch + 1}`;
        if (t.notes.length || t.cc.length || t.events.length) tracks.push(t);
      }
    }
    if (!tracks.length) tracks.push(Core.makeTrack("Pista 1"));
    if (tracks.length > 16)
      throw Error(
        "O MIDI contém mais de 16 combinações de pista/canal. Reduza-as antes de importar.",
      );
    extent = Math.max(
      extent,
      ...tracks.map((t) =>
        t.notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0),
      ),
    );
    const p = Core.validate({
      version: 2,
      title: "MIDI importado",
      bpm: 120,
      master: 0.7,
      lengthBeats: Math.max(4, Math.ceil(extent * 4) / 4),
      tempos,
      signatures,
      tracks,
    });
    return { ...p, warnings: [...warnings] };
  }
  const api = { write, read };
  root.Midi = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
