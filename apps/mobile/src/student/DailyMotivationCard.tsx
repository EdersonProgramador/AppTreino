import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSt } from "./theme";
import { uiSounds } from "./uiSounds";
import { hasSeenTodayMotivation, markTodayMotivationSeen, motivationForToday } from "./dailyMotivation";

let sessionLock = false;

export function DailyMotivationCard() {
  const { st } = useSt();
  const [open, setOpen] = useState(false);
  const message = motivationForToday();

  useEffect(() => {
    let cancelled = false;
    void hasSeenTodayMotivation().then((seen) => {
      if (!cancelled && !seen && !sessionLock) {
        sessionLock = true;
        setOpen(true);
        uiSounds.popupOpen();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function dismiss() {
    await markTodayMotivationSeen();
    uiSounds.popupClose();
    setOpen(false);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => void dismiss()}>
      <Pressable style={styles.backdrop} onPress={() => void dismiss()}>
        <Pressable style={[styles.card, { backgroundColor: st.panelBg, borderColor: st.line }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.top}>
            <Ionicons name="sparkles" size={18} color={st.gold} />
            <Text style={[styles.kicker, { color: st.goldUi }]}>{message.kicker}</Text>
          </View>
          <Text style={[styles.title, { color: st.text }]}>{message.title}</Text>
          <Text style={[styles.body, { color: st.muted }]}>{message.body}</Text>
          <View style={[styles.anchor, { backgroundColor: st.cardSoft, borderColor: st.line }]}>
            <Text style={[styles.anchorLabel, { color: st.goldUi }]}>Âncora de hoje</Text>
            <Text style={[styles.anchorText, { color: st.text }]}>{message.anchor}</Text>
          </View>
          <Pressable style={[styles.cta, { backgroundColor: st.coral }]} onPress={() => void dismiss()}>
            <Text style={styles.ctaText}>Entendi · bora treinar</Text>
          </Pressable>
          <Text style={[styles.hint, { color: st.faint }]}>Some depois que você vê. Volta amanhã com outra mensagem.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8,9,11,0.72)",
    justifyContent: "center",
    padding: 22
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 12
  },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "800", lineHeight: 28 },
  body: { fontSize: 15, lineHeight: 22 },
  anchor: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  anchorLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  anchorText: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  cta: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { fontSize: 12, textAlign: "center" }
});
