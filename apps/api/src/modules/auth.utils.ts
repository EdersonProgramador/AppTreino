import { prisma } from "../prisma.js";

type AuthPrisma = typeof prisma;

export type LoginIdentifierKind = "email" | "phone";

/** Strip formatting — store and match phones as digits only. */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function normalizeEmail(value?: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

export function resolveLoginIdentifierKind(email: string | null, phone: string | null): LoginIdentifierKind {
  return email ? "email" : "phone";
}

export function loginAccountNotFoundMessage(kind: LoginIdentifierKind) {
  return kind === "email"
    ? "Não encontramos uma conta com este e-mail."
    : "Não encontramos uma conta com este telefone.";
}

export function loginInvalidPasswordMessage(kind: LoginIdentifierKind) {
  return kind === "email"
    ? "Senha incorreta para este e-mail."
    : "Senha incorreta para este telefone.";
}

/**
 * Finds by normalized digits first, then legacy formatted phone rows
 * (regexp_replace strips non-digits in Postgres).
 */
export async function findUserByPhone(db: AuthPrisma, phoneDigits: string) {
  const exact = await db.user.findUnique({
    where: { phone: phoneDigits },
    omit: { passwordHash: false }
  });

  if (exact) {
    return exact;
  }

  const legacy = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM users
    WHERE phone IS NOT NULL
      AND deleted_at IS NULL
      AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phoneDigits}
    LIMIT 1
  `;

  const legacyId = legacy[0]?.id;
  if (!legacyId) {
    return null;
  }

  return db.user.findUnique({
    where: { id: legacyId },
    omit: { passwordHash: false }
  });
}
