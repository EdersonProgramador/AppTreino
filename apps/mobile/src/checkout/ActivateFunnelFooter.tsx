import { Image, StyleSheet, Text, View } from "react-native";
import { cinema } from "../auth/atllyAuthUi";

const TRUST_ITEMS = ["Acesso imediato", "Dados e histórico centralizados", "Diferentes modalidades"] as const;

export function ActivateFunnelFooter() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/payments-trust-badges.png")}
        style={styles.trustImage}
        resizeMode="contain"
        accessibilityLabel="Compra segura, satisfação garantida e privacidade protegida"
      />

      <View style={styles.trustRow}>
        {TRUST_ITEMS.map((item) => (
          <View key={item} style={styles.trustChip}>
            <Text style={styles.trustChipText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.guarantee}>
        <Text style={styles.guaranteeTitle}>Garantia ATLLY · 7 dias</Text>
        <Text style={styles.guaranteeCopy}>
          Experimente na sua rotina. Se não fizer sentido para você, devolvemos conforme nossa política de garantia.
        </Text>
      </View>

      <View style={styles.aiNote}>
        <Text style={styles.aiIcon}>✦</Text>
        <Text style={styles.aiText}>
          Inclui <Text style={styles.aiStrong}>ATLLY AI Coach</Text> — treinos, dieta e orientação personalizada pelo seu biotipo.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, marginTop: 4 },
  trustImage: {
    width: "100%",
    height: 52,
    opacity: 0.92
  },
  trustRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  trustChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
    backgroundColor: "rgba(212,175,55,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  trustChipText: {
    color: cinema.gold,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase"
  },
  guarantee: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.28)",
    backgroundColor: "rgba(212,175,55,0.06)",
    padding: 14,
    gap: 6
  },
  guaranteeTitle: {
    color: cinema.gold,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4
  },
  guaranteeCopy: {
    color: cinema.muted,
    fontSize: 13,
    lineHeight: 19
  },
  aiNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 2
  },
  aiIcon: {
    color: cinema.gold,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1
  },
  aiText: {
    color: cinema.faint,
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  },
  aiStrong: {
    color: cinema.muted,
    fontWeight: "800"
  }
});
