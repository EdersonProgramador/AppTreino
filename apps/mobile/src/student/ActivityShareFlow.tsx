import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { runner } from "../workout/runnerTheme";
import { uiSounds } from "./uiSounds";
import { formatClock, formatKm, formatPace } from "./activity-geo";
import { ActivityRouteMap } from "./ActivityRouteMap";

type ShareModel = "simple" | "photo";

export type ActivityShareStats = {
  sportLabel: string;
  sport: "RUN" | "WALK" | "RIDE";
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
  mapType?: "standard" | "satellite" | "hybrid" | "winter";
  is3d?: boolean;
  lapsCount?: number;
  kmIndex?: number;
  kmPaceSecPerKm?: number | null;
  points: Array<{ lat: number; lng: number }>;
};

export function ActivityShareFlow({
  stats,
  caption,
  onCaptionChange,
  photoUrl,
  onPickPhoto,
  busy,
  error,
  onPublish,
  onFinishWithoutPublish
}: {
  stats: ActivityShareStats;
  caption: string;
  onCaptionChange: (value: string) => void;
  photoUrl: string | null;
  onPickPhoto: (fromCamera: boolean) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  onPublish: () => void | Promise<void>;
  onFinishWithoutPublish: () => void | Promise<void>;
}) {
  const [model, setModel] = useState<ShareModel | null>(null);
  const ready = Boolean(model) && (model !== "photo" || photoUrl);
  const isRide = stats.sport === "RIDE";
  const speedLabel =
    stats.speedKmh && stats.speedKmh > 0 ? `${stats.speedKmh.toFixed(1)} km/h` : "—";

  async function shareNative() {
    uiSounds.submit();
    const lines = [
      `App Treino · ${stats.sportLabel}`,
      `${formatKm(stats.distanceMeters)} km · ${formatClock(stats.elapsedSeconds)} · ${
        isRide ? speedLabel : `${formatPace(stats.paceSecPerKm)} /km`
      }`,
      stats.calories ? `${stats.calories} kcal` : null,
      stats.elevationGainMeters || stats.elevationLossMeters
        ? `↑ ${Math.round(stats.elevationGainMeters ?? 0)} m  ↓ ${Math.round(stats.elevationLossMeters ?? 0)} m`
        : null,
      caption.trim() || null
    ].filter(Boolean);
    await Share.share({ message: lines.join("\n"), title: stats.sportLabel });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.trophy}>
            <Ionicons name="trophy" size={36} color={runner.coral} />
          </View>
          <Text style={styles.title}>Percurso concluído</Text>
          <Text style={styles.copy}>
            Escolha o modelo e publique. Distância, ritmo, mapa e as demais métricas vão para o Feed.
          </Text>
          {!model ? (
            <View style={styles.row}>
              <Pressable
                style={styles.choice}
                onPress={() => {
                  uiSounds.itemSelect();
                  setModel("simple");
                }}
              >
                <View style={styles.circle}>
                  <Ionicons name="map" size={26} color="#fff" />
                </View>
                <Text style={styles.choiceText}>Modelo simples</Text>
              </Pressable>
              <Pressable
                style={styles.choice}
                onPress={() => {
                  uiSounds.itemSelect();
                  setModel("photo");
                }}
              >
                <View style={[styles.circle, styles.circlePhoto]}>
                  <Ionicons name="camera" size={26} color="#fff" />
                </View>
                <Text style={styles.choiceText}>Com foto</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.badge}>App Treino Social</Text>
                <Text style={styles.cardTitle}>{stats.sportLabel.toUpperCase()} CONCLUÍDA</Text>
                {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : null}
                <ActivityRouteMap
                  points={stats.points}
                  height={150}
                  mapType={
                    stats.mapType === "satellite" || stats.mapType === "hybrid" ? stats.mapType : "standard"
                  }
                  is3d={Boolean(stats.is3d)}
                />
                <View style={styles.metrics}>
                  <Metric label="Distância" value={`${formatKm(stats.distanceMeters)} km`} />
                  <Metric label="Tempo" value={formatClock(stats.elapsedSeconds)} />
                  <Metric label={isRide ? "Velocidade" : "Ritmo"} value={isRide ? speedLabel : formatPace(stats.paceSecPerKm)} />
                </View>
                <View style={styles.metrics}>
                  <Metric label="kcal" value={String(stats.calories ?? 0)} />
                  <Metric label="↑ Elev" value={`${Math.round(stats.elevationGainMeters ?? 0)} m`} />
                  <Metric
                    label={isRide ? "Cadência" : "Passos"}
                    value={
                      isRide
                        ? stats.cadenceSpm != null
                          ? `${Math.round(stats.cadenceSpm)} spm`
                          : "—"
                        : stats.stepsCount
                          ? String(stats.stepsCount)
                          : "—"
                    }
                  />
                </View>
                <View style={styles.metrics}>
                  <Metric
                    label={isRide ? "Ritmo" : "Velocidade"}
                    value={isRide ? formatPace(stats.paceSecPerKm) : speedLabel}
                  />
                  <Metric label={`Km ${stats.kmIndex ?? 1}`} value={formatPace(stats.kmPaceSecPerKm ?? null)} />
                  <Metric label="Voltas" value={String(stats.lapsCount ?? 0)} />
                </View>
              </View>
              <TextInput
                value={caption}
                onChangeText={onCaptionChange}
                placeholder="Como foi o percurso?"
                placeholderTextColor={runner.faint}
                style={styles.input}
                multiline
              />
              {model === "photo" && !photoUrl ? (
                <View style={styles.row}>
                  <Pressable style={styles.secondary} onPress={() => void onPickPhoto(true)}>
                    <Text style={styles.secondaryText}>Câmera</Text>
                  </Pressable>
                  <Pressable style={styles.secondary} onPress={() => void onPickPhoto(false)}>
                    <Text style={styles.secondaryText}>Galeria</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable
                    style={[styles.primary, (!ready || busy) && styles.disabled]}
                    disabled={!ready || busy}
                    onPress={() => {
                      uiSounds.submit();
                      void onPublish();
                    }}
                  >
                    <Text style={styles.primaryText}>{busy ? "Publicando..." : "Publicar no Feed"}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryFull} disabled={busy} onPress={() => void shareNative()}>
                    <Text style={styles.secondaryText}>Compartilhar</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={styles.close}
            disabled={busy}
            onPress={() => {
              uiSounds.popupClose();
              void onFinishWithoutPublish();
            }}
          >
            <Text style={styles.closeText}>{busy ? "Salvando..." : "Finalizar sem publicar"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "center", padding: 20 },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 22,
    gap: 14
  },
  trophy: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "rgba(242,180,97,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  title: { color: runner.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  copy: { color: runner.muted, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", gap: 12 },
  choice: {
    flex: 1,
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(223,102,60,0.22)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#fff8ee"
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: runner.coral
  },
  circlePhoto: { backgroundColor: runner.ember },
  choiceText: { color: runner.text, fontWeight: "800", fontSize: 13, textAlign: "center" },
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#1a140c",
    gap: 10
  },
  badge: { color: runner.gold, fontWeight: "800", fontSize: 11, textTransform: "uppercase", textAlign: "center" },
  cardTitle: { color: "#fff7ec", fontWeight: "800", fontSize: 16, textAlign: "center" },
  photo: { width: "100%", height: 180, borderRadius: 14 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minWidth: 0, alignItems: "center" },
  metricLabel: { color: "rgba(255,247,236,0.55)", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  metricValue: { color: "#fff7ec", fontWeight: "800", fontSize: 14, marginTop: 2, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: runner.line,
    borderRadius: 12,
    padding: 10,
    color: runner.text,
    minHeight: 64,
    textAlignVertical: "top"
  },
  primary: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: runner.coral,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryText: { color: runner.ink, fontWeight: "900", fontSize: 15 },
  secondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: runner.line,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryFull: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: runner.line,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryText: { color: runner.text, fontWeight: "800" },
  disabled: { opacity: 0.7 },
  close: { minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: runner.line, borderRadius: 14 },
  closeText: { color: "#3d3f45", fontWeight: "900" },
  error: { color: "#c73d2e", textAlign: "center", fontWeight: "700" }
});
