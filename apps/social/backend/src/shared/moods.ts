export const CONTENT_MOODS = ["calor", "noite", "vibe", "foco", "festa", "chuva", "cafe"] as const;

export type ContentMood = typeof CONTENT_MOODS[number];

export function isContentMood(value: unknown): value is ContentMood {
  return typeof value === "string" && CONTENT_MOODS.includes(value as ContentMood);
}
