/** Comissão recorrente do coach sobre pagamentos confirmados de alunos indicados. */
export const COACH_COMMISSION_RATE = 0.08;

/** Carência antes de liberar comissão para saque (dias). */
export const COACH_COMMISSION_HOLDING_DAYS = 14;

/** Saque mínimo em centavos (R$ 50,00). */
export const COACH_MIN_WITHDRAWAL_CENTS = 5000;

/** Tamanho do código exclusivo de indicação (sem dados pessoais). */
export const COACH_REFERRAL_CODE_LENGTH = 8;

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
  "ativarconta",
  "termos",
  "privacidade"
]);

/** Normaliza código de indicação (?ref=) — 8 caracteres alfanuméricos. */
export function normalizeReferralCode(raw?: string | null): string | null {
  const normalized = raw?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized || normalized.length !== COACH_REFERRAL_CODE_LENGTH) return null;
  if (COACH_REFERRAL_RESERVED_SLUGS.has(normalized)) return null;
  return normalized;
}

export function isCoachReferralCode(value: string): boolean {
  return normalizeReferralCode(value) !== null;
}

export function formatReferralCodeForDisplay(code: string): string {
  return code.trim().toUpperCase();
}

export function calculateCoachCommission(amountInCents: number): number {
  if (!Number.isFinite(amountInCents) || amountInCents <= 0) return 0;
  return Math.floor(amountInCents * COACH_COMMISSION_RATE);
}

export function formatCoachCommissionRate(): string {
  return `${Math.round(COACH_COMMISSION_RATE * 100)}%`;
}
