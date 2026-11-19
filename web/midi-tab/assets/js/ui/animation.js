"use strict";
const STRING_COLORS = [
  "#15b9a2",
  "#d69724",
  "#7285df",
  "#e06f97",
  "#4bafd1",
  "#9e79d5",
  "#60a878",
  "#cb884d",
];
let fxSurfaces = [],
  fxHits = new Map(),
  fxPage = -1,
  followKey = "",
  lastLive = "";
function rebuildAnimation() {
  fxSurfaces = [...$("pages").querySelectorAll(".sheet")].map((sheet, i) => ({
    sheet,
    canvas: sheet.querySelector(".fx-layer"),
    cursor: sheet.querySelector(".play-cursor"),
    base: pages[i],
  }));
  fxHits = new Map();
  for (const h of hits) {
    if (!fxHits.has(h.id)) fxHits.set(h.id, []);
    fxHits.get(h.id).push(h);
  }
  fxPage = -1;
  followKey = "";
}
function clearFxPage(index) {
  const f = fxSurfaces[index];
  if (f) {
    f.cursor.style.display = "none";
    f.canvas.width = 1;
    f.canvas.height = 1;
  }
}
function paintPlayback(beat) {
  const live =
      transport.state !== "stopped" &&
      timeline &&
      bars.length > 0 &&
      beat >= 0 &&
      beat < scoreEnd,
    idx = live ? barAt(beat) : 0,
    g = live ? geometry[idx] : null,
    active = live
      ? (scoreIndex[idx]?.visible ?? []).filter(
          (n) => n.start <= beat + 1e-6 && n.end > beat + 1e-6,
        )
      : [];
  const page = g?.page ?? -1;
  if (fxPage !== page) {
    clearFxPage(fxPage);
    fxPage = page;
  }
  for (const f of fxSurfaces) f.cursor.style.display = "none";
  if (g && beat < g.end && transport.state !== "stopped") {
    const f = fxSurfaces[page];
    if (f) {
      f.cursor.style.display = "block";
      f.cursor.style.left =
        ((g.left +
          ((beat - g.start) / (g.end - g.start)) * (g.right - g.left)) /
          W) *
          100 +
        "%";
      f.cursor.style.top = (g.y / H) * 100 + "%";
      f.cursor.style.height = (g.height / H) * 100 + "%";
      const enabled = $("animate").checked,
        reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (enabled) {
        const c = f.canvas;
        if (c.width !== f.base.width || c.height !== f.base.height) {
          c.width = f.base.width;
          c.height = f.base.height;
        }
        const ctx = c.getContext("2d");
        ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#30bb9220";
        ctx.fillRect(g.left - 10, g.y - 8, g.right - g.left + 21, g.height + 8);
        for (const n of active) {
          if (n.s < 0) continue;
          for (const h of fxHits.get(n.id) ?? []) {
            if (h.page !== page) continue;
            const elapsed = Math.max(0, beat - n.start),
              pulse = reduced ? 0 : Math.max(0, 1 - elapsed * 3);
            ctx.fillStyle = STRING_COLORS[n.s % STRING_COLORS.length];
            ctx.globalAlpha = 0.14 + pulse * 0.2;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 17 + pulse * 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.font = "bold 21px monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#07574b";
            ctx.fillText(String(n.f), h.x, h.y + 7);
          }
        }
      } else if (f.canvas.width > 1) {
        f.canvas.width = 1;
        f.canvas.height = 1;
      }
      const key = page + ":" + g.y;
      if (
        $("follow").checked &&
        transport.state === "playing" &&
        key !== followKey
      ) {
        followKey = key;
        const box = $("pages"),
          top =
            f.sheet.offsetTop -
            box.offsetTop +
            (g.y / H) * f.sheet.clientHeight;
        if (
          top < box.scrollTop + 24 ||
          top + (g.height / H) * f.sheet.clientHeight >
            box.scrollTop + box.clientHeight - 35
        )
          box.scrollTo({
            top: Math.max(0, top - 70),
            behavior: reduced ? "auto" : "smooth",
          });
      }
    }
  } else clearFxPage(fxPage);
  drawLiveStrings(active, beat);
}
function drawLiveStrings(active = [], beat = 0) {
  const c = $("strings");
  if (!c) return;
  const rect = c.getBoundingClientRect(),
    ratio = Math.min(2, window.devicePixelRatio || 1),
    w = Math.max(250, Math.round(rect.width * ratio)),
    h = Math.round(140 * ratio);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = w / ratio,
    height = h / ratio;
  ctx.clearRect(0, 0, width, height);
  const tune = tuning.length
      ? tuning
      : currentInstrument().notes || [64, 59, 55, 50, 45, 40],
    reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    animated =
      $("animate").checked && !reduced && transport.state === "playing";
  for (let s = 0; s < tune.length; s++) {
    const y = 18 + (s * (height - 34)) / Math.max(1, tune.length - 1),
      n = active.find((n) => n.s === s),
      col = STRING_COLORS[s % STRING_COLORS.length];
    ctx.strokeStyle = n ? col : theme === "light" ? "#b0c2ca" : "#354c6b";
    ctx.lineWidth = n ? 2 : 1 + s * 0.12;
    ctx.beginPath();
    for (let x = 45; x <= width - 45; x += 4) {
      const phase = (beat - (n?.start ?? 0)) * 30,
        amp =
          n && animated
            ? Math.min(5, 2 + 3 * Math.exp(-Math.max(0, beat - n.start) * 2))
            : 0,
        v =
          Math.sin(((x - 45) / (width - 90)) * Math.PI) *
          Math.sin(x * 0.1 - phase) *
          amp;
      if (x === 45) ctx.moveTo(x, y + v);
      else ctx.lineTo(x, y + v);
    }
    ctx.stroke();
    ctx.fillStyle = n ? col : theme === "light" ? "#4a6878" : "#95abc7";
    ctx.font = "11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(noteName(tune[s]), 0, y + 4);
    ctx.textAlign = "right";
    ctx.fillText(n ? String(n.f) : "·", width - 5, y + 4);
  }
  const label = active.length
    ? active
        .slice(0, 8)
        .map((n) => noteName(n.pitch))
        .join(" · ")
    : transport.state !== "stopped" && $("accompaniment").checked
      ? beat < 0
        ? t("introWait", {
            seconds: Math.max(
              0,
              Math.ceil(
                -timeline.seconds(beat) / (Number($("speed").value) / 100),
              ),
            ),
          })
        : beat >= scoreEnd
          ? t("backingAfter")
          : "—"
      : "—";
  if (label !== lastLive) {
    $("liveNotes").textContent = label;
    lastLive = label;
  }
}

function releaseScoreCanvases() {
  for (const f of fxSurfaces) {
    f.canvas.width = 1;
    f.canvas.height = 1;
    f.base.width = 1;
    f.base.height = 1;
  }
  fxSurfaces = [];
  fxHits = new Map();
  fxPage = -1;
  followKey = "";
}
