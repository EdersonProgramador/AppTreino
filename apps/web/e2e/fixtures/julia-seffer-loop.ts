/** Ida e volta na mesma latitude (rua leste–oeste) até o Cj. Júlia Seffer, Ananindeua-PA. */

export const HOME = { lat: -1.38102, lng: -48.3905 };
export const JULIA_SEFFER = { lat: -1.38102, lng: -48.38938 };

const EARTH_M = 6_371_000;
const STEPS_EACH_WAY = 16;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function leg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  steps: number
) {
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({ lat: lerp(from.lat, to.lat, t), lng: lerp(from.lng, to.lng, t) });
  }
  return points;
}

const outbound = leg(HOME, JULIA_SEFFER, STEPS_EACH_WAY);
const inbound = leg(JULIA_SEFFER, HOME, STEPS_EACH_WAY).slice(1);

/** Casa → Júlia Seffer → casa. ~240 m de ida e volta, pontos a ~7.5 m. */
export const JULIA_SEFFER_LOOP = [...outbound, ...inbound];

export const LOOP_DISTANCE_M = JULIA_SEFFER_LOOP.reduce((sum, point, index) => {
  if (index === 0) return 0;
  return sum + haversineMeters(JULIA_SEFFER_LOOP[index - 1], point);
}, 0);

/** Intervalo mínimo para o filtro RUN (teto 9 m/s × 1.15). */
export const GEO_TICK_MS = 850;
