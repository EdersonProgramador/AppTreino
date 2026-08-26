/**
 * Aplica CORS no bucket R2 para a web (capa de vídeo / canvas).
 * Lê credenciais do .env da raiz — não imprime secrets.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
if (!existsSync(envPath)) {
  throw new Error("Missing .env at repo root");
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(/^(R2_[A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
  if (!env[key]) throw new Error(`Missing ${key} in .env`);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

const AllowedOrigins = [
  "https://edersonprogramador.com",
  "https://www.edersonprogramador.com",
  "https://app-treino-api.vercel.app",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://192.168.1.7:5174",
  "http://192.168.1.4:5174"
];

await client.send(
  new PutBucketCorsCommand({
    Bucket: env.R2_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins,
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
          MaxAgeSeconds: 86400
        }
      ]
    }
  })
);

console.log("R2 CORS updated for", env.R2_BUCKET_NAME);
console.log("Origins:", AllowedOrigins.length);
