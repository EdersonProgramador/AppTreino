import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public/assets/atlly-mark.png");
const outDir = path.join(root, "public/pwa");
const bg = { r: 9, g: 9, b: 11, alpha: 1 };

await mkdir(outDir, { recursive: true });

const sizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 }
];

await Promise.all(
  sizes.map(({ name, size }) =>
    sharp(src)
      .resize(size, size, { fit: "contain", background: bg })
      .png()
      .toFile(path.join(outDir, name))
  )
);

console.log("PWA icons written to public/pwa/");
