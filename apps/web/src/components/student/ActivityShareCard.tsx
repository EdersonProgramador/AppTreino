import { Footprints } from "lucide-react";
import { formatClock, formatGrade, formatKm, formatMeters, formatPace, liveGradePercent, liveKmSplit, liveSpeedKmh } from "../../lib/activity-geo";
import { mediaUrl } from "../../lib/urls";
import type { OutdoorActivityRow, OutdoorSport, SocialPostRow } from "../../types";
import { BikeIcon } from "../shared/BikeIcon";
import { RunnerIcon } from "../shared/RunnerIcon";
import { ActivityRoutePreview } from "./ActivityRoutePreview";

type MapType = "standard" | "satellite" | "hybrid" | "winter";

export type ActivityShareStats = {
  sportLabel: string;
  sport: OutdoorSport;
  gender?: "MALE" | "FEMALE" | null;
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
  gradePercent?: number | null;
  heartRateBpm?: number | null;
  points: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>;
};

function asMapType(value?: string | null): MapType | undefined {
  if (value === "standard" || value === "satellite" || value === "hybrid" || value === "winter") return value;
  return undefined;
}

function ShareSportIcon({
  sport,
  gender,
  size = 22
}: {
  sport: OutdoorSport;
  gender?: "MALE" | "FEMALE" | null;
  size?: number;
}) {
  if (sport === "RUN") return <RunnerIcon size={size} gender={gender} />;
  if (sport === "RIDE") return <BikeIcon size={size} />;
  return <Footprints size={size} />;
}

export function activitySharePhotoUrl(post: SocialPostRow): string | null {
  const fromItems = post.mediaItems?.find((item) => item.type === "IMAGE")?.url;
  const candidates = [
    post.activity?.photoUrl,
    post.mediaType === "VIDEO" ? null : post.mediaUrl,
    fromItems
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = raw.trim().replace(/^\//, "");
    if (!/[./]/.test(cleaned) && !/^https?:\/\//i.test(raw.trim()) && !/^(data:|blob:)/i.test(raw.trim())) continue;
    const resolved = mediaUrl(raw);
    if (resolved) return resolved;
  }
  return null;
}

export function activityShareTitle(activity: Pick<OutdoorActivityRow, "sport" | "sportLabel">) {
  const done = activity.sport === "RIDE" ? "CONCLUÍDO" : "CONCLUÍDA";
  return `${activity.sportLabel.toUpperCase()} ${done}`;
}

export function activityShareStatsFromRow(
  activity: OutdoorActivityRow,
  gender?: "MALE" | "FEMALE" | null
): ActivityShareStats {
  const points = Array.isArray(activity.polyline) ? activity.polyline : [];
  const lastSplit = [...(activity.splits ?? [])].reverse().find((split) => !split.partial) ?? activity.splits?.at(-1);
  const liveSplit = liveKmSplit(points);
  const avgSpeedKmh = activity.avgSpeedMps && activity.avgSpeedMps > 0 ? activity.avgSpeedMps * 3.6 : liveSpeedKmh(points);
  return {
    sportLabel: activity.sportLabel,
    sport: activity.sport,
    gender,
    distanceMeters: activity.distanceMeters,
    elapsedSeconds: activity.elapsedSeconds,
    paceSecPerKm: activity.avgPaceSecPerKm ?? null,
    speedKmh: avgSpeedKmh || null,
    calories: activity.calories,
    elevationGainMeters: activity.elevationGainMeters,
    elevationLossMeters: activity.elevationLossMeters,
    stepsCount: activity.stepsCount,
    cadenceSpm: activity.avgCadenceSpm,
    powerWatts: activity.estimatedPowerWatts,
    mapType: asMapType(activity.mapType),
    is3d: Boolean(activity.is3d),
    lapsCount: activity.goals?.laps?.length ?? 0,
    kmIndex: lastSplit?.km ?? liveSplit.kmIndex,
    kmPaceSecPerKm: lastSplit?.paceSecPerKm ?? liveSplit.paceSecPerKm,
    gradePercent: liveGradePercent(points),
    heartRateBpm: activity.avgHeartRateBpm ?? null,
    points
  };
}

export function ActivityShareCard({
  stats,
  photoUrl,
  title
}: {
  stats: ActivityShareStats;
  photoUrl?: string | null;
  title?: string;
}) {
  const isRide = stats.sport === "RIDE";
  const speedLabel = stats.speedKmh && stats.speedKmh > 0 ? `${stats.speedKmh.toFixed(1)} km/h` : "—";
  const imageSrc = photoUrl ? mediaUrl(photoUrl) || photoUrl : null;
  return (
    <>
      {imageSrc ? <img src={imageSrc} alt="" /> : null}
      <div className="student-activity-share-sport">
        <ShareSportIcon sport={stats.sport} gender={stats.gender} />
        <strong>{title ?? stats.sportLabel}</strong>
      </div>
      <div className="student-activity-share-map-host">
        <ActivityRoutePreview
          points={stats.points}
          mapType={stats.mapType}
          is3d={stats.is3d}
          sport={stats.sport}
          gender={stats.gender}
        />
      </div>
      <div className="student-activity-share-metrics">
        <span>
          <em>Distância</em>
          {formatMeters(stats.distanceMeters)} · {formatKm(stats.distanceMeters)} km
        </span>
        <span>
          <em>Tempo</em>
          {formatClock(stats.elapsedSeconds)}
        </span>
        <span>
          <em>{isRide ? "Velocidade" : "Ritmo médio"}</em>
          {isRide ? speedLabel : formatPace(stats.paceSecPerKm)}
        </span>
      </div>
      <div className="student-activity-share-metrics">
        <span>
          <em>kcal</em>
          {String(stats.calories ?? 0)}
        </span>
        <span>
          <em>Inclinação</em>
          {formatGrade(stats.gradePercent)}
        </span>
        <span>
          <em>F. Cardíaca</em>
          {stats.heartRateBpm ? `${stats.heartRateBpm} bpm` : "—"}
        </span>
      </div>
      <div className="student-activity-share-metrics">
        <span>
          <em>{isRide ? "Ritmo" : "Velocidade"}</em>
          {isRide ? formatPace(stats.paceSecPerKm) : speedLabel}
        </span>
        <span>
          <em>{`Km ${stats.kmIndex ?? 1}`}</em>
          {formatPace(stats.kmPaceSecPerKm ?? null)}
        </span>
        <span>
          <em>Voltas</em>
          {String(stats.lapsCount ?? 0)}
        </span>
      </div>
    </>
  );
}
