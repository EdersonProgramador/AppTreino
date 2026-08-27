import { env } from "../../env.js";
import { COACH_TOOLS } from "./agent/toolbox.js";
import { isGenericCoachMenu } from "./engine.js";
import { llmRuntimeLabel, resolveLlmRuntime, type LlmEnvSlice, type LlmRuntime } from "./provider.js";
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
  content?: string | null | Array<{ type?: string; text?: string; content?: string }>;
  reasoning?: string | null;
  thinking?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
};

export function coachMessageText(message?: {
  content?: OpenAiMessage["content"];
  reasoning?: string | null;
  thinking?: string | null;
}) {
  const raw = message?.content;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) => (typeof part === "string" ? part : part.text || part.content || ""))
      .join("")
      .trim();
    if (joined) return joined;
  }
  return "";
}

function envSlice(): LlmEnvSlice {
  return {
    LLM_PROVIDER: env.LLM_PROVIDER,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_EMBEDDING_MODEL: env.OPENAI_EMBEDDING_MODEL,
    OLLAMA_API_KEY: env.OLLAMA_API_KEY,
    OLLAMA_BASE_URL: env.OLLAMA_BASE_URL,
    OLLAMA_HOST: env.OLLAMA_HOST,
    OLLAMA_MODEL: env.OLLAMA_MODEL,
    OLLAMA_EMBEDDING_MODEL: env.OLLAMA_EMBEDDING_MODEL
  };
}

export function llmRuntime(): LlmRuntime | null {
  return resolveLlmRuntime(envSlice());
}

export function llmConfigured() {
  return Boolean(llmRuntime());
}

export function whisperConfigured() {
  return Boolean(env.OPENAI_API_KEY) && !/ollama\.com|:11434/i.test(env.OPENAI_BASE_URL);
}

export function llmStatus() {
  const runtime = llmRuntime();
  return {
    llm: Boolean(runtime),
    voice: whisperConfigured(),
    provider: runtime?.host ?? "local",
    model: runtime?.model ?? null,
    label: llmRuntimeLabel(runtime)
  };
}

async function postChat(runtime: LlmRuntime, messages: OpenAiMessage[], tools: boolean) {
  const url = `${runtime.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.chatTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.45,
        stream: false,
        messages,
        ...(runtime.sendOpenAiPenalties ? { frequency_penalty: 0.25, presence_penalty: 0.1 } : {}),
        ...(tools && runtime.supportsTools ? { tools: COACH_TOOLS, tool_choice: "auto" } : {})
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(`[coach/llm] ${runtime.host}`, response.status, errBody.slice(0, 300));
      return { ok: false as const, status: response.status, body: errBody };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: OpenAiMessage }> };
    return { ok: true as const, data };
  } catch (caught) {
    console.warn(`[coach/llm] ${runtime.host} fetch failed`, caught instanceof Error ? caught.message : caught);
    return { ok: false as const, status: 0, body: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Chat completions via Ollama (Llama cloud/local) or OpenAI. */
export async function openaiCoach(messages: OpenAiMessage[], tools = true) {
  const runtime = llmRuntime();
  if (!runtime) return null;

  const first = await postChat(runtime, messages, tools);
  if (first.ok) return first.data;

  if (tools && runtime.supportsTools && (first.status === 400 || first.status === 422)) {
    const retry = await postChat(runtime, messages, false);
    if (retry.ok) return retry.data;
  }

  if (runtime.name === "ollama" && env.OPENAI_API_KEY && !looksLikeSameHost(runtime.baseUrl, env.OPENAI_BASE_URL)) {
    const fallback = resolveLlmRuntime({ ...envSlice(), LLM_PROVIDER: "openai" });
    if (fallback) {
      console.warn("[coach/llm] Ollama falhou; tentando OpenAI");
      const second = await postChat(fallback, messages, tools);
      if (second.ok) return second.data;
    }
  }

  return null;
}

function looksLikeSameHost(a: string, b: string) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return a === b;
  }
}

export { transcribeAudio } from "./whisper.js";
export { llmRuntimeLabel } from "./provider.js";
