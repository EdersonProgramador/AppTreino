import type { UserRole } from "@app-treino/shared";
import { homePathForRole as resolveHomePath, paths as sessionPaths } from "./session";
import type { StudentMembershipRow } from "../types/student";

export const paths = sessionPaths;

export function homePathForRole(role: UserRole) {
  return resolveHomePath(role);
}

export function loginPath(planCode?: string | null) {
  if (planCode && planCode.trim()) {
    return `${paths.activate}?plan=${encodeURIComponent(planCode.trim())}&step=account`;
  }
  return paths.login;
}

export function activatePath(planCode?: string | null, couponCode?: string | null) {
  const params = new URLSearchParams();
  if (planCode && planCode.trim()) {
    params.set("plan", planCode.trim());
  }
  if (couponCode && couponCode.trim()) {
    params.set("coupon", couponCode.trim());
  }
  const query = params.toString();
  return query ? `${paths.activate}?${query}` : paths.activate;
}

export function studentCheckoutPath(planCode?: string | null, couponCode?: string | null) {
  const params = new URLSearchParams({ section: "subscription" });
  if (planCode && planCode.trim()) {
    params.set("plan", planCode.trim());
  }
  if (couponCode && couponCode.trim()) {
    params.set("coupon", couponCode.trim());
  }
  return `${paths.student}?${params.toString()}`;
}

/** Checkout pendente — mantém o usuário no funil /ativar até o Asaas confirmar. */
export function unpaidStudentActivatePath(
  membership?: StudentMembershipRow | null,
  planCode?: string | null,
  couponCode?: string | null
) {
  const params = new URLSearchParams({ step: "payment" });
  const plan = membership?.plan?.code ?? planCode?.trim();
  if (plan) params.set("plan", plan);
  if (couponCode?.trim()) params.set("coupon", couponCode.trim());
  return `${paths.activate}?${params.toString()}`;
}
