import { Award, Medal, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api";
import { formatKm } from "../../lib/activity-geo";
import type {
  ActivityAchievementsResponse,
  ChallengeRankingRow,
  ClubChallengeRow,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardResponse
} from "../../types";

const PERIOD_OPTIONS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: "day", label: "Diário" },
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensal" },
  { id: "year", label: "Anual" }
];

const METRIC_OPTIONS: Array<{ id: LeaderboardMetric; label: string; unit: string }> = [
  { id: "distance", label: "Distância", unit: "km" },
  { id: "activities", label: "Atividades", unit: "" },
  { id: "calories", label: "Calorias", unit: "kcal" },
  { id: "elevation", label: "Desnível", unit: "m" },
  { id: "time", label: "Tempo", unit: "min" }
];

function formatMetricValue(metric: LeaderboardMetric, value: number) {
  if (metric === "distance") return `${formatKm(value)} km`;
  if (metric === "calories") return `${Math.round(value)} kcal`;
  if (metric === "elevation") return `${Math.round(value)} m`;
  if (metric === "time") return `${Math.round(value / 60)} min`;
  return String(Math.round(value));
}

function readStoredFix(): { lat: number; lng: number } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem("apptreino.lastGps") ?? "null") as {
      lat?: number;
      lng?: number;
      t?: number;
    } | null;
    if (!parsed || !Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    if (Number.isFinite(parsed.t) && Date.now() - Number(parsed.t) > 6 * 60 * 60 * 1000) return null;
    return { lat: parsed.lat!, lng: parsed.lng! };
  } catch {
    return null;
  }
}

async function resolveCoords() {
  const cached = readStoredFix();
  if (cached) return cached;
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<{ lat: number; lng: number } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    );
  });
}

export function StudentClubSection({ token }: { token: string }) {
  const [challenges, setChallenges] = useState<ClubChallengeRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [achievements, setAchievements] = useState<ActivityAchievementsResponse | null>(null);
  const [challengeRankings, setChallengeRankings] = useState<Record<string, ChallengeRankingRow[]>>({});
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [metric, setMetric] = useState<LeaderboardMetric>("distance");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const metricMeta = useMemo(
    () => METRIC_OPTIONS.find((item) => item.id === metric) ?? METRIC_OPTIONS[0],
    [metric]
  );

  async function loadChallengeRanking(challengeId: string) {
    const data = await apiGet<{ ranking: ChallengeRankingRow[] }>(
      `/student/social/challenges/${challengeId}/ranking`,
      token
    );
    setChallengeRankings((current) => ({ ...current, [challengeId]: data.ranking ?? [] }));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const fix = coords ?? (await resolveCoords());
      if (fix) setCoords(fix);
      const challengeUrl = fix
        ? `/student/social/challenges?lat=${fix.lat}&lng=${fix.lng}`
        : "/student/social/challenges";
      const [challengeData, achievementData, boardData] = await Promise.all([
        apiGet<{ challenges: ClubChallengeRow[] }>(challengeUrl, token),
        apiGet<ActivityAchievementsResponse>("/student/social/achievements", token),
        fix
          ? apiGet<LeaderboardResponse>(
              `/student/activities/leaderboard?lat=${fix.lat}&lng=${fix.lng}&period=${period}&metric=${metric}&limit=10`,
              token
            )
          : Promise.resolve(null)
      ]);
      setChallenges(challengeData.challenges);
      setAchievements(achievementData);
      setLeaderboard(boardData);
      await Promise.all(
        challengeData.challenges.filter((item) => item.joined).map((item) => loadChallengeRanking(item.id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar os desafios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, period, metric]);

  async function join(id: string) {
    await apiPost(`/student/social/challenges/${id}/join`, {}, token);
    await load();
  }

  return (
    <section className="student-club">
      <div className="student-sheet-heading">
        <span>Desafios</span>
        <h1>Desafios da comunidade</h1>
        <p>Ranking por métricas, conquistas e desafios locais com base nas suas atividades outdoor.</p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <article className="student-club-card student-club-ranking-card">
        <header>
          <Trophy size={22} />
          <div>
            <strong>Ranking local</strong>
            <small>
              {metricMeta.label} · {PERIOD_OPTIONS.find((item) => item.id === period)?.label ?? period}
              {leaderboard?.cell ? ` · célula ${leaderboard.cell}` : ""}
            </small>
          </div>
        </header>
        <div className="student-club-tabs">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "is-on" : ""}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="student-club-tabs is-metrics">
          {METRIC_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={metric === item.id ? "is-on" : ""}
              onClick={() => setMetric(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {!leaderboard ? (
          <p className="student-club-hint">Ative a localização ou faça uma atividade na aba Corrida para entrar no ranking local.</p>
        ) : leaderboard.ranking.length === 0 ? (
          <p className="student-club-hint">Ainda não há atividade na área neste período.</p>
        ) : (
          <div className="student-club-ranking-list">
            {leaderboard.ranking.map((row) => (
              <div key={row.userId} className={`student-club-rank-row${row.isMe ? " is-me" : ""}`}>
                <span>#{row.rank}</span>
                <strong>{row.isMe ? "Você" : row.name}</strong>
                <em>{formatMetricValue(metric, row.metricValue)}</em>
              </div>
            ))}
            {leaderboard.me && !leaderboard.ranking.some((row) => row.isMe) ? (
              <p className="student-club-hint">
                Sua posição: #{leaderboard.me.rank} · {formatMetricValue(metric, leaderboard.me.metricValue)}
              </p>
            ) : null}
          </div>
        )}
      </article>

      <article className="student-club-card student-club-achievements-card">
        <header>
          <Award size={22} />
          <div>
            <strong>Conquistas</strong>
            <small>{achievements?.earned.length ?? 0} desbloqueada(s)</small>
          </div>
          <Medal size={18} />
        </header>
        {(achievements?.earned.length ?? 0) > 0 ? (
          <div className="student-club-achievement-grid">
            {achievements?.earned.map((item) => (
              <article key={item.slug} className="student-club-achievement-item is-earned">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="student-club-hint">Complete atividades e desafios para desbloquear conquistas.</p>
        )}
        {(achievements?.pending.length ?? 0) > 0 ? (
          <div className="student-club-achievement-pending">
            {achievements?.pending.slice(0, 4).map((item) => (
              <div key={item.slug}>
                <p>
                  <span>{item.title}</span>
                  <em>{item.percent}%</em>
                </p>
                <b>
                  <i style={{ width: `${item.percent}%` }} />
                </b>
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <div className="student-club-grid">
        {loading && challenges.length === 0 ? <p className="student-club-hint">Carregando desafios...</p> : null}
        {challenges.map((challenge) => (
          <article className="student-club-card" key={challenge.id}>
            <header>
              <Trophy size={22} />
              <div>
                <strong>{challenge.title}</strong>
                <small>
                  {challenge.sportLabel} · {challenge.period === "WEEK" ? "Semanal" : challenge.period === "MONTH" ? "Mensal" : "Aberto"}
                  {challenge.scopedLocal ? " · área local" : ""}
                </small>
              </div>
              <Trophy size={18} />
            </header>
            <p>{challenge.description}</p>
            <div className="student-club-progress">
              <span style={{ width: `${challenge.percent}%` }} />
            </div>
            <footer>
              <em>
                {formatKm(challenge.progressMeters)} / {formatKm(challenge.goalMeters)} km
              </em>
              {challenge.joined ? (
                <strong>Participando</strong>
              ) : (
                <button type="button" className="student-green-button" onClick={() => void join(challenge.id)}>
                  Entrar
                </button>
              )}
            </footer>
            {challenge.joined && (challengeRankings[challenge.id]?.length ?? 0) > 0 ? (
              <div className="student-club-ranking-list is-compact">
                <small>Ranking do desafio</small>
                {challengeRankings[challenge.id]?.slice(0, 5).map((row) => (
                  <div key={row.userId} className={`student-club-rank-row${row.isMe ? " is-me" : ""}`}>
                    <span>#{row.rank}</span>
                    <strong>{row.isMe ? "Você" : row.name}</strong>
                    <em>{formatKm(row.progressMeters)} km</em>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
