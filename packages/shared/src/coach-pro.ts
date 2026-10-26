/** Plano anual do coach profissional. */
export const COACH_PRO_ANNUAL_PLAN_CODE = "COACH_PRO_ANNUAL";
export const COACH_PRO_ANNUAL_PRICE_CENTS = 130_000;

export const STUDENT_ACCESS_PROFILES = ["PLATFORM_FULL", "COACH_MANAGED"] as const;
export type StudentAccessProfile = (typeof STUDENT_ACCESS_PROFILES)[number];

export function isStudentAccessProfile(value: string | null | undefined): value is StudentAccessProfile {
  return STUDENT_ACCESS_PROFILES.includes(value as StudentAccessProfile);
}

/** Módulos do portal desligados para aluno vinculado ao coach. */
export const COACH_MANAGED_MODULE_OVERRIDES: Record<string, string> = {
  module_products: "false",
  module_purchases: "false",
  module_cards: "false",
  module_ai: "false",
  module_social_publicar: "false",
  module_social_momentos: "false",
  module_social_clipes: "false",
  module_social_live: "false",
  module_social_nota: "false",
  module_favorites: "false",
  module_ratings: "false",
  module_contact: "false"
};

/** Features individuais permitidas: treino ATLLY + corrida/caminhada/bike + histórico. */
export const COACH_MANAGED_PLAN_FEATURES = [
  "running_engine",
  "walking_engine",
  "cycling_engine",
  "fixed_training_programs",
  "progress_tracking",
  "activity_history"
] as const;

export function mergePortalConfigForStudentAccess(
  base: Record<string, string>,
  profile: StudentAccessProfile
): Record<string, string> {
  if (profile !== "COACH_MANAGED") return base;
  return { ...base, ...COACH_MANAGED_MODULE_OVERRIDES };
}

export function coachProAnnualPlanCard() {
  return {
    code: COACH_PRO_ANNUAL_PLAN_CODE,
    name: "Coach ATLLY Profissional",
    priceInCents: COACH_PRO_ANNUAL_PRICE_CENTS,
    billingCycle: "YEARLY" as const,
    description: "Painel coach, cadastro de alunos, estúdio de treinos e operação anual.",
    badgeLabel: "Coach Pro"
  };
}
