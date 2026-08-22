import { haversineMeters, type GpsPoint } from "./activity-geo.js";
import { latLngToCell } from "./activity-h3.js";

export type SegmentPolyline = Array<{ lat: number; lng: number }>;

export type SegmentMatch = {
  segmentId: string;
  elapsedSeconds: number;
  paceSecPerKm: number | null;
};

/**
 * Matching simples: atividade passa perto do start e do end (±50m)
 * e cobre ≥80% da distância do segmento.
 */
export function matchSegments(
  activityPoints: GpsPoint[],
  segments: Array<{
    id: string;
    distanceMeters: number;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    polyline: SegmentPolyline;
  }>,
  radiusM = 50
): SegmentMatch[] {
  if (activityPoints.length < 2 || !segments.length) return [];
  const matches: SegmentMatch[] = [];

  for (const seg of segments) {
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < activityPoints.length; i += 1) {
      const p = activityPoints[i]!;
      if (startIdx < 0 && haversineMeters(p, { lat: seg.startLat, lng: seg.startLng }) <= radiusM) {
        startIdx = i;
      }
      if (startIdx >= 0 && haversineMeters(p, { lat: seg.endLat, lng: seg.endLng }) <= radiusM) {
        endIdx = i;
      }
    }
    if (startIdx < 0 || endIdx <= startIdx) continue;

    let covered = 0;
    for (let i = startIdx + 1; i <= endIdx; i += 1) {
      covered += haversineMeters(activityPoints[i - 1]!, activityPoints[i]!);
    }
    if (covered < seg.distanceMeters * 0.8) continue;

    const elapsedSeconds = Math.max(
      1,
      Math.round((activityPoints[endIdx]!.t - activityPoints[startIdx]!.t) / 1000)
    );
    matches.push({
      segmentId: seg.id,
      elapsedSeconds,
      paceSecPerKm: covered >= 20 ? elapsedSeconds / (covered / 1000) : null
    });
  }

  return matches;
}

export function segmentCellFromPolyline(polyline: SegmentPolyline): string | null {
  if (!polyline.length) return null;
  const mid = polyline[Math.floor(polyline.length / 2)]!;
  return latLngToCell(mid.lat, mid.lng, 9);
}

export function polylineDistance(polyline: SegmentPolyline): number {
  let d = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    d += haversineMeters(polyline[i - 1]!, polyline[i]!);
  }
  return d;
}
