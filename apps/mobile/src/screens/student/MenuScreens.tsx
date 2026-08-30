import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiPost } from "../../auth/api";
import type { MenuStackParamList, StudentTabParamList } from "../../navigation/types";
import { trainingCopy } from "../../student/copy";
import { BackChip, EmptyState, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { navigateStudentTarget } from "../../student/navigate";
import { useStudent } from "../../student/StudentContext";
import { moduleOn, useSt } from "../../student/theme";
import { formatDateTime } from "../../theme";
import { isMapCompassEnabled, setMapCompassEnabled, setTheme, subscribeMapCompass, type UiTheme } from "../../student/prefs";
import { isSoundEnabled, setSoundEnabled, subscribeSoundEnabled, uiSounds, unlockUiAudio } from "../../student/uiSounds";
import {
  clearHomeFence,
  getHomeFence,
  setHomeFence,
  trackingEngine,
  DEFAULT_HOME_RADIUS_M,
  type HomeFence
} from "../../tracking";

type MenuNav = CompositeNavigationProp<
  NativeStackNavigationProp<MenuStackParamList>,
  BottomTabNavigationProp<StudentTabParamList>
>;

function MenuRow({
  icon,
  title,
  favorite,
  danger,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  favorite?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const { st } = useSt();
  const styles = useMenuStyles();
  return (
    <Pressable
      onPress={() => {
        if (!danger) uiSounds.itemSelect();
        onPress();
      }}
      style={[styles.menuItem, danger && { borderColor: "rgba(223,56,56,0.25)" }]}
    >
      <Ionicons name={icon} size={24} color={danger ? st.danger : st.gold} />
      <Text style={[styles.menuTitle, danger && { color: st.danger }]}>{title}</Text>
      {favorite ? <Ionicons name="star" size={18} color="#ffc400" /> : null}
    </Pressable>
  );
}

export function MenuScreen() {
  const navigation = useNavigation<MenuNav>();
  const { logout, publicConfig } = useStudent();
  const styles = useMenuStyles();
  const items: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    favorite?: boolean;
    moduleKey?: string;
    group: string;
    action: () => void;
  }> = [
    { icon: "person-outline", title: "Perfil do atleta", group: "Conta", action: () => navigation.navigate("Profile") },
    { icon: "settings-outline", title: "Configurações do perfil", group: "Conta", action: () => navigation.navigate("ProfileSettings") },
    {
      icon: "barbell-outline",
      title: trainingCopy.workout,
      favorite: true,
      group: "Treino",
      action: () => navigation.navigate("TrainingTab", { screen: "Training" })
    },
    {
      icon: "walk-outline",
      title: "Corrida",
      favorite: true,
      group: "Treino",
      action: () => navigation.navigate("ActivityTab", { screen: "Activity" })
    },
    {
      icon: "trophy-outline",
      title: "Desafios",
      favorite: true,
      group: "Treino",
      action: () => navigation.navigate("ClubTab", { screen: "Club" })
    },
    { icon: "sparkles-outline", title: "Coach IA", group: "Treino", moduleKey: "module_ai", action: () => navigation.navigate("Ai") },
    { icon: "shield-checkmark-outline", title: "Matrículas", group: "Conta", action: () => navigation.navigate("Membership") },
    { icon: "card-outline", title: "Pagamentos", favorite: true, group: "Conta", action: () => navigation.navigate("Payments") },
    { icon: "resize-outline", title: trainingCopy.physicalAssessment, group: "Saúde", action: () => navigation.navigate("Assessments") },
    { icon: "heart-outline", title: "Dados de saúde", group: "Saúde", action: () => navigation.navigate("HealthPermissions") },
    { icon: "calendar-outline", title: "Frequência", group: "Saúde", action: () => navigation.navigate("Status") },
    {
      icon: "cube-outline",
      title: "Vitrine",
      favorite: true,
      moduleKey: "module_products",
      group: "Play e loja",
      action: () => navigation.navigate("ShopTab", { screen: "Products" })
    },
    {
      icon: "cart-outline",
      title: "Carrinho",
      moduleKey: "module_products",
      group: "Play e loja",
      action: () => navigation.navigate("ShopTab", { screen: "Cart" })
    },
    {
      icon: "receipt-outline",
      title: "Pedidos online",
      moduleKey: "module_purchases",
      group: "Play e loja",
      action: () => navigation.navigate("ShopTab", { screen: "Orders" })
    },
    {
      icon: "bag-outline",
      title: "Compras rápidas",
      moduleKey: "module_purchases",
      group: "Play e loja",
      action: () => navigation.navigate("Purchases")
    },
    {
      icon: "musical-notes-outline",
      title: "Play",
      favorite: true,
      group: "Play e loja",
      action: () => navigation.navigate("PlayTab", { screen: "Play" })
    },
    { icon: "calendar-outline", title: "Eventos", group: "Comunidade", action: () => navigation.navigate("Events") },
    {
      icon: "film-outline",
      title: "Clipes",
      favorite: true,
      group: "Comunidade",
      action: () => navigation.navigate("FeedTab", { screen: "Reels" })
    },
    {
      icon: "radio-outline",
      title: "Ao vivo",
      group: "Comunidade",
      action: () => navigation.navigate("FeedTab", { screen: "Live" })
    },
    {
      icon: "chatbubbles-outline",
      title: "Mensagens",
      group: "Comunidade",
      action: () => navigation.navigate("FeedTab", { screen: "Messages" })
    },
    {
      icon: "globe-outline",
      title: "Chat global",
      group: "Comunidade",
      action: () => navigation.navigate("FeedTab", { screen: "Chat" })
    },
    {
      icon: "person-add-outline",
      title: "Pedidos para seguir",
      group: "Comunidade",
      action: () => navigation.navigate("FeedTab", { screen: "Requests" })
    },
    { icon: "location-outline", title: "Unidades", group: "Comunidade", action: () => navigation.navigate("Locations") },
    { icon: "headset-outline", title: "Atendimento", group: "Ajuda", action: () => navigation.navigate("Support") },
    { icon: "qr-code-outline", title: "QR Code", group: "Ajuda", action: () => navigation.navigate("Qr") },
    {
      icon: "wallet-outline",
      title: "Meus Cartões",
      moduleKey: "module_cards",
      group: "Conta",
      action: () => navigation.navigate("Payments")
    },
    { icon: "notifications-outline", title: "Notificações", group: "Ajuda", action: () => navigation.navigate("Notifications") },
    { icon: "settings-outline", title: "Configurações", group: "Conta", action: () => navigation.navigate("Settings") },
    { icon: "star-outline", title: trainingCopy.favoritesAndRatings, group: "Conta", action: () => navigation.navigate("Ratings") }
  ];

  const visible = items.filter((item) => !item.moduleKey || moduleOn(publicConfig, item.moduleKey));
  const grouped: Array<{ type: "group"; group: string } | { type: "item"; item: (typeof visible)[number] }> = [];
  const groupOrder: string[] = [];
  const byGroup = new Map<string, typeof visible>();
  for (const item of visible) {
    if (!byGroup.has(item.group)) {
      groupOrder.push(item.group);
      byGroup.set(item.group, []);
    }
    byGroup.get(item.group)!.push(item);
  }
  for (const group of groupOrder) {
    grouped.push({ type: "group", group });
    for (const item of byGroup.get(group) ?? []) {
      grouped.push({ type: "item", item });
    }
  }

  return (
    <StudentPage>
      <View style={styles.menuList}>
        {grouped.map((row, index) =>
          row.type === "group" ? (
            <Text key={`g-${row.group}`} style={[styles.gold, { paddingHorizontal: 4, paddingTop: 10 }]}>
              {row.group}
            </Text>
          ) : (
            <MenuRow
              key={`m-${index}-${row.item.title}`}
              icon={row.item.icon}
              title={row.item.title}
              favorite={row.item.favorite}
              onPress={row.item.action}
            />
          )
        )}
        <MenuRow icon="log-out-outline" title="Sair" danger onPress={logout} />
      </View>
    </StudentPage>
  );
}

export function NotificationsScreen() {
  const { notifications, session, refresh } = useStudent();
  const navigation = useNavigation<MenuNav>();
  const styles = useMenuStyles();
  async function open(id: string, target?: string | null) {
    try {
      await apiPost("/user/notifications/read", { ids: [id] }, session.token);
      await refresh();
    } catch {
      // ignore
    }
    navigateStudentTarget(navigation, target);
  }
  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Inbox" title="Notificações" />
      {notifications.length === 0 ? (
        <EmptyState icon="notifications-outline" title="Nenhuma publicação" text="Novidades da academia aparecem aqui." />
      ) : (
        notifications.map((item) => (
          <Pressable key={item.id} style={styles.card} onPress={() => void open(item.id, item.targetSection)}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.muted}>{item.message}</Text>
            <Text style={styles.faint}>{formatDateTime(item.publishedAt)}</Text>
            {!item.readAt ? <Text style={styles.gold}>Nova</Text> : null}
          </Pressable>
        ))
      )}
    </StudentPage>
  );
}

export function SettingsScreen() {
  const { hasAccess } = useStudent();
  const navigation = useNavigation();
  const { st, theme } = useSt();
  const styles = useMemo(() => createSettingsStyles(st), [st]);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [compassOn, setCompassOn] = useState(() => isMapCompassEnabled());
  const [home, setHome] = useState<HomeFence | null>(null);
  const [homeBusy, setHomeBusy] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  useEffect(() => subscribeSoundEnabled(setSoundOn), []);
  useEffect(() => subscribeMapCompass(setCompassOn), []);
  useEffect(() => {
    void getHomeFence().then(setHome);
  }, []);

  function applySound(next: boolean) {
    unlockUiAudio();
    if (next) {
      setSoundEnabled(true);
      uiSounds.toggleOn();
    } else {
      uiSounds.toggleOff();
      setSoundEnabled(false);
    }
  }

  function pickTheme(next: UiTheme) {
    if (next === theme) return;
    unlockUiAudio();
    setTheme(next);
    if (next === "dark") uiSounds.toggleOn();
    else uiSounds.toggleOff();
  }

  function applyCompass(next: boolean) {
    setMapCompassEnabled(next);
    setCompassOn(next);
    if (next) uiSounds.toggleOn();
    else uiSounds.toggleOff();
  }

  async function defineHomeHere() {
    setHomeBusy(true);
    setHomeError(null);
    try {
      await trackingEngine.init();
      const perms = await trackingEngine.requestPermissions();
      if (!perms.foreground) throw new Error("Permissão de localização negada.");
      const fix = await trackingEngine.locateOnce();
      if (!fix) throw new Error("Não foi possível obter GPS.");
      await setHomeFence(fix.lat, fix.lng, DEFAULT_HOME_RADIUS_M);
      setHome({ lat: fix.lat, lng: fix.lng, radiusM: DEFAULT_HOME_RADIUS_M });
      uiSounds.toggleOn();
    } catch (err) {
      setHomeError(err instanceof Error ? err.message : "Falha ao definir casa.");
    } finally {
      setHomeBusy(false);
    }
  }

  async function removeHome() {
    setHomeBusy(true);
    setHomeError(null);
    try {
      await clearHomeFence();
      setHome(null);
      uiSounds.toggleOff();
    } finally {
      setHomeBusy(false);
    }
  }

  return (
    <StudentPage chrome={hasAccess}>
      {hasAccess ? (
        <Pressable
          onPress={() => {
            uiSounds.popupClose();
            navigation.goBack();
          }}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={18} color={st.goldUi} />
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
      ) : null}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="settings-outline" size={24} color={st.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>preferências</Text>
          <Text style={styles.heroTitle}>Configurações</Text>
          <Text style={styles.heroSub}>Modo Claro/Escuro e efeitos sonoros do portal do aluno.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Aparência</Text>
        <Text style={styles.sectionCopy}>Escolha o modo Claro ou Escuro do sistema.</Text>
        <View style={styles.themeRow}>
          <Pressable
            onPress={() => pickTheme("light")}
            accessibilityRole="button"
            accessibilityState={{ selected: theme === "light" }}
            style={[styles.themeOption, theme === "light" && styles.themeLightActive]}
          >
            <Ionicons name="sunny" size={18} color={theme === "light" ? "#15100b" : st.faint} />
            <Text style={[styles.themeLabel, theme === "light" && styles.themeLightLabel]}>Claro</Text>
          </Pressable>
          <Pressable
            onPress={() => pickTheme("dark")}
            accessibilityRole="button"
            accessibilityState={{ selected: theme === "dark" }}
            style={[styles.themeOption, theme === "dark" && styles.themeDarkActive]}
          >
            <Ionicons name="moon" size={18} color={theme === "dark" ? "#f4ebe0" : st.faint} />
            <Text style={[styles.themeLabel, theme === "dark" && styles.themeDarkLabel]}>Escuro</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Efeitos sonoros</Text>
        <Text style={styles.sectionCopy}>Feedbacks de navegação, pagamento, treino e popups.</Text>
        <Pressable
          onPress={() => applySound(!soundOn)}
          accessibilityRole="switch"
          accessibilityState={{ checked: soundOn }}
          style={[styles.soundRow, soundOn && styles.soundRowOn]}
        >
          <View style={[styles.soundIcon, soundOn && styles.soundIconOn]}>
            <Ionicons name={soundOn ? "volume-high" : "volume-mute"} size={22} color={soundOn ? st.gold : st.faint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.soundTitle}>{soundOn ? "Com efeitos sonoros" : "Sem efeitos sonoros"}</Text>
            <Text style={styles.sectionCopy}>{soundOn ? "Ativado" : "Desativado"}</Text>
          </View>
          <Switch
            value={soundOn}
            onValueChange={applySound}
            trackColor={{ false: st.lineStrong, true: "#2a9d8f" }}
            thumbColor={soundOn ? "#69e1ac" : st.card}
            ios_backgroundColor={st.lineStrong}
          />
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Saúde</Text>
        <Text style={styles.sectionCopy}>
          Batimento, passos, distância e exercícios. O Apptreino pede permissão para ler e atualizar esses dados.
        </Text>
        <Pressable
          onPress={() => {
            uiSounds.itemSelect();
            navigation.navigate("HealthPermissions" as never);
          }}
          style={[styles.homeBtn, styles.homeBtnPrimary, { marginTop: 10 }]}
        >
          <Ionicons name="heart-outline" size={16} color="#15100b" />
          <Text style={styles.homeBtnPrimaryText}>Permissões de saúde</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bússola do mapa</Text>
        <Text style={styles.sectionCopy}>
          Magnetômetro e giroscópio giram o mapa da corrida na direção que você aponta. Desligue para manter o norte fixo.
        </Text>
        <Pressable
          onPress={() => applyCompass(!compassOn)}
          accessibilityRole="switch"
          accessibilityState={{ checked: compassOn }}
          style={[styles.soundRow, compassOn && styles.soundRowOn]}
        >
          <View style={[styles.soundIcon, compassOn && styles.soundIconOn]}>
            <Ionicons name="compass-outline" size={22} color={compassOn ? st.gold : st.faint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.soundTitle}>{compassOn ? "Bússola e rotação ligadas" : "Bússola e rotação desligadas"}</Text>
            <Text style={styles.sectionCopy}>{compassOn ? "Ativado" : "Desativado"}</Text>
          </View>
          <Switch
            value={compassOn}
            onValueChange={applyCompass}
            trackColor={{ false: st.lineStrong, true: "#2a9d8f" }}
            thumbColor={compassOn ? "#69e1ac" : st.card}
            ios_backgroundColor={st.lineStrong}
          />
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Privacidade GPS</Text>
        <Text style={styles.sectionCopy}>
          Mascara ~{DEFAULT_HOME_RADIUS_M}m em torno da sua casa ao publicar atividades.
        </Text>
        {home ? (
          <Text style={styles.homeMeta}>
            Casa ativa · {home.lat.toFixed(4)}, {home.lng.toFixed(4)} · {home.radiusM}m
          </Text>
        ) : (
          <Text style={styles.homeMeta}>Nenhuma casa definida.</Text>
        )}
        {homeError ? <Text style={styles.homeError}>{homeError}</Text> : null}
        <View style={styles.homeActions}>
          <Pressable
            onPress={() => void defineHomeHere()}
            disabled={homeBusy}
            style={[styles.homeBtn, styles.homeBtnPrimary]}
          >
            {homeBusy ? (
              <ActivityIndicator color="#15100b" />
            ) : (
              <>
                <Ionicons name="home-outline" size={16} color="#15100b" />
                <Text style={styles.homeBtnPrimaryText}>{home ? "Atualizar casa" : "Definir casa aqui"}</Text>
              </>
            )}
          </Pressable>
          {home ? (
            <Pressable onPress={() => void removeHome()} disabled={homeBusy} style={styles.homeBtn}>
              <Text style={styles.homeBtnText}>Remover</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </StudentPage>
  );
}

function createSettingsStyles(st: ReturnType<typeof useSt>["st"]) {
  return StyleSheet.create({
    back: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: 16,
      marginTop: 8,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: st.fill
    },
    backText: { color: st.muted, fontSize: 14, fontWeight: "800" },
    hero: {
      marginHorizontal: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 24,
      padding: 20,
      backgroundColor: st.card,
      flexDirection: "row",
      alignItems: "center",
      gap: 12
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(212,175,55,0.15)"
    },
    kicker: {
      color: st.gold,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.8,
      textTransform: "uppercase"
    },
    heroTitle: { color: st.text, fontSize: 28, fontWeight: "800", marginTop: 2 },
    heroSub: { color: st.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
    card: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      padding: 20,
      gap: 12
    },
    sectionTitle: { color: st.text, fontSize: 18, fontWeight: "800" },
    sectionCopy: { color: st.faint, fontSize: 14, lineHeight: 20 },
    themeRow: { flexDirection: "row", gap: 8 },
    themeOption: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 14,
      backgroundColor: st.fill,
      paddingHorizontal: 16
    },
    themeLightActive: {
      borderColor: "rgba(240,180,90,0.55)",
      backgroundColor: "rgba(240,180,90,0.28)"
    },
    themeDarkActive: {
      borderColor: "rgba(240,180,90,0.5)",
      backgroundColor: "#151a22"
    },
    themeLabel: { color: st.muted, fontSize: 14, fontWeight: "800" },
    themeLightLabel: { color: "#15100b" },
    themeDarkLabel: { color: "#f4ebe0" },
    soundRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 16,
      padding: 16,
      backgroundColor: st.fill
    },
    soundRowOn: {
      borderColor: "rgba(212,175,55,0.4)",
      backgroundColor: "rgba(212,175,55,0.12)"
    },
    soundIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: st.fill
    },
    soundIconOn: { backgroundColor: "rgba(212,175,55,0.2)" },
    soundTitle: { color: st.text, fontSize: 16, fontWeight: "800" },
    homeMeta: { color: st.muted, fontSize: 13, marginTop: 8 },
    homeError: { color: "#e07a5f", fontSize: 13, marginTop: 6, fontWeight: "700" },
    homeActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
    homeBtn: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: st.fill
    },
    homeBtnPrimary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderColor: st.gold,
      backgroundColor: st.gold
    },
    homeBtnText: { color: st.text, fontWeight: "800", fontSize: 13 },
    homeBtnPrimaryText: { color: "#15100b", fontWeight: "800", fontSize: 13 }
  });
}
