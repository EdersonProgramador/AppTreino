import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";

export function Screen({
  children,
  scroll = true
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "left"]}>
      {body}
    </SafeAreaView>
  );
}

export function Heading({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.heading}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function RowCard({
  imageUrl,
  icon,
  title,
  subtitle,
  badge,
  actionLabel,
  onPress,
  disabled
}: {
  imageUrl?: string | null;
  icon?: ImageSourcePropType;
  title: string;
  subtitle?: string;
  badge?: string;
  actionLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.rowCard, disabled && styles.disabled]} onPress={onPress} disabled={disabled || !onPress}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbFallback}>
          {icon ? <Image source={icon} style={styles.thumb} /> : <Text style={styles.thumbGlyph}>●</Text>}
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      {actionLabel ? <Text style={styles.action}>{actionLabel}</Text> : null}
    </Pressable>
  );
}

export function GoldButton({
  label,
  onPress,
  disabled,
  loading
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.goldBtn, (disabled || loading) && styles.disabled, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.goldText}>{label}</Text>}
    </Pressable>
  );
}

export function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}>
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <Card>
      <Text style={styles.subtitle}>{text}</Text>
    </Card>
  );
}

export function ErrorText({ text }: { text?: string | null }) {
  if (!text) return null;
  return <Text style={styles.error}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  heading: { gap: 4, marginBottom: 4 },
  kicker: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.sand, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12
  },
  thumb: { width: 56, height: 56, borderRadius: 14 },
  thumbFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center"
  },
  thumbGlyph: { color: colors.gold, fontSize: 18 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.sand, fontSize: 16, fontWeight: "800" },
  rowSub: { color: colors.faint, fontSize: 13 },
  badge: {
    color: colors.ink,
    backgroundColor: colors.gold,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: "uppercase"
  },
  action: { color: colors.gold, fontSize: 13, fontWeight: "800" },
  goldBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center"
  },
  goldText: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  outlineBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  outlineText: { color: colors.sand, fontSize: 14, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 }
});
