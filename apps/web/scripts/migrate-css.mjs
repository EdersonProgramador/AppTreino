import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = "apps/web/src";
const stylesPath = join(root, "styles.css");
const indexPath = join(root, "index.css");

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(extname(full))) files.push(full);
  }
  return files;
}

const classSet = new Set();
for (const file of walk(root)) {
  if (file.endsWith("styles.css") || file.includes("node_modules")) continue;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/className\s*=\s*(?:\{`([^`]*)`\}|"([^"]*)"|'([^']*)'|\{"([^"]*)"\})/g)) {
    const raw = match[1] || match[2] || match[3] || match[4] || "";
    for (const token of raw.split(/\s+/)) {
      const clean = token.replace(/[^a-zA-Z0-9_-]/g, "");
      if (clean && !clean.startsWith("sm:") && !clean.startsWith("md:") && !clean.includes(":")) {
        if (/^[a-zA-Z_][\w-]*$/.test(clean)) classSet.add(clean);
      }
    }
  }
  // also catch template fragments with static classes
  for (const match of text.matchAll(/["'`]([a-zA-Z_][\w-]*)["'`]/g)) {
    // too noisy; skip
  }
}

// Broader extraction: any quoted class-looking tokens near className lines
for (const file of walk(root)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/className=\{?[`"']([^`"']+)[`"']/g)) {
    for (const part of match[1].split(/\s+/)) {
      const token = part.trim();
      if (/^[a-zA-Z_][\w-]*$/.test(token)) classSet.add(token);
    }
  }
}

const styles = readFileSync(stylesPath, "utf8");

// Parse top-level CSS rules roughly
const rules = [];
let i = 0;
while (i < styles.length) {
  const start = styles.indexOf("{", i);
  if (start === -1) break;
  // find selector start
  let selStart = start;
  while (selStart > 0 && styles[selStart - 1] !== "}" && styles[selStart - 1] !== "/") {
    selStart--;
  }
  // better: walk back to previous } or start
  let j = start - 1;
  while (j >= 0 && /[\s]/.test(styles[j])) j--;
  let selectorEnd = j + 1;
  while (j >= 0 && styles[j] !== "}" && !(styles[j] === "*" && styles[j - 1] === "/")) {
    j--;
  }
  const selector = styles.slice(j + 1, selectorEnd).trim();
  // find matching brace
  let depth = 0;
  let k = start;
  for (; k < styles.length; k++) {
    if (styles[k] === "{") depth++;
    else if (styles[k] === "}") {
      depth--;
      if (depth === 0) {
        k++;
        break;
      }
    }
  }
  const block = styles.slice(start, k);
  rules.push({ selector, css: selector + block });
  i = k;
}

const needed = [];
const skipExact = new Set([
  ":root",
  "html",
  "body",
  "*",
  "::selection",
  "::-webkit-scrollbar",
  "::-webkit-scrollbar-track",
  "::-webkit-scrollbar-thumb"
]);

for (const rule of rules) {
  const sel = rule.selector;
  if (!sel || skipExact.has(sel.split(/\s|,/)[0])) continue;
  // keep if any class in selector is used
  const classes = [...sel.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  if (classes.length === 0) continue;
  if (classes.some((c) => classSet.has(c))) {
    // skip marketing already replaced
    if (/^\.(hero|topbar|app-shell|nav-links|brand|footer|auth-|section|resource-|price-|faq-|final-cta|audience)/.test(sel)) {
      continue;
    }
    needed.push(rule.css);
  }
}

const existing = readFileSync(indexPath, "utf8");
// remove closing of layer if present and append
let next = existing.replace(/\}\s*$/, "");
if (!next.includes("@layer components")) {
  next += "\n@layer components {\n";
}
next += "\n  /* Migrated from styles.css (used classes) */\n";
for (const css of needed) {
  // indent
  const indented = css
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join("\n");
  next += `\n${indented}\n`;
}
next += "}\n";

writeFileSync(indexPath, next);
writeFileSync("apps/web/scripts/css-migrate-report.json", JSON.stringify({
  usedClassCount: classSet.size,
  rulesExtracted: needed.length,
  sampleUsed: [...classSet].slice(0, 40)
}, null, 2));
console.log(JSON.stringify({ usedClassCount: classSet.size, rulesExtracted: needed.length }, null, 2));
