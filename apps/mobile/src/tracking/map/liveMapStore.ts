import type { RawFix } from "../types";

export type MapTrackPoint = {
  lat: number;
  lng: number;
  t: number;
  source: "task" | "filtered";
};

type Listener = (points: MapTrackPoint[], cursor: MapTrackPoint | null) => void;

/**
 * Estado do mapa alimentado DIRETO pelo TRACKING_LOCATION_TASK
 * (e opcionalmente pelo pipeline filtrado do SessionManager).
 */
class LiveMapStore {
  private points: MapTrackPoint[] = [];
  private cursor: MapTrackPoint | null = null;
  private listeners = new Set<Listener>();
  private maxPoints = 20_000;
  private minStepM = 1.5;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.points, this.cursor);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPoints() {
    return this.points;
  }

  getCursor() {
    return this.cursor;
  }

  clear() {
    this.points = [];
    this.cursor = null;
    this.emit();
  }

  /** GPS bruto do TaskManager (background). */
  pushFromTask(fix: RawFix) {
    this.cursor = { lat: fix.lat, lng: fix.lng, t: fix.t, source: "task" };
    this.appendIfMoved(this.cursor);
    this.emit();
  }

  /** Ponto Kalman aceito (trajeto limpo). */
  pushFiltered(lat: number, lng: number, t: number) {
    const point: MapTrackPoint = { lat, lng, t, source: "filtered" };
    this.cursor = point;
    this.appendIfMoved(point);
    this.emit();
  }

  hydrate(points: Array<{ lat: number; lng: number; t: number }>) {
    this.points = points.map((p) => ({ ...p, source: "filtered" as const }));
    this.cursor = this.points[this.points.length - 1] ?? null;
    this.emit();
  }

  /** Centraliza o mapa na posição atual sem apagar o trajeto. */
  centerOn(lat: number, lng: number, t = Date.now()) {
    this.cursor = { lat, lng, t, source: "filtered" };
    if (!this.points.length) this.points = [this.cursor];
    this.emit();
  }

  private appendIfMoved(point: MapTrackPoint) {
    const last = this.points[this.points.length - 1];
    if (!last) {
      this.points.push(point);
      return;
    }
    const dlat = (point.lat - last.lat) * 111_320;
    const meanLat = ((point.lat + last.lat) / 2) * (Math.PI / 180);
    const dlng = (point.lng - last.lng) * 111_320 * Math.cos(meanLat);
    const dist = Math.hypot(dlat, dlng);
    if (dist < this.minStepM && point.source === "task") return;
    if (dist < 0.4) return;
    this.points.push(point);
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(-this.maxPoints);
    }
  }

  private emit() {
    for (const listener of this.listeners) listener(this.points, this.cursor);
  }
}

export const liveMapStore = new LiveMapStore();
