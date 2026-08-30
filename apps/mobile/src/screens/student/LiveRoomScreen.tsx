import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import { useStudent } from "../../student/StudentContext";
import { setFeedCreateMenuOpen } from "../../student/feedChrome";
import { useHideTabBar } from "../../student/useHideTabBar";
import { useLiveRoom, type LiveChatMessage } from "../../live/useLiveRoom";
import { getWebrtcRuntime } from "../../live/webrtcRuntime";
import type { FeedStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<FeedStackParamList>;
type Route = RouteProp<FeedStackParamList, "LiveRoom">;

/** Live nativa: câmera e WebRTC direto no app, sem WebView. */
export function LiveRoomScreen() {
  const { session } = useStudent();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { liveId, title } = route.params;
  const mode = route.params.mode === "host" ? "host" : "viewer";
  const [permGranted, setPermGranted] = useState(mode !== "host");
  const [permError, setPermError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useHideTabBar(true);

  useEffect(() => {
    setFeedCreateMenuOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (mode !== "host") return;
      try {
        const cam = await Camera.requestCameraPermissionsAsync();
        const mic = await Camera.requestMicrophonePermissionsAsync().catch(async () => {
          const audio = await Audio.requestPermissionsAsync();
          return { granted: audio.status === "granted" };
        });
        if (cancelled) return;
        if (!cam.granted || !mic.granted) {
          setPermError("Permita câmera e microfone para transmitir ao vivo.");
          return;
        }
        setPermGranted(true);
      } catch {
        if (!cancelled) setPermError("Não foi possível pedir permissão de câmera/microfone.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return permError ? (
    <PermissionNotice message={permError} onBack={() => navigation.goBack()} />
  ) : permGranted ? (
    <LiveRoom
      mode={mode}
      liveId={liveId}
      title={title || "Live"}
      token={session.token}
      insetTop={Math.max(insets.top, 12)}
      insetBottom={Math.max(insets.bottom, 12)}
      draft={draft}
      onDraft={setDraft}
    />
  ) : (
    <View style={styles.loading}>
      <ActivityIndicator color="#d4af37" />
      <Text style={styles.loadingText}>Preparando live…</Text>
    </View>
  );
}

type RoomProps = {
  mode: "host" | "viewer";
  liveId?: string;
  title: string;
  token: string;
  insetTop: number;
  insetBottom: number;
  draft: string;
  onDraft: (value: string) => void;
};

function LiveRoom({ mode, liveId, title, token, insetTop, insetBottom, draft, onDraft }: RoomProps) {
  const navigation = useNavigation<Nav>();
  const listRef = useRef<FlatList<LiveChatMessage>>(null);
  const room = useLiveRoom({ mode, liveId, title, token });
  const { status, end } = room;

  useEffect(() => {
    if (status === "ended") navigation.goBack();
  }, [navigation, status]);

  const leave = useCallback(() => {
    void end().finally(() => navigation.goBack());
  }, [end, navigation]);

  const submit = useCallback(() => {
    room.sendChat(draft);
    onDraft("");
  }, [draft, onDraft, room]);

  const stream = mode === "host" ? room.localStream : room.remoteStream;
  const rtc = getWebrtcRuntime();

  return (
    <View style={styles.root}>
      {stream && rtc ? (
        <rtc.RTCView
          streamURL={stream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={mode === "host"}
          zOrder={0}
        />
      ) : null}

      {status === "preparing" ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#d4af37" />
          <Text style={styles.loadingText}>Preparando live…</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={styles.permText}>{room.error ?? "Falha ao abrir a live."}</Text>
          <Pressable style={styles.permBtnSecondary} onPress={() => navigation.goBack()}>
            <Text style={styles.permBtnText}>Voltar</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insetTop }]}>
        <View style={styles.pill}>
          <View style={styles.dot} />
          <Text style={styles.pillText} numberOfLines={1}>
            {room.title}
          </Text>
        </View>
        {mode === "host" ? (
          <View style={styles.pill}>
            <Ionicons name="eye-outline" size={14} color="#fff" />
            <Text style={styles.pillText}>{room.viewerCount}</Text>
          </View>
        ) : null}
        <Pressable onPress={leave} hitSlop={10} style={styles.endBtn}>
          <Text style={styles.endText}>{mode === "host" ? "Encerrar" : "Sair"}</Text>
        </Pressable>
      </View>

      {mode === "host" && status === "live" ? (
        <View style={[styles.controls, { top: insetTop + 56 }]}>
          <Pressable style={styles.ctrl} onPress={room.switchCamera} hitSlop={8}>
            <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
          </Pressable>
          <Pressable style={styles.ctrl} onPress={room.toggleMic} hitSlop={8}>
            <Ionicons name={room.micOn ? "mic-outline" : "mic-off-outline"} size={20} color="#fff" />
          </Pressable>
          <Pressable style={styles.ctrl} onPress={room.toggleCam} hitSlop={8}>
            <Ionicons name={room.camOn ? "videocam-outline" : "videocam-off-outline"} size={20} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.chatWrap, { paddingBottom: insetBottom }]}
      >
        <FlatList
          ref={listRef}
          data={room.messages}
          keyExtractor={(item, index) => item.id ?? `msg-${index}`}
          renderItem={({ item }) => (
            <View style={styles.msg}>
              <Text style={styles.msgName}>{item.name || "alguém"}</Text>
              <Text style={styles.msgText}>{item.content}</Text>
            </View>
          )}
          style={styles.msgs}
          contentContainerStyle={styles.msgsContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={onDraft}
            placeholder="Comentar…"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.input}
            maxLength={280}
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Pressable style={styles.send} onPress={submit} hitSlop={8}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function PermissionNotice({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.permBox}>
        <Text style={styles.permText}>{message}</Text>
        <Pressable style={styles.permBtn} onPress={() => void Linking.openSettings()}>
          <Text style={styles.permBtnText}>Abrir ajustes</Text>
        </Pressable>
        <Pressable style={styles.permBtnSecondary} onPress={onBack}>
          <Text style={styles.permBtnText}>Voltar</Text>
        </Pressable>
      </View>
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
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexShrink: 1
  },
  pillText: { color: "#fff", fontWeight: "800", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#df663c" },
  endBtn: {
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#df663c"
  },
  endText: { color: "#fff", fontWeight: "800" },
  controls: { position: "absolute", right: 12, zIndex: 3, gap: 10 },
  ctrl: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  chatWrap: { position: "absolute", left: 12, right: 12, bottom: 0, zIndex: 3, gap: 8 },
  msgs: { maxHeight: "28%" },
  msgsContent: { gap: 6, paddingVertical: 4 },
  msg: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.42)"
  },
  msgName: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", marginBottom: 2 },
  msgText: { color: "#fff", fontWeight: "600" },
  composer: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "#fff"
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 12,
    zIndex: 2
  },
  loadingText: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  errorBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 4
  },
  permBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  permText: { color: "#fff", textAlign: "center", fontWeight: "700", lineHeight: 22 },
  permBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: "#df663c" },
  permBtnSecondary: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  permBtnText: { color: "#fff", fontWeight: "800" }
});
