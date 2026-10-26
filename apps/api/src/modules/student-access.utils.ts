import {
  COACH_MANAGED_PLAN_FEATURES,
  type PlanFeatureKey,
  type StudentAccessProfile,
  isStudentAccessProfile
} from "@app-treino/shared";
import type { User } from "@prisma/client";

export function normalizeStudentAccessProfile(value: string | null | undefined): StudentAccessProfile {
  return isStudentAccessProfile(value) ? value : "PLATFORM_FULL";
}

export function readStudentAccessProfile(user: Pick<User, "studentAccessProfile">): StudentAccessProfile {
  return normalizeStudentAccessProfile(user.studentAccessProfile);
}

export function coachManagedFeatureKeys(): PlanFeatureKey[] {
  return [...COACH_MANAGED_PLAN_FEATURES];
}

export function isCoachManagedAthlete(user: Pick<User, "studentAccessProfile">) {
  return readStudentAccessProfile(user) === "COACH_MANAGED";
}

/** Aluno coach pode assinar ATLLY para corrida e catálogo; cadastro inicial não passa pelo checkout. */
export const COACH_MANAGED_CHECKOUT_HINT =
  "Assine o plano ATLLY para liberar corrida e treinos do catálogo. Treinos do seu coach continuam pelo vínculo.";
