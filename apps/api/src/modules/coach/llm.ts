import { env } from "../../env.js";
import { COACH_TOOLS } from "./agent/toolbox.js";
import { isGenericCoachMenu } from "./engine.js";
import type { CoachContext, CoachMessage } from "./types.js";

function firstNameOf(ctx: CoachContext) {
  return ctx.name.split(" ")[0] || "você";
}

export function systemPrompt(ctx: CoachContext, memoryBlock = "") {
  const first = firstNameOf(ctx);
  return [
    `Você é o Coach do AppTreino. A pessoa se chama ${first}. Português do Brasil, direto, como um treinador no WhatsApp.`,
    "Regra de ouro: a última mensagem do aluno é a tarefa. Responda ELA. Não troque por um menu (treino / semana / comida) se o pedido já é específico.",
    "Seja reflexivo: na primeira linha, mostre que entendeu o contexto da pergunta (tempo, continuação, dúvida, restrição). Depois a orientação concreta.",
    "Se for continuação (“e se”, “isso”, “e a dieta”), amarre na fala anterior. Não recomece do zero.",
    "Só cumprimente se a mensagem for só cumprimento (oi, e aí).",
    "Exemplo ruim: aluno diz “tô sem tempo hoje” e você oferece treino/semana/comida.",
    "Exemplo bom: “Sem tempo hoje. Faz 18 min: …”",
    "Exemplo ruim: “responde em uma frase” e você manda um parágrafo + menu.",
    "Exemplo bom: uma frase só, sobre o pedido.",
    "NUNCA recapitulue a ficha (objetivo, nível, biotipo, ofensiva) para provar que leu. Use em silêncio, só quando mudar a orientação.",
    "Números de dieta: tool montar_dieta_biotipo. Grade da semana: tool gerar_treino_personalizado. Ofensiva/clima do dia: ler_ofensiva_e_clima.",
    "Não é médico. Dor aguda ou transtorno alimentar → profissional.",
    "Dados internos (não vomitar):",
    `objetivo ${ctx.objective}; nível ${ctx.level}; ${ctx.daysPerWeek}x/semana; biotipo ${ctx.biotype} (${ctx.biotypeReason});`,
    `peso ${ctx.weightKg ?? "—"} kg; altura ${ctx.heightCm ?? "—"} cm; %gordura ${ctx.bodyFatPct ?? "—"}; ofensiva ${ctx.streakDays}d;`,
    `volume: treino ${ctx.sportTotals.WORKOUT}, corrida ${ctx.sportTotals.RUN}, caminhada ${ctx.sportTotals.WALK}, pedal ${ctx.sportTotals.RIDE};`,
    ctx.weather ? `clima: ${ctx.weather.tempC}° · ${ctx.weather.label ?? ""}` : "clima não informado",
    `cidade ${ctx.city ?? "—"}; equipamento ${ctx.equipmentTags.join(", ") || "não informado"}.`,
    memoryBlock ? `Memórias úteis (não substituem a pergunta atual):\n${memoryBlock}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function conversationForModel(history: CoachMessage[]): CoachMessage[] {
  const start = history[0]?.role === "assistant" ? history.slice(1) : history;
  return start.filter((item) => item.role !== "assistant" || !isGenericCoachMenu(item.content));
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
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.45,
        frequency_penalty: 0.25,
        presence_penalty: 0.1,
        messages,
        ...(tools ? { tools: COACH_TOOLS, tool_choice: "auto" } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn("[coach/llm] OpenAI", response.status, errBody.slice(0, 300));
      return null;
    }
    return (await response.json()) as {
      choices?: Array<{ message?: OpenAiMessage }>;
    };
  } catch (caught) {
    console.warn("[coach/llm] fetch failed", caught instanceof Error ? caught.message : caught);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function llmConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

export { transcribeAudio } from "./whisper.js";
