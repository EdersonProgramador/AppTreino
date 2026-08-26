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
    try {
      await putObjectFromFile(params.relativePath, params.absolutePath, params.mimeType);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const error = new Error(
        `Falha ao gravar no armazenamento (R2): ${detail.slice(0, 180)}`
      ) as Error & { statusCode: number };
      error.statusCode = 503;
      throw error;
    }
    if (env.NODE_ENV === "production") {
      await rm(params.absolutePath, { force: true }).catch(() => undefined);
    }
  }

  return buildPublicUploadUrl(params.relativePath);
}
