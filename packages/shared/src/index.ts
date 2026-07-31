export type UserRole = "ADMIN" | "USER";

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
