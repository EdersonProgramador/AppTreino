import { brand } from "./brand";
import { getApiBaseUrl } from "../api";
import { isNativeAppShell, postNativeMessage } from "./native-bridge";

type ShareMediaItem = { url: string; type?: string | null };

type ShareablePost = {
  id: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaItems?: ShareMediaItem[] | null;
};

/** Link público do post (HTML na API com OG + página /p/:id no web). */
export function buildPostShareUrl(postId: string) {
  if (typeof window === "undefined") return "";
  const api = getApiBaseUrl().replace(/\/+$/, "");
  // Em produção a API serve HTML com og:image para WhatsApp/Telegram.
  // Em dev (api="") o proxy Vite encaminha /public/* para a API.
  const base = api || window.location.origin;
  return `${base}/public/share/posts/${encodeURIComponent(postId)}`;
}

/** Compartilha o link do post via sheet nativo do aparelho. */
export async function shareSocialPost(post: ShareablePost) {
  const url = buildPostShareUrl(post.id);
  const text = [post.body?.trim(), brand.shareSuffix || brand.name].filter(Boolean).join("\n\n");
  const title = brand.name;

  if (isNativeAppShell()) {
    const sent = postNativeMessage({
      type: "SHARE_TEXT",
      title,
      text: [text, url].filter(Boolean).join("\n\n"),
      url
    });
    if (sent) return;
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    await navigator.share({ title, text, url });
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n\n"));
    return;
  }

  throw new Error("Compartilhamento não disponível neste dispositivo.");
}
