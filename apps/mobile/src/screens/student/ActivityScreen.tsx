import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { apiGet, apiPost, apiUploadFile } from "../../auth/api";
import {
  estimateCalories,
  formatClock,
  formatKm,
  formatPace,
  liveDistance,
  liveElapsedSeconds,
  liveElevation,
  liveSpeedKmh,
  liveKmSplit,
  LAP_RADIUS_M,
  updateLapCrossing
} from "../../student/activity-geo";
import { ActivityShareFlow, type ActivityShareStats } from "../../student/ActivityShareFlow";
import { StudentPage } from "../../student/layout";
import { RunnerIcon } from "../../student/RunnerIcon";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { OutdoorShareCard } from "../../student/OutdoorShareCard";
import { WeatherChip } from "../../student/WeatherChip";
import { fetchWeather, type WeatherSnapshot } from "../../student/weather";
import { hasHealthAccess, hydrateHealthGrants, markHealthPrompted, wasHealthPrompted } from "../../student/healthPermissions";
import { isMapCompassEnabled, setMapCompassEnabled, subscribeMapCompass } from "../../student/prefs";
import {
  TrackingMap,
  liveMapStore,
  trackingEngine,
  useTrackingEngine,
  outboxSync,
  type Sport
} from "../../tracking";
import type { OutdoorActivityRow, OutdoorSport } from "../../types";
import type { StudentTabParamList } from "../../navigation/types";

type GpsPoint = { lat: number; lng: number; t: number; ele?: number | null };
type LapMarker = { lat: number; lng: number; radiusMeters?: number };
type LapRecord = { index: number; lat: number; lng: number; t: number; distanceMeters: number };
type MapType = "standard" | "satellite" | "hybrid" | "winter";
type ActivityMap = "global" | "weekly" | "night" | "personal";

const SPORTS: Array<{ id: OutdoorSport; label: string; ionicon?: keyof typeof Ionicons.glyphMap }> = [
  { id: "RUN", label: "Corrida" },
  { id: "WALK", label: "Caminhada", ionicon: "walk-outline" },
  { id: "RIDE", label: "Ciclismo", ionicon: "bicycle-outline" }
];

function mergeRoutePoints(
  ...sources: Array<Array<{ lat: number; lng: number; t?: number; ele?: number | null }> | null | undefined>
): GpsPoint[] {
  const byT = new Map<number, GpsPoint>();
  for (const src of sources) {
    for (const point of src ?? []) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      const t = Number(point.t);
      if (!Number.isFinite(t)) continue;
      if (!byT.has(t)) {
        byT.set(t, { lat: point.lat, lng: point.lng, t, ele: point.ele });
      }
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function nativeMapType(type: MapType): "standard" | "satellite" | "hybrid" {
  return type === "satellite" || type === "hybrid" ? type : "standard";
}

function sanitizeFinishPoints(points: GpsPoint[]) {
  return points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.t))
    .map((point) => ({
      lat: point.lat,
      lng: point.lng,
      t: point.t,
      ele: typeof point.ele === "number" && Number.isFinite(point.ele) ? point.ele : null
    }));
}

function compactRecord<T extends Record<string, unknown>>(value: T) {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === "") continue;
    next[key] = item;
  }
  return next;
}

export function ActivityScreen() {
  const { session, profile, refresh } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<BottomTabNavigationProp<StudentTabParamList>>();
  const engineUnsubRef = useRef<(() => void) | null>(null);
  const localSessionIdRef = useRef<string | null>(null);
  const { orphan, clearOrphan, engine, snap, ready } = useTrackingEngine();
  const bufferRef = useRef<GpsPoint[]>([]);
  const liveBoundRef = useRef<string | null>(null);
  const bindingLiveRef = useRef(false);
  const lastBoundSeqRef = useRef(-1);
  const pauseHoldRef = useRef(false);
  const [pauseHold, setPauseHold] = useState(false);
  const pointsRef = useRef<GpsPoint[]>([]);
  const gpsLockRef = useRef(Promise.resolve());
  const shareOpenRef = useRef(false);
  const finishingRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const liveHydrateGen = useRef(0);
  const lapAwayRef = useRef(false);
  const lapMaxAwayRef = useRef(0);
  const autoArmLapRef = useRef(true);
  const lapMarkerRef = useRef<LapMarker | null>(null);
  const [sport, setSport] = useState<OutdoorSport>("RUN");
  const [mapType, setMapType] = useState<MapType>("standard");
  const [activityMap, setActivityMap] = useState<ActivityMap>("personal");
  const [layers, setLayers] = useState({ pois: true, bikeLanes: false, avalanche: false, slope: false, aspect: false });
  const [is3d, setIs3d] = useState(false);
  const [compassOn, setCompassOn] = useState(isMapCompassEnabled);
  const [sheet, setSheet] = useState<"layers" | "finish" | "goals" | null>(null);
  const [activity, setActivity] = useState<OutdoorActivityRow | null>(null);
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [targetKm, setTargetKm] = useState("");
  const [targetHours, setTargetHours] = useState("0");
  const [targetMinutes, setTargetMinutes] = useState("30");
  const [targetSpeed, setTargetSpeed] = useState("");
  const [lapMarker, setLapMarker] = useState<LapMarker | null>(null);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const [lapCounterOn, setLapCounterOn] = useState(false);
  const [pickingLapStart, setPickingLapStart] = useState(false);
  const [caption, setCaption] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishSplits, setFinishSplits] = useState<Array<{
    km: number;
    paceSecPerKm: number;
    elapsedTime: number;
    distance?: number;
    partial?: boolean;
    elevationDifference?: number;
  }> | null>(null);
  const [finishAnalysis, setFinishAnalysis] = useState<{
    bestKm?: number | null;
    worstKm?: number | null;
    bestPaceSecPerKm?: number | null;
    worstPaceSecPerKm?: number | null;
  } | null>(null);
  const [bestEfforts, setBestEfforts] = useState<
    Array<{ label: string; elapsedSeconds: number; paceSecPerKm: number }>
  >([]);
  const [finishStats, setFinishStats] = useState<{
    distanceMeters: number;
    elapsedSeconds: number;
    paceSecPerKm: number | null;
    elevationGainMeters: number;
    elevationLossMeters: number;
    stepsCount?: number;
    cadenceSpm?: number | null;
    powerWatts?: number | null;
    calories?: number;
  } | null>(null);
  const [pendingFeedNav, setPendingFeedNav] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [shareStats, setShareStats] = useState<ActivityShareStats | null>(null);
  const [locked, setLocked] = useState<ActivityShareStats | null>(null);
  const [nearbySegments, setNearbySegments] = useState<
    Array<{ id: string; name: string; distanceMeters: number; sport: string }>
  >([]);
  const [segmentEfforts, setSegmentEfforts] = useState<
    Array<{ segmentId: string; name: string; elapsedSeconds: number; paceSecPerKm: number | null; isPr: boolean }>
  >([]);
  const [segmentBoard, setSegmentBoard] = useState<{
    name: string;
    rows: Array<{ rank: number; name: string; elapsedSeconds: number; isPr: boolean }>
  } | null>(null);

  const engineStatus = snap?.session.status;
  const sessionActive = Boolean(
    !sessionClosed &&
      activity &&
      (activity.status === "LIVE" || activity.status === "PAUSED") &&
      engineStatus !== "FINISHED"
  );
  const running = sessionActive && !pauseHold && (engineStatus === "LIVE" || activity?.status === "LIVE");
  const paused = sessionActive && (pauseHold || engineStatus === "PAUSED" || activity?.status === "PAUSED");
  const liveDistanceM = sessionActive && snap?.distanceM && snap.distanceM > 0 ? snap.distanceM : sessionActive ? liveDistance(points) : 0;
  const livePace =
    sessionActive
      ? snap?.paceSecKm ?? (liveDistanceM >= 20 && elapsed > 0 ? elapsed / (liveDistanceM / 1000) : null)
      : null;
  const liveSpeed = sessionActive && snap?.speedKmh && snap.speedKmh > 0 ? snap.speedKmh : sessionActive ? liveSpeedKmh(points) : 0;
  const elevation = useMemo(() => (sessionActive ? liveElevation(points) : { gain: 0, loss: 0 }), [points, sessionActive]);
  const liveCalories = sessionActive ? estimateCalories(sport, elapsed) : 0;
  const liveSplit = useMemo(
    () => (sessionActive ? liveKmSplit(points) : { kmIndex: 1, metersInSplit: 0, paceSecPerKm: null, completed: [] }),
    [points, sessionActive]
  );
  const distance = sessionActive ? locked?.distanceMeters ?? liveDistanceM : 0;
  const pace = sessionActive ? locked?.paceSecPerKm ?? livePace : null;
  const speedKmh = sessionActive ? locked?.speedKmh ?? liveSpeed : 0;
  const calories = sessionActive ? locked?.calories ?? liveCalories : 0;
  const shownElapsed = sessionActive ? locked?.elapsedSeconds ?? elapsed : 0;
  const shownElev = sessionActive ? locked?.elevationGainMeters ?? elevation.gain : 0;
  const shownSteps = sessionActive ? locked?.stepsCount ?? snap?.stepsCount : undefined;
  const shownCadence = sessionActive ? locked?.cadenceSpm ?? snap?.cadenceSpm : null;
  const shownLaps = sessionActive ? locked?.lapsCount ?? laps.length : 0;
  const shownKmIndex = sessionActive ? locked?.kmIndex ?? liveSplit.kmIndex : 1;
  const shownKmPace = sessionActive ? locked?.kmPaceSecPerKm ?? liveSplit.paceSecPerKm : null;
  const parsedKm = Number(targetKm.replace(",", "."));
  const durationSec = (Number(targetHours) || 0) * 3600 + (Number(targetMinutes) || 0) * 60;
  lapMarkerRef.current = lapMarker;
  pointsRef.current = points;
  shareOpenRef.current = shareOpen;
  finishingRef.current = finishing;
  pauseHoldRef.current = pauseHold;

  function markSessionClosed() {
    sessionClosedRef.current = true;
    setSessionClosed(true);
    liveHydrateGen.current += 1;
  }

  function markSessionOpen() {
    sessionClosedRef.current = false;
    setSessionClosed(false);
  }

  function runGpsExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = gpsLockRef.current.then(fn, fn);
    gpsLockRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  useFocusEffect(
    useCallback(() => {
      if (sessionClosedRef.current) {
        void (async () => {
          const fix = await locate();
          if (fix) liveMapStore.centerOn(fix.lat, fix.lng, fix.t);
        })();
        return;
      }
      if (activity?.status === "LIVE" || activity?.status === "PAUSED") return;
      void (async () => {
        const fix = await locate();
        if (fix) liveMapStore.centerOn(fix.lat, fix.lng, fix.t);
        await hydrateHealthGrants();
        if (!(await wasHealthPrompted()) && !hasHealthAccess()) {
          Alert.alert(
            "O Apptreino deseja acessar e atualizar seus dados de saúde.",
            "Para monitorar a FC com o seu relógio, precisamos de permissão para acessar o sensor de frequência cardíaca.",
            [
              { text: "Agora não", style: "cancel", onPress: () => void markHealthPrompted() },
              {
                text: "Permitir",
                onPress: () => {
                  void markHealthPrompted();
                  navigation.navigate("MenuTab", { screen: "HealthPermissions" });
                }
              }
            ]
          );
        }
      })();
    }, [activity?.status, sessionClosed])
  );

  function currentGoals() {
    const distanceKm = Number.isFinite(parsedKm) && parsedKm > 0 ? Math.min(parsedKm, 200) : undefined;
    const durationSeconds = durationSec > 0 ? Math.min(Math.round(durationSec), 86400) : undefined;
    const parsedSpeed = Number(targetSpeed.replace(",", "."));
    const speedKmh = Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? Math.min(parsedSpeed, 80) : undefined;
    return {
      distanceKm,
      durationSeconds,
      speedKmh,
      lapRadiusMeters: LAP_RADIUS_M,
      lapCounterOn: true,
      lapMarker,
      laps
    };
  }

  useEffect(() => subscribeMapCompass(setCompassOn), []);

  useEffect(() => {
    const gen = ++liveHydrateGen.current;
    void apiGet<{ activity: OutdoorActivityRow | null }>("/student/activities/live", session.token).then((data) => {
      if (gen !== liveHydrateGen.current) return;
      if (sessionClosedRef.current) return;
      if (!data.activity) return;
      if (data.activity.status !== "LIVE" && data.activity.status !== "PAUSED") return;
      setActivity(data.activity);
      setSport(data.activity.sport);
      const recovered = data.activity.polyline.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        t: p.t ?? Date.now(),
        ele: p.ele
      }));
      setPoints(recovered);
      if (recovered.length) {
        liveMapStore.hydrate(recovered.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));
      }
      const goals = data.activity.goals;
      if (goals?.distanceKm) setTargetKm(String(goals.distanceKm));
      if (goals?.durationSeconds) {
        setTargetHours(String(Math.floor(goals.durationSeconds / 3600)));
        setTargetMinutes(String(Math.floor((goals.durationSeconds % 3600) / 60)));
      }
      if (goals?.speedKmh) setTargetSpeed(String(goals.speedKmh));
      if (goals?.lapMarker) {
        setLapMarker(goals.lapMarker);
        setLapCounterOn(goals.lapCounterOn !== false);
      }
      if (goals?.laps) setLaps(goals.laps);
    });
  }, [session.token]);

  useEffect(() => {
    if (!activity) liveBoundRef.current = null;
  }, [activity]);

  useEffect(() => {
    if (!ready || !activity || shareOpen || finishing || pauseHold || sessionClosed) return;
    if (activity.status !== "LIVE") return;
    const current = engine.getSession();
    if (liveBoundRef.current === activity.id && current?.status === "LIVE") {
      if (!engineUnsubRef.current) bindEngineToUi(activity.id);
      return;
    }
    if (bindingLiveRef.current) return;
    bindingLiveRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await runGpsExclusive(async () => {
          if (cancelled || shareOpenRef.current || finishingRef.current || pauseHoldRef.current || sessionClosedRef.current) return;
          if (engine.getSession()?.status === "FINISHED") return;
          const local = engine.getSession();
          if (local?.status === "PAUSED") return;
          if (local?.status === "LIVE" && (local.serverId === activity.id || !local.serverId)) {
            if (local.serverId !== activity.id) await engine.bindServerId(local.id, activity.id);
            if (cancelled) return;
            localSessionIdRef.current = local.id;
            bindEngineToUi(activity.id);
            clearOrphan();
            liveBoundRef.current = activity.id;
            return;
          }
          const recoverId =
            local && ["LIVE", "ORPHAN"].includes(local.status) ? local.id : orphan?.status === "PAUSED" ? null : orphan?.id ?? null;
          if (recoverId) {
            await engine.resumeOrphan(recoverId);
            if (cancelled || shareOpenRef.current || finishingRef.current || pauseHoldRef.current || sessionClosedRef.current) {
              if (pauseHoldRef.current || sessionClosedRef.current) {
                try {
                  await engine.pause();
                } catch {
                  /* pause ganhou a corrida */
                }
              }
              return;
            }
            await engine.bindServerId(recoverId, activity.id);
            if (cancelled) return;
            localSessionIdRef.current = recoverId;
            bindEngineToUi(activity.id);
            clearOrphan();
            liveBoundRef.current = activity.id;
            return;
          }
          const saved = activity.polyline ?? [];
          try {
            const started = await engine.start(activity.sport as Sport);
            if (cancelled || shareOpenRef.current || finishingRef.current || pauseHoldRef.current || sessionClosedRef.current) {
              if (pauseHoldRef.current || finishingRef.current || shareOpenRef.current || sessionClosedRef.current) {
                try {
                  await engine.pause();
                } catch {
                  /* pause/finish ganhou a corrida */
                }
              }
              return;
            }
            localSessionIdRef.current = started.id;
            await engine.bindServerId(started.id, activity.id);
            if (cancelled) return;
            if (saved.length) {
              liveMapStore.hydrate(saved.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t ?? Date.now() })));
            }
            bindEngineToUi(activity.id);
            liveBoundRef.current = activity.id;
          } catch {
            const recovered = await engine.recoverOrphan();
            if (!recovered || cancelled || shareOpenRef.current || finishingRef.current || pauseHoldRef.current || sessionClosedRef.current) return;
            await engine.resumeOrphan(recovered.id);
            if (cancelled || shareOpenRef.current || finishingRef.current || pauseHoldRef.current || sessionClosedRef.current) return;
            await engine.bindServerId(recovered.id, activity.id);
            if (cancelled) return;
            localSessionIdRef.current = recovered.id;
            bindEngineToUi(activity.id);
            clearOrphan();
            liveBoundRef.current = activity.id;
          }
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao retomar o GPS da atividade em andamento.");
        }
      } finally {
        bindingLiveRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, activity, shareOpen, finishing, pauseHold, sessionClosed, orphan?.id, engine, clearOrphan]);

  useEffect(() => {
    if (locked) {
      setElapsed(locked.elapsedSeconds);
      return;
    }
    if (!activity || (!running && !paused)) return;
    const tick = () => {
      setElapsed(
        liveElapsedSeconds({
          startedAt: activity.startedAt,
          status: paused ? "PAUSED" : "LIVE",
          pauseMs: activity.pauseMs,
          pausedAt: activity.pausedAt
        })
      );
    };
    tick();
    if (!running) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, paused, activity, locked]);

  async function locate() {
    try {
      const fix = await trackingEngine.locateOnce();
      if (!fix) {
        setError("Permita a localização para usar o GPS.");
        return null;
      }
      liveMapStore.centerOn(fix.lat, fix.lng, fix.t);
      void fetchWeather(fix.lat, fix.lng, sport)
        .then((snap) => {
          weatherRef.current = snap;
          setWeather(snap);
        })
        .catch(() => undefined);
      void apiGet<{
        segments: Array<{ id: string; name: string; distanceMeters: number; sport: string }>;
      }>(
        `/student/activities/named-segments/nearby?lat=${fix.lat}&lng=${fix.lng}&sport=${sport}&limit=5`,
        session.token
      )
        .then((data) => setNearbySegments(data.segments ?? []))
        .catch(() => setNearbySegments([]));
      return fix;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao obter GPS.");
      return null;
    }
  }

  function clearSessionRoute() {
    bufferRef.current = [];
    pointsRef.current = [];
    setPoints([]);
    liveMapStore.clear();
  }

  function collectLiveRoute(
    ...extra: Array<Array<{ lat: number; lng: number; t?: number; ele?: number | null }> | null | undefined>
  ) {
    return mergeRoutePoints(pointsRef.current, bufferRef.current, liveMapStore.getPoints(), ...extra);
  }

  async function persistRoute(id: string, precomputed?: GpsPoint[]) {
    const drained = bufferRef.current.splice(0);
    const route = mergeRoutePoints(
      precomputed,
      pointsRef.current,
      drained,
      liveMapStore.getPoints()
    );
    if (route.length) {
      pointsRef.current = route;
      setPoints(route);
    }
    if (!route.length) return route;
    for (let i = 0; i < route.length; i += 200) {
      const slice = route.slice(i, i + 200);
      try {
        await apiPost(`/student/activities/${id}/points`, { points: slice }, session.token);
      } catch {
        const localId = localSessionIdRef.current;
        if (localId) {
          try {
            await outboxSync.enqueuePoints(localId, id, slice);
          } catch {
            /* finish ainda envia o trajeto completo */
          }
        }
      }
    }
    void outboxSync.flush(session.token);
    return route;
  }

  function hydrateRoute(route: GpsPoint[]) {
    if (!route.length) return;
    pointsRef.current = route;
    setPoints(route);
    liveMapStore.hydrate(route.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));
  }

  async function flush(id: string) {
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    if (!batch.length) return;
    for (let i = 0; i < batch.length; i += 200) {
      const slice = batch.slice(i, i + 200);
      try {
        await apiPost(`/student/activities/${id}/points`, { points: slice }, session.token);
      } catch {
        const localId = localSessionIdRef.current;
        if (localId) await outboxSync.enqueuePoints(localId, id, slice);
      }
    }
    void outboxSync.flush(session.token);
  }

  function bindEngineToUi(serverActivityId: string) {
    engineUnsubRef.current?.();
    lastBoundSeqRef.current = -1;
    engineUnsubRef.current = trackingEngine.subscribe((next) => {
      const fix = next?.lastFix;
      if (!fix?.isAccepted) return;
      if (fix.seq <= lastBoundSeqRef.current) return;
      lastBoundSeqRef.current = fix.seq;
      const point: GpsPoint = {
        lat: fix.filteredLat,
        lng: fix.filteredLng,
        t: fix.t,
        ele: fix.ele
      };
      bufferRef.current.push(point);
      setPoints((current) => {
        const next = [...current, point];
        if (autoArmLapRef.current && !lapMarkerRef.current) {
          const marker = { lat: point.lat, lng: point.lng, radiusMeters: LAP_RADIUS_M };
          autoArmLapRef.current = false;
          lapAwayRef.current = false;
          lapMaxAwayRef.current = 0;
          lapMarkerRef.current = marker;
          setLapMarker(marker);
          setLapCounterOn(true);
        }
        if (lapMarkerRef.current) {
          const crossing = updateLapCrossing(lapMarkerRef.current, point, {
            away: lapAwayRef.current,
            count: 0,
            maxAwayMeters: lapMaxAwayRef.current
          });
          lapAwayRef.current = crossing.away;
          lapMaxAwayRef.current = crossing.maxAwayMeters ?? 0;
          if (crossing.completed) {
            const dist = liveDistance(next);
            setLaps((currentLaps) => {
              const nextLaps = [
                ...currentLaps,
                { index: currentLaps.length + 1, lat: point.lat, lng: point.lng, t: point.t, distanceMeters: dist }
              ];
              void apiPost(`/student/activities/${serverActivityId}/goals`, {
                goals: { ...currentGoals(), laps: nextLaps, lapMarker: lapMarkerRef.current }
              }, session.token);
              return nextLaps;
            });
          }
        }
        return next;
      });
      if (bufferRef.current.length >= 8) void flush(serverActivityId);
    });
  }

  useEffect(() => () => {
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
  }, []);

  // Outbox drain
  useEffect(() => {
    const id = setInterval(() => {
      void outboxSync.flush(session.token);
    }, 15000);
    void outboxSync.flush(session.token);
    return () => clearInterval(id);
  }, [session.token]);

  async function startOrResume() {
    if (shareOpen || finishing) return;
    setError(null);
    setLocked(null);
    const ok = await locate();
    if (!ok) return;
    const startFresh = sessionClosedRef.current;
    if (startFresh) {
      const leftover = activity;
      markSessionOpen();
      const localId = localSessionIdRef.current ?? trackingEngine.getSession()?.id;
      if (localId) {
        try {
          await trackingEngine.discard(localId);
        } catch {
          /* sessão já encerrada */
        }
        localSessionIdRef.current = null;
      }
      if (leftover) {
        try {
          await apiPost(`/student/activities/${leftover.id}/cancel`, {}, session.token);
        } catch {
          /* já finalizada ou inexistente */
        }
        setActivity(null);
      }
    } else if (paused && activity) {
      setPauseHold(false);
      pauseHoldRef.current = false;
      try {
        const data = await apiPost<{ activity: OutdoorActivityRow }>(
          `/student/activities/${activity.id}/resume`,
          {},
          session.token
        );
        setActivity(data.activity);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!/não está pausada|already|409/i.test(msg)) {
          setPauseHold(true);
          pauseHoldRef.current = true;
          setError(e instanceof Error ? e.message : "Falha ao retomar.");
          return;
        }
      }
      try {
        await runGpsExclusive(async () => {
          const sessionNow = trackingEngine.getSession();
          if (sessionNow?.status === "PAUSED") {
            await trackingEngine.resume();
          } else if (sessionNow?.status !== "LIVE") {
            const recoverId = sessionNow?.id ?? orphan?.id;
            if (recoverId) {
              await trackingEngine.resumeOrphan(recoverId);
              await trackingEngine.bindServerId(recoverId, activity.id);
              localSessionIdRef.current = recoverId;
            }
          }
          if (trackingEngine.getSession() && !trackingEngine.getSession()?.serverId) {
            await trackingEngine.bindServerId(trackingEngine.getSession()!.id, activity.id);
          }
          lastBoundSeqRef.current = -1;
          liveBoundRef.current = activity.id;
          bindEngineToUi(activity.id);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao religar o GPS.");
      }
      return;
    }
    setPauseHold(false);
    pauseHoldRef.current = false;
    const goals = currentGoals();
    try {
      const data = await apiPost<{ activity: OutdoorActivityRow; resumed?: boolean }>(
        "/student/activities",
        { sport, mapType, activityMap, layers, is3d, targetDistanceMeters: goals.distanceKm ? goals.distanceKm * 1000 : undefined, goals },
        session.token
      );
      setActivity(data.activity);
      markSessionOpen();
      const recovered = (data.activity.polyline ?? []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        t: p.t ?? Date.now(),
        ele: p.ele
      }));
      const isResume = !startFresh && Boolean(data.resumed) && data.activity.sport === sport;
      if (!isResume) clearSessionRoute();
      await runGpsExclusive(async () => {
        const existing = trackingEngine.getSession();
        if (existing && ["LIVE", "PAUSED", "ORPHAN"].includes(existing.status)) {
          if (existing.status !== "LIVE") await trackingEngine.resumeOrphan(existing.id);
          localSessionIdRef.current = existing.id;
          await trackingEngine.bindServerId(existing.id, data.activity.id);
        } else {
          try {
            const local = await trackingEngine.start(sport as Sport);
            localSessionIdRef.current = local.id;
            await trackingEngine.bindServerId(local.id, data.activity.id);
          } catch {
            const orphaned = await trackingEngine.recoverOrphan();
            if (!orphaned) throw new Error("Não foi possível iniciar o GPS.");
            await trackingEngine.resumeOrphan(orphaned.id);
            localSessionIdRef.current = orphaned.id;
            await trackingEngine.bindServerId(orphaned.id, data.activity.id);
            clearOrphan();
          }
        }
        lastBoundSeqRef.current = -1;
        liveBoundRef.current = data.activity.id;
        bindEngineToUi(data.activity.id);
      });
      const seed: GpsPoint = { lat: ok.lat, lng: ok.lng, t: ok.t, ele: ok.ele };
      if (isResume) {
        hydrateRoute(mergeRoutePoints(recovered, [seed]));
      } else {
        hydrateRoute([seed]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar a atividade.");
    }
  }

  function captureLockedMetrics(route: GpsPoint[]): ActivityShareStats {
    const dist = snap?.distanceM && snap.distanceM > 0 ? snap.distanceM : liveDistance(route);
    const pausedAtIso = new Date().toISOString();
    const timeSec =
      elapsed > 0
        ? elapsed
        : activity
          ? liveElapsedSeconds({
              startedAt: activity.startedAt,
              status: "PAUSED",
              pauseMs: activity.pauseMs,
              pausedAt: pausedAtIso
            })
          : 0;
    const elev = liveElevation(route);
    const split = liveKmSplit(route);
    const paceSec = dist >= 20 && timeSec > 0 ? timeSec / (dist / 1000) : snap?.paceSecKm ?? livePace;
    return {
      sportLabel: SPORTS.find((item) => item.id === sport)?.label ?? sport,
      sport,
      distanceMeters: dist,
      elapsedSeconds: timeSec,
      paceSecPerKm: paceSec,
      speedKmh: snap?.speedKmh && snap.speedKmh > 0 ? snap.speedKmh : liveSpeedKmh(route),
      calories: estimateCalories(sport, timeSec),
      elevationGainMeters: elev.gain,
      elevationLossMeters: elev.loss,
      stepsCount: snap?.stepsCount,
      cadenceSpm: snap?.cadenceSpm,
      powerWatts: null,
      mapType,
      is3d,
      points: route,
      lapsCount: laps.length,
      kmIndex: split.kmIndex,
      kmPaceSecPerKm: split.paceSecPerKm
    };
  }

  async function pause() {
    const sessionNow = trackingEngine.getSession();
    if (!activity && !sessionNow) return;
    if (pauseHold && sessionNow?.status === "PAUSED") return;
    setPauseHold(true);
    pauseHoldRef.current = true;
    setError(null);
    const pausedAtIso = new Date().toISOString();
    setActivity((current) =>
      current
        ? { ...current, status: "PAUSED", pausedAt: current.pausedAt ?? pausedAtIso }
        : current
    );
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    const frozen = sanitizeFinishPoints(collectLiveRoute(activity?.polyline));
    const snapshot = captureLockedMetrics(frozen);
    setLocked(snapshot);
    setElapsed(snapshot.elapsedSeconds);
    if (frozen.length) hydrateRoute(frozen);
    try {
      await trackingEngine.pause();
    } catch {
      /* GPS pode já estar parado */
    }
    if (!activity) return;
    const route = sanitizeFinishPoints(mergeRoutePoints(frozen, collectLiveRoute(activity.polyline)));
    if (route.length) hydrateRoute(route);
    void persistRoute(activity.id, route);
    try {
      const data = await apiPost<{ activity: OutdoorActivityRow }>(
        `/student/activities/${activity.id}/pause`,
        { points: route },
        session.token
      );
      setActivity({
        ...data.activity,
        status: "PAUSED",
        polyline: route.length ? route : data.activity.polyline,
        pausedAt: data.activity.pausedAt ?? pausedAtIso
      });
    } catch {
      setActivity((current) =>
        current
          ? {
              ...current,
              status: "PAUSED",
              pausedAt: current.pausedAt ?? pausedAtIso,
              polyline: route.length ? route : current.polyline
            }
          : current
      );
    }
  }

  async function pick(kind: "photo" | "video", fromCamera = true) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: kind === "video" ? ["videos"] : ["images"],
          quality: 0.85
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === "video" ? ["videos"] : ["images"],
          quality: 0.85
        });
    if (result.canceled || !result.assets[0]) return;
    const uploaded = await apiUploadFile<{ file: { url: string } }>(
      "/student/social/uploads",
      result.assets[0].uri,
      session.token,
      kind === "video" ? "activity.mp4" : "activity.jpg"
    );
    if (kind === "video") setVideoUrl(uploaded.file.url);
    else setPhotoUrl(uploaded.file.url);
  }

  async function beginFinish() {
    if (!activity || shareOpen) return;
    setFinishing(true);
    finishingRef.current = true;
    setPauseHold(true);
    pauseHoldRef.current = true;
    setError(null);
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    const pausedAtIso = new Date().toISOString();
    setActivity((current) =>
      current
        ? { ...current, status: current.status === "COMPLETED" ? current.status : "PAUSED", pausedAt: current.pausedAt ?? pausedAtIso }
        : current
    );
    const preRoute = sanitizeFinishPoints(collectLiveRoute(activity.polyline));
    const snapshot = captureLockedMetrics(preRoute);
    setLocked(snapshot);
    setElapsed(snapshot.elapsedSeconds);
    if (preRoute.length) hydrateRoute(preRoute);
    try {
      await trackingEngine.finish();
    } catch {
      try {
        await trackingEngine.pause();
      } catch {
        /* ignore */
      }
    }
    const track = trackingEngine.getLastFinishPayload();
    const route = sanitizeFinishPoints(
      mergeRoutePoints(track?.points, preRoute, pointsRef.current, bufferRef.current, liveMapStore.getPoints(), activity.polyline)
    );
    if (route.length) hydrateRoute(route);
    const timeSec = snapshot.elapsedSeconds;
    const dist = track?.distanceM && track.distanceM > 0 ? track.distanceM : snapshot.distanceMeters;
    const elev = liveElevation(route);
    const split = liveKmSplit(route);
    const finalStats: ActivityShareStats = {
      ...snapshot,
      distanceMeters: dist,
      elapsedSeconds: timeSec,
      paceSecPerKm: dist >= 20 && timeSec > 0 ? timeSec / (dist / 1000) : snapshot.paceSecPerKm,
      calories: estimateCalories(sport, timeSec),
      elevationGainMeters: elev.gain || snapshot.elevationGainMeters,
      elevationLossMeters: elev.loss || snapshot.elevationLossMeters,
      stepsCount: track?.stepsCount ?? snapshot.stepsCount,
      cadenceSpm: track?.avgCadenceSpm ?? snapshot.cadenceSpm,
      points: route,
      kmIndex: split.kmIndex,
      kmPaceSecPerKm: split.paceSecPerKm,
      lapsCount: laps.length
    };
    setLocked(finalStats);
    setShareStats(finalStats);
    void persistRoute(activity.id, route);
    try {
      await apiPost(`/student/activities/${activity.id}/pause`, { points: route }, session.token);
    } catch {
      /* finish POST ainda grava o trajeto */
    }
    setShareOpen(true);
    setSheet(null);
    setFinishing(false);
    finishingRef.current = false;
    markSessionClosed();
  }

  async function finish(publish = true) {
    if (!activity || (finishing && !shareOpen)) return;
    if (!locked) {
      const route = sanitizeFinishPoints(collectLiveRoute(activity.polyline));
      setLocked(captureLockedMetrics(route));
    }
    setFinishing(true);
    finishingRef.current = true;
    setError(null);
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    try {
      if (trackingEngine.getSession()?.status !== "FINISHED") {
        await trackingEngine.finish();
      }
    } catch {
      /* ignore */
    }
    try {
      await finishRequest(publish);
    } catch (e) {
      // O trajeto já foi gravado no SQLite e enfileirado no outbox pelo engine,
      // então manter `activity` permite repetir o POST sem perder a corrida.
      setError(
        `${e instanceof Error ? e.message : "Falha ao finalizar a atividade."} Toque em finalizar de novo — o trajeto está salvo no aparelho.`
      );
    } finally {
      setFinishing(false);
    }
  }

  async function finishRequest(publish: boolean) {
    if (!activity) return;
    const track = trackingEngine.getLastFinishPayload();
    const route = mergeRoutePoints(
      locked?.points,
      track?.points,
      pointsRef.current,
      bufferRef.current,
      liveMapStore.getPoints(),
      activity.polyline
    );
    if (route.length) hydrateRoute(route);
    const cleanPoints = sanitizeFinishPoints(route);
    await persistRoute(activity.id, cleanPoints);
    const localId = localSessionIdRef.current;
    const trackingMeta = track
      ? compactRecord({
          rawCount: track.rawCount,
          compressedCount: track.compressedCount,
          maskedCount: track.maskedCount,
          h3r9: track.h3r9,
          h3r11: track.h3r11,
          antiCheat: track.antiCheat
            ? {
                ok: Boolean(track.antiCheat.ok),
                flags: Array.isArray(track.antiCheat.flags) ? track.antiCheat.flags : [],
                maxImpliedSpeedMps: track.antiCheat.maxImpliedSpeedMps,
                teleportCount: track.antiCheat.teleportCount,
                spikeCount: track.antiCheat.spikeCount,
                score: track.antiCheat.score
              }
            : undefined,
          privacy: track.privacy,
          distanceM: track.distanceM,
          movingTimeMs: track.movingTimeMs,
          stepsCount:
            typeof track.stepsCount === "number" && Number.isFinite(track.stepsCount)
              ? Math.max(0, Math.round(track.stepsCount))
              : undefined,
          avgCadenceSpm:
            typeof track.avgCadenceSpm === "number" && Number.isFinite(track.avgCadenceSpm)
              ? track.avgCadenceSpm
              : undefined,
          weather: weatherRef.current
            ? {
                tempC: weatherRef.current.tempC,
                code: weatherRef.current.code,
                label: weatherRef.current.label,
                windKmh: weatherRef.current.windKmh,
                humidity: weatherRef.current.humidity,
                capturedAt: weatherRef.current.capturedAt
              }
            : undefined
        })
      : undefined;
    const finishBody = compactRecord({
      caption: publish ? caption.trim() || undefined : undefined,
      photoUrl: publish ? photoUrl : undefined,
      videoUrl: publish ? videoUrl : undefined,
      mapType,
      activityMap,
      layers,
      is3d,
      points: cleanPoints,
      goals: currentGoals(),
      publish,
      trackingMeta
    });
    if (localId) {
      await outboxSync.enqueueFinish(localId, activity.id, {
        points: cleanPoints,
        publish,
        caption: publish ? caption.trim() || undefined : undefined,
        photoUrl: publish ? photoUrl ?? undefined : undefined,
        videoUrl: publish ? videoUrl ?? undefined : undefined,
        compressedCount: track?.compressedCount,
        rawCount: track?.rawCount,
        maskedCount: track?.maskedCount,
        h3r9: track?.h3r9,
        h3r11: track?.h3r11,
        antiCheat: track?.antiCheat
          ? {
              ok: Boolean(track.antiCheat.ok),
              flags: Array.isArray(track.antiCheat.flags) ? track.antiCheat.flags : [],
              maxImpliedSpeedMps: track.antiCheat.maxImpliedSpeedMps,
              teleportCount: track.antiCheat.teleportCount,
              spikeCount: track.antiCheat.spikeCount,
              score: track.antiCheat.score
            }
          : undefined,
        privacy: track?.privacy,
        distanceM: track?.distanceM,
        movingTimeMs: track?.movingTimeMs,
        stepsCount:
          typeof track?.stepsCount === "number" && Number.isFinite(track.stepsCount)
            ? Math.max(0, Math.round(track.stepsCount))
            : undefined,
        avgCadenceSpm:
          typeof track?.avgCadenceSpm === "number" && Number.isFinite(track.avgCadenceSpm)
            ? track.avgCadenceSpm
            : undefined
      });
    }
    const result = await apiPost<{
      activity?: {
        distanceMeters?: number;
        durationSeconds?: number;
        elapsedSeconds?: number;
        avgPaceSecPerKm?: number | null;
        elevationGainMeters?: number;
        elevationLossMeters?: number;
        stepsCount?: number;
        avgCadenceSpm?: number | null;
        estimatedPowerWatts?: number | null;
        calories?: number;
        splits?: Array<{
          km: number;
          paceSecPerKm: number;
          elapsedTime: number;
          distance?: number;
          partial?: boolean;
          elevationDifference?: number;
        }>;
        splitsAnalysis?: {
          bestKm?: number | null;
          worstKm?: number | null;
          bestPaceSecPerKm?: number | null;
          worstPaceSecPerKm?: number | null;
        };
        bestEfforts?: Array<{ label: string; elapsedSeconds: number; paceSecPerKm: number }>;
      };
      segmentEfforts?: Array<{
        segmentId: string;
        name: string;
        elapsedSeconds: number;
        paceSecPerKm: number | null;
        isPr: boolean;
      }>;
      moderation?: {
        published?: boolean;
        blockedByAntiCheat?: boolean;
        quarantine?: boolean;
        message?: string | null;
        antiCheat?: { ok?: boolean; flags?: string[]; score?: number };
      };
    }>(
      `/student/activities/${activity.id}/finish`,
      finishBody,
      session.token
    );
    void outboxSync.flush(session.token);
    void refresh();
    if (result.moderation?.message) {
      setError(result.moderation.message);
    }
    const apiSplits = result.activity?.splits ?? [];
    const localSplits = liveSplit.completed.map((s) => ({
      km: s.km,
      paceSecPerKm: s.paceSecPerKm,
      elapsedTime: s.elapsedTime
    }));
    if (liveSplit.metersInSplit >= 25 && liveSplit.paceSecPerKm) {
      localSplits.push({
        km: liveSplit.kmIndex,
        paceSecPerKm: liveSplit.paceSecPerKm,
        elapsedTime: Math.round((liveSplit.paceSecPerKm * liveSplit.metersInSplit) / 1000)
      });
    }
    const splits = apiSplits.length ? apiSplits : localSplits.length ? localSplits : null;
    setFinishSplits(splits);
    setFinishAnalysis(result.activity?.splitsAnalysis ?? null);
    setBestEfforts(result.activity?.bestEfforts ?? []);
    setSegmentEfforts(result.segmentEfforts ?? []);
    setFinishStats({
      distanceMeters: result.activity?.distanceMeters ?? snap?.distanceM ?? distance,
      elapsedSeconds:
        result.activity?.durationSeconds ??
        result.activity?.elapsedSeconds ??
        elapsed,
      paceSecPerKm: result.activity?.avgPaceSecPerKm ?? snap?.paceSecKm ?? pace,
      elevationGainMeters: result.activity?.elevationGainMeters ?? shareStats?.elevationGainMeters ?? 0,
      elevationLossMeters: result.activity?.elevationLossMeters ?? shareStats?.elevationLossMeters ?? 0,
      stepsCount: result.activity?.stepsCount ?? track?.stepsCount,
      cadenceSpm: result.activity?.avgCadenceSpm ?? track?.avgCadenceSpm,
      powerWatts: result.activity?.estimatedPowerWatts ?? null,
      calories: result.activity?.calories ?? shareStats?.calories
    });
    setPendingFeedNav(Boolean(publish && result.moderation?.published !== false));
    await resetAfterFinish();
  }

  async function resetAfterFinish() {
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    const localId = localSessionIdRef.current ?? trackingEngine.getSession()?.id;
    if (localId) {
      try {
        await trackingEngine.discard(localId);
      } catch {
        /* sessão já encerrada */
      }
    }
    localSessionIdRef.current = null;
    liveBoundRef.current = null;
    bufferRef.current = [];
    lastBoundSeqRef.current = -1;
    clearOrphan();
    setShareOpen(false);
    setShareStats(null);
    setLocked(null);
    setPauseHold(false);
    pauseHoldRef.current = false;
    setFinishing(false);
    finishingRef.current = false;
    markSessionClosed();
    setActivity(null);
    setPoints([]);
    setElapsed(0);
    setLaps([]);
    lapAwayRef.current = false;
    setPickingLapStart(false);
    setPhotoUrl(null);
    setVideoUrl(null);
    setSheet(null);
    clearSessionRoute();
  }

  function dismissFinishSplits(goToFeed = false) {
    const goFeed = goToFeed && pendingFeedNav;
    setFinishSplits(null);
    setFinishAnalysis(null);
    setBestEfforts([]);
    setFinishStats(null);
    setSegmentEfforts([]);
    setPendingFeedNav(false);
    setCaption("");
    setError(null);
    setPauseHold(false);
    pauseHoldRef.current = false;
    setLocked(null);
    setElapsed(0);
    markSessionClosed();
    clearSessionRoute();
    if (goFeed) navigation.navigate("FeedTab", { screen: "Feed" });
  }

  async function openSegmentBoard(seg: { id: string; name: string }) {
    try {
      const data = await apiGet<{
        leaderboard: Array<{ rank: number; name: string; elapsedSeconds: number; isPr: boolean }>;
      }>(`/student/activities/named-segments/${seg.id}/leaderboard`, session.token);
      setSegmentBoard({ name: seg.name, rows: data.leaderboard ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar ranking do segmento.");
    }
  }

  async function createSegmentFromLastTrack() {
    const track = trackingEngine.getLastFinishPayload();
    const poly = (track?.points ?? points).map((p) => ({ lat: p.lat, lng: p.lng }));
    if (poly.length < 2) {
      setError("Precisa de um trajeto com pelo menos 2 pontos para criar o segmento.");
      return;
    }
    try {
      const created = await apiPost<{ segment: { id: string; name: string } }>(
        "/student/activities/named-segments",
        {
          name: `Segmento ${SPORTS.find((s) => s.id === sport)?.label ?? sport}`,
          sport,
          polyline: poly.slice(0, 500)
        },
        session.token
      );
      setNearbySegments((prev) => [
        { id: created.segment.id, name: created.segment.name, distanceMeters: 0, sport },
        ...prev
      ]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar segmento.");
    }
  }

  async function selectSport(next: OutdoorSport) {
    if (running) return;
    setError(null);
    if (next !== sport) {
      clearSessionRoute();
      setLocked(null);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      bufferRef.current = [];
    }
    if (next !== sport && activity) {
      engineUnsubRef.current?.();
      engineUnsubRef.current = null;
      if (localSessionIdRef.current) {
        try { await trackingEngine.discard(localSessionIdRef.current); } catch { /* ignore */ }
        localSessionIdRef.current = null;
      }
      try {
        await apiPost(`/student/activities/${activity.id}/cancel`, {}, session.token);
      } catch {
        // ignore — still switch modality locally
      }
      liveMapStore.clear();
      setActivity(null);
      setPoints([]);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      bufferRef.current = [];
    }
    if (next !== sport) setSport(next);
    await locate();
  }

  function beginPickLapStart() {
    setLapCounterOn(true);
    setSheet(null);
    setPickingLapStart(true);
    setError(null);
  }

  function clearLapStart() {
    setLapMarker(null);
    setLaps([]);
    setLapCounterOn(false);
    setPickingLapStart(false);
    lapAwayRef.current = false;
    lapMaxAwayRef.current = 0;
    autoArmLapRef.current = true;
  }

  return (
    <StudentPage scroll={false}>
      <View style={styles.fill}>
        {orphan ? (
          <View style={styles.orphanBanner}>
            <Text style={styles.orphanText}>
              Sessão local recuperável ({orphan.sport} · {(orphan.distanceM / 1000).toFixed(2)} km). Continuar?
            </Text>
            <View style={styles.orphanActions}>
              <Pressable
                onPress={() => {
                  void (async () => {
                    try {
                    await engine.resumeOrphan(orphan.id);
                    localSessionIdRef.current = orphan.id;
                    if (activity?.id) {
                      await engine.bindServerId(orphan.id, activity.id);
                      liveBoundRef.current = activity.id;
                      bindEngineToUi(activity.id);
                    } else if (orphan.serverId) {
                      liveBoundRef.current = orphan.serverId;
                      bindEngineToUi(orphan.serverId);
                    }
                    clearOrphan();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Falha ao retomar sessão.");
                    }
                  })();
                }}
              >
                <Text style={styles.orphanAction}>Retomar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void (async () => {
                    try {
                      await engine.discard(orphan.id);
                    } catch {
                      // ignore
                    }
                    clearOrphan();
                  })();
                }}
              >
                <Text style={styles.orphanDismiss}>Descartar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.tabs}>
          {SPORTS.map((item) => (
            <Pressable
              key={item.id}
              disabled={running}
              onPress={() => void selectSport(item.id)}
              style={[styles.tab, sport === item.id && styles.tabOn, running && styles.tabDisabled]}
            >
              {item.id === "RUN" ? (
                <RunnerIcon size={14} color={sport === item.id ? "#df663c" : "#605a52"} gender={profile?.gender} />
              ) : (
                <Ionicons name={item.ionicon!} size={14} color={sport === item.id ? "#df663c" : "#605a52"} />
              )}
              <Text style={[styles.tabText, sport === item.id && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.map}>
          <TrackingMap
            followUser={!pickingLapStart}
            pickMode={pickingLapStart}
            lapMarker={lapMarker}
            mapType={nativeMapType(mapType)}
            is3d={is3d}
            compassEnabled={compassOn}
            onMapPress={(coord) => {
              if (!pickingLapStart) return;
              const marker = { lat: coord.lat, lng: coord.lng, radiusMeters: LAP_RADIUS_M };
              setLapMarker(marker);
              setLapCounterOn(true);
              setPickingLapStart(false);
              lapAwayRef.current = false;
            }}
          />
          {weather ? (
            <View style={styles.weatherChip} pointerEvents="box-none">
              <WeatherChip weather={weather} sport={sport} compact />
            </View>
          ) : null}
          {pickingLapStart ? null : (
            <Pressable
              onPress={() => {
                const next = !compassOn;
                setMapCompassEnabled(next);
                setCompassOn(next);
              }}
              style={[styles.compassBtn, compassOn && styles.compassBtnOn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: compassOn }}
              accessibilityLabel={compassOn ? "Desativar bússola e rotação do mapa" : "Ativar bússola e rotação do mapa"}
            >
              <Ionicons name="compass-outline" size={18} color={compassOn ? "#fff" : "#f5f0e8"} />
            </Pressable>
          )}
          {pickingLapStart ? (
            <View style={styles.pickBanner}>
              <Text style={styles.pickBannerText}>Toque no mapa para marcar o ponto de partida da volta</Text>
              <Pressable onPress={() => setPickingLapStart(false)}>
                <Text style={styles.pickCancel}>Cancelar</Text>
              </Pressable>
            </View>
          ) : null}
          {snap?.isAutoPaused || paused ? (
            <View style={styles.mapChip} pointerEvents="none">
              <Text style={styles.mapChipText}>
                {snap?.isAutoPaused ? "Auto-pause" : "Pausado"}
              </Text>
            </View>
          ) : null}
        </View>
        {!running && !paused ? (
          <View style={styles.segmentBanner}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.segmentTitle}>Segmentos próximos</Text>
              <Pressable onPress={() => void createSegmentFromLastTrack()}>
                <Text style={styles.segmentAction}>Criar do trajeto</Text>
              </Pressable>
            </View>
            {nearbySegments.length === 0 ? (
              <Text style={styles.segmentRow}>Nenhum segmento na área. Finalize uma atividade e crie um.</Text>
            ) : (
              nearbySegments.slice(0, 3).map((seg) => (
                <Pressable key={seg.id} onPress={() => void openSegmentBoard(seg)}>
                  <Text style={styles.segmentRow}>
                    {seg.name} · {formatKm(seg.distanceMeters)} km · ranking
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.sport}>{SPORTS.find((item) => item.id === sport)?.label}</Text>
          {weather ? (
            <Text style={styles.weatherLine}>
              {weather.tempC}° · {weather.label} · {weather.advice}
            </Text>
          ) : null}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>Tempo</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {formatClock(shownElapsed)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>
                {sport === "RIDE" ? "Velocidade" : "Ritmo"}
              </Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {sport === "RIDE"
                  ? speedKmh
                    ? `${speedKmh.toFixed(1)}`
                    : "0.0"
                  : formatPace(pace)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>Distância</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {formatKm(distance)}
              </Text>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>{sport === "RIDE" ? "Ritmo" : "Velocidade"}</Text>
              <Text style={styles.statSecondary} numberOfLines={1}>
                {sport === "RIDE" ? formatPace(pace) : speedKmh ? speedKmh.toFixed(1) : "0.0"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>{`Km ${shownKmIndex}`}</Text>
              <Text style={styles.statSecondary} numberOfLines={1}>{formatPace(shownKmPace)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>Voltas</Text>
              <Text style={styles.statSecondary} numberOfLines={1}>{String(shownLaps)}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>kcal</Text>
              <Text style={styles.statSecondary} numberOfLines={1}>{String(calories)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>Elevação</Text>
              <Text style={styles.statSecondary} numberOfLines={1}>{`${Math.round(shownElev)} m`}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel} numberOfLines={1}>
                {sport === "WALK" || sport === "RUN" ? "Passos" : "Cadência"}
              </Text>
              <Text style={styles.statSecondary} numberOfLines={1}>
                {sport === "RIDE"
                  ? shownCadence != null
                    ? String(Math.round(shownCadence))
                    : "—"
                  : shownSteps
                    ? String(shownSteps)
                    : "—"}
              </Text>
            </View>
          </View>
          <View style={styles.controls}>
            <Pressable style={styles.side} onPress={() => setSheet("layers")}>
              <Ionicons name="settings-outline" size={20} color="#15100b" />
            </Pressable>
            <Pressable
              style={styles.play}
              onPress={() => {
                if (shareOpen || finishing) return;
                void (running ? pause() : startOrResume());
              }}
            >
              <Ionicons name={running ? "pause" : "play"} size={28} color="#fff" />
            </Pressable>
            <Pressable style={styles.side} onPress={() => navigation.navigate("PlayTab", { screen: "Play" })}>
              <Ionicons name="musical-notes-outline" size={20} color="#15100b" />
            </Pressable>
          </View>
          {running || paused ? (
            <View style={styles.finishActions}>
              <Pressable style={styles.distance} onPress={() => void beginFinish()}>
                <Text style={styles.distanceText}>Finalizar e compartilhar</Text>
              </Pressable>
              <Pressable style={styles.distanceQuiet} disabled={finishing} onPress={() => void finish(false)}>
                <Text style={styles.distanceQuietText}>
                  {finishing ? "Finalizando..." : "Finalizar sem publicar"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.distance} onPress={() => setSheet("goals")}>
              <Text style={styles.distanceText}>Definir distância</Text>
            </Pressable>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>

      <Modal visible={sheet === "goals"} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Definir</Text>
          <Text style={styles.rowText}>Distância (km)</Text>
          <TextInput value={targetKm} onChangeText={setTargetKm} keyboardType="decimal-pad" placeholder="Ex.: 5" style={styles.field} />
          <Text style={styles.rowText}>Duração</Text>
          <View style={styles.chips}>
            <TextInput value={targetHours} onChangeText={setTargetHours} keyboardType="number-pad" placeholder="Horas" style={[styles.field, { flex: 1 }]} />
            <Text style={styles.sheetTitle}>:</Text>
            <TextInput value={targetMinutes} onChangeText={setTargetMinutes} keyboardType="number-pad" placeholder="Min" style={[styles.field, { flex: 1 }]} />
          </View>
          <Text style={styles.rowText}>Velocidade alvo (km/h)</Text>
          <TextInput value={targetSpeed} onChangeText={setTargetSpeed} keyboardType="decimal-pad" placeholder="Ex.: 10" style={styles.field} />
          <Text style={styles.rowText}>Voltas</Text>
          <Text style={styles.meta}>1. Acione o contador. 2. Selecione no mapa o ponto de partida. 3. Ao voltar nesse ponto, conta 1 volta.</Text>
          <Pressable
            style={[styles.chip, lapCounterOn && styles.chipOn]}
            onPress={() => {
              if (lapCounterOn) clearLapStart();
              else setLapCounterOn(true);
            }}
          >
            <Text style={styles.chipText}>{lapCounterOn ? "Contador de voltas ligado" : "Acionar contador de voltas"}</Text>
          </Pressable>
          {lapCounterOn ? (
            <>
              <Pressable style={[styles.chip, !lapMarker && styles.chipOn]} onPress={beginPickLapStart}>
                <Text style={styles.chipText}>{lapMarker ? "Trocar ponto de partida no mapa" : "Selecionar ponto de partida"}</Text>
              </Pressable>
              <Text style={styles.meta}>
                {lapMarker
                  ? `Ponto de partida marcado · ${laps.length} volta${laps.length === 1 ? "" : "s"}`
                  : "Toque no mapa no local onde a volta deve ser marcada ao retornar."}
              </Text>
            </>
          ) : null}
          <Pressable style={styles.play} onPress={() => setSheet(null)}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>Salvar meta</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={sheet === "layers"} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Tipos de mapa</Text>
          <View style={styles.chips}>
            {(["standard", "satellite", "hybrid", "winter"] as const).map((id) => (
              <Pressable key={id} style={[styles.chip, mapType === id && styles.chipOn]} onPress={() => setMapType(id)}>
                <Text style={styles.chipText}>
                  {id === "standard" ? "Padrão" : id === "satellite" ? "Satélite" : id === "hybrid" ? "Híbrido" : "Inverno"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sheetTitle}>Mapas de atividades</Text>
          <View style={styles.chips}>
            {(["global", "weekly", "night", "personal"] as const).map((id) => (
              <Pressable key={id} style={[styles.chip, activityMap === id && styles.chipOn]} onPress={() => setActivityMap(id)}>
                <Text style={styles.chipText}>
                  {id === "global" ? "Global" : id === "weekly" ? "Semanal" : id === "night" ? "Noturno" : "Pessoal"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sheetTitle}>Camadas</Text>
          {(["pois", "bikeLanes"] as const).map((key) => (
            <Pressable key={key} onPress={() => setLayers((c) => ({ ...c, [key]: !c[key] }))}>
              <Text style={styles.rowText}>{key === "pois" ? "PDIs" : "Ciclovias"} · {layers[key] ? "on" : "off"}</Text>
            </Pressable>
          ))}
          <Text style={styles.sheetTitle}>Terreno</Text>
          {(["avalanche", "slope", "aspect"] as const).map((key) => (
            <Pressable key={key} onPress={() => setLayers((c) => ({ ...c, [key]: !c[key] }))}>
              <Text style={styles.rowText}>
                {key === "avalanche" ? "Inclinação de avalanche" : key === "slope" ? "Inclinação" : "Aspecto"} · {layers[key] ? "on" : "off"}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, is3d && styles.chipOn]} onPress={() => setIs3d((value) => !value)}>
            <Text style={styles.chipText}>{is3d ? "3D ligado" : "Abrir mapa 3D"}</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Bússola</Text>
          <Text style={styles.meta}>
            Magnetômetro e giroscópio giram o mapa na direção que você aponta. Desligue para manter o norte fixo.
          </Text>
          <Pressable
            style={[styles.chip, compassOn && styles.chipOn]}
            onPress={() => {
              const next = !compassOn;
              setMapCompassEnabled(next);
              setCompassOn(next);
            }}
          >
            <Text style={styles.chipText}>{compassOn ? "Bússola e rotação ligadas" : "Bússola e rotação desligadas"}</Text>
          </Pressable>
        </View>
      </Modal>

      {shareOpen && shareStats ? (
        <ActivityShareFlow
          stats={shareStats}
          caption={caption}
          onCaptionChange={setCaption}
          photoUrl={photoUrl}
          onPickPhoto={(fromCamera) => void pick("photo", fromCamera)}
          busy={finishing}
          error={error}
          onPublish={() => void finish(true)}
          onFinishWithoutPublish={() => void finish(false)}
        />
      ) : null}

      <Modal visible={Boolean(finishStats)} animationType="slide" transparent onRequestClose={() => dismissFinishSplits(false)}>
        <Pressable style={styles.backdrop} onPress={() => dismissFinishSplits(false)} />
        <View style={[styles.sheet, { maxHeight: "88%" }]}>
          <Text style={styles.sheetTitle}>Atividade salva</Text>
          {finishStats ? (
            <OutdoorShareCard
              sportLabel={SPORTS.find((item) => item.id === sport)?.label ?? sport}
              distanceMeters={finishStats.distanceMeters}
              elapsedSeconds={finishStats.elapsedSeconds}
              paceSecPerKm={finishStats.paceSecPerKm}
              elevationGainMeters={finishStats.elevationGainMeters}
              elevationLossMeters={finishStats.elevationLossMeters}
              stepsCount={finishStats.stepsCount}
              cadenceSpm={finishStats.cadenceSpm}
              powerWatts={finishStats.powerWatts}
              calories={finishStats.calories}
              caption={caption || null}
              bestEffortLabel={
                bestEfforts[0]
                  ? `${bestEfforts[0].label} · ${formatClock(bestEfforts[0].elapsedSeconds)}`
                  : null
              }
            />
          ) : null}
          {segmentEfforts.length ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.sheetTitle}>Segmentos</Text>
              {segmentEfforts.map((effort) => (
                <Text key={effort.segmentId} style={styles.meta}>
                  {effort.isPr ? "PR · " : ""}
                  {effort.name}: {formatClock(effort.elapsedSeconds)}
                  {effort.paceSecPerKm != null ? ` · ${formatPace(effort.paceSecPerKm)}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
          {finishAnalysis?.bestKm != null ? (
            <Text style={styles.meta}>
              Melhor km {finishAnalysis.bestKm}
              {finishAnalysis.bestPaceSecPerKm != null
                ? ` · ${formatPace(finishAnalysis.bestPaceSecPerKm)}`
                : ""}
              {finishAnalysis.worstKm != null
                ? `  ·  Pior km ${finishAnalysis.worstKm}${
                    finishAnalysis.worstPaceSecPerKm != null
                      ? ` · ${formatPace(finishAnalysis.worstPaceSecPerKm)}`
                      : ""
                  }`
                : ""}
            </Text>
          ) : null}
          {bestEfforts.length ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.sheetTitle}>Best efforts</Text>
              {bestEfforts.map((effort) => (
                <Text key={effort.label} style={styles.meta}>
                  {effort.label}: {formatClock(effort.elapsedSeconds)} · {formatPace(effort.paceSecPerKm)}
                </Text>
              ))}
            </View>
          ) : null}
          {(finishSplits?.length ?? 0) > 0 ? (
            <>
              <Text style={styles.meta}>Splits por km</Text>
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                {(finishSplits ?? []).map((split) => (
                  <View key={`split-${split.km}`} style={styles.splitRow}>
                    <Text style={styles.splitKm}>
                      Km {split.km}
                      {split.partial ? " · parcial" : ""}
                    </Text>
                    <Text style={styles.splitPace}>{formatPace(split.paceSecPerKm)}</Text>
                    <Text style={styles.splitTime}>{formatClock(split.elapsedTime)}</Text>
                    {split.elevationDifference != null ? (
                      <Text style={styles.splitElev}>
                        {split.elevationDifference >= 0 ? "+" : ""}
                        {Math.round(split.elevationDifference)}m
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          <Pressable style={styles.play} onPress={() => dismissFinishSplits(false)}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>Nova atividade</Text>
          </Pressable>
          {pendingFeedNav ? (
            <Pressable style={styles.distance} onPress={() => dismissFinishSplits(true)}>
              <Text style={styles.distanceText}>Ver no Feed</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>

      <Modal visible={Boolean(segmentBoard)} animationType="slide" transparent onRequestClose={() => setSegmentBoard(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSegmentBoard(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{segmentBoard?.name ?? "Ranking"}</Text>
          <Text style={styles.meta}>Melhores tempos neste segmento</Text>
          {(segmentBoard?.rows ?? []).map((row) => (
            <View key={`${row.rank}-${row.name}`} style={styles.splitRow}>
              <Text style={styles.splitKm}>
                #{row.rank} {row.name}
                {row.isPr ? " · PR" : ""}
              </Text>
              <Text style={styles.splitTime}>{formatClock(row.elapsedSeconds)}</Text>
            </View>
          ))}
          {(segmentBoard?.rows.length ?? 0) === 0 ? (
            <Text style={styles.meta}>Ainda sem efforts neste segmento.</Text>
          ) : null}
          <Pressable style={styles.play} onPress={() => setSegmentBoard(null)}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>Fechar</Text>
          </Pressable>
        </View>
      </Modal>
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    fill: { flex: 1 },
    tabs: {
      alignSelf: "center",
      zIndex: 4,
      flexDirection: "row",
      backgroundColor: "rgba(255,255,255,0.94)",
      borderRadius: 999,
      padding: 4,
      gap: 4,
      marginTop: 8,
      marginBottom: 6
    },
    tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
    tabOn: { backgroundColor: "#fff" },
    orphanBanner: {
      marginHorizontal: 12,
      marginTop: 8,
      zIndex: 6,
      backgroundColor: "#1c1916",
      borderRadius: 12,
      padding: 12,
      gap: 8
    },
    orphanText: { color: "#f5f0e8", fontSize: 13, lineHeight: 18 },
    orphanActions: { flexDirection: "row", gap: 16 },
    orphanAction: { color: "#df663c", fontWeight: "700" },
    orphanDismiss: { color: "#a39e96", fontWeight: "600" },
    tabDisabled: { opacity: 0.45 },
    tabText: { color: "#605a52", fontWeight: "800", fontSize: 12 },
    tabTextOn: { color: "#df663c" },
    map: { flex: 1, backgroundColor: "#0b1a12", overflow: "hidden" },
    mapChip: {
      position: "absolute",
      bottom: 10,
      alignSelf: "center",
      backgroundColor: "rgba(21,16,11,0.82)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      zIndex: 5
    },
    mapChipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
    segmentBanner: {
      marginHorizontal: 12,
      marginTop: 8,
      marginBottom: 4,
      padding: 10,
      borderRadius: 12,
      backgroundColor: st.card,
      borderWidth: 1,
      borderColor: st.line,
      gap: 2
    },
    segmentTitle: { color: st.text, fontWeight: "800", fontSize: 12, marginBottom: 2 },
    segmentRow: { color: st.muted, fontSize: 12, paddingVertical: 2 },
    segmentAction: { color: st.gold, fontWeight: "800", fontSize: 12 },
    pickBanner: {
      position: "absolute",
      top: 10,
      left: 12,
      right: 12,
      zIndex: 6,
      backgroundColor: "rgba(21,16,11,0.92)",
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    pickBannerText: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 13 },
    pickCancel: { color: "#fff", fontWeight: "800", fontSize: 12 },
    card: {
      margin: 10,
      backgroundColor: "#fff",
      borderRadius: 28,
      padding: 14,
      gap: 10
    },
    sport: { fontWeight: "800", color: "#15100b" },
    weatherLine: { color: "#605a52", fontSize: 12, fontWeight: "600" },
    weatherChip: { position: "absolute", top: 10, left: 12, zIndex: 5 },
    compassBtn: {
      position: "absolute",
      top: 10,
      right: 12,
      zIndex: 5,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(12,14,18,0.78)",
      alignItems: "center",
      justifyContent: "center"
    },
    compassBtnOn: { backgroundColor: "#df663c" },
    stats: { flexDirection: "row", gap: 4 },
    stat: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 2 },
    statLabel: { color: "#605a52", fontSize: 11, fontWeight: "700", textAlign: "center" },
    statValue: { color: "#15100b", fontSize: 22, fontWeight: "800", textAlign: "center" },
    statSecondary: { color: "#15100b", fontSize: 16, fontWeight: "800", textAlign: "center" },
    controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
    side: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(21,16,11,0.12)", alignItems: "center", justifyContent: "center" },
    play: { minWidth: 76, height: 76, borderRadius: 38, backgroundColor: "#df663c", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
    distance: { alignSelf: "center", borderWidth: 1, borderColor: "rgba(21,16,11,0.12)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
    distanceText: { fontWeight: "800", fontSize: 12, color: "#15100b" },
    finishActions: { alignItems: "center", gap: 8 },
    distanceQuiet: { alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4 },
    distanceQuietText: { fontWeight: "700", fontSize: 12, color: "#605a52" },
    error: { color: st.danger, textAlign: "center" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: { backgroundColor: st.card, padding: 16, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    sheetTitle: { color: st.text, fontWeight: "800" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: st.fill },
    chipOn: { backgroundColor: "#f2b461" },
    chipText: { color: st.text, fontWeight: "800", fontSize: 12 },
    rowText: { color: st.text, paddingVertical: 6 },
    input: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, color: st.text, minHeight: 70 },
    field: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, color: st.text, backgroundColor: st.inputBg },
    meta: { color: st.muted, fontSize: 13, lineHeight: 18 },
    splitRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: st.line
    },
    splitKm: { flex: 1.2, color: st.text, fontWeight: "700", fontSize: 13 },
    splitPace: { flex: 1, textAlign: "center", color: st.text, fontWeight: "800", fontSize: 15 },
    splitTime: { flex: 0.9, textAlign: "right", color: st.muted, fontWeight: "600", fontSize: 12 },
    splitElev: { width: 44, textAlign: "right", color: st.muted, fontWeight: "600", fontSize: 11 }
  });
}
