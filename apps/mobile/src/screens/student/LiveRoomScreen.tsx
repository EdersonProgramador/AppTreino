import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { API_URL, WEB_URL } from "../../config";
import { useStudent } from "../../student/StudentContext";
import { useHideTabBar } from "../../student/useHideTabBar";
import type { FeedStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<FeedStackParamList>;
type Route = RouteProp<FeedStackParamList, "LiveRoom">;

export function LiveRoomScreen() {
  const { session } = useStudent();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { mode, liveId, title } = route.params;
  useHideTabBar(true);

  const uri = useMemo(() => {
    const qs = new URLSearchParams({
      api: API_URL,
      token: session.token,
      mode,
      title: title || "Live"
    });
    if (liveId) qs.set("liveId", liveId);
    return `${WEB_URL}/live-room.html?${qs.toString()}`;
  }, [liveId, mode, session.token, title]);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.hint}>{mode === "host" ? "Você está no ar" : "Assistindo"}</Text>
      </View>
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
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#f2b461" />
          </View>
        )}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (data.type === "live-closed" || data.type === "live-ended") {
              navigation.goBack();
            }
          } catch {
            // ignore
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: {
    position: "absolute",
    top: 48,
    left: 12,
    right: 12,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
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
    backgroundColor: "#000"
  }
});
