import {
  Bike,
  ChevronDown,
  Flag,
  Footprints,
  Gauge,
  Layers,
  Loader2,
  MapPinned,
  Music2,
  Pause,
  Play,
  Settings2,
  Smartphone,
  Timer,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiUpload } from "../../api";
import { paths } from "../../auth/session";
import { VIDEO_FILE_ACCEPT } from "../../lib/video-formats";
import { retryVideoAsCompatible } from "../../lib/urls";
import {
  formatClock,
  formatKm,
  formatPace,
  liveDistance,
  liveSpeedKmh,
  LAP_RADIUS_M,
  updateLapCrossing
} from "../../lib/activity-geo";
import { WebGpsPipeline, fixFromGeolocation } from "../../lib/gps-filter";
import { isNativeAppShell } from "../../lib/native-bridge";
import type { OutdoorActivityRow, OutdoorSport, SocialPostRow, UploadResponse } from "../../types";
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
type LapMarker = { lat: number; lng: number; radiusMeters?: number };
type LapRecord = { index: number; lat: number; lng: number; t: number; distanceMeters: number };

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "";
const ACTIVITY_MAP_SRC = (() => {
  const qs = new URLSearchParams();
  if (GOOGLE_MAPS_KEY) qs.set("key", GOOGLE_MAPS_KEY);
  if (GOOGLE_MAPS_MAP_ID) qs.set("mapId", GOOGLE_MAPS_MAP_ID);
  const query = qs.toString();
  return query ? `/activity-map.html?${query}` : "/activity-map.html";
})();

function durationSeconds(hours: string, minutes: string) {
  const h = Number(hours);
  const m = Number(minutes);
  const total = (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
  return total > 0 ? total : undefined;
}

export function StudentActivitySection({
  token,
  onOpenPlay,
  onPublished,
  preferredSport = "RUN",
  preferredSportKey = 0,
  athleteGender
}: {
  token: string;
  onOpenPlay: () => void;
  onPublished: () => void;
  preferredSport?: OutdoorSport;
  preferredSportKey?: number;
  athleteGender?: "MALE" | "FEMALE" | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchRef = useRef<number | null>(null);
  const bufferRef = useRef<GpsPoint[]>([]);
  const pipelineRef = useRef(new WebGpsPipeline());
  const followMapRef = useRef(true);
  const lapAwayRef = useRef(false);
  const lapMarkerRef = useRef<LapMarker | null>(null);
  const [sport, setSport] = useState<OutdoorSport>(preferredSport);
  const sportRef = useRef(sport);
  sportRef.current = sport;
  const [mapType, setMapType] = useState<MapType>("standard");
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
  const [finishOpen, setFinishOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = activity?.status === "LIVE";
  const paused = activity?.status === "PAUSED";
  const distance = liveDistance(points);
  const pace = distance >= 20 ? elapsed / (distance / 1000) : null;
  const speedKmh = liveSpeedKmh(points);
  const targetDuration = durationSeconds(targetHours, targetMinutes);
  const parsedKm = Number(targetKm.replace(",", "."));
  const hasGoal =
    (Number.isFinite(parsedKm) && parsedKm > 0) ||
    Boolean(targetDuration) ||
    Boolean(lapCounterOn && lapMarker);
  lapMarkerRef.current = lapCounterOn ? lapMarker : null;

  useEffect(() => {
    if (running || paused) return;
    if (sport !== preferredSport) setSport(preferredSport);
    locate(true);
  }, [preferredSportKey, preferredSport]); // eslint-disable-line react-hooks/exhaustive-deps

  function currentGoals() {
    return {
      distanceKm: Number.isFinite(parsedKm) && parsedKm > 0 ? parsedKm : undefined,
      durationSeconds: targetDuration,
      speedKmh: Number(targetSpeed.replace(",", ".")) || undefined,
      lapRadiusMeters: LAP_RADIUS_M,
      lapCounterOn,
      lapMarker: lapCounterOn ? lapMarker : null,
      laps: lapCounterOn ? laps : []
    };
  }

  function postToMap(msg: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  function pushMapsConfig() {
    if (!GOOGLE_MAPS_KEY) return;
    postToMap({ type: "setMapsConfig", key: GOOGLE_MAPS_KEY, mapId: GOOGLE_MAPS_MAP_ID || "" });
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
        if (points.length) postToMap({ type: "setTrack", points, fit: !running });
        if (lapCounterOn && lapMarker) postToMap({ type: "setLapMarker", marker: lapMarker });
        if (laps.length) postToMap({ type: "setLaps", laps });
        postToMap({ type: "setPickMode", on: pickingLapStart });
        locate(true);
      }
      if (type === "open-layers") setLayersOpen(true);
      if (type === "toggle-3d") setIs3d(Boolean(event.data.on));
      if (type === "user-pan") followMapRef.current = false;
      if (type === "locate-request") {
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
        postToMap({ type: "setView", lat: marker.lat, lng: marker.lng, zoom: 17 });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  useEffect(() => {
    void apiGet<{ activity: OutdoorActivityRow | null }>("/student/activities/live", token)
      .then((data) => {
        if (!data.activity) return;
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
    postToMap({ type: "setActivityMap", mode: activityMap });
    void apiGet<{
      tracks: Array<Array<{ lat: number; lng: number }>>;
      cells?: Array<{ lat: number; lng: number; weight: number; activities: number; cell: string }>;
    }>(
      `/student/activities/heatmap?scope=${activityMap}`,
      token
    )
      .then((data) => postToMap({ type: "setHeat", tracks: data.tracks, cells: data.cells ?? [] }))
      .catch(() => undefined);
  }, [activityMap, token]);
  useEffect(() => {
    postToMap({ type: "setLayers", layers });
  }, [layers]);
  useEffect(() => {
    postToMap({ type: "set3d", on: is3d });
  }, [is3d]);
  useEffect(() => {
    postToMap({ type: "setTrack", points, fit: !running && !paused });
  }, [points, running, paused]);
  useEffect(() => {
    postToMap({ type: "setLapMarker", marker: lapCounterOn ? lapMarker : null });
  }, [lapMarker, lapCounterOn]);
  useEffect(() => {
    postToMap({ type: "setLaps", laps: lapCounterOn ? laps : [] });
  }, [laps, lapCounterOn]);
  useEffect(() => {
    postToMap({ type: "setPickMode", on: pickingLapStart });
  }, [pickingLapStart]);

  useEffect(() => {
    if (!running || !activity) return;
    const started = new Date(activity.startedAt).getTime();
    const pauseMs = Number((activity as { pauseMs?: number }).pauseMs ?? 0);
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started - pauseMs) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, activity]);

  function locate(follow = false) {
    if (!navigator.geolocation) {
      setError("GPS indisponível neste dispositivo.");
      return;
    }
    if (follow) {
      followMapRef.current = true;
      postToMap({ type: "setFollow", on: true });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = fixFromGeolocation(pos);
        postToMap({ type: "setLive", lat: fix.lat, lng: fix.lng, follow: followMapRef.current });
        if (follow) postToMap({ type: "setView", lat: fix.lat, lng: fix.lng, zoom: 17 });
      },
      () => setError("Permita a localização para iniciar o GPS."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
    bufferRef.current = [];
    if (!batch.length) return;
    await apiPost(`/student/activities/${id}/points`, { points: batch }, token);
  }

  function startWatch(id: string) {
    stopWatch();
    if (!navigator.geolocation) return;
    followMapRef.current = true;
    postToMap({ type: "setFollow", on: true });
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
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
          postToMap({ type: "setTrack", points: next, fit: false });
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

  useEffect(() => () => stopWatch(), []);

  async function startOrResume() {
    setError(null);
    setBusy(true);
    try {
      if (paused && activity) {
        const data = await apiPost<{ activity: OutdoorActivityRow }>(`/student/activities/${activity.id}/resume`, {}, token);
        setActivity(data.activity);
        if (points.length) {
          const last = points[points.length - 1];
          pipelineRef.current.warmStart(last.lat, last.lng, last.t);
        } else {
          pipelineRef.current.reset();
        }
        startWatch(data.activity.id);
        return;
      }
      const goals = currentGoals();
      const data = await apiPost<{ activity: OutdoorActivityRow }>(
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
      setActivity(data.activity);
      pipelineRef.current.reset();
      startWatch(data.activity.id);
      locate(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar.");
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    if (!activity) return;
    stopWatch();
    await flushPoints(activity.id);
    const data = await apiPost<{ activity: OutdoorActivityRow }>(`/student/activities/${activity.id}/pause`, {}, token);
    setActivity(data.activity);
  }

  async function uploadMedia(file: File, kind: "photo" | "video") {
    const form = new FormData();
    form.append("file", file);
    const uploaded = await apiUpload<UploadResponse>("/student/social/uploads", form, token);
    if (kind === "video") setVideoUrl(uploaded.file.url);
    else setPhotoUrl(uploaded.file.url);
  }

  async function finish(publish = true) {
    if (!activity) return;
    setBusy(true);
    try {
      stopWatch();
      await flushPoints(activity.id);
      await apiPost<{ post: SocialPostRow | null }>(
        `/student/activities/${activity.id}/finish`,
        {
          caption: publish ? caption : undefined,
          photoUrl: publish ? photoUrl : undefined,
          videoUrl: publish ? videoUrl : undefined,
          mapType,
          activityMap,
          layers,
          is3d,
          points: bufferRef.current,
          goals: currentGoals(),
          publish
        },
        token
      );
      setFinishOpen(false);
      setActivity(null);
      setPoints([]);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      pipelineRef.current.reset();
      setPickingLapStart(false);
      setCaption("");
      setPhotoUrl(null);
      setVideoUrl(null);
      if (publish) onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : publish ? "Não foi possível publicar." : "Não foi possível finalizar.");
    } finally {
      setBusy(false);
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
    if (next === sport || running) return;
    setError(null);
    if (activity) {
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
      postToMap({ type: "setTrack", points: [], fit: false });
      postToMap({ type: "setLaps", laps: [] });
    }
    setSport(next);
  }

  const sportMeta = SPORTS.find((item) => item.id === sport) ?? SPORTS[0];

  return (
    <section className="student-activity">
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

      {!isNativeAppShell() ? (
        <Link to={paths.download} className="student-activity-native-cta">
          <Smartphone size={18} aria-hidden />
          <span>
            <strong>Melhor no app</strong>
            <em>GPS nativo e mapa estáveis para outdoor</em>
          </span>
        </Link>
      ) : null}

      <div className="student-activity-map">
        <iframe
          ref={iframeRef}
          title="Mapa da atividade"
          src={ACTIVITY_MAP_SRC}
          onLoad={() => pushMapsConfig()}
        />
        {pickingLapStart && (
          <div className="student-activity-pick-banner">
            <Flag size={16} />
            <span>Toque no mapa para selecionar o ponto de partida da volta</span>
            <button type="button" onClick={() => setPickingLapStart(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="student-activity-card">
        <button type="button" className="student-activity-sport" onClick={() => setLayersOpen(true)}>
          {sportMeta.label} <ChevronDown size={16} />
        </button>
        <div className="student-activity-stats">
          <div>
            <small>Tempo</small>
            <strong>{formatClock(elapsed)}</strong>
          </div>
          <div>
            <small>Ritmo médio (/km)</small>
            <strong>{formatPace(pace)}</strong>
          </div>
          <div>
            <small>Distância (km)</small>
            <strong>{formatKm(distance)}</strong>
          </div>
        </div>
        <div className="student-activity-stats student-activity-stats-live">
          <div>
            <small>Velocidade</small>
            <strong>{speedKmh ? speedKmh.toFixed(1) : "0.0"}</strong>
            <em>km/h</em>
          </div>
          <div>
            <small>Voltas</small>
            <strong>{laps.length}</strong>
          </div>
          <div>
            <small>Meta</small>
            <strong>{Number.isFinite(parsedKm) && parsedKm > 0 ? formatKm(parsedKm * 1000) : "--"}</strong>
            <em>km</em>
          </div>
        </div>
        <div className="student-activity-controls">
          <button type="button" className="student-activity-side" onClick={() => setLayersOpen(true)} aria-label="Configurações do mapa">
            <Settings2 size={20} />
          </button>
          {running ? (
            <button type="button" className="student-activity-play is-pause" onClick={() => void pause()} aria-label="Pausar">
              <Pause size={28} />
            </button>
          ) : (
            <button type="button" className="student-activity-play" onClick={() => void startOrResume()} disabled={busy} aria-label="Iniciar">
              {busy ? <Loader2 className="spin" size={28} /> : <Play size={28} />}
            </button>
          )}
          <button type="button" className="student-activity-side" onClick={onOpenPlay} aria-label="Música">
            <Music2 size={20} />
          </button>
        </div>
        {running || paused ? (
          <div className="student-activity-finish-actions">
            <button type="button" className="student-activity-distance" onClick={() => setFinishOpen(true)} disabled={busy}>
              Finalizar e publicar
            </button>
            <button
              type="button"
              className="student-activity-distance is-quiet"
              disabled={busy}
              onClick={() => void finish(false)}
            >
              Finalizar sem publicar
            </button>
          </div>
        ) : (
          <button type="button" className="student-activity-distance" onClick={() => setGoalsOpen(true)}>
            <MapPinned size={14} /> {hasGoal ? `Definir · ${Number.isFinite(parsedKm) && parsedKm > 0 ? `${parsedKm} km` : "meta"}` : "Definir distância"}
          </button>
        )}
        {error && <p className="student-activity-error">{error}</p>}
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

      {finishOpen && (
        <div className="student-activity-sheet" role="dialog" aria-label="Publicar atividade">
          <header>
            <strong>Compartilhar no Feed</strong>
            <button type="button" onClick={() => setFinishOpen(false)} aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <p>
            {formatKm(distance)} km · {formatClock(elapsed)} · ritmo {formatPace(pace)}
          </p>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Como foi o percurso?" rows={3} />
          <div className="student-feed-composer-bar">
            <label className="student-ghost-chip">
              Foto
              <input type="file" accept="image/*" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadMedia(file, "photo");
              }} />
            </label>
            <label className="student-ghost-chip">
              Vídeo
              <input type="file" accept={VIDEO_FILE_ACCEPT} hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadMedia(file, "video");
              }} />
            </label>
          </div>
          {photoUrl && <img className="student-feed-media" src={photoUrl} alt="" />}
          {videoUrl && (
            <video
              className="student-feed-media"
              src={videoUrl}
              controls
              onError={(event) => retryVideoAsCompatible(event.currentTarget, videoUrl)}
            />
          )}
          <button type="button" className="student-green-button" disabled={busy} onClick={() => void finish(true)}>
            {busy ? "Publicando..." : "Publicar atividade"}
          </button>
          <button type="button" className="student-ghost-chip" disabled={busy} onClick={() => void finish(false)}>
            Finalizar sem publicar
          </button>
        </div>
      )}
    </section>
  );
}
