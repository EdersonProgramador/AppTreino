/** Comissão recorrente do coach sobre pagamentos confirmados de alunos indicados. */
export const COACH_COMMISSION_RATE = 0.08;

/** Carência antes de liberar comissão para saque (dias). */
export const COACH_COMMISSION_HOLDING_DAYS = 14;

/** Saque mínimo em centavos (R$ 50,00). */
export const COACH_MIN_WITHDRAWAL_CENTS = 5000;

export const COACH_REFERRAL_RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "ativar",
  "aluno",
  "coach",
  "login",
  "public",
  "www",
  "ativar-conta",
  "termos",
  "privacidade"
]);

/** Normaliza apelido digitado pelo coach (3–40 chars, a-z 0-9 hífen). */
export function prepareCoachReferralSlugInput(raw: string): string | null {
  const slug = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length < 3 || slug.length > 40) return null;
  if (COACH_REFERRAL_RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export function calculateCoachCommission(amountInCents: number): number {
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) return 0;
  return Math.floor(amountInCents * COACH_COMMISSION_RATE);
}

export function formatCoachCommissionRate(): string {
  return `${Math.round(COACH_COMMISSION_RATE * 100)}%`;
}
