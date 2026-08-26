import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import { API_URL, WEB_URL } from "../../config";
import { useStudent } from "../../student/StudentContext";
import { setFeedCreateMenuOpen } from "../../student/feedChrome";
import { useHideTabBar } from "../../student/useHideTabBar";
import type { FeedStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<FeedStackParamList>;
type Route = RouteProp<FeedStackParamList, "LiveRoom">;

/**
 * Live room via WebView + live-room.html (getUserMedia / WebRTC no browser).
 */
export function LiveRoomScreen() {
  const { session } = useStudent();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { mode, liveId, title } = route.params;
  const [ready, setReady] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  useHideTabBar(true);

  useEffect(() => {
    setFeedCreateMenuOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (mode !== "host") {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const cam = await Camera.requestCameraPermissionsAsync();
        const mic = await Camera.requestMicrophonePermissionsAsync().catch(async () => {
          const audio = await Audio.requestPermissionsAsync();
          return { granted: audio.status === "granted" };
        });
        if (!cam.granted || !mic.granted) {
          if (!cancelled) {
            setPermError("Permita câmera e microfone para transmitir ao vivo.");
            setReady(false);
          }
          return;
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) {
          setPermError("Não foi possível pedir permissão de câmera/microfone.");
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const uri = useMemo(() => {
    const qs = new URLSearchParams({
      api: API_URL,
      token: session.token,
      mode,
      title: title || "Live",
      app: "mobile"
    });
    if (liveId) qs.set("liveId", liveId);
    return `${WEB_URL.replace(/\/$/, "")}/live-room.html?${qs.toString()}`;
  }, [liveId, mode, session.token, title]);

  const isExpoGo = Constants.appOwnership === "expo";

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.hint}>{mode === "host" ? "Você está no ar" : "Assistindo"}</Text>
      </View>

      {permError ? (
        <View style={styles.permBox}>
          <Text style={styles.permText}>{permError}</Text>
          <Pressable style={styles.permBtn} onPress={() => void Linking.openSettings()}>
            <Text style={styles.permBtnText}>Abrir ajustes</Text>
          </Pressable>
          <Pressable style={styles.permBtnSecondary} onPress={() => navigation.goBack()}>
            <Text style={styles.permBtnText}>Voltar</Text>
          </Pressable>
          {isExpoGo ? (
            <Text style={styles.expoHint}>
              Se a câmera não abrir no Expo Go, permita câmera/microfone nas configurações do aparelho.
            </Text>
          ) : null}
        </View>
      ) : !ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#f2b461" />
          <Text style={styles.loadingText}>Preparando live…</Text>
        </View>
      ) : (
        <WebView
          source={{ uri }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          startInLoadingState
          originWhitelist={["*"]}
          mixedContentMode="always"
          allowsProtectedMedia
          setSupportMultipleWindows={false}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color="#f2b461" />
            </View>
          )}
          onPermissionRequest={(request) => {
            try {
              // @ts-expect-error RN WebView Android API
              request?.grant?.(request?.resources ?? request?.nativeEvent?.resources);
            } catch {
              // ignore
            }
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data) as { type?: string; message?: string };
              if (data.type === "live-closed" || data.type === "live-ended") {
                navigation.goBack();
              }
              if (data.type === "live-error" && data.message) {
                setPermError(data.message);
              }
            } catch {
              // ignore
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  hint: { color: "#fff", fontWeight: "800" },
  web: { flex: 1, backgroundColor: "#000" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 12
  },
  loadingText: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  permBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12
  },
  permText: { color: "#fff", textAlign: "center", fontWeight: "700", lineHeight: 22 },
  expoHint: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8
  },
  permBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#df663c"
  },
  permBtnSecondary: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  permBtnText: { color: "#fff", fontWeight: "800" }
});
