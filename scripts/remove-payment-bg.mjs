import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
console.warn("[deprecated] use: npm run payments:assets");
await import(path.join(path.dirname(scriptPath), "ensure-payment-assets.mjs"));
