import type { AgentPlan } from "../types.js";

const MEDICAL =
  /dor no peito|infarto|desmaio|tontura forte|n[aã]o consigo respirar|transtorno alimentar|anorexia|bulimia|v[oô]mito induzido/i;
const ABUSE = /esteroide|anabolizante|winstrol|dianabol|ciclo de horm[oô]nio|emagrecer \d+ kg em \d+ dia/i;
const JAILBREAK = /ignore (suas|as) instru[cç][oõ]es|voc[eê] agora [eé] (um|uma) |jailbreak|dan mode/i;

export type GuardrailHit = {
  blocked: true;
  reason: "medical" | "abuse" | "jailbreak" | "rate_limit" | "runaway";
  reply: string;
};

export function inspectGuardrails(text: string): GuardrailHit | null {
  if (MEDICAL.test(text)) {
    return {
      blocked: true,
      reason: "medical",
      reply:
        "Isso pede olhar clínico, não de treino. Para e procura um médico ou emergência se os sintomas forem agudos. Eu sigo aqui no que for treino e rotina, quando você estiver seguro."
    };
  }
  if (ABUSE.test(text)) {
    return {
      blocked: true,
      reason: "abuse",
      reply:
        "Não ajudo com atalho perigoso nem substância. Dá pra evoluir com treino, comida e sono — se quiser, a gente monta um plano sustentável."
    };
  }
  if (JAILBREAK.test(text)) {
    return {
      blocked: true,
      reason: "jailbreak",
      reply: "Sigo como Coach do AppTreino. Me fala do treino, da semana ou da comida que eu te ajudo."
    };
  }
  return null;
}

export const MAX_REACT_ITERATIONS = 4;
export const MAX_TOOL_CALLS = 4;
export const MAX_RUNS_PER_10_MIN = 30;

export function autonomyCap(plan: AgentPlan): AgentPlan {
  if (plan.kind !== "autonomous") return plan;
  return {
    ...plan,
    persistPlan: plan.persistPlan,
    steps: plan.steps.slice(0, MAX_TOOL_CALLS)
  };
}
