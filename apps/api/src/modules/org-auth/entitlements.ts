import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from "@app-treino/shared";
import { isPlatformAdminUser } from "../../auth.js";
import { prisma } from "../../prisma.js";
import { validActiveMembershipWhere } from "../membership.utils.js";
import { coachManagedFeatureKeys, isCoachManagedAthlete } from "../student-access.utils.js";

async function listMembershipPlanFeatures(
  userId: string,
  options?: { grantAllWhenPlanHasNoFeatures?: boolean; grantAllWhenNoMembership?: boolean }
): Promise<PlanFeatureKey[]> {
  const grantAllWhenNoMembership = options?.grantAllWhenNoMembership ?? false;
  const grantAllWhenPlanHasNoFeatures = options?.grantAllWhenPlanHasNoFeatures ?? true;

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
    return grantAllWhenNoMembership ? [...PLAN_FEATURE_KEYS] : [];
  }

  const features = membership.plan.features.map((item) => item.featureKey);
  if (!features.length) {
    return grantAllWhenPlanHasNoFeatures ? [...PLAN_FEATURE_KEYS] : [];
  }

  return PLAN_FEATURE_KEYS.filter((key) => features.includes(key));
}

/** Entitlements individuais — independentes de vínculo organizacional. */
export async function listUserPlanFeatures(userId: string): Promise<PlanFeatureKey[]> {
  if (await isPlatformAdminUser(userId)) {
    return [...PLAN_FEATURE_KEYS];
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentAccessProfile: true, enrollmentStatus: true }
  });

  if (user && isCoachManagedAthlete(user)) {
    const fromMembership = await listMembershipPlanFeatures(userId, {
      grantAllWhenNoMembership: false,
      grantAllWhenPlanHasNoFeatures: true
    });
    const keys = new Set<PlanFeatureKey>([...coachManagedFeatureKeys(), ...fromMembership]);
    return PLAN_FEATURE_KEYS.filter((key) => keys.has(key));
  }

  if (!user) {
    return [];
  }

  return listMembershipPlanFeatures(userId, {
    grantAllWhenNoMembership: user.enrollmentStatus === "ACTIVE",
    grantAllWhenPlanHasNoFeatures: true
  });
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
