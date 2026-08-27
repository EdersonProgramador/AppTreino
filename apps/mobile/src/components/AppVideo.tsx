import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoContentFit } from "expo-video";
import { resolvePlayableVideoUrl, videoBridgeUrl } from "../lib/media";

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
  /** Capa exibida enquanto o vídeo carrega, no lugar do retângulo preto. */
  poster?: string | null;
  onEnd?: () => void;
  onDurationMs?: (ms: number) => void;
};

function isLikelyUnsupportedOnIos(uri: string) {
  return (
    Platform.OS === "ios" &&
    /\.(webm|mkv|avi|divx|ogv|ogg|mpg|mpeg|mpe|m2v|mpv|ts|mts|m2ts|flv|f4v|wmv|asf|vob|mxf|rm|rmvb|rv|hevc|h265|h264|av1|ivf)(\?|#|$)/i.test(
      uri
    )
  );
}

/**
 * Player alinhado com a web: a URL já vem resolvida por `mediaUrl`.
 * Toda reprodução usa o CDN; formatos legados caem para o MP4 irmão no R2.
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
  poster,
  onEnd,
  onDurationMs
}: AppVideoProps) {
  /**
   * iOS não abre WebM. O MP4 transcodificado já fica ao lado do original no
   * R2, então começamos nele sem tocar no `/media/video` do Render.
   */
  const preferredUri = isLikelyUnsupportedOnIos(uri) ? videoBridgeUrl(uri) ?? uri : uri;
  /** Quando a URL direta falha, trocamos pelo MP4 irmão no CDN e recarregamos. */
  const [bridged, setBridged] = useState<string | null>(null);
  const source = bridged ?? preferredUri;
  const unsupported = isLikelyUnsupportedOnIos(source);
  const [error, setError] = useState<string | null>(unsupported ? "FORMAT_IOS" : null);
  const [retryToken, setRetryToken] = useState(0);
  const endedRef = useRef(false);
  const playingRef = useRef(playing);
  const lastRestartRef = useRef<string | number | null>(null);
  const resolvingCompatibleRef = useRef<string | null>(null);
  const resolvedRetryRef = useRef(false);
  const hardFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(unsupported ? null : { uri: source }, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    instance.audioMixingMode = "auto";
    if (maxSeconds && maxSeconds > 0) {
      instance.timeUpdateEventInterval = 0.25;
    }
  });

  /**
   * Status lido do player, não só da transição: com a fonte em cache o
   * `statusChange` dispara antes do listener montar, e a capa/spinner ficava
   * por cima do vídeo para sempre.
   */
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const ready = status === "readyToPlay" || isPlaying;

  /** A capa nunca pode esconder o vídeo para sempre se o status travar. */
  const [coverExpired, setCoverExpired] = useState(false);
  useEffect(() => {
    if (ready) return;
    setCoverExpired(false);
    const timer = setTimeout(() => setCoverExpired(true), 6_000);
    return () => clearTimeout(timer);
  }, [source, ready]);

  useEffect(() => {
    endedRef.current = false;
    resolvingCompatibleRef.current = null;
    resolvedRetryRef.current = false;
    setBridged(null);
  }, [uri]);

  useEffect(() => {
    setError(isLikelyUnsupportedOnIos(source) ? "FORMAT_IOS" : null);
  }, [source]);

  /**
   * `useVideoPlayer` já carrega a fonte inicial. Chamar `replaceAsync` com a
   * mesma URL logo depois abortava esse carregamento no meio, e o player ficava
   * preso em `loading` — vídeo preto com a capa por cima, em todas as telas.
   * Só troca quando a fonte muda de verdade ou numa nova tentativa.
   */
  const appliedSourceRef = useRef(`${source}|0`);

  useEffect(() => {
    if (unsupported) return;
    const key = `${source}|${retryToken}`;
    if (appliedSourceRef.current === key) return;
    appliedSourceRef.current = key;
    endedRef.current = false;
    void player.replaceAsync({ uri: source }).catch(() => {
      try {
        player.replace({ uri: source });
      } catch {
        setError("PLAY_ERROR");
      }
    });
  }, [source, unsupported, player, retryToken]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (unsupported || error) return;
    try {
      if (playing) player.play();
      else player.pause();
    } catch {
      // ignore
    }
  }, [playing, player, unsupported, error, uri, retryToken]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  /**
   * Só reinicia quando `restartKey` muda de valor. Depender de `playing` aqui
   * fazia o vídeo voltar ao início a cada pausa — visível no story ao segurar
   * o dedo para pausar.
   */
  useEffect(() => {
    if (restartKey == null || unsupported || error) return;
    if (lastRestartRef.current === restartKey) return;
    lastRestartRef.current = restartKey;
    endedRef.current = false;
    try {
      player.currentTime = 0;
      if (playingRef.current) player.play();
    } catch {
      // ignore
    }
  }, [restartKey, player, unsupported, error]);

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
      // Codec que este aparelho não abre: pedir o MP4 convertido à API.
      if (!bridged) {
        const fallback = videoBridgeUrl(uri);
        if (fallback && fallback !== source) {
          setBridged(fallback);
          return;
        }
      }

      // O MP4 de um registro antigo pode ainda não existir no R2. Uma única
      // chamada prepara-o e devolve o URL do CDN; o vídeo continua fora da API.
      if (videoBridgeUrl(uri)) {
        if (resolvedRetryRef.current) {
          hardFailTimer.current = setTimeout(() => {
            setError(statusError?.message || "PLAY_ERROR");
          }, 400);
          return;
        }
        if (resolvingCompatibleRef.current === uri) return;
        resolvingCompatibleRef.current = uri;
        void resolvePlayableVideoUrl(uri).then((resolved) => {
          if (resolvingCompatibleRef.current !== uri) return;
          resolvingCompatibleRef.current = null;
          if (resolved) {
            resolvedRetryRef.current = true;
            setError(null);
            setBridged(resolved);
            setRetryToken((n) => n + 1);
            return;
          }
          hardFailTimer.current = setTimeout(() => {
            setError(statusError?.message || "PLAY_ERROR");
          }, 400);
        });
        return;
      }

      hardFailTimer.current = setTimeout(() => {
        setError(statusError?.message || "PLAY_ERROR");
      }, 400);
      return;
    }
    if (status === "readyToPlay") {
      clearHardFailTimer();
      setError(null);
      if (player.duration > 0) onDurationMs?.(Math.round(player.duration * 1000));
      try {
        if (playing) player.play();
        else player.pause();
      } catch {
        // ignore
      }
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
      error === "FORMAT_IOS"
        ? "Este formato precisa ser convertido para MP4 antes de tocar no iPhone."
        : "Não foi possível reproduzir o vídeo.";
    return (
      <View style={[styles.wrap, styles.fallback, style]}>
        <Text style={styles.fallbackText}>{label}</Text>
        {error !== "FORMAT_IOS" ? (
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
      {!ready ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {poster && !coverExpired ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: poster }}
              style={StyleSheet.absoluteFillObject}
              resizeMode={contentFit === "contain" ? "contain" : "cover"}
            />
          ) : null}
          <View style={styles.spinner}>
            <ActivityIndicator color="#fff" />
          </View>
        </View>
      ) : null}
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
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
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
