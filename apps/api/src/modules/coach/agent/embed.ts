import { env } from "../../../env.js";
import { lexicalEmbed } from "./embeddings.js";

export async function embedText(text: string): Promise<number[]> {
  const fallback = lexicalEmbed(text);
  if (!env.OPENAI_API_KEY) return fallback;
  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: text.slice(0, 4000)
      })
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = data.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length ? vector : fallback;
  } catch {
    return fallback;
  }
}
