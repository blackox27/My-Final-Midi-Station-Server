/* Copy maintained sources into a structured offline runtime. No CDN or module fetches. */
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  src = path.join(root, "src"),
  dist = path.join(root, "dist");
for (const dir of ["core", "audio", "storage", "ui"])
  fs.cpSync(path.join(src, dir), path.join(dist, "js", dir), {
    recursive: true,
  });
fs.cpSync(path.join(src, "locales"), path.join(dist, "locales"), {
  recursive: true,
});
fs.mkdirSync(path.join(dist, "css"), { recursive: true });
fs.copyFileSync(
  path.join(src, "styles/studio.css"),
  path.join(dist, "css/studio.css"),
);
fs.copyFileSync(path.join(src, "index.html"), path.join(dist, "index.html"));
console.log("Organized application runtime built from src/.");
