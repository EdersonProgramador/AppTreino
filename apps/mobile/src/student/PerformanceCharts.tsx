import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StreakKind } from "./StreakCalendar";
import { useSt } from "./theme";

export type SportTotals = Record<
  StreakKind,
  { count: number; km: number; minutes: number; calories?: number }
>;

export type WeeklyVolume = { weekStart: string; workouts: number; outdoorKm: number; minutes: number };

type Props = {
  streak: number;
  sportTotals?: SportTotals | null;
  weeklyVolume?: WeeklyVolume[] | null;
};

const SPORT_META: Array<{ id: StreakKind; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: "WORKOUT", label: "Treino", icon: "barbell-outline" },
  { id: "RUN", label: "Corrida", icon: "fitness-outline" },
  { id: "WALK", label: "Caminhada", icon: "walk-outline" },
  { id: "RIDE", label: "Pedal", icon: "bicycle-outline" }
];

function weekLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function PerformanceCharts({ streak, sportTotals, weeklyVolume }: Props) {
  const { st } = useSt();
  const weeks = (weeklyVolume ?? []).slice(-8);
  const maxMinutes = Math.max(1, ...weeks.map((item) => item.minutes));
  const [focus, setFocus] = useState<WeeklyVolume | null>(weeks[weeks.length - 1] ?? null);
  const totalSessions = SPORT_META.reduce((sum, item) => sum + (sportTotals?.[item.id]?.count ?? 0), 0);
  const mixMax = Math.max(1, ...SPORT_META.map((item) => sportTotals?.[item.id]?.count ?? 0));

  const insight = useMemo(() => {
    if (!focus) return streak > 0 ? `${streak} dia(s) de ofensiva. Mantenha a sequência.` : "Comece hoje e abra a ofensiva.";
    return `${weekLabel(focus.weekStart)} · ${focus.workouts} treino(s) · ${focus.outdoorKm.toFixed(1)} km outdoor · ${focus.minutes} min`;
  }, [focus, streak]);

  return (
    <View style={[styles.wrap, { backgroundColor: st.panelBg, borderColor: st.line }]}>
      <View style={styles.head}>
        <View>
          <Text style={[styles.kicker, { color: st.goldUi }]}>Performance</Text>
          <Text style={[styles.title, { color: st.text }]}>Métricas da ofensiva</Text>
        </View>
        <View style={[styles.streakPill, { backgroundColor: "rgba(223,102,60,0.14)" }]}>
          <Ionicons name="flame" size={14} color={st.coral} />
          <Text style={[styles.streakText, { color: st.coral }]}>{streak}d</Text>
        </View>
      </View>

      <Text style={[styles.insight, { color: st.muted }]}>{insight}</Text>

      <View style={styles.bars}>
        {weeks.length === 0 ? (
          <Text style={[styles.empty, { color: st.faint }]}>Sem volume ainda. Conclua um treino ou uma corrida.</Text>
        ) : (
          weeks.map((week) => {
            const height = Math.max(8, Math.round((week.minutes / maxMinutes) * 88));
            const on = focus?.weekStart === week.weekStart;
            return (
              <Pressable key={week.weekStart} onPress={() => setFocus(week)} style={styles.barCol}>
                <View style={[styles.barTrack, { backgroundColor: st.fill }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height,
                        backgroundColor: on ? st.coral : st.gold
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.barLabel, { color: on ? st.text : st.faint }]}>{weekLabel(week.weekStart)}</Text>
              </Pressable>
            );
          })
        )}
      </View>

      <Text style={[styles.mixTitle, { color: st.text }]}>Mix de modalidades</Text>
      <View style={styles.mix}>
        {SPORT_META.map((item) => {
          const row = sportTotals?.[item.id];
          const count = row?.count ?? 0;
          return (
            <View key={item.id} style={styles.mixRow}>
              <View style={styles.mixLabel}>
                <Ionicons name={item.icon} size={14} color={st.gold} />
                <Text style={[styles.mixName, { color: st.text }]}>{item.label}</Text>
                <Text style={[styles.mixCount, { color: st.muted }]}>
                  {count}
                  {item.id === "WORKOUT" ? "" : ` · ${(row?.km ?? 0).toFixed(1)} km`}
                </Text>
              </View>
              <View style={[styles.mixTrack, { backgroundColor: st.fill }]}>
                <View
                  style={[
                    styles.mixFill,
                    {
                      width: `${count ? Math.round((count / mixMax) * 100) : 0}%` as `${number}%`,
                      backgroundColor: st.coral
                    }
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[styles.foot, { color: st.faint }]}>
        {totalSessions} sessão(ões) no período. Toque numa barra para ver a semana.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "800" },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  streakText: { fontWeight: "800", fontSize: 13 },
  insight: { fontSize: 13, lineHeight: 18 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, minHeight: 110 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { width: "100%", height: 92, borderRadius: 10, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 10 },
  barLabel: { fontSize: 9, fontWeight: "700" },
  empty: { fontSize: 13 },
  mixTitle: { fontSize: 14, fontWeight: "800" },
  mix: { gap: 8 },
  mixRow: { gap: 4 },
  mixLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  mixName: { fontSize: 13, fontWeight: "700", flex: 1 },
  mixCount: { fontSize: 12, fontWeight: "700" },
  mixTrack: { height: 8, borderRadius: 99, overflow: "hidden" },
  mixFill: { height: "100%", borderRadius: 99 },
  foot: { fontSize: 12 }
});
