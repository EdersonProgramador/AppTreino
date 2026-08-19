import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
  type AppStateStatus
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import * as Linking from "expo-linking";
import {
  WEB_URL,
  isAppOrigin,
  isExternalScheme,
  panelUrlForRole
} from "../config";
import type { NativeTrack } from "../musicPlayback";
import { musicPlayback } from "../musicPlayback";
import { downloadWorkoutImage, shareWorkoutImage } from "../nativeShare";
import {
  buildStorageBootScript,
  flushShellSnapshot,
  mergeShellSnapshot,
  musicSnapshotFromPlayback,
  peekShellSnapshot,
  readShellSnapshot,
  type ShellSnapshot
} from "../shellSnapshot";
import { sessionAsLocalStorage } from "../auth/session";
import type { NativeSession } from "../auth/types";

type MusicControlPayload = {
  type:
    | "OPEN_MUSIC_PLAYER"
    | "MUSIC_PLAY"
    | "MUSIC_PAUSE"
    | "MUSIC_NEXT"
    | "MUSIC_PREV"
    | "MUSIC_STOP"
    | "MUSIC_SEEK"
    | "MUSIC_PLAY_AT"
    | "MUSIC_SYNC"
    | "PERSIST_SHELL_STATE"
    | "NATIVE_LOGOUT";
  tracks?: NativeTrack[];
  startIndex?: number;
  index?: number;
  ratio?: number;
  autoplay?: boolean;
  resumeSec?: number;
  href?: string;
  localStorage?: Record<string, string>;
  music?: ShellSnapshot["music"];
};

type ImagePayload = {
  type: "DOWNLOAD_IMAGE" | "SHARE_IMAGE";
  base64: string;
  filename?: string;
  title?: string;
  text?: string;
  save?: boolean;
};

type WebPayload = MusicControlPayload | ImagePayload;

const APP_BG = "#08090b";

const NATIVE_SHELL_BOOT = `
  (function () {
    var root = document.documentElement;
    if (root) root.classList.add("is-native-app");
    true;
  })();
`;

const shellProcess = {
  restored: false,
  bootScript: NATIVE_SHELL_BOOT,
  entryUrl: "",
  webViewLoaded: false
};

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

function syncMusicToWeb(webRef: RefObject<WebView | null>, snap: ReturnType<typeof musicPlayback.snapshot>) {
  const payload = JSON.stringify({
    playing: snap.playing,
    progress: snap.positionSec,
    duration: snap.durationSec > 0 ? snap.durationSec : undefined,
    index: snap.index,
    tracks: snap.queue,
    ended: snap.ended
  });
  webRef.current?.injectJavaScript(`
    (function () {
      try {
        if (typeof window.__nativeMusicSync === "function") {
          window.__nativeMusicSync(${payload});
        }
      } catch (e) {}
      true;
    })();
  `);
}

function isGuestPath(url: string) {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    return path === "/" || path === "/login" || path === "/baixar-app";
  } catch {
    return false;
  }
}

export function resetPanelShell() {
  shellProcess.restored = false;
  shellProcess.webViewLoaded = false;
  shellProcess.bootScript = NATIVE_SHELL_BOOT;
  shellProcess.entryUrl = "";
}

function prepareSessionBoot(session: NativeSession, panelHome: string) {
  const snapshot = peekShellSnapshot();
  const localStorage = {
    ...(snapshot.localStorage ?? {}),
    ...sessionAsLocalStorage(session)
  };
  const boot = buildStorageBootScript({ ...snapshot, localStorage });
  const nextUrl =
    snapshot.href && isAppOrigin(snapshot.href) && !isGuestPath(snapshot.href)
      ? snapshot.href
      : panelHome;
  shellProcess.bootScript = boot;
  shellProcess.entryUrl = nextUrl;
  shellProcess.restored = true;
  return { boot, url: nextUrl };
}

function sessionInjectScript(session: NativeSession) {
  const storage = sessionAsLocalStorage(session);
  return `
    (function () {
      try {
        var data = ${JSON.stringify(storage)};
        if (data && typeof data === "object") {
          Object.keys(data).forEach(function (key) {
            if (typeof data[key] === "string") localStorage.setItem(key, data[key]);
          });
        }
      } catch (e) {}
      true;
    })();
  `;
}

export function PanelWebView({
  session,
  onLogout
}: {
  session: NativeSession;
  onLogout: () => void;
}) {
  const panelHome = panelUrlForRole(session.user.role);
  if (!shellProcess.restored || shellProcess.bootScript === NATIVE_SHELL_BOOT) {
    prepareSessionBoot(session, panelHome);
  }

  const webRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(!shellProcess.webViewLoaded);
  const [restoreReady, setRestoreReady] = useState(true);
  const bootScriptRef = useRef(shellProcess.bootScript);
  const [canGoBack, setCanGoBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const imageJobChain = useRef(Promise.resolve());
  const webSourceRef = useRef({ uri: shellProcess.entryUrl || panelHome });
  const rendererDead = useRef(false);
  const nativeInsetsRef = useRef("");
  const mountedAtRef = useRef(Date.now());
  const tokenInjectRef = useRef(sessionInjectScript(session));

  const nativeInsets = useMemo(
    () => insetScript(insets.top, insets.bottom, insets.left, insets.right, keyboardHeight),
    [insets.top, insets.bottom, insets.left, insets.right, keyboardHeight]
  );

  useEffect(() => {
    tokenInjectRef.current = sessionInjectScript(session);
    const prepared = prepareSessionBoot(session, panelHome);
    bootScriptRef.current = prepared.boot;
    if (!shellProcess.webViewLoaded) {
      webSourceRef.current.uri = prepared.url;
    }
  }, [panelHome, session]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = await readShellSnapshot();
      if (cancelled) return;
      const music = snapshot?.music;
      const resumeSec = music?.tempo_atual ?? music?.positionSec ?? 0;
      if (music?.tracks?.length && !musicPlayback.hasQueue()) {
        await musicPlayback.openQueue(music.tracks, music.index ?? 0, {
          autoplay: music.playing,
          resumeSec
        });
      }
      if (!cancelled) setRestoreReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    nativeInsetsRef.current = nativeInsets;
    webRef.current?.injectJavaScript(nativeInsets);
  }, [nativeInsets]);

  const remountWebView = useCallback(() => {
    rendererDead.current = false;
    void flushShellSnapshot().then(() => {
      const snapshot = peekShellSnapshot();
      const localStorage = {
        ...(snapshot.localStorage ?? {}),
        ...sessionAsLocalStorage(session)
      };
      bootScriptRef.current = buildStorageBootScript({ ...snapshot, localStorage });
      const nextUrl =
        snapshot.href && isAppOrigin(snapshot.href) && !isGuestPath(snapshot.href)
          ? snapshot.href
          : panelHome;
      webSourceRef.current = { uri: nextUrl };
      shellProcess.entryUrl = nextUrl;
      setWebViewGeneration((current) => current + 1);
    });
  }, [panelHome, session]);

  const onRendererGone = useCallback(() => {
    if (AppState.currentState !== "active") {
      rendererDead.current = true;
      return;
    }
    remountWebView();
  }, [remountWebView]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        webRef.current?.injectJavaScript(`
          (function () {
            try {
              if (typeof window.__flushShellState === "function") window.__flushShellState();
            } catch (e) {}
            true;
          })();
        `);
        void flushShellSnapshot();
        return;
      }
      if (next !== "active") return;
      if (rendererDead.current) {
        remountWebView();
        return;
      }
      syncMusicToWeb(webRef, musicPlayback.snapshot());
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [remountWebView]);

  useEffect(() => {
    return musicPlayback.subscribe((snap) => {
      if (AppState.currentState === "active") {
        syncMusicToWeb(webRef, snap);
      }
      void mergeShellSnapshot({
        music: musicSnapshotFromPlayback(snap)
      });
    });
  }, []);

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
    if (canGoBack && webRef.current) {
      webRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [handleBack]);

  function onWebMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as WebPayload;

      if (data?.type === "NATIVE_LOGOUT") {
        if (Date.now() - mountedAtRef.current < 4000) return;
        onLogout();
        return;
      }

      if (data?.type === "MUSIC_SYNC") {
        syncMusicToWeb(webRef, musicPlayback.snapshot());
        return;
      }

      if (data?.type === "PERSIST_SHELL_STATE") {
        void mergeShellSnapshot({
          href: typeof data.href === "string" && !isGuestPath(data.href) ? data.href : undefined,
          localStorage: {
            ...(data.localStorage ?? {}),
            ...sessionAsLocalStorage(session)
          }
        }).then(() => {
          if (AppState.currentState !== "active") {
            return flushShellSnapshot();
          }
          return undefined;
        });
        return;
      }

      if (data?.type === "OPEN_MUSIC_PLAYER") {
        if (!Array.isArray(data.tracks) || !data.tracks.length) return;
        void musicPlayback.openQueue(data.tracks, data.startIndex ?? 0, {
          autoplay: data.autoplay !== false,
          resumeSec: data.resumeSec
        });
        return;
      }
      if (data?.type === "MUSIC_PLAY") {
        void musicPlayback.play();
        return;
      }
      if (data?.type === "MUSIC_PAUSE") {
        void musicPlayback.pause();
        return;
      }
      if (data?.type === "MUSIC_NEXT") {
        void musicPlayback.next({ autoplay: true });
        return;
      }
      if (data?.type === "MUSIC_PREV") {
        void musicPlayback.prev();
        return;
      }
      if (data?.type === "MUSIC_STOP") {
        void musicPlayback.stop();
        void mergeShellSnapshot({ music: undefined });
        return;
      }
      if (data?.type === "MUSIC_SEEK") {
        if (typeof data.ratio === "number") void musicPlayback.seekRatio(data.ratio);
        return;
      }
      if (data?.type === "MUSIC_PLAY_AT") {
        if (typeof data.index === "number") void musicPlayback.playAt(data.index);
        return;
      }

      if (data?.type === "DOWNLOAD_IMAGE" || data?.type === "SHARE_IMAGE") {
        if (!data.base64) return;
        const payload = data;
        imageJobChain.current = imageJobChain.current
          .then(async () => {
            if (payload.type === "DOWNLOAD_IMAGE") {
              await downloadWorkoutImage(payload.base64, payload.filename);
              return;
            }
            await shareWorkoutImage(payload.base64, payload.filename, payload.title || payload.text);
            if (payload.save) {
              await downloadWorkoutImage(payload.base64, payload.filename, {
                fallbackShare: false,
                notify: true
              });
            }
          })
          .catch((shareError: unknown) => {
            const message =
              shareError instanceof Error ? shareError.message : "Não foi possível processar a imagem.";
            Alert.alert("Erro", message);
          });
      }
    } catch {
      // ignore non-JSON messages
    }
  }

  return (
    <View style={styles.root} collapsable={false}>
      {error ? (
        <SafeAreaView style={styles.safeFlex} edges={["top", "right", "bottom", "left"]}>
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Nao foi possivel carregar</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Text style={styles.errorHint}>URL: {panelHome}</Text>
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

      <View style={[styles.webviewWrap, error ? styles.hidden : null]} collapsable={false}>
        {restoreReady ? (
          <WebView
            key={webViewGeneration}
            ref={webRef}
            source={webSourceRef.current}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={bootScriptRef.current}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView={false}
            cacheEnabled
            startInLoadingState={false}
            onLoadStart={() => {
              if (!shellProcess.webViewLoaded) setLoading(true);
              setError(null);
            }}
            onLoadEnd={() => {
              shellProcess.webViewLoaded = true;
              rendererDead.current = false;
              setLoading(false);
              webRef.current?.injectJavaScript(tokenInjectRef.current);
              webRef.current?.injectJavaScript(nativeInsetsRef.current || nativeInsets);
              syncMusicToWeb(webRef, musicPlayback.snapshot());
            }}
            onContentProcessDidTerminate={onRendererGone}
            onRenderProcessGone={onRendererGone}
            onNavigationStateChange={(nav: WebViewNavigation) => {
              setCanGoBack(nav.canGoBack);
              webRef.current?.injectJavaScript(nativeInsetsRef.current || nativeInsets);
              if (nav.url && isAppOrigin(nav.url) && !nav.loading) {
                if (isGuestPath(nav.url)) return;
                shellProcess.entryUrl = nav.url;
                void mergeShellSnapshot({ href: nav.url });
              }
            }}
            onMessage={onWebMessage}
            onShouldStartLoadWithRequest={(request) => {
              const { url } = request;
              if (!url || url === "about:blank") return true;
              if (request.isTopFrame === false) return true;

              if (isGuestPath(url) && isAppOrigin(url)) {
                return false;
              }

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
            scrollEnabled={false}
            nestedScrollEnabled
            bounces={false}
            overScrollMode="never"
            applicationNameForUserAgent="AppTreinoMobile"
          />
        ) : null}
        {!restoreReady || (loading && !error && !shellProcess.webViewLoaded) ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#f2b461" size="large" />
          </View>
        ) : null}
      </View>
    </View>
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
