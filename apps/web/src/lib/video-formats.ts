export const VIDEO_FILE_EXTENSIONS = [
  "mp4", "m4v", "mov", "qt", "webm", "mkv", "avi", "divx", "ogv", "ogg",
  "mpg", "mpeg", "mpe", "m2v", "mpv", "ts", "mts", "m2ts", "3gp", "3g2",
  "flv", "f4v", "wmv", "asf", "vob", "mxf", "rm", "rmvb", "rv", "hevc",
  "h265", "h264", "av1", "ivf"
] as const;

const VIDEO_EXTENSION_RE = new RegExp(`\\.(${VIDEO_FILE_EXTENSIONS.join("|")})$`, "i");

export const VIDEO_FILE_ACCEPT = `video/*,${VIDEO_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}`;
export const MEDIA_FILE_ACCEPT = `image/*,${VIDEO_FILE_ACCEPT}`;

export function isVideoFile(file: Pick<File, "name" | "type">) {
  return file.type.toLowerCase().startsWith("video/") || VIDEO_EXTENSION_RE.test(file.name);
}
