/**
 * Pedômetro / cadência — alimenta AutoPause e métricas de steps.
 * Usa expo-sensors Pedometer quando disponível; no-op gracioso no Expo Go / web.
 */
type StepsListener = (stepsDetected: boolean, cadenceSpm: number | null, totalSteps: number) => void;

class PedometerBridge {
  private unsub: (() => void) | null = null;
  private listeners = new Set<StepsListener>();
  private baseSteps = 0;
  private lastSteps = 0;
  private lastT = 0;
  private cadenceSpm: number | null = null;
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available != null) return this.available;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pedometer } = require("expo-sensors");
      this.available = Boolean(await Pedometer.isAvailableAsync());
    } catch {
      this.available = false;
    }
    return this.available;
  }

  subscribe(listener: StepsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    await this.stop();
    if (!(await this.isAvailable())) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pedometer } = require("expo-sensors");
      this.baseSteps = 0;
      this.lastSteps = 0;
      this.lastT = Date.now();
      this.unsub = Pedometer.watchStepCount((result: { steps: number }) => {
        const now = Date.now();
        const steps = Math.max(0, result.steps);
        if (this.baseSteps === 0 && steps > 0) this.baseSteps = steps;
        const total = Math.max(0, steps - this.baseSteps);
        const dtMin = Math.max(0.05, (now - this.lastT) / 60000);
        const delta = Math.max(0, total - this.lastSteps);
        if (delta > 0) {
          this.cadenceSpm = delta / dtMin;
        } else if (now - this.lastT > 4000) {
          this.cadenceSpm = 0;
        }
        this.lastSteps = total;
        this.lastT = now;
        const moving = delta > 0 || (this.cadenceSpm != null && this.cadenceSpm > 20);
        for (const listener of this.listeners) listener(moving, this.cadenceSpm, total);
      });
    } catch {
      // sem pedômetro
    }
  }

  async stop(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    this.cadenceSpm = null;
  }

  getCadenceSpm() {
    return this.cadenceSpm;
  }

  getTotalSteps() {
    return this.lastSteps;
  }
}

export const pedometerBridge = new PedometerBridge();
