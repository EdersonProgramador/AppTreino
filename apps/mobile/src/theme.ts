export const colors = {
  bg: "#08090b",
  panel: "#121318",
  card: "#17181e",
  gold: "#f2b461",
  sand: "#fff7ec",
  muted: "#c9c0b5",
  faint: "#8f887f",
  border: "rgba(255,255,255,0.12)",
  danger: "#ffd8d4",
  ok: "#b8f0c8",
  ink: "#08090b"
} as const;

export function money(cents?: number | null) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}
