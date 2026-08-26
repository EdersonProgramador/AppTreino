import { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompositeNavigationProp, useNavigation, useNavigationState } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiPost } from "../auth/api";
import { brand } from "./brand";
import { mediaUrl } from "../lib/media";
import type { MenuStackParamList, StudentTabParamList } from "../navigation/types";
import { formatDateTime } from "../theme";
import { useStudent } from "./StudentContext";
import { feedChrome, requestFeedCreate, requestFeedSearch } from "./feedChrome";
import { RunnerIcon } from "./RunnerIcon";
import { moduleOn, studentCodeFromName, useSt, type StudentTokens } from "./theme";
import { navigateStudentTarget } from "./navigate";
import { uiSounds } from "./uiSounds";

function feedStackScreenName(state: {
  index: number;
  routes: Array<{ name: string; state?: { index: number; routes: Array<{ name: string }> } }>;
} | undefined): string | null {
  if (!state) return null;
  const tab = state.routes[state.index];
  if (!tab || tab.name !== "FeedTab") return null;
  const stack = tab.state;
  if (!stack?.routes?.length) return "Feed";
  return stack.routes[stack.index]?.name ?? "Feed";
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

type ChromeNav = CompositeNavigationProp<
  NativeStackNavigationProp<MenuStackParamList>,
  BottomTabNavigationProp<StudentTabParamList>
>;

const TARGET_LABELS: Record<string, string> = {
  payments: "Pagamentos",
  membership: "Matrículas",
  status: "Frequência",
  locations: "Localidades",
  support: "Atendimento",
  ratings: "Favoritos e avaliações",
  training: "Treino",
  assessments: "Avaliação física",
  products: "Vitrine",
  purchases: "Minhas compras",
  events: "Eventos",
  play: "Play",
  feed: "Feed",
  club: "Desafios",
  activity: "Corrida",
  profile: "Perfil",
  cart: "Carrinho"
};

export function StudentChrome({ play = false }: { play?: boolean }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ChromeNav>();
  const { st } = useSt();
  const styles = useMemo(() => createChromeStyles(st), [st]);
  const { profile, cart, notifications, publicConfig, streak, session, refresh, requestQr, logout } = useStudent();
  const [notesOpen, setNotesOpen] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const code = studentCodeFromName(profile?.name);
  const unread = notifications.filter((item) => !item.readAt).length;
  const showCart = moduleOn(publicConfig, "module_products") && (cart?.itemCount ?? 0) > 0;
  const streakDates = useStudent().streakDates;
  const onFeedTab = useNavigationState((state) => {
    const route = state?.routes[state.index];
    return route?.name === "FeedTab";
  });
  const feedScreen = useNavigationState((state) => feedStackScreenName(state as Parameters<typeof feedStackScreenName>[0]));
  const onFeedRoot = onFeedTab && (feedScreen === "Feed" || !feedScreen);

  function goFeedThen(open: "create" | "search") {
    setNotesOpen(false);
    setSocialMenuOpen(false);
    if (onFeedRoot) {
      if (open === "create") feedChrome()?.toggleCreate();
      else requestFeedSearch();
      return;
    }
    navigation.navigate("FeedTab", { screen: "Feed" });
    if (open === "create") requestFeedCreate();
    else requestFeedSearch();
  }

  const monthPrefix = `${month.year}-${String(month.month).padStart(2, "0")}-`;
  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const startWeekday = new Date(month.year, month.month - 1, 1).getDay();
  const completed = useMemo(
    () => new Set(streakDates.filter((date) => date.startsWith(monthPrefix))),
    [monthPrefix, streakDates]
  );

  function openTarget(target?: string | null) {
    setNotesOpen(false);
    navigateStudentTarget(navigation, target);
  }

  async function markRead(id: string) {
    try {
      await apiPost("/user/notifications/read", { ids: [id] }, session.token);
      await refresh();
    } catch {
      // ignore
    }
  }

  return (
    <>
      <LinearGradient
        colors={[st.headerFrom, st.headerTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerWrap, { paddingTop: insets.top + 10 }, play && styles.headerPlay]}
      >
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => navigation.navigate("TrainingTab", { screen: "Training" })}
            style={styles.brandMark}
            accessibilityLabel={brand.name}
          >
            <Text style={styles.brandMarkText}>TS</Text>
          </Pressable>
          <Pressable
            style={styles.identity}
            onPress={() => navigation.navigate("TrainingTab", { screen: "Training" })}
            accessibilityLabel={brand.name}
          >
            <Text style={styles.brandName} numberOfLines={1}>
              {brand.name}
            </Text>
            <Text style={styles.code} numberOfLines={1}>
              {profile?.name ?? brand.athlete} · {brand.codeLabel} {code}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            {onFeedTab ? (
              <>
                <Pressable
                  onPress={() => {
                    uiSounds.popupOpen();
                    goFeedThen("create");
                  }}
                  style={styles.iconBtn}
                  accessibilityLabel="Criar"
                >
                  <Ionicons name="add-circle-outline" size={22} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    uiSounds.popupOpen();
                    goFeedThen("search");
                  }}
                  style={styles.iconBtn}
                  accessibilityLabel="Pesquisar no Feed"
                >
                  <Ionicons name="search-outline" size={20} color="#fff" />
                </Pressable>
              </>
            ) : null}
            <Pressable
              onPress={() => {
                uiSounds.popupOpen();
                setStreakOpen(true);
              }}
              style={styles.streak}
              accessibilityLabel={`Ofensiva de ${streak} dias`}
            >
              <Ionicons name="flame" size={16} color={st.gold} />
              <Text style={styles.streakLabel}>Ofensiva</Text>
              <LinearGradient colors={["#f2b461", "#df663c"]} style={styles.streakCount}>
                <Text style={styles.streakCountText}>{streak}</Text>
              </LinearGradient>
            </Pressable>
            {showCart ? (
              <Pressable
                onPress={() => {
                  uiSounds.itemSelect();
                  navigation.navigate("ShopTab", { screen: "Cart" } as never);
                }}
                style={styles.iconBtn}
                accessibilityLabel={`Carrinho com ${cart!.itemCount} ${cart!.itemCount === 1 ? "item" : "itens"}`}
              >
                <Ionicons name="cart-outline" size={22} color="#fff" />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{cart!.itemCount > 99 ? "99+" : cart!.itemCount}</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                setNotesOpen((open) => {
                  if (open) uiSounds.popupClose();
                  else {
                    uiSounds.popupOpen();
                    uiSounds.popupNotify();
                    void apiPost("/user/notifications/read", { all: true }, session.token).then(() => refresh());
                  }
                  return !open;
                })
              }
              style={styles.iconBtn}
              accessibilityLabel="Notificações"
            >
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => {
                if (onFeedTab) {
                  setNotesOpen(false);
                  uiSounds.popupOpen();
                  setSocialMenuOpen(true);
                  return;
                }
                navigation.navigate("MenuTab", { screen: "Profile" });
              }}
              style={styles.avatar}
              accessibilityLabel={onFeedTab ? "Menu social" : "Abrir perfil"}
            >
              {profile?.avatarUrl ? (
                <Image source={{ uri: mediaUrl(profile.avatarUrl) }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person-circle-outline" size={28} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <Modal
        visible={socialMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          uiSounds.popupClose();
          setSocialMenuOpen(false);
        }}
      >
        <Pressable
          style={styles.socialMenuBg}
          onPress={() => {
            uiSounds.popupClose();
            setSocialMenuOpen(false);
          }}
        >
          <Pressable style={[styles.socialMenu, { marginTop: insets.top + 58 }]} onPress={() => undefined}>
            {(
              [
                { label: "Feed", icon: "home-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Feed" }) },
                { label: "Treino", icon: "barbell-outline" as const, action: () => navigation.navigate("TrainingTab", { screen: "Training" }) },
                { label: "Corrida", runner: true as const, action: () => navigation.navigate("ActivityTab", { screen: "Activity" }) },
                { label: "Desafios", icon: "trophy-outline" as const, action: () => navigation.navigate("ClubTab", { screen: "Club" }) },
                { label: "Menu completo", icon: "menu-outline" as const, action: () => navigation.navigate("MenuTab", { screen: "Menu" }) },
                { label: "Meu Perfil", icon: "person-outline" as const, action: () => navigation.navigate("MenuTab", { screen: "Profile" }) },
                { label: "Clipes", icon: "film-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Reels" }) },
                { label: "Ao vivo", icon: "radio-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Live" }) },
                { label: "Mensagens", icon: "chatbubble-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Messages" }) },
                { label: "Chat global", icon: "chatbubbles-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Chat" }) },
                { label: "Pedidos", icon: "person-add-outline" as const, action: () => navigation.navigate("FeedTab", { screen: "Requests" }) }
              ] as const
            ).map((item) => (
              <Pressable
                key={item.label}
                style={styles.socialMenuItem}
                onPress={() => {
                  setSocialMenuOpen(false);
                  uiSounds.itemSelect();
                  item.action();
                }}
              >
                {"runner" in item ? (
                  <RunnerIcon size={18} color={st.text} gender={profile?.gender} />
                ) : (
                  <Ionicons name={item.icon} size={18} color={st.text} />
                )}
                <Text style={styles.socialMenuText}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.socialMenuItem, styles.socialMenuDanger]}
              onPress={() => {
                setSocialMenuOpen(false);
                uiSounds.toggleOff();
                logout();
              }}
            >
              <Ionicons name="log-out-outline" size={18} color="#c0392b" />
              <Text style={[styles.socialMenuText, { color: "#c0392b" }]}>Sair</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {notesOpen ? (
        <View style={styles.notesPanel}>
          <View style={styles.notesHead}>
            <View>
              <Text style={styles.notesTitle}>Notificações</Text>
              <Text style={styles.notesCount}>{notifications.length}</Text>
            </View>
            <Pressable onPress={() => {
              uiSounds.popupClose();
              setNotesOpen(false);
            }} style={styles.closeBtn} accessibilityLabel="Fechar notificações">
              <Ionicons name="close" size={18} color={st.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.notesList} nestedScrollEnabled>
            {notifications.length > 0 ? (
              notifications.map((item) => {
                const target = item.targetSection ?? (item.type === "PRODUCT" ? "products" : item.type === "WORKOUT_PROGRAM" || item.type === "WORKOUT" ? "training" : item.type === "ACHIEVEMENT" ? "profile" : item.type === "LOCATION" ? "locations" : item.type === "SUPPORT" ? "support" : item.type === "EVENT" ? "events" : item.type === "MUSIC_ALBUM" || item.type === "MUSIC_TRACK" ? "play" : null);
                const openLabel = target ? TARGET_LABELS[target] : null;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.noteCard, !item.readAt && styles.noteUnread]}
                    onPress={() => {
                      void markRead(item.id);
                      openTarget(target);
                    }}
                  >
                    <Text style={styles.noteTitle}>{item.title}</Text>
                    <Text style={styles.noteMsg}>{item.message}</Text>
                    <Text style={styles.noteTime}>{formatDateTime(item.publishedAt)}</Text>
                    {openLabel ? <Text style={styles.noteOpen}>Abrir {openLabel}</Text> : null}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>Nenhuma publicação</Text>
                <Text style={styles.noteMsg}>
                  Novidades publicadas pelo admin e sincronizações entre módulos aparecerão aqui.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}

      <Modal visible={streakOpen} transparent animationType="fade" onRequestClose={() => {
        uiSounds.popupClose();
        setStreakOpen(false);
      }}>
        <Pressable style={styles.modalBg} onPress={() => {
          uiSounds.popupClose();
          setStreakOpen(false);
        }}>
          <Pressable style={styles.modal} onPress={() => undefined}>
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalYear}>Ano atual: {new Date().getFullYear()}</Text>
                <Text style={styles.modalStreak}>{streak} dia(s)</Text>
                <Text style={styles.modalSub}>consecutivo(s)</Text>
              </View>
              <Pressable onPress={() => {
                uiSounds.popupClose();
                setStreakOpen(false);
              }} style={styles.closeBtn} accessibilityLabel="Fechar calendário">
                <Ionicons name="close" size={18} color={st.coral} />
              </Pressable>
            </View>
            <View style={styles.calHead}>
              <Pressable
                onPress={() =>
                  setMonth((current) =>
                    current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 }
                  )
                }
                style={styles.calArrow}
              >
                <Ionicons name="chevron-back" size={18} color={st.gold} />
              </Pressable>
              <Text style={styles.calMonth}>
                {MONTHS[month.month - 1]} {month.year}
              </Text>
              <Pressable
                onPress={() =>
                  setMonth((current) =>
                    current.month === 12 ? { year: current.year + 1, month: 1 } : { year: current.year, month: current.month + 1 }
                  )
                }
                style={styles.calArrow}
              >
                <Ionicons name="chevron-forward" size={18} color={st.gold} />
              </Pressable>
            </View>
            <View style={styles.calGrid}>
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.calDow}>
                  {day}
                </Text>
              ))}
              {Array.from({ length: startWeekday }).map((_, index) => (
                <View key={`empty-${index}`} style={styles.calCell} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const key = `${monthPrefix}${String(day).padStart(2, "0")}`;
                const done = completed.has(key);
                return (
                  <View key={key} style={[styles.calCell, done && styles.calDone]}>
                    <Text style={[styles.calDay, done && styles.calDayDone]}>{day}</Text>
                  </View>
                );
              })}
            </View>
            <Pressable
              onPress={() => {
                setStreakOpen(false);
                requestQr();
                navigation.navigate("TrainingTab", { screen: "Training" });
              }}
              style={styles.qrLink}
            >
              <Ionicons name="qr-code-outline" size={16} color={st.goldUi} />
              <Text style={styles.qrLinkText}>QR de check-in</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createChromeStyles(st: StudentTokens) {
  return StyleSheet.create({
  headerWrap: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42
  },
  headerPlay: { opacity: 1 },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#c4783a"
  },
  brandMarkText: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242,180,97,0.16)"
  },
  avatarImg: { width: "100%", height: "100%" },
  identity: { flex: 1, minWidth: 0 },
  brandName: { color: "#fff", fontSize: 15, fontWeight: "800" },
  code: { color: "rgba(255,255,255,0.88)", fontSize: 11, marginTop: 2, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    borderWidth: 1,
    borderColor: "rgba(242,180,97,0.34)",
    borderRadius: 999,
    paddingHorizontal: 9,
    backgroundColor: "rgba(242,180,97,0.14)"
  },
  streakLabel: { color: "#fff", fontSize: 11, fontWeight: "800" },
  streakCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  streakCountText: { color: "#15100b", fontSize: 12, fontWeight: "800" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)"
  },
  socialMenuBg: {
    flex: 1,
    backgroundColor: "rgba(8,9,11,0.35)",
    alignItems: "flex-end",
    paddingHorizontal: 12
  },
  socialMenu: {
    width: 240,
    maxHeight: "70%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: st.line,
    backgroundColor: st.panelBg,
    paddingVertical: 8,
    overflow: "hidden"
  },
  socialMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14
  },
  socialMenuText: { color: st.text, fontSize: 14, fontWeight: "700" },
  socialMenuDanger: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: st.line
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1f7a52",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  notesPanel: {
    marginHorizontal: 12,
    marginTop: -8,
    zIndex: 40,
    maxHeight: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: st.line,
    backgroundColor: st.panelBg,
    overflow: "hidden",
    shadowColor: "#2d2418",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8
  },
  notesHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: st.line
  },
  notesTitle: { color: st.text, fontWeight: "800", fontSize: 16 },
  notesCount: {
    alignSelf: "flex-start",
    marginTop: 4,
    color: "#a86a10",
    backgroundColor: "rgba(240,180,90,0.16)",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: "800"
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(223,102,60,0.55)",
    alignItems: "center",
    justifyContent: "center"
  },
  notesList: { maxHeight: 280, padding: 10 },
  noteCard: {
    borderRadius: 12,
    backgroundColor: st.fill,
    padding: 12,
    gap: 4,
    marginBottom: 8
  },
  noteUnread: { borderWidth: 1, borderColor: "rgba(242,180,97,0.35)" },
  noteTitle: { color: st.text, fontWeight: "800" },
  noteMsg: { color: st.muted, fontSize: 13, lineHeight: 18 },
  noteTime: { color: st.faint, fontSize: 11 },
  noteOpen: { color: st.text, fontWeight: "800", marginTop: 4, fontSize: 13 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingTop: 48,
    paddingHorizontal: 12
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(242,180,97,0.28)",
    backgroundColor: st.bgSoft,
    overflow: "hidden"
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: st.line
  },
  modalYear: { color: st.goldUi, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  modalStreak: { color: st.text, fontSize: 22, fontWeight: "800" },
  modalSub: { color: st.muted, fontSize: 12 },
  calHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12
  },
  calArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(242,180,97,0.24)",
    backgroundColor: "rgba(242,180,97,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  calMonth: { color: st.text, fontWeight: "800", textTransform: "capitalize" },
  calGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingBottom: 12 },
  calDow: { width: "14.28%", textAlign: "center", color: st.goldUi, fontSize: 11, fontWeight: "800", marginBottom: 6 },
  calCell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calDone: { backgroundColor: "rgba(242,180,97,0.22)", borderRadius: 999 },
  calDay: { color: st.text, fontWeight: "700", fontSize: 12 },
  calDayDone: { color: "#15100b" },
  qrLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 14
  },
  qrLinkText: { color: st.goldUi, fontWeight: "800" }
  });
}
