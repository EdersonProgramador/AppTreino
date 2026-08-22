export type Sport = "RUN" | "WALK" | "RIDE";
export type SessionStatus = "LIVE" | "PAUSED" | "FINISHED" | "ORPHAN";

export type RawFix = {
  t: number;
  lat: number;
  lng: number;
  ele: number | null;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
};

export type FilteredFix = RawFix & {
  filteredLat: number;
  filteredLng: number;
  filteredSpeedMps: number;
  paceSecKm: number | null;
  isAccepted: boolean;
  rejectReason: string | null;
  seq: number;
  h3r9?: string | null;
  h3r11?: string | null;
};

export type TrackingSession = {
  id: string;
  serverId: string | null;
  sport: Sport;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  pauseMs: number;
  pausedAt: number | null;
  deviceId: string;
  appVersion: string | null;
  distanceM: number;
  movingTimeMs: number;
  createdAt: number;
  updatedAt: number;
};

export type LiveSnapshot = {
  session: TrackingSession;
  lastFix: FilteredFix | null;
  distanceM: number;
  movingTimeMs: number;
  paceSecKm: number | null;
  speedKmh: number;
  isAutoPaused: boolean;
  stepsCount: number;
  cadenceSpm: number | null;
};

export type PointRow = {
  id: number;
  sessionId: string;
  t: number;
  lat: number;
  lng: number;
  ele: number | null;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  filteredLat: number | null;
  filteredLng: number | null;
  filteredSpeedMps: number | null;
  paceSecKm: number | null;
  isAccepted: number;
  rejectReason: string | null;
  seq: number;
  h3r9: string | null;
  h3r11: string | null;
};
