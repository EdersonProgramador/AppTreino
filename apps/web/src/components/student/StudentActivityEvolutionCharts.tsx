import { useEffect, useMemo, useState } from "react";
import { Activity, Flame, Footprints, Heart, Mountain, Route, Timer } from "lucide-react";
import { apiGet } from "../../api";
import { formatPace } from "../../lib/activity-geo";
import type { ActivityStatsRange, ActivityStatsResponse } from "../../types";

const RANGE_OPTIONS: Array<{ id: ActivityStatsRange; label: string }> = [
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "year", label: "Ano" }
];

const METRIC_ROWS = [
  { key: "distanceKm", label: "Distância", unit: "km", icon: Route, format: (value: number) => value.toFixed(1) },
  { key: "activities", label: "Atividades", unit: "", icon: Activity, format: (value: number) => String(Math.round(value)) },
  { key: "minutes", label: "Tempo", unit: "min", icon: Timer, format: (value: number) => String(Math.round(value)) },
  { key: "calories", label: "Calorias", unit: "kcal", icon: Flame, format: (value: number) => String(Math.round(value)) },
  { key: "elevationM", label: "Desnível", unit: "m", icon: Mountain, format: (value: number) => value.toFixed(0) },
  { key: "steps", label: "Passos", unit: "", icon: Footprints, format: (value: number) => String(Math.round(value)) }
] as const;

type MetricKey = (typeof METRIC_ROWS)[number]["key"];

function bucketValue(bucket: ActivityStatsResponse["series"][number], key: MetricKey) {
  return bucket[key];
}

export function StudentActivityEvolutionCharts({ token }: { token: string }) {
  const [range, setRange] = useState<ActivityStatsRange>("week");
  const [metric, setMetric] = useState<MetricKey>("distanceKm");
  const [stats, setStats] = useState<ActivityStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<ActivityStatsResponse>(`/student/activities/stats?range=${range}`, token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar métricas de atividade."));
  }, [token, range]);

  const series = stats?.series ?? [];
  const metricMeta = METRIC_ROWS.find((item) => item.key === metric) ?? METRIC_ROWS[0];
  const maxValue = Math.max(1, ...series.map((item) => bucketValue(item, metric)));
  const totalValue = stats?.totals[metric] ?? 0;
  const avgPace = useMemo(() => {
    const samples = series.map((item) => item.avgPaceSecPerKm).filter((value): value is number => value != null);
    if (!samples.length) return null;
    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  }, [series]);
  const avgHeart = useMemo(() => {
    const samples = series.map((item) => item.avgHeartRateBpm).filter((value): value is number => value != null);
    if (!samples.length) return null;
    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  }, [series]);

  return (
    <section className="student-activity-evolution">
      <header>
        <div>
          <small>Atividade</small>
          <h3>Evolução das métricas</h3>
        </div>
        <div className="student-activity-evolution-tabs">
          {RANGE_OPTIONS.map((item) => (
            <button key={item.id} type="button" className={range === item.id ? "is-on" : ""} onClick={() => setRange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="student-activity-evolution-error">{error}</p> : null}

      <div className="student-activity-evolution-metrics">
        {METRIC_ROWS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={metric === item.key ? "is-on" : ""}
            onClick={() => setMetric(item.key)}
          >
            <item.icon size={14} />
            <span>{item.label}</span>
            <strong>
              {item.format(stats?.totals[item.key] ?? 0)}
              {item.unit ? ` ${item.unit}` : ""}
            </strong>
          </button>
        ))}
      </div>

      <div className="student-activity-evolution-bars">
        {series.length === 0 ? (
          <em>Sem atividades registradas neste período.</em>
        ) : (
          series.map((bucket) => {
            const value = bucketValue(bucket, metric);
            const height = Math.max(8, Math.round((value / maxValue) * 92));
            return (
              <div key={bucket.start} title={`${bucket.label}: ${metricMeta.format(value)}`}>
                <i style={{ height: `${height}%` }} />
                <small>{bucket.label}</small>
              </div>
            );
          })
        )}
      </div>

      <div className="student-activity-evolution-foot">
        <p>
          Total no período: <strong>{metricMeta.format(totalValue)}{metricMeta.unit ? ` ${metricMeta.unit}` : ""}</strong>
        </p>
        <div className="student-activity-evolution-extra">
          <span>
            <Route size={14} /> Ritmo médio {avgPace != null ? formatPace(avgPace) : "—"}
          </span>
          <span>
            <Heart size={14} /> FC média {avgHeart != null ? `${avgHeart} bpm` : "—"}
          </span>
        </div>
      </div>
    </section>
  );
}
