import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const targets = [
  path.join(root, "apps/web/public/assets/payments/pix-logo.png"),
  path.join(root, "apps/web/public/assets/payments/card-brands.png")
];

function isNearBlack(r, g, b, threshold) {
  return r <= threshold && g <= threshold && b <= threshold;
}

function liftDarkForeground(data, channels, threshold = 72) {
  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3];
    if (alpha < 16) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);

    if (max > threshold) continue;

    const lift = 1.85;
    data[i] = Math.min(255, Math.round(r * lift + 58));
    data[i + 1] = Math.min(255, Math.round(g * lift + 58));
    data[i + 2] = Math.min(255, Math.round(b * lift + 58));
  }
}

async function removeBlackBackground(inputPath, { bgThreshold = 28, liftDarkText = false } = {}) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    const idx = y * width + x;
    const pi = idx * channels;
    if (visited[idx] || !isNearBlack(data[pi], data[pi + 1], data[pi + 2], bgThreshold)) return;
    queue.push(idx);
  };

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pi = idx * channels;
    if (!isNearBlack(data[pi], data[pi + 1], data[pi + 2], bgThreshold)) continue;

    data[pi + 3] = 0;

    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) queue.push(idx - 1);
    if (x < width - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - width);
    if (y < height - 1) queue.push(idx + width);
  }

  if (liftDarkText) {
    liftDarkForeground(data, channels);
  }

  const tempPath = `${inputPath}.tmp.png`;

  await sharp(data, { raw: { width, height, channels } })
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(tempPath);

  await fs.rename(tempPath, inputPath);

  const meta = await sharp(inputPath).metadata();
  console.log(`Updated ${path.basename(inputPath)} -> ${meta.width}x${meta.height}, alpha=${meta.hasAlpha}`);
}

for (const file of targets) {
  await removeBlackBackground(file, {
    bgThreshold: 32,
    liftDarkText: file.includes("card-brands")
  });
}
