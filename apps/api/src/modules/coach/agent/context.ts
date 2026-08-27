import { conversationForModel } from "../llm.js";
import type { CoachMessage } from "../types.js";

const MAX_TURNS = 8;
const MAX_STITCH_CHARS = 1800;

export type StitchedContext = {
  history: CoachMessage[];
  memoryBlock: string;
};

/** Remove cumprimento automático e corta histórico antigo (pruning). */
export function pruneHistory(history: CoachMessage[]): CoachMessage[] {
  const cleaned = conversationForModel(history);
  if (cleaned.length <= MAX_TURNS * 2) return cleaned;
  return cleaned.slice(-(MAX_TURNS * 2));
}

/** Junta memória coletiva (global) com memória individual do aluno (stitching). */
export function stitchContext(history: CoachMessage[], memories: string[]): StitchedContext {
  const pruned = pruneHistory(history);
  const unique = [...new Set(memories.map((item) => item.trim()).filter(Boolean))];
  let memoryBlock = unique.join("\n");
  if (memoryBlock.length > MAX_STITCH_CHARS) {
    memoryBlock = memoryBlock.slice(0, MAX_STITCH_CHARS) + "…";
  }
  return { history: pruned, memoryBlock };
}
