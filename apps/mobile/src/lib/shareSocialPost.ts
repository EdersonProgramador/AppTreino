import { Share } from "react-native";
import { WEB_URL } from "../config";
import { brand } from "../student/brand";

type ShareablePost = {
  id: string;
  body?: string | null;
};

/** Link público do post (OG preview no WhatsApp/Telegram), igual à web. */
export function buildPostShareUrl(postId: string) {
  return `${WEB_URL.replace(/\/$/, "")}/public/share/posts/${encodeURIComponent(postId)}`;
}

/** Abre o sheet nativo de compartilhar com o link do post. */
export async function shareSocialPost(post: ShareablePost) {
  const url = buildPostShareUrl(post.id);
  const text = [post.body?.trim(), brand.shareSuffix || brand.name].filter(Boolean).join("\n\n");
  const message = [text, url].filter(Boolean).join("\n\n");
  await Share.share({
    title: brand.name,
    message,
    url
  });
}
