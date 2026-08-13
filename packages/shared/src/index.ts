import type { UserRole } from "./rbac";

export type { UserRole, RbacResource, RbacAction, Permission } from "./rbac";
export {
  USER_ROLES,
  ROLE_HOME_PATH,
  ROLE_PERMISSIONS,
  isUserRole,
  normalizeRole,
  permissionsFor,
  can,
  canAny,
  canAll,
  hasRole,
  hasAnyRole,
  canAccessPanel,
  homePathForRole,
  assertCan
} from "./rbac";

export type MembershipStatus = "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";

export type PaymentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "CANCELED";

export type PlanCode = "monthly" | "annual";

export interface Plan {
  code: PlanCode;
  name: string;
  priceInCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  provider?: string;
  /** Admin atuando temporariamente como aluno. */
  previewMode?: boolean;
  adminId?: string;
  canReturnToAdmin?: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutDay {
  id: string;
  title: string;
  exercises: WorkoutExercise[];
}

export interface Workout {
  id: string;
  title: string;
  objective?: string;
  days: WorkoutDay[];
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
}

export const initialPlans: Plan[] = [
  {
    code: "monthly",
    name: "Mensal",
    priceInCents: 9700,
    billingCycle: "MONTHLY"
  },
  {
    code: "annual",
    name: "Anual",
    priceInCents: 104700,
    billingCycle: "YEARLY"
  }
];

export function formatPriceInBRL(priceInCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(priceInCents / 100);
}

/** Aceita "0,10", "10,50", "1.234,56" ou "10.50" e devolve o valor em reais. */
export function parseBRLMoney(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  let normalized = text.replace(/[R$\s]/gi, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Converte valor monetário BR para centavos (ex.: "0,10" → 10). */
export function parseBRLMoneyToCents(raw: string | number | null | undefined): number | null {
  const reais = parseBRLMoney(raw);
  if (reais == null) return null;
  return Math.round(reais * 100);
}
