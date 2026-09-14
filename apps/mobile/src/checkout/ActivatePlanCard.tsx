import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cinema } from "../auth/atllyAuthUi";
import {
  formatPlanPriceLines,
  getCheckoutMinimumAmountMessage,
  type CatalogPlan
} from "../lib/plan-catalog";

export function ActivatePlanCard({
  plan,
  monthlyBaseline,
  selected,
  onSelect
}: {
  plan: CatalogPlan;
  monthlyBaseline: CatalogPlan | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const priceLines = formatPlanPriceLines(plan, monthlyBaseline);
  const benefits = plan.cardBenefits.length > 0 ? plan.cardBenefits : ["Acesso completo ao ecossistema ATLLY"];
  const featured = plan.isFeatured || Boolean(plan.badgeLabel);
  const minimumMessage = getCheckoutMinimumAmountMessage(plan);
  const hasPromo = Boolean(priceLines.anchor);

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.card,
        featured && styles.featured,
        selected && styles.selected,
        minimumMessage && styles.belowMinimum,
        hasPromo && styles.hasPromo,
        pressed && styles.pressed
      ]}
    >
      {plan.badgeLabel ? (
        <View style={styles.badgeWrap}>
          <Text style={styles.badge}>{plan.badgeLabel}</Text>
        </View>
      ) : null}

      <View style={styles.head}>
        <Text style={styles.name}>{plan.name}</Text>
        {plan.description ? <Text style={styles.description}>{plan.description.toUpperCase()}</Text> : null}
      </View>

      <View style={styles.priceBlock}>
        {priceLines.anchor ? <Text style={styles.anchor}>{priceLines.anchor}</Text> : null}
        <View style={styles.priceMain}>
          <Text style={[styles.amount, hasPromo && styles.amountPromo]}>{priceLines.primary}</Text>
          <Text style={styles.cycle}>{priceLines.secondary}</Text>
        </View>
        {priceLines.discountLabel ? <Text style={styles.discount}>{priceLines.discountLabel}</Text> : null}
        {minimumMessage ? <Text style={styles.minimum}>{minimumMessage}</Text> : null}
      </View>

      <View style={styles.perks}>
        {benefits.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <Ionicons name="checkmark-circle" size={14} color={cinema.gold} />
            <Text style={styles.perkText}>{perk}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: cinema.line,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }]
  },
  featured: {
    backgroundColor: "rgba(212,175,55,0.06)"
  },
  selected: {
    borderColor: cinema.gold,
    backgroundColor: "rgba(223,102,60,0.1)",
    shadowColor: cinema.gold,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  belowMinimum: {
    borderColor: "#ff9a9a"
  },
  hasPromo: {},
  badgeWrap: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2
  },
  badge: {
    color: cinema.ink,
    backgroundColor: cinema.gold,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden"
  },
  head: { gap: 4, paddingRight: 72 },
  name: { color: cinema.text, fontSize: 17, fontWeight: "900" },
  description: { color: "#7ad4f0", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  priceBlock: { gap: 4 },
  anchor: {
    color: cinema.faint,
    fontSize: 13,
    textDecorationLine: "line-through"
  },
  priceMain: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 6 },
  amount: { color: "#e8c547", fontSize: 22, fontWeight: "900" },
  amountPromo: { color: "#86efac" },
  cycle: { color: cinema.muted, fontSize: 13, fontWeight: "700" },
  discount: {
    alignSelf: "flex-start",
    color: "#86efac",
    backgroundColor: "rgba(134,239,172,0.12)",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  minimum: { color: "#ffb4a8", fontSize: 12, lineHeight: 17 },
  perks: { gap: 8, marginTop: 4 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  perkText: { color: cinema.muted, flex: 1, fontSize: 13, lineHeight: 18 }
});
