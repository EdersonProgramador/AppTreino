import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type NativeCameraCapture = {
  uri: string;
  type: "IMAGE" | "VIDEO";
  mimeType: string;
  fileName: string;
};

type NativeCameraModalProps = {
  visible: boolean;
  /** Initial mode; user can switch when `allowModeSwitch`. */
  mode?: "photo" | "video";
  allowModeSwitch?: boolean;
  maxVideoSeconds?: number;
  onClose: () => void;
  onCaptured: (asset: NativeCameraCapture) => void;
};

function openSettings(kind: "camera" | "mic") {
  Alert.alert(
    "Permissão necessária",
    `Permita acesso à ${kind === "camera" ? "câmera" : "microfone"} nas configurações.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Abrir ajustes", onPress: () => void Linking.openSettings() }
    ]
  );
}

/**
 * Câmera in-app (como a web `StudentCameraCapture`), via expo-camera CameraView.
 * Substitui `launchCameraAsync`, que falha com frequência no Expo Go.
 */
export function NativeCameraModal({
  visible,
  mode: initialMode = "photo",
  allowModeSwitch = true,
  maxVideoSeconds = 60,
  onClose,
  onCaptured
}: NativeCameraModalProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, setPermission] = useState<"checking" | "denied" | "granted">("checking");
  const [mode, setMode] = useState<"photo" | "video">(initialMode);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setReady(false);
    setRecording(false);
    setElapsed(0);
    setBusy(false);
    let cancelled = false;
    void (async () => {
      setPermission("checking");
      try {
        const cam = await Camera.requestCameraPermissionsAsync();
        if (!cam.granted) {
          if (!cancelled) {
            setPermission("denied");
            openSettings("camera");
          }
          return;
        }
        if (initialMode === "video" || allowModeSwitch) {
          const mic = await Camera.requestMicrophonePermissionsAsync();
          if (!mic.granted && (initialMode === "video" || !allowModeSwitch)) {
            if (!cancelled) {
              setPermission("denied");
              openSettings("mic");
            }
            return;
          }
        }
        if (!cancelled) setPermission("granted");
      } catch {
        if (!cancelled) setPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, [visible, initialMode, allowModeSwitch]);

  function clearElapsed() {
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
    setElapsed(0);
  }

  async function takePhoto() {
    if (!cameraRef.current || busy || !ready) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        exif: false
      });
      if (!photo?.uri) throw new Error("Falha ao capturar a foto.");
      onCaptured({
        uri: photo.uri,
        type: "IMAGE",
        mimeType: "image/jpeg",
        fileName: `camera-${Date.now()}.jpg`
      });
      onClose();
    } catch (err) {
      Alert.alert("Câmera", err instanceof Error ? err.message : "Não foi possível tirar a foto.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (!cameraRef.current || !ready) return;
    // Parar vem antes de `busy`: gravar mantém `busy` ligado até o vídeo sair,
    // então checar `busy` primeiro deixava o botão de parar sem efeito.
    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }
    if (busy) return;
    setBusy(true);
    setRecording(true);
    clearElapsed();
    elapsedTimer.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: maxVideoSeconds
      });
      clearElapsed();
      setRecording(false);
      if (!video?.uri) {
        setBusy(false);
        return;
      }
      onCaptured({
        uri: video.uri,
        type: "VIDEO",
        mimeType: "video/mp4",
        fileName: `camera-${Date.now()}.mp4`
      });
      onClose();
    } catch (err) {
      clearElapsed();
      setRecording(false);
      Alert.alert("Câmera", err instanceof Error ? err.message : "Não foi possível gravar o vídeo.");
    } finally {
      setBusy(false);
    }
  }

  function handleShutter() {
    if (mode === "photo") void takePhoto();
    else void toggleRecord();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission === "checking" ? (
          <View style={styles.center}>
            <ActivityIndicator color="#d4af37" size="large" />
            <Text style={styles.hint}>Abrindo câmera…</Text>
          </View>
        ) : permission === "denied" ? (
          <View style={styles.center}>
            <Text style={styles.hint}>Sem permissão de câmera.</Text>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>Fechar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode={mode === "video" ? "video" : "picture"}
              mute={false}
              videoQuality="720p"
              onCameraReady={() => setReady(true)}
              onMountError={(event) => {
                Alert.alert("Câmera", event.message || "Não foi possível iniciar a câmera.");
                onClose();
              }}
            />

            <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) }]}>
              <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={10} disabled={recording}>
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>
              <Text style={styles.topLabel}>
                {recording ? `Gravando ${elapsed}s` : mode === "video" ? "Vídeo" : "Foto"}
              </Text>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                disabled={recording}
                hitSlop={10}
              >
                <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              </Pressable>
            </View>

            <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              {allowModeSwitch ? (
                <View style={styles.modeRow}>
                  <Pressable
                    style={[styles.modeChip, mode === "photo" && styles.modeChipOn]}
                    onPress={() => !recording && setMode("photo")}
                    disabled={recording}
                  >
                    <Text style={styles.modeText}>Foto</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeChip, mode === "video" && styles.modeChipOn]}
                    onPress={() => !recording && setMode("video")}
                    disabled={recording}
                  >
                    <Text style={styles.modeText}>Vídeo</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.shutter,
                  recording && styles.shutterRec,
                  (!ready || (busy && !recording)) && styles.shutterDisabled
                ]}
                onPress={handleShutter}
                disabled={!ready || (busy && !recording)}
              >
                {mode === "photo" ? (
                  <Ionicons name="camera" size={28} color="#08090b" />
                ) : recording ? (
                  <View style={styles.stop} />
                ) : (
                  <Ionicons name="videocam" size={28} color="#08090b" />
                )}
              </Pressable>
              {!ready ? <Text style={styles.hint}>Preparando…</Text> : null}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16
  },
  topLabel: { color: "#fff", fontWeight: "700", fontSize: 15 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16
  },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  modeChipOn: { backgroundColor: "rgba(212,175,55,0.9)" },
  modeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.35)"
  },
  shutterRec: { backgroundColor: "#df663c", borderColor: "#fff" },
  shutterDisabled: { opacity: 0.5 },
  stop: { width: 26, height: 26, borderRadius: 4, backgroundColor: "#fff" },
  hint: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  btn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  btnText: { color: "#fff", fontWeight: "700" }
});
