import * as Location from "expo-location";
import type { RawFix, Sport } from "../types";
import type { LocationBridge, LocationPermission } from "./LocationBridge";
import { SPORT_LOCATION_OPTIONS } from "./LocationBridge";
import {
  TRACKING_LOCATION_TASK,
  subscribeTrackingLocationTask,
  toRawFix
} from "./trackingLocationTask";

/**
 * Adapter Expo (managed / prebuild) com Foreground Service no Android.
 * Preferência: startLocationUpdatesAsync + TaskManager (app minimizado).
 * Fallback: watchPositionAsync (Expo Go / sem permissão background).
 */
export class ExpoLocationBridge implements LocationBridge {
  private watch: Location.LocationSubscription | null = null;
  private listeners = new Set<(fix: RawFix) => void>();
  private taskUnsub: (() => void) | null = null;
  private usingBackgroundUpdates = false;

  async requestPermissions(): Promise<LocationPermission> {
    const fg = await Location.requestForegroundPermissionsAsync();
    let background = false;
    if (fg.granted) {
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        background = bg.granted;
      } catch {
        background = false;
      }
    }
    return { foreground: fg.granted, background };
  }

  private accuracyFor(sport: Sport): Location.Accuracy {
    const cfg = SPORT_LOCATION_OPTIONS[sport];
    if (cfg.accuracy === "best") return Location.Accuracy.BestForNavigation;
    if (cfg.accuracy === "high") return Location.Accuracy.High;
    return Location.Accuracy.Balanced;
  }

  private emit(fix: RawFix) {
    for (const listener of this.listeners) listener(fix);
  }

  async getCurrentFix(): Promise<RawFix | null> {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return toRawFix(pos);
    } catch {
      return null;
    }
  }

  async start(_sessionId: string, sport: Sport): Promise<void> {
    await this.stop();
    const cfg = SPORT_LOCATION_OPTIONS[sport];
    const accuracy = this.accuracyFor(sport);

    this.taskUnsub = subscribeTrackingLocationTask((fix) => this.emit(fix));

    try {
      const started = await Location.hasStartedLocationUpdatesAsync(TRACKING_LOCATION_TASK);
      if (started) await Location.stopLocationUpdatesAsync(TRACKING_LOCATION_TASK);
    } catch {
      // primeira execução
    }

    try {
      await Location.startLocationUpdatesAsync(TRACKING_LOCATION_TASK, {
        accuracy,
        timeInterval: cfg.timeIntervalMs,
        distanceInterval: cfg.distanceIntervalM,
        deferredUpdatesInterval: cfg.timeIntervalMs,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: "App Treino · GPS ativo",
          notificationBody: "Gravando sua atividade. Toque para voltar.",
          notificationColor: "#E85D04"
        }
      });
      this.usingBackgroundUpdates = true;
    } catch {
      this.usingBackgroundUpdates = false;
      this.watch = await Location.watchPositionAsync(
        {
          accuracy,
          timeInterval: cfg.timeIntervalMs,
          distanceInterval: cfg.distanceIntervalM,
          mayShowUserSettingsDialog: true
        },
        (pos) => this.emit(toRawFix(pos))
      );
    }
  }

  async stop(): Promise<void> {
    this.watch?.remove();
    this.watch = null;
    this.taskUnsub?.();
    this.taskUnsub = null;

    if (this.usingBackgroundUpdates) {
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(TRACKING_LOCATION_TASK);
        if (started) await Location.stopLocationUpdatesAsync(TRACKING_LOCATION_TASK);
      } catch {
        // ignore
      }
      this.usingBackgroundUpdates = false;
    }
  }

  subscribe(handler: (fix: RawFix) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
}
