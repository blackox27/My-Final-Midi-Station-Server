function getTuning() {
  const tokens = $("tuning")
    .value.trim()
    .split(/[\s,;]+/);
  if (tokens.length < 3 || tokens.length > 8)
    throw Error("Informe de 3 a 8 cordas.");
  return tokens.map((s) => {
    if (/^\d+$/.test(s)) {
      let n = Number(s);
      if (n <= 127) return n;
    }
    let m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(s);
    if (m) {
      let n =
        { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] +
        (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) +
        (Number(m[3]) + 1) * 12;
      if (n >= 0 && n <= 127) return n;
    }
    throw Error("Afinação inválida: " + s + ". Exemplo: E4 B3 G3 D3 A2 E2.");
  });
}
function optionsFor(n, tune, max) {
  return tune.flatMap((p, s) =>
    n.pitch - p >= 0 && n.pitch - p <= max ? [{ s, f: n.pitch - p }] : [],
  );
}
// Bounded beam search assigns every onset against notes still ringing on each string.
function assignNotes(notes, tune, max) {
  let beam = [
    {
      cost: 0,
      lost: 0,
      until: tune.map(() => -1),
      frets: tune.map(() => 0),
      pos: 0,
      path: null,
    },
  ];
  let lastStart = -1;
  for (let idx = 0; idx < notes.length; idx++) {
    const n = notes[idx],
      opts = optionsFor(n, tune, max),
      next = [];
    for (const st of beam) {
      for (const o of opts) {
        if (st.until[o.s] > n.start + 1e-7) continue;
        const until = st.until.slice(),
          frets = st.frets.slice();
        until[o.s] = n.end;
        frets[o.s] = o.f;
        let lo = Infinity,
          hi = 0;
        for (let s = 0; s < tune.length; s++)
          if (until[s] > n.start + 1e-7 && frets[s] > 0) {
            lo = Math.min(lo, frets[s]);
            hi = Math.max(hi, frets[s]);
          }
        const span = hi ? hi - lo : 0,
          pos = o.f || st.pos;
        const cost =
          st.cost +
          o.f * 0.06 +
          Math.abs(pos - st.pos) *
            (Math.abs(n.start - lastStart) < 1e-7 ? 0.1 : 0.55) +
          Math.max(0, span - 4) ** 2 * 2 +
          (o.f === 0 ? 0 : 0.15);
        next.push({
          cost,
          lost: st.lost,
          until,
          frets,
          pos,
          path: { prev: st.path, idx, s: o.s, f: o.f },
        });
      }
      next.push({
        ...st,
        lost: st.lost + 1,
        path: { prev: st.path, idx, s: -1, f: -1 },
      });
    }
    next.sort((a, b) => a.lost - b.lost || a.cost - b.cost);
    const seen = new Set();
    beam = [];
    for (const st of next) {
      const key =
        st.until
          .map((v, s) =>
            v > n.start + 1e-7 ? v.toFixed(7) + ":" + st.frets[s] : "-",
          )
          .join("|") +
        "/" +
        st.pos;
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(st);
      if (beam.length === 32) break;
    }
    lastStart = n.start;
  }
  const out = notes.map((n) => ({ ...n, s: -1, f: -1 }));
  for (let path = beam[0]?.path; path; path = path.prev) {
    out[path.idx].s = path.s;
    out[path.idx].f = path.f;
  }
  return out;
}
function assignAsync(notes, tune, max) {
  return new Promise((resolve, reject) => {
    pendingAssignReject = reject;
    const code =
      optionsFor.toString() +
      "\n" +
      assignNotes.toString() +
      "\nonmessage=e=>{try{postMessage({notes:assignNotes(e.data.notes,e.data.tune,e.data.max)})}catch(err){postMessage({error:err.message})}}";
    let url;
    try {
      url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      assignmentWorker = w;
      w.onmessage = (e) => {
        pendingAssignReject = null;
        w.terminate();
        if (assignmentWorker === w) assignmentWorker = null;
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data.notes);
      };
      w.onerror = (e) => {
        pendingAssignReject = null;
        w.terminate();
        if (assignmentWorker === w) assignmentWorker = null;
        reject(Error(e.message || "Falha ao calcular a digitação."));
      };
      w.postMessage({ notes, tune, max });
    } catch (e) {
      pendingAssignReject = null;
      if (url) URL.revokeObjectURL(url);
      resolve(assignNotes(notes, tune, max));
    }
  });
}
function makeBars(endBeat, sigs, ppq, startOffset) {
  let out = [],
    cursor = 0,
    si = 0;
  const signatures = sigs.map((s) => ({
    ...s,
    beat: s.tick / ppq - startOffset,
  }));
  while (si + 1 < signatures.length && signatures[si + 1].beat <= 0) si++;
  while (cursor < endBeat - 1e-7) {
    if (out.length >= 4000)
      throw Error(
        "Música longa demais: limite de 4.000 compassos. Recorte a pista antes de importar.",
      );
    while (
      si + 1 < signatures.length &&
      signatures[si + 1].beat <= cursor + 1e-7
    )
      si++;
    let sig = signatures[si],
      next = signatures[si + 1]?.beat ?? Infinity,
      finish = Math.min(cursor + (sig.num * 4) / sig.den, next);
    if (finish <= cursor + 1e-7) {
      si++;
      continue;
    }
    out.push({
      start: cursor,
      end: finish,
      num: sig.num,
      den: sig.den,
      index: out.length + 1,
    });
    cursor = finish;
  }
  return out;
}
