import { prisma } from "../../../prisma.js";
import { cosine, lexicalEmbed, parseEmbedding } from "./embeddings.js";
import { embedText } from "./embed.js";

export const COLLECTIVE_MEMORY = [
  "Atenda a pergunta atual. Não substitua por menu genérico."
];

type MemoryKind = "LONG_TERM" | "EPISODIC" | "CONTEXTUAL" | "GLOBAL";

type MemoryRow = { content: string; embedding: unknown; kind: string };

function memories() {
  const client = prisma as unknown as {
    coachMemory?: {
      findMany: (args: object) => Promise<MemoryRow[]>;
      create: (args: object) => Promise<unknown>;
    };
  };
  return client.coachMemory;
}

export async function retrieveMemories(userId: string, query: string, k = 5) {
  const queryVec = lexicalEmbed(query);
  const collected = [...COLLECTIVE_MEMORY];
  try {
    const store = memories();
    if (!store) return collected.slice(0, k);
    const rows = await store.findMany({
      where: { OR: [{ userId }, { kind: "GLOBAL" }] },
      orderBy: { createdAt: "desc" },
      take: 80
    });
    const ranked = rows
      .map((row) => {
        const vec = parseEmbedding(row.embedding) ?? lexicalEmbed(row.content);
        return { content: row.content, score: cosine(queryVec, vec), kind: row.kind };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((row) => `[${row.kind}] ${row.content}`);
    return [...collected, ...ranked].slice(0, k + 3);
  } catch {
    return collected;
  }
}

export async function remember(
  userId: string | null,
  kind: MemoryKind,
  content: string,
  metadata?: Record<string, unknown>
) {
  const text = content.trim().slice(0, 1200);
  if (!text) return;
  try {
    const store = memories();
    if (!store) return;
    const embedding = kind === "LONG_TERM" || kind === "GLOBAL" ? await embedText(text) : lexicalEmbed(text);
    await store.create({
      data: { userId, kind, content: text, embedding, metadata: metadata ?? undefined }
    });
  } catch {
    // Tabela ainda não migrada: o loop segue sem persistir memória.
  }
}
