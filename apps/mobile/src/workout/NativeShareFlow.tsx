import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { runner } from "./runnerTheme";
import { uiSounds } from "../student/uiSounds";

type ShareModel = "simple" | "photo";

export function NativeShareFlow({
  programTitle,
  blockTitle,
  exerciseCount,
  durationLabel,
  busy,
  onDismiss
}: {
  programTitle: string;
  blockTitle: string;
  exerciseCount: number;
  durationLabel: string;
  busy?: boolean;
  onDismiss: () => void | Promise<void>;
}) {
  const [model, setModel] = useState<ShareModel | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const ready = Boolean(model) && (model !== "photo" || photoUrl);

  async function pickPhoto(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [3, 4] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [3, 4] });
    if (!result.canceled && result.assets[0]?.uri) {
      uiSounds.screenshot();
      setPhotoUrl(result.assets[0].uri);
    }
  }

  async function share() {
    if (!ready || sharing || busy) return;
    setSharing(true);
    uiSounds.submit();
    try {
      const message = `O TREINO DE HOJE ESTÁ PAGO!\n${programTitle}\n${blockTitle}\n${exerciseCount} exercícios · ${durationLabel}`;
      if (photoUrl && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(photoUrl, { dialogTitle: "Compartilhar treino", mimeType: "image/jpeg" });
      } else {
        const { Share } = await import("react-native");
        await Share.share({ message, title: programTitle });
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>O treino de hoje está pago</Text>
          <Text style={styles.copy}>Escolha o modelo e compartilhe. O treino só é concluído ao tocar em Fechar.</Text>
          {!model ? (
            <View style={styles.row}>
              <Pressable style={styles.choice} onPress={() => {
                uiSounds.itemSelect();
                setModel("simple");
              }}>
                <View style={styles.circle}>
                  <Ionicons name="trophy" size={28} color="#fff" />
                </View>
                <Text style={styles.choiceText}>Modelo simples</Text>
              </Pressable>
              <Pressable style={styles.choice} onPress={() => {
                uiSounds.itemSelect();
                setModel("photo");
              }}>
                <View style={[styles.circle, styles.circlePhoto]}>
                  <Ionicons name="camera" size={28} color="#fff" />
                </View>
                <Text style={styles.choiceText}>Com foto</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.badge}>App Treino Social</Text>
                <Text style={styles.cardTitle}>O TREINO DE HOJE ESTÁ PAGO!</Text>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.photo} />
                ) : (
                  <View style={styles.mark}>
                    <Ionicons name="trophy" size={42} color={runner.coral} />
                  </View>
                )}
                <Text style={styles.statLabel}>Programa</Text>
                <Text style={styles.stat}>{programTitle}</Text>
                <Text style={styles.statLabel}>Treino</Text>
                <Text style={styles.stat}>{blockTitle}</Text>
                <Text style={styles.statMuted}>
                  {exerciseCount} exercícios · {durationLabel}
                </Text>
              </View>
              {model === "photo" && !photoUrl ? (
                <View style={styles.row}>
                  <Pressable style={styles.secondary} onPress={() => void pickPhoto(true)}>
                    <Text style={styles.secondaryText}>Câmera</Text>
                  </Pressable>
                  <Pressable style={styles.secondary} onPress={() => void pickPhoto(false)}>
                    <Text style={styles.secondaryText}>Galeria</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.primary, (!ready || sharing || busy) && styles.disabled]}
                  disabled={!ready || sharing || busy}
                  onPress={() => void share()}
                >
                  <Text style={styles.primaryText}>{sharing ? "Abrindo..." : "Compartilhar"}</Text>
                </Pressable>
              )}
            </>
          )}
          <Pressable style={styles.close} onPress={() => {
            uiSounds.popupClose();
            void onDismiss();
          }}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
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
  title: { color: runner.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  copy: { color: runner.muted, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", gap: 12 },
  choice: {
    flex: 1,
    minHeight: 148,
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: runner.coral
  },
  circlePhoto: { backgroundColor: runner.ember },
  choiceText: { color: runner.text, fontWeight: "800", fontSize: 13, textAlign: "center" },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#1a140c",
    alignItems: "center",
    gap: 6
  },
  badge: { color: runner.gold, fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  cardTitle: { color: "#fff7ec", fontWeight: "800", fontSize: 18, textAlign: "center" },
  photo: { width: "100%", height: 200, borderRadius: 14 },
  mark: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: "rgba(242,180,97,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  statLabel: { color: "rgba(255,247,236,0.55)", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  stat: { color: "#fff7ec", fontWeight: "800", textAlign: "center" },
  statMuted: { color: "rgba(255,247,236,0.7)" },
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
  secondaryText: { color: runner.text, fontWeight: "800" },
  disabled: { opacity: 0.7 },
  close: { minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: runner.line, borderRadius: 14 },
  closeText: { color: "#3d3f45", fontWeight: "900" }
});
