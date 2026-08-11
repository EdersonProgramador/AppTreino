import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "../src");
const stylesPath = path.join(srcDir, "styles.css");
const indexPath = path.join(srcDir, "index.css");

const TAILWIND_CONVERTED = new Set([
  "crud-form",
  "cms-form",
  "cms-form-section-title",
  "cms-upload-field",
  "cms-image-preview",
  "cms-image-preview-meta",
  "cms-filter-bar",
  "cms-studio-card",
  "panel-title",
  "data-row",
  "wide-field",
  "danger-button",
  "cms-data-row-thumb"
]);

const SKIP_CLASSES = new Set([
  ...TAILWIND_CONVERTED,
  "ui-shell",
  "ui-eyebrow",
  "ui-display",
  "ui-panel",
  "ui-input",
  "ui-label",
  "ui-btn",
  "ui-btn-primary",
  "ui-btn-secondary",
  "ui-btn-ghost",
  "ui-error",
  "ui-success",
  "ui-choice",
  "ui-choice-active",
  "eyebrow",
  "primary-button",
  "outline-button",
  "error-box",
  "success-box",
  "workspace-shell",
  "workspace-sidebar",
  "workspace-sidebar-brand",
  "workspace-nav",
  "workspace-logout",
  "workspace-content",
  "dashboard-heading",
  "dashboard-actions",
  "compact-button",
  "table-panel",
  "admin-workspace-shell",
  "admin-workspace-content",
  "admin-nav-group-label",
  "sidebar-toggle",
  "cms-row-actions",
  "cms-empty-hint"
]);

function collectTsxClasses(dir) {
  const classes = new Set();
  const re = /className="([^"]+)"/g;

  function walk(d) {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) {
        const content = fs.readFileSync(full, "utf8");
        let m;
        while ((m = re.exec(content))) {
          for (const token of m[1].split(/\s+/)) {
            if (token && !token.includes("${") && !token.includes(":") && !token.includes("[")) {
              classes.add(token);
            }
          }
        }
      }
    }
  }

  walk(dir);
  return classes;
}

/** Parse CSS into top-level blocks only (preserves @media wrappers intact). */
function parseTopLevelBlocks(css) {
  const blocks = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    while (i < len && /\s/.test(css[i])) i++;
    if (i >= len) break;

    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }

    const braceStart = css.indexOf("{", i);
    if (braceStart === -1) break;
    const selector = css.slice(i, braceStart).trim();

    let depth = 0;
    let j = braceStart;
    for (; j < len; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }

    blocks.push({ selector, raw: css.slice(i, j).trim(), type: selector.startsWith("@") ? "at" : "rule" });
    i = j;
  }

  return blocks;
}

function blockNeeded(block, neededClasses) {
  for (const cls of neededClasses) {
    const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|[\\[:.>,])`);
    if (re.test(block.raw)) return true;
  }
  return false;
}

const tsxClasses = collectTsxClasses(srcDir);
const needed = [...tsxClasses].filter((cls) => !SKIP_CLASSES.has(cls));
const stylesCss = fs.readFileSync(stylesPath, "utf8");
let indexCss = fs.readFileSync(indexPath, "utf8");
const blocks = parseTopLevelBlocks(stylesCss);

const matched = blocks.filter((b) => blockNeeded(b, needed));
console.error("Needed classes:", needed.length);
console.error("Top-level blocks matched:", matched.length);

const migratedCss =
  "\n  /* Migrated from styles.css — plain CSS component rules */\n" +
  matched.map((b) => "  " + b.raw.replace(/\n/g, "\n  ")).join("\n\n");

// Remove prior migrated section
indexCss = indexCss.replace(/\n  \/\* Migrated from styles\.css[\s\S]*?(?=\n})/, "");

const layerMarker = "@layer components {";
const layerStart = indexCss.indexOf(layerMarker);
let depth = 0;
let layerEnd = -1;
for (let i = layerStart; i < indexCss.length; i++) {
  if (indexCss[i] === "{") depth++;
  else if (indexCss[i] === "}") {
    depth--;
    if (depth === 0) {
      layerEnd = i;
      break;
    }
  }
}

const newIndex = indexCss.slice(0, layerEnd) + migratedCss + "\n" + indexCss.slice(layerEnd);
fs.writeFileSync(indexPath, newIndex);
console.error("Done");
