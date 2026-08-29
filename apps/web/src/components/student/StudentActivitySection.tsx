import {
  Bike,
  Camera,
  ChevronDown,
  Flag,
  Footprints,
  Gauge,
  ImagePlus,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPinned,
  Music2,
  Pause,
  Play,
  Settings2,
  Share2,
  Timer,
  Trophy,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiUpload } from "../../api";
import { fetchWeather, fetchWeatherHere, type WeatherSnapshot } from "../../lib/weather";
import { StudentWeatherChip } from "./StudentWeatherChip";
import {
  estimateCalories,
  formatClock,
  formatKm,
  formatPace,
  liveDistance,
  liveElapsedSeconds,
  liveElevation,
  liveKmSplit,
  liveSpeedKmh,
  LAP_RADIUS_M,
  updateLapCrossing
} from "../../lib/activity-geo";
import { activityMapSrc, mapsConfigMessage } from "../../lib/activity-map-src";
import { WebGpsPipeline, fixFromGeolocation } from "../../lib/gps-filter";
import type { OutdoorActivityRow, OutdoorSport, UploadResponse } from "../../types";
import { RunnerIcon } from "../shared/RunnerIcon";

type MapType = "standard" | "satellite" | "hybrid" | "winter";
type ActivityMap = "global" | "weekly" | "night" | "personal";
type LayerKey = "pois" | "bikeLanes" | "avalanche" | "slope" | "aspect";

const SPORTS: Array<{ id: OutdoorSport; label: string; Icon: typeof Footprints }> = [
  { id: "RUN", label: "Corrida", Icon: Footprints },
  { id: "WALK", label: "Caminhada", Icon: Footprints },
  { id: "RIDE", label: "Ciclismo", Icon: Bike }
];

const MAP_TYPES: Array<{ id: MapType; label: string }> = [
  { id: "standard", label: "Padrão" },
  { id: "satellite", label: "Satélite" },
  { id: "hybrid", label: "Híbrido" },
  { id: "winter", label: "Inverno" }
];

const ACTIVITY_MAPS: Array<{ id: ActivityMap; label: string }> = [
  { id: "global", label: "Global" },
  { id: "weekly", label: "Semanal" },
  { id: "night", label: "Noturno" },
  { id: "personal", label: "Pessoal" }
];

const LAYER_ITEMS: Array<{ id: LayerKey; group: string; label: string }> = [
  { id: "pois", group: "Camadas", label: "PDIs" },
  { id: "bikeLanes", group: "Camadas", label: "Ciclovias" },
  { id: "avalanche", group: "Terreno", label: "Inclinação de avalanche" },
  { id: "slope", group: "Terreno", label: "Inclinação" },
  { id: "aspect", group: "Terreno", label: "Aspecto" }
];

type GpsPoint = { lat: number; lng: number; t: number; ele?: number | null; accuracy?: number | null };

type ActivityShareStats = {
  sportLabel: string;
  sport: OutdoorSport;
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecPerKm: number | null;
  speedKmh?: number | null;
  calories?: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  stepsCount?: number;
  cadenceSpm?: number | null;
  powerWatts?: number | null;
  mapType?: MapType;
  is3d?: boolean;
  lapsCount?: number;
  kmIndex?: number;
  kmPaceSecPerKm?: number | null;
  points: Array<{ lat: number; lng: number }>;
};

type FinishResult = {
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
    polyline?: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>;
    roadMatched?: boolean;
    matchConfidence?: number | null;
    splits?: Array<{ km: number; paceSecPerKm: number; elapsedTime: number; partial?: boolean }>;
    splitsAnalysis?: {
      bestKm?: number | null;
      worstKm?: number | null;
      bestPaceSecPerKm?: number | null;
      worstPaceSecPerKm?: number | null;
    };
    bestEfforts?: Array<{ label: string; elapsedSeconds: number; paceSecPerKm: number }>;
  };
  moderation?: { published?: boolean; message?: string | null };
};

function compactRecord<T extends Record<string, unknown>>(value: T) {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === "") continue;
    next[key] = item;
  }
  return next;
}

function mergeRoutePoints(
  ...sources: Array<Array<{ lat: number; lng: number; t?: number; ele?: number | null; accuracy?: number | null }> | null | undefined>
): GpsPoint[] {
  const byT = new Map<number, GpsPoint>();
  for (const src of sources) {
    for (const point of src ?? []) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      const t = Number(point.t);
      if (!Number.isFinite(t)) continue;
      if (!byT.has(t)) {
        byT.set(t, { lat: point.lat, lng: point.lng, t, ele: point.ele, accuracy: point.accuracy });
      }
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}
type LapMarker = { lat: number; lng: number; radiusMeters?: number };
type LapRecord = { index: number; lat: number; lng: number; t: number; distanceMeters: number };

const ACTIVITY_MAP_SRC = activityMapSrc();
const LAST_GPS_KEY = "apptreino.lastGps";
const LAST_GPS_MAX_AGE_MS = 30 * 60 * 1000;

function readStoredFix(): { lat: number; lng: number } | null {
  try {
    const raw = sessionStorage.getItem(LAST_GPS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; t?: number };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    const t = Number(parsed.t);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Number.isFinite(t) && Date.now() - t > LAST_GPS_MAX_AGE_MS) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function persistFix(lat: number, lng: number) {
  try {
    sessionStorage.setItem(LAST_GPS_KEY, JSON.stringify({ lat, lng, t: Date.now() }));
  } catch {
    /* ignore quota / private mode */
  }
}

function durationSeconds(hours: string, minutes: string) {
  const h = Number(hours);
  const m = Number(minutes);
  const total = (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
  return total > 0 ? total : undefined;
}

function sampleTrack(points: GpsPoint[], max = 96): GpsPoint[] {
  if (points.length <= max) return points;
  const out: GpsPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

function composeDisplay(matched: GpsPoint[] | null, raw: GpsPoint[]): GpsPoint[] {
  if (!matched?.length) return raw;
  const lastT = matched[matched.length - 1].t;
  const extra = raw.filter((point) => point.t > lastT).slice(-5);
  return extra.length ? [...matched, ...extra] : matched;
}

export function StudentActivitySection({
  token,
  onOpenPlay,
  onPublished,
  preferredSport = "RUN",
  preferredSportKey = 0,
  athleteGender,
  weightKg = 70
}: {
  token: string;
  onOpenPlay: () => void;
  onPublished: () => void;
  preferredSport?: OutdoorSport;
  preferredSportKey?: number;
  athleteGender?: "MALE" | "FEMALE" | null;
  weightKg?: number | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const watchRef = useRef<number | null>(null);
  const idleWatchRef = useRef<number | null>(null);
  const bufferRef = useRef<GpsPoint[]>([]);
  const pipelineRef = useRef(new WebGpsPipeline());
  const followMapRef = useRef(true);
  const lapAwayRef = useRef(false);
  const lapMarkerRef = useRef<LapMarker | null>(null);
  const pauseHoldRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const shareOpenRef = useRef(false);
  const finishingRef = useRef(false);
  const liveHydrateGen = useRef(0);
  const lastTrackRef = useRef<GpsPoint[]>([]);
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(readStoredFix());
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lastMatchedRef = useRef<GpsPoint[] | null>(null);
  const reviewTrackRef = useRef<GpsPoint[] | null>(null);
  const matchBusyRef = useRef(false);
  const pointsRef = useRef<GpsPoint[]>([]);
  const activityIdRef = useRef<string | null>(null);
  const [sport, setSport] = useState<OutdoorSport>(preferredSport);
  const sportRef = useRef(sport);
  sportRef.current = sport;
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [activityMap, setActivityMap] = useState<ActivityMap>("personal");
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    pois: true,
    bikeLanes: false,
    avalanche: false,
    slope: false,
    aspect: false
  });
  const [is3d, setIs3d] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
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
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStats, setShareStats] = useState<ActivityShareStats | null>(null);
  const [locked, setLocked] = useState<ActivityShareStats | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [pauseHold, setPauseHold] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [shareModel, setShareModel] = useState<"simple" | "photo" | null>(null);
  const [finishStats, setFinishStats] = useState<ActivityShareStats | null>(null);
  const [finishSplits, setFinishSplits] = useState<Array<{ km: number; paceSecPerKm: number; elapsedTime: number; partial?: boolean }> | null>(null);
  const [finishAnalysis, setFinishAnalysis] = useState<{
    bestKm?: number | null;
    worstKm?: number | null;
    bestPaceSecPerKm?: number | null;
    worstPaceSecPerKm?: number | null;
  } | null>(null);
  const [bestEfforts, setBestEfforts] = useState<Array<{ label: string; elapsedSeconds: number; paceSecPerKm: number }>>([]);
  const [pendingFeedNav, setPendingFeedNav] = useState(false);
  const [nearbySegments, setNearbySegments] = useState<Array<{ id: string; name: string; distanceMeters: number; sport: string }>>([]);
  const [segmentBoard, setSegmentBoard] = useState<{
    name: string;
    rows: Array<{ rank: number; name: string; elapsedSeconds: number; isPr: boolean }>;
  } | null>(null);
  const [caption, setCaption] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const weatherRef = useRef<WeatherSnapshot | null>(null);
  const [roadMatched, setRoadMatched] = useState(false);
  const athleteKg = weightKg && weightKg > 30 && weightKg < 250 ? weightKg : 70;

  const sessionActive = Boolean(
    !sessionClosed && activity && (activity.status === "LIVE" || activity.status === "PAUSED")
  );
  const running = sessionActive && !pauseHold && activity?.status === "LIVE";
  const paused = sessionActive && (pauseHold || activity?.status === "PAUSED");
  const liveDistanceM = sessionActive ? liveDistance(points) : 0;
  const livePace =
    sessionActive && liveDistanceM >= 20 && elapsed > 0 ? elapsed / (liveDistanceM / 1000) : null;
  const liveSpeed = sessionActive ? liveSpeedKmh(points) : 0;
  const elevation = sessionActive ? liveElevation(points) : { gain: 0, loss: 0 };
  const liveCalories = sessionActive ? estimateCalories(sport, elapsed, athleteKg) : 0;
  const liveSplit = sessionActive
    ? liveKmSplit(points)
    : { kmIndex: 1, metersInSplit: 0, paceSecPerKm: null, completed: [] as Array<{ km: number; paceSecPerKm: number; elapsedTime: number }> };
  const distance = sessionActive ? locked?.distanceMeters ?? liveDistanceM : 0;
  const pace = sessionActive ? locked?.paceSecPerKm ?? livePace : null;
  const speedKmh = sessionActive ? locked?.speedKmh ?? liveSpeed : 0;
  const calories = sessionActive ? locked?.calories ?? liveCalories : 0;
  const shownElapsed = sessionActive ? locked?.elapsedSeconds ?? elapsed : 0;
  const shownElev = sessionActive ? locked?.elevationGainMeters ?? elevation.gain : 0;
  const shownLaps = sessionActive ? locked?.lapsCount ?? laps.length : 0;
  const shownKmIndex = sessionActive ? locked?.kmIndex ?? liveSplit.kmIndex : 1;
  const shownKmPace = sessionActive ? locked?.kmPaceSecPerKm ?? liveSplit.paceSecPerKm : null;
  const targetDuration = durationSeconds(targetHours, targetMinutes);
  const parsedKm = Number(targetKm.replace(",", "."));
  pointsRef.current = points;
  activityIdRef.current = activity?.id ?? null;
  lapMarkerRef.current = lapCounterOn ? lapMarker : null;
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

  useEffect(() => {
    if (running || paused) return;
    if (sport !== preferredSport) setSport(preferredSport);
    locate(true);
  }, [preferredSportKey, preferredSport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchWeatherHere(sport).then((snap) => {
      if (!snap) return;
      weatherRef.current = snap;
      setWeather(snap);
    });
  }, [sport]);

  function currentGoals() {
    const parsedSpeed = Number(targetSpeed.replace(",", "."));
    return {
      distanceKm: Number.isFinite(parsedKm) && parsedKm > 0 ? Math.min(parsedKm, 200) : undefined,
      durationSeconds: targetDuration,
      speedKmh: Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? Math.min(parsedSpeed, 80) : undefined,
      lapRadiusMeters: LAP_RADIUS_M,
      lapCounterOn,
      lapMarker: lapCounterOn ? lapMarker : null,
      laps: lapCounterOn ? laps : []
    };
  }

  function postToMap(msg: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  function pushChromeInset() {
    postToMap({ type: "resize" });
    const iframe = iframeRef.current;
    const dock = dockRef.current;
    let bottom = 240;
    if (iframe && dock) {
      const mapRect = iframe.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      bottom = Math.max(120, Math.round(mapRect.bottom - dockRect.top) + 24);
    } else if (dock) {
      bottom = Math.round(dock.getBoundingClientRect().height) + 24;
    }
    postToMap({ type: "setChromeInset", bottom });
  }

  function paintTrack(route: GpsPoint[], fit = false) {
    postToMap({ type: "setTrack", points: composeDisplay(lastMatchedRef.current, route), fit });
  }

  function pushMapsConfig() {
    const config = mapsConfigMessage();
    if (!config) return;
    postToMap(config);
  }

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const type = event.data?.type;
      if (type === "ready") {
        pushMapsConfig();
        postToMap({ type: "setMapType", mapType });
        postToMap({ type: "setActivityMap", mode: activityMap });
        postToMap({ type: "setLayers", layers });
        postToMap({ type: "set3d", on: is3d });
        postToMap({ type: "setFollow", on: followMapRef.current });
        postToMap({ type: "setHeat", tracks: [], cells: [] });
        const review = reviewTrackRef.current;
        if (running || paused) {
          if (points.length) paintTrack(points, !running);
        } else if (review && review.length > 1) {
          postToMap({ type: "setFollow", on: false });
          postToMap({ type: "setTrack", points: review, fit: true });
        } else {
          postToMap({ type: "setTrack", points: [], fit: false });
        }
        if (lapCounterOn && lapMarker) postToMap({ type: "setLapMarker", marker: lapMarker });
        if (laps.length) postToMap({ type: "setLaps", laps });
        postToMap({ type: "setPickMode", on: pickingLapStart });
        pushChromeInset();
        if (!(review && review.length > 1)) {
          const cached = lastFixRef.current ?? readStoredFix();
          if (cached) {
            postToMap({ type: "setLive", lat: cached.lat, lng: cached.lng, follow: true });
            postToMap({ type: "setView", lat: cached.lat, lng: cached.lng, zoom: 18 });
          }
          locate(true);
        }
      }
      if (type === "open-layers") setLayersOpen(true);
      if (type === "toggle-3d") setIs3d(Boolean(event.data.on));
      if (type === "user-pan") followMapRef.current = false;
      if (type === "locate-request" || type === "geo-error") {
        followMapRef.current = true;
        locate(true);
      }
      if (type === "map-pick" && event.data.kind === "lap-start") {
        const marker = {
          lat: Number(event.data.lat),
          lng: Number(event.data.lng),
          radiusMeters: LAP_RADIUS_M
        };
        setLapMarker(marker);
        setLapCounterOn(true);
        setPickingLapStart(false);
        lapAwayRef.current = false;
        postToMap({ type: "setLapMarker", marker });
        postToMap({ type: "setView", lat: marker.lat, lng: marker.lng, zoom: 18 });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  useEffect(() => {
    const gen = ++liveHydrateGen.current;
    void apiGet<{ activity: OutdoorActivityRow | null }>("/student/activities/live", token)
      .then((data) => {
        if (gen !== liveHydrateGen.current || sessionClosedRef.current) return;
        if (!data.activity) return;
        if (data.activity.status !== "LIVE" && data.activity.status !== "PAUSED") return;
        setActivity(data.activity);
        setSport(data.activity.sport);
        const recovered = Array.isArray(data.activity.polyline)
          ? data.activity.polyline.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              t: p.t ?? Date.now(),
              ele: p.ele,
              accuracy: (p as { accuracy?: number | null }).accuracy ?? null
            }))
          : [];
        setPoints(recovered);
        if (recovered.length) {
          const last = recovered[recovered.length - 1];
          pipelineRef.current.warmStart(last.lat, last.lng, last.t);
        } else {
          pipelineRef.current.reset();
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
          lapAwayRef.current = false;
        }
        if (goals?.laps) setLaps(goals.laps);
        if (data.activity.status === "LIVE") {
          startWatch(data.activity.id);
        }
      })
      .catch(() => undefined);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    postToMap({ type: "setMapType", mapType });
  }, [mapType]);
  useEffect(() => {
    const mapEl = iframeRef.current?.parentElement;
    const dockEl = dockRef.current;
    const push = () => pushChromeInset();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(push) : null;
    if (ro && mapEl) ro.observe(mapEl);
    if (ro && dockEl) ro.observe(dockEl);
    window.addEventListener("resize", push);
    window.visualViewport?.addEventListener("resize", push);
    push();
    const raf = window.requestAnimationFrame(push);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", push);
      window.visualViewport?.removeEventListener("resize", push);
      window.cancelAnimationFrame(raf);
    };
  }, [running, paused]);
  useEffect(() => {
    postToMap({ type: "setActivityMap", mode: activityMap });
    postToMap({ type: "setHeat", tracks: [], cells: [] });
  }, [activityMap]);
  useEffect(() => {
    postToMap({ type: "setLayers", layers });
  }, [layers]);
  useEffect(() => {
    postToMap({ type: "set3d", on: is3d });
  }, [is3d]);
  useEffect(() => {
    if (running || paused) {
      paintTrack(points, !running && !paused);
      return;
    }
    const review = reviewTrackRef.current;
    if (review && review.length > 1) {
      postToMap({ type: "setFollow", on: false });
      postToMap({ type: "setTrack", points: review, fit: true });
      return;
    }
    postToMap({ type: "setTrack", points: [], fit: false });
  }, [points, running, paused]);
  useEffect(() => {
    postToMap({ type: "setLapMarker", marker: lapCounterOn ? lapMarker : null });
  }, [lapMarker, lapCounterOn]);
  useEffect(() => {
    postToMap({ type: "setLaps", laps: lapCounterOn ? laps : [] });
  }, [laps, lapCounterOn]);
  useEffect(() => {
    postToMap({ type: "setPickMode", on: pickingLapStart });
    postToMap({ type: "setFollow", on: !pickingLapStart });
    if (pickingLapStart) followMapRef.current = false;
  }, [pickingLapStart]);

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
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, paused, activity, locked]);

  function applyUserFix(lat: number, lng: number, follow: boolean) {
    lastFixRef.current = { lat, lng };
    persistFix(lat, lng);
    if (follow) {
      followMapRef.current = true;
      postToMap({ type: "setFollow", on: true });
    }
    postToMap({ type: "setLive", lat, lng, follow: follow || followMapRef.current });
    if (follow) postToMap({ type: "setView", lat, lng, zoom: 18 });
  }

  function refreshAroundFix(lat: number, lng: number) {
    void fetchWeather(lat, lng, sportRef.current).then((snap) => {
      if (!snap) return;
      weatherRef.current = snap;
      setWeather(snap);
    });
    void apiGet<{
      segments: Array<{ id: string; name: string; distanceMeters: number; sport: string }>;
    }>(
      `/student/activities/named-segments/nearby?lat=${lat}&lng=${lng}&sport=${sportRef.current}&limit=5`,
      token
    )
      .then((data) => setNearbySegments(data.segments ?? []))
      .catch(() => setNearbySegments([]));
  }

  function locate(follow = false) {
    if (follow) {
      followMapRef.current = true;
      postToMap({ type: "setFollow", on: true });
    }
    const cached = lastFixRef.current ?? readStoredFix();
    if (cached) applyUserFix(cached.lat, cached.lng, follow);

    if (!navigator.geolocation) {
      if (!cached) setError("GPS indisponível neste dispositivo.");
      return;
    }

    const onOk = (pos: GeolocationPosition) => {
      setError(null);
      const fix = fixFromGeolocation(pos);
      applyUserFix(fix.lat, fix.lng, follow);
      refreshAroundFix(fix.lat, fix.lng);
    };

    const onErr = (err: GeolocationPositionError) => {
      if (cached) return;
      if (err.code === err.PERMISSION_DENIED) {
        setError("Permita a localização para o mapa encontrar você.");
        return;
      }
      setError("Não foi possível obter sua localização. Toque no botão de centralizar.");
    };

    navigator.geolocation.getCurrentPosition(onOk, () => {
      navigator.geolocation.getCurrentPosition(onOk, onErr, {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0
      });
    }, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 0
    });
  }

  function stopIdleWatch() {
    if (idleWatchRef.current != null) {
      navigator.geolocation.clearWatch(idleWatchRef.current);
      idleWatchRef.current = null;
    }
  }

  function startIdleWatch() {
    if (!navigator.geolocation || idleWatchRef.current != null || watchRef.current != null) return;
    idleWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (watchRef.current != null) return;
        if (reviewTrackRef.current && reviewTrackRef.current.length > 1) return;
        const fix = fixFromGeolocation(pos);
        applyUserFix(fix.lat, fix.lng, followMapRef.current);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED && !lastFixRef.current) {
          setError("Permita a localização para o mapa encontrar você.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
  }

  function stopWatch() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }

  async function flushPoints(id: string, extra: GpsPoint[] = []) {
    const batch = [...bufferRef.current, ...extra];
    if (!batch.length) return;
    bufferRef.current = [];
    try {
      for (let i = 0; i < batch.length; i += 200) {
        await apiPost(`/student/activities/${id}/points`, { points: batch.slice(i, i + 200) }, token);
      }
    } catch (err) {
      bufferRef.current = [...batch, ...bufferRef.current];
      throw err;
    }
  }

  async function persistRoute(id: string) {
    const batch = mergeRoutePoints(points, bufferRef.current);
    bufferRef.current = [];
    if (!batch.length) return batch;
    for (let i = 0; i < batch.length; i += 200) {
      try {
        await apiPost(`/student/activities/${id}/points`, { points: batch.slice(i, i + 200) }, token);
      } catch {
        /* o pause/finish ainda envia o lote completo */
      }
    }
    return batch;
  }

  async function matchRoadsLive() {
    if (matchBusyRef.current || pauseHoldRef.current || finishingRef.current || sessionClosedRef.current) return;
    const route = pointsRef.current;
    if (route.length < 8) return;
    matchBusyRef.current = true;
    try {
      const data = await apiPost<{
        matched?: boolean;
        points?: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>;
      }>("/student/activities/match-roads", { sport: sportRef.current, points: sampleTrack(route, 96) }, token);
      if (!data.matched || !Array.isArray(data.points) || data.points.length < 2) return;
      lastMatchedRef.current = data.points.map((point) => ({
        lat: point.lat,
        lng: point.lng,
        t: point.t ?? Date.now(),
        ele: point.ele,
        accuracy: 8
      }));
      setRoadMatched(true);
      paintTrack(pointsRef.current, false);
    } catch {
      /* matching é best-effort — o finish ainda tenta de novo */
    } finally {
      matchBusyRef.current = false;
    }
  }

  function applyTrack(route: GpsPoint[], fit = false) {
    setPoints(route);
    if (!route.length) {
      pipelineRef.current.reset();
      lastMatchedRef.current = null;
      setRoadMatched(false);
      postToMap({ type: "setTrack", points: [], fit });
      return;
    }
    const last = route[route.length - 1];
    pipelineRef.current.warmStart(last.lat, last.lng, last.t);
    paintTrack(route, fit);
    postToMap({ type: "setLive", lat: last.lat, lng: last.lng, follow: followMapRef.current });
  }

  function startWatch(id: string) {
    stopIdleWatch();
    stopWatch();
    if (!navigator.geolocation) return;
    followMapRef.current = true;
    postToMap({ type: "setFollow", on: true });
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pauseHoldRef.current || sessionClosedRef.current || shareOpenRef.current || finishingRef.current) return;
        const raw = fixFromGeolocation(pos);
        const result = pipelineRef.current.process(sportRef.current, raw);
        if (!result.accepted) return;

        const point: GpsPoint = {
          lat: result.point.lat,
          lng: result.point.lng,
          t: result.point.t,
          ele: result.point.ele,
          accuracy: result.point.accuracy
        };
        bufferRef.current.push(point);
        setPoints((current) => {
          const next = [...current, point];
          postToMap({
            type: "setLive",
            lat: point.lat,
            lng: point.lng,
            follow: followMapRef.current
          });
          paintTrack(next, false);
          if (lapMarkerRef.current) {
            const crossing = updateLapCrossing(lapMarkerRef.current, point, { away: lapAwayRef.current, count: 0 });
            lapAwayRef.current = crossing.away;
            if (crossing.completed) {
              const dist = liveDistance(next);
              setLaps((currentLaps) => {
                const record: LapRecord = {
                  index: currentLaps.length + 1,
                  lat: point.lat,
                  lng: point.lng,
                  t: point.t,
                  distanceMeters: dist
                };
                const nextLaps = [...currentLaps, record];
                postToMap({ type: "setLaps", laps: nextLaps });
                void apiPost(
                  `/student/activities/${id}/goals`,
                  {
                    goals: {
                      distanceKm: Number.isFinite(parsedKm) && parsedKm > 0 ? parsedKm : undefined,
                      durationSeconds: targetDuration,
                      speedKmh: Number(targetSpeed.replace(",", ".")) || undefined,
                      lapRadiusMeters: LAP_RADIUS_M,
                      lapMarker: lapMarkerRef.current,
                      laps: nextLaps
                    }
                  },
                  token
                );
                return nextLaps;
              });
            }
          }
          return next;
        });
        if (bufferRef.current.length >= 8) void flushPoints(id);
      },
      () => setError("Não foi possível acompanhar o GPS."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  useEffect(() => () => {
    stopWatch();
    stopIdleWatch();
  }, []);

  useEffect(() => {
    if (running || paused || finishStats) {
      stopIdleWatch();
      return;
    }
    locate(true);
    startIdleWatch();
    return () => stopIdleWatch();
  }, [running, paused, finishStats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    async function requestWake() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        if (!running || !nav.wakeLock) return;
        const lock = await nav.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        wakeLockRef.current = lock;
      } catch {
        /* sem permissão / desktop sem Wake Lock */
      }
    }
    if (!running) {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }
    void requestWake();
    const onVis = () => {
      if (document.visibilityState === "visible") void requestWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [running]);

  useEffect(() => {
    if (!running || !activity) return;
    const timer = window.setInterval(() => {
      if (bufferRef.current.length) void flushPoints(activity.id);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [running, activity?.id]);

  useEffect(() => {
    const flushHidden = () => {
      const id = activityIdRef.current;
      if (!id || !bufferRef.current.length) return;
      void flushPoints(id);
    };
    const onHide = () => flushHidden();
    const onVis = () => {
      if (document.visibilityState === "hidden") flushHidden();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void matchRoadsLive(), 8000);
    return () => window.clearInterval(timer);
  }, [running, token]);

  function captureLockedMetrics(route: GpsPoint[]): ActivityShareStats {
    const dist = liveDistance(route);
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
    const paceSec = dist >= 20 && timeSec > 0 ? timeSec / (dist / 1000) : livePace;
    return {
      sportLabel: SPORTS.find((item) => item.id === sport)?.label ?? sport,
      sport,
      distanceMeters: dist,
      elapsedSeconds: timeSec,
      paceSecPerKm: paceSec,
      speedKmh: liveSpeedKmh(route),
      calories: estimateCalories(sport, timeSec, athleteKg),
      elevationGainMeters: elev.gain,
      elevationLossMeters: elev.loss,
      mapType,
      is3d,
      points: route,
      lapsCount: laps.length,
      kmIndex: split.kmIndex,
      kmPaceSecPerKm: split.paceSecPerKm
    };
  }

  function paintFinishedTrack(route: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>) {
    const review: GpsPoint[] = route
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point, index) => ({
        lat: point.lat,
        lng: point.lng,
        t: Number.isFinite(point.t) ? Number(point.t) : index,
        ele: point.ele ?? null
      }));
    reviewTrackRef.current = review;
    followMapRef.current = false;
    postToMap({ type: "setFollow", on: false });
    postToMap({ type: "setTrack", points: review, fit: review.length > 1 });
  }

  function clearSessionRoute() {
    bufferRef.current = [];
    lastMatchedRef.current = null;
    reviewTrackRef.current = null;
    setRoadMatched(false);
    setPoints([]);
    pipelineRef.current.reset();
    postToMap({ type: "setTrack", points: [], fit: false });
    postToMap({ type: "setHeat", tracks: [], cells: [] });
  }

  async function startOrResume() {
    if (shareOpen || finishing) return;
    setError(null);
    setBusy(true);
    setLocked(null);
    try {
      const startFresh = sessionClosedRef.current;
      if (startFresh) {
        const leftover = activity;
        markSessionOpen();
        stopWatch();
        if (leftover) {
          try {
            await apiPost(`/student/activities/${leftover.id}/cancel`, {}, token);
          } catch {
            /* já finalizada */
          }
          setActivity(null);
        }
        clearSessionRoute();
      } else if (paused && activity) {
        setPauseHold(false);
        pauseHoldRef.current = false;
        try {
          const data = await apiPost<{ activity: OutdoorActivityRow }>(
            `/student/activities/${activity.id}/resume`,
            {},
            token
          );
          setActivity(data.activity);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (!/não está pausada|already|409/i.test(msg)) {
            setPauseHold(true);
            pauseHoldRef.current = true;
            setError(err instanceof Error ? err.message : "Não foi possível retomar.");
            return;
          }
        }
        if (points.length) {
          const last = points[points.length - 1];
          pipelineRef.current.warmStart(last.lat, last.lng, last.t);
        } else {
          pipelineRef.current.reset();
        }
        startWatch(activity.id);
        return;
      }
      setPauseHold(false);
      pauseHoldRef.current = false;
      const goals = currentGoals();
      const data = await apiPost<{ activity: OutdoorActivityRow; resumed?: boolean }>(
        "/student/activities",
        {
          sport,
          mapType,
          activityMap,
          layers,
          is3d,
          targetDistanceMeters: goals.distanceKm ? goals.distanceKm * 1000 : undefined,
          goals
        },
        token
      );
      markSessionOpen();
      setActivity(data.activity);
      const recovered = Array.isArray(data.activity.polyline)
        ? data.activity.polyline.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            t: p.t ?? Date.now(),
            ele: p.ele,
            accuracy: (p as { accuracy?: number | null }).accuracy ?? null
          }))
        : [];
      const isResume = !startFresh && Boolean(data.resumed) && data.activity.sport === sport;
      applyTrack(isResume ? recovered : [], false);
      startWatch(data.activity.id);
      locate(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a atividade.");
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    if (!activity && !points.length) return;
    if (pauseHold && activity?.status === "PAUSED") return;
    setPauseHold(true);
    pauseHoldRef.current = true;
    setError(null);
    stopWatch();
    const pausedAtIso = new Date().toISOString();
    setActivity((current) =>
      current ? { ...current, status: "PAUSED", pausedAt: current.pausedAt ?? pausedAtIso } : current
    );
    const route = mergeRoutePoints(points, bufferRef.current);
    const snapshot = captureLockedMetrics(route);
    setLocked(snapshot);
    setElapsed(snapshot.elapsedSeconds);
    if (route.length) applyTrack(route, false);
    if (!activity) return;
    try {
      await persistRoute(activity.id);
    } catch {
      /* polyline fica no estado local e vai no finish */
    }
    try {
      const data = await apiPost<{ activity: OutdoorActivityRow }>(
        `/student/activities/${activity.id}/pause`,
        { points: route },
        token
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

  async function beginFinish() {
    if (!activity || shareOpen) return;
    setFinishing(true);
    finishingRef.current = true;
    setPauseHold(true);
    pauseHoldRef.current = true;
    setError(null);
    stopWatch();
    const pausedAtIso = new Date().toISOString();
    setActivity((current) =>
      current
        ? { ...current, status: current.status === "COMPLETED" ? current.status : "PAUSED", pausedAt: current.pausedAt ?? pausedAtIso }
        : current
    );
    const route = mergeRoutePoints(points, bufferRef.current);
    const snapshot = captureLockedMetrics(route);
    setLocked(snapshot);
    setElapsed(snapshot.elapsedSeconds);
    if (route.length) applyTrack(route, false);
    lastTrackRef.current = route;
    try {
      await persistRoute(activity.id);
    } catch {
      /* finish POST ainda grava o trajeto */
    }
    try {
      await apiPost(`/student/activities/${activity.id}/pause`, { points: route }, token);
    } catch {
      /* ignore */
    }
    setShareStats({ ...snapshot, points: route });
    setShareModel(null);
    setShareOpen(true);
    shareOpenRef.current = true;
    setGoalsOpen(false);
    setLayersOpen(false);
    setFinishing(false);
    finishingRef.current = false;
    markSessionClosed();
  }

  async function uploadMedia(file: File, kind: "photo" | "video") {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
    if (kind === "video") setVideoUrl(uploaded.file.url);
    else setPhotoUrl(uploaded.file.url);
  }

  async function finish(publish = true) {
    if (!activity || (finishing && !shareOpen)) return;
    if (!locked) {
      const route = mergeRoutePoints(points, bufferRef.current);
      setLocked(captureLockedMetrics(route));
    }
    setFinishing(true);
    finishingRef.current = true;
    setBusy(true);
    setError(null);
    stopWatch();
    try {
      await finishRequest(publish);
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "Falha ao finalizar a atividade."} Toque em finalizar de novo — o trajeto está salvo.`
      );
    } finally {
      setFinishing(false);
      finishingRef.current = false;
      setBusy(false);
    }
  }

  async function finishRequest(publish: boolean) {
    if (!activity) return;
    const route = mergeRoutePoints(lastTrackRef.current, points, bufferRef.current);
    lastTrackRef.current = route;
    if (route.length) applyTrack(route, false);
    await persistRoute(activity.id).catch(() => undefined);
    const result = await apiPost<FinishResult>(
      `/student/activities/${activity.id}/finish`,
      compactRecord({
        caption: publish ? caption.trim() || undefined : undefined,
        photoUrl: publish ? photoUrl : undefined,
        videoUrl: publish ? videoUrl : undefined,
        mapType,
        activityMap,
        layers,
        is3d,
        points: route,
        goals: currentGoals(),
        publish,
        trackingMeta: weatherRef.current
          ? {
              weather: {
                tempC: weatherRef.current.tempC,
                code: weatherRef.current.code,
                label: weatherRef.current.label,
                windKmh: weatherRef.current.windKmh,
                humidity: weatherRef.current.humidity,
                capturedAt: weatherRef.current.capturedAt
              }
            }
          : undefined
      }),
      token
    );
    if (result.moderation?.message) setError(result.moderation.message);
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
    const matchedPoly = Array.isArray(result.activity?.polyline) ? result.activity.polyline : [];
    const finishPoints =
      result.activity?.roadMatched && matchedPoly.length
        ? matchedPoly.map((point) => ({
            lat: point.lat,
            lng: point.lng,
            t: point.t ?? Date.now(),
            ele: point.ele
          }))
        : route;
    if (result.activity?.roadMatched) setRoadMatched(true);
    setFinishStats({
      sportLabel: SPORTS.find((item) => item.id === sport)?.label ?? sport,
      sport,
      distanceMeters: result.activity?.distanceMeters ?? locked?.distanceMeters ?? distance,
      elapsedSeconds: result.activity?.durationSeconds ?? result.activity?.elapsedSeconds ?? shownElapsed,
      paceSecPerKm: result.activity?.avgPaceSecPerKm ?? locked?.paceSecPerKm ?? pace,
      elevationGainMeters: result.activity?.elevationGainMeters ?? locked?.elevationGainMeters ?? 0,
      elevationLossMeters: result.activity?.elevationLossMeters ?? locked?.elevationLossMeters ?? 0,
      stepsCount: result.activity?.stepsCount,
      cadenceSpm: result.activity?.avgCadenceSpm,
      powerWatts: result.activity?.estimatedPowerWatts ?? null,
      calories: result.activity?.calories ?? locked?.calories,
      mapType,
      is3d,
      points: finishPoints,
      lapsCount: laps.length,
      kmIndex: liveSplit.kmIndex,
      kmPaceSecPerKm: liveSplit.paceSecPerKm
    });
    setPendingFeedNav(Boolean(publish && result.moderation?.published !== false));
    await resetAfterFinish();
    paintFinishedTrack(finishPoints);
  }

  async function resetAfterFinish() {
    stopWatch();
    bufferRef.current = [];
    lastTrackRef.current = mergeRoutePoints(lastTrackRef.current, points);
    setShareOpen(false);
    shareOpenRef.current = false;
    setShareStats(null);
    setShareModel(null);
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
    setGoalsOpen(false);
    setLayersOpen(false);
    pipelineRef.current.reset();
    /* mantém o traçado no mapa até Nova atividade */
  }

  function dismissFinishSplits(goToFeed = false) {
    const goFeed = goToFeed && pendingFeedNav;
    setFinishSplits(null);
    setFinishAnalysis(null);
    setBestEfforts([]);
    setFinishStats(null);
    setPendingFeedNav(false);
    setCaption("");
    setError(null);
    setPauseHold(false);
    pauseHoldRef.current = false;
    setLocked(null);
    setElapsed(0);
    markSessionClosed();
    clearSessionRoute();
    if (goFeed) onPublished();
  }

  async function shareNative(stats: ActivityShareStats) {
    const isRide = stats.sport === "RIDE";
    const speedLabel = stats.speedKmh && stats.speedKmh > 0 ? `${stats.speedKmh.toFixed(1)} km/h` : "—";
    const text = [
      `App Treino · ${stats.sportLabel}`,
      `${formatKm(stats.distanceMeters)} km · ${formatClock(stats.elapsedSeconds)} · ${
        isRide ? speedLabel : `${formatPace(stats.paceSecPerKm)} /km`
      }`,
      stats.calories ? `${stats.calories} kcal` : null,
      stats.elevationGainMeters || stats.elevationLossMeters
        ? `↑ ${Math.round(stats.elevationGainMeters ?? 0)} m  ↓ ${Math.round(stats.elevationLossMeters ?? 0)} m`
        : null,
      caption.trim() || null
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) await navigator.share({ title: stats.sportLabel, text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* usuário cancelou */
    }
  }

  async function openSegmentBoard(seg: { id: string; name: string }) {
    try {
      const data = await apiGet<{
        leaderboard: Array<{ rank: number; name: string; elapsedSeconds: number; isPr: boolean }>;
      }>(`/student/activities/named-segments/${seg.id}/leaderboard`, token);
      setSegmentBoard({ name: seg.name, rows: data.leaderboard ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ranking do segmento.");
    }
  }

  async function createSegmentFromLastTrack() {
    const poly = lastTrackRef.current.map((p) => ({ lat: p.lat, lng: p.lng }));
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
        token
      );
      setNearbySegments((prev) => [
        { id: created.segment.id, name: created.segment.name, distanceMeters: 0, sport },
        ...prev
      ]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar segmento.");
    }
  }

  function beginPickLapStart() {
    setLapCounterOn(true);
    setGoalsOpen(false);
    setPickingLapStart(true);
    setError(null);
  }

  function clearLapStart() {
    setLapMarker(null);
    setLaps([]);
    setLapCounterOn(false);
    setPickingLapStart(false);
    lapAwayRef.current = false;
    postToMap({ type: "setLapMarker", marker: null });
    postToMap({ type: "setLaps", laps: [] });
    postToMap({ type: "setPickMode", on: false });
  }

  async function selectSport(next: OutdoorSport) {
    if (running) return;
    setError(null);
    if (next !== sport) {
      stopWatch();
      bufferRef.current = [];
      reviewTrackRef.current = null;
      setPoints([]);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      pipelineRef.current.reset();
      postToMap({ type: "setTrack", points: [], fit: false });
      postToMap({ type: "setLaps", laps: [] });
    }
    if (next !== sport && activity) {
      stopWatch();
      try {
        await apiPost(`/student/activities/${activity.id}/cancel`, {}, token);
      } catch {
        // ignore — still switch modality locally
      }
      setActivity(null);
      setPoints([]);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      bufferRef.current = [];
      pipelineRef.current.reset();
      reviewTrackRef.current = null;
      postToMap({ type: "setTrack", points: [], fit: false });
      postToMap({ type: "setLaps", laps: [] });
    }
    if (next !== sport) setSport(next);
    locate(true);
  }

  const sportMeta = SPORTS.find((item) => item.id === sport) ?? SPORTS[0];

  return (
    <section className={sessionActive ? "student-activity is-live" : "student-activity"}>
      <div className="student-activity-map">
        <div className="student-activity-tabs" role="tablist" aria-label="Modalidade">
          {SPORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={sport === item.id}
              className={sport === item.id ? "is-on" : ""}
              disabled={running}
              onClick={() => void selectSport(item.id)}
            >
              {item.id === "RUN" ? <RunnerIcon size={16} gender={athleteGender} /> : <item.Icon size={16} />}
              {item.label}
            </button>
          ))}
        </div>
        <iframe
          ref={iframeRef}
          title="Mapa da atividade"
          src={ACTIVITY_MAP_SRC}
          allow="geolocation *; fullscreen *"
          onLoad={() => {
            pushMapsConfig();
            pushChromeInset();
          }}
        />
        {weather ? (
          <div className="student-activity-weather">
            <StudentWeatherChip weather={weather} sport={sport} compact />
          </div>
        ) : null}
        {pickingLapStart && (
          <div className="student-activity-pick-banner">
            <Flag size={16} />
            <span>Toque no mapa para marcar o ponto de partida da volta</span>
            <button type="button" onClick={() => setPickingLapStart(false)}>
              Cancelar
            </button>
          </div>
        )}
        {paused ? (
          <div className="student-activity-map-chip" aria-hidden>
            Pausado
          </div>
        ) : null}
        {roadMatched && (running || paused) ? (
          <div className="student-activity-map-chip is-via">Na via</div>
        ) : null}
      </div>

      <div className="student-activity-dock" ref={dockRef}>
        {!running && !paused ? (
          <div className="student-activity-segments">
            <div className="student-activity-segments-head">
              <strong>Segmentos próximos</strong>
              <button type="button" onClick={() => void createSegmentFromLastTrack()}>
                Criar do trajeto
              </button>
            </div>
            {nearbySegments.length === 0 ? (
              <p>Nenhum segmento na área. Finalize uma atividade e crie um.</p>
            ) : (
              nearbySegments.slice(0, 3).map((seg) => (
                <button key={seg.id} type="button" onClick={() => void openSegmentBoard(seg)}>
                  {seg.name} · {formatKm(seg.distanceMeters)} km · ranking
                </button>
              ))
            )}
          </div>
        ) : null}

        <div className="student-activity-card">
          <button type="button" className="student-activity-sport" onClick={() => setLayersOpen(true)}>
            {sportMeta.label} <ChevronDown size={16} />
          </button>
          <div className="student-activity-stats">
            <div>
              <small>Tempo</small>
              <strong>{formatClock(shownElapsed)}</strong>
            </div>
            <div>
              <small>{sport === "RIDE" ? "Velocidade" : "Ritmo"}</small>
              <strong>
                {sport === "RIDE" ? (speedKmh ? speedKmh.toFixed(1) : "0.0") : formatPace(pace)}
              </strong>
            </div>
            <div>
              <small>Distância</small>
              <strong>{formatKm(distance)}</strong>
            </div>
          </div>
          <div className="student-activity-stats student-activity-stats-live">
            <div>
              <small>{sport === "RIDE" ? "Ritmo" : "Velocidade"}</small>
              <strong>{sport === "RIDE" ? formatPace(pace) : speedKmh ? speedKmh.toFixed(1) : "0.0"}</strong>
            </div>
            <div>
              <small>{`Km ${shownKmIndex}`}</small>
              <strong>{formatPace(shownKmPace)}</strong>
            </div>
            <div>
              <small>Voltas</small>
              <strong>{String(shownLaps)}</strong>
            </div>
          </div>
          <div className="student-activity-stats student-activity-stats-live">
            <div>
              <small>kcal</small>
              <strong>{String(calories)}</strong>
            </div>
            <div>
              <small>Elevação</small>
              <strong>{`${Math.round(shownElev)} m`}</strong>
            </div>
            <div>
              <small>Via</small>
              <strong>{roadMatched ? "OK" : "GPS"}</strong>
            </div>
          </div>
          <div className="student-activity-controls">
            <button type="button" className="student-activity-side" onClick={() => setLayersOpen(true)} aria-label="Configurações do mapa">
              <Settings2 size={20} />
            </button>
            <button
              type="button"
              className={running ? "student-activity-play is-pause" : "student-activity-play"}
              onClick={() => {
                if (shareOpen || finishing) return;
                void (running ? pause() : startOrResume());
              }}
              disabled={busy && !running}
              aria-label={running ? "Pausar" : "Iniciar"}
            >
              {busy && !running ? <Loader2 className="spin" size={28} /> : running ? <Pause size={28} /> : <Play size={28} />}
            </button>
            <button type="button" className="student-activity-side" onClick={onOpenPlay} aria-label="Música">
              <Music2 size={20} />
            </button>
          </div>
          {running || paused ? (
            <div className="student-activity-finish-actions">
              <button type="button" className="student-activity-distance" onClick={() => void beginFinish()} disabled={busy}>
                Finalizar e compartilhar
              </button>
              <button
                type="button"
                className="student-activity-distance is-quiet"
                disabled={busy || finishing}
                onClick={() => void finish(false)}
              >
                {finishing ? "Finalizando..." : "Finalizar sem publicar"}
              </button>
            </div>
          ) : (
            <button type="button" className="student-activity-distance" onClick={() => setGoalsOpen(true)}>
              Definir distância
            </button>
          )}
          {error && <p className="student-activity-error">{error}</p>}
        </div>
      </div>

      {goalsOpen && (
        <div className="student-activity-sheet" role="dialog" aria-label="Definir meta">
          <header>
            <strong>Definir</strong>
            <button type="button" onClick={() => setGoalsOpen(false)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <label className="student-activity-field">
            <span><MapPinned size={16} /> Distância (km)</span>
            <input
              value={targetKm}
              onChange={(event) => setTargetKm(event.target.value)}
              inputMode="decimal"
              placeholder="Ex.: 5"
            />
          </label>
          <div className="student-activity-field">
            <span><Timer size={16} /> Duração</span>
            <div className="student-activity-duration">
              <label>
                Horas
                <input value={targetHours} onChange={(event) => setTargetHours(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
              </label>
              <strong>:</strong>
              <label>
                Minutos
                <input value={targetMinutes} onChange={(event) => setTargetMinutes(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
              </label>
            </div>
          </div>
          <label className="student-activity-field">
            <span><Gauge size={16} /> Velocidade alvo (km/h)</span>
            <input
              value={targetSpeed}
              onChange={(event) => setTargetSpeed(event.target.value)}
              inputMode="decimal"
              placeholder="Ex.: 10"
            />
          </label>
          <div className="student-activity-field">
            <span><Flag size={16} /> Voltas</span>
            <p className="student-activity-hint">
              1. Acione o contador. 2. Selecione no mapa o ponto de partida. 3. Ao voltar nesse ponto, conta 1 volta.
            </p>
            <button
              type="button"
              className={lapCounterOn ? "student-green-button" : "student-ghost-chip"}
              onClick={() => {
                if (lapCounterOn) clearLapStart();
                else setLapCounterOn(true);
              }}
            >
              <Flag size={16} /> {lapCounterOn ? "Contador de voltas ligado" : "Acionar contador de voltas"}
            </button>
            {lapCounterOn && (
              <>
                <button type="button" className={lapMarker ? "student-ghost-chip" : "student-green-button"} onClick={beginPickLapStart}>
                  <MapPinned size={16} /> {lapMarker ? "Trocar ponto de partida no mapa" : "Selecionar ponto de partida"}
                </button>
                {lapMarker ? (
                  <small>
                    Ponto de partida marcado · raio {lapMarker.radiusMeters ?? LAP_RADIUS_M} m · {laps.length} volta
                    {laps.length === 1 ? "" : "s"}
                  </small>
                ) : (
                  <small>Toque no mapa no local onde a volta deve ser marcada ao retornar.</small>
                )}
              </>
            )}
          </div>
          <button type="button" className="student-green-button" onClick={() => setGoalsOpen(false)}>
            Salvar meta
          </button>
        </div>
      )}

      {layersOpen && (
        <div className="student-activity-sheet" role="dialog" aria-label="Tipos de mapa">
          <header>
            <strong>Mapa</strong>
            <button type="button" onClick={() => setLayersOpen(false)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <h3>Tipos de mapa</h3>
          <div className="student-activity-chips">
            {MAP_TYPES.map((item) => (
              <button key={item.id} type="button" className={mapType === item.id ? "is-on" : ""} onClick={() => setMapType(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <h3>Mapas de atividades</h3>
          <div className="student-activity-chips">
            {ACTIVITY_MAPS.map((item) => (
              <button key={item.id} type="button" className={activityMap === item.id ? "is-on" : ""} onClick={() => setActivityMap(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {LAYER_ITEMS.map((item, index) => (
            <div key={item.id}>
              {(index === 0 || LAYER_ITEMS[index - 1].group !== item.group) && <h3>{item.group}</h3>}
              <label className="student-activity-layer">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={layers[item.id]}
                  onChange={(event) => setLayers((current) => ({ ...current, [item.id]: event.target.checked }))}
                />
              </label>
            </div>
          ))}
          <button type="button" className="student-ghost-chip" onClick={() => setIs3d((value) => !value)}>
            <Layers size={16} /> {is3d ? "3D ligado" : "Abrir mapa 3D"}
          </button>
        </div>
      )}

      {shareOpen && shareStats ? (
        <div className="student-activity-share" role="dialog" aria-label="Percurso concluído">
          <div className="student-activity-share-sheet">
            <div className="student-activity-share-trophy">
              <Trophy size={36} />
            </div>
            <h2>Percurso concluído</h2>
            <p>Escolha o modelo e publique. Distância, ritmo, mapa e as demais métricas vão para o Feed.</p>
            {!shareModel ? (
              <div className="student-activity-share-choices">
                <button type="button" onClick={() => setShareModel("simple")}>
                  <span className="student-activity-share-circle">
                    <MapIcon size={26} />
                  </span>
                  Modelo simples
                </button>
                <button type="button" onClick={() => setShareModel("photo")}>
                  <span className="student-activity-share-circle is-photo">
                    <Camera size={26} />
                  </span>
                  Com foto
                </button>
              </div>
            ) : (
              <>
                <div className="student-activity-share-card">
                  <small>App Treino Social</small>
                  <strong>{shareStats.sportLabel.toUpperCase()} CONCLUÍDA</strong>
                  {photoUrl ? <img src={photoUrl} alt="" /> : null}
                  <div className="student-activity-share-metrics">
                    <span><em>Distância</em>{formatKm(shareStats.distanceMeters)} km</span>
                    <span><em>Tempo</em>{formatClock(shareStats.elapsedSeconds)}</span>
                    <span>
                      <em>{shareStats.sport === "RIDE" ? "Velocidade" : "Ritmo"}</em>
                      {shareStats.sport === "RIDE"
                        ? shareStats.speedKmh && shareStats.speedKmh > 0
                          ? `${shareStats.speedKmh.toFixed(1)} km/h`
                          : "—"
                        : formatPace(shareStats.paceSecPerKm)}
                    </span>
                  </div>
                  <div className="student-activity-share-metrics">
                    <span><em>kcal</em>{String(shareStats.calories ?? 0)}</span>
                    <span><em>↑ Elev</em>{`${Math.round(shareStats.elevationGainMeters ?? 0)} m`}</span>
                    <span><em>Voltas</em>{String(shareStats.lapsCount ?? 0)}</span>
                  </div>
                </div>
                <textarea
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Como foi o percurso?"
                  rows={3}
                />
                {shareModel === "photo" && !photoUrl ? (
                  <label className="student-ghost-chip">
                    <ImagePlus size={16} /> Galeria
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadMedia(file, "photo");
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <button
                      type="button"
                      className="student-green-button"
                      disabled={busy || finishing}
                      onClick={() => void finish(true)}
                    >
                      {busy || finishing ? "Publicando..." : "Publicar no Feed"}
                    </button>
                    <button
                      type="button"
                      className="student-ghost-chip"
                      disabled={busy}
                      onClick={() => void shareNative(shareStats)}
                    >
                      <Share2 size={16} /> Compartilhar
                    </button>
                  </>
                )}
              </>
            )}
            {error ? <p className="student-activity-error">{error}</p> : null}
            <button
              type="button"
              className="student-ghost-chip"
              disabled={busy || finishing}
              onClick={() => void finish(false)}
            >
              {busy || finishing ? "Salvando..." : "Finalizar sem publicar"}
            </button>
          </div>
        </div>
      ) : null}

      {finishStats ? (
        <div className="student-activity-sheet is-saved" role="dialog" aria-label="Atividade salva">
          <header>
            <strong>Atividade salva</strong>
            <button type="button" onClick={() => dismissFinishSplits(false)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <div className="student-activity-saved-card">
            <small>App Treino · Outdoor</small>
            <h3>{finishStats.sportLabel}</h3>
            <div className="student-activity-share-metrics">
              <span><em>Distância</em>{formatKm(finishStats.distanceMeters)} km</span>
              <span><em>Tempo</em>{formatClock(finishStats.elapsedSeconds)}</span>
              <span><em>Ritmo</em>{formatPace(finishStats.paceSecPerKm)}</span>
            </div>
            <div className="student-activity-share-metrics">
              <span><em>↑ Elev</em>{`${Math.round(finishStats.elevationGainMeters ?? 0)} m`}</span>
              <span><em>↓ Elev</em>{`${Math.round(finishStats.elevationLossMeters ?? 0)} m`}</span>
              <span><em>kcal</em>{String(finishStats.calories ?? 0)}</span>
            </div>
            <button type="button" className="student-green-button" onClick={() => void shareNative(finishStats)}>
              <Share2 size={16} /> Compartilhar
            </button>
          </div>
          {finishAnalysis && (finishAnalysis.bestKm != null || finishAnalysis.worstKm != null) ? (
            <p className="student-activity-hint">
              {finishAnalysis.bestKm != null
                ? `Melhor km ${finishAnalysis.bestKm}${
                    finishAnalysis.bestPaceSecPerKm != null ? ` · ${formatPace(finishAnalysis.bestPaceSecPerKm)}` : ""
                  }`
                : ""}
              {finishAnalysis.worstKm != null
                ? `  ·  Pior km ${finishAnalysis.worstKm}${
                    finishAnalysis.worstPaceSecPerKm != null ? ` · ${formatPace(finishAnalysis.worstPaceSecPerKm)}` : ""
                  }`
                : ""}
            </p>
          ) : null}
          {bestEfforts.length ? (
            <div>
              <h3>Best efforts</h3>
              {bestEfforts.map((effort) => (
                <p key={effort.label} className="student-activity-hint">
                  {effort.label}: {formatClock(effort.elapsedSeconds)} · {formatPace(effort.paceSecPerKm)}
                </p>
              ))}
            </div>
          ) : null}
          {finishSplits?.length ? (
            <div>
              <h3>Splits por km</h3>
              {finishSplits.map((split) => (
                <p key={split.km} className="student-activity-hint">
                  Km {split.km}
                  {split.partial ? " · parcial" : ""} · {formatPace(split.paceSecPerKm)} · {formatClock(split.elapsedTime)}
                </p>
              ))}
            </div>
          ) : null}
          <button type="button" className="student-green-button" onClick={() => dismissFinishSplits(false)}>
            Nova atividade
          </button>
          {pendingFeedNav ? (
            <button type="button" className="student-ghost-chip" onClick={() => dismissFinishSplits(true)}>
              Ver no Feed
            </button>
          ) : null}
        </div>
      ) : null}

      {segmentBoard ? (
        <div className="student-activity-sheet" role="dialog" aria-label="Ranking do segmento">
          <header>
            <strong>{segmentBoard.name}</strong>
            <button type="button" onClick={() => setSegmentBoard(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          {segmentBoard.rows.map((row) => (
            <p key={`${row.rank}-${row.name}`} className="student-activity-hint">
              {row.rank}º · {row.name} · {formatClock(row.elapsedSeconds)}
              {row.isPr ? " · PR" : ""}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
