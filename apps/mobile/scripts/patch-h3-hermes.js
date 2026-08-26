/**
 * h3-js (Emscripten) does `new TextDecoder("utf-16le")` at module init.
 * Hermes throws RangeError. UTF16Decoder is unused for our lat/lng cell APIs.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGETS = [
  "node_modules/h3-js/dist/h3-js.js",
  "node_modules/h3-js/dist/h3-js.es.js",
  "node_modules/h3-js/dist/browser/h3-js.js",
  "node_modules/h3-js/dist/browser/h3-js.es.js",
  "node_modules/h3-js/dist/libh3-browser.js"
];

const NEEDLE =
  /var UTF16Decoder = typeof TextDecoder !== "undefined" \? new TextDecoder\("utf-16le"\) : undefined;/g;
const REPLACEMENT = 'var UTF16Decoder = undefined; /* apptreino: hermes utf-16le */';

let patched = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  if (!NEEDLE.test(src)) {
    NEEDLE.lastIndex = 0;
    if (src.includes("apptreino: hermes utf-16le")) continue;
    continue;
  }
  NEEDLE.lastIndex = 0;
  const next = src.replace(NEEDLE, REPLACEMENT);
  if (next !== src) {
    fs.writeFileSync(file, next);
    patched += 1;
    console.log(`[patch-h3-hermes] ${rel}`);
  }
}

if (!patched) {
  console.log("[patch-h3-hermes] nothing to patch (already applied or files missing)");
}
