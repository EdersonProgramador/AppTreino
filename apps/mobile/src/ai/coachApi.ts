import { apiGet, apiPost, apiUploadFile, NativeApiError } from "../auth/api";

export type CoachChatResponse = {
  reply: string;
  source: "llm" | "local";
  biotype?: string;
  streakDays?: number;
  savedPlanId?: string | null;
  diet?: {
    biotype: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    strategy: string;
    meals: Array<{ name: string; items: string[] }>;
    notes: string[];
  } | null;
  plan?: {
    summary: string;
    modalities?: string[];
    days: Array<{
      title: string;
      focus: string;
      modality?: string;
      exercises: Array<{ name: string; sets: number; reps: string; restSeconds?: number }>;
    }>;
    recommendations: string[];
  } | null;
};

export const COACH_CHAT_PATHS = ["/student/coach/chat", "/user/coach/chat"] as const;
export const COACH_STATUS_PATHS = ["/student/coach/status", "/user/coach/status"] as const;
export const COACH_TRANSCRIBE_PATHS = ["/student/coach/transcribe", "/user/coach/transcribe"] as const;

export type CoachStatus = {
  enabled?: boolean;
  llm?: boolean;
  voice?: boolean;
  provider?: string;
  model?: string;
  label?: string;
};

export async function fetchCoachStatus(token: string) {
  let lastError: unknown;
  for (const path of COACH_STATUS_PATHS) {
    try {
      return await apiGet<CoachStatus>(path, token);
    } catch (caught) {
      lastError = caught;
      if (caught instanceof NativeApiError && caught.status === 404) continue;
      throw caught;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Coach IA indisponível.");
}

function lastUserText(body: unknown) {
  const messages = (body as { messages?: Array<{ role?: string; content?: string }> })?.messages ?? [];
  return [...messages].reverse().find((item) => item.role === "user")?.content?.trim() ?? "";
}

function localCoachFallback(body: unknown): CoachChatResponse {
  const text = lastUserText(body);
  const quoted = text.slice(0, 140);
  const lower = text.toLowerCase();
  if (/dieta|biotipo|card[aá]pio|prote[ií]na|kcal/.test(lower)) {
    return {
      source: "local",
      reply: `Você perguntou da comida (“${quoted}”). Enquanto o servidor atualiza: proteína em toda refeição, carbo perto do treino e verdura no prato.`
    };
  }
  if (/\d+\s*min|sem tempo|pouco tempo/.test(lower)) {
    return {
      source: "local",
      reply: `Você tá sem tempo (“${quoted}”). Faz 18 min: aquecer, 8x 40s agachamento ou flexão, core, respirar. Marca o dia.`
    };
  }
  if (/treino|semana|montar|gerar|muscul|corrida|hiit/.test(lower)) {
    return {
      source: "local",
      reply: `Você pediu treino (“${quoted}”). Hoje: agachamento, supino, remada e prancha. Quando a API voltar, eu fecho a semana na conta.`
    };
  }
  if (text) {
    return {
      source: "local",
      reply: `Entendi: “${quoted}”. Quando o chat da API voltar eu fecho em cima disso — me manda de novo.`
    };
  }
  return {
    source: "local",
    reply: "Tô aqui. Me conta o que tá acontecendo hoje no treino ou na rotina."
  };
}

export function coachAudioUploadMeta(uri: string) {
  const clean = uri.split("?")[0] ?? uri;
  const ext = (clean.split(".").pop() || "m4a").toLowerCase();
  const safe = ["m4a", "mp4", "mp3", "wav", "webm", "aac", "caf"].includes(ext) ? ext : "m4a";
  const mime =
    safe === "webm"
      ? "audio/webm"
      : safe === "wav"
        ? "audio/wav"
        : safe === "mp3"
          ? "audio/mpeg"
          : "audio/mp4";
  return { filename: `coach.${safe}`, mime };
}

export async function transcribeCoachAudio(uri: string, token: string) {
  const { filename, mime } = coachAudioUploadMeta(uri);
  let lastUploadError: unknown;
  for (const path of COACH_TRANSCRIBE_PATHS) {
    try {
      return await apiUploadFile<{ text: string }>(path, uri, token, filename, mime);
    } catch (caught) {
      lastUploadError = caught;
      if (caught instanceof NativeApiError && caught.status === 404) continue;
      throw caught;
    }
  }
  throw lastUploadError instanceof Error ? lastUploadError : new Error("Não gravei o áudio.");
}

export async function postCoachChat(body: unknown, token: string) {
  for (const path of COACH_CHAT_PATHS) {
    try {
      return await apiPost<CoachChatResponse>(path, body, token);
    } catch (caught) {
      if (caught instanceof NativeApiError && caught.status === 404) continue;
      throw caught;
    }
  }
  return localCoachFallback(body);
}
