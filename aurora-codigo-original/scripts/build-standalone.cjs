/* Build a single, offline HTML document from the tested browser application. */
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  dist = path.join(root, "dist");
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
html = html.replace(
  /<link rel="stylesheet" href="([^"]+)"\s*\/>/g,
  (_, name) =>
    "<style>\n" +
    fs
      .readFileSync(path.join(dist, name), "utf8")
      .replace(/<\/style/gi, "<\\/style") +
    "\n</style>",
);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, name) => {
  const source = fs.readFileSync(path.join(dist, name), "utf8");
  return (
    "<script>\n" + source.replace(/<\/script/gi, "<\\/script") + "\n</script>"
  );
});
const manual = fs.readFileSync(path.join(dist, "LEIA-ME.txt"), "utf8");
const notices = fs.readFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  "utf8",
);
html = html.replace(
  "</head>",
  "<script>globalThis.AURORA_MANUAL=" +
    JSON.stringify(manual + "\n\n" + notices).replace(/</g, "\\u003c") +
    ";globalThis.AURORA_MANUAL_EN=" +
    JSON.stringify(
      fs.readFileSync(path.join(dist, "README-EN.txt"), "utf8") +
        "\n\n" +
        notices,
    ).replace(/</g, "\\u003c") +
    ";</script>\n</head>",
);
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html))
  throw Error("External runtime dependency remains");
fs.writeFileSync(path.join(dist, "Aurora-MIDI.html"), html);
console.log("Standalone HTML:", Buffer.byteLength(html), "bytes");
