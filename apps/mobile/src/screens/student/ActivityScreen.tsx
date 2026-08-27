import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { apiGet, apiPost, apiUploadFile } from "../../auth/api";
import { WEB_URL } from "../../config";
import {
  formatClock,
  formatKm,
  formatPace,
  liveDistance,
  liveSpeedKmh,
  liveKmSplit,
  LAP_RADIUS_M,
  updateLapCrossing
} from "../../student/activity-geo";
import { StudentPage } from "../../student/layout";
import { RunnerIcon } from "../../student/RunnerIcon";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { OutdoorShareCard } from "../../student/OutdoorShareCard";
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

export function ActivityScreen() {
  const { session, profile } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<BottomTabNavigationProp<StudentTabParamList>>();
  const engineUnsubRef = useRef<(() => void) | null>(null);
  const localSessionIdRef = useRef<string | null>(null);
  const { orphan, clearOrphan, engine, snap } = useTrackingEngine();
  const bufferRef = useRef<GpsPoint[]>([]);
  const lapAwayRef = useRef(false);
  const lapMarkerRef = useRef<LapMarker | null>(null);
  const [sport, setSport] = useState<OutdoorSport>("RUN");
  const [mapType, setMapType] = useState<MapType>("standard");
  const [activityMap, setActivityMap] = useState<ActivityMap>("personal");
  const [layers, setLayers] = useState({ pois: true, bikeLanes: false, avalanche: false, slope: false, aspect: false });
  const [is3d, setIs3d] = useState(false);
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
  } | null>(null);
  const [pendingFeedNav, setPendingFeedNav] = useState(false);
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
  const [heatTracks, setHeatTracks] = useState<Array<Array<{ lat: number; lng: number }>>>([]);

  const running = activity?.status === "LIVE";
  const paused = activity?.status === "PAUSED";
  const distance = liveDistance(points);
  const pace = distance >= 20 ? elapsed / (distance / 1000) : null;
  const speedKmh = liveSpeedKmh(points);
  const liveSplit = useMemo(() => liveKmSplit(points), [points]);
  const parsedKm = Number(targetKm.replace(",", "."));
  const durationSec = (Number(targetHours) || 0) * 3600 + (Number(targetMinutes) || 0) * 60;
  lapMarkerRef.current = lapCounterOn ? lapMarker : null;

  useFocusEffect(
    useCallback(() => {
      if (activity?.status === "LIVE" || activity?.status === "PAUSED") return;
      setSport("RUN");
      void locate();
    }, [activity?.status])
  );

  function currentGoals() {
    return {
      distanceKm: Number.isFinite(parsedKm) && parsedKm > 0 ? parsedKm : undefined,
      durationSeconds: durationSec > 0 ? durationSec : undefined,
      speedKmh: Number(targetSpeed.replace(",", ".")) || undefined,
      lapRadiusMeters: LAP_RADIUS_M,
      lapCounterOn,
      lapMarker: lapCounterOn ? lapMarker : null,
      laps: lapCounterOn ? laps : []
    };
  }

  useEffect(() => {
    void apiGet<{ activity: OutdoorActivityRow | null }>("/student/activities/live", session.token).then((data) => {
      if (!data.activity) return;
      setActivity(data.activity);
      setSport(data.activity.sport);
      setPoints(data.activity.polyline.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t ?? Date.now(), ele: p.ele })));
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
    void apiGet<{
      tracks: Array<Array<{ lat: number; lng: number }>>;
      cells?: Array<{ lat: number; lng: number; weight: number; activities: number; cell: string }>;
    }>(`/student/activities/heatmap?scope=${activityMap}`, session.token)
      .then((data) => setHeatTracks((data.tracks ?? []).slice(0, 12)))
      .catch(() => setHeatTracks([]));
  }, [activityMap, session.token]);
  useEffect(() => {
    liveMapStore.hydrate(points.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));
  }, [points]);

  useEffect(() => {
    if (!running || !activity) return;
    const started = new Date(activity.startedAt).getTime();
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))), 1000);
    return () => clearInterval(id);
  }, [running, activity]);

  async function locate() {
    try {
      const fix = await trackingEngine.locateOnce();
      if (!fix) {
        setError("Permita a localização para usar o GPS.");
        return null;
      }
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

  async function flush(id: string) {
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    if (!batch.length) return;
    try {
      await apiPost(`/student/activities/${id}/points`, { points: batch }, session.token);
    } catch {
      const localId = localSessionIdRef.current;
      if (localId) await outboxSync.enqueuePoints(localId, id, batch);
    }
    void outboxSync.flush(session.token);
  }

  function bindEngineToUi(serverActivityId: string) {
    engineUnsubRef.current?.();
    engineUnsubRef.current = trackingEngine.subscribe((snap) => {
      const fix = snap.lastFix;
      if (!fix?.isAccepted) return;
      const point: GpsPoint = {
        lat: fix.filteredLat,
        lng: fix.filteredLng,
        t: fix.t,
        ele: fix.ele
      };
      bufferRef.current.push(point);
      setPoints((current) => {
        const next = [...current, point];
        if (lapMarkerRef.current) {
          const crossing = updateLapCrossing(lapMarkerRef.current, point, { away: lapAwayRef.current, count: 0 });
          lapAwayRef.current = crossing.away;
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
    setError(null);
    const ok = await locate();
    if (!ok) return;
    if (paused && activity) {
      const data = await apiPost<{ activity: OutdoorActivityRow }>(`/student/activities/${activity.id}/resume`, {}, session.token);
      setActivity(data.activity);
      await trackingEngine.resume();
      bindEngineToUi(data.activity.id);
      return;
    }
    const goals = currentGoals();
    const data = await apiPost<{ activity: OutdoorActivityRow }>(
      "/student/activities",
      { sport, mapType, activityMap, layers, is3d, targetDistanceMeters: goals.distanceKm ? goals.distanceKm * 1000 : undefined, goals },
      session.token
    );
    setActivity(data.activity);
    const local = await trackingEngine.start(sport as Sport);
    localSessionIdRef.current = local.id;
    await trackingEngine.bindServerId(local.id, data.activity.id);
    bindEngineToUi(data.activity.id);
  }

  async function pause() {
    if (!activity) return;
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    await trackingEngine.pause();
    await flush(activity.id);
    const data = await apiPost<{ activity: OutdoorActivityRow }>(`/student/activities/${activity.id}/pause`, {}, session.token);
    setActivity(data.activity);
  }

  async function pick(kind: "photo" | "video") {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      quality: 0.8
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

  async function finish(publish = true) {
    if (!activity || finishing) return;
    setFinishing(true);
    setError(null);
    engineUnsubRef.current?.();
    engineUnsubRef.current = null;
    try {
      await trackingEngine.finish();
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
    await flush(activity.id);
    const track = trackingEngine.getLastFinishPayload();
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
      {
        caption: publish ? caption : undefined,
        photoUrl: publish ? photoUrl : undefined,
        videoUrl: publish ? videoUrl : undefined,
        mapType,
        activityMap,
        layers,
        is3d,
        points: track?.points ?? bufferRef.current,
        goals: currentGoals(),
        publish,
        trackingMeta: track
          ? {
              rawCount: track.rawCount,
              compressedCount: track.compressedCount,
              maskedCount: track.maskedCount,
              h3r9: track.h3r9,
              h3r11: track.h3r11,
              antiCheat: track.antiCheat,
              privacy: track.privacy,
              distanceM: track.distanceM,
              movingTimeMs: track.movingTimeMs,
              stepsCount: track.stepsCount,
              avgCadenceSpm: track.avgCadenceSpm
            }
          : undefined
      },
      session.token
    );
    void outboxSync.flush(session.token);
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
      elevationGainMeters: result.activity?.elevationGainMeters ?? 0,
      elevationLossMeters: result.activity?.elevationLossMeters ?? 0,
      stepsCount: result.activity?.stepsCount ?? track?.stepsCount,
      cadenceSpm: result.activity?.avgCadenceSpm ?? track?.avgCadenceSpm,
      powerWatts: result.activity?.estimatedPowerWatts ?? null
    });
    setPendingFeedNav(Boolean(publish && result.moderation?.published !== false));
    setActivity(null);
    setPoints([]);
    setElapsed(0);
    setLaps([]);
    lapAwayRef.current = false;
    setPickingLapStart(false);
    setCaption("");
    setPhotoUrl(null);
    setVideoUrl(null);
    setSheet(null);
  }

  function dismissFinishSplits() {
    const goFeed = pendingFeedNav;
    setFinishSplits(null);
    setFinishAnalysis(null);
    setBestEfforts([]);
    setFinishStats(null);
    setSegmentEfforts([]);
    setPendingFeedNav(false);
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
    if (next === sport || running) return;
    setError(null);
    if (activity) {
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
      setActivity(null);
      setPoints([]);
      setElapsed(0);
      setLaps([]);
      lapAwayRef.current = false;
      bufferRef.current = [];
    }
    setSport(next);
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
                      if (activity?.id) bindEngineToUi(activity.id);
                      else if (orphan.serverId) bindEngineToUi(orphan.serverId);
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
            followUser={Boolean(running || paused)}
            pickMode={pickingLapStart}
            lapMarker={lapMarker}
            mapType={mapType === "winter" ? "standard" : mapType}
            heatTracks={!running && !paused ? heatTracks : []}
            onMapPress={(coord) => {
              if (!pickingLapStart) return;
              const marker = { lat: coord.lat, lng: coord.lng, radiusMeters: LAP_RADIUS_M };
              setLapMarker(marker);
              setLapCounterOn(true);
              setPickingLapStart(false);
              lapAwayRef.current = false;
            }}
          />
          <View style={styles.nativeMapsBadge} pointerEvents="none">
            <Ionicons name="navigate" size={12} color="#fff" />
            <Text style={styles.nativeMapsBadgeText}>Google Maps · GPS nativo</Text>
          </View>
          {snap?.isAutoPaused ? (
            <View style={styles.autoPauseBadge}>
              <Text style={styles.autoPauseText}>Auto-pause · ritmo suavizado</Text>
            </View>
          ) : null}
        </View>
        {pickingLapStart ? (
          <View style={styles.pickBanner}>
            <Text style={styles.pickBannerText}>Toque no mapa para selecionar o ponto de partida da volta</Text>
            <Pressable onPress={() => setPickingLapStart(false)}>
              <Text style={styles.pickCancel}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}
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
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Tempo</Text>
              <Text style={styles.statValue}>{formatClock(elapsed)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Ritmo {snap?.isAutoPaused ? "(pausa)" : "suavizado"} (/km)</Text>
              <Text style={styles.statValue}>{formatPace(snap?.paceSecKm ?? pace)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Distância (km)</Text>
              <Text style={styles.statValue}>{formatKm(distance)}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Velocidade</Text>
              <Text style={styles.statValue}>{speedKmh ? speedKmh.toFixed(1) : "0.0"}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>{`Km ${liveSplit.kmIndex}`}</Text>
              <Text style={styles.statValue}>{formatPace(liveSplit.paceSecPerKm)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Voltas</Text>
              <Text style={styles.statValue}>{String(laps.length)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Cadência</Text>
              <Text style={styles.statValue}>
                {snap?.cadenceSpm != null ? String(Math.round(snap.cadenceSpm)) : "—"}
              </Text>
            </View>
          </View>
          <View style={styles.controls}>
            <Pressable style={styles.side} onPress={() => setSheet("layers")}>
              <Ionicons name="settings-outline" size={20} color="#15100b" />
            </Pressable>
            <Pressable style={styles.play} onPress={() => void (running ? pause() : startOrResume())}>
              <Ionicons name={running ? "pause" : "play"} size={28} color="#fff" />
            </Pressable>
            <Pressable style={styles.side} onPress={() => navigation.navigate("PlayTab", { screen: "Play" })}>
              <Ionicons name="musical-notes-outline" size={20} color="#15100b" />
            </Pressable>
          </View>
          {running || paused ? (
            <View style={styles.finishActions}>
              <Pressable style={styles.distance} onPress={() => setSheet("finish")}>
                <Text style={styles.distanceText}>Finalizar e publicar</Text>
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
          <Pressable style={styles.chip} onPress={() => setIs3d((value) => !value)}>
            <Text style={styles.chipText}>{is3d ? "3D ligado" : "Abrir mapa 3D"}</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={sheet === "finish"} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Compartilhar no Feed</Text>
          <Text style={styles.rowText}>
            {formatKm(distance)} km · {formatClock(elapsed)} · ritmo {formatPace(pace)}
          </Text>
          <TextInput value={caption} onChangeText={setCaption} placeholder="Como foi o percurso?" style={styles.input} multiline />
          <View style={styles.chips}>
            <Pressable style={styles.chip} onPress={() => void pick("photo")}>
              <Text style={styles.chipText}>Foto</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => void pick("video")}>
              <Text style={styles.chipText}>Vídeo</Text>
            </Pressable>
          </View>
          <Pressable style={styles.play} disabled={finishing} onPress={() => void finish(true)}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {finishing ? "Publicando..." : "Publicar atividade"}
            </Text>
          </Pressable>
          <Pressable style={styles.chip} disabled={finishing} onPress={() => void finish(false)}>
            <Text style={styles.chipText}>{finishing ? "Finalizando..." : "Finalizar sem publicar"}</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={Boolean(finishStats)} animationType="slide" transparent onRequestClose={dismissFinishSplits}>
        <Pressable style={styles.backdrop} onPress={dismissFinishSplits} />
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
          <Pressable style={styles.play} onPress={dismissFinishSplits}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {pendingFeedNav ? "Ver no Feed" : "Continuar"}
            </Text>
          </Pressable>
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
      position: "absolute",
      top: 10,
      alignSelf: "center",
      zIndex: 4,
      flexDirection: "row",
      backgroundColor: "rgba(255,255,255,0.94)",
      borderRadius: 999,
      padding: 4,
      gap: 4
    },
    tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
    tabOn: { backgroundColor: "#fff" },
    orphanBanner: {
      position: "absolute",
      top: 52,
      left: 12,
      right: 12,
      zIndex: 30,
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
    map: { flex: 1, backgroundColor: "#0b1a12" },
    nativeMapsBadge: {
      position: "absolute",
      top: 12,
      left: 12,
      zIndex: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(21, 16, 11, 0.82)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999
    },
    nativeMapsBadgeText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 11,
      letterSpacing: 0.2
    },
    autoPauseBadge: {
      position: "absolute",
      top: 12,
      alignSelf: "center",
      backgroundColor: "rgba(0,0,0,0.72)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      zIndex: 5
    },
    autoPauseText: { color: "#fff", fontWeight: "700", fontSize: 12 },
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
      top: 58,
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
    stats: { flexDirection: "row" },
    stat: { flex: 1, alignItems: "center" },
    statLabel: { color: "#605a52", fontSize: 11, fontWeight: "700" },
    statValue: { color: "#15100b", fontSize: 22, fontWeight: "800" },
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
