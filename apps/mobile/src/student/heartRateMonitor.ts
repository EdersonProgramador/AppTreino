import type { OutdoorSport } from "../types";

/** Estimativa a partir da cadência do pedômetro (relógio/celular) quando sensor dedicado não está disponível. */
export function estimateHeartRateFromCadence(
  sport: OutdoorSport,
  cadenceSpm: number | null | undefined,
  speedKmh: number
): number | null {
  if (cadenceSpm && cadenceSpm >= 40) {
    const base = sport === "RIDE" ? 55 : sport === "WALK" ? 65 : 70;
    return Math.round(Math.min(210, Math.max(70, base + cadenceSpm * 0.72)));
  }
  if (speedKmh <= 0.5) return null;
  const paceMinPerKm = speedKmh > 0 ? 60 / speedKmh : 0;
  if (sport === "RIDE") return Math.round(Math.min(190, 95 + speedKmh * 2.2));
  if (sport === "WALK") return Math.round(Math.min(160, 85 + paceMinPerKm * 1.4));
  return Math.round(Math.min(200, 110 + paceMinPerKm * 2.8));
}

export class HeartRateSession {
  private samples: number[] = [];
  private estimated = false;

  reset() {
    this.samples = [];
    this.estimated = false;
  }

  push(bpm: number, estimated = false) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 220) return;
    this.samples.push(Math.round(bpm));
    if (estimated) this.estimated = true;
    if (this.samples.length > 360) this.samples.splice(0, this.samples.length - 240);
  }

  get current() {
    return this.samples[this.samples.length - 1] ?? 0;
  }

  get isEstimated() {
    return this.estimated;
  }

  get average() {
    if (!this.samples.length) return 0;
    return Math.round(this.samples.reduce((sum, n) => sum + n, 0) / this.samples.length);
  }

  get max() {
    return this.samples.length ? Math.max(...this.samples) : 0;
  }
}

export const heartRateSession = new HeartRateSession();
