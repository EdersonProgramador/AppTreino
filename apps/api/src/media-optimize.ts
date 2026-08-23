import { createHash } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { downloadObjectToTemp, isObjectStorageEnabled, removeTempDownload } from "./object-storage.js";
import { uploadsDir } from "./upload-security.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const DERIVED_DIR = resolve(uploadsDir, ".derived");

const MAX_UPLOAD_EDGE = 1600;
const DEFAULT_UPLOAD_QUALITY = 78;

export type OptimizedImageResult = {
  absolutePath: string;
  filename: string;
  extension: string;
  mimeType: string;
  relativePath: string;
};

function extensionOf(path: string) {
  return extname(path).replace(/^\./, "").toLowerCase();
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Garante que o caminho resolvido fica dentro de uploads/. */
export function resolveSafeUploadPath(relativePath: string): string | null {
  const cleaned = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  if (!cleaned || cleaned.includes("\0") || cleaned.split(/[/\\]/).includes("..")) {
    return null;
  }

  const absolute = resolve(uploadsDir, cleaned);
  const root = resolve(uploadsDir) + sep;
  if (!absolute.startsWith(root) && absolute !== resolve(uploadsDir)) {
    return null;
  }

  // Não servir o cache derivado como origem.
  if (normalize(relative(uploadsDir, absolute)).startsWith(".derived")) {
    return null;
  }

  return absolute;
}

async function resolveReadableUploadPath(relativePath: string): Promise<{ absolutePath: string; tempDownload?: string } | null> {
  const local = resolveSafeUploadPath(relativePath);
  if (local && (await pathExists(local))) {
    return { absolutePath: local };
  }

  if (!isObjectStorageEnabled()) {
    return null;
  }

  try {
    const tempDownload = await downloadObjectToTemp(relativePath);
    return { absolutePath: tempDownload, tempDownload };
  } catch {
    return null;
  }
}

/**
 * Recomprime imagens no upload: resize + WebP (GIF animado permanece GIF).
 * Retorna o arquivo final (pode substituir o original).
 */
export async function optimizeUploadedImage(params: {
  absolutePath: string;
  group: string;
  baseFilename: string;
  extension: string;
  maxEdge?: number;
  quality?: number;
}): Promise<OptimizedImageResult> {
  const maxEdge = params.maxEdge ?? MAX_UPLOAD_EDGE;
  const quality = params.quality ?? DEFAULT_UPLOAD_QUALITY;
  const sourceExt = params.extension.toLowerCase();
  const sourcePath = params.absolutePath;

  if (!IMAGE_EXTENSIONS.has(sourceExt)) {
    const filename = `${params.baseFilename}.${sourceExt}`;
    return {
      absolutePath: sourcePath,
      filename,
      extension: sourceExt,
      mimeType: "application/octet-stream",
      relativePath: `${params.group}/${filename}`
    };
  }

  // GIF animado: só limita dimensões se for enorme; mantém formato.
  if (sourceExt === "gif") {
    const filename = `${params.baseFilename}.gif`;
    const finalPath = resolve(dirname(sourcePath), filename);
    try {
      const pipeline = sharp(sourcePath, { animated: true, failOn: "none" }).rotate();
      const meta = await pipeline.metadata();
      const widest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (widest > maxEdge) {
        await pipeline
          .resize({
            width: maxEdge,
            height: maxEdge,
            fit: "inside",
            withoutEnlargement: true
          })
          .gif()
          .toFile(finalPath + ".tmp");
        await rename(finalPath + ".tmp", finalPath);
        if (finalPath !== sourcePath) {
          await rm(sourcePath, { force: true });
        }
      } else if (finalPath !== sourcePath) {
        await rename(sourcePath, finalPath);
      }
    } catch {
      if (finalPath !== sourcePath && (await pathExists(sourcePath))) {
        await rename(sourcePath, finalPath);
      }
    }

    return {
      absolutePath: finalPath,
      filename,
      extension: "gif",
      mimeType: "image/gif",
      relativePath: `${params.group}/${filename}`
    };
  }

  const filename = `${params.baseFilename}.webp`;
  const finalPath = resolve(dirname(sourcePath), filename);
  const tempPath = `${finalPath}.tmp`;

  try {
    await sharp(sourcePath, { failOn: "none" })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality, effort: 4 })
      .toFile(tempPath);

    await rename(tempPath, finalPath);
    if (finalPath !== sourcePath) {
      await rm(sourcePath, { force: true });
    }
  } catch {
    await rm(tempPath, { force: true }).catch(() => undefined);
    // Fallback: mantém original validado.
    const fallbackName = `${params.baseFilename}.${sourceExt}`;
    const fallbackPath = resolve(dirname(sourcePath), fallbackName);
    if (fallbackPath !== sourcePath && (await pathExists(sourcePath))) {
      await rename(sourcePath, fallbackPath);
    }
    const mime =
      sourceExt === "png"
        ? "image/png"
        : sourceExt === "webp"
          ? "image/webp"
          : "image/jpeg";
    return {
      absolutePath: fallbackPath,
      filename: fallbackName,
      extension: sourceExt,
      mimeType: mime,
      relativePath: `${params.group}/${fallbackName}`
    };
  }

  return {
    absolutePath: finalPath,
    filename,
    extension: "webp",
    mimeType: "image/webp",
    relativePath: `${params.group}/${filename}`
  };
}

/**
 * Gera (e cacheia em disco) uma variante redimensionada em WebP para listagens.
 */
export async function getDerivedImage(params: {
  relativePath: string;
  width: number;
  quality?: number;
}): Promise<{ absolutePath: string; mimeType: string; cacheHit: boolean } | null> {
  const width = Math.min(Math.max(Math.round(params.width), 48), 2000);
  const quality = Math.min(Math.max(params.quality ?? 72, 40), 90);
  const resolved = await resolveReadableUploadPath(params.relativePath);
  if (!resolved) return null;

  const { absolutePath: sourceAbsolute, tempDownload } = resolved;

  try {
    const ext = extensionOf(sourceAbsolute);
    if (!IMAGE_EXTENSIONS.has(ext)) return null;

    const key = createHash("sha1")
      .update(`${params.relativePath}|w${width}|q${quality}|v1`)
      .digest("hex");
    const cachePath = join(DERIVED_DIR, `w${width}`, `${key}.webp`);

    if (await pathExists(cachePath)) {
      return { absolutePath: cachePath, mimeType: "image/webp", cacheHit: true };
    }

    await mkdir(dirname(cachePath), { recursive: true });
    const tempPath = `${cachePath}.${process.pid}.tmp`;

    try {
      const input = sharp(sourceAbsolute, {
        animated: false,
        failOn: "none",
        pages: 1
      });

      await input
        .rotate()
        .resize({
          width,
          height: width,
          fit: "inside",
          withoutEnlargement: true
        })
        .webp({ quality, effort: 4 })
        .toFile(tempPath);

      await rename(tempPath, cachePath);
      return { absolutePath: cachePath, mimeType: "image/webp", cacheHit: false };
    } catch {
      await rm(tempPath, { force: true }).catch(() => undefined);
      return null;
    }
  } finally {
    if (tempDownload) {
      await removeTempDownload(tempDownload);
    }
  }
}

export function isImageUploadExtension(extension: string) {
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

export function mediaCacheControl(immutable = true) {
  return immutable
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400, stale-while-revalidate=604800";
}
