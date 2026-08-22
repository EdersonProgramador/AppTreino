export type PostMediaKind = "image" | "video";

export interface PostMediaItem {
  url: string;
  kind: PostMediaKind;
}

function isVideoUrl(value: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(value) || value.includes("/video/upload/");
}

function resolveUrl(value: string, cloudinaryBase?: string) {
  if (value.startsWith("http")) {
    return value;
  }
  if (!cloudinaryBase) {
    return value;
  }
  return `${cloudinaryBase.replace(/\/$/, "")}/${value}`;
}

export function parsePostMedia(raw?: string | null, cloudinaryBase?: string): PostMediaItem[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === "string") {
            const url = resolveUrl(item, cloudinaryBase);
            return { url, kind: (isVideoUrl(item) || isVideoUrl(url) ? "video" : "image") as PostMediaKind };
          }
          const url = resolveUrl(String(item?.url || ""), cloudinaryBase);
          const kind: PostMediaKind = item?.kind === "video" || isVideoUrl(url) ? "video" : "image";
          return url ? { url, kind } : null;
        })
        .filter((item): item is PostMediaItem => Boolean(item));
    }
  } catch {
    // posts antigos usam lista separada por vírgula
  }

  return raw.split(",").filter(Boolean).map(part => {
    const url = resolveUrl(part.trim(), cloudinaryBase);
    return {
      url,
      kind: isVideoUrl(part) || isVideoUrl(url) ? "video" : "image"
    };
  });
}
