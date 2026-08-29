import { useMemo, useState } from "react";
import { Dumbbell, Flame, Footprints } from "lucide-react";
import { BikeIcon } from "../shared/BikeIcon";

export type StreakKind = "WORKOUT" | "RUN" | "WALK" | "RIDE";

export type SportTotals = Record<StreakKind, { count: number; km: number; minutes: number; calories?: number }>;
export type WeeklyVolume = { weekStart: string; workouts: number; outdoorKm: number; minutes: number };

const SPORT_META: Array<{ id: StreakKind; label: string; Icon: typeof Dumbbell | typeof BikeIcon }> = [
  { id: "WORKOUT", label: "Treino", Icon: Dumbbell },
  { id: "RUN", label: "Corrida", Icon: Footprints },
  { id: "WALK", label: "Caminhada", Icon: Footprints },
  { id: "RIDE", label: "Pedal", Icon: BikeIcon }
];

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function StudentPerformanceCharts({
  streak,
  sportTotals,
  weeklyVolume
}: {
  streak: number;
  sportTotals?: SportTotals | null;
  weeklyVolume?: WeeklyVolume[] | null;
}) {
  const weeks = (weeklyVolume ?? []).slice(-8);
  const maxMinutes = Math.max(1, ...weeks.map((item) => item.minutes));
  const [focus, setFocus] = useState<WeeklyVolume | null>(weeks[weeks.length - 1] ?? null);
  const mixMax = Math.max(1, ...SPORT_META.map((item) => sportTotals?.[item.id]?.count ?? 0));
  const insight = useMemo(() => {
    if (!focus) return streak > 0 ? `${streak} dia(s) de ofensiva. Mantenha a sequência.` : "Comece hoje e abra a ofensiva.";
    return `${weekLabel(focus.weekStart)} · ${focus.workouts} treino(s) · ${focus.outdoorKm.toFixed(1)} km outdoor · ${focus.minutes} min`;
  }, [focus, streak]);

  return (
    <section className="student-perf-charts">
      <header>
        <div>
          <small>Performance</small>
          <h3>Métricas da ofensiva</h3>
        </div>
        <span>
          <Flame size={14} /> {streak}d
        </span>
      </header>
      <p>{insight}</p>
      <div className="student-perf-bars">
        {weeks.length === 0 ? (
          <em>Sem volume ainda. Conclua um treino ou uma corrida.</em>
        ) : (
          weeks.map((week) => {
            const height = Math.max(8, Math.round((week.minutes / maxMinutes) * 88));
            const on = focus?.weekStart === week.weekStart;
            return (
              <button key={week.weekStart} type="button" className={on ? "is-on" : ""} onClick={() => setFocus(week)}>
                <i style={{ height }} />
                <small>{weekLabel(week.weekStart)}</small>
              </button>
            );
          })
        )}
      </div>
      <strong>Mix de modalidades</strong>
      <div className="student-perf-mix">
        {SPORT_META.map((item) => {
          const row = sportTotals?.[item.id];
          const count = row?.count ?? 0;
          const pct = count ? Math.round((count / mixMax) * 100) : 0;
          return (
            <div key={item.id}>
              <p>
                <item.Icon size={14} />
                <span>{item.label}</span>
                <em>
                  {count}
                  {item.id === "WORKOUT" ? "" : ` · ${(row?.km ?? 0).toFixed(1)} km`}
                </em>
              </p>
              <b>
                <i style={{ width: `${pct}%` }} />
              </b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
