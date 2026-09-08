import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WEB_URL } from "../config";
import { fetchStaffSummary, type StaffSummary } from "./staff-summary";
import { useSt } from "./theme";

const EMPTY: StaffSummary = {
  isStaff: false,
  isCoach: false,
  isActiveCoach: false,
  hasActiveSubscription: false,
  isNutritionist: false,
  roles: [],
  organizations: []
};

export function CoachAccessCard({ token }: { token: string }) {
  const { st } = useSt();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginHorizontal: 12,
          marginBottom: 8,
          padding: 14,
          borderRadius: 16,
          backgroundColor: st.card,
          borderWidth: 1,
          borderColor: st.line,
          gap: 10
        },
        head: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
        title: { color: st.text, fontWeight: "800", fontSize: 15 },
        subtitle: { color: st.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
        orgs: { color: st.gold, fontSize: 11, fontWeight: "700", marginTop: 6 },
        error: { color: st.danger, fontSize: 12 },
        actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
        primary: {
          flexGrow: 1,
          backgroundColor: "#df663c",
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 10,
          alignItems: "center"
        },
        primaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
        secondary: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderWidth: 1,
          borderColor: st.line,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 10
        },
        secondaryText: { color: st.text, fontWeight: "700", fontSize: 12 }
      }),
    [st]
  );
  const [summary, setSummary] = useState<StaffSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchStaffSummary(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o acesso profissional.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && !summary.isStaff && !summary.isCoach) return null;

  const orgLabel = summary.organizations.map((org) => org.name).join(" · ");
  const subtitle = summary.isStaff
    ? summary.isActiveCoach
      ? "Estúdio de treinos, turmas, alunos e comissão de indicação liberados."
      : summary.isCoach
        ? "Seu painel /coach está liberado. Renove a assinatura ATLLY para comissão e selo ativo."
        : "Gerencie alunos, turmas e conteúdo da sua organização."
    : "Integra equipe ATLLY ou foi promovido a coach? Abra o painel no navegador.";

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="sparkles" size={20} color={st.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Painel profissional ATLLY</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {orgLabel ? <Text style={styles.orgs}>{orgLabel}</Text> : null}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => void Linking.openURL(`${WEB_URL}/coach`)}>
          <Text style={styles.primaryText}>Abrir painel /coach</Text>
        </Pressable>
        <Pressable style={styles.secondary} disabled={loading} onPress={() => void load()}>
          {loading ? (
            <ActivityIndicator size="small" color={st.text} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={16} color={st.text} />
              <Text style={styles.secondaryText}>Atualizar</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
