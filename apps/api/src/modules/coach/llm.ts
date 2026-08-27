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

function systemPrompt(ctx: CoachContext) {
  return [
    "Você é o Coach AppTreino, especialista em treino de alta performance, nutrição prática e psicologia do sucesso (PNL).",
    "Fale em português do Brasil, direto, sem enrolação, 1–3 parágrafos + bullets quando fizer sentido.",
    "Nunca invente números de dieta: use a tool montar_dieta_biotipo. Nunca invente a grade de treino: use gerar_treino_personalizado.",
    "Não é substituto de médico. Se houver dor aguda ou transtorno alimentar, oriente procurar profissional.",
    `Atleta: ${ctx.name}. Objetivo: ${ctx.objective}. Nível: ${ctx.level}. Dias/semana: ${ctx.daysPerWeek}.`,
    `Biotipo: ${ctx.biotype} (${ctx.biotypeReason}). Peso ${ctx.weightKg ?? "—"} kg · altura ${ctx.heightCm ?? "—"} cm · %gordura ${ctx.bodyFatPct ?? "—"}.`,
    `Ofensiva: ${ctx.streakDays} dia(s). Volume recente: treino ${ctx.sportTotals.WORKOUT}, corrida ${ctx.sportTotals.RUN}, caminhada ${ctx.sportTotals.WALK}, pedal ${ctx.sportTotals.RIDE}.`,
    ctx.weather ? `Clima no local: ${ctx.weather.tempC}° · ${ctx.weather.label ?? ""} (código ${ctx.weather.code ?? "—"})` : "Clima não informado nesta mensagem.",
    `Cidade: ${ctx.city ?? "—"}. Equipamento: ${ctx.equipmentTags.join(", ") || "não informado"}.`
  ].join("\n");
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
        temperature: 0.6,
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
    ...history.slice(-16).map((item) => ({
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
    const second = await openaiChat([...messages, message, ...toolMessages], false);
    const reply = second?.choices?.[0]?.message?.content?.trim();
    if (reply) return { reply, source: "llm", plan, diet };
  }

  const text = message.content?.trim();
  if (text) return { reply: text, source: "llm", plan, diet };
  return null;
}

export async function transcribeAudio(buffer: Buffer, filename: string, mimeType?: string) {
  if (!env.OPENAI_API_KEY) return null;
  const url = `${env.OPENAI_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/m4a" }), filename || "audio.m4a");
  form.append("model", "whisper-1");
  form.append("language", "pt");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { text?: string };
  return data.text?.trim() || null;
}

export async function coachReply(ctx: CoachContext, history: CoachMessage[]): Promise<CoachChatResult> {
  const llm = await llmCoachChat(ctx, history);
  if (llm) return llm;
  return localCoachChat(ctx, history);
}