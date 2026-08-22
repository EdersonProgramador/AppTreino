export const MOODS = [
  { id: "calor", label: "Calor", emoji: "☀️" },
  { id: "noite", label: "Noite", emoji: "🌙" },
  { id: "vibe", label: "Vibe", emoji: "✨" },
  { id: "foco", label: "Foco", emoji: "🎯" },
  { id: "festa", label: "Festa", emoji: "🎉" },
  { id: "chuva", label: "Chuva", emoji: "🌧️" },
  { id: "cafe", label: "Café", emoji: "☕" }
] as const;

export type MoodId = typeof MOODS[number]["id"];

export function moodLabel(id?: string | null) {
  return MOODS.find(item => item.id === id) || null;
}
