import type { Plan } from "@prisma/client";

export const APPLE_IAP_BUNDLE_PREFIX = "com.edersonprogramador.apptreino";
export const APPLE_IAP_ENTITLEMENT_ID = "atlly_access";

export function resolveAppleProductId(plan: Pick<Plan, "code" | "appleProductId">): string {
  const configured = plan.appleProductId?.trim();
  if (configured) return configured;
  return `${APPLE_IAP_BUNDLE_PREFIX}.${plan.code}`;
}

export function resolvePlanCodeFromAppleProductId(
  productId: string,
  plans: Array<Pick<Plan, "code" | "appleProductId">>
): string | null {
  const normalized = productId.trim();
  const direct = plans.find(
    (plan) => plan.appleProductId?.trim() === normalized || resolveAppleProductId(plan) === normalized
  );
  return direct?.code ?? null;
}
