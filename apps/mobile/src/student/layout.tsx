import { useMemo, type ReactElement, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type ScrollViewProps
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { StudentChrome } from "./StudentChrome";
import { StudentMiniPlayer } from "./StudentMiniPlayer";
import { useSt, type StudentTokens } from "./theme";
import { uiSounds } from "./uiSounds";

function createLayoutStyles(st: StudentTokens) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: st.bg },
    playPage: { backgroundColor: st.playBg },
    fill: { flex: 1 },
    scroll: { paddingBottom: 28, gap: 12 },
    playScroll: { paddingHorizontal: 16 },
    heading: { alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    kicker: {
      color: st.goldUi,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    title: { color: st.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
    subtitle: { color: st.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
    greenWrap: { borderRadius: 12, overflow: "hidden", minHeight: 48 },
    greenBtn: {
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16
    },
    greenText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    outlineBtn: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: st.lineStrong,
      backgroundColor: st.fill,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16
    },
    outlineText: { color: st.text, fontSize: 16, fontWeight: "800" },
    empty: {
      marginHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.emptyBg,
      padding: 22,
      gap: 8,
      alignItems: "center"
    },
    emptyTitle: { color: st.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
    emptyText: { color: st.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
    cardIcon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: st.avatarBg,
      alignItems: "center",
      justifyContent: "center"
    },
    track: {
      height: 14,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: st.fill
    },
    trackFill: { height: "100%", borderRadius: 999 },
    seal: {
      position: "absolute",
      top: 8,
      right: 8,
      zIndex: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4
    },
    sealText: { color: "#1a1208", fontSize: 10, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    backChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: st.lineStrong,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: st.fill,
      marginHorizontal: 16
    },
    backChipText: { color: st.goldUi, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.88 }
  });
}

function useLayoutStyles() {
  const { st } = useSt();
  return useMemo(() => createLayoutStyles(st), [st]);
}

export function StudentPage({
  children,
  scroll = true,
  play = false,
  chrome = true,
  refreshControl,
  onScroll,
  scrollEventThrottle
}: {
  children: ReactNode;
  scroll?: boolean;
  play?: boolean;
  chrome?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  onScroll?: ScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
}) {
  const { st } = useSt();
  const styles = useLayoutStyles();
  const pageBg = play ? st.playBg : st.bg;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scroll, play && styles.playScroll]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle ?? (onScroll ? 16 : undefined)}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <View style={[styles.page, play && styles.playPage, { backgroundColor: pageBg }]}>
      {chrome ? <StudentChrome play={play} /> : null}
      {body}
      {chrome && !play ? <StudentMiniPlayer /> : null}
    </View>
  );
}

export function SheetHeading({
  kicker,
  title,
  subtitle
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
}) {
  const styles = useLayoutStyles();
  return (
    <View style={styles.heading}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function GreenButton({
  label,
  onPress,
  disabled,
  loading,
  icon
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const styles = useLayoutStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.greenWrap, (disabled || loading) && styles.disabled, pressed && styles.pressed]}
    >
      <LinearGradient colors={["#f2b461", "#df663c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.greenBtn}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
            <Text style={styles.greenText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  disabled,
  icon
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { st } = useSt();
  const styles = useLayoutStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.outlineBtn, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={18} color={st.text} /> : null}
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, text }: { icon?: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const { st } = useSt();
  const styles = useLayoutStyles();
  return (
    <View style={styles.empty}>
      {icon ? <Ionicons name={icon} size={34} color={st.gold} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function CardIcon({ name = "barbell-outline" }: { name?: keyof typeof Ionicons.glyphMap }) {
  const { st } = useSt();
  const styles = useLayoutStyles();
  return (
    <View style={styles.cardIcon}>
      <Ionicons name={name} size={26} color={st.coral} />
    </View>
  );
}

export function ProgressTrack({ percent }: { percent: number }) {
  const styles = useLayoutStyles();
  return (
    <View style={styles.track}>
      <LinearGradient
        colors={["#f2b461", "#df663c"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.trackFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]}
      />
    </View>
  );
}

export function CompletedSeal({ label }: { label: string }) {
  const styles = useLayoutStyles();
  return (
    <LinearGradient colors={["#f2b461", "#df663c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.seal}>
      <Ionicons name="trophy" size={12} color="#1a1208" />
      <Text style={styles.sealText}>{label}</Text>
    </LinearGradient>
  );
}

export function BackChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { st } = useSt();
  const styles = useLayoutStyles();
  return (
    <Pressable
      onPress={() => {
        uiSounds.pageChange();
        onPress();
      }}
      style={({ pressed }) => [styles.backChip, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={18} color={st.goldUi} />
      <Text style={styles.backChipText}>{label}</Text>
    </Pressable>
  );
}
