function barAt(beat) {
  let lo = 0,
    hi = bars.length - 1;
  while (lo <= hi) {
    let mid = (lo + hi) >> 1;
    if (bars[mid].start <= beat + 1e-7) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, hi);
}
function buildScoreIndex() {
  scoreIndex = bars.map(() => ({
    onsets: [],
    visible: [],
    lo: Infinity,
    hi: 0,
  }));
  let entries = 0;
  for (const n of result) {
    let from = barAt(n.start);
    scoreIndex[from]?.onsets.push(n);
    for (let i = from; i < bars.length && bars[i].start < n.end - 1e-7; i++) {
      if (++entries > 150000)
        throw Error(
          "Há notas sustentadas por compassos demais. Recorte a seleção para gerar a tablatura.",
        );
      if (n.start < bars[i].end - 1e-7) scoreIndex[i].visible.push(n);
    }
    if (n.s >= 0 && n.f > 0) {
      scoreIndex[from].lo = Math.min(scoreIndex[from].lo, n.f);
      scoreIndex[from].hi = Math.max(scoreIndex[from].hi, n.f);
    }
  }
}
// Record drawing commands, keep lightweight previews, rasterize full-size pages only on export.
function recordingContext(canvas) {
  const c = canvas.getContext("2d");
  c.scale(canvas.width / W, canvas.height / H);
  const commands = [];
  pageCommands.push(commands);
  return new Proxy(c, {
    get(target, key) {
      const v = Reflect.get(target, key, target);
      if (typeof v !== "function") return v;
      if (key === "measureText") return v.bind(target);
      return (...args) => {
        commands.push({ call: key, args });
        return v.apply(target, args);
      };
    },
    set(target, key, value) {
      commands.push({ set: key, value });
      Reflect.set(target, key, value, target);
      return true;
    },
  });
}
function rasterizePage(index, commands = pageCommands, count = pages.length) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  for (const cmd of commands[index]) {
    if (cmd.call) ctx[cmd.call](...cmd.args);
    else ctx[cmd.set] = cmd.value;
  }
  ctx.font = "16px Arial";
  ctx.fillStyle = "#63746d";
  ctx.fillText(index + 1 + " / " + count, W - 130, H - 60);
  return c;
}
function refreshScore() {
  if (!result.length) return;
  stopAudio();
  try {
    render();
    report();
    actionButtons(true);
  } catch (e) {
    $("pages").replaceChildren();
    pages = [];
    pageCommands = [];
    actionButtons(false);
    setStatus(e.message, true);
  }
}
