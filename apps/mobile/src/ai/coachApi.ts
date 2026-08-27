import { apiPost, apiUploadFile, NativeApiError } from "../auth/api";

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
export const COACH_TRANSCRIBE_PATHS = ["/student/coach/transcribe", "/user/coach/transcribe"] as const;

function lastUserText(body: unknown) {
  const messages = (body as { messages?: Array<{ role?: string; content?: string }> })?.messages ?? [];
  return [...messages].reverse().find((item) => item.role === "user")?.content?.trim() ?? "";
}

function localCoachFallback(body: unknown): CoachChatResponse {
  const text = lastUserText(body).toLowerCase();
  if (/dieta|biotipo|card[aá]pio|prote[ií]na|kcal/.test(text)) {
    return {
      source: "local",
      reply:
        "Beleza. Enquanto o servidor atualiza, o caminho seguro é proteína em toda refeição, carbo perto do treino e verdura no prato. Quando a API voltar, pede de novo “como eu como nessa semana?” que eu fecho os números."
    };
  }
  if (/treino|semana|montar|gerar|muscul|corrida|hiit/.test(text)) {
    return {
      source: "local",
      reply:
        "Hoje eu iria de um full body curto: agachamento, supino, remada e prancha. Se quiser gravar a semana na conta, usa Gerar plano abaixo — ou manda de novo quando o chat da API estiver no ar."
    };
  }
  return {
    source: "local",
    reply: "Tô aqui. Me fala se você quer treinar agora, organizar a semana ou olhar a comida."
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
