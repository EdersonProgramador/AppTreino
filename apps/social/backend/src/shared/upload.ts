import fs from "fs";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { publicPath } from "./paths";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function extensionFor(mimetype: string) {
  if (mimetype === "image/jpeg") {
    return "jpg";
  }
  if (mimetype === "video/quicktime") {
    return "mov";
  }
  return mimetype.split("/")[1] || "bin";
}

export function imageUpload(folder: "posts" | "user", maxFiles = 4) {
  return multer({
    storage: multer.diskStorage({
      destination: publicPath("images", folder),
      filename: (_request, file, callback) => {
        callback(null, `${uuid()}.${extensionFor(file.mimetype)}`);
      }
    }),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: maxFiles
    },
    fileFilter: (_request, file, callback) => {
      if (IMAGE_TYPES.has(file.mimetype)) {
        callback(null, true);
        return;
      }
      callback(new Error("Envie apenas imagens (jpg, png, webp ou gif)."));
    }
  });
}

export function mediaUpload(options: {
  folder: string[];
  kinds: "image" | "video" | "any";
  maxFiles?: number;
  maxMb?: number;
}) {
  const allowed = options.kinds === "image"
    ? IMAGE_TYPES
    : options.kinds === "video"
      ? VIDEO_TYPES
      : new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

  return multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => {
        const dir = publicPath(...options.folder);
        fs.mkdirSync(dir, { recursive: true });
        callback(null, dir);
      },
      filename: (_request, file, callback) => {
        callback(null, `${uuid()}.${extensionFor(file.mimetype)}`);
      }
    }),
    limits: {
      fileSize: (options.maxMb || 15) * 1024 * 1024,
      files: options.maxFiles || 1
    },
    fileFilter: (_request, file, callback) => {
      if (allowed.has(file.mimetype)) {
        callback(null, true);
        return;
      }
      callback(new Error(options.kinds === "video"
        ? "Envie um vídeo (mp4 ou webm)."
        : "Envie uma imagem ou um vídeo curto."));
    }
  });
}
