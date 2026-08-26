import { apiUploadFile } from "../auth/api";

type PickerAssetLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: string | null;
  duration?: number | null;
};

function extensionFromUri(uri: string) {
  const clean = uri.split("?")[0].split("#")[0];
  const name = clean.split(/[/\\]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isVideoAsset(asset: PickerAssetLike) {
  if (asset.type === "video") return true;
  if (typeof asset.duration === "number" && asset.duration > 0) return true;
  const mime = (asset.mimeType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  const ext = extensionFromUri(asset.uri) || extensionFromUri(asset.fileName ?? "");
  return ["mp4", "m4v", "mov", "webm", "mkv", "avi"].includes(ext);
}

/** Build a filename that matches the real container (iOS camera is often .mov). */
export function uploadFilenameForAsset(asset: PickerAssetLike, fallbackBase = "upload") {
  const fromName = extensionFromUri(asset.fileName ?? "");
  const fromUri = extensionFromUri(asset.uri);
  const mime = (asset.mimeType ?? "").toLowerCase();
  let ext = fromName || fromUri;
  if (!ext) {
    if (mime.includes("quicktime") || mime.includes("mov")) ext = "mov";
    else if (mime.includes("webm")) ext = "webm";
    else if (mime.startsWith("video/")) ext = "mp4";
    else if (mime.includes("png")) ext = "png";
    else if (mime.includes("webp")) ext = "webp";
    else ext = isVideoAsset(asset) ? "mp4" : "jpg";
  }
  if (ext === "jpeg") ext = "jpg";
  return `${fallbackBase}.${ext}`;
}

export async function uploadPickerAsset<T extends { file: { url: string } }>(
  path: string,
  asset: PickerAssetLike,
  token: string,
  fallbackBase = "upload"
) {
  const filename = uploadFilenameForAsset(asset, fallbackBase);
  const mediaType = isVideoAsset(asset) ? ("VIDEO" as const) : ("IMAGE" as const);
  const uploaded = await apiUploadFile<T>(path, asset.uri, token, filename, asset.mimeType);
  return { uploaded, mediaType, filename };
}
