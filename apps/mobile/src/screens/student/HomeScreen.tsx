import { useMemo } from "react";
import { ActivityIndicator, RefreshControl, Text, View, StyleSheet } from "react-native";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { trainingCopy } from "../../student/copy";
import { useSt, type StudentTokens } from "../../student/theme";
import { useStudent } from "../../student/StudentContext";
import { openTrainingCatalog } from "../../student/navigate";
import type { FeedStackParamList, StudentTabParamList } from "../../navigation/types";

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<FeedStackParamList, "Feed">,
  BottomTabNavigationProp<StudentTabParamList>
>;

export function HomeScreen() {
  const { loading, error, refresh, hasAccess, profile } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createHomeStyles(st), [st]);
  const navigation = useNavigation<HomeNav>();
  const firstName = profile?.name?.trim().split(" ")[0];

  if (loading && !profile) {
    return (
      <StudentPage scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={st.gold} />
        </View>
      </StudentPage>
    );
  }

  return (
    <StudentPage refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={st.gold} />}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!hasAccess ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Acesso pendente"
          text="Quando a academia liberar sua matrícula, os treinos aparecem aqui."
        />
      ) : (
        <View style={styles.sheet}>
          <Text style={styles.kicker}>Home</Text>
          <Text style={styles.title}>{firstName ? `Olá, ${firstName}` : "Olá"}</Text>
          <Text style={styles.copy}>O treino de hoje e as modalidades estão na aba Treino.</Text>
          <GreenButton label={trainingCopy.workout} onPress={() => openTrainingCatalog(navigation)} />
        </View>
      )}
    </StudentPage>
  );
}

function createHomeStyles(st: StudentTokens) {
  return StyleSheet.create({
    sheet: {
      margin: 16,
      padding: 22,
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card
    },
    kicker: {
      color: st.gold,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase"
    },
    title: { color: st.text, fontSize: 24, fontWeight: "800" },
    copy: { color: st.muted, fontSize: 14, lineHeight: 20 },
    error: { color: "#9b1c1c", marginHorizontal: 16, fontWeight: "700" }
  });
}
