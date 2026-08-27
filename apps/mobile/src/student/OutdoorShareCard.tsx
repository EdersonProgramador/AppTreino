import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { formatClock, formatKm, formatPace } from "../student/activity-geo";
import { useSt } from "../student/theme";

type Props = {
  sportLabel: string;
  distanceMeters: number;
  elapsedSeconds: number;
  paceSecPerKm: number | null;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  stepsCount?: number;
  cadenceSpm?: number | null;
  powerWatts?: number | null;
  calories?: number;
  bestEffortLabel?: string | null;
  caption?: string | null;
};

/** Card de compartilhamento outdoor (fatia E) — usado no finish sheet. */
export function OutdoorShareCard({
  sportLabel,
  distanceMeters,
  elapsedSeconds,
  paceSecPerKm,
  elevationGainMeters = 0,
  elevationLossMeters = 0,
  stepsCount,
  cadenceSpm,
  powerWatts,
  calories,
  bestEffortLabel,
  caption
}: Props) {
  const { st } = useSt();

  async function share() {
    const lines = [
      `App Treino · ${sportLabel}`,
      `${formatKm(distanceMeters)} km · ${formatClock(elapsedSeconds)} · ${formatPace(paceSecPerKm)} /km`,
      elevationGainMeters || elevationLossMeters
        ? `↑ ${Math.round(elevationGainMeters)} m  ↓ ${Math.round(elevationLossMeters)} m`
        : null,
      stepsCount ? `${stepsCount} passos` : null,
      cadenceSpm != null ? `Cadência ${Math.round(cadenceSpm)} spm` : null,
      powerWatts != null ? `Potência ~${Math.round(powerWatts)} W` : null,
      calories ? `${calories} kcal` : null,
      bestEffortLabel ? `Best: ${bestEffortLabel}` : null,
      caption?.trim() || null
    ].filter(Boolean);
    await Share.share({ message: lines.join("\n") });
  }

  return (
    <View style={[styles.card, { backgroundColor: st.card, borderColor: st.line }]}>
      <Text style={[styles.kicker, { color: st.muted }]}>App Treino · Outdoor</Text>
      <Text style={[styles.title, { color: st.text }]}>{sportLabel}</Text>
      <View style={styles.row}>
        <Stat label="Distância" value={`${formatKm(distanceMeters)} km`} color={st.text} muted={st.muted} />
        <Stat label="Tempo" value={formatClock(elapsedSeconds)} color={st.text} muted={st.muted} />
        <Stat label="Ritmo" value={formatPace(paceSecPerKm)} color={st.text} muted={st.muted} />
      </View>
      <View style={styles.row}>
        <Stat label="↑ Elev" value={`${Math.round(elevationGainMeters)} m`} color={st.text} muted={st.muted} />
        <Stat label="↓ Elev" value={`${Math.round(elevationLossMeters)} m`} color={st.text} muted={st.muted} />
        <Stat label="Best" value={bestEffortLabel ?? "—"} color={st.text} muted={st.muted} />
      </View>
      {Boolean(stepsCount || cadenceSpm != null || powerWatts != null || calories) ? (
        <View style={styles.row}>
          <Stat label="Passos" value={stepsCount ? String(stepsCount) : "—"} color={st.text} muted={st.muted} />
          <Stat
            label="Cadência"
            value={cadenceSpm != null ? `${Math.round(cadenceSpm)}` : "—"}
            color={st.text}
            muted={st.muted}
          />
          <Stat
            label={powerWatts != null ? "Potência" : "kcal"}
            value={powerWatts != null ? `${Math.round(powerWatts)} W` : calories ? String(calories) : "—"}
            color={st.text}
            muted={st.muted}
          />
        </View>
      ) : null}
      <Pressable style={[styles.btn, { backgroundColor: st.goldUi }]} onPress={() => void share()}>
        <Text style={styles.btnText}>Compartilhar</Text>
      </Pressable>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  muted
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 12
  },
  kicker: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  stat: { flex: 1 },
  statLabel: { fontSize: 11, fontWeight: "600" },
  statValue: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  btn: { marginTop: 4, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#111", fontWeight: "800" }
});
