import type { OutdoorSport } from "@prisma/client";
import type { PlanFeatureKey } from "@app-treino/shared";

const SPORT_FEATURE: Record<OutdoorSport, PlanFeatureKey> = {
  RUN: "running_engine",
  WALK: "walking_engine",
  RIDE: "cycling_engine"
};

export function outdoorFeatureForSport(sport: OutdoorSport): PlanFeatureKey {
  return SPORT_FEATURE[sport];
}
