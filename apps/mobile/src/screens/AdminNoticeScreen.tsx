import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_URL } from "../config";
import { useSt } from "../student/theme";
import type { NativeSession } from "../auth/types";

/**
 * O app é nativo e cobre o aluno. A administração continua no painel web,
 * que é feito para telas grandes — aqui só apontamos o caminho.
 */
export function AdminNoticeScreen({ session, onLogout }: { session: NativeSession; onLogout: () => void }) {
  const { st } = useSt();
  const insets = useSafeAreaInsets();
  const panelUrl = WEB_URL.replace(/\/$/, "");

  return (
    <View style={[styles.root, { backgroundColor: st.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.card, { backgroundColor: st.panelBg, borderColor: st.line }]}>
        <Ionicons name="desktop-outline" size={44} color={st.goldUi} />
        <Text style={[styles.title, { color: st.text }]}>Painel administrativo</Text>
        <Text style={[styles.body, { color: st.muted }]}>
          Olá, {session.user.name || "admin"}. A administração é feita pelo painel web, no computador. O app é o
          ambiente do aluno.
        </Text>
        <Text style={[styles.url, { color: st.muted, borderColor: st.line }]}>{panelUrl}</Text>

        <Pressable
          style={[styles.primary, { backgroundColor: st.goldUi }]}
          onPress={() => void Linking.openURL(panelUrl)}
        >
          <Ionicons name="open-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Abrir no navegador</Text>
        </Pressable>

        <Pressable style={[styles.secondary, { borderColor: st.line }]} onPress={onLogout}>
          <Text style={[styles.secondaryText, { color: st.text }]}>Sair desta conta</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 14,
    padding: 26,
    borderRadius: 22,
    borderWidth: 1
  },
  title: { fontSize: 20, fontWeight: "800" },
  body: { textAlign: "center", lineHeight: 22, fontWeight: "600" },
  url: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden"
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 4
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  secondary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, borderWidth: 1 },
  secondaryText: { fontWeight: "800" }
});
