import { brand } from "./brand";
import { blobToBase64, isNativeAppShell, postNativeMessage } from "./native-bridge";
import { mediaUrl } from "./urls";

type ShareMediaItem = { url: string; type?: string | null };

type ShareablePost = {
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaItems?: ShareMediaItem[] | null;
};

function extensionFromMime(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "jpg";
}

function firstShareableMedia(post: ShareablePost): ShareMediaItem | null {
  const items = post.mediaItems?.length
    ? post.mediaItems
    : post.mediaUrl
      ? [{ url: post.mediaUrl, type: post.mediaType }]
      : [];
  const image = items.find((item) => String(item.type || "IMAGE").toUpperCase() !== "VIDEO");
  return image ?? items[0] ?? null;
}

async function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}

/** Compartilha a mídia do post (imagem preferencial) via share nativo / Web Share API. */
export async function shareSocialPost(post: ShareablePost) {
  const text = [post.body?.trim(), brand.shareSuffix || brand.name].filter(Boolean).join("\n\n");
  const media = firstShareableMedia(post);

  if (!media?.url) {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: brand.name, text, url });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
    }
    return;
  }

  const absoluteUrl = mediaUrl(media.url);

  let blob: Blob | null = null;
  try {
    const response = await fetch(absoluteUrl, { mode: "cors" });
    if (response.ok) blob = await response.blob();
  } catch {
    blob = null;
  }

  if (!blob) {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: brand.name, text, url: absoluteUrl });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText([text, absoluteUrl].filter(Boolean).join("\n"));
    }
    return;
  }

  const mime = blob.type || (String(media.type).toUpperCase() === "VIDEO" ? "video/mp4" : "image/jpeg");
  const filename = `apptreino-post.${extensionFromMime(mime)}`;
  const file = new File([blob], filename, { type: mime });

  if (isNativeAppShell() && mime.startsWith("image/")) {
    const base64 = await blobToBase64(blob);
    const sent = postNativeMessage({
      type: "SHARE_IMAGE",
      save: false,
      base64,
      filename,
      title: brand.name,
      text
    });
    if (sent) return;
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const payload: ShareData = { title: brand.name, text, files: [file] };
    if (typeof navigator.canShare !== "function" || navigator.canShare(payload)) {
      await navigator.share(payload);
      return;
    }
    await navigator.share({ title: brand.name, text, url: absoluteUrl });
    return;
  }

  await downloadBlob(blob, filename);
}
