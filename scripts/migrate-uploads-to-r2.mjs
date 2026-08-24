import { readFileSync, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const uploadsDir = process.env.UPLOADS_DIR ?? join(repoRoot, "apps", "api", "uploads");
const allowedUploadPrefixes = ["images/", "lessons/", "materials/", "audio/"];

const r2 = {
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_URL: ""
};

function loadR2VarsFromEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(R2_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (match[1] in r2 && value) {
      r2[match[1]] = value;
      count += 1;
    }
  }
  return count;
}

const envCandidates = [
  join(repoRoot, ".env"),
  join(process.cwd(), ".env"),
  join(repoRoot, "apps", "api", ".env")
];

const seen = new Set();
for (const envPath of envCandidates) {
  const resolved = resolve(envPath);
  if (seen.has(resolved) || !existsSync(resolved)) continue;
  seen.add(resolved);
  const count = loadR2VarsFromEnvFile(resolved);
  if (count > 0) {
    console.log(`R2 env loaded from ${resolved} (${count} keys).`);
  }
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing ${name}. Configure R2 variables in .env first.`);
  }
  return value;
}

const accountId = requireEnv("R2_ACCOUNT_ID", r2.R2_ACCOUNT_ID);
const accessKeyId = requireEnv("R2_ACCESS_KEY_ID", r2.R2_ACCESS_KEY_ID);
const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY", r2.R2_SECRET_ACCESS_KEY);
const bucket = requireEnv("R2_BUCKET_NAME", r2.R2_BUCKET_NAME);
const publicUrl = requireEnv("R2_PUBLIC_URL", r2.R2_PUBLIC_URL);

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  },
  forcePathStyle: true
});

const mimeByExt = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf"
};

function guessMime(path) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return mimeByExt[ext] ?? "application/octet-stream";
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }

  return files;
}

async function uploadFile(absolutePath) {
  const key = relative(uploadsDir, absolutePath).replace(/\\/g, "/");
  const body = readFileSync(absolutePath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: guessMime(key),
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
}

async function main() {
  await stat(uploadsDir);
  const files = (await collectFiles(uploadsDir)).filter((filePath) =>
    allowedUploadPrefixes.some((prefix) =>
      relative(uploadsDir, filePath).replace(/\\/g, "/").startsWith(prefix)
    )
  );

  if (files.length === 0) {
    console.log("Nenhum arquivo para migrar em apps/api/uploads.");
    return;
  }

  console.log(`Migrando ${files.length} arquivo(s) para R2 bucket ${bucket} ...`);

  let ok = 0;
  for (const filePath of files) {
    const label = relative(uploadsDir, filePath).replace(/\\/g, "/");
    process.stdout.write(`→ ${label} ... `);
    await uploadFile(filePath);
    ok += 1;
    console.log("ok");
  }

  console.log(`Concluído: ${ok}/${files.length}.`);
  console.log(`CDN base: ${publicUrl.replace(/\/+$/, "")}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
