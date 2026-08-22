import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { RawFix } from "../types";
import { liveMapStore } from "../map/liveMapStore";

export const TRACKING_LOCATION_TASK = "APP_TREINO_TRACKING_LOCATION";

type FixHandler = (fix: RawFix) => void;

const handlers = new Set<FixHandler>();

export function subscribeTrackingLocationTask(handler: FixHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function toRawFix(pos: Location.LocationObject): RawFix {
  return {
    t: pos.timestamp || Date.now(),
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    ele: pos.coords.altitude ?? null,
    accuracyM: pos.coords.accuracy ?? null,
    speedMps: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null,
    heading: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null
  };
}

function emit(fix: RawFix) {
  // Mapa ← Task direto (mesmo em background)
  liveMapStore.pushFromTask(fix);
  for (const handler of handlers) {
    try {
      handler(fix);
    } catch {
      // isolado
    }
  }
}

/** Registrar no escopo global (index.js) antes do App montar. */
if (!TaskManager.isTaskDefined(TRACKING_LOCATION_TASK)) {
  TaskManager.defineTask(TRACKING_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;
    for (const pos of locations) emit(toRawFix(pos));
  });
}
