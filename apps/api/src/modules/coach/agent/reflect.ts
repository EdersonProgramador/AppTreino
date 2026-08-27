import { isSmallTalk } from "../engine.js";
import type { AgentPlan } from "../types.js";

export type Reflection = {
  ok: boolean;
  notes: string[];
  reply: string;
};

const FICHA = /estou no seu contexto|objetivo [a-zç]+, n[ií]vel|biotipo (ecto|meso|endo)/i;

/** Reflection Pattern: autoavaliação local (barata) antes de devolver a resposta. */
export function reflectOnReply(reply: string, userText: string, plan: AgentPlan): Reflection {
  const notes: string[] = [];
  let next = reply.trim();

  if (FICHA.test(next)) {
    notes.push("removeu recap de ficha");
    next = next.replace(FICHA, "").replace(/\s{2,}/g, " ").trim();
  }

  if (isSmallTalk(userText) && next.length > 420) {
    notes.push("encurtou cumprimento longo");
    next = next.slice(0, 380).replace(/\s+\S*$/, "") + ".";
  }

  if (plan.kind === "autonomous") {
    notes.push("autonomia limitada: sugestão apenas, sem ação fora do chat");
  }

  if (!next) {
    next = "Pode falar — treino de hoje, semana ou comida. O que cabe agora?";
    notes.push("resposta vazia corrigida");
  }

  return { ok: notes.length === 0, notes, reply: next };
}
