import type { OutdoorSport } from "@prisma/client";

export type LeaderboardPeriod = "day" | "week" | "month" | "year" | "all";
export type LeaderboardMetric = "distance" | "activities" | "calories" | "elevation" | "time";
export type ActivityStatsRange = "week" | "month" | "year";

export type ActivityMetricRow = {
  sport: OutdoorSport;
  finishedAt: Date | null;
  distanceMeters: number;
  elapsedSeconds: number;
  calories: number;
  elevationGainMeters: number;
  stepsCount: number;
  avgPaceSecPerKm: number | null;
  avgHeartRateBpm: number | null;
};

export type ActivityStatsBucket = {
  label: string;
  start: string;
  distanceKm: number;
  activities: number;
  calories: number;
  elevationM: number;
  minutes: number;
  steps: number;
  avgPaceSecPerKm: number | null;
  avgHeartRateBpm: number | null;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  distanceMeters: number;
  activities: number;
  calories: number;
  elevationMeters: number;
  elapsedSeconds: number;
  metricValue: number;
};

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function weekStartUtc(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday);
  return isoDay(date);
}

export function leaderboardPeriodStart(period: LeaderboardPeriod, now = new Date()) {
  if (period === "all") return null;
  if (period === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "week") {
    const start = new Date(now);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

export function metricValueFromRow(row: LeaderboardRow, metric: LeaderboardMetric) {
  switch (metric) {
    case "activities":
      return row.activities;
    case "calories":
      return row.calories;
    case "elevation":
      return row.elevationMeters;
    case "time":
      return row.elapsedSeconds;
    default:
      return row.distanceMeters;
  }
}

export function buildLeaderboardRanking(
  rows: LeaderboardRow[],
  metric: LeaderboardMetric,
  userId: string,
  limit: number
) {
  const scored = [...rows]
    .map((row) => ({
      ...row,
      metricValue: metricValueFromRow(row, metric)
    }))
    .filter((row) => row.metricValue > 0)
    .sort((a, b) => b.metricValue - a.metricValue);

  const ranking = scored.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: row.name,
    avatarUrl: row.avatarUrl,
    distanceMeters: row.distanceMeters,
    activities: row.activities,
    calories: row.calories,
    elevationMeters: row.elevationMeters,
    elapsedSeconds: row.elapsedSeconds,
    metricValue: row.metricValue,
    isMe: row.userId === userId
  }));

  const meRow = scored.find((row) => row.userId === userId);
  const me =
    meRow != null
      ? {
          rank: scored.findIndex((row) => row.userId === userId) + 1,
          userId,
          name: meRow.name,
          avatarUrl: meRow.avatarUrl,
          distanceMeters: meRow.distanceMeters,
          activities: meRow.activities,
          calories: meRow.calories,
          elevationMeters: meRow.elevationMeters,
          elapsedSeconds: meRow.elapsedSeconds,
          metricValue: meRow.metricValue,
          isMe: true
        }
      : null;

  return { ranking, me };
}

function weightedAverage(current: number | null, next: number | null, weight: number) {
  if (next == null || !Number.isFinite(next)) return current;
  if (current == null) return next;
  return (current * weight + next) / (weight + 1);
}

function bucketLabel(range: ActivityStatsRange, key: string) {
  if (range === "year") {
    const [year, month] = key.split("-");
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    return date.toLocaleDateString("pt-BR", { month: "short" });
  }
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function aggregateActivityStats(rows: ActivityMetricRow[], range: ActivityStatsRange, now = new Date()) {
  const buckets = new Map<
    string,
    ActivityStatsBucket & { paceSamples: number; heartSamples: number }
  >();

  const ensure = (key: string) => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = {
      label: bucketLabel(range, key),
      start: key,
      distanceKm: 0,
      activities: 0,
      calories: 0,
      elevationM: 0,
      minutes: 0,
      steps: 0,
      avgPaceSecPerKm: null as number | null,
      avgHeartRateBpm: null as number | null,
      paceSamples: 0,
      heartSamples: 0
    };
    buckets.set(key, created);
    return created;
  };

  const from =
    range === "week"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      : range === "month"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
        : new Date(now.getFullYear(), 0, 1);

  if (range === "week") {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(from);
      date.setDate(from.getDate() + offset);
      ensure(isoDay(date));
    }
  } else if (range === "month") {
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date(from);
      date.setDate(from.getDate() + offset);
      ensure(isoDay(date));
    }
  } else {
    for (let month = 0; month < 12; month += 1) {
      ensure(`${now.getFullYear()}-${String(month + 1).padStart(2, "0")}`);
    }
  }

  rows.forEach((row) => {
    if (!row.finishedAt || row.finishedAt < from || row.finishedAt > now) return;
    const key =
      range === "year"
        ? monthKey(row.finishedAt)
        : range === "month"
          ? isoDay(row.finishedAt)
          : isoDay(row.finishedAt);
    const bucket = ensure(key);
    bucket.activities += 1;
    bucket.distanceKm += row.distanceMeters / 1000;
    bucket.calories += row.calories;
    bucket.elevationM += row.elevationGainMeters;
    bucket.minutes += Math.round(row.elapsedSeconds / 60);
    bucket.steps += row.stepsCount;
    bucket.avgPaceSecPerKm = weightedAverage(bucket.avgPaceSecPerKm, row.avgPaceSecPerKm, bucket.paceSamples);
    if (row.avgPaceSecPerKm != null) bucket.paceSamples += 1;
    bucket.avgHeartRateBpm = weightedAverage(bucket.avgHeartRateBpm, row.avgHeartRateBpm, bucket.heartSamples);
    if (row.avgHeartRateBpm != null) bucket.heartSamples += 1;
  });

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => ({
      label: bucket.label,
      start: bucket.start,
      distanceKm: Number(bucket.distanceKm.toFixed(2)),
      activities: bucket.activities,
      calories: bucket.calories,
      elevationM: Number(bucket.elevationM.toFixed(1)),
      minutes: bucket.minutes,
      steps: bucket.steps,
      avgPaceSecPerKm: bucket.avgPaceSecPerKm != null ? Math.round(bucket.avgPaceSecPerKm) : null,
      avgHeartRateBpm: bucket.avgHeartRateBpm != null ? Math.round(bucket.avgHeartRateBpm) : null
    }));

  const totals = series.reduce(
    (acc, item) => {
      acc.distanceKm += item.distanceKm;
      acc.activities += item.activities;
      acc.calories += item.calories;
      acc.elevationM += item.elevationM;
      acc.minutes += item.minutes;
      acc.steps += item.steps;
      return acc;
    },
    { distanceKm: 0, activities: 0, calories: 0, elevationM: 0, minutes: 0, steps: 0 }
  );

  return {
    range,
    from: isoDay(from),
    to: isoDay(now),
    totals: {
      ...totals,
      distanceKm: Number(totals.distanceKm.toFixed(2)),
      elevationM: Number(totals.elevationM.toFixed(1))
    },
    series
  };
}

export function aggregateWeeklyActivityStats(rows: ActivityMetricRow[], now = new Date()) {
  const weekMap = new Map<string, ActivityStatsBucket>();
  const ensure = (key: string) => {
    const existing = weekMap.get(key);
    if (existing) return existing;
    const created: ActivityStatsBucket = {
      label: bucketLabel("week", key),
      start: key,
      distanceKm: 0,
      activities: 0,
      calories: 0,
      elevationM: 0,
      minutes: 0,
      steps: 0,
      avgPaceSecPerKm: null,
      avgHeartRateBpm: null
    };
    weekMap.set(key, created);
    return created;
  };

  rows.forEach((row) => {
    if (!row.finishedAt) return;
    const key = weekStartUtc(isoDay(row.finishedAt));
    const bucket = ensure(key);
    bucket.activities += 1;
    bucket.distanceKm += row.distanceMeters / 1000;
    bucket.calories += row.calories;
    bucket.elevationM += row.elevationGainMeters;
    bucket.minutes += Math.round(row.elapsedSeconds / 60);
    bucket.steps += row.stepsCount;
  });

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([, bucket]) => ({
      ...bucket,
      distanceKm: Number(bucket.distanceKm.toFixed(2)),
      elevationM: Number(bucket.elevationM.toFixed(1))
    }));
}
