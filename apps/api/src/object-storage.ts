import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { env } from "./env.js";

let client: S3Client | null = null;

export function isObjectStorageEnabled() {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME &&
      env.R2_PUBLIC_URL
  );
}

function getClient() {
  if (!isObjectStorageEnabled()) {
    throw new Error("Object storage (R2) is not configured.");
  }

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!
      }
    });
  }

  return client;
}

export function buildObjectPublicUrl(relativePath: string) {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${cleaned}`;
  }
  return cleaned;
}

export async function putObjectFromFile(relativePath: string, absolutePath: string, contentType: string) {
  const key = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const body = await readFile(absolutePath);

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
}

export async function downloadObjectToTemp(relativePath: string) {
  const key = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`Object not found in R2: ${key}`);
  }

  const tempRoot = join(process.cwd(), ".r2-cache");
  const tempPath = join(tempRoot, key);
  await mkdir(dirname(tempPath), { recursive: true });
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(tempPath));
  return tempPath;
}

export async function removeTempDownload(path: string) {
  if (!path.includes(".r2-cache")) return;
  await rm(path, { force: true }).catch(() => undefined);
}
