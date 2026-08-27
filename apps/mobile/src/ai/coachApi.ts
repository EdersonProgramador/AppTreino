import { apiPost, NativeApiError } from "../auth/api";

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
        "Pelo perfil padrão (mesomorfo até a próxima avaliação): proteína em toda refeição, carbo em volta do treino, vegetais no prato. Peça de novo “monte uma dieta pelo meu biotipo” quando o servidor terminar de atualizar — ou gere o plano abaixo."
    };
  }
  if (/treino|semana|montar|gerar|muscul|corrida|hiit/.test(text)) {
    return {
      source: "local",
      reply:
        "Semana sugerida: Push, pernas, corrida leve e yoga. Use “Gerar plano” abaixo para gravar a rotina na sua conta agora."
    };
  }
  return {
    source: "local",
    reply:
      "Posso montar treino da semana ou dieta pelo biotipo. Escreva o que você quer — se o chat da API ainda não estiver no ar, o botão Gerar plano abaixo já funciona."
  };
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
