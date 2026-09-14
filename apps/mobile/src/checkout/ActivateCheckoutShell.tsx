import { type ReactNode } from "react";
import { Image, ImageBackground, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { cinema } from "../auth/atllyAuthUi";
import { brand } from "../student/brand";
import { ActivateScanOverlay } from "./ActivateMotion";

const STORY_ITEMS = [
  "Treinos digitais com histórico de cargas e evolução.",
  "Corrida, caminhada e ciclismo integrados ao seu perfil.",
  `${brand.aiCoach} para orientação tática no dia a dia.`,
  "Comunidade, desafios e métricas de performance."
] as const;

const WIDE_BREAKPOINT = 900;

export function ActivateCheckoutShell({
  children,
  eyebrow = brand.areaEyebrow,
  title = "Ative seu sistema",
  subtitle = brand.commandLine,
  compactStory = false
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** Oculta bullets da story no mobile estreito durante pagamento/conta (como web). */
  compactStory?: boolean;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const hideStoryDetails = compactStory && !wide;

  return (
    <ImageBackground source={require("../../assets/atlly-activate-bg.png")} style={styles.bg} resizeMode="cover">
      <LinearGradient colors={["rgba(5,7,12,0.55)", "rgba(5,7,12,0.88)", "rgba(5,7,12,0.96)"]} style={styles.veil}>
        <ActivateScanOverlay />
        <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
          <ScrollView
            contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Image source={require("../../assets/atlly-logo.png")} style={styles.logo} accessibilityIgnoresInvertColors />
              <Text style={styles.headerCategory}>{brand.category}</Text>
            </View>

            <View style={[styles.grid, wide && styles.gridWide]}>
              <View style={[styles.story, wide && styles.storyWide, hideStoryDetails && styles.storyCompact]}>
                <Text style={styles.eyebrow}>{eyebrow}</Text>
                <Text style={[styles.title, wide && styles.titleWide]}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
                {!hideStoryDetails ? (
                  <View style={styles.storyList}>
                    {STORY_ITEMS.map((item) => (
                      <View key={item} style={styles.storyItem}>
                        <Text style={styles.storyBullet}>◆</Text>
                        <Text style={styles.storyText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={[styles.panelWrap, wide && styles.panelWide]}>{children}</View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: cinema.bg },
  veil: { flex: 1 },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 36, gap: 18 },
  scrollWide: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center"
  },
  header: { alignItems: "center", gap: 6, paddingTop: 4 },
  logo: { width: 150, height: 40, resizeMode: "contain" },
  headerCategory: {
    color: cinema.faint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  grid: { gap: 18 },
  gridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 28
  },
  story: { gap: 8, flex: 1 },
  storyWide: {
    flex: 1,
    maxWidth: 420,
    paddingTop: 8
  },
  storyCompact: {
    gap: 6
  },
  eyebrow: {
    color: cinema.gold,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase"
  },
  title: { color: cinema.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.3 },
  titleWide: { fontSize: 34, lineHeight: 38 },
  subtitle: { color: cinema.muted, fontSize: 15, lineHeight: 22 },
  storyList: { gap: 8, marginTop: 6 },
  storyItem: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  storyBullet: { color: cinema.coral, fontSize: 10, marginTop: 4 },
  storyText: { color: cinema.muted, flex: 1, fontSize: 13, lineHeight: 19 },
  panelWrap: { gap: 16, flex: 1 },
  panelWide: {
    flex: 1.15,
    minWidth: 0
  }
});
