import type { Sport } from "./types";

/**
 * Calibração de campo (fatia A).
 * Ajuste fino após testes reais; valores documentados no README.
 */
export const FIELD_CALIBRATION = {
  /** accuracy GPS máxima aceita (m) */
  maxAccuracyM: 15,
  /** velocidade máxima implicada por esporte (m/s) — NoiseGates usa ×1.15 */
  maxSpeedMps: {
    WALK: 3.5,
    RUN: 9.0,
    RIDE: 25.0
  } as Record<Sport, number>,
  /** jitter mínimo (m) / janela (s) para rejeitar duplicatas */
  duplicateJitterM: 0.4,
  duplicateJitterSec: 0.35,
  /** micro-passo Haversine ignorado (m) */
  minDistanceStepM: 0.6,
  /** Pace EMA tau (s) */
  paceEmaTauSec: 7,
  /** Auto-pause: limiar km/h e hold */
  autoPauseKmh: 1.5,
  autoPauseHoldMs: 3000,
  /** elevação: limiar de ruído vertical (m) */
  elevNoiseM: 0.4
} as const;
