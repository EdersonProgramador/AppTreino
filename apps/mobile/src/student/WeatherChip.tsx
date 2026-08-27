import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OutdoorSport } from "../types";
import { adviceForSport, type WeatherSnapshot } from "./weather";
import { useSt } from "./theme";

type Props = {
  weather: WeatherSnapshot | null;
  sport?: OutdoorSport | "WORKOUT" | null;
  compact?: boolean;
  onPress?: () => void;
};

export function WeatherChip({ weather, sport = null, compact = false, onPress }: Props) {
  const { st } = useSt();
  if (!weather) return null;
  const advice = adviceForSport(sport, weather);
  if (compact) {
    return (
      <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: "rgba(12,14,18,0.78)" }]}>
        <Ionicons name={weather.icon} size={16} color="#f2b461" />
        <Text style={styles.chipTemp}>{weather.tempC}°</Text>
        <Text style={styles.chipLabel} numberOfLines={1}>
          {weather.label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: st.cardSoft, borderColor: st.line }]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: st.avatarBg }]}>
          <Ionicons name={weather.icon} size={22} color={st.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: st.goldUi }]}>Clima agora</Text>
          <Text style={[styles.title, { color: st.text }]}>
            {weather.tempC}° · {weather.label}
          </Text>
          <Text style={[styles.meta, { color: st.muted }]}>
            Sensação {weather.apparentC}° · Vento {weather.windKmh} km/h · Umidade {weather.humidity}%
          </Text>
        </View>
      </View>
      <Text style={[styles.advice, { color: st.text }]}>{advice}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: 220
  },
  chipTemp: { color: "#fff", fontWeight: "800", fontSize: 13 },
  chipLabel: { color: "rgba(255,255,255,0.86)", fontWeight: "700", fontSize: 11, flexShrink: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 8
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 16, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 2 },
  advice: { fontSize: 13, fontWeight: "600", lineHeight: 18 }
});
