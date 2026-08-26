import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoContentFit } from "expo-video";

type AppVideoProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
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
  // Bridge `/media/video` already returns MP4 — only raw .webm URLs fail on iOS.
  if (/\/media\/video(\?|$)/i.test(uri)) return false;
  return Platform.OS === "ios" && /\.webm(\?|#|$)/i.test(uri);
}

/**
 * Player alinhado com a web: a URL já vem resolvida por `mediaUrl`
 * (CDN MP4 ou `{API}/media/video?path=` para legados).
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
  const unsupported = isLikelyUnsupportedOnIos(uri);
  const [error, setError] = useState<string | null>(unsupported ? "WEBM_IOS" : null);
  const [retryToken, setRetryToken] = useState(0);
  const endedRef = useRef(false);
  const hardFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(unsupported ? null : { uri }, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    instance.audioMixingMode = "auto";
    if (maxSeconds && maxSeconds > 0) {
      instance.timeUpdateEventInterval = 0.25;
    }
  });

  useEffect(() => {
    endedRef.current = false;
    setError(unsupported ? "WEBM_IOS" : null);
  }, [uri, unsupported]);

  useEffect(() => {
    if (unsupported) return;
    endedRef.current = false;
    void player.replaceAsync({ uri }).catch(() => {
      try {
        player.replace({ uri });
      } catch {
        setError("PLAY_ERROR");
      }
    });
  }, [uri, unsupported, player, retryToken]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (unsupported || error) return;
    if (playing) player.play();
    else player.pause();
  }, [playing, player, unsupported, error, uri, retryToken]);

  useEffect(() => {
    if (restartKey == null || unsupported || error) return;
    endedRef.current = false;
    try {
      player.currentTime = 0;
      if (playing) player.play();
    } catch {
      // ignore
    }
  }, [restartKey, player, playing, unsupported, error, uri, retryToken]);

  function clearHardFailTimer() {
    if (hardFailTimer.current) {
      clearTimeout(hardFailTimer.current);
      hardFailTimer.current = null;
    }
  }

  function retryPlayback() {
    clearHardFailTimer();
    setError(null);
    setRetryToken((n) => n + 1);
  }

  useEventListener(player, "playToEnd", () => {
    if (!endedRef.current) {
      endedRef.current = true;
      onEnd?.();
    }
  });

  useEventListener(player, "statusChange", ({ status, error: statusError }) => {
    if (status === "error") {
      clearHardFailTimer();
      hardFailTimer.current = setTimeout(() => {
        setError(statusError?.message || "PLAY_ERROR");
      }, 400);
      return;
    }
    if (status === "readyToPlay") {
      clearHardFailTimer();
      setError(null);
      if (player.duration > 0) onDurationMs?.(Math.round(player.duration * 1000));
      if (playing) player.play();
    }
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (!maxSeconds || maxSeconds <= 0) return;
    if (currentTime >= maxSeconds) {
      player.pause();
      if (!endedRef.current) {
        endedRef.current = true;
        onEnd?.();
      }
    }
  });

  useEffect(() => () => clearHardFailTimer(), []);

  if (error) {
    const label =
      error === "WEBM_IOS"
        ? "Este vídeo (.webm) não roda no iPhone. Publique de novo em MP4."
        : "Não foi possível reproduzir o vídeo.";
    return (
      <View style={[styles.wrap, styles.fallback, style]}>
        <Text style={styles.fallbackText}>{label}</Text>
        {error !== "WEBM_IOS" ? (
          <Pressable style={styles.retryBtn} onPress={retryPlayback}>
            <Text style={styles.retryText}>Tentar de novo</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit={contentFit}
        nativeControls={nativeControls}
        surfaceType="textureView"
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
