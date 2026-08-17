import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import * as Linking from "expo-linking";
import {
  APP_ENTRY_URL,
  WEB_URL,
  isAppOrigin,
  isExternalScheme
} from "./src/config";
import { MusicPlayerScreen, type NativeTrack } from "./src/MusicPlayerScreen";
import { downloadWorkoutImage, shareWorkoutImage } from "./src/nativeShare";

type MusicPayload = {
  type: "OPEN_MUSIC_PLAYER";
  tracks: NativeTrack[];
  startIndex?: number;
};

type ImagePayload = {
  type: "DOWNLOAD_IMAGE" | "SHARE_IMAGE";
  base64: string;
  filename?: string;
  title?: string;
  text?: string;
};

type WebPayload = MusicPayload | ImagePayload;

const APP_BG = "#08090b";

function insetScript(top: number, bottom: number, left = 0, right = 0, keyboard = 0) {
  const t = Math.max(0, Math.round(top));
  const b = Math.max(0, Math.round(bottom));
  const l = Math.max(0, Math.round(left));
  const r = Math.max(0, Math.round(right));
  const k = Math.max(0, Math.round(keyboard));
  return `
    (function () {
      var root = document.documentElement;
      var body = document.body;
      var vv = window.visualViewport;
      var avail = Math.max(1, Math.round((vv && vv.height) ? vv.height : window.innerHeight));
      root.classList.add("is-native-app");
      root.style.setProperty("--expo-safe-top", "${t}px");
      root.style.setProperty("--expo-safe-bottom", "${b}px");
      root.style.setProperty("--expo-safe-left", "${l}px");
      root.style.setProperty("--expo-safe-right", "${r}px");
      root.style.setProperty("--keyboard-height", "${k}px");
      root.style.setProperty("--vv-height", avail + "px");
      root.classList.toggle("keyboard-open", ${k} > 40);
      root.style.height = "100%";
      root.style.maxHeight = "100%";
      root.style.overflow = "hidden";
      root.style.backgroundColor = "${APP_BG}";
      if (body) {
        body.style.height = "100%";
        body.style.maxHeight = "100%";
        body.style.overflow = "hidden";
        body.style.touchAction = "manipulation";
        body.style.backgroundColor = "${APP_BG}";
      }
    })();
    true;
  `;
}

function AppShell() {
  const webRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicQueue, setMusicQueue] = useState<NativeTrack[] | null>(null);
  const [musicStartIndex, setMusicStartIndex] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const nativeInsets = useMemo(
    () => insetScript(insets.top, insets.bottom, insets.left, insets.right, keyboardHeight),
    [insets.top, insets.bottom, insets.left, insets.right, keyboardHeight]
  );

  useEffect(() => {
    webRef.current?.injectJavaScript(nativeInsets);
  }, [nativeInsets]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (musicQueue) {
      setMusicQueue(null);
      return true;
    }
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack, musicQueue]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [handleBack]);

  function onWebMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as WebPayload;
      if (data?.type === "OPEN_MUSIC_PLAYER") {
        if (!Array.isArray(data.tracks) || !data.tracks.length) return;
        setMusicStartIndex(data.startIndex ?? 0);
        setMusicQueue(data.tracks);
        return;
      }
      if (data?.type === "DOWNLOAD_IMAGE" || data?.type === "SHARE_IMAGE") {
        if (!data.base64) return;
        void (async () => {
          try {
            if (data.type === "DOWNLOAD_IMAGE") {
              await downloadWorkoutImage(data.base64, data.filename);
            } else {
              await shareWorkoutImage(data.base64, data.filename, data.title || data.text);
            }
          } catch (shareError) {
            const message =
              shareError instanceof Error ? shareError.message : "Não foi possível processar a imagem.";
            Alert.alert("Erro", message);
          }
        })();
      }
    } catch {
      // ignore non-JSON messages
    }
  }

  if (musicQueue) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeFlex} edges={["top", "right", "bottom", "left"]}>
          <MusicPlayerScreen
            onClose={() => setMusicQueue(null)}
            startIndex={musicStartIndex}
            tracks={musicQueue}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {error ? (
        <SafeAreaView style={styles.safeFlex} edges={["top", "right", "bottom", "left"]}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Nao foi possivel carregar</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Text style={styles.errorHint}>URL: {APP_ENTRY_URL}</Text>
            <Text
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setLoading(true);
                webRef.current?.reload();
              }}
              style={styles.retry}
            >
              Tentar de novo
            </Text>
          </View>
        </SafeAreaView>
      ) : null}

      <KeyboardAvoidingView
        style={[styles.webviewWrap, error ? styles.hidden : null]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
        keyboardVerticalOffset={0}
      >
        <WebView
          ref={webRef}
          source={{ uri: APP_ENTRY_URL }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={nativeInsets}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView={false}
          onLoadStart={() => {
            setLoading(true);
            setError(null);
          }}
          onLoadEnd={() => {
            setLoading(false);
            webRef.current?.injectJavaScript(nativeInsets);
          }}
          onNavigationStateChange={(nav: WebViewNavigation) => {
            setCanGoBack(nav.canGoBack);
            webRef.current?.injectJavaScript(nativeInsets);
          }}
          onMessage={onWebMessage}
          onShouldStartLoadWithRequest={(request) => {
            const { url } = request;
            if (!url || url === "about:blank") return true;
            if (request.isTopFrame === false) return true;

            if (isExternalScheme(url) || !isAppOrigin(url)) {
              void Linking.openURL(url);
              return false;
            }

            return true;
          }}
          originWhitelist={["*", "http://*", "https://*"]}
          mixedContentMode="always"
          onError={(event) => {
            setLoading(false);
            const detail = event.nativeEvent.description || event.nativeEvent.code || "";
            setError(
              `Falha ao abrir ${WEB_URL}${detail ? ` (${detail})` : ""}. Verifique se o Vite está no ar e no mesmo Wi-Fi.`
            );
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 500) {
              setError(`Servidor respondeu ${event.nativeEvent.statusCode}.`);
            }
          }}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          scrollEnabled={false}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          applicationNameForUserAgent="AppTreinoMobile"
        />
        {loading && !error ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#f2b461" size="large" />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_BG
  },
  safeFlex: {
    flex: 1,
    backgroundColor: APP_BG
  },
  webviewWrap: {
    flex: 1,
    backgroundColor: APP_BG
  },
  hidden: {
    height: 0,
    width: 0,
    opacity: 0,
    overflow: "hidden"
  },
  webview: {
    flex: 1,
    backgroundColor: APP_BG
  },
  retry: {
    marginTop: 8,
    color: "#f2b461",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 9, 11, 0.72)"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24
  },
  errorTitle: {
    color: "#fff7ec",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  errorBody: {
    color: "#ffd8d4",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center"
  },
  errorHint: {
    color: "#8f887f",
    fontSize: 12,
    textAlign: "center"
  }
});
