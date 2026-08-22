export type PostMediaKind = "image" | "video";

export interface PostMediaItem {
  url: string;
  kind: PostMediaKind;
}

function isVideoUrl(value: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(value) || value.includes("/video/upload/");
}

export function parsePostMedia(raw?: string | null): PostMediaItem[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === "string") {
            return { url: item, kind: (isVideoUrl(item) ? "video" : "image") as PostMediaKind };
          }
          const url = String(item?.url || "");
          const kind: PostMediaKind = item?.kind === "video" || isVideoUrl(url) ? "video" : "image";
          return url ? { url, kind } : null;
        })
        .filter((item): item is PostMediaItem => Boolean(item));
    }
  } catch {
    // formato legado
  }

  return raw.split(",").filter(Boolean).map(part => {
    const url = part.trim();
    return { url, kind: isVideoUrl(url) ? "video" : "image" };
  });
}
