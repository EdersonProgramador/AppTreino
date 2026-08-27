import { Platform } from "react-native";
import { uuid } from "../geo";
import { localStore } from "../db/LocalStore";
import type { LocationBridge } from "../location/LocationBridge";
import { createLocationBridge } from "../location/createLocationBridge";
import { PointPipeline } from "../pipeline/PointPipeline";
import { buildFinishTrack, type FinishTrackPayload } from "../finish/buildFinishTrack";
import { liveMapStore } from "../map/liveMapStore";
import { pedometerBridge } from "../sensors/PedometerBridge";
import type { FilteredFix, LiveSnapshot, RawFix, Sport, TrackingSession } from "../types";

type Listener = (snap: LiveSnapshot) => void;

/** GPS → NoiseGates → Kalman → Pace/AutoPause → SQLite → UI/Mapa */
export class SessionManager {
  private bridge: LocationBridge;
  private pipeline = new PointPipeline();
  private unsubscribeFix: (() => void) | null = null;
  private session: TrackingSession | null = null;
  private lastFix: FilteredFix | null = null;
  private distanceM = 0;
  private movingTimeMs = 0;
  private moveTickAt: number | null = null;
  private autoPaused = false;
  private listeners = new Set<Listener>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private deviceId: string;
  private processing = false;
  private queue: RawFix[] = [];
  private acceptedSinceOutbox = 0;
  private pendingOutboxPoints: Array<{ lat: number; lng: number; t: number; ele: number | null }> = [];
  private lastFinishPayload: FinishTrackPayload | null = null;
  private stepsDetected = false;
  private cadenceSpm: number | null = null;
  private totalSteps = 0;
  private unsubSteps: (() => void) | null = null;

  constructor(bridge?: LocationBridge, deviceId = `device-${Platform.OS}`) {
    this.bridge = bridge ?? createLocationBridge();
    this.deviceId = deviceId;
  }

  async init() {
    await localStore.init();
    const existing = await localStore.getMeta("device_id");
    if (existing) this.deviceId = existing;
    else await localStore.setMeta("device_id", this.deviceId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.session) listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSession() {
    return this.session;
  }

  getLastFinishPayload() {
    return this.lastFinishPayload;
  }

  snapshot(): LiveSnapshot {
    if (!this.session) throw new Error("Nenhuma sessão ativa.");
    return {
      session: this.session,
      lastFix: this.lastFix,
      distanceM: this.distanceM,
      movingTimeMs: this.movingTimeMs,
      paceSecKm: this.lastFix?.paceSecKm ?? null,
      speedKmh: (this.lastFix?.filteredSpeedMps ?? 0) * 3.6,
      isAutoPaused: this.autoPaused,
      stepsCount: this.totalSteps,
      cadenceSpm: this.cadenceSpm
    };
  }

  private emit() {
    if (!this.session) return;
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  async recoverOrphan(): Promise<TrackingSession | null> {
    await this.init();
    const actives = await localStore.findActiveSessions();
    if (!actives.length) return null;
    const candidate = actives[0];
    if (candidate.status === "LIVE" && Date.now() - candidate.updatedAt > 30_000) {
      await localStore.updateSession(candidate.id, { status: "ORPHAN" });
      candidate.status = "ORPHAN";
    }
    return candidate;
  }

  async resumeOrphan(sessionId: string): Promise<TrackingSession> {
    await this.init();
    const session = await localStore.getSession(sessionId);
    if (!session) throw new Error("Sessão não encontrada.");
    if (!["ORPHAN", "PAUSED", "LIVE"].includes(session.status)) {
      throw new Error("Sessão não é recuperável.");
    }

    this.session = session;
    this.distanceM = session.distanceM;
    this.movingTimeMs = session.movingTimeMs;
    this.pipeline.reset();

    const last = await localStore.lastAcceptedPoint(sessionId);
    if (last?.filteredLat != null && last.filteredLng != null) {
      this.pipeline.warmStart(last.filteredLat, last.filteredLng, last.t, last.seq);
      this.lastFix = {
        t: last.t,
        lat: last.lat,
        lng: last.lng,
        ele: last.ele,
        accuracyM: last.accuracyM,
        speedMps: last.speedMps,
        heading: last.heading,
        filteredLat: last.filteredLat,
        filteredLng: last.filteredLng,
        filteredSpeedMps: last.filteredSpeedMps ?? 0,
        paceSecKm: last.paceSecKm,
        isAccepted: true,
        rejectReason: null,
        seq: last.seq,
        h3r9: last.h3r9,
        h3r11: last.h3r11
      };
      const accepted = await localStore.listAcceptedPoints(sessionId);
      liveMapStore.hydrate(
        accepted.map((p) => ({
          lat: p.filteredLat ?? p.lat,
          lng: p.filteredLng ?? p.lng,
          t: p.t
        }))
      );
    } else {
      liveMapStore.clear();
    }

    await localStore.updateSession(sessionId, { status: "LIVE", pausedAt: null });
    this.session = (await localStore.getSession(sessionId))!;
    await this.startGps(session.sport);
    this.startHeartbeat();
    this.emit();
    return this.session;
  }

  async start(sport: Sport): Promise<TrackingSession> {
    await this.init();
    if (this.session?.status === "LIVE") throw new Error("Já existe uma sessão LIVE.");

    // Após um crash `this.session` volta nulo, mas a linha LIVE/PAUSED/ORPHAN
    // continua no SQLite — sem esta checagem criaríamos uma segunda sessão ativa.
    const actives = await localStore.findActiveSessions();
    if (actives.length) {
      throw new Error("Existe uma sessão de treino não finalizada. Retome ou descarte antes de iniciar outra.");
    }

    const perms = await this.bridge.requestPermissions();
    if (!perms.foreground) throw new Error("Permissão de localização negada.");

    this.pipeline.reset();
    this.distanceM = 0;
    this.movingTimeMs = 0;
    this.moveTickAt = null;
    this.autoPaused = false;
    this.lastFix = null;
    this.queue = [];
    this.pendingOutboxPoints = [];
    this.acceptedSinceOutbox = 0;
    this.lastFinishPayload = null;
    liveMapStore.clear();

    const id = uuid();
    this.session = await localStore.createSession({
      id,
      sport,
      deviceId: this.deviceId,
      appVersion: "0.1.0"
    });

    await this.startGps(sport);
    this.startHeartbeat();
    this.emit();
    return this.session;
  }

  private async startGps(sport: Sport) {
    this.unsubscribeFix?.();
    this.unsubscribeFix = this.bridge.subscribe((raw) => {
      this.queue.push(raw);
      void this.drainQueue();
    });
    this.unsubSteps?.();
    this.stepsDetected = false;
    this.cadenceSpm = null;
    this.totalSteps = 0;
    this.unsubSteps = pedometerBridge.subscribe((moving, cadence, total) => {
      this.stepsDetected = moving;
      this.cadenceSpm = cadence;
      this.totalSteps = total;
      this.emit();
    });
    void pedometerBridge.start();
    await this.bridge.start(this.session!.id, sport);
  }

  private async drainQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        await this.onFix(this.queue.shift()!);
      }
    } finally {
      this.processing = false;
    }
  }

  private async onFix(raw: RawFix) {
    if (!this.session || this.session.status !== "LIVE") return;

    const { fix, distanceDeltaM, isAutoPaused } = this.pipeline.process(
      this.session.sport,
      raw,
      this.stepsDetected
    );
    this.autoPaused = isAutoPaused;
    this.lastFix = fix;

    if (fix.isAccepted && !isAutoPaused) {
      this.distanceM += distanceDeltaM;
      if (this.moveTickAt != null) {
        this.movingTimeMs += Math.max(0, raw.t - this.moveTickAt);
      }
      this.moveTickAt = raw.t;
    } else if (isAutoPaused) {
      this.moveTickAt = null;
    }

    await localStore.appendPoint(this.session.id, fix, this.distanceM, this.movingTimeMs);
    this.session.distanceM = this.distanceM;
    this.session.movingTimeMs = this.movingTimeMs;
    this.session.updatedAt = Date.now();

    if (fix.isAccepted) {
      liveMapStore.pushFiltered(fix.filteredLat, fix.filteredLng, fix.t);
      this.pendingOutboxPoints.push({
        lat: fix.filteredLat,
        lng: fix.filteredLng,
        t: fix.t,
        ele: fix.ele
      });
      this.acceptedSinceOutbox += 1;
      if (this.acceptedSinceOutbox >= 8 && this.session.serverId) {
        await this.flushPendingOutbox();
      }
    }

    this.emit();
  }

  private async flushPendingOutbox() {
    if (!this.session?.serverId || !this.pendingOutboxPoints.length) return;
    const batch = this.pendingOutboxPoints.splice(0, this.pendingOutboxPoints.length);
    this.acceptedSinceOutbox = 0;
    await localStore.enqueueOutbox(this.session.id, "POINTS", {
      serverId: this.session.serverId,
      points: batch
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.session || this.session.status !== "LIVE") return;
      void localStore.touchSession(this.session.id);
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.status !== "LIVE") return;
    await this.bridge.stop();
    await pedometerBridge.stop();
    this.unsubSteps?.();
    this.unsubSteps = null;
    this.unsubscribeFix?.();
    this.unsubscribeFix = null;
    this.stopHeartbeat();
    this.moveTickAt = null;
    await localStore.updateSession(this.session.id, {
      status: "PAUSED",
      pausedAt: Date.now(),
      distanceM: this.distanceM,
      movingTimeMs: this.movingTimeMs
    });
    this.session = (await localStore.getSession(this.session.id))!;
    this.emit();
  }

  async resume(): Promise<void> {
    if (!this.session || this.session.status !== "PAUSED") return;
    const pausedAt = this.session.pausedAt ?? Date.now();
    await localStore.updateSession(this.session.id, {
      status: "LIVE",
      pausedAt: null,
      pauseMs: this.session.pauseMs + Math.max(0, Date.now() - pausedAt)
    });
    this.session = (await localStore.getSession(this.session.id))!;
    await this.startGps(this.session.sport);
    this.startHeartbeat();
    this.emit();
  }

  async finish(): Promise<{ session: TrackingSession; track: FinishTrackPayload | null }> {
    if (!this.session) throw new Error("Nenhuma sessão.");
    await this.bridge.stop();
    await pedometerBridge.stop();
    this.unsubSteps?.();
    this.unsubSteps = null;
    this.unsubscribeFix?.();
    this.unsubscribeFix = null;
    this.stopHeartbeat();

    await localStore.updateSession(this.session.id, {
      status: "FINISHED",
      endedAt: Date.now(),
      pausedAt: null,
      distanceM: this.distanceM,
      movingTimeMs: this.movingTimeMs
    });

    const finished = (await localStore.getSession(this.session.id))!;
    const trackBase = await buildFinishTrack(finished.id);
    const track = trackBase
      ? {
          ...trackBase,
          stepsCount: this.totalSteps || pedometerBridge.getTotalSteps(),
          avgCadenceSpm: this.cadenceSpm ?? pedometerBridge.getCadenceSpm()
        }
      : null;
    this.lastFinishPayload = track;

    if (finished.serverId && track) {
      if (this.pendingOutboxPoints.length) {
        await localStore.enqueueOutbox(finished.id, "POINTS", {
          serverId: finished.serverId,
          points: this.pendingOutboxPoints.splice(0, this.pendingOutboxPoints.length)
        });
      }
      await localStore.enqueueOutbox(finished.id, "FINISH", {
        serverId: finished.serverId,
        points: track.points,
        compressedCount: track.compressedCount,
        rawCount: track.rawCount,
        maskedCount: track.maskedCount,
        h3r9: track.h3r9,
        h3r11: track.h3r11,
        antiCheat: track.antiCheat,
        distanceM: track.distanceM,
        movingTimeMs: track.movingTimeMs,
        stepsCount: track.stepsCount,
        avgCadenceSpm: track.avgCadenceSpm
      });
    }

    if (track?.points.length) {
      liveMapStore.hydrate(track.points.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));
    }

    this.session = finished;
    this.emit();
    return { session: finished, track };
  }

  async bindServerId(localId: string, serverId: string): Promise<void> {
    await localStore.updateSession(localId, { serverId });
    if (this.session?.id === localId) {
      this.session = (await localStore.getSession(localId))!;
      this.emit();
    }
  }

  async locateOnce(): Promise<RawFix | null> {
    return this.bridge.getCurrentFix();
  }

  async requestPermissions() {
    return this.bridge.requestPermissions();
  }

  async discard(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.session?.id;
    if (!id) return;
    await this.bridge.stop();
    await pedometerBridge.stop();
    this.unsubSteps?.();
    this.unsubSteps = null;
    this.unsubscribeFix?.();
    this.unsubscribeFix = null;
    this.stopHeartbeat();
    liveMapStore.clear();
    await localStore.updateSession(id, { status: "FINISHED", endedAt: Date.now() });
    if (this.session?.id === id) this.session = null;
  }
}

export const trackingEngine = new SessionManager();
/** Alias usado pela UI. */
export const trackingEngineAlias = trackingEngine;
