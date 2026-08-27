import { env } from "../../env.js";
import { COACH_TOOLS } from "./agent/toolbox.js";
import type { CoachContext, CoachMessage } from "./types.js";

function firstNameOf(ctx: CoachContext) {
  return ctx.name.split(" ")[0] || "você";
}

export function systemPrompt(ctx: CoachContext, memoryBlock = "") {
  const first = firstNameOf(ctx);
  return [
    `Você é o Coach do AppTreino — um treinador de verdade no WhatsApp. A pessoa se chama ${first}.`,
    "Loop interno: perceber o pedido → raciocinar → usar tool se precisar → falar. Sem recitar a ficha.",
    "Fale português do Brasil, caloroso e humano. Frases curtas.",
    "NUNCA recapitulue objetivo, nível, biotipo ou ofensiva só para mostrar que leu.",
    "Se a pessoa só cumprimentar, responda o cumprimento e pergunte UMA coisa.",
    "Quando montar treino ou dieta, comece pelo que fazer HOJE. Uma pergunta no fim.",
    "Nunca invente números de dieta: use montar_dieta_biotipo. Nunca invente a grade: use gerar_treino_personalizado.",
    "Não é médico. Dor aguda ou transtorno alimentar → profissional, com calma.",
    "Dados internos (usar em silêncio):",
    `objetivo ${ctx.objective}; nível ${ctx.level}; ${ctx.daysPerWeek}x/semana; biotipo ${ctx.biotype} (${ctx.biotypeReason});`,
    `peso ${ctx.weightKg ?? "—"} kg; altura ${ctx.heightCm ?? "—"} cm; %gordura ${ctx.bodyFatPct ?? "—"}; ofensiva ${ctx.streakDays}d;`,
    `volume: treino ${ctx.sportTotals.WORKOUT}, corrida ${ctx.sportTotals.RUN}, caminhada ${ctx.sportTotals.WALK}, pedal ${ctx.sportTotals.RIDE};`,
    ctx.weather ? `clima: ${ctx.weather.tempC}° · ${ctx.weather.label ?? ""}` : "clima não informado",
    `cidade ${ctx.city ?? "—"}; equipamento ${ctx.equipmentTags.join(", ") || "não informado"}.`,
    memoryBlock ? `Memória (coletiva + individual):\n${memoryBlock}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function conversationForModel(history: CoachMessage[]): CoachMessage[] {
  if (history[0]?.role === "assistant") return history.slice(1);
  return history;
}

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
};

export async function openaiCoach(messages: OpenAiMessage[], tools = true) {
  if (!env.OPENAI_API_KEY) return null;
  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: tools ? 0.85 : 0.7,
        frequency_penalty: 0.35,
        presence_penalty: 0.2,
        messages,
        ...(tools ? { tools: COACH_TOOLS, tool_choice: "auto" } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      choices?: Array<{ message?: OpenAiMessage }>;
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function llmConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

export { transcribeAudio } from "./whisper.js";
