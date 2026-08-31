import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { apiGet, apiPost, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { trainingCopy } from "../../student/copy";
import { GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import { money } from "../../theme";

type CatalogPlan = { code: string; name: string; priceInCents: number };

const BILLING = [
  { value: "UNDEFINED", label: "Escolher no checkout" },
  { value: "PIX", label: "Pix" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CREDIT_CARD", label: "Cartão" }
] as const;

function useLockedStyles() {
  const { st } = useSt();
  return useMemo(() => createLockedStyles(st), [st]);
}

const LOCKED_FEATURES = [
  { icon: "barbell-outline" as const, title: trainingCopy.todayWorkout, text: "Sessões, exercícios, séries, repetições e descanso." },
  { icon: "resize-outline" as const, title: trainingCopy.physicalAssessment, text: "Medidas, histórico corporal e acompanhamento de evolução." },
  { icon: "calendar-outline" as const, title: "Eventos", text: "Inscrições em aulas, desafios e encontros da comunidade." },
  { icon: "headset-outline" as const, title: "Atendimento", text: "Abertura de chamados para suporte de treino, pagamento e acesso." },
  { icon: "sparkles-outline" as const, title: "Coach IA", text: "Chat, voz, treinos de todas as modalidades e dieta pelo biotipo." }
];

export function SubscriptionScreen() {
  const { session, refresh, payments, membership } = useStudent();
  const styles = useLockedStyles();
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [planCode, setPlanCode] = useState("monthly");
  const [billingType, setBillingType] = useState<(typeof BILLING)[number]["value"]>("UNDEFINED");
  const [busy, setBusy] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const pending = payments.find((item) => item.status === "PENDING" || item.status === "OVERDUE");
  const selectedPlan = plans.find((item) => item.code === planCode) ?? plans[0] ?? null;

  useEffect(() => {
    void apiGet<{ plans: CatalogPlan[] }>("/plans")
      .then((response) => {
        const next = response.plans ?? [];
        setPlans(next);
        if (next[0] && !next.some((plan) => plan.code === planCode)) {
          setPlanCode(next[0].code);
        }
      })
      .catch(() => setPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function subscribe() {
    setBusy(true);
    try {
      const response = await apiPost<{
        alreadyActive?: boolean;
        payment?: { id: string; paymentUrl?: string | null; amountInCents?: number };
      }>("/checkout/session", { planCode, billingType }, session.token);
      uiSounds.paymentApproved();
      if (response.alreadyActive) {
        await refresh();
        return;
      }
      setPaymentId(response.payment?.id ?? null);
      setPaymentUrl(response.payment?.paymentUrl ?? null);
      if (response.payment?.paymentUrl) await Linking.openURL(response.payment.paymentUrl);
      await refresh();
    } catch (caught) {
      uiSounds.paymentDisconnected();
      Alert.alert("Assinatura", caught instanceof NativeApiError ? caught.message : "Não foi possível iniciar o checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSandbox() {
    if (!paymentId) return;
    setBusy(true);
    try {
      await apiPost("/checkout/confirm-sandbox", { paymentId }, session.token);
      uiSounds.paymentApproved();
      await refresh();
    } catch (caught) {
      uiSounds.paymentDisconnected();
      Alert.alert("Sandbox", caught instanceof NativeApiError ? caught.message : "Não foi possível confirmar o pagamento sandbox.");
    } finally {
      setBusy(false);
    }
  }

  const checkoutPayment =
    pending ?? (paymentUrl ? { amountInCents: selectedPlan?.priceInCents, paymentUrl } : null);

  return (
    <StudentPage chrome={false}>
      <SheetHeading
        kicker="Assinatura"
        title="Assine agora e comece a treinar."
        subtitle="Escolha seu plano e finalize o pagamento com Pix ou cartão no checkout seguro do Asaas. O acesso é liberado automaticamente assim que o pagamento for confirmado."
      />
      {checkoutPayment ? (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>{`Pagamento pendente de ${money(checkoutPayment.amountInCents)}`}</Text>
          <Text style={styles.copy}>Continue no checkout do Asaas para concluir sua assinatura.</Text>
        </View>
      ) : null}
      {membership ? (
        <Text style={styles.copy}>{`Status atual: ${membership.status ?? "PENDENTE"} · ${membership.plan?.name ?? "Plano"}`}</Text>
      ) : null}
      <View style={styles.card}>
        {plans.length === 0 ? <Text style={styles.copy}>Carregando planos…</Text> : null}
        {plans.map((plan) => (
          <Pressable
            key={plan.code}
            onPress={() => {
              uiSounds.radioSelect();
              setPlanCode(plan.code);
            }}
            style={[styles.plan, planCode === plan.code && styles.planOn]}
          >
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>{money(plan.priceInCents)}</Text>
          </Pressable>
        ))}
        <Text style={styles.label}>Pagamento</Text>
        <View style={styles.row}>
          {BILLING.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setBillingType(item.value)}
              style={[styles.chip, billingType === item.value && styles.chipOn]}
            >
              <Text style={[styles.chipText, billingType === item.value && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {paymentUrl || pending?.paymentUrl ? (
          <OutlineButton
            label="Abrir checkout do Asaas"
            icon="open-outline"
            onPress={() => void Linking.openURL((paymentUrl || pending?.paymentUrl) as string)}
          />
        ) : null}
        {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_SANDBOX_CONFIRM === "true") && paymentId && !paymentUrl ? (
          <OutlineButton label="Finalizar checkout sandbox" onPress={() => void confirmSandbox()} />
        ) : null}
        <GreenButton
          label={busy ? "Gerando checkout…" : "Assinar agora"}
          loading={busy}
          onPress={() => void subscribe()}
          disabled={busy || plans.length === 0}
        />
      </View>
    </StudentPage>
  );
}

export function LockedContentsScreen() {
  const { modalities } = useStudent();
  const { st } = useSt();
  const styles = useLockedStyles();
  const navigation = useNavigation();

  function goSubscribe() {
    uiSounds.blocked();
    navigation.navigate("Subscription" as never);
  }

  return (
    <StudentPage chrome={false}>
      <SheetHeading
        kicker="ATLLY"
        title="Este treino está bloqueado"
        subtitle="Finalize a assinatura pendente para liberar o player e as funcionalidades do atleta."
      />
      <View style={styles.lockCard}>
        <Ionicons name="lock-closed" size={34} color={st.gold} />
        <Text style={styles.lockTitle}>Este treino está bloqueado</Text>
        <Text style={styles.copy}>
          Finalize a assinatura pendente para liberar o player e as funcionalidades do aluno.
        </Text>
        <GreenButton label="Assinar agora" onPress={goSubscribe} />
      </View>
      <SheetHeading
        kicker="Prévia do app"
        title="Modalidades disponíveis para o seu perfil"
        subtitle="Conteúdo filtrado pelo seu sexo cadastrado. Assine para liberar os treinos."
      />
      {modalities.length === 0 ? (
        <View style={{ gap: 12 }}>
          {LOCKED_FEATURES.map((feature) => (
            <Pressable key={feature.title} onPress={goSubscribe} style={styles.feature}>
              <View style={styles.featureHead}>
                <Ionicons name={feature.icon} size={22} color={st.gold} />
                <Ionicons name="lock-closed" size={16} color={st.faint} />
              </View>
              <Text style={styles.planName}>{feature.title}</Text>
              <Text style={styles.copy}>{feature.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        modalities.map((item) => {
          const cover = mediaUrl(item.imageUrl);
          return (
            <Pressable key={item.id} onPress={goSubscribe} style={styles.mod}>
              {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : <View style={[styles.cover, styles.fallback]} />}
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={16} color="#fff" />
              </View>
              <Text style={styles.planName}>{item.name}</Text>
              <Text style={styles.copy}>{item.description?.trim() || "Bloqueado · finalize a assinatura"}</Text>
            </Pressable>
          );
        })
      )}
    </StudentPage>
  );
}

function createLockedStyles(st: StudentTokens) {
  return StyleSheet.create({
    card: { margin: 16, gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: st.line, backgroundColor: st.card },
    plan: { borderWidth: 1, borderColor: st.line, borderRadius: 14, padding: 14, gap: 4 },
    planOn: { borderColor: st.coral, backgroundColor: "rgba(223,102,60,0.08)" },
    planName: { color: st.text, fontWeight: "800", fontSize: 16, paddingHorizontal: 12 },
    planPrice: { color: st.goldUi, fontWeight: "800" },
    label: { color: st.goldUi, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    chipOn: { backgroundColor: st.coral, borderColor: st.coral },
    chipText: { color: st.text, fontWeight: "800", fontSize: 12 },
    chipTextOn: { color: "#fff" },
    note: { marginHorizontal: 16, padding: 14, borderRadius: 14, backgroundColor: "rgba(212,175,55,0.16)", gap: 4 },
    noteTitle: { color: st.text, fontWeight: "800" },
    copy: { color: st.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 12 },
    lockCard: {
      margin: 16,
      alignItems: "center",
      gap: 10,
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card
    },
    lockTitle: { color: st.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
    mod: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      paddingBottom: 12,
      gap: 6
    },
    cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: st.avatarBg },
    fallback: { alignItems: "center", justifyContent: "center" },
    lockBadge: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center"
    },
    feature: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      gap: 8
    },
    featureHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }
  });
}
