const W = 1240,
  H = 1754;
function render() {
  const scroll = $("pages").scrollTop,
    oldPng = $("pngpage").value;
  releaseScoreCanvases();
  pages = [];
  pageCommands = [];
  geometry = [];
  hits = [];
  $("pages").replaceChildren();
  let systems = [],
    row = [],
    width = 0;
  const base = Number($("density").value) * 1.7,
    available = W - 155;
  for (let b of bars) {
    const onsets = [
      ...new Set(scoreIndex[b.index - 1].onsets.map((n) => n.start)),
    ].sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < onsets.length; i++)
      minGap = Math.min(minGap, onsets[i] - onsets[i - 1]);
    let bw = Math.max(
      base,
      Math.min(available, ((b.end - b.start) / Math.max(minGap, 0.0625)) * 30),
    );
    if (row.length && width + bw > available) {
      systems.push(row);
      row = [];
      width = 0;
    }
    row.push({ ...b, w: bw });
    width += bw;
  }
  if (row.length) systems.push(row);
  let page,
    ctx,
    y = 0,
    pageIndex = -1;
  const sysH = tuning.length * 27 + 132;
  function newPage() {
    if (pageIndex >= 99)
      throw Error(
        "A tablatura excede 100 páginas. Use a apresentação compacta ou recorte o MIDI.",
      );
    pageIndex++;
    page = document.createElement("canvas");
    const scale = Math.max(
      0.5,
      Math.min(
        1,
        (($("pages").clientWidth - 36) / W) * (window.devicePixelRatio || 1),
      ),
    );
    page.width = Math.round(W * scale);
    page.height = Math.round(H * scale);
    page.setAttribute("aria-label", t("canvasLabel", { n: pageIndex + 1 }));
    ctx = recordingContext(page);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#19332c";
    ctx.font = "bold 34px Arial";
    fitText(ctx, $("title").value || filename, 75, 80, W - 150);
    ctx.font = "18px Arial";
    ctx.fillStyle = "#63746d";
    fitText(
      ctx,
      "TAB  /  " +
        tuning.map(noteName).join(" · ") +
        "  /  " +
        $("track").selectedOptions[0].textContent.slice(0, 76),
      75,
      116,
      W - 150,
    );
    ctx.strokeStyle = "#cbd9d0";
    ctx.beginPath();
    ctx.moveTo(75, 138);
    ctx.lineTo(W - 75, 138);
    ctx.stroke();
    ctx.font = "15px Arial";
    ctx.fillText(t("paperFooter"), 75, H - 60);
    pages.push(page);
    page.className = "score-canvas";
    const wrap = document.createElement("div");
    wrap.className = "sheet";
    wrap.append(page);
    const cursor = document.createElement("div");
    cursor.className = "play-cursor";
    wrap.append(cursor);
    const fx = document.createElement("canvas");
    fx.className = "fx-layer";
    fx.width = 1;
    fx.height = 1;
    fx.setAttribute("aria-hidden", "true");
    wrap.append(fx);
    $("pages").append(wrap);
    y = 190;
  }
  newPage();
  for (let system of systems) {
    if (y + sysH > H - 110) newPage();
    let stretch = available / system.reduce((s, b) => s + b.w, 0),
      x = 105;
    ctx.font = "17px Arial";
    ctx.fillStyle = "#64766c";
    for (let s = 0; s < tuning.length; s++)
      ctx.fillText(noteName(tuning[s]), 48, y + 50 + s * 27 + 6);
    for (let b of system) {
      let bw = b.w * stretch,
        left = x + 15,
        right = x + bw - 12,
        scale = (right - left) / (b.end - b.start),
        yy = y + 50;
      ctx.fillStyle = "#223d32";
      ctx.font = "bold 18px Arial";
      ctx.fillText(String(b.index), x, y - 5);
      ctx.font = "16px Arial";
      let signatureChange =
        b.index === 1 ||
        bars[b.index - 2].num !== b.num ||
        bars[b.index - 2].den !== b.den;
      if (signatureChange) ctx.fillText(b.num + "/" + b.den, x + 36, y - 5);
      let tempos = scoreTempos().filter(
        (t) =>
          t.tick / midi.ppq - offset >= b.start - 1e-7 &&
          t.tick / midi.ppq - offset < b.end - 1e-7,
      );
      if (b.index === 1 && !tempos.length) {
        let t = scoreTempos()
          .filter((t) => t.tick / midi.ppq <= offset)
          .at(-1);
        if (t) tempos = [{ ...t, tick: offset * midi.ppq }];
      }
      for (let t of tempos) {
        let tx = left + (t.tick / midi.ppq - offset - b.start) * scale;
        ctx.fillStyle = "#477465";
        ctx.fillText("♩ = " + Math.round(60000000 / t.us), tx, y + 18);
      }
      ctx.strokeStyle = "#96a69e";
      ctx.lineWidth = 1.1;
      for (let s = 0; s < tuning.length; s++) {
        ctx.beginPath();
        ctx.moveTo(x, yy + s * 27);
        ctx.lineTo(x + bw, yy + s * 27);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x, yy + (tuning.length - 1) * 27);
      ctx.moveTo(x + bw, yy);
      ctx.lineTo(x + bw, yy + (tuning.length - 1) * 27);
      ctx.stroke();
      ctx.font = "13px Arial";
      ctx.fillStyle = "#839289";
      for (
        let beat = b.start, k = 1;
        beat < b.end - 1e-7;
        beat += 4 / b.den, k++
      ) {
        let bx = left + (beat - b.start) * scale;
        ctx.fillText(String(k), bx - 4, yy - 15);
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = "#e0e7e2";
        ctx.beginPath();
        ctx.moveTo(bx, yy + 8);
        ctx.lineTo(bx, yy + (tuning.length - 1) * 27);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const visible = scoreIndex[b.index - 1].visible;
      let lostIdx = 0;
      for (let n of visible) {
        let nx = left + (Math.max(n.start, b.start) - b.start) * scale,
          ex = left + (Math.min(n.end, b.end) - b.start) * scale,
          ny = yy + n.s * 27;
        const cont = n.start < b.start - 1e-7;
        if (n.s < 0) {
          if (cont) continue;
          ctx.fillStyle = "#b94b32";
          ctx.font = "bold 16px Arial";
          ctx.fillText(
            "!",
            nx,
            yy + tuning.length * 27 + 18 + (lostIdx % 2) * 20,
          );
          lostIdx++;
          hits.push({
            page: pageIndex,
            x: nx,
            y: yy + tuning.length * 27 + 12 + ((lostIdx - 1) % 2) * 20,
            id: n.id,
          });
          continue;
        }
        ctx.strokeStyle = "#b5c6bd";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(nx + 9, ny + 8);
        ctx.lineTo(Math.max(nx + 10, ex - 3), ny + 8);
        ctx.stroke();
        let text = cont ? "—" : String(n.f);
        ctx.font = "bold 20px monospace";
        let tw = ctx.measureText(text).width;
        ctx.fillStyle = "#fff";
        ctx.fillRect(nx - tw / 2 - 3, ny - 12, tw + 6, 24);
        ctx.fillStyle = "#152f25";
        ctx.textAlign = "center";
        ctx.fillText(text, nx, ny + 7);
        ctx.textAlign = "left";
        hits.push({ page: pageIndex, x: nx, y: ny, id: n.id });
      }
      geometry.push({
        page: pageIndex,
        start: b.start,
        end: b.end,
        left,
        right,
        y: yy - 10,
        height: tuning.length * 27 + 12,
      });
      x += bw;
    }
    y += sysH;
  }
  const missing = result.filter((n) => n.s < 0);
  if (missing.length) {
    newPage();
    ctx.font = "bold 23px Arial";
    ctx.fillStyle = "#a7452d";
    ctx.fillText(t("missingTitle"), 75, y);
    y += 38;
    ctx.font = "17px Arial";
    ctx.fillStyle = "#64766c";
    ctx.fillText(t("missingHelp"), 75, y);
    y += 42;
    for (let n of missing) {
      if (y > H - 130) {
        newPage();
        ctx.font = "bold 23px Arial";
        ctx.fillStyle = "#a7452d";
        ctx.fillText(t("missingContinue"), 75, y);
        y += 42;
      }
      let bar = bars[barAt(n.start)];
      ctx.font = "18px monospace";
      ctx.fillStyle = "#263d33";
      ctx.fillText(
        noteName(n.pitch) +
          " (MIDI " +
          n.pitch +
          ")   Compasso " +
          (bar?.index ?? "?") +
          "   " +
          t("onset") +
          " " +
          n.start.toFixed(4) +
          "   " +
          t("duration") +
          " " +
          (n.end - n.start).toFixed(4),
        75,
        y,
      );
      y += 29;
    }
  }
  pages.forEach((c, i) => {
    let cc = c.getContext("2d");
    cc.font = "16px Arial";
    cc.fillStyle = "#63746d";
    cc.fillText(i + 1 + " / " + pages.length, W - 130, H - 60);
    c.onclick = (e) => editAt(e, c, i);
    c.setAttribute("title", t("canvasTitle"));
  });
  $("pngpage").replaceChildren();
  pages.forEach((c, i) => {
    let op = document.createElement("option");
    op.value = i;
    op.textContent = t("page", { n: i + 1 });
    $("pngpage").append(op);
  });
  $("pngpage").value = String(Math.min(Number(oldPng) || 0, pages.length - 1));
  $("pages").scrollTop = scroll;
  rebuildAnimation();
  refreshTransport();
}
function fitText(ctx, t, x, y, w) {
  let s = ctx.font;
  while (
    ctx.measureText(t).width > w &&
    parseInt(ctx.font.match(/\d+/)[0]) > 18
  ) {
    let size = parseInt(ctx.font.match(/\d+/)[0]);
    ctx.font = ctx.font.replace(size + "px", size - 1 + "px");
  }
  if (ctx.measureText(t).width > w) {
    while (t.length && ctx.measureText(t + "…").width > w) t = t.slice(0, -1);
    t += "…";
  }
  ctx.fillText(t, x, y);
  ctx.font = s;
}
function editAt(e, c, pi) {
  let r = c.getBoundingClientRect(),
    x = ((e.clientX - r.left) * W) / r.width,
    y = ((e.clientY - r.top) * H) / r.height;
  let h = hits
    .filter(
      (h) => h.page === pi && Math.abs(h.x - x) < 18 && Math.abs(h.y - y) < 16,
    )
    .sort(
      (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
    )[0];
  if (!h) {
    const g = geometry.find(
      (g) =>
        g.page === pi &&
        x >= g.left - 15 &&
        x <= g.right + 12 &&
        y >= g.y - 40 &&
        y <= g.y + g.height + 35,
    );
    if (g)
      seekBeat(
        g.start +
          Math.max(0, Math.min(1, (x - g.left) / (g.right - g.left))) *
            (g.end - g.start),
      );
    return;
  }
  selected = h.id;
  let n = result.find((n) => n.id === selected);
  $("editlabel").textContent =
    noteName(n.pitch) +
    " · " +
    t("beat") +
    " " +
    (n.start + 1).toFixed(3) +
    " — ";
  $("positions").replaceChildren();
  for (let o of optionsFor(n, tuning, Number($("frets").value))) {
    let op = document.createElement("option");
    op.value = o.s;
    op.textContent =
      t("string") +
      " " +
      (o.s + 1) +
      " (" +
      noteName(tuning[o.s]) +
      "), " +
      t("fret") +
      " " +
      o.f;
    op.selected = o.s === n.s;
    $("positions").append(op);
  }
  let op = document.createElement("option");
  op.value = "-1";
  op.textContent = t("unassigned");
  op.selected = n.s < 0;
  $("positions").append(op);
  $("edit").classList.add("visible");
  $("positions").focus();
}
