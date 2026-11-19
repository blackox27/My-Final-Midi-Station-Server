function download(blob, name) {
  let url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function safeName() {
  return (
    ($("title").value || filename)
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .slice(0, 100) || "tablatura"
  );
}
$("png").onclick = () => {
  const i = Number($("pngpage").value),
    name = safeName() + "-pagina-" + (i + 1) + ".png";
  if (!pages[i]) return;
  rasterizePage(i).toBlob((b) => {
    if (b) download(b, name);
    else setStatus(t("pngFailed"), true);
  }, "image/png");
};
// Standalone PDF writer embeds one high-resolution JPEG per A4 page. No dependency/CDN.
async function buildPdf(commands = pageCommands.slice()) {
  const enc = new TextEncoder(),
    parts = [],
    offsets = [0];
  let length = 0;
  const add = (x) => {
      const bytes = typeof x === "string" ? enc.encode(x) : x;
      parts.push(bytes);
      length += bytes.length;
    },
    obj = (id, body) => {
      offsets[id] = length;
      add(id + " 0 obj\n");
      add(body);
      add("\nendobj\n");
    };
  add("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = commands.map((c, i) => 3 + i * 3 + " 0 R").join(" ");
  obj(
    2,
    "<< /Type /Pages /Count " + commands.length + " /Kids [ " + kids + " ] >>",
  );
  for (let i = 0; i < commands.length; i++) {
    const c = rasterizePage(i, commands, commands.length),
      id = 3 + i * 3,
      jpeg = await new Promise((resolve) =>
        c.toBlob(resolve, "image/jpeg", 0.96),
      );
    if (!jpeg) throw Error("Falha ao gerar página " + (i + 1));
    const jpg = new Uint8Array(await jpeg.arrayBuffer());
    obj(
      id,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im " +
        (id + 1) +
        " 0 R >> >> /Contents " +
        (id + 2) +
        " 0 R >>",
    );
    offsets[id + 1] = length;
    add(
      id +
        1 +
        " 0 obj\n<< /Type /XObject /Subtype /Image /Width " +
        c.width +
        " /Height " +
        c.height +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
        jpg.length +
        " >>\nstream\n",
    );
    add(jpg);
    add("\nendstream\nendobj\n");
    c.width = 0;
    c.height = 0;
    const content = "q\n595.276 0 0 841.89 0 0 cm\n/Im Do\nQ\n";
    obj(
      id + 2,
      "<< /Length " +
        enc.encode(content).length +
        " >>\nstream\n" +
        content +
        "endstream",
    );
  }
  const start = length,
    count = 3 + commands.length * 3;
  add("xref\n0 " + count + "\n0000000000 65535 f \n");
  for (let i = 1; i < count; i++)
    add(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  add(
    "trailer\n<< /Size " +
      count +
      " /Root 1 0 R >>\nstartxref\n" +
      start +
      "\n%%EOF",
  );
  return new Blob(parts, { type: "application/pdf" });
}
$("pdf").onclick = async () => {
  if (!pages.length || exportInProgress) return;
  exportInProgress = true;
  const name = safeName() + ".pdf";
  $("pdf").disabled = true;
  $("pdf").textContent = t("exporting");
  try {
    const blob = await buildPdf();
    download(blob, name);
  } catch (e) {
    setStatus(t("pdfFailed") + localizeError(e.message), true);
  } finally {
    exportInProgress = false;
    $("pdf").textContent = "↓ PDF";
    $("pdf").disabled =
      !pages.length || document.body.classList.contains("busy");
  }
};
