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

/**
 * Link público do post — HTML com OG tags para preview no WhatsApp/Telegram.
 * Produção: mesma origem do web (Vercel faz proxy de /public/share/* → API).
 * Dev: proxy Vite encaminha /public/* para a API local.
 */
export function buildPostShareUrl(postId: string) {
  if (typeof window === "undefined") return "";

  if (!import.meta.env.DEV) {
    return `${window.location.origin}/public/share/posts/${encodeURIComponent(postId)}`;
  }

  const api = getApiBaseUrl().replace(/\/+$/, "");
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
