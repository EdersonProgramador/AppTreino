import { haversineMeters, type GpsPoint, type OutdoorSportKind } from "./activity-geo.js";

export const MAP_MATCHING_MAX_COORDS = 100;
const MATCH_OVERLAP = 14;
const MATCH_TIMEOUT_MS = 10_000;
const MIN_CONFIDENCE = 0.22;
const MAX_CHUNKS = 16;
const RADIUS_MIN_M = 8;
const RADIUS_MAX_M = 50;

export type MapMatchResult = {
  points: GpsPoint[];
  matched: boolean;
  confidence: number;
};

export function matchingProfile(sport: OutdoorSportKind): "mapbox/walking" | "mapbox/cycling" {
  return sport === "RIDE" ? "mapbox/cycling" : "mapbox/walking";
}

export function trackDistanceMeters(points: Array<Pick<GpsPoint, "lat" | "lng">>) {
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversineMeters(points[i - 1], points[i]);
  }
  return distance;
}

export function chooseMatchStepMeters(points: GpsPoint[], maxCoords = MAP_MATCHING_MAX_COORDS * MAX_CHUNKS) {
  if (points.length < 2) return 12;
  const distance = trackDistanceMeters(points);
  return Math.max(8, distance / Math.max(2, maxCoords));
}

/** Reduz o traço a ~1 ponto a cada `minStepM`, mantendo início e fim. */
export function resampleForMatching(points: GpsPoint[], minStepM = 12): GpsPoint[] {
  if (points.length <= 2) return points.slice();
  const out: GpsPoint[] = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    acc += haversineMeters(out[out.length - 1], points[i]);
    if (acc >= minStepM) {
      out.push(points[i]);
      acc = 0;
    }
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function chunkWithOverlap<T>(items: T[], size = MAP_MATCHING_MAX_COORDS, overlap = MATCH_OVERLAP): T[][] {
  if (!items.length) return [];
  if (items.length <= size) return [items];
  const step = Math.max(1, size - overlap);
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += step) {
    chunks.push(items.slice(start, start + size));
    if (start + size >= items.length) break;
  }
  return chunks;
}

export function stitchMatchedChunks(chunks: GpsPoint[][]): GpsPoint[] {
  const out: GpsPoint[] = [];
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    if (!out.length) {
      out.push(...chunk);
      continue;
    }
    const last = out[out.length - 1];
    let i = 0;
    while (i < chunk.length && (chunk[i].t <= last.t || haversineMeters(last, chunk[i]) < 5)) {
      i += 1;
    }
    if (i < chunk.length) out.push(...chunk.slice(i));
  }
  return out;
}

export function interpolateMatchedGeometry(
  coords: Array<[number, number]>,
  source: GpsPoint[]
): GpsPoint[] {
  if (!coords.length || !source.length) return [];
  const t0 = source[0].t;
  const t1 = source[source.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const dists = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineMeters(
      { lat: coords[i - 1][1], lng: coords[i - 1][0] },
      { lat: coords[i][1], lng: coords[i][0] }
    );
    dists.push(total);
  }
  const ele0 = source[0].ele ?? null;
  const ele1 = source[source.length - 1].ele ?? null;
  return coords.map((pair, i) => {
    const f = total > 0 ? dists[i] / total : i / Math.max(1, coords.length - 1);
    const ele = ele0 != null && ele1 != null ? ele0 + (ele1 - ele0) * f : (ele0 ?? ele1);
    return {
      lat: pair[1],
      lng: pair[0],
      t: Math.round(t0 + f * span),
      ele: ele ?? null,
      accuracy: 8
    };
  });
}

function uniqueUnixSeconds(points: GpsPoint[]): number[] {
  const out: number[] = [];
  for (const point of points) {
    let sec = Math.max(0, Math.round(point.t / 1000));
    if (out.length && sec <= out[out.length - 1]) sec = out[out.length - 1] + 1;
    out.push(sec);
  }
  return out;
}

function radiusFor(point: GpsPoint): number {
  const acc = point.accuracy;
  if (typeof acc === "number" && acc > 0) return Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, acc));
  return 25;
}

type MapboxMatchResponse = {
  code?: string;
  message?: string;
  matchings?: Array<{
    confidence?: number;
    geometry?: { type?: string; coordinates?: Array<[number, number]> };
  }>;
};

async function matchChunk(
  profile: string,
  points: GpsPoint[],
  token: string,
  fetchImpl: typeof fetch
): Promise<{ points: GpsPoint[]; confidence: number } | null> {
  if (points.length < 2) return { points, confidence: 1 };
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const radiuses = points.map((p) => String(Math.round(radiusFor(p)))).join(";");
  const timestamps = uniqueUnixSeconds(points).join(";");
  const url = `https://api.mapbox.com/matching/v5/${profile}?access_token=${encodeURIComponent(token)}&geometries=geojson&overview=full&tidy=true`;
  const body = new URLSearchParams({ coordinates: coords, radiuses, timestamps });

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(MATCH_TIMEOUT_MS)
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let json: MapboxMatchResponse;
  try {
    json = (await response.json()) as MapboxMatchResponse;
  } catch {
    return null;
  }
  if (json.code !== "Ok") return null;
  const matching = json.matchings?.[0];
  const geometry = matching?.geometry?.coordinates;
  if (!geometry?.length) return null;
  const confidence = Number(matching?.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return null;
  return { points: interpolateMatchedGeometry(geometry, points), confidence };
}

export async function matchActivityToRoads(
  sport: OutdoorSportKind,
  points: GpsPoint[],
  options?: { token?: string; fetchImpl?: typeof fetch; maxChunks?: number }
): Promise<MapMatchResult> {
  const token = (options?.token ?? "").trim();
  if (!token || points.length < 2) {
    return { points, matched: false, confidence: 0 };
  }

  const sampled = resampleForMatching(points, chooseMatchStepMeters(points));
  const chunks = chunkWithOverlap(sampled).slice(0, options?.maxChunks ?? MAX_CHUNKS);
  if (!chunks.length) return { points, matched: false, confidence: 0 };

  const profile = matchingProfile(sport);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const matchedChunks: GpsPoint[][] = [];
  let matchedCount = 0;
  let confidenceSum = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const result = await matchChunk(profile, chunks[i], token, fetchImpl);
    if (result) {
      matchedChunks.push(result.points);
      matchedCount += 1;
      confidenceSum += result.confidence;
    } else {
      matchedChunks.push(chunks[i]);
    }
  }

  const ratio = matchedCount / chunks.length;
  if (ratio < 0.5) return { points, matched: false, confidence: confidenceSum / Math.max(1, chunks.length) };

  const stitched = stitchMatchedChunks(matchedChunks);
  if (stitched.length < 2) return { points, matched: false, confidence: 0 };

  return {
    points: stitched,
    matched: true,
    confidence: confidenceSum / matchedCount
  };
}
