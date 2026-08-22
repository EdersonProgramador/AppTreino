import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { emptyMusicSnapshot, musicPlayback, type MusicPlaybackSnapshot } from "../musicPlayback";
import type { PlayStackParamList, StudentTabParamList } from "../navigation/types";
import { useSt } from "./theme";
import { uiSounds } from "./uiSounds";

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<PlayStackParamList>,
  BottomTabNavigationProp<StudentTabParamList>
>;

export function StudentMiniPlayer() {
  const navigation = useNavigation<Nav>();
  const { st } = useSt();
  const [snap, setSnap] = useState<MusicPlaybackSnapshot>(emptyMusicSnapshot());
  useEffect(() => musicPlayback.subscribe(setSnap), []);
  const current = snap.current;
  if (!current) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: st.card, borderTopColor: st.line }]}>
      <Pressable
        style={styles.hit}
        onPress={() => {
          uiSounds.itemSelect();
          navigation.navigate("PlayTab", { screen: "NowPlaying" });
        }}
      >
        {current.artwork ? (
          <Image source={{ uri: current.artwork }} style={styles.art} />
        ) : (
          <View style={[styles.art, { backgroundColor: st.avatarBg }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: st.text }]} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={[styles.sub, { color: st.muted }]} numberOfLines={1}>
            {current.artist}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => {
          uiSounds.itemSelect();
          void musicPlayback.toggle();
        }}
        style={styles.ctrl}
        accessibilityLabel={snap.playing ? "Pausar" : "Tocar"}
      >
        <Ionicons name={snap.playing ? "pause" : "play"} size={22} color={st.text} />
      </Pressable>
      <Pressable
        onPress={() => void musicPlayback.next({ autoplay: true })}
        style={styles.ctrl}
        accessibilityLabel="Próxima"
      >
        <Ionicons name="play-skip-forward" size={20} color={st.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6
  },
  hit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  art: { width: 44, height: 44, borderRadius: 8 },
  title: { fontWeight: "800", fontSize: 13 },
  sub: { fontSize: 11, marginTop: 2 },
  ctrl: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }
});
