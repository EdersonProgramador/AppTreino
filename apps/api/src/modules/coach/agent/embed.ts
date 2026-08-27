import { llmRuntime } from "../llm.js";
import { lexicalEmbed } from "./embeddings.js";

export async function embedText(text: string): Promise<number[]> {
  const fallback = lexicalEmbed(text);
  const runtime = llmRuntime();
  if (!runtime) return fallback;
  try {
    const response = await fetch(`${runtime.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: runtime.embeddingModel,
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
