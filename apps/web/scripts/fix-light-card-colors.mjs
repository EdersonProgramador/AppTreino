import fs from "node:fs";

const path = new URL("../src/index.css", import.meta.url);
let css = fs.readFileSync(path, "utf8");
let count = 0;

const apply = (re, to) => {
  const matches = css.match(re);
  if (matches) count += matches.length;
  css = css.replace(re, to);
};

apply(
  /linear-gradient\(\s*180deg,\s*var\(--app-border\),\s*rgba\(\s*255,\s*255,\s*255,\s*0\.035\s*\)\s*\)/g,
  "var(--app-card-shine)"
);
apply(/linear-gradient\(\s*180deg,\s*var\(--app-border\),\s*transparent\s*\)/g, "var(--app-card-shine)");
apply(/rgba\(\s*8,\s*9,\s*11,\s*0\.(?:2[4-9]|[3-9]\d)\s*\)/g, "var(--app-input)");
apply(/#0f1211/gi, "var(--app-card-bg)");
apply(/#0c0f0e/gi, "var(--app-card-bg)");
apply(/#0b0d0f/gi, "var(--app-card-bg)");
apply(/#070808/gi, "var(--app-bg)");

fs.writeFileSync(path, css);
console.log(`replacements=${count}`);
console.log(`card-shine=${(css.match(/var\(--app-card-shine\)/g) || []).length}`);
console.log(`rgba8911=${(css.match(/rgba\(\s*8,\s*9,\s*11/g) || []).length}`);
console.log(`has light card bg=${css.includes("--app-card-bg: #ffffff")}`);
