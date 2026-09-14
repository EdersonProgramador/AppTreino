import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** Tokens cinema ATLLY — funil pré-login alinhado ao web /ativar */
export const cinema = {
  bg: "#0a0a0a",
  bgSoft: "#12100c",
  text: "#fff7ec",
  muted: "#c9bbaa",
  faint: "#8f8376",
  gold: "#d4af37",
  coral: "#df663c",
  coralMid: "#e06a3c",
  line: "rgba(255,255,255,0.12)",
  lineStrong: "rgba(255,255,255,0.2)",
  panelBg: "rgba(255,255,255,0.04)",
  panelBorder: "rgba(212,175,55,0.22)",
  inputBg: "rgba(255,255,255,0.04)",
  error: "#ffb4b4",
  warn: "#f0b45a",
  ink: "#0a0a0a"
} as const;

export function AtllyPrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useMemo(() => createButtonStyles(), []);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryWrap,
        style,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed
      ]}
    >
      <LinearGradient
        colors={[cinema.gold, cinema.coral]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryGradient}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function AtllyGhostLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useMemo(() => createButtonStyles(), []);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.ghostWrap}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function AtllySecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  style
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useMemo(() => createButtonStyles(), []);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.secondaryBtn,
        style,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={cinema.gold} />
      ) : (
        <Text style={styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AtllyCinemaPanel({ children, title, style }: { children: ReactNode; title?: string; style?: StyleProp<ViewStyle> }) {
  const styles = useMemo(() => createPanelStyles(), []);
  return (
    <View style={[styles.panel, style]}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function StepperDot({ active, done, label }: { active: boolean; done: boolean; label: number }) {
  const scale = useRef(new Animated.Value(active ? 1.08 : 1)).current;
  const styles = useMemo(() => createStepperStyles(), []);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.08 : 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true
    }).start();
  }, [active, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        active && styles.dotActive,
        done && styles.dotDone,
        { transform: [{ scale }] }
      ]}
    >
      {done ? <Text style={styles.dotCheck}>✓</Text> : <Text style={styles.dotText}>{label}</Text>}
    </Animated.View>
  );
}

export function AtllyStepper({ steps, current }: { steps: string[]; current: number }) {
  const styles = useMemo(() => createStepperStyles(), []);
  return (
    <View style={styles.row}>
      {steps.map((label, index) => {
        const n = index + 1;
        const active = current === n;
        const done = current > n;
        return (
          <View key={label} style={styles.item}>
            <StepperDot active={active} done={done} label={n} />
            <Text style={[styles.label, active && styles.labelActive, done && styles.labelDone]}>{label}</Text>
            {index < steps.length - 1 ? <View style={[styles.connector, done && styles.connectorDone]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function AtllyAuthHeader({
  kicker,
  title,
  subtitle,
  onBack,
  backLabel = "← Voltar",
  showLogo = true
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  showLogo?: boolean;
}) {
  const styles = useMemo(() => createHeaderStyles(), []);
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.backWrap}>
          <Text style={styles.back}>{backLabel}</Text>
        </Pressable>
      ) : null}
      {showLogo ? (
        <Image source={require("../../assets/atlly-logo.png")} style={styles.logo} accessibilityIgnoresInvertColors />
      ) : null}
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function createButtonStyles() {
  return StyleSheet.create({
    primaryWrap: {
      borderRadius: 14,
      overflow: "hidden",
      minHeight: 54,
      shadowColor: cinema.coral,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6
    },
    primaryGradient: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 20
    },
    primaryText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase"
    },
    secondaryBtn: {
      alignItems: "center",
      borderWidth: 1,
      borderColor: cinema.gold,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 16,
      backgroundColor: "rgba(212,175,55,0.06)"
    },
    secondaryText: {
      color: cinema.gold,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase"
    },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
    ghostWrap: { alignItems: "center", paddingVertical: 10 },
    ghostText: { color: cinema.gold, fontSize: 15, fontWeight: "800" }
  });
}

function createPanelStyles() {
  return StyleSheet.create({
    panel: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: cinema.panelBorder,
      backgroundColor: cinema.panelBg,
      padding: 18,
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 }
    },
    panelTitle: {
      color: cinema.text,
      fontSize: 20,
      fontWeight: "900",
      marginBottom: 2
    }
  });
}

function createStepperStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginTop: 12,
      paddingHorizontal: 4
    },
    item: {
      flex: 1,
      alignItems: "center",
      position: "relative"
    },
    dot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: cinema.lineStrong,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.03)"
    },
    dotActive: {
      borderColor: cinema.coral,
      backgroundColor: "rgba(223,102,60,0.18)",
      shadowColor: cinema.coral,
      shadowOpacity: 0.4,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 }
    },
    dotDone: {
      backgroundColor: cinema.coral,
      borderColor: cinema.coral
    },
    dotText: { color: cinema.text, fontWeight: "800", fontSize: 13 },
    dotCheck: { color: "#fff", fontWeight: "900", fontSize: 14 },
    label: {
      color: cinema.faint,
      fontSize: 10,
      fontWeight: "800",
      marginTop: 6,
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: 0.3
    },
    labelActive: { color: cinema.gold },
    labelDone: { color: cinema.muted },
    connector: {
      position: "absolute",
      top: 16,
      left: "58%",
      right: "-42%",
      height: 2,
      backgroundColor: cinema.line,
      zIndex: -1
    },
    connectorDone: { backgroundColor: "rgba(223,102,60,0.5)" }
  });
}

function createHeaderStyles() {
  return StyleSheet.create({
    wrap: { gap: 8, alignItems: "flex-start" },
    backWrap: { marginBottom: 4 },
    back: { color: cinema.gold, fontSize: 15, fontWeight: "700" },
    logo: { width: 160, height: 42, resizeMode: "contain", alignSelf: "center", marginVertical: 4 },
    kicker: {
      color: cinema.gold,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      alignSelf: "flex-start"
    },
    title: { color: cinema.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.3 },
    subtitle: { color: cinema.muted, fontSize: 15, lineHeight: 22 }
  });
}
