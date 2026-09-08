import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiGet, apiPost } from "../../auth/api";
import { formatKm } from "../../student/activity-geo";
import { EmptyState, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { trackingEngine } from "../../tracking";
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

const METRIC_OPTIONS: Array<{ id: LeaderboardMetric; label: string }> = [
  { id: "distance", label: "Distância" },
  { id: "activities", label: "Atividades" },
  { id: "calories", label: "Calorias" },
  { id: "elevation", label: "Desnível" },
  { id: "time", label: "Tempo" }
];

function formatMetricValue(metric: LeaderboardMetric, value: number) {
  if (metric === "distance") return `${formatKm(value)} km`;
  if (metric === "calories") return `${Math.round(value)} kcal`;
  if (metric === "elevation") return `${Math.round(value)} m`;
  if (metric === "time") return `${Math.round(value / 60)} min`;
  return String(Math.round(value));
}

export function ClubScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const [challenges, setChallenges] = useState<ClubChallengeRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [achievements, setAchievements] = useState<ActivityAchievementsResponse | null>(null);
  const [challengeRankings, setChallengeRankings] = useState<Record<string, ChallengeRankingRow[]>>({});
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [metric, setMetric] = useState<LeaderboardMetric>("distance");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metricMeta = METRIC_OPTIONS.find((item) => item.id === metric) ?? METRIC_OPTIONS[0];

  async function loadChallengeRanking(challengeId: string) {
    const data = await apiGet<{ ranking: ChallengeRankingRow[] }>(
      `/student/social/challenges/${challengeId}/ranking`,
      session.token
    );
    setChallengeRankings((current) => ({ ...current, [challengeId]: data.ranking ?? [] }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let fix = coords;
      if (!fix) {
        try {
          await trackingEngine.init();
          fix = await trackingEngine.locateOnce();
          if (fix) setCoords({ lat: fix.lat, lng: fix.lng });
        } catch {
          fix = null;
        }
      }
      const challengeUrl = fix
        ? `/student/social/challenges?lat=${fix.lat}&lng=${fix.lng}`
        : "/student/social/challenges";
      const [challengeData, achievementData, boardData] = await Promise.all([
        apiGet<{ challenges: ClubChallengeRow[] }>(challengeUrl, session.token),
        apiGet<ActivityAchievementsResponse>("/student/social/achievements", session.token),
        fix
          ? apiGet<LeaderboardResponse>(
              `/student/activities/leaderboard?lat=${fix.lat}&lng=${fix.lng}&period=${period}&metric=${metric}&limit=10`,
              session.token
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
  }, [coords, metric, period, session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(id: string) {
    await apiPost(`/student/social/challenges/${id}/join`, {}, session.token);
    await load();
  }

  return (
    <StudentPage refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={st.gold} />}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>Desafios</Text>
        <Text style={styles.title}>Desafios da comunidade</Text>
        <Text style={styles.copy}>Ranking por métricas, conquistas e desafios locais com base nas suas atividades outdoor.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={styles.head}>
          <Ionicons name="podium-outline" size={22} color={st.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Ranking local</Text>
            <Text style={styles.meta}>
              {metricMeta.label} · {PERIOD_OPTIONS.find((item) => item.id === period)?.label ?? period}
              {leaderboard?.cell ? ` · célula ${leaderboard.cell}` : ""}
            </Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PERIOD_OPTIONS.map((item) => (
            <Pressable key={item.id} style={[styles.chip, period === item.id && styles.chipOn]} onPress={() => setPeriod(item.id)}>
              <Text style={[styles.chipText, period === item.id && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {METRIC_OPTIONS.map((item) => (
            <Pressable key={item.id} style={[styles.chip, metric === item.id && styles.chipOn]} onPress={() => setMetric(item.id)}>
              <Text style={[styles.chipText, metric === item.id && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {!leaderboard ? (
          <Text style={styles.copy}>Ative a localização ou faça uma atividade na aba Corrida para entrar no ranking local.</Text>
        ) : leaderboard.ranking.length === 0 ? (
          <Text style={styles.copy}>Ainda não há atividade na área neste período.</Text>
        ) : (
          leaderboard.ranking.map((row) => (
            <View key={row.userId} style={[styles.rankRow, row.isMe && styles.rankMe]}>
              <Text style={styles.rank}>#{row.rank}</Text>
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {row.isMe ? "Você" : row.name}
              </Text>
              <Text style={styles.meta}>{formatMetricValue(metric, row.metricValue)}</Text>
            </View>
          ))
        )}
        {leaderboard?.me && !leaderboard.ranking.some((row) => row.isMe) ? (
          <Text style={styles.meta}>
            Sua posição: #{leaderboard.me.rank} · {formatMetricValue(metric, leaderboard.me.metricValue)}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.head}>
          <Ionicons name="ribbon-outline" size={22} color={st.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Conquistas</Text>
            <Text style={styles.meta}>{achievements?.earned.length ?? 0} desbloqueada(s)</Text>
          </View>
        </View>
        {(achievements?.earned.length ?? 0) > 0 ? (
          achievements!.earned.map((item) => (
            <View key={item.slug} style={styles.achievement}>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.copy}>{item.description}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.copy}>Complete atividades e desafios para desbloquear conquistas.</Text>
        )}
        {(achievements?.pending.length ?? 0) > 0 ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {achievements!.pending.slice(0, 4).map((item) => (
              <View key={item.slug}>
                <View style={styles.pendingHead}>
                  <Text style={styles.meta}>{item.title}</Text>
                  <Text style={styles.meta}>{item.percent}%</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, item.percent)}%` }]} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {loading && challenges.length === 0 ? <Text style={styles.copy}>Carregando desafios...</Text> : null}
      {challenges.length === 0 && !loading ? (
        <EmptyState icon="trophy-outline" title="Nenhum desafio" text="Os desafios da comunidade aparecem aqui." />
      ) : (
        challenges.map((challenge) => (
          <View key={challenge.id} style={styles.card}>
            <View style={styles.head}>
              <Ionicons name="trophy-outline" size={22} color={st.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{challenge.title}</Text>
                <Text style={styles.meta}>
                  {challenge.sportLabel} · {challenge.period === "WEEK" ? "Semanal" : challenge.period === "MONTH" ? "Mensal" : "Aberto"}
                  {challenge.scopedLocal ? " · área local" : ""}
                </Text>
              </View>
            </View>
            <Text style={styles.copy}>{challenge.description}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${challenge.percent}%` }]} />
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>
                {formatKm(challenge.progressMeters)} / {formatKm(challenge.goalMeters)} km
              </Text>
              {challenge.joined ? (
                <Text style={styles.name}>Participando</Text>
              ) : (
                <Pressable style={styles.join} onPress={() => void join(challenge.id)}>
                  <Text style={styles.joinText}>Entrar</Text>
                </Pressable>
              )}
            </View>
            {challenge.joined && (challengeRankings[challenge.id]?.length ?? 0) > 0 ? (
              <View style={{ gap: 4, marginTop: 4 }}>
                <Text style={styles.meta}>Ranking do desafio</Text>
                {challengeRankings[challenge.id]?.slice(0, 5).map((row) => (
                  <View key={row.userId} style={[styles.rankRow, row.isMe && styles.rankMe]}>
                    <Text style={styles.rank}>#{row.rank}</Text>
                    <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                      {row.isMe ? "Você" : row.name}
                    </Text>
                    <Text style={styles.meta}>{formatKm(row.progressMeters)} km</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    heading: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
    kicker: { color: st.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" },
    title: { color: st.text, fontSize: 24, fontWeight: "800" },
    copy: { color: st.muted, lineHeight: 20 },
    error: { color: st.danger, paddingHorizontal: 16, marginBottom: 8 },
    card: {
      marginHorizontal: 16,
      marginTop: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      gap: 10
    },
    head: { flexDirection: "row", alignItems: "center", gap: 10 },
    name: { color: st.text, fontWeight: "800" },
    meta: { color: st.muted, fontSize: 12 },
    chips: { flexDirection: "row", gap: 8, paddingVertical: 2 },
    chip: { borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: st.fill },
    chipOn: { backgroundColor: st.gold, borderColor: st.gold },
    chipText: { color: st.text, fontWeight: "700", fontSize: 12 },
    chipTextOn: { color: "#15100b" },
    track: { height: 10, borderRadius: 999, backgroundColor: st.fill, overflow: "hidden" },
    fill: { height: "100%", backgroundColor: st.coral },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    join: { backgroundColor: st.coral, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    joinText: { color: "#fff", fontWeight: "800" },
    rankRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: st.line
    },
    rankMe: { backgroundColor: "rgba(212,175,55,0.12)", marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
    rank: { color: st.gold, fontWeight: "900", width: 36 },
    achievement: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, gap: 4 },
    pendingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
  });
}
