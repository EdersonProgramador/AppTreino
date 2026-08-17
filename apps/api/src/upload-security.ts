import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

export const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");

export type UploadGroup = "lessons" | "materials" | "images" | "audio";

const GROUP_TO_EXTENSIONS: Record<UploadGroup, string[]> = {
  // Exercícios aceitam vídeo e imagem/GIF (UI do CMS).
  lessons: ["mp4", "webm", "ogv", "mov", "jpg", "jpeg", "png", "webp", "gif"],
  materials: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "jpg", "jpeg", "png", "webp", "gif"],
  images: ["jpg", "jpeg", "png", "webp", "gif"],
  audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm", "mpeg", "mpga"]
};

const EXTENSION_TO_MIMETYPE: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus"
};

const FORBIDDEN_EXTENSIONS = new Set([
  "html",
  "htm",
  "svg",
  "xhtml",
  "php",
  "phtml",
  "php5",
  "swf",
  "js",
  "mjs",
  "xml",
  "asp",
  "aspx",
  "jsp",
  "sh",
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "so"
]);

const MAGIC_BYTES: Array<{ extension: string; offset: number; bytes: number[]; mask?: number[] }> = [
  { extension: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { extension: "png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extension: "jpg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { extension: "jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { extension: "gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { extension: "webm", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { extension: "mp3", offset: 0, bytes: [0x49, 0x44, 0x33] },
  { extension: "ogg", offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  { extension: "flac", offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] },
  { extension: "csv", offset: 0, bytes: [] },
  { extension: "doc", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { extension: "docx", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { extension: "xls", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { extension: "xlsx", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }
];

function bytesMatch(buffer: Buffer, offset: number, bytes: number[]) {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function asciiAt(buffer: Buffer, offset: number, length: number) {
  if (buffer.length < offset + length) {
    return "";
  }

  return buffer.subarray(offset, offset + length).toString("ascii");
}

function detectExtensionFromBytes(buffer: Buffer): string | null {
  if (bytesMatch(buffer, 0, [0x49, 0x44, 0x33])) {
    return "mp3";
  }

  if (bytesMatch(buffer, 0, [0x52, 0x49, 0x46, 0x46])) {
    const riffType = asciiAt(buffer, 8, 4);
    if (riffType === "WEBP") return "webp";
    if (riffType === "WAVE") return "wav";
  }

  if (bytesMatch(buffer, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = asciiAt(buffer, 8, 4);
    if (brand === "M4A " || brand === "M4B " || brand === "mp4a") return "m4a";
    if (brand === "qt  ") return "mov";
    return "mp4";
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "mp3";
  }

  for (const signature of MAGIC_BYTES) {
    if (!signature.bytes.length) {
      continue;
    }

    if (bytesMatch(buffer, signature.offset, signature.bytes)) {
      return signature.extension;
    }
  }

  return null;
}

const SIGNATURE_BUFFER_SIZE = 16;

const AUDIO_MIME_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mpeg3": "mp3",
  "audio/x-mpeg": "mp3",
  "audio/x-mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/x-aac": "aac",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "audio/ogg": "ogg",
  "audio/vorbis": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/opus": "opus",
  "audio/webm": "webm"
};

function normalizeStoredAudioExtension(extension: string) {
  if (extension === "mpeg" || extension === "mpga") return "mp3";
  if (extension === "mp4" || extension === "mov") return "m4a";
  return extension;
}

function extensionFromFilename(filename: string | undefined) {
  const lower = (filename ?? "").trim().toLowerCase();
  const name = lower.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).replace(/[^a-z0-9]/g, "");
}

function extensionFromMime(mimetype: string | undefined) {
  const mime = (mimetype ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (AUDIO_MIME_TO_EXTENSION[mime]) {
    return AUDIO_MIME_TO_EXTENSION[mime];
  }
  if (mime.startsWith("audio/")) {
    const subtype = mime.slice("audio/".length).replace(/^x-/, "");
    if (subtype === "mpeg") return "mp3";
    return subtype || "";
  }
  return "";
}

export function resolveUploadExtension(
  buffer: Buffer,
  filename: string | undefined,
  group: UploadGroup,
  declaredMimetype?: string
): string | null {
  const nameExtension = extensionFromFilename(filename);
  const mimeExtension = extensionFromMime(declaredMimetype);
  const magicExtension = detectExtensionFromBytes(buffer);

  if (group === "audio") {
    const candidates = [magicExtension, nameExtension, mimeExtension].filter(Boolean) as string[];
    for (const candidate of candidates) {
      const normalized = normalizeStoredAudioExtension(candidate);
      if (extensionMatchesGroup(normalized, "audio") || extensionMatchesGroup(candidate, "audio")) {
        return normalizeStoredAudioExtension(
          extensionMatchesGroup(normalized, "audio") ? normalized : candidate
        );
      }
    }

    if ((declaredMimetype ?? "").toLowerCase().startsWith("audio/")) {
      return "mp3";
    }

    return null;
  }

  if (magicExtension && extensionMatchesGroup(magicExtension, group)) {
    return magicExtension;
  }

  if (nameExtension && !FORBIDDEN_EXTENSIONS.has(nameExtension) && extensionMatchesGroup(nameExtension, group)) {
    return nameExtension;
  }

  return null;
}

export async function saveValidatedUpload(
  fileStream: Readable,
  destinationPath: string,
  group: UploadGroup,
  declaredMimetype: string,
  filename: string | undefined
): Promise<string | null> {
  const signatureBuffer = Buffer.alloc(SIGNATURE_BUFFER_SIZE);
  let signatureBytes = 0;

  const output = createWriteStream(destinationPath);

  try {
    const writeFailed = new Promise<never>((_, reject) => {
      output.once("error", reject);
    });

    for await (const chunk of fileStream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (signatureBytes < SIGNATURE_BUFFER_SIZE) {
        const copyLength = Math.min(buffer.length, SIGNATURE_BUFFER_SIZE - signatureBytes);
        buffer.copy(signatureBuffer, signatureBytes, 0, copyLength);
        signatureBytes += copyLength;
      }

      if (!output.write(buffer)) {
        await Promise.race([
          new Promise<void>((resolve) => output.once("drain", resolve)),
          writeFailed
        ]);
      }
    }

    output.end();
    await Promise.race([
      new Promise<void>((resolve) => output.once("finish", resolve)),
      writeFailed
    ]);
  } catch (error) {
    output.destroy();
    await rm(destinationPath, { force: true });
    throw error;
  }

  const extension = resolveUploadExtension(
    signatureBuffer.subarray(0, signatureBytes),
    filename,
    group,
    declaredMimetype
  );

  if (!extension) {
    await rm(destinationPath, { force: true });
    return null;
  }

  return `${extension}`;
}

function extensionMatchesGroup(extension: string, group: UploadGroup): boolean {
  if (FORBIDDEN_EXTENSIONS.has(extension)) {
    return false;
  }

  return GROUP_TO_EXTENSIONS[group].includes(extension);
}

export function buildPublicUploadUrl(relativePath: string): string {
  const base = env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (base) {
    return `${base}/uploads/${relativePath.replace(/\\/g, "/")}`;
  }

  return `/uploads/${relativePath.replace(/\\/g, "/")}`;
}
