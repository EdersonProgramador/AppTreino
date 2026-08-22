import axios from "axios";

/** API canônica do App Treino (Fastify) — programas CMS, sessões, etc. */
export function treinoApiBase() {
  return String(process.env.NEXT_PUBLIC_TREINO_API_URL || "").replace(/\/$/, "");
}

export function treinoApi(token?: string) {
  const baseURL = treinoApiBase();
  return axios.create({
    baseURL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export type TreinoProgramCard = {
  id: string;
  title: string;
  description?: string;
  modality?: string;
  level?: string;
  weeks?: number;
  source: "app-treino" | "social-fitness";
  workoutsCount?: number;
};
