export type SubscriptionPlanGoalDefinition = {
  code: string;
  label: string;
  settingKey: string;
  defaultGoal: number;
};

/** Metas B2C por plano de assinatura (configuráveis via system_settings). */
export const SUBSCRIPTION_PLAN_GOAL_DEFINITIONS: SubscriptionPlanGoalDefinition[] = [
  { code: "start", label: "Start", settingKey: "subscription_goal_start", defaultGoal: 500 },
  { code: "Pro", label: "Pro", settingKey: "subscription_goal_pro", defaultGoal: 300 },
  { code: "AtllyCoachIA", label: "Atlly Coach IA", settingKey: "subscription_goal_atlly_coach", defaultGoal: 200 }
];

export type SubscriptionPlanGoalProgress = {
  planCode: string;
  planName: string;
  goal: number;
  active: number;
  percent: number;
  reached: boolean;
};

export function resolveSubscriptionPlanGoal(
  settingKey: string,
  defaultGoal: number,
  settings: Record<string, string | undefined>
): number {
  const raw = settings[settingKey]?.trim();
  if (!raw) return defaultGoal;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultGoal;
}

export function buildSubscriptionPlanGoalProgress(
  definition: SubscriptionPlanGoalDefinition,
  active: number,
  settings: Record<string, string | undefined>,
  planName?: string | null
): SubscriptionPlanGoalProgress {
  const goal = resolveSubscriptionPlanGoal(definition.settingKey, definition.defaultGoal, settings);
  const safeActive = Math.max(0, active);
  const percent = goal > 0 ? Math.min(100, Math.round((safeActive / goal) * 1000) / 10) : 0;
  return {
    planCode: definition.code,
    planName: planName?.trim() || definition.label,
    goal,
    active: safeActive,
    percent,
    reached: safeActive >= goal
  };
}
