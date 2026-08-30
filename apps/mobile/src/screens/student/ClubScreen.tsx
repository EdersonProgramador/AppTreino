import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiGet, apiPost } from "../../auth/api";
import { formatKm } from "../../student/activity-geo";
import { EmptyState, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { trackingEngine } from "../../tracking";
import type { ClubChallengeRow } from "../../types";

type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  distanceMeters: number;
  activities: number;
  isMe: boolean;
};

type LeaderboardResponse = {
  cell: string;
  ranking: LeaderboardRow[];
  me: LeaderboardRow | null;
};

export function ClubScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const [challenges, setChallenges] = useState<ClubChallengeRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let challengeUrl = "/student/social/challenges";
      try {
        await trackingEngine.init();
        const fix = await trackingEngine.locateOnce();
        if (fix) {
          challengeUrl = `/student/social/challenges?lat=${fix.lat}&lng=${fix.lng}`;
          const board = await apiGet<LeaderboardResponse>(
            `/student/activities/leaderboard?lat=${fix.lat}&lng=${fix.lng}&period=week&limit=8`,
            session.token
          );
          setLeaderboard(board);
        } else {
          setLeaderboard(null);
        }
      } catch {
        setLeaderboard(null);
      }
      const data = await apiGet<{ challenges: ClubChallengeRow[] }>(challengeUrl, session.token);
      setChallenges(data.challenges);
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StudentPage refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={st.gold} />}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>Desafios</Text>
        <Text style={styles.title}>Desafios da comunidade</Text>
        <Text style={styles.copy}>Entre em um desafio e complete a distância na aba Corrida.</Text>
      </View>

      {leaderboard && leaderboard.ranking.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.head}>
            <Ionicons name="map-outline" size={22} color={st.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Ranking local (semana)</Text>
              <Text style={styles.meta}>Célula {leaderboard.cell}</Text>
            </View>
            <Ionicons name="podium-outline" size={18} color={st.gold} />
          </View>
          {leaderboard.ranking.map((row) => (
            <View key={row.userId} style={[styles.rankRow, row.isMe && styles.rankMe]}>
              <Text style={styles.rank}>#{row.rank}</Text>
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {row.isMe ? "Você" : row.name}
              </Text>
              <Text style={styles.meta}>{formatKm(row.distanceMeters)} km</Text>
            </View>
          ))}
          {leaderboard.me && !leaderboard.ranking.some((r) => r.isMe) ? (
            <Text style={styles.meta}>Sua posição: #{leaderboard.me.rank} · {formatKm(leaderboard.me.distanceMeters)} km</Text>
          ) : null}
        </View>
      ) : null}

      {challenges.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Nenhum desafio" text="Os desafios da comunidade aparecem aqui." />
      ) : (
        challenges.map((challenge) => (
          <View key={challenge.id} style={styles.card}>
            <View style={styles.head}>
              <Ionicons name="trophy-outline" size={22} color={st.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{challenge.title}</Text>
                <Text style={styles.meta}>
                  {challenge.sportLabel} · {challenge.period === "WEEK" ? "Semanal" : "Mensal"}
                  {challenge.scopedLocal ? " · área local" : ""}
                </Text>
              </View>
              <Ionicons name="trophy-outline" size={18} color={st.gold} />
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
                <Pressable
                  style={styles.join}
                  onPress={async () => {
                    await apiPost(`/student/social/challenges/${challenge.id}/join`, {}, session.token);
                    await load();
                  }}
                >
                  <Text style={styles.joinText}>Entrar</Text>
                </Pressable>
              )}
            </View>
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
    card: {
      margin: 16,
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
    rank: { color: st.gold, fontWeight: "900", width: 36 }
  });
}
