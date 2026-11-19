const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(__dirname, "..");
const shared = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
  alias: {
    spessasynth_core: path.join(
      base,
      "vendor-source/spessasynth_core/src/index.ts",
    ),
  },
  nodePaths: [path.join(base, "node_modules")],
  legalComments: "eof",
};
function build(entry, out, format = "iife", name) {
  esbuild.buildSync({
    ...shared,
    entryPoints: [path.join(base, entry)],
    outfile: path.join(base, out),
    format,
    globalName: name,
    minify: true,
  });
}
build(
  "scripts/spessa-entry.ts",
  "dist/vendor/spessasynth.js",
  "iife",
  "Spessa",
);
build(
  "vendor-source/spessasynth_lib/src/worklet_processor.ts",
  "dist/vendor/spessa-worklet.js",
  "esm",
);
fs.writeFileSync(
  path.join(base, "dist/vendor/spessa-worklet-source.js"),
  "globalThis.SPESSA_WORKLET_SOURCE=" +
    JSON.stringify(
      fs.readFileSync(path.join(base, "dist/vendor/spessa-worklet.js"), "utf8"),
    ) +
    ";\n",
);
if (fs.existsSync(path.join(base, "scripts/render-worker.ts"))) {
  build("scripts/render-worker.ts", "dist/vendor/render-worker.js");
  fs.writeFileSync(
    path.join(base, "dist/vendor/render-worker-source.js"),
    "globalThis.SPESSA_RENDER_SOURCE=" +
      JSON.stringify(
        fs.readFileSync(
          path.join(base, "dist/vendor/render-worker.js"),
          "utf8",
        ),
      ) +
      ";\n",
  );
}
esbuild.buildSync({
  ...shared,
  platform: "node",
  entryPoints: [path.join(base, "vendor-source/spessasynth_core/src/index.ts")],
  outfile: path.join(base, "tests/spessa-core.cjs"),
  format: "cjs",
  minify: true,
});
fs.copyFileSync(
  path.join(base, "node_modules/stb-vorbis/LICENSE"),
  path.join(base, "dist/vendor/STB-VORBIS-LICENSE.txt"),
);
console.log(
  "Built supplied SpessaSynth core 4.3.22 + lib 4.3.14 with pinned stb-vorbis 0.0.5.",
);
