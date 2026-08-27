import { env } from "../../env.js";
import { buildDiet, buildWorkoutPlan, localCoachChat } from "./engine.js";
import type { CoachChatResult, CoachContext, CoachMessage, DietPlan } from "./types.js";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_treino_personalizado",
      description: "Gera a semana de treino com todas as modalidades AppTreino, clima e ofensiva.",
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
  }
] as const;

function firstNameOf(ctx: CoachContext) {
  return ctx.name.split(" ")[0] || "você";
}

function systemPrompt(ctx: CoachContext) {
  const first = firstNameOf(ctx);
  return [
    `Você é o Coach do AppTreino — um treinador de verdade no WhatsApp. A pessoa se chama ${first}.`,
    "Fale português do Brasil, caloroso e humano. Frases curtas. Como um coach que conhece o aluno, não como um relatório.",
    "NUNCA recapitulue a ficha (objetivo, nível, biotipo, ofensiva) só para mostrar que leu. Use esses dados em silêncio.",
    "Se a pessoa só cumprimentar (oi, e aí, tudo bem), responda o cumprimento, chame pelo nome no máximo uma vez e pergunte UMA coisa: treino de hoje, semana ou comida. Sem menu de serviços.",
    "Combine o tamanho da resposta com a mensagem: 'oi' ganha 2–4 linhas. Pedido de treino/dieta pode ter lista.",
    "Quando montar treino ou dieta, comece pelo que fazer HOJE, depois o restante. Termine com uma pergunta natural.",
    "Nunca invente números de dieta: use montar_dieta_biotipo. Nunca invente a grade da semana: use gerar_treino_personalizado.",
    "Não é médico. Dor aguda, tontura ou transtorno alimentar → oriente procurar profissional, com calma.",
    "Dados internos (não vomitar de volta):",
    `objetivo ${ctx.objective}; nível ${ctx.level}; ${ctx.daysPerWeek}x/semana; biotipo ${ctx.biotype} (${ctx.biotypeReason});`,
    `peso ${ctx.weightKg ?? "—"} kg; altura ${ctx.heightCm ?? "—"} cm; %gordura ${ctx.bodyFatPct ?? "—"}; ofensiva ${ctx.streakDays}d;`,
    `volume recente: treino ${ctx.sportTotals.WORKOUT}, corrida ${ctx.sportTotals.RUN}, caminhada ${ctx.sportTotals.WALK}, pedal ${ctx.sportTotals.RIDE};`,
    ctx.weather ? `clima: ${ctx.weather.tempC}° · ${ctx.weather.label ?? ""}` : "clima não informado",
    `cidade ${ctx.city ?? "—"}; equipamento ${ctx.equipmentTags.join(", ") || "não informado"}.`
  ].join("\n");
}

export function conversationForModel(history: CoachMessage[]): CoachMessage[] {
  if (history[0]?.role === "assistant") return history.slice(1);
  return history;
}

type OpenAiMessage = { role: "system" | "user" | "assistant" | "tool"; content?: string | null; tool_call_id?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };

async function openaiChat(messages: OpenAiMessage[], tools = true) {
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
        ...(tools ? { tools: TOOLS, tool_choice: "auto" } : {})
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

export async function llmCoachChat(ctx: CoachContext, history: CoachMessage[]): Promise<CoachChatResult | null> {
  if (!env.OPENAI_API_KEY) return null;
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...conversationForModel(history)
      .slice(-16)
      .map((item) => ({
        role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: item.content
      }))
  ];
  const first = await openaiChat(messages, true);
  const message = first?.choices?.[0]?.message;
  if (!message) return null;

  let plan = undefined as CoachChatResult["plan"];
  let diet = undefined as DietPlan | undefined;

  if (message.tool_calls?.length) {
    const toolMessages: OpenAiMessage[] = [];
    for (const call of message.tool_calls) {
      let args: { daysPerWeek?: number; focus?: string; goal?: "cut" | "bulk" | "recomp" } = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as typeof args;
      } catch {
        args = {};
      }
      if (call.function.name === "gerar_treino_personalizado") {
        const next = buildWorkoutPlan({
          ...ctx,
          daysPerWeek: args.daysPerWeek ?? ctx.daysPerWeek,
          focus: args.focus ?? ctx.focus,
          objective: args.focus || ctx.objective
        });
        plan = next;
        diet = next.diet;
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            summary: next.summary,
            days: next.days.map((day) => ({ title: day.title, modality: day.modality, exercises: day.exercises.map((item) => item.name) })),
            recommendations: next.recommendations,
            dietKcal: next.diet?.kcal
          })
        });
      } else if (call.function.name === "montar_dieta_biotipo") {
        diet = buildDiet({ ...ctx, objective: args.goal ?? ctx.objective });
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(diet)
        });
      } else {
        toolMessages.push({ role: "tool", tool_call_id: call.id, content: "{}" });
      }
    }
    const second = await openaiChat(
      [
        ...messages,
        message,
        ...toolMessages,
        {
          role: "system",
          content:
            "Agora fale com a pessoa. Sem recap de ficha. Comece pelo que vale HOJE, depois o plano em lista curta, uma pergunta no fim."
        }
      ],
      false
    );
    const reply = second?.choices?.[0]?.message?.content?.trim();
    if (reply) return { reply, source: "llm", plan, diet };
  }

  const text = message.content?.trim();
  if (text) return { reply: text, source: "llm", plan, diet };
  return null;
}

export { transcribeAudio } from "./whisper.js";

export async function coachReply(ctx: CoachContext, history: CoachMessage[]): Promise<CoachChatResult> {
  const llm = await llmCoachChat(ctx, history);
  if (llm) return llm;
  return localCoachChat(ctx, history);
}