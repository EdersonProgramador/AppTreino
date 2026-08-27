import { isGenericCoachMenu, isSmallTalk, localCoachChat } from "../engine.js";
import type { AgentPlan, CoachContext, CoachMessage } from "../types.js";
import type { Perception } from "./perceive.js";

export type Reflection = {
  ok: boolean;
  notes: string[];
  reply: string;
};

const FICHA = /estou no seu contexto|objetivo [a-zç]+, n[ií]vel|biotipo (ecto|meso|endo)/i;

/** Reflection: a resposta precisa atender a pergunta, não um menu padrão. */
export function reflectOnReply(
  reply: string,
  userText: string,
  plan: AgentPlan,
  extras?: { ctx?: CoachContext; history?: CoachMessage[]; perception?: Perception }
): Reflection {
  const notes: string[] = [];
  let next = reply.trim();

  if (FICHA.test(next)) {
    notes.push("removeu recap de ficha");
    next = next.replace(FICHA, "").replace(/\s{2,}/g, " ").trim();
  }

  const missed = !isSmallTalk(userText) && isGenericCoachMenu(next);
  if (missed && extras?.ctx && extras.history) {
    notes.push("resposta genérica — reescreveu a partir da pergunta");
    next = localCoachChat(extras.ctx, extras.history).reply;
  }

  if (extras?.perception?.constraints.includes("resposta curta") && next.length > 280) {
    notes.push("encurtou porque o aluno pediu frase curta");
    next = next.split("\n").filter(Boolean).slice(0, 2).join(" ");
    if (next.length > 240) next = next.slice(0, 220).replace(/\s+\S*$/, "") + ".";
  }

  if (isSmallTalk(userText) && next.length > 420) {
    notes.push("encurtou cumprimento longo");
    next = next.slice(0, 380).replace(/\s+\S*$/, "") + ".";
  }

  if (plan.kind === "autonomous") {
    notes.push("autonomia limitada: sugestão apenas, sem ação fora do chat");
  }

  if (!next) {
    const asked = extras?.perception?.question ?? userText;
    next = `Pelo que você perguntou (“${asked.slice(0, 80)}”), me confirma só o que trava isso hoje.`;
    notes.push("resposta vazia corrigida");
  }

  return { ok: notes.length === 0, notes, reply: next };
}
