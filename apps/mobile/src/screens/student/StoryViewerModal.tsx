import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiPost } from "../../auth/api";
import { AppVideo } from "../../components/AppVideo";
import { mediaUrl } from "../../lib/media";
import { STORY_IMAGE_DURATION_MS, STORY_VIDEO_MAX_MS, STORY_VIDEO_MAX_SECONDS } from "../../student/storyConstants";
import type { SocialStoryGalleryItem, SocialStoryRail } from "../../types";

type Props = {
  visible: boolean;
  rails: SocialStoryRail[];
  startRail: number;
  startItem?: number;
  token: string;
  archiveMode?: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function expiresLabel(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expirando…";
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `Expira em ${hours}h`;
  return `Expira em ${Math.max(minutes, 1)}min`;
}

export function StoryViewerModal({
  visible,
  rails,
  startRail,
  startItem = 0,
  token,
  archiveMode = false,
  onClose,
  onSaved
}: Props) {
  const [railIndex, setRailIndex] = useState(startRail);
  const [itemIndex, setItemIndex] = useState(startItem);
  const [paused, setPaused] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [slideDurationMs, setSlideDurationMs] = useState(STORY_IMAGE_DURATION_MS);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goNextRef = useRef<() => void>(() => undefined);

  const rail = rails[railIndex];
  const item = rail?.items[itemIndex];
  const isVideo = String(item?.mediaType || "").toUpperCase() === "VIDEO";
  const uri = item ? mediaUrl(item.mediaUrl) : undefined;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopProgress = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
  }, []);

  const goNext = useCallback(() => {
    if (!rail) {
      onClose();
      return;
    }
    if (itemIndex + 1 < rail.items.length) {
      setItemIndex((current) => current + 1);
      return;
    }
    if (railIndex + 1 < rails.length) {
      setRailIndex((current) => current + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }, [itemIndex, onClose, rail, railIndex, rails.length]);

  goNextRef.current = goNext;

  const goPrev = useCallback(() => {
    if (itemIndex > 0) {
      setItemIndex((current) => current - 1);
      return;
    }
    if (railIndex > 0) {
      const previous = rails[railIndex - 1];
      setRailIndex((current) => current - 1);
      setItemIndex(Math.max(0, (previous?.items.length ?? 1) - 1));
    }
  }, [itemIndex, railIndex, rails]);

  useEffect(() => {
    if (!visible) return;
    setRailIndex(startRail);
    setItemIndex(startItem);
    setPaused(false);
  }, [startItem, startRail, visible]);

  useEffect(() => {
    if (!visible || !item || archiveMode) return;
    void apiPost(`/student/social/stories/${item.id}/view`, {}, token).catch(() => undefined);
  }, [archiveMode, item?.id, token, visible]);

  useEffect(() => {
    setSlideDurationMs(isVideo ? STORY_VIDEO_MAX_MS : STORY_IMAGE_DURATION_MS);
  }, [isVideo, item?.id]);

  const runProgress = useCallback(
    (durationMs: number, from = 0) => {
      stopProgress();
      progress.setValue(from);
      const remaining = Math.max(80, durationMs * (1 - from));
      animRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false
      });
      animRef.current.start(({ finished }) => {
        if (finished && !archiveMode) goNextRef.current();
      });
    },
    [archiveMode, progress, stopProgress]
  );

  useEffect(() => {
    clearTimer();
    stopProgress();
    if (!visible || !item || archiveMode) return;

    if (paused) return;

    if (!isVideo) {
      runProgress(STORY_IMAGE_DURATION_MS);
      timerRef.current = setTimeout(() => goNextRef.current(), STORY_IMAGE_DURATION_MS);
      return () => {
        clearTimer();
        stopProgress();
      };
    }

    runProgress(slideDurationMs);

    return () => {
      clearTimer();
      stopProgress();
    };
  }, [
    archiveMode,
    clearTimer,
    isVideo,
    item?.id,
    itemIndex,
    paused,
    railIndex,
    runProgress,
    slideDurationMs,
    stopProgress,
    visible
  ]);

  async function saveCurrent() {
    if (!item || !rail?.isMine || saveBusy || savedIds.has(item.id) || archiveMode) return;
    setSaveBusy(true);
    try {
      await apiPost(`/student/social/stories/${item.id}/gallery`, {}, token);
      setSavedIds((current) => new Set(current).add(item.id));
      onSaved?.();
    } finally {
      setSaveBusy(false);
    }
  }

  const title = useMemo(() => {
    if (archiveMode) return "Galeria";
    if (!rail) return "Momento";
    return rail.isMine ? "Você" : rail.username;
  }, [archiveMode, rail]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.progressRow}>
          {(rail?.items ?? []).map((entry, index) => {
            const done = index < itemIndex;
            const active = index === itemIndex && !paused && !archiveMode;
            return (
              <View key={entry.id} style={styles.progressTrack}>
                {done ? <View style={[styles.progressFill, { width: "100%" }]} /> : null}
                {active ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"]
                        })
                      }
                    ]}
                  />
                ) : null}
                {!done && !active && index === itemIndex ? <View style={[styles.progressFill, { width: "0%" }]} /> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {!archiveMode && item ? (
              <Text style={styles.sub}>{expiresLabel(item.expiresAt) ?? ""}</Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.mediaWrap}>
          {uri && isVideo ? (
            <AppVideo
              key={item?.id}
              uri={uri}
              style={styles.media}
              contentFit="contain"
              playing={!paused}
              loop={archiveMode}
              muted={!archiveMode}
              nativeControls={archiveMode}
              restartKey={item?.id}
              maxSeconds={archiveMode ? undefined : STORY_VIDEO_MAX_SECONDS}
              onDurationMs={(ms) => {
                if (archiveMode) return;
                const next = Math.min(Math.max(ms, 100), STORY_VIDEO_MAX_MS);
                if (Math.abs(next - slideDurationMs) > 250) setSlideDurationMs(next);
              }}
              onEnd={() => {
                if (archiveMode) return;
                clearTimer();
                stopProgress();
                goNextRef.current();
              }}
            />
          ) : uri ? (
            <Image key={item?.id} source={{ uri }} style={styles.media} resizeMode="contain" />
          ) : null}

          <Pressable
            style={styles.tapPrev}
            onPress={goPrev}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
          <Pressable
            style={styles.tapNext}
            onPress={goNext}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
        </View>

        {item?.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}

        {rail?.isMine && !archiveMode && item ? (
          <Pressable
            style={[styles.saveBtn, savedIds.has(item.id) && styles.saveBtnOn]}
            disabled={saveBusy || savedIds.has(item.id)}
            onPress={() => void saveCurrent()}
          >
            <Ionicons name={savedIds.has(item.id) ? "bookmark" : "bookmark-outline"} size={16} color="#fff" />
            <Text style={styles.saveText}>{savedIds.has(item.id) ? "Salvo na galeria" : "Salvar na galeria"}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

export function galleryItemsToRail(items: SocialStoryGalleryItem[], focusIndex: number): SocialStoryRail | null {
  if (!items.length || focusIndex < 0 || focusIndex >= items.length) return null;
  return {
    userId: "gallery",
    username: "Galeria",
    image_url: items[focusIndex]?.coverUrl || items[focusIndex]?.mediaUrl,
    isMine: true,
    unseen: false,
    items: items.map((entry) => ({
      id: entry.id,
      mediaUrl: entry.mediaUrl,
      mediaType: entry.mediaType,
      coverUrl: entry.coverUrl,
      caption: entry.caption,
      mood: entry.mood || "normal",
      createdAt: entry.savedAt,
      seen: true
    }))
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: 12
  },
  progressRow: { flexDirection: "row", gap: 4, marginBottom: 12 },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden"
  },
  progressFill: { height: "100%", backgroundColor: "#fff" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  title: { color: "#fff", fontWeight: "800", fontSize: 16 },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2, fontWeight: "600" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  mediaWrap: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111",
    position: "relative"
  },
  media: { width: "100%", height: "100%" },
  tapPrev: { position: "absolute", left: 0, top: 0, bottom: 0, width: "35%" },
  tapNext: { position: "absolute", right: 0, top: 0, bottom: 0, width: "65%" },
  caption: { color: "#fff", marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  saveBtn: {
    marginTop: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)"
  },
  saveBtnOn: { backgroundColor: "rgba(242,180,97,0.35)" },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 13 }
});
