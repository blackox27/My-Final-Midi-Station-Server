/* Aurora musical model. Quantization adapted from PulseForge MIDI (MIT). */
(function (root) {
  const uid = () => globalThis.crypto.randomUUID();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, a, b) =>
    typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
  const length = (p) => p.lengthBeats ?? p.bars * 4;
  const makeTrack = (
    name = "Instrumento",
    instrument = "piano",
    channel = 0,
  ) => ({
    id: uid(),
    name,
    instrument,
    channel,
    program: 0,
    bankMSB: 0,
    bankLSB: 0,
    drum: channel === 9,
    notes: [],
    cc: [],
    events: [],
    volume: 0.8,
    pan: 0,
    glide: 0,
    echo: 0.18,
    root: 60,
    mute: false,
    solo: false,
  });
  function tempoMap(p) {
    const all = (p.tempos?.length ? p.tempos : [{ beat: 0, bpm: p.bpm }])
      .map((t) => ({ ...t }))
      .sort((a, b) => a.beat - b.beat);
    if (all[0].beat !== 0) all.unshift({ beat: 0, bpm: p.bpm });
    const unique = [];
    for (const t of all) {
      if (unique.at(-1)?.beat === t.beat) unique[unique.length - 1] = t;
      else unique.push(t);
    }
    let seconds = 0;
    return unique.map((t, i) => {
      if (i)
        seconds += ((t.beat - unique[i - 1].beat) * 60) / unique[i - 1].bpm;
      return { ...t, seconds };
    });
  }
  function clock(p) {
    const map = tempoMap(p);
    function segment(value, key) {
      let lo = 0,
        hi = map.length;
      while (lo + 1 < hi) {
        const m = (lo + hi) >> 1;
        if (map[m][key] <= value) lo = m;
        else hi = m;
      }
      return map[lo];
    }
    return {
      toSeconds(beat) {
        const s = segment(Math.max(0, beat), "beat");
        return s.seconds + ((beat - s.beat) * 60) / s.bpm;
      },
      toBeat(seconds) {
        const s = segment(Math.max(0, seconds), "seconds");
        return s.beat + ((seconds - s.seconds) * s.bpm) / 60;
      },
      bpmAt(beat) {
        return segment(beat, "beat").bpm;
      },
    };
  }
  function measures(p) {
    const sigs = (
        p.signatures?.length
          ? p.signatures
          : [{ beat: 0, numerator: 4, denominator: 4 }]
      )
        .slice()
        .sort((a, b) => a.beat - b.beat),
      out = [];
    let beat = 0,
      i = 0;
    while (beat < length(p) - 1e-8 && out.length < 40960) {
      while (i + 1 < sigs.length && sigs[i + 1].beat <= beat + 1e-8) i++;
      const s = sigs[i],
        duration = (s.numerator * 4) / s.denominator;
      let end = Math.min(length(p), beat + duration);
      if (sigs[i + 1] && sigs[i + 1].beat < end) end = sigs[i + 1].beat;
      out.push({
        beat,
        end,
        numerator: s.numerator,
        denominator: s.denominator,
      });
      beat = end;
    }
    return out;
  }
  function validate(input) {
    if (
      !input ||
      !Array.isArray(input.tracks) ||
      !input.tracks.length ||
      input.tracks.length > 16
    )
      throw Error("O projeto deve ter de 1 a 16 pistas.");
    const p = structuredClone(input),
      seen = new Set();
    p.version = 3;
    // Aurora 1/2 used a single global bank. Migrate without changing its sound.
    const legacyBank = p.soundBank?.id;
    p.soundBanks = p.soundBanks ?? (legacyBank ? [p.soundBank] : []);
    if (!Array.isArray(p.soundBanks) || p.soundBanks.length > 16)
      throw Error("O projeto aceita até 16 bancos de sons.");
    const bankIds = new Set();
    p.soundBanks = p.soundBanks.map((bank) => {
      if (
        !bank ||
        typeof bank.id !== "string" ||
        !bank.id ||
        bankIds.has(bank.id)
      )
        throw Error("Referência de banco de sons inválida ou duplicada.");
      bankIds.add(bank.id);
      return {
        id: bank.id,
        name: String(bank.name || "SoundFont").slice(0, 240),
      };
    });
    delete p.soundBank;
    p.title = String(p.title || "Sem título").slice(0, 120);
    if (!finite(p.bpm, 10, 1000)) throw Error("Andamento inválido.");
    p.lengthBeats = p.lengthBeats ?? p.bars * 4;
    if (!finite(p.lengthBeats, 1 / 16, 4096))
      throw Error("O limite é de 4096 tempos de semínima.");
    p.bars = Math.ceil(p.lengthBeats / 4);
    p.master = finite(p.master, 0, 1) ? p.master : 0.7;
    const id = (v) => {
      if (typeof v !== "string" || !v || seen.has(v)) v = uid();
      seen.add(v);
      return v;
    };
    if (p.tempos != null && !Array.isArray(p.tempos))
      throw Error("Mapa de andamento inválido.");
    if (p.signatures != null && !Array.isArray(p.signatures))
      throw Error("Mapa de compassos inválido.");
    p.tempos = p.tempos?.length ? p.tempos : [{ beat: 0, bpm: p.bpm }];
    if (p.tempos.length > 8192) throw Error("Mapa de andamento muito grande.");
    for (const t of p.tempos)
      if (!t || !finite(t.beat, 0, p.lengthBeats) || !finite(t.bpm, 10, 1000))
        throw Error("Mapa de andamento inválido.");
    p.tempos = tempoMap(p).map(({ beat, bpm }) => ({ beat, bpm }));
    p.bpm = p.tempos[0].bpm;
    p.signatures = p.signatures?.length
      ? p.signatures
      : [{ beat: 0, numerator: 4, denominator: 4 }];
    if (p.signatures.length > 8192)
      throw Error("Mapa de compassos muito grande.");
    for (const s of p.signatures)
      if (
        !s ||
        !finite(s.beat, 0, p.lengthBeats) ||
        !Number.isInteger(s.numerator) ||
        !finite(s.numerator, 1, 32) ||
        ![1, 2, 4, 8, 16, 32].includes(s.denominator)
      )
        throw Error("Fórmula de compasso inválida.");
    p.signatures = [
      ...new Map(p.signatures.map((s) => [s.beat, s])).values(),
    ].sort((a, b) => a.beat - b.beat);
    if (p.signatures[0].beat !== 0)
      p.signatures.unshift({ beat: 0, numerator: 4, denominator: 4 });
    for (let i = 0; i < p.tracks.length; i++) {
      const t = p.tracks[i];
      if (!t || typeof t !== "object" || Array.isArray(t))
        throw Error("Pista inválida.");
      t.soundBankId = t.soundBankId ?? legacyBank ?? null;
      if (t.soundBankId !== null && !bankIds.has(t.soundBankId))
        throw Error("A pista referencia um banco de sons ausente.");
      t.id = id(t.id);
      t.name = String(t.name || `Pista ${i + 1}`).slice(0, 80);
      t.channel =
        Number.isInteger(t.channel) && finite(t.channel, 0, 15) ? t.channel : i;
      if (
        !Array.isArray(t.notes) ||
        t.notes.length > 100000 ||
        !Array.isArray(t.cc) ||
        t.cc.length > 100000
      )
        throw Error("Pista inválida ou muito grande.");
      for (const [key, min, max, def] of [
        ["volume", 0, 1, 0.8],
        ["pan", -1, 1, 0],
        ["echo", 0, 0.65, 0],
        ["glide", 0, 400, 0],
        ["root", 0, 127, 60],
        ["program", 0, 127, 0],
        ["bankMSB", 0, 127, 0],
        ["bankLSB", 0, 127, 0],
      ])
        t[key] = finite(t[key], min, max) ? t[key] : def;
      t.program = Math.round(t.program);
      t.bankMSB = Math.round(t.bankMSB);
      t.bankLSB = Math.round(t.bankLSB);
      t.root = Math.round(t.root);
      t.mute = !!t.mute;
      t.solo = !!t.solo;
      t.drum = typeof t.drum === "boolean" ? t.drum : t.channel === 9;
      if (
        ![
          "piano",
          "sine",
          "triangle",
          "sawtooth",
          "square",
          "sample",
          "soundfont",
        ].includes(t.instrument)
      )
        t.instrument = "piano";
      for (const n of t.notes) {
        if (
          !n ||
          !finite(n.start, 0, p.lengthBeats) ||
          !finite(n.duration, 1 / 3840, p.lengthBeats) ||
          n.start + n.duration > p.lengthBeats + 1e-6 ||
          !Number.isInteger(n.pitch) ||
          !finite(n.pitch, 0, 127) ||
          !Number.isInteger(n.velocity) ||
          !finite(n.velocity, 1, 127)
        )
          throw Error("Nota inválida ou fora da duração do projeto.");
        n.id = id(n.id);
      }
      for (const c of t.cc) {
        if (
          !c ||
          !finite(c.beat, 0, p.lengthBeats) ||
          !(
            c.type === "pitch" ||
            (/^\d{1,3}$/.test(c.type) && +c.type <= 127)
          ) ||
          !Number.isInteger(c.value) ||
          !finite(c.value, 0, c.type === "pitch" ? 16383 : 127)
        )
          throw Error("Automação inválida.");
        c.id = id(c.id);
        c.type = String(c.type);
      }
      t.events = t.events || [];
      if (!Array.isArray(t.events) || t.events.length > 100000)
        throw Error("Muitos eventos MIDI.");
      for (const e of t.events)
        if (
          !e ||
          !finite(e.beat, 0, p.lengthBeats) ||
          !["program", "pressure", "polyPressure"].includes(e.type) ||
          !Number.isInteger(e.value) ||
          !finite(e.value, 0, 127) ||
          (e.type === "polyPressure" &&
            (!Number.isInteger(e.pitch) || !finite(e.pitch, 0, 127)))
        )
          throw Error("Evento MIDI inválido.");
      if (t.sampleId !== undefined && typeof t.sampleId !== "string")
        throw Error("Referência de sample inválida.");
    }
    return p;
  }
  function snap(beat, grid, swing = 0) {
    if (!grid) return Math.max(0, beat);
    const step = Math.max(0, Math.round(beat / grid));
    return Math.max(
      0,
      step * grid + (step % 2 ? clamp(swing, -0.95, 0.95) * grid * 0.5 : 0),
    );
  }
  function quantize(
    notes,
    { grid = 0.25, strength = 1, swing = 0, ends = false },
    end = Infinity,
  ) {
    if (!grid) return;
    for (const n of notes) {
      const oldEnd = n.start + n.duration,
        start =
          n.start +
          (snap(n.start, grid, swing) - n.start) * clamp(strength, 0, 1);
      let newEnd = ends
        ? oldEnd + (snap(oldEnd, grid, swing) - oldEnd) * clamp(strength, 0, 1)
        : start + n.duration;
      n.start = clamp(start, 0, end - 1 / 3840);
      n.duration = clamp(newEnd - n.start, 1 / 3840, end - n.start);
    }
  }
  function initialEvents(t, index) {
    const e = (type, value, extra = {}) => ({
      beat: 0,
      track: index,
      type,
      value,
      ...extra,
    });
    return [
      e("cc", t.bankMSB, { controller: 0 }),
      e("cc", t.bankLSB, { controller: 32 }),
      e("program", t.program),
      e("cc", 127, { controller: 7 }),
      e("cc", Math.round((t.pan + 1) * 63.5), { controller: 10 }),
      e("cc", 127, { controller: 11 }),
      e("cc", 0, { controller: 1 }),
      e("cc", 0, { controller: 64 }),
      e("pitch", 8192),
      e("cc", 0, { controller: 101 }),
      e("cc", 0, { controller: 100 }),
      e("cc", 2, { controller: 6 }),
      e("cc", 127, { controller: 101 }),
      e("cc", 127, { controller: 100 }),
      e("cc", t.glide ? 127 : 0, { controller: 65 }),
      e("cc", Math.round((t.glide / 400) * 127), { controller: 5 }),
    ];
  }
  const order = (e) => (e.type === "off" ? 0 : e.type === "on" ? 3 : 1);
  function events(p, { audible = true } = {}) {
    const out = [],
      solo = p.tracks.some((t) => t.solo);
    p.tracks.forEach((t, i) => {
      if (audible && (t.mute || (solo && !t.solo))) return;
      out.push(...initialEvents(t, i));
      for (const n of t.notes) {
        out.push(
          {
            beat: n.start,
            type: "on",
            track: i,
            note: n.id,
            pitch: n.pitch,
            value: n.velocity,
          },
          {
            beat: n.start + n.duration,
            type: "off",
            track: i,
            note: n.id,
            pitch: n.pitch,
            value: 0,
          },
        );
      }
      for (const c of t.cc)
        out.push({
          beat: c.beat,
          track: i,
          type: c.type === "pitch" ? "pitch" : "cc",
          controller: +c.type,
          value: c.value,
        });
      for (const e of t.events || []) out.push({ ...e, track: i });
    });
    out.sort((a, b) => a.beat - b.beat || order(a) - order(b));
    return out;
  }
  function message(e, channel) {
    if (e.type === "on") return [144 | channel, e.pitch, e.value];
    if (e.type === "off") return [128 | channel, e.pitch, 0];
    if (e.type === "pitch") return [224 | channel, e.value & 127, e.value >> 7];
    if (e.type === "cc") return [176 | channel, e.controller, e.value];
    if (e.type === "program") return [192 | channel, e.value];
    if (e.type === "pressure") return [208 | channel, e.value];
    if (e.type === "polyPressure") return [160 | channel, e.pitch, e.value];
    throw Error("Evento desconhecido");
  }
  function pulseForge(source) {
    if (source.format !== "PulseForge MIDI Project")
      throw Error("Projeto PulseForge inválido.");
    const lanes = [null, "1", "7", "10", "11", "64", "pitch"];
    const p = {
      version: 2,
      title: source.title,
      bpm: source.tempo,
      lengthBeats: source.lengthBeats,
      master: 0.7,
      signatures: [
        {
          beat: 0,
          numerator: source.numerator || 4,
          denominator: source.denominator || 4,
        },
      ],
      tracks: [],
    };
    for (const src of source.tracks || []) {
      const channels = new Set([
        src.channel || 1,
        ...(src.notes || []).map((n) => n.channel || src.channel || 1),
        ...(src.automation || []).map((c) => c.channel || src.channel || 1),
      ]);
      for (const ch of channels) {
        const t = makeTrack(src.name, "piano", ch - 1);
        t.mute = src.muted;
        t.solo = src.solo;
        t.notes = (src.notes || [])
          .filter((n) => (n.channel || src.channel || 1) === ch)
          .map((n) => ({
            id: uid(),
            pitch: n.pitch,
            start: n.start,
            duration: n.length,
            velocity: n.velocity,
          }));
        t.cc = (src.automation || [])
          .filter(
            (c) => (c.channel || src.channel || 1) === ch && lanes[c.lane],
          )
          .map((c) => ({
            beat: c.beat,
            type: lanes[c.lane],
            value: Math.round(
              clamp(c.value, 0, 1) * (c.lane === 6 ? 16383 : 127),
            ),
          }));
        for (const n of src.notes || [])
          if (
            (n.channel || src.channel || 1) === ch &&
            n.glideSemitones &&
            n.glideBeats
          ) {
            const span = Math.min(n.glideBeats, n.length);
            for (let j = 1; j <= 24; j++)
              t.cc.push({
                beat: n.start + (span * j) / 24,
                type: "pitch",
                value: Math.round(
                  clamp(8192 + (n.glideSemitones * 4096 * j) / 24, 0, 16383),
                ),
              });
            t.cc.push({ beat: n.start + n.length, type: "pitch", value: 8192 });
          }
        if (t.notes.length || t.cc.length || channels.size === 1)
          p.tracks.push(t);
      }
    }
    return validate(p);
  }
  class History {
    constructor(limit = 100) {
      this.limit = limit;
      this.past = [];
      this.future = [];
    }
    push(p) {
      const value = JSON.stringify(p);
      if (this.past.at(-1) !== value) {
        this.past.push(value);
        if (this.past.length > this.limit) this.past.shift();
      }
      this.future = [];
    }
    undo(p) {
      if (!this.past.length) return null;
      this.future.push(JSON.stringify(p));
      return JSON.parse(this.past.pop());
    }
    redo(p) {
      if (!this.future.length) return null;
      this.past.push(JSON.stringify(p));
      return JSON.parse(this.future.pop());
    }
  }
  const api = {
    uid,
    clamp,
    finite,
    length,
    makeTrack,
    validate,
    tempoMap,
    clock,
    measures,
    snap,
    quantize,
    events,
    message,
    pulseForge,
    initialEvents,
    History,
  };
  root.Core = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
