import { evaluateAntiCheat, type AntiCheatReport } from "../filter/AntiCheat";
import { latLngToCell, uniqueCells } from "../h3/cells";
import { applyHomeGeofence, DEFAULT_HOME_RADIUS_M, type HomeFence } from "../privacy/HomeGeofence";
import { rdpCompress, RDP_EPSILON_M } from "../compress/rdp";
import { localStore } from "../db/LocalStore";
import type { Sport } from "../types";

export type FinishTrackPoint = {
  lat: number;
  lng: number;
  t: number;
  ele?: number | null;
  h3r9?: string;
  h3r11?: string;
};

export type FinishTrackPayload = {
  sessionId: string;
  sport: Sport;
  serverId: string | null;
  distanceM: number;
  movingTimeMs: number;
  rawCount: number;
  compressedCount: number;
  maskedCount: number;
  points: FinishTrackPoint[];
  h3r9: string[];
  h3r11: string[];
  antiCheat: AntiCheatReport;
  privacy: { homeRadiusM: number; masked: boolean };
  stepsCount?: number;
  avgCadenceSpm?: number | null;
};

async function loadHomeFence(): Promise<HomeFence | null> {
  const raw = await localStore.getMeta("home_fence");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; radiusM?: number };
    if (parsed.lat == null || parsed.lng == null) return null;
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      radiusM: parsed.radiusM ?? DEFAULT_HOME_RADIUS_M
    };
  } catch {
    return null;
  }
}

export async function setHomeFence(lat: number, lng: number, radiusM = DEFAULT_HOME_RADIUS_M) {
  await localStore.setMeta("home_fence", JSON.stringify({ lat, lng, radiusM }));
}

export async function clearHomeFence() {
  await localStore.setMeta("home_fence", "");
}

export async function getHomeFence(): Promise<HomeFence | null> {
  return loadHomeFence();
}

/** Finish: privacy → anti-cheat → RDP → H3. Distância/tempo vêm da sessão. */
export async function buildFinishTrack(sessionId: string): Promise<FinishTrackPayload | null> {
  const session = await localStore.getSession(sessionId);
  if (!session) return null;

  const accepted = await localStore.listAcceptedPoints(sessionId);
  const rawPoints = accepted.map((p) => ({
    lat: p.filteredLat ?? p.lat,
    lng: p.filteredLng ?? p.lng,
    t: p.t,
    ele: p.ele
  }));

  const home = await loadHomeFence();
  const { points: privatized, maskedCount } = applyHomeGeofence(rawPoints, home, "drop");
  const antiCheat = evaluateAntiCheat(session.sport, privatized);
  const compressed = rdpCompress(privatized, RDP_EPSILON_M[session.sport]);

  const points: FinishTrackPoint[] = compressed.map((p) => ({
    ...p,
    h3r9: latLngToCell(p.lat, p.lng, 9),
    h3r11: latLngToCell(p.lat, p.lng, 11)
  }));

  return {
    sessionId: session.id,
    sport: session.sport,
    serverId: session.serverId,
    distanceM: session.distanceM,
    movingTimeMs: session.movingTimeMs,
    rawCount: rawPoints.length,
    compressedCount: points.length,
    maskedCount,
    points,
    h3r9: uniqueCells(points, 9),
    h3r11: uniqueCells(points, 11),
    antiCheat,
    privacy: {
      homeRadiusM: home?.radiusM ?? DEFAULT_HOME_RADIUS_M,
      masked: maskedCount > 0
    }
  };
}
