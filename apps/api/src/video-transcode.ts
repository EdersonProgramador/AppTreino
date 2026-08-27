import { spawn } from "node:child_process";
import { access, constants, mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { downloadObjectToTemp, isObjectStorageEnabled, removeTempDownload } from "./object-storage.js";
import { persistUploadedFile } from "./upload-persist.js";
import { uploadsDir } from "./upload-security.js";

export function videoExtension(pathOrName: string) {
  return extname(pathOrName).replace(/^\./, "").toLowerCase();
}

export function needsVideoTranscodeToMp4(extension: string) {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  return normalized !== "mp4" && normalized !== "m4v";
}

function ffmpegBin() {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (typeof ffmpegStatic === "string" && ffmpegStatic) return ffmpegStatic;
  return "ffmpeg";
}

async function pathExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function transcodeFileToMp4(inputPath: string, outputPath: string) {
  await mkdir(dirname(outputPath), { recursive: true });
  const bin = ffmpegBin();

  await new Promise<void>((resolvePromise, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-sn",
      "-dn",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-max_muxing_queue_size",
      "1024",
      outputPath
    ];
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolvePromise();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("ffmpeg timed out while normalizing video"));
    }, 180_000);
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`ffmpeg failed (${code}): ${stderr.slice(-500) || "unknown error"}`));
    });
  });
}

/**
 * After saveValidatedUpload wrote bytes to `rawPath` (no extension),
 * produce a playable H.264/AAC MP4 under group/baseFilename.mp4.
 */
export async function ensureUploadedVideoIsMp4(params: {
  rawPath: string;
  extension: string;
  group: string;
  baseFilename: string;
  /** When true, always produce H.264/AAC MP4 even if source is already .mp4 (HEVC). */
  forceCompatible?: boolean;
  /** False for public uploads: invalid/unsupported input must never be persisted raw. */
  allowOriginalFallback?: boolean;
}): Promise<{
  filename: string;
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  transcoded: boolean;
}> {
  const ext = params.extension.toLowerCase().replace(/^\./, "");
  const inputPath = params.rawPath;
  if (!(await pathExists(inputPath))) {
    throw new Error("Arquivo de vídeo não encontrado para processar.");
  }

  const filename = `${params.baseFilename}.mp4`;
  const relativePath = `${params.group}/${filename}`;
  const absolutePath = resolve(uploadsDir, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });

  // Remux only when container needs it (mov/webm/…) or caller forces H.264 (HEVC mp4).
  // Default false so Android H.264 MP4 uploads stay fast and do not 503 on Render.
  const forceCompatible = params.forceCompatible === true;

  if (!forceCompatible && !needsVideoTranscodeToMp4(ext) && (ext === "mp4" || ext === "m4v")) {
    await rename(inputPath, absolutePath);
    return { filename, relativePath, absolutePath, mimeType: "video/mp4", transcoded: false };
  }

  try {
    await transcodeFileToMp4(inputPath, absolutePath);
  } catch (err) {
    if (params.allowOriginalFallback === false) {
      await Promise.all([
        rm(inputPath, { force: true }).catch(() => undefined),
        rm(absolutePath, { force: true }).catch(() => undefined)
      ]);
      throw err;
    }

    // If ffmpeg missing, keep original extension so upload does not hard-fail in dev.
    const fallbackName = `${params.baseFilename}.${ext}`;
    const fallbackRelative = `${params.group}/${fallbackName}`;
    const fallbackAbsolute = resolve(uploadsDir, fallbackRelative);
    await rename(inputPath, fallbackAbsolute);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      fallback: {
        filename: fallbackName,
        relativePath: fallbackRelative,
        absolutePath: fallbackAbsolute,
        mimeType: ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4",
        transcoded: false
      }
    });
  }

  await rm(inputPath, { force: true }).catch(() => undefined);
  return { filename, relativePath, absolutePath, mimeType: "video/mp4", transcoded: true };
}

const compatJobs = new Map<string, Promise<{
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  remoteOnly?: boolean;
} | null>>();

function safeUploadsRelative(relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "").replace(/\\/g, "/");
  if (!cleaned || cleaned.includes("..")) return null;
  return cleaned;
}

/**
 * Resolve a playable MP4 for an existing upload (local or R2). Used by /media/video.
 */
export async function ensurePlayableMp4(
  relativePath: string,
  options?: { forceCompatible?: boolean }
): Promise<{
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  remoteOnly?: boolean;
} | null> {
  const cleanedKey = safeUploadsRelative(relativePath) || relativePath;
  const jobKey = `${cleanedKey}::${options?.forceCompatible ? "force" : "soft"}`;
  const existing = compatJobs.get(jobKey);
  if (existing) return existing;

  const job = ensurePlayableMp4Unlocked(relativePath, options).finally(() => {
    compatJobs.delete(jobKey);
  });
  compatJobs.set(jobKey, job);
  return job;
}

async function ensurePlayableMp4Unlocked(
  relativePath: string,
  options?: { forceCompatible?: boolean }
): Promise<{
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  /** True when bytes are only on object storage (no durable local file to stream). */
  remoteOnly?: boolean;
} | null> {
  const cleaned = safeUploadsRelative(relativePath);
  if (!cleaned) return null;

  const forceCompatible = Boolean(options?.forceCompatible);
  const ext = videoExtension(cleaned);
  const mustTranscode = forceCompatible || needsVideoTranscodeToMp4(ext);

  // When forcing compat on an existing mp4, write beside it as *.compat.mp4 to avoid clobbering.
  const outRelative =
    forceCompatible && ext === "mp4"
      ? cleaned.replace(/\.mp4$/i, ".compat.mp4")
      : mustTranscode
        ? cleaned.replace(/\.[^.]+$/i, ".mp4")
        : cleaned;
  const localOut = resolve(uploadsDir, outRelative);

  if (await pathExists(localOut)) {
    return { relativePath: outRelative, absolutePath: localOut, mimeType: "video/mp4" };
  }

  if (!mustTranscode) {
    const localOriginal = resolve(uploadsDir, cleaned);
    if (await pathExists(localOriginal)) {
      return { relativePath: cleaned, absolutePath: localOriginal, mimeType: "video/mp4" };
    }
    if (!isObjectStorageEnabled()) return null;
    return {
      relativePath: cleaned,
      absolutePath: localOriginal,
      mimeType: "video/mp4",
      remoteOnly: true
    };
  }

  const localOriginal = resolve(uploadsDir, cleaned);
  let inputPath = localOriginal;
  let tempDownloaded: string | null = null;

  if (!(await pathExists(inputPath))) {
    if (!isObjectStorageEnabled()) return null;
    try {
      tempDownloaded = await downloadObjectToTemp(cleaned);
      inputPath = tempDownloaded;
    } catch {
      return null;
    }
  }

  try {
    await mkdir(dirname(localOut), { recursive: true });
    await transcodeFileToMp4(inputPath, localOut);
    await persistUploadedFile({
      relativePath: outRelative,
      absolutePath: localOut,
      mimeType: "video/mp4"
    });
    if (!(await pathExists(localOut))) {
      return {
        relativePath: outRelative,
        absolutePath: localOut,
        mimeType: "video/mp4",
        remoteOnly: true
      };
    }
    return { relativePath: outRelative, absolutePath: localOut, mimeType: "video/mp4" };
  } catch {
    // ffmpeg / disk / R2 write failed — serve original so clients do not get 5xx.
    if (await pathExists(localOriginal)) {
      return { relativePath: cleaned, absolutePath: localOriginal, mimeType: "video/mp4" };
    }
    if (isObjectStorageEnabled()) {
      return {
        relativePath: cleaned,
        absolutePath: localOriginal,
        mimeType: "video/mp4",
        remoteOnly: true
      };
    }
    return null;
  } finally {
    if (tempDownloaded) await removeTempDownload(tempDownloaded);
  }
}
