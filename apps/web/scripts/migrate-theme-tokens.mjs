import fs from "node:fs";

const path = new URL("../src/index.css", import.meta.url);
const original = fs.readFileSync(path, "utf8");
const lines = original.split(/\r?\n/);

const textColorMap = new Map([
  ["#fff7ec", "var(--app-text)"],
  ["#fff8ee", "var(--app-text)"],
  ["#fff6eb", "var(--app-text)"],
  ["#f7fbf7", "var(--app-text)"],
  ["#eee5da", "var(--app-text)"],
  ["#efe5d9", "var(--app-text)"],
  ["#c9c0b5", "var(--app-text-muted)"],
  ["#cfc7bb", "var(--app-text-muted)"],
  ["#a99f94", "var(--app-text-muted)"],
  ["#a7b4ad", "var(--app-text-muted)"],
  ["#b8afa5", "var(--app-text-muted)"],
  ["#b8c4bd", "var(--app-text-muted)"]
]);

const surfaceMap = new Map([
  ["#0d100f", "var(--app-bg)"],
  ["#08090b", "var(--app-bg)"],
  ["#070a09", "var(--app-bg)"],
  ["#07080a", "var(--app-bg)"],
  ["#0a0c0b", "var(--app-bg-soft)"],
  ["#101412", "var(--app-bg-soft)"],
  ["#10131a", "var(--app-bg-soft)"],
  ["#111513", "var(--app-panel)"],
  ["#151817", "var(--app-panel)"],
  ["#151a22", "var(--app-panel)"]
]);

const rgbaMap = [
  [/rgba\(\s*255,\s*255,\s*255,\s*0\.0[3-7]\s*\)/g, "var(--app-fill)"],
  [/rgba\(\s*255,\s*255,\s*255,\s*0\.0[89]\s*\)/g, "var(--app-border)"],
  [/rgba\(\s*255,\s*255,\s*255,\s*0\.1[0-2]\s*\)/g, "var(--app-border)"],
  [/rgba\(\s*255,\s*255,\s*255,\s*0\.1[3-6]\s*\)/g, "var(--app-border-strong)"]
];

let count = 0;
let inBaseLayer = false;
let baseDepth = 0;

const out = lines.map((line) => {
  const trimmed = line.trim();

  if (trimmed.startsWith("@layer base")) {
    inBaseLayer = true;
    baseDepth = 0;
  }
  if (inBaseLayer) {
    for (const ch of line) {
      if (ch === "{") baseDepth += 1;
      if (ch === "}") baseDepth -= 1;
    }
    if (baseDepth <= 0 && trimmed.includes("}")) {
      inBaseLayer = false;
    }
    return line;
  }

  // Never rewrite custom property definitions
  if (/^\s*--[a-z0-9-]+:/i.test(line) || line.includes("--on-accent")) {
    return line;
  }

  let next = line;

  for (const [from, to] of textColorMap) {
    const re = new RegExp(from, "gi");
    if (re.test(next)) {
      const matches = next.match(re)?.length ?? 0;
      count += matches;
      next = next.replace(re, to);
    }
  }

  for (const [from, to] of surfaceMap) {
    const re = new RegExp(from, "gi");
    if (re.test(next)) {
      const matches = next.match(re)?.length ?? 0;
      count += matches;
      next = next.replace(re, to);
    }
  }

  for (const [re, to] of rgbaMap) {
    const matches = next.match(re);
    if (matches) {
      count += matches.length;
      next = next.replace(re, to);
    }
  }

  return next;
});

let css = out.join("\n");

const headerLock = `

/* theme-header-lock: keep brand chrome readable on gradient headers */
.student-app-header,
.student-app-header strong,
.student-icon-button,
.student-app-header .student-streak-button {
  color: #fff !important;
}
.student-app-header span {
  color: rgba(255, 255, 255, 0.88) !important;
}
.student-green-button,
.student-green-button span {
  color: #fff !important;
}
.home-landing .home-topbar {
  color: var(--on-accent) !important;
}
`;

if (!css.includes("/* theme-header-lock")) {
  css += headerLock;
}

fs.writeFileSync(path, css);

const selfRefs = ["--app-bg: var(--app-bg)", "--app-panel: var(--app-panel)", "--app-bg-soft: var(--app-bg-soft)"].filter((s) =>
  css.includes(s)
);
console.log(`replacements=${count}`);
console.log(`selfRefs=${selfRefs.length ? selfRefs.join(", ") : "none"}`);
console.log(`remaining #fff7ec=${(css.match(/#fff7ec/gi) || []).length}`);
console.log(`remaining #0d100f=${(css.match(/#0d100f/gi) || []).length}`);
console.log(`remaining #151817=${(css.match(/#151817/gi) || []).length}`);
