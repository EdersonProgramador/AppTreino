import type { RawFix, Sport } from "../types";

export type LocationPermission = {
  foreground: boolean;
  background: boolean;
};

export interface LocationBridge {
  requestPermissions(): Promise<LocationPermission>;
  start(sessionId: string, sport: Sport): Promise<void>;
  stop(): Promise<void>;
  getCurrentFix(): Promise<RawFix | null>;
  subscribe(handler: (fix: RawFix) => void): () => void;
}

export const SPORT_LOCATION_OPTIONS: Record<
  Sport,
  { timeIntervalMs: number; distanceIntervalM: number; accuracy: "high" | "best" | "balanced" }
> = {
  WALK: { timeIntervalMs: 2000, distanceIntervalM: 5, accuracy: "high" },
  RUN: { timeIntervalMs: 1000, distanceIntervalM: 4, accuracy: "best" },
  RIDE: { timeIntervalMs: 1000, distanceIntervalM: 10, accuracy: "best" }
};
