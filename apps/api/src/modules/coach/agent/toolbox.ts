import { buildDiet, buildWorkoutPlan } from "../engine.js";
import type { CoachChatResult, CoachContext, DietPlan } from "../types.js";

export const COACH_TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_treino_personalizado",
      description: "Gera a semana de treino com as modalidades AppTreino, clima e ofensiva.",
      parameters: {
        type: "object",
        properties: {
          daysPerWeek: { type: "integer", minimum: 2, maximum: 6 },
          focus: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "montar_dieta_biotipo",
      description: "Monta dieta pelo biotipo (ecto/meso/endo) e objetivo.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", enum: ["cut", "bulk", "recomp"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ler_ofensiva_e_clima",
      description: "Lê ofensiva, volume recente e clima atual. Use para sugerir o que fazer hoje.",
      parameters: { type: "object", properties: {} }
    }
  }
] as const;

export type ToolName = (typeof COACH_TOOLS)[number]["function"]["name"];

export type ToolOutcome = {
  name: string;
  observation: string;
  plan?: CoachChatResult["plan"];
  diet?: DietPlan;
};

export function executeTool(
  name: string,
  rawArgs: string,
  ctx: CoachContext
): ToolOutcome {
  let args: { daysPerWeek?: number; focus?: string; goal?: "cut" | "bulk" | "recomp" } = {};
  try {
    args = JSON.parse(rawArgs || "{}") as typeof args;
  } catch {
    args = {};
  }

  if (name === "gerar_treino_personalizado") {
    const next = buildWorkoutPlan({
      ...ctx,
      daysPerWeek: args.daysPerWeek ?? ctx.daysPerWeek,
      focus: args.focus ?? ctx.focus,
      objective: args.focus || ctx.objective
    });
    return {
      name,
      plan: next,
      diet: next.diet,
      observation: JSON.stringify({
        summary: next.summary,
        today: next.days[0]?.title,
        days: next.days.map((day) => ({
          title: day.title,
          modality: day.modality,
          exercises: day.exercises.map((item) => item.name)
        })),
        recommendations: next.recommendations.slice(0, 3)
      })
    };
  }

  if (name === "montar_dieta_biotipo") {
    const diet = buildDiet({ ...ctx, objective: args.goal ?? ctx.objective });
    return { name, diet, observation: JSON.stringify(diet) };
  }

  if (name === "ler_ofensiva_e_clima") {
    return {
      name,
      observation: JSON.stringify({
        streakDays: ctx.streakDays,
        sportTotals: ctx.sportTotals,
        weather: ctx.weather ?? null
      })
    };
  }

  return { name, observation: "{\"error\":\"ferramenta desconhecida\"}" };
}
