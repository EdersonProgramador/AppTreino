import {
  COACH_MANAGED_PLAN_FEATURES,
  type PlanFeatureKey,
  type StudentAccessProfile,
  isStudentAccessProfile
} from "@app-treino/shared";
import type { User } from "@prisma/client";
import { prisma } from "../prisma.js";

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

export const COACH_MANAGED_CHECKOUT_MESSAGE =
  "Sua conta é gerenciada pelo seu coach. A assinatura ATLLY individual não se aplica — use o app com o acesso que seu coach liberou.";

export async function assertNotCoachManagedSelfCheckout(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentAccessProfile: true }
  });
  if (user && isCoachManagedAthlete(user)) {
    const error = new Error(COACH_MANAGED_CHECKOUT_MESSAGE) as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 403;
    error.code = "COACH_MANAGED_NO_SELF_CHECKOUT";
    throw error;
  }
}
