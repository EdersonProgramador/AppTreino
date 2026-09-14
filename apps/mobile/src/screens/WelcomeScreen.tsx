import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { AtllyGhostLink, AtllyPrimaryButton, cinema } from "../auth/atllyAuthUi";
import { brand } from "../student/brand";
import { uiSounds } from "../student/uiSounds";

type WelcomeSlide = {
  key: string;
  image: ImageSourcePropType;
  eyebrow: string;
  headline: string;
  subtitle: string;
};

const SLIDES: WelcomeSlide[] = [
  {
    key: "command",
    image: require("../../assets/welcome/welcome-01-command.jpg"),
    eyebrow: brand.category,
    headline: "Comande sua mente.\nEvolua seu corpo.",
    subtitle: "Treino, corrida, dados e comunidade em um único sistema de performance humana."
  },
  {
    key: "gps",
    image: require("../../assets/welcome/welcome-03-training.jpg"),
    eyebrow: "Corrida · GPS",
    headline: "Grave cada km\ncom precisão.",
    subtitle: "Mapa ao vivo, trechos salvos e tracking nativo — inclusive com a tela apagada."
  },
  {
    key: "training",
    image: require("../../assets/welcome/welcome-02-gps.jpg"),
    eyebrow: "Treinos",
    headline: "Treinos da sua\nacademia, no celular.",
    subtitle: "Fichas organizadas por modalidade e objetivo, com execução guiada na palma da mão."
  },
  {
    key: "community",
    image: require("../../assets/welcome/welcome-04-community.jpg"),
    eyebrow: "Comunidade",
    headline: "Desafie atletas\nda sua região.",
    subtitle: "Feed, rankings, conquistas e rede social de atletas na ATLLY."
  }
];

const PRIMARY_CTA = "Ativar agora";

export function WelcomeScreen({
  onLogin,
  onActivate
}: {
  onLogin: () => void;
  onActivate: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<WelcomeSlide>>(null);
  const [index, setIndex] = useState(0);
  const styles = useMemo(() => createStyles(width, height), [width, height]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next !== index) setIndex(next);
    },
    [index, width]
  );

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Image source={item.image} style={styles.image} accessibilityIgnoresInvertColors />
            <LinearGradient colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"]} style={styles.veil} />
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>{item.eyebrow}</Text>
              <Text style={styles.headline}>{item.headline}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </View>
        )}
      />

      <SafeAreaView edges={["top", "bottom"]} style={styles.footer}>
        <View style={styles.dots} accessibilityRole="tablist">
          {SLIDES.map((slide, dotIndex) => (
            <Pressable
              key={slide.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: dotIndex === index }}
              accessibilityLabel={`Slide ${dotIndex + 1} de ${SLIDES.length}`}
              onPress={() => {
                uiSounds.toggleOn();
                listRef.current?.scrollToIndex({ index: dotIndex, animated: true });
                setIndex(dotIndex);
              }}
              style={[styles.dot, dotIndex === index ? styles.dotActive : null]}
            />
          ))}
        </View>

        <AtllyPrimaryButton
          label={PRIMARY_CTA}
          onPress={() => {
            uiSounds.submit();
            onActivate();
          }}
        />

        <AtllyGhostLink
          label="Fazer login"
          onPress={() => {
            uiSounds.toggleOn();
            onLogin();
          }}
        />
      </SafeAreaView>
    </View>
  );
}

function createStyles(width: number, height: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: cinema.bg
    },
    slide: {
      height,
      overflow: "hidden",
      backgroundColor: cinema.bg
    },
    image: {
      ...StyleSheet.absoluteFillObject,
      width,
      height,
      resizeMode: "cover"
    },
    veil: {
      ...StyleSheet.absoluteFillObject
    },
    copy: {
      position: "absolute",
      left: 24,
      right: 24,
      bottom: 220
    },
    eyebrow: {
      color: cinema.gold,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.6,
      marginBottom: 12,
      textTransform: "uppercase"
    },
    headline: {
      color: "#ffffff",
      fontSize: width < 360 ? 30 : 34,
      fontWeight: "900",
      letterSpacing: -0.5,
      lineHeight: width < 360 ? 34 : 38
    },
    subtitle: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 15,
      lineHeight: 22,
      marginTop: 12,
      maxWidth: 340
    },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingBottom: 12,
      gap: 10
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginBottom: 8
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.28)"
    },
    dotActive: {
      width: 22,
      backgroundColor: cinema.coral
    }
  });
}
