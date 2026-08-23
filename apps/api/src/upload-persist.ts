import { rm } from "node:fs/promises";
import { env } from "./env.js";
import { isObjectStorageEnabled, putObjectFromFile } from "./object-storage.js";
import { buildPublicUploadUrl } from "./upload-security.js";

export async function persistUploadedFile(params: {
  relativePath: string;
  absolutePath: string;
  mimeType: string;
}) {
  if (isObjectStorageEnabled()) {
    await putObjectFromFile(params.relativePath, params.absolutePath, params.mimeType);
    if (env.NODE_ENV === "production") {
      await rm(params.absolutePath, { force: true }).catch(() => undefined);
    }
  }

  return buildPublicUploadUrl(params.relativePath);
}
