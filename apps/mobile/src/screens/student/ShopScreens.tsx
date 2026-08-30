import { useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiPost, apiPut, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import type { ShopStackParamList } from "../../navigation/types";
import { labelOrderStatus, labelProductKind, labelShippingMethod } from "../../student/commerce";
import {
  BackChip,
  EmptyState,
  GreenButton,
  OutlineButton,
  SheetHeading,
  StudentPage
} from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import { money } from "../../theme";

function useShopStyles() {
  const { st } = useSt();
  return useMemo(() => createShopStyles(st), [st]);
}

export function ProductsScreen() {
  const { products, session, refresh } = useStudent();
  const { st } = useSt();
  const styles = useShopStyles();
  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function addToCart(productId: string) {
    setBusyId(productId);
    try {
      await apiPost("/student/cart/items", { productId, quantity: 1 }, session.token);
      await refresh();
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Carrinho", caught instanceof NativeApiError ? caught.message : "Não foi possível adicionar.");
      uiSounds.error();
    } finally {
      setBusyId(null);
    }
  }

  async function buyNow(productId: string) {
    setBusyId(productId);
    try {
      const response = await apiPost<{ purchase: { paymentUrl?: string | null } }>("/student/purchases", { productId }, session.token);
      await refresh();
      setConfirmId(productId);
      uiSounds.paymentApproved();
      if (response.purchase.paymentUrl) {
        await Linking.openURL(response.purchase.paymentUrl);
      }
      setTimeout(() => setConfirmId(null), 2500);
    } catch (caught) {
      Alert.alert("Compra", caught instanceof NativeApiError ? caught.message : "Não foi possível registrar o pedido.");
      uiSounds.error();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <StudentPage>
      <SheetHeading
        kicker="Loja da academia"
        title="Vitrine online"
        subtitle={`${products.length} produto(s) · peça e retire na unidade ou receba o digital após confirmação`}
      />
      <View style={{ paddingHorizontal: 16 }}>
        <OutlineButton label="Abrir carrinho" icon="cart-outline" onPress={() => navigation.navigate("Cart")} />
      </View>
      {confirmId ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color={st.coral} />
          <Text style={styles.toastText}>Pedido criado — abrindo pagamento…</Text>
        </View>
      ) : null}
      {products.length === 0 ? (
        <EmptyState icon="cube-outline" title="Nenhum produto na vitrine" text="Quando a academia publicar itens, eles aparecerão aqui." />
      ) : (
        <View style={styles.grid}>
          {products.map((product) => (
            <View key={product.id} style={styles.card}>
              {product.imageUrl ? (
                <Image source={{ uri: mediaUrl(product.imageUrl) }} style={styles.media} />
              ) : (
                <View style={[styles.media, styles.fallback]}>
                  <Ionicons name="cube-outline" size={30} color={st.gold} />
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.kind}>
                  {product.category ? `${product.category} · ` : ""}
                  {labelProductKind(product.kind)}
                  {` · ${labelShippingMethod(product.shippingMethod ?? (product.kind === "DIGITAL" ? "DIGITAL" : "PICKUP"))}`}
                </Text>
                <Text style={styles.name}>{product.name}</Text>
                {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
                <Text style={styles.price}>{money(product.priceInCents)}</Text>
                <GreenButton
                  label={busyId === product.id ? "Adicionando…" : "Adicionar ao carrinho"}
                  disabled={Boolean(product.outOfStock) || busyId === product.id}
                  loading={busyId === product.id}
                  onPress={() => void addToCart(product.id)}
                />
                <GreenButton
                  label={
                    product.outOfStock
                      ? "Sem estoque"
                      : product.purchasedByMe
                        ? product.kind === "DIGITAL"
                          ? "Já adquirido"
                          : "Pedido em andamento"
                        : busyId === product.id
                          ? "Abrindo pagamento…"
                          : "Comprar agora"
                  }
                  disabled={Boolean(product.purchasedByMe) || Boolean(product.outOfStock) || busyId === product.id}
                  onPress={() => void buyNow(product.id)}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </StudentPage>
  );
}

export function CartScreen() {
  const { cart, session, refresh } = useStudent();
  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();
  const { st } = useSt();
  const styles = useShopStyles();
  const [busy, setBusy] = useState(false);
  const [qtyBusy, setQtyBusy] = useState<string | null>(null);
  const [coupon, setCoupon] = useState(cart?.couponCode ?? "");
  const [address, setAddress] = useState("");
  const shipping = cart?.shippingMethod ?? "PICKUP";

  const shippingHint = useMemo(() => labelShippingMethod(shipping), [shipping]);

  async function setQty(productId: string, quantity: number) {
    setQtyBusy(productId);
    try {
      await apiPut(`/student/cart/items/${productId}`, { quantity }, session.token);
      await refresh();
      uiSounds.itemSelect();
    } catch (caught) {
      Alert.alert("Carrinho", caught instanceof NativeApiError ? caught.message : "Não foi possível atualizar.");
    } finally {
      setQtyBusy(null);
    }
  }

  async function applyCoupon() {
    try {
      await apiPut("/student/cart/coupon", { code: coupon.trim() || null }, session.token);
      await refresh();
      Alert.alert("Cupom", coupon.trim() ? "Cupom aplicado." : "Cupom removido.");
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Cupom", caught instanceof NativeApiError ? caught.message : "Cupom inválido.");
      uiSounds.error();
    }
  }

  async function checkout() {
    setBusy(true);
    try {
      const response = await apiPost<{ order?: { paymentUrl?: string | null }; paymentUrl?: string | null }>(
        "/student/cart/checkout",
        { shippingAddress: address, billingType: "UNDEFINED" },
        session.token
      );
      await refresh();
      const url = response.paymentUrl ?? response.order?.paymentUrl;
      uiSounds.paymentApproved();
      if (url) await Linking.openURL(url);
      else Alert.alert("Pedido criado", "Aguardando confirmação de pagamento.");
      navigation.navigate("Orders");
    } catch (caught) {
      Alert.alert("Checkout", caught instanceof NativeApiError ? caught.message : "Não foi possível finalizar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentPage>
      <BackChip label="Vitrine" onPress={() => navigation.navigate("Products")} />
      <SheetHeading
        kicker="Loja"
        title="Carrinho"
        subtitle={
          (cart?.itemCount ?? 0) > 0
            ? `${cart!.itemCount} item(ns) salvos · finalize quando quiser`
            : "Seus itens ficam salvos enquanto você navega"
        }
      />
      {!cart || cart.itemCount === 0 ? (
        <EmptyState icon="cart-outline" title="Carrinho vazio" text="Adicione produtos na vitrine para finalizar depois." />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {cart.items.map((item) => {
            const stockLimit = item.product.stock;
            const atLimit = stockLimit != null && item.quantity >= stockLimit;
            return (
              <View key={item.productId} style={styles.info}>
                {item.product.imageUrl ? (
                  <Image source={{ uri: mediaUrl(item.product.imageUrl) }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.fallback]}>
                    <Ionicons name="cube-outline" size={22} color={st.gold} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.name}>{item.product.name}</Text>
                  <Text style={styles.price}>{money(item.lineTotalInCents ?? item.product.priceInCents * item.quantity)}</Text>
                  {atLimit ? <Text style={styles.stock}>Estoque esgotado para este item</Text> : null}
                  <View style={styles.qtyRow}>
                    <Pressable style={styles.qtyBtn} disabled={busy || qtyBusy === item.productId} onPress={() => void setQty(item.productId, item.quantity - 1)}>
                      <Ionicons name="remove" size={16} color={st.text} />
                    </Pressable>
                    <Text style={styles.qty}>{item.quantity}</Text>
                    <Pressable
                      style={styles.qtyBtn}
                      disabled={busy || qtyBusy === item.productId || atLimit}
                      onPress={() => void setQty(item.productId, item.quantity + 1)}
                    >
                      <Ionicons name="add" size={16} color={st.text} />
                    </Pressable>
                    <Pressable onPress={() => void setQty(item.productId, 0)} disabled={busy}>
                      <Text style={styles.remove}>Remover do carrinho</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={styles.info}>
            <Text style={styles.name}>Resumo</Text>
            <Text style={styles.desc}>Subtotal {money(cart.subtotalInCents ?? cart.amountInCents)}</Text>
            {(cart.discountInCents ?? 0) > 0 ? <Text style={styles.desc}>Desconto −{money(cart.discountInCents)}</Text> : null}
            <Text style={styles.desc}>Frete {money(cart.shippingInCents ?? 0)}</Text>
            <Text style={styles.price}>{money(cart.amountInCents)}</Text>
            <Text style={styles.kind}>Cupom</Text>
            <TextInput value={coupon} onChangeText={setCoupon} placeholder="Código" placeholderTextColor={st.faint} style={styles.input} />
            <GreenButton label="Aplicar cupom de desconto" onPress={() => void applyCoupon()} />
            <Text style={styles.kind}>Entrega</Text>
            <Text style={styles.name}>{shippingHint}</Text>
            <Text style={styles.desc}>Definida pelo admin no produto</Text>
            {shipping === "DELIVERY" ? (
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Rua, número, bairro, cidade"
                placeholderTextColor={st.faint}
                style={styles.input}
              />
            ) : null}
            <GreenButton label={busy ? "Finalizando pedido…" : "Finalizar compra"} loading={busy} onPress={() => void checkout()} />
          </View>
        </View>
      )}
    </StudentPage>
  );
}

export function OrdersScreen() {
  const { orders } = useStudent();
  const navigation = useNavigation<NativeStackNavigationProp<ShopStackParamList>>();
  const styles = useShopStyles();
  return (
    <StudentPage>
      <BackChip label="Vitrine" onPress={() => navigation.navigate("Products")} />
      <SheetHeading kicker="Pedidos" title="Pedidos do carrinho" subtitle={`${orders.length} pedido(s) multi-item`} />
      {orders.length === 0 ? (
        <EmptyState icon="receipt-outline" title="Nenhum pedido do carrinho" text="Finalize um carrinho para ver os pedidos aqui." />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {orders.map((order) => (
            <View key={order.id} style={styles.info}>
              <Text style={styles.name}>
                {(order.items ?? []).map((item) => `${item.productName}×${item.quantity}`).join(", ") || money(order.amountInCents)}
              </Text>
              <Text style={styles.desc}>
                {`${money(order.amountInCents)} · ${labelShippingMethod(order.shippingMethod)}`}
              </Text>
              <Text style={styles.kind}>{labelOrderStatus(order.status)}</Text>
              <Text style={styles.desc}>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</Text>
              {order.status === "PENDING" && order.paymentUrl ? (
                <GreenButton label="Pagar agora" onPress={() => void Linking.openURL(order.paymentUrl as string)} />
              ) : null}
            </View>
          ))}
        </View>
      )}
    </StudentPage>
  );
}

function createShopStyles(st: StudentTokens) {
  return StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
    card: {
      width: "47.5%",
      flexGrow: 1,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: st.card
    },
    media: { width: "100%", aspectRatio: 4 / 3, backgroundColor: st.avatarBg },
    fallback: { alignItems: "center", justifyContent: "center" },
    body: { padding: 14, gap: 6 },
    kind: { color: st.goldUi, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
    name: { color: st.text, fontSize: 15, fontWeight: "800" },
    desc: { color: st.muted, fontSize: 12, lineHeight: 16 },
    price: { color: st.goldUi, fontSize: 17, fontWeight: "800", marginTop: 4 },
    toast: {
      marginHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 12,
      padding: 12,
      backgroundColor: "rgba(212,175,55,0.16)"
    },
    toastText: { color: st.text, fontWeight: "700" },
    info: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 14,
      padding: 16,
      backgroundColor: st.card,
      gap: 8,
      flexDirection: "column"
    },
    thumb: { width: 58, height: 58, borderRadius: 14, backgroundColor: st.avatarBg },
    qtyRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    qtyBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      alignItems: "center",
      justifyContent: "center"
    },
    qty: { color: st.text, fontWeight: "800", minWidth: 18, textAlign: "center" },
    remove: { color: st.coral, fontWeight: "800", fontSize: 13 },
    stock: { color: st.coral, fontSize: 12, fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 12,
      padding: 12,
      color: st.text,
      backgroundColor: st.inputBg
    }
  });
}
