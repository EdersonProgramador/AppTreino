import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { AtllyGhostLink, AtllyPrimaryButton, AtllySecondaryButton, cinema } from "../auth/atllyAuthUi";
import type { NativeSession } from "../auth/types";
import {
  appleIapConfigured,
  loadAppleStoreProduct,
  purchaseAppleSubscription,
  resolveAppleProductId,
  restoreApplePurchases
} from "../lib/apple-iap";
import type { CatalogPlan } from "../lib/plan-catalog";
import { uiSounds } from "../student/uiSounds";

export function AppleIapPanel({
  session,
  selectedPlan,
  onSuccess,
  onError
}: {
  session: NativeSession;
  selectedPlan: CatalogPlan;
  onSuccess: () => void | Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [storePrice, setStorePrice] = useState<string | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const productId = resolveAppleProductId(selectedPlan);

  useEffect(() => {
    let cancelled = false;
    setLoadingPrice(true);
    void loadAppleStoreProduct(productId)
      .then((product) => {
        if (cancelled) return;
        setStorePrice(product?.priceString ?? null);
      })
      .catch(() => {
        if (!cancelled) setStorePrice(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function subscribe() {
    if (!appleIapConfigured()) {
      onError("Assinatura via App Store não configurada neste build.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await purchaseAppleSubscription({
        token: session.token,
        userId: session.user.id,
        planCode: selectedPlan.code,
        productId
      });
      uiSounds.paymentApproved();
      await onSuccess();
    } catch (caught) {
      uiSounds.error();
      const message = caught instanceof Error ? caught.message : "Não foi possível concluir a assinatura.";
      if (!/cancel/i.test(message)) onError(message);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    onError(null);
    try {
      const result = await restoreApplePurchases(session.token);
      if (result.restored) {
        uiSounds.paymentApproved();
        await onSuccess();
      } else {
        onError("Nenhuma assinatura Apple ativa encontrada nesta conta.");
      }
    } catch (caught) {
      uiSounds.error();
      onError(caught instanceof Error ? caught.message : "Não foi possível restaurar compras.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Assinatura via App Store</Text>
      <Text style={styles.copy}>
        Pagamento seguro processado pela Apple. Sua assinatura renova automaticamente até você cancelar nas
        configurações da App Store.
      </Text>
      <Text style={styles.planLine}>
        {selectedPlan.name}
        {loadingPrice ? " · …" : storePrice ? ` · ${storePrice}` : ""}
      </Text>
      {!appleIapConfigured() ? (
        <Text style={styles.warn}>
          Configure EXPO_PUBLIC_REVENUECAT_IOS_API_KEY e os produtos no App Store Connect antes de publicar.
        </Text>
      ) : null}
      {loadingPrice ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={cinema.gold} />
          <Text style={styles.hint}>Consultando preço na App Store…</Text>
        </View>
      ) : null}
      <AtllyPrimaryButton
        label={busy ? "Processando…" : "Assinar com Apple"}
        loading={busy}
        disabled={busy || !appleIapConfigured()}
        onPress={() => void subscribe()}
        style={styles.cta}
      />
      <AtllySecondaryButton label="Restaurar compras" disabled={busy} onPress={() => void restore()} />
      <AtllyGhostLink
        label="Gerenciar assinatura na App Store"
        onPress={() => {
          uiSounds.info();
          void Linking.openURL("https://apps.apple.com/account/subscriptions");
        }}
      />
      <Text style={styles.legal}>
        Ao assinar, você concorda com a renovação automática. Cancele a qualquer momento em Ajustes → Apple ID →
        Assinaturas.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { color: cinema.text, fontSize: 18, fontWeight: "800" },
  copy: { color: cinema.muted, fontSize: 14, lineHeight: 20 },
  planLine: { color: cinema.gold, fontSize: 15, fontWeight: "800" },
  warn: { color: "#e07a5f", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  hint: { color: cinema.faint, fontSize: 13 },
  legal: { color: cinema.faint, fontSize: 12, lineHeight: 17, marginTop: 4 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cta: { marginTop: 4 }
});
