import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

export const uploadsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../uploads");

export type UploadGroup = "lessons" | "materials" | "images" | "audio";

const GROUP_TO_EXTENSIONS: Record<UploadGroup, string[]> = {
  lessons: ["mp4", "webm", "ogv", "mov"],
  materials: ["pdf", "doc", "docx", "xls", "xlsx", "csv"],
  images: ["jpg", "jpeg", "png", "webp", "gif"],
  audio: ["mp3", "wav", "ogg"]
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
  ogg: "audio/ogg"
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
  { extension: "webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], mask: undefined },
  { extension: "mp4", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { extension: "webm", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { extension: "mov", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { extension: "mp3", offset: 0, bytes: [0x49, 0x44, 0x33] },
  { extension: "wav", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  { extension: "ogg", offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  { extension: "csv", offset: 0, bytes: [] },
  { extension: "doc", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { extension: "docx", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { extension: "xls", offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { extension: "xlsx", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }
];

function detectExtensionFromBytes(buffer: Buffer): string | null {
  for (const signature of MAGIC_BYTES) {
    if (!signature.bytes.length) {
      continue;
    }

    if (buffer.length < signature.offset + signature.bytes.length) {
      continue;
    }

    const matches = signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte);

    if (matches) {
      return signature.extension;
    }
  }

  return null;
}

const SIGNATURE_BUFFER_SIZE = 16;

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
    for await (const chunk of fileStream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      if (signatureBytes < SIGNATURE_BUFFER_SIZE) {
        const copyLength = Math.min(buffer.length, SIGNATURE_BUFFER_SIZE - signatureBytes);
        buffer.copy(signatureBuffer, signatureBytes, 0, copyLength);
        signatureBytes += copyLength;
      }

      if (!output.write(buffer)) {
        await new Promise<void>((resolve, reject) => {
          output.once("drain", resolve);
          output.once("error", reject);
        });
      }
    }

    output.end();

    await new Promise<void>((resolve, reject) => {
      output.once("finish", resolve);
      output.once("error", reject);
    });
  } catch (error) {
    output.destroy();
    await rm(destinationPath, { force: true });
    throw error;
  }

  const magicExtension = detectExtensionFromBytes(signatureBuffer.subarray(0, signatureBytes));
  const nameExtension = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const extension =
    magicExtension ?? (nameExtension && !FORBIDDEN_EXTENSIONS.has(nameExtension) ? nameExtension : null);

  if (!extension || !extensionMatchesGroup(extension, group)) {
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
