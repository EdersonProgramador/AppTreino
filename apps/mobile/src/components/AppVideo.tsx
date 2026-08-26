import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Audio, ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { API_URL } from "../config";

type AppVideoProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "contain" | "cover" | "fill";
  loop?: boolean;
  muted?: boolean;
  playing?: boolean;
  nativeControls?: boolean;
  restartKey?: string | number | null;
  maxSeconds?: number;
  onEnd?: () => void;
  onDurationMs?: (ms: number) => void;
};

function isLikelyUnsupportedOnIos(uri: string) {
  if (/\/media\/video(\?|$)/i.test(uri)) return false;
  return Platform.OS === "ios" && /\.webm(\?|#|$)/i.test(uri);
}

function resizeModeFromFit(fit: AppVideoProps["contentFit"]) {
  if (fit === "cover") return ResizeMode.COVER;
  if (fit === "fill") return ResizeMode.STRETCH;
  return ResizeMode.CONTAIN;
}

function originOf(url: string) {
  return url.replace(/\/$/, "");
}

/** If direct CDN/API mp4 fails (HEVC etc.), retry via API compat bridge. */
function mediaBridgeUri(uri: string): string | null {
  if (!uri || /^(file:|content:|data:|blob:)/i.test(uri)) return null;
  if (/\/media\/video(\?|$)/i.test(uri)) {
    if (/([?&])force=1(&|$)/i.test(uri)) return null;
    return uri.includes("?") ? `${uri}&force=1` : `${uri}?force=1`;
  }
  try {
    const api = originOf(API_URL);
    let pathname = "";
    if (/^https?:\/\//i.test(uri)) {
      const url = new URL(uri);
      pathname = url.pathname.replace(/^\/uploads\//i, "/").replace(/^\/+/, "");
    } else {
      pathname = uri.replace(/^\/+/, "").replace(/^uploads\//i, "");
    }
    if (!/^(lessons|images|materials)\//i.test(pathname)) return null;
    if (!/\.(mp4|m4v|mov|webm|mkv|avi)(\?|#|$)/i.test(pathname)) return null;
    const cleaned = pathname.split(/[?#]/)[0];
    return `${api}/media/video?path=${encodeURIComponent(cleaned)}&force=1`;
  } catch {
    return null;
  }
}

let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
    audioModeReady = true;
  } catch {
    // playback can still work without this
  }
}

/**
 * Reliable feed/story/reel player (expo-av).
 * Parent style must give real width/height (or aspectRatio).
 */
export function AppVideo({
  uri,
  style,
  contentFit = "contain",
  loop = false,
  muted = false,
  playing = false,
  nativeControls = false,
  restartKey,
  maxSeconds,
  onEnd,
  onDurationMs
}: AppVideoProps) {
  const videoRef = useRef<Video>(null);
  const unsupported = isLikelyUnsupportedOnIos(uri);
  const [sourceUri, setSourceUri] = useState(uri);
  const [error, setError] = useState<string | null>(unsupported ? "WEBM_IOS" : null);
  const [retryToken, setRetryToken] = useState(0);
  const triedBridgeRef = useRef(false);
  const endedRef = useRef(false);
  const hardFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resizeMode = useMemo(() => resizeModeFromFit(contentFit), [contentFit]);

  useEffect(() => {
    void ensureAudioMode();
  }, []);

  useEffect(() => {
    triedBridgeRef.current = false;
    endedRef.current = false;
    setSourceUri(uri);
    setError(unsupported ? "WEBM_IOS" : null);
  }, [uri, unsupported]);

  useEffect(() => {
    endedRef.current = false;
    const player = videoRef.current;
    if (!player || unsupported || error) return;
    void player
      .setStatusAsync({
        shouldPlay: playing,
        isLooping: loop,
        isMuted: muted,
        progressUpdateIntervalMillis: maxSeconds && maxSeconds > 0 ? 250 : 500
      })
      .catch(() => undefined);
  }, [playing, loop, muted, maxSeconds, sourceUri, unsupported, error, retryToken]);

  useEffect(() => {
    if (restartKey == null || unsupported || error) return;
    const player = videoRef.current;
    if (!player) return;
    endedRef.current = false;
    void player
      .setPositionAsync(0)
      .then(() => (playing ? player.playAsync() : undefined))
      .catch(() => undefined);
  }, [restartKey, playing, unsupported, error, sourceUri, retryToken]);

  function clearHardFailTimer() {
    if (hardFailTimer.current) {
      clearTimeout(hardFailTimer.current);
      hardFailTimer.current = null;
    }
  }

  function failWith(message: string) {
    if (unsupported) {
      setError("WEBM_IOS");
      return;
    }
    if (!triedBridgeRef.current) {
      const bridge = mediaBridgeUri(sourceUri) || mediaBridgeUri(uri);
      if (bridge && bridge !== sourceUri) {
        triedBridgeRef.current = true;
        setError(null);
        setSourceUri(bridge);
        setRetryToken((n) => n + 1);
        return;
      }
    }
    setError(message || "PLAY_ERROR");
  }

  function onStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) {
      // expo-av emits unloaded states while buffering; only hard-fail on real errors.
      if (status.error) {
        clearHardFailTimer();
        hardFailTimer.current = setTimeout(() => failWith(status.error || "PLAY_ERROR"), 400);
      }
      return;
    }
    clearHardFailTimer();
    if (error) setError(null);
    if (status.durationMillis && status.durationMillis > 0) {
      onDurationMs?.(status.durationMillis);
    }
    if (maxSeconds && maxSeconds > 0 && status.positionMillis >= maxSeconds * 1000) {
      void videoRef.current?.pauseAsync().catch(() => undefined);
      if (!endedRef.current) {
        endedRef.current = true;
        onEnd?.();
      }
      return;
    }
    if (status.didJustFinish && !status.isLooping) {
      if (!endedRef.current) {
        endedRef.current = true;
        onEnd?.();
      }
    }
  }

  useEffect(() => () => clearHardFailTimer(), []);

  if (error) {
    const label =
      error === "WEBM_IOS"
        ? "Este vídeo (.webm) não roda no iPhone. Abra no app web ou publique em MP4."
        : "Não foi possível reproduzir o vídeo.";
    return (
      <View style={[styles.wrap, styles.fallback, style]}>
        <Text style={styles.fallbackText}>{label}</Text>
        {error !== "WEBM_IOS" ? (
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              triedBridgeRef.current = false;
              setError(null);
              setSourceUri(uri);
              setRetryToken((n) => n + 1);
            }}
          >
            <Text style={styles.retryText}>Tentar de novo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Video
        ref={videoRef}
        key={`${sourceUri}::${retryToken}`}
        style={StyleSheet.absoluteFillObject}
        source={{ uri: sourceUri }}
        resizeMode={resizeMode}
        shouldPlay={playing}
        isLooping={loop}
        isMuted={muted}
        useNativeControls={nativeControls}
        onPlaybackStatusUpdate={onStatus}
        onError={(msg) => failWith(msg || "PLAY_ERROR")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#000",
    overflow: "hidden"
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 10
  },
  fallbackText: {
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
    opacity: 0.9,
    lineHeight: 18
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  }
});
