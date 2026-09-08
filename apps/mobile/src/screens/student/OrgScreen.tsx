import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../../auth/api";
import type { MenuStackParamList } from "../../navigation/types";
import { BackChip, EmptyState, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt } from "../../student/theme";

type OrgNav = NativeStackNavigationProp<MenuStackParamList, "Org">;

type OrgUser = { id: string; name: string; email: string | null };

type OrgResources = {
  links: Array<{
    id: string;
    status: string;
    organization: { id: string; name: string; type?: string };
    unit: { id: string; name: string; city?: string | null; state?: string | null };
  }>;
  assignments: Array<{
    id: string;
    professionalType: string;
    professional: OrgUser;
    modality: { id: string; name: string } | null;
  }>;
  classMembers: Array<{
    id: string;
    class: {
      id: string;
      name: string;
      description: string | null;
      coach: OrgUser;
      modality: { id: string; name: string } | null;
      organization: { id: string; name: string };
      unit: { id: string; name: string };
    };
  }>;
  nutritionAssignments: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    nutritionPlan: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      nutritionist: OrgUser;
      organization: { id: string; name: string };
      unit: { id: string; name: string };
    };
  }>;
};

function Section({
  title,
  icon,
  children
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { st } = useSt();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          backgroundColor: st.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: st.line,
          padding: 14,
          gap: 8
        },
        title: { color: st.text, fontWeight: "800", fontSize: 16 },
        row: {
          borderWidth: 1,
          borderColor: st.line,
          borderRadius: 12,
          padding: 10,
          gap: 2
        },
        strong: { color: st.text, fontWeight: "700", fontSize: 14 },
        meta: { color: st.muted, fontSize: 12, lineHeight: 17 }
      }),
    [st]
  );

  return (
    <View style={styles.wrap}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon} size={18} color={st.gold} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function OrgScreen() {
  const navigation = useNavigation<OrgNav>();
  const { session } = useStudent();
  const athleteId = session.user.id;
  const { st } = useSt();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: { gap: 6, marginBottom: 12 },
        title: { color: st.text, fontWeight: "800", fontSize: 22 },
        subtitle: { color: st.muted, fontSize: 13, lineHeight: 18 },
        error: { color: st.danger, fontSize: 13 },
        refresh: { alignSelf: "flex-start", flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 12 },
        refreshText: { color: st.gold, fontWeight: "700" },
        stack: { gap: 12 }
      }),
    [st]
  );
  const [data, setData] = useState<OrgResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<OrgResources>(`/org/athletes/${athleteId}/org-resources`, session.token);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar sua organização.");
    } finally {
      setLoading(false);
    }
  }, [athleteId, session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  const empty =
    !data?.links.length &&
    !data?.classMembers.length &&
    !data?.nutritionAssignments.length &&
    !data?.assignments.length;

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <View style={styles.header}>
        <Text style={styles.title}>Minha organização</Text>
        <Text style={styles.subtitle}>
          Vínculos, turmas, profissionais e planos nutricionais da sua academia/box.
        </Text>
      </View>
      <Pressable style={styles.refresh} disabled={loading} onPress={() => void load()}>
        {loading ? <ActivityIndicator size="small" color={st.gold} /> : <Ionicons name="refresh-outline" size={16} color={st.gold} />}
        <Text style={styles.refreshText}>Atualizar</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? (
        <ActivityIndicator color={st.gold} />
      ) : empty ? (
        <EmptyState
          title="Sem vínculos"
          text="Você ainda não está vinculado a nenhuma organização. Quando o admin/coach te adicionar, turmas e nutrição aparecem aqui."
        />
      ) : (
        <View style={styles.stack}>
          <Section title="Vínculos" icon="business-outline">
            {(data?.links ?? []).length === 0 ? (
              <Text style={{ color: st.muted, fontSize: 13 }}>Sem vínculos ativos.</Text>
            ) : (
              (data?.links ?? []).map((link) => (
                <View key={link.id} style={{ borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: st.text, fontWeight: "700" }}>{link.organization.name}</Text>
                  <Text style={{ color: st.muted, fontSize: 12 }}>
                    {link.unit.name}
                    {link.unit.city ? ` · ${link.unit.city}/${link.unit.state ?? ""}` : ""} · {link.status}
                  </Text>
                </View>
              ))
            )}
          </Section>
          <Section title="Profissionais" icon="people-outline">
            {(data?.assignments ?? []).length === 0 ? (
              <Text style={{ color: st.muted, fontSize: 13 }}>Nenhum coach/nutri atribuído.</Text>
            ) : (
              (data?.assignments ?? []).map((item) => (
                <View key={item.id} style={{ borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: st.text, fontWeight: "700" }}>{item.professional.name}</Text>
                  <Text style={{ color: st.muted, fontSize: 12 }}>
                    {item.professionalType}
                    {item.modality ? ` · ${item.modality.name}` : ""}
                  </Text>
                </View>
              ))
            )}
          </Section>
          <Section title="Turmas" icon="clipboard-outline">
            {(data?.classMembers ?? []).length === 0 ? (
              <Text style={{ color: st.muted, fontSize: 13 }}>Você ainda não está em nenhuma turma.</Text>
            ) : (
              (data?.classMembers ?? []).map((item) => (
                <View key={item.id} style={{ borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, gap: 4 }}>
                  <Text style={{ color: st.text, fontWeight: "700" }}>{item.class.name}</Text>
                  <Text style={{ color: st.muted, fontSize: 12 }}>
                    {item.class.organization.name} · {item.class.unit.name} · Coach: {item.class.coach.name}
                    {item.class.modality ? ` · ${item.class.modality.name}` : ""}
                  </Text>
                  {item.class.description ? (
                    <Text style={{ color: st.muted, fontSize: 12 }}>{item.class.description}</Text>
                  ) : null}
                </View>
              ))
            )}
          </Section>
          <Section title="Nutrição" icon="nutrition-outline">
            {(data?.nutritionAssignments ?? []).length === 0 ? (
              <Text style={{ color: st.muted, fontSize: 13 }}>Nenhum plano nutricional ativo.</Text>
            ) : (
              (data?.nutritionAssignments ?? []).map((item) => (
                <View key={item.id} style={{ borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, gap: 4 }}>
                  <Text style={{ color: st.text, fontWeight: "700" }}>{item.nutritionPlan.title}</Text>
                  <Text style={{ color: st.muted, fontSize: 12 }}>
                    {item.nutritionPlan.nutritionist.name} · {item.nutritionPlan.organization.name} · {item.nutritionPlan.status}
                  </Text>
                  {item.nutritionPlan.description ? (
                    <Text style={{ color: st.muted, fontSize: 12 }}>{item.nutritionPlan.description}</Text>
                  ) : null}
                </View>
              ))
            )}
          </Section>
        </View>
      )}
    </StudentPage>
  );
}
