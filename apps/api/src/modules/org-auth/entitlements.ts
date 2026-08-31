import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from "@app-treino/shared";
import { prisma } from "../../prisma.js";
import { validActiveMembershipWhere } from "../membership.utils.js";

/** Entitlements individuais — independentes de vínculo organizacional. */
export async function listUserPlanFeatures(userId: string): Promise<PlanFeatureKey[]> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      deletedAt: null,
      ...validActiveMembershipWhere()
    },
    include: {
      plan: {
        include: {
          features: true
        }
      }
    },
    orderBy: { startsAt: "desc" }
  });

  if (!membership) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { enrollmentStatus: true }
    });
    return user?.enrollmentStatus === "ACTIVE" ? [...PLAN_FEATURE_KEYS] : [];
  }

  const features = membership.plan.features.map((item) => item.featureKey);
  if (!features.length) {
    return [...PLAN_FEATURE_KEYS];
  }

  return PLAN_FEATURE_KEYS.filter((key) => features.includes(key));
}

export async function userHasPlanFeature(userId: string, featureKey: string): Promise<boolean> {
  const features = await listUserPlanFeatures(userId);
  return features.includes(featureKey as PlanFeatureKey);
}

export async function assertIndividualFeature(userId: string, featureKey: string) {
  const allowed = await userHasPlanFeature(userId, featureKey);
  if (!allowed) {
    const error = new Error("Recurso não incluído no seu plano ou assinatura inativa.") as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 402;
    error.code = "FEATURE_NOT_ENTITLED";
    throw error;
  }
}
