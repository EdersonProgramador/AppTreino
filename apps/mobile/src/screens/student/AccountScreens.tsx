import { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { apiDelete, apiPost, apiPut, apiUploadFile, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import {
  BRAZILIAN_STATES,
  genderLabel,
  labelBillingCycle,
  labelMembershipStatus,
  labelPaymentStatus,
  labelProductKind,
  labelPurchaseStatus
} from "../../student/commerce";
import { brand } from "../../student/brand";
import { trainingCopy } from "../../student/copy";
import { BackChip, EmptyState, GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { useStudent } from "../../student/StudentContext";
import { useSt } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import { formatDate, money } from "../../theme";

const OBJECTIVES = ["Hipertrofia", "Emagrecimento", "Condicionamento", "Saúde", "Definição"];
const LEVELS = ["Iniciante", "Intermediário", "Avançado"];

export { ProfileScreen } from "./ProfileScreen";

export function ProfileSettingsScreen() {
  const { profile, session, refresh } = useStudent();
  const { st } = useSt();
  const styles = useMenuStyles();
  const navigation = useNavigation();
  const achievements = profile?.achievements ?? [];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [document, setDocument] = useState(profile?.document ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birthDate ? profile.birthDate.slice(0, 10) : "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [objective, setObjective] = useState(profile?.objective ?? "");
  const [level, setLevel] = useState(profile?.level ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");

  useEffect(() => {
    setName(profile?.name ?? "");
    setDocument(profile?.document ?? "");
    setBirthDate(profile?.birthDate ? profile.birthDate.slice(0, 10) : "");
    setPhone(profile?.phone ?? "");
    setState(profile?.state ?? "");
    setCity(profile?.city ?? "");
    setObjective(profile?.objective ?? "");
    setLevel(profile?.level ?? "");
    setAvatarUrl(profile?.avatarUrl ?? "");
  }, [profile]);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      setBusy(true);
      const uploaded = await apiUploadFile<{ file: { url: string } }>(
        "/user/uploads",
        result.assets[0].uri,
        session.token,
        result.assets[0].fileName ?? "avatar.jpg"
      );
      setAvatarUrl(uploaded.file.url);
      uiSounds.screenshot();
    } catch (caught) {
      Alert.alert("Foto", caught instanceof NativeApiError ? caught.message : "Não foi possível enviar a foto.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (name.trim().length < 2) {
      uiSounds.error();
      Alert.alert("Perfil", "Informe o nome completo.");
      return;
    }
    setBusy(true);
    try {
      await apiPut(
        "/user/profile",
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
          document: document.trim() || undefined,
          birthDate: birthDate.trim() || undefined,
          objective: objective || undefined,
          level: level || undefined,
          city: city.trim() || undefined,
          state: state || undefined,
          avatarUrl: avatarUrl || undefined
        },
        session.token
      );
      await refresh();
      setEditing(false);
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Perfil", caught instanceof NativeApiError ? caught.message : "Não foi possível salvar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  const preview = mediaUrl(avatarUrl || profile?.avatarUrl);

  return (
    <StudentPage>
      <BackChip label="Perfil" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Configurações do perfil"
        title="Dados cadastrais"
        subtitle="Informações usadas em treinos, matrícula e contato com a academia."
      />
      <View style={styles.card}>
        <View style={styles.row}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" size={32} color={st.gold} />
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>{profile?.name ?? brand.athlete}</Text>
            <Text style={styles.muted}>{profile?.email ?? "—"}</Text>
            <Text style={styles.faint}>{genderLabel(profile?.gender)}</Text>
          </View>
        </View>
        {editing ? <OutlineButton label="Trocar foto" icon="camera-outline" onPress={() => void pickAvatar()} /> : null}
      </View>

      <SheetHeading kicker="Conquistas" title={trainingCopy.achievementsHeading} subtitle={trainingCopy.achievementsHint} />
      {achievements.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Selos" text={trainingCopy.achievementsEmpty} />
      ) : (
        achievements.map((item) => (
          <View key={item.modalityId} style={styles.card}>
            <View style={styles.row}>
              {item.modalityImageUrl ? (
                <Image source={{ uri: mediaUrl(item.modalityImageUrl) }} style={styles.thumb} />
              ) : (
                <Ionicons name="trophy" size={24} color={st.gold} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.modalityName}</Text>
                <Text style={styles.muted}>
                  {item.completionCount === 1 ? "1 ciclo concluído" : `${item.completionCount} ciclos concluídos`}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}

      <View style={styles.card}>
        <Text style={styles.gold}>Identificação</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput editable={editing} value={name} onChangeText={setName} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput editable={false} value={profile?.email ?? ""} style={[styles.input, { opacity: 0.7 }]} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>CPF</Text>
          <TextInput editable={editing} value={document} onChangeText={setDocument} placeholder="000.000.000-00" placeholderTextColor={st.faint} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Data de nascimento</Text>
          <TextInput editable={editing} value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-DD" placeholderTextColor={st.faint} style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Sexo</Text>
          <TextInput editable={false} value={genderLabel(profile?.gender)} style={[styles.input, { opacity: 0.7 }]} />
          <Text style={styles.faint}>Definido no cadastro · só a academia altera</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.gold}>Contato e localização</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Telefone</Text>
          <TextInput editable={editing} value={phone} onChangeText={setPhone} placeholder="+55 11 99999-9999" placeholderTextColor={st.faint} keyboardType="phone-pad" style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Estado</Text>
          {editing ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {BRAZILIAN_STATES.map((item) => (
                <Pressable
                  key={item.uf}
                  onPress={() => setState(item.uf)}
                  style={[styles.badge, state === item.uf && { backgroundColor: st.coral }]}
                >
                  <Text style={{ color: state === item.uf ? "#fff" : st.goldUi, fontWeight: "800", fontSize: 12 }}>{item.uf}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{state || "Não informado"}</Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Cidade</Text>
          <TextInput editable={editing} value={city} onChangeText={setCity} placeholder="Município" placeholderTextColor={st.faint} style={styles.input} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.gold}>Treino</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Objetivo</Text>
          {editing ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {OBJECTIVES.map((item) => (
                <Pressable key={item} onPress={() => setObjective(item)} style={[styles.badge, objective === item && { backgroundColor: st.coral }]}>
                  <Text style={{ color: objective === item ? "#fff" : st.goldUi, fontWeight: "800", fontSize: 12 }}>{item}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{objective || "Não informado"}</Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Nível</Text>
          {editing ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {LEVELS.map((item) => (
                <Pressable key={item} onPress={() => setLevel(item)} style={[styles.badge, level === item && { backgroundColor: st.coral }]}>
                  <Text style={{ color: level === item ? "#fff" : st.goldUi, fontWeight: "800", fontSize: 12 }}>{item}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{level || "Não informado"}</Text>
          )}
        </View>
      </View>

      <View style={styles.pad}>
        {editing ? (
          <>
            <GreenButton label="Salvar alterações" loading={busy} onPress={() => void save()} />
            <OutlineButton
              label="Cancelar"
              onPress={() => {
                setEditing(false);
                uiSounds.popupClose();
              }}
            />
          </>
        ) : (
          <OutlineButton
            label="Editar informações"
            icon="pencil-outline"
            onPress={() => {
              uiSounds.itemSelect();
              setEditing(true);
            }}
          />
        )}
      </View>
    </StudentPage>
  );
}

export function MembershipScreen() {
  const { membership } = useStudent();
  const navigation = useNavigation();
  const styles = useMenuStyles();
  const cycle = membership?.plan?.billingCycle === "YEARLY" ? "/ano" : "/mês";
  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Financeiro"
        title="Matrícula"
        subtitle={membership ? `Plano ${membership.plan?.name}` : "Nenhuma matrícula ativa"}
      />
      {!membership ? (
        <EmptyState icon="shield-checkmark-outline" title="Nenhuma matrícula ativa" text="Matrículas ativas liberam o fluxo do aluno." />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>{membership.plan?.name ?? "Plano"}</Text>
            <Text style={styles.badge}>{labelMembershipStatus(membership.status)}</Text>
          </View>
          <View style={styles.metricGrid}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{money(membership.plan?.priceInCents)}</Text>
              <Text style={styles.metricLabel}>{cycle}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatDate(membership.startsAt)}</Text>
              <Text style={styles.metricLabel}>Início</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{membership.endsAt ? formatDate(membership.endsAt) : "sem término"}</Text>
              <Text style={styles.metricLabel}>Vigência</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{labelBillingCycle(membership.plan?.billingCycle)}</Text>
              <Text style={styles.metricLabel}>cobrança</Text>
            </View>
          </View>
        </>
      )}
    </StudentPage>
  );
}

export function PaymentsScreen() {
  const { payments, paymentCards, publicConfig, session, refresh } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const cardsOn = publicConfig.module_cards !== "false";
  const [showForm, setShowForm] = useState(false);
  const [brand, setBrand] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [holderName, setHolderName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addCard() {
    if (!/^\d{4}$/.test(lastFour)) {
      Alert.alert("Cartão", "Informe os 4 últimos dígitos.");
      uiSounds.error();
      return;
    }
    setBusy(true);
    try {
      await apiPost(
        "/student/payment-cards",
        { brand: brand.trim() || undefined, lastFour, holderName: holderName.trim() || undefined, isDefault },
        session.token
      );
      setBrand("");
      setLastFour("");
      setHolderName("");
      setIsDefault(false);
      setShowForm(false);
      await refresh();
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Cartão", caught instanceof NativeApiError ? caught.message : "Não foi possível salvar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function removeCard(id: string) {
    try {
      await apiDelete(`/student/payment-cards/${id}`, session.token);
      await refresh();
      uiSounds.trash();
    } catch (caught) {
      Alert.alert("Cartão", caught instanceof NativeApiError ? caught.message : "Não foi possível remover.");
      uiSounds.error();
    }
  }

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Financeiro"
        title="Pagamentos"
        subtitle={payments.length > 0 ? `${payments.length} cobrança(s)` : "Nenhuma cobrança registrada"}
      />
      {payments.length === 0 ? (
        <EmptyState icon="card-outline" title="Nenhuma cobrança" text="Quando houver faturas, elas aparecem aqui com status padronizado." />
      ) : (
        payments.slice(0, 6).map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{money(item.amountInCents)}</Text>
            <Text style={styles.muted}>
              {`${labelPaymentStatus(item.status)} · vence ${formatDate(item.dueDate || item.paidAt)}`}
            </Text>
            {item.paymentUrl ? (
              <GreenButton
                label="Abrir checkout"
                onPress={() => {
                  uiSounds.paymentApproved();
                  void Linking.openURL(item.paymentUrl as string);
                }}
              />
            ) : null}
          </View>
        ))
      )}

      {cardsOn ? (
        <>
          <SheetHeading kicker="Cartões" title="Meus cartões" subtitle="Dados para cobrança recorrente" />
          <View style={styles.pad}>
            <OutlineButton
              label={showForm ? "Fechar" : "Adicionar cartão"}
              onPress={() => {
                uiSounds.itemSelect();
                setShowForm((value) => !value);
              }}
            />
          </View>
          {showForm ? (
            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>Bandeira</Text>
                <TextInput value={brand} onChangeText={setBrand} placeholder="Visa, Mastercard…" placeholderTextColor={st.faint} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Últimos 4 dígitos</Text>
                <TextInput
                  value={lastFour}
                  onChangeText={(value) => setLastFour(value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholderTextColor={st.faint}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nome impresso no cartão</Text>
                <TextInput value={holderName} onChangeText={setHolderName} placeholder="Como aparece no cartão" placeholderTextColor={st.faint} style={styles.input} />
              </View>
              <Pressable onPress={() => setIsDefault((value) => !value)} style={styles.row}>
                <Ionicons name={isDefault ? "checkbox" : "square-outline"} size={20} color={st.gold} />
                <Text style={styles.muted}>Definir como cartão principal</Text>
              </Pressable>
              <GreenButton label="Salvar cartão" loading={busy} onPress={() => void addCard()} />
            </View>
          ) : null}
          {paymentCards.length === 0 ? (
            <EmptyState icon="wallet-outline" title="Nenhum cartão salvo" text="Adicione um cartão para pagamentos recorrentes." />
          ) : (
            paymentCards.map((card) => (
              <View key={card.id} style={styles.card}>
                <View style={styles.row}>
                  <Ionicons name="card-outline" size={22} color={st.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{`${(card.brand ?? "Cartão").toUpperCase()} •••• ${card.lastFour}`}</Text>
                    <Text style={styles.muted}>{card.holderName ?? "Titular não informado"}</Text>
                    {card.isDefault ? <Text style={styles.badge}>Principal</Text> : null}
                  </View>
                  <Pressable onPress={() => void removeCard(card.id)}>
                    <Ionicons name="trash-outline" size={20} color={st.danger} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </>
      ) : null}
    </StudentPage>
  );
}

export function PurchasesScreen() {
  const { purchases, session, refresh } = useStudent();
  const navigation = useNavigation();
  const styles = useMenuStyles();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function pay(id: string, url?: string | null) {
    setBusyId(id);
    try {
      if (url) {
        await Linking.openURL(url);
        return;
      }
      const response = await apiPost<{ purchase: { paymentUrl?: string | null } }>(`/student/purchases/${id}/checkout`, {}, session.token);
      await refresh();
      if (response.purchase.paymentUrl) await Linking.openURL(response.purchase.paymentUrl);
      else Alert.alert("Pagamento", "Link de pagamento indisponível. Aguarde a confirmação da academia.");
    } catch (caught) {
      Alert.alert("Pagamento", caught instanceof NativeApiError ? caught.message : "Não foi possível abrir o checkout.");
      uiSounds.error();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Pedidos"
        title="Minhas compras"
        subtitle={`${purchases.length} pedido(s) · status atualizado pela academia`}
      />
      {purchases.length === 0 ? (
        <EmptyState icon="bag-outline" title="Nenhum pedido ainda" text="Solicite um produto na vitrine para acompanhar aqui." />
      ) : (
        purchases.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.product?.name ?? money(item.amountInCents)}</Text>
            <Text style={styles.muted}>
              {`${money(item.amountInCents)} · ${labelProductKind(item.product?.kind)}`}
            </Text>
            <Text style={styles.badge}>{labelPurchaseStatus(item.status)}</Text>
            <Text style={styles.faint}>{formatDate(item.createdAt)}</Text>
            {item.status === "PENDING" ? (
              <GreenButton
                label={busyId === item.id ? "Abrindo..." : item.paymentUrl ? "Pagar agora" : "Gerar pagamento"}
                loading={busyId === item.id}
                onPress={() => void pay(item.id, item.paymentUrl)}
              />
            ) : null}
          </View>
        ))
      )}
    </StudentPage>
  );
}
