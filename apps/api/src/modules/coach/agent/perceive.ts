import { conversationForModel } from "../llm.js";
import { lastUserText } from "../engine.js";
import type { CoachMessage } from "../types.js";

export type Perception = {
  question: string;
  isFollowUp: boolean;
  priorUser?: string;
  priorAssistant?: string;
  constraints: string[];
  threadBrief: string;
};

const FOLLOW_UP =
  /^(e |e se|e a |e o |isso|desse|dessa|desse jeito|continua|então|entao|ta mas|tá mas|e depois|só isso|so isso|mais curto|e se eu)/i;

export function perceive(history: CoachMessage[]): Perception {
  const cleaned = conversationForModel(history);
  const question = lastUserText(cleaned);
  const users = cleaned.filter((item) => item.role === "user");
  const assistants = cleaned.filter((item) => item.role === "assistant");
  const priorUser = users.length > 1 ? users[users.length - 2]?.content : undefined;
  const priorAssistant = assistants.at(-1)?.content;
  const isFollowUp = Boolean(priorAssistant) && (users.length > 1 || FOLLOW_UP.test(question.trim()));
  const constraints: string[] = [];
  const q = question.toLowerCase();
  if (/\d+\s*min|sem tempo|pouco tempo|corrido hoje|rápid[oa]|sem tempo/.test(q)) constraints.push("pouco tempo");
  if (/em uma frase|resumid|bem curto|só uma linha/.test(q)) constraints.push("resposta curta");
  if (/cansad|dor|les[aã]o|joelho|ombro|lombar|travad/.test(q)) constraints.push("cuidado com o corpo");
  if (/\bhoje\b/.test(q)) constraints.push("foco em hoje");
  if (/n[aã]o quero|odeio|sem academia|em casa/.test(q)) constraints.push("restrição do aluno");

  const threadBrief = [
    priorUser ? `Pergunta anterior: ${priorUser.slice(0, 280)}` : "",
    priorAssistant ? `Sua última fala: ${priorAssistant.slice(0, 320)}` : "",
    `Pergunta atual — atenda isto, não desvie: ${question}`,
    constraints.length ? `Restrições percebidas: ${constraints.join("; ")}` : "",
    isFollowUp ? "Isto é continuação. Não recomece do zero; amarre na fala anterior." : ""
  ]
    .filter(Boolean)
    .join("\n");

  return { question, isFollowUp, priorUser, priorAssistant, constraints, threadBrief };
}

export function perceptionSystemBlock(perception: Perception) {
  return [
    "Antes de responder, reflita a pergunta do aluno (não a ficha dele).",
    perception.threadBrief,
    "Primeira linha: mostre que entendeu o pedido (tempo, dúvida, continuação, restrição).",
    "Depois: orientação concreta para ESSE pedido. Sem menu genérico (treino / semana / comida) se a pergunta já é específica."
  ].join("\n");
}
