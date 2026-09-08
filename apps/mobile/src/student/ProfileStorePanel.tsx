import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet } from "../auth/api";
import type { MenuStackParamList, StudentTabParamList } from "../navigation/types";
import {
  formatPriceInBRL,
  mergeStoreHistory,
  storeHistoryPendingCount,
  storeHistoryStatusLabel
} from "./store-commerce";
import { moduleOn, useSt } from "./theme";
import { useStudent } from "./StudentContext";
import type { OrderRow, PurchaseRow } from "../types";

type StoreSummaryResponse = {
  cartItemCount: number;
  orderCount: number;
  purchaseCount: number;
  pendingCount: number;
  orders: OrderRow[];
  purchases: PurchaseRow[];
};

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<MenuStackParamList, "Profile">,
  BottomTabNavigationProp<StudentTabParamList>
>;

export function ProfileStorePanel() {
  const { session, publicConfig } = useStudent();
  const navigation = useNavigation<Nav>();
  const { st } = useSt();
  const enabled = moduleOn(publicConfig, "module_products");
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          marginHorizontal: 16,
          marginBottom: 12,
          padding: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: st.line,
          backgroundColor: st.card,
          gap: 10
        },
        head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
        kicker: { color: st.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
        title: { color: st.text, fontSize: 18, fontWeight: "800", marginTop: 2 },
        link: { color: st.coral, fontWeight: "800", fontSize: 12 },
        stats: { flexDirection: "row", gap: 10 },
        stat: {
          flex: 1,
          borderWidth: 1,
          borderColor: st.line,
          borderRadius: 12,
          padding: 10,
          alignItems: "center",
          gap: 4
        },
        statValue: { color: st.text, fontWeight: "900", fontSize: 20 },
        statLabel: { color: st.muted, fontSize: 11, textAlign: "center" },
        item: {
          borderWidth: 1,
          borderColor: st.line,
          borderRadius: 12,
          padding: 10,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8
        },
        itemTitle: { color: st.text, fontWeight: "700", flex: 1 },
        itemMeta: { color: st.muted, fontSize: 11 },
        badge: {
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: st.fill
        },
        badgeText: { color: st.text, fontSize: 10, fontWeight: "800" },
        empty: { color: st.muted, fontSize: 13, lineHeight: 18 }
      }),
    [st]
  );
  const [summary, setSummary] = useState<StoreSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSummary(await apiGet<StoreSummaryResponse>("/student/store/summary", session.token));
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) return null;

  const history = mergeStoreHistory(summary?.orders ?? [], summary?.purchases ?? []).slice(0, 3);
  const totalCount = (summary?.orderCount ?? 0) + (summary?.purchaseCount ?? 0);
  const pendingCount = summary?.pendingCount ?? storeHistoryPendingCount(history);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View>
          <Text style={styles.kicker}>Vitrine</Text>
          <Text style={styles.title}>Minhas compras ({loading ? "…" : totalCount})</Text>
        </View>
        <Pressable onPress={() => navigation.navigate("ShopTab", { screen: "Products" })}>
          <Text style={styles.link}>Abrir vitrine</Text>
        </Pressable>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Ionicons name="bag-outline" size={18} color={st.gold} />
          <Text style={styles.statValue}>{loading ? "…" : summary?.cartItemCount ?? 0}</Text>
          <Text style={styles.statLabel}>No carrinho</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={18} color={st.gold} />
          <Text style={styles.statValue}>{loading ? "…" : pendingCount}</Text>
          <Text style={styles.statLabel}>Pagamento pendente</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator color={st.gold} /> : null}
      {!loading && history.length === 0 ? (
        <Text style={styles.empty}>Nenhuma compra ainda. Explore a vitrine da academia.</Text>
      ) : (
        history.map((entry) => (
          <Pressable
            key={`${entry.kind}-${entry.id}`}
            style={styles.item}
            onPress={() => navigation.navigate("ShopTab", { screen: "Orders" })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {entry.title}
              </Text>
              <Text style={styles.itemMeta}>
                {formatPriceInBRL(entry.amountInCents)} · {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{storeHistoryStatusLabel(entry)}</Text>
            </View>
          </Pressable>
        ))
      )}
      <Pressable onPress={() => navigation.navigate("ShopTab", { screen: "Orders" })}>
        <Text style={styles.link}>Ver histórico completo na vitrine</Text>
      </Pressable>
    </View>
  );
}
