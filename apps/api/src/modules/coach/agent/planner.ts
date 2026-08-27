import { isSmallTalk, lastUserText } from "../engine.js";
import type { AgentPlan, CoachMessage } from "../types.js";

export function planTurn(history: CoachMessage[]): AgentPlan {
  const text = lastUserText(history).toLowerCase();
  const wantsDiet = /dieta|refei|comer|biotipo|prote[ií]na|kcal|card[aá]pio|como eu como/.test(text);
  const wantsPlan =
    /treino|s[eé]rie|carga|muscul|hiit|yoga|hipertrof|plano de treino|montar (o )?treino|gerar (o )?plano|modalidade/.test(
      text
    );
  const wantsRun = /corrida|correr|pace|pedal|caminh/.test(text);
  const autonomous = /pode decidir|faz sozinho|modo autom|age por mim|voc[eê] escolhe/.test(text);
  const goal = (wantsDiet && wantsPlan) || /semana completa|treino e dieta|dieta e treino/.test(text);
  const shortAsk = /em uma frase|resumid|bem curto|só uma linha/.test(text);

  if (autonomous) {
    return {
      kind: "autonomous",
      pattern: "plan-execute",
      steps: ["gerar_treino_personalizado", "montar_dieta_biotipo"],
      useTools: true,
      persistPlan: true
    };
  }
  if (goal) {
    return {
      kind: "goal",
      pattern: "plan-execute",
      steps: ["gerar_treino_personalizado", "montar_dieta_biotipo"],
      useTools: true,
      persistPlan: true
    };
  }
  if ((isSmallTalk(text) || shortAsk) && !wantsDiet && !wantsPlan && !wantsRun) {
    return { kind: "interactive", pattern: "react", steps: [], useTools: false, persistPlan: false };
  }
  if (wantsDiet && !wantsPlan) {
    return {
      kind: "task",
      pattern: "react",
      steps: ["montar_dieta_biotipo"],
      useTools: true,
      persistPlan: false
    };
  }
  if (wantsPlan || wantsRun) {
    return {
      kind: "task",
      pattern: "react",
      steps: ["gerar_treino_personalizado"],
      useTools: true,
      persistPlan: true
    };
  }
  return { kind: "interactive", pattern: "react", steps: [], useTools: true, persistPlan: false };
}
