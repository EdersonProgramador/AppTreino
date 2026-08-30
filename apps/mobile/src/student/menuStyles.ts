import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { lightSt, useSt, type StudentTokens } from "./theme";

export function createMenuStyles(st: StudentTokens) {
  return StyleSheet.create({
    menuList: { margin: 16, gap: 12 },
    menuItem: {
      minHeight: 78,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 14,
      padding: 16,
      backgroundColor: st.cardSoft
    },
    menuTitle: { flex: 1, color: st.text, fontSize: 16, fontWeight: "800" },
    card: {
      marginHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      padding: 16,
      gap: 6
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    title: { color: st.text, fontSize: 16, fontWeight: "800" },
    muted: { color: st.muted, fontSize: 14, lineHeight: 20 },
    faint: { color: st.faint, fontSize: 12 },
    gold: { color: st.goldUi, fontWeight: "800" },
    badge: {
      alignSelf: "flex-start",
      overflow: "hidden",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: "rgba(196,138,40,0.14)",
      color: st.goldUi,
      fontSize: 12,
      fontWeight: "800"
    },
    metricGrid: {
      marginHorizontal: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10
    },
    metric: {
      width: "47%",
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      padding: 14,
      gap: 4
    },
    metricValue: { color: st.text, fontSize: 22, fontWeight: "800" },
    metricLabel: { color: st.muted, fontSize: 12, fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 12,
      padding: 12,
      color: st.text,
      backgroundColor: st.inputBg
    },
    field: { gap: 6 },
    label: { color: st.goldUi, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
    pad: { paddingHorizontal: 16, gap: 10 },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: st.avatarBg },
    thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: st.avatarBg },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
    calendarCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    calendarDay: { color: st.text, fontSize: 13, fontWeight: "700" },
    calendarDone: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: st.coral
    },
    calendarToday: { borderWidth: 1.5, borderColor: st.gold, borderRadius: 14 },
    starRow: { flexDirection: "row", gap: 4 },
    chatMe: { alignSelf: "flex-end", backgroundColor: "rgba(212,175,55,0.16)", maxWidth: "86%" },
    chatThem: { alignSelf: "flex-start", backgroundColor: st.chatThem, maxWidth: "86%" }
  });
}

export function useMenuStyles() {
  const { st } = useSt();
  return useMemo(() => createMenuStyles(st), [st]);
}

export const menuStyles = createMenuStyles(lightSt);
