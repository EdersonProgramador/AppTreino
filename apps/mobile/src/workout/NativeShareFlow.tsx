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
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { AppVideo } from "../components/AppVideo";
import { pickFeedMedia } from "../lib/nativeMediaPick";
import { mediaUrl } from "../lib/media";
import { uploadPickerAsset } from "../lib/uploadMedia";
import { runner } from "./runnerTheme";
import { uiSounds } from "../student/uiSounds";

type ShareModel = "simple" | "photo";

export type WorkoutShareMediaItem = {
  url: string;
  type: "IMAGE" | "VIDEO";
  coverUrl?: string | null;
  localUri?: string;
};

export type WorkoutSharePayload = {
  publish: boolean;
  caption?: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
  mediaItems?: WorkoutShareMediaItem[];
  exerciseCount?: number;
};

export function NativeShareFlow({
  token,
  programTitle,
  blockTitle,
  exerciseCount,
  durationLabel,
  busy,
  onPublish,
  onFinishWithoutPublish
}: {
  token: string;
  programTitle: string;
  blockTitle: string;
  exerciseCount: number;
  durationLabel: string;
  busy?: boolean;
  onPublish: (payload: WorkoutSharePayload) => void | Promise<void>;
  onFinishWithoutPublish: () => void | Promise<void>;
}) {
  const [model, setModel] = useState<ShareModel | null>(null);
  const [mediaItems, setMediaItems] = useState<WorkoutShareMediaItem[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = mediaItems.find((item) => item.type === "IMAGE");
  const video = mediaItems.find((item) => item.type === "VIDEO");
  const ready = Boolean(model) && (model !== "photo" || mediaItems.length > 0);
  const locked = Boolean(busy || uploading || sharing);

  function payload(publish: boolean): WorkoutSharePayload {
    return {
      publish,
      caption: caption.trim() || undefined,
      photoUrl: photo?.url ?? null,
      videoUrl: video?.url ?? null,
      mediaItems: mediaItems.length
        ? mediaItems.map(({ url, type, coverUrl }) => ({ url, type, coverUrl }))
        : undefined,
      exerciseCount
    };
  }

  async function addUploads(items: Array<{ url: string; type: "IMAGE" | "VIDEO"; localUri?: string }>) {
    if (!items.length) return;
    setMediaItems((current) =>
      [
        ...current,
        ...items.map((item) => ({
          url: item.url,
          type: item.type,
          coverUrl: item.type === "IMAGE" ? item.url : null,
          localUri: item.localUri
        }))
      ].slice(0, 10)
    );
    uiSounds.screenshot();
  }

  async function pickFromLibrary() {
    if (locked) return;
    setError(null);
    setUploading(true);
    try {
      const uploads = await pickFeedMedia({ token, remainingSlots: Math.max(1, 10 - mediaItems.length) });
      await addUploads(uploads);
    } catch {
      setError("Não foi possível anexar a mídia.");
      uiSounds.error();
    } finally {
      setUploading(false);
    }
  }

  async function pickPhoto(fromCamera: boolean) {
    if (locked) return;
    setError(null);
    setUploading(true);
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Permita o acesso à câmera ou à galeria.");
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true, aspect: [3, 4] })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            allowsEditing: true,
            aspect: [3, 4]
          });
      if (result.canceled || !result.assets[0]) return;
      const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
        "/student/social/uploads",
        result.assets[0],
        token,
        "treino"
      );
      await addUploads([{ url: uploaded.file.url, type: mediaType, localUri: result.assets[0].uri }]);
    } catch {
      setError("Não foi possível enviar a foto.");
      uiSounds.error();
    } finally {
      setUploading(false);
    }
  }

  async function pickVideo() {
    if (locked) return;
    setError(null);
    setUploading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Permita o acesso à galeria.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.85,
        videoMaxDuration: 60
      });
      if (result.canceled || !result.assets[0]) return;
      const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
        "/student/social/uploads",
        result.assets[0],
        token,
        "treino"
      );
      await addUploads([{ url: uploaded.file.url, type: mediaType, localUri: result.assets[0].uri }]);
    } catch {
      setError("Não foi possível enviar o vídeo.");
      uiSounds.error();
    } finally {
      setUploading(false);
    }
  }

  async function shareNative() {
    if (locked) return;
    setSharing(true);
    uiSounds.submit();
    try {
      const lines = [
        "O TREINO DE HOJE ESTÁ PAGO!",
        programTitle,
        blockTitle,
        `${exerciseCount} exercícios · ${durationLabel}`,
        caption.trim() || null
      ].filter(Boolean);
      await Share.share({ message: lines.join("\n"), title: programTitle });
    } finally {
      setSharing(false);
    }
  }

  const previewUri =
    photo?.localUri ||
    (photo?.url ? mediaUrl(photo.url) : "") ||
    video?.localUri ||
    (video?.url ? mediaUrl(video.url) : null);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.trophy}>
            <Ionicons name="trophy" size={36} color={runner.coral} />
          </View>
          <Text style={styles.title}>Treino concluído</Text>
          <Text style={styles.copy}>
            Escolha o modelo e publique. Tempo, exercícios e as demais métricas vão para o Feed.
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
                  <Ionicons name="trophy" size={28} color="#fff" />
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
                  <Ionicons name="camera" size={28} color="#fff" />
                </View>
                <Text style={styles.choiceText}>Com foto ou vídeo</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.badge}>App Treino Social</Text>
                <Text style={styles.cardTitle}>O TREINO DE HOJE ESTÁ PAGO!</Text>
                {previewUri && video && !photo ? (
                  <AppVideo uri={previewUri} style={styles.photo} contentFit="cover" nativeControls muted />
                ) : previewUri ? (
                  <Image source={{ uri: previewUri }} style={styles.photo} />
                ) : (
                  <View style={styles.mark}>
                    <Ionicons name="trophy" size={42} color={runner.coral} />
                  </View>
                )}
                <View style={styles.metrics}>
                  <Metric label="Programa" value={programTitle} />
                  <Metric label="Treino" value={blockTitle} />
                </View>
                <View style={styles.metrics}>
                  <Metric label="Exercícios" value={String(exerciseCount)} />
                  <Metric label="Tempo" value={durationLabel} />
                </View>
              </View>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Como foi o treino?"
                placeholderTextColor={runner.faint}
                style={styles.input}
                multiline
                editable={!locked}
              />
              {model === "photo" && !mediaItems.length ? (
                <View style={styles.row}>
                  <Pressable style={styles.secondary} disabled={locked} onPress={() => void pickPhoto(true)}>
                    <Text style={styles.secondaryText}>{uploading ? "..." : "Câmera"}</Text>
                  </Pressable>
                  <Pressable style={styles.secondary} disabled={locked} onPress={() => void pickFromLibrary()}>
                    <Text style={styles.secondaryText}>Galeria</Text>
                  </Pressable>
                  <Pressable style={styles.secondary} disabled={locked} onPress={() => void pickVideo()}>
                    <Text style={styles.secondaryText}>Vídeo</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {model === "photo" && mediaItems.length < 10 ? (
                    <Pressable style={styles.secondaryFull} disabled={locked} onPress={() => void pickFromLibrary()}>
                      <Text style={styles.secondaryText}>{uploading ? "Enviando..." : "Adicionar mídia"}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.primary, (!ready || locked) && styles.disabled]}
                    disabled={!ready || locked}
                    onPress={() => {
                      uiSounds.submit();
                      void onPublish(payload(true));
                    }}
                  >
                    <Text style={styles.primaryText}>{busy ? "Publicando..." : "Publicar no Feed"}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryFull} disabled={locked} onPress={() => void shareNative()}>
                    <Text style={styles.secondaryText}>{sharing ? "Abrindo..." : "Compartilhar"}</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={styles.close}
            disabled={locked}
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
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={2}>
        {value}
      </Text>
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
  row: { flexDirection: "row", gap: 8 },
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
    gap: 8
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
  metrics: { flexDirection: "row", gap: 8, width: "100%" },
  metric: { flex: 1, minWidth: 0, alignItems: "center" },
  metricLabel: { color: "rgba(255,247,236,0.55)", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: "#fff7ec", fontWeight: "800", textAlign: "center", marginTop: 2 },
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
