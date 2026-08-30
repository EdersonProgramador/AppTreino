import { Check, ChevronDown, ChevronUp, Minus, Package, Plus, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { ApiError, apiGet, apiPost, apiPut } from "../../api";
import {
  labelProductKind,
  labelShippingMethod
} from "../../lib/commerce";
import { mediaUrl } from "../../lib/urls";
import {
  mergeStoreHistory,
  storeBillingOptions,
  storeHistoryStatusLabel,
  storeHistoryStatusTone,
  storePaymentMethodLabel,
  type StoreBillingType,
  type StoreHistoryEntry,
  type StoreTab
} from "../../lib/store-commerce";
import type { CartRow, OrderRow, ProductRow, PurchaseRow, ShippingDestination, ShippingQuotePreview } from "../../types/shared";

type Props = {
  token: string;
  productsEnabled: boolean;
  purchasesEnabled: boolean;
  activeTab: StoreTab;
  onTabChange: (tab: StoreTab) => void;
  onCartUpdated?: (cart: CartRow | null) => void;
  onFlashError?: (message: string) => void;
  onFlashSuccess?: (message: string) => void;
  onFlashStockLimit?: () => void;
  paymentNotice?: string | null;
  onPaymentNoticeConsumed?: () => void;
};

function openCheckoutUrl(url: string) {
  window.location.href = url;
}

function emptyDestination(): ShippingDestination {
  return {
    postalCode: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: ""
  };
}

export function StudentStoreSection({
  token,
  productsEnabled,
  purchasesEnabled,
  activeTab,
  onTabChange,
  onCartUpdated,
  onFlashError,
  onFlashSuccess,
  onFlashStockLimit,
  paymentNotice,
  onPaymentNoticeConsumed
}: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [cartQtyBusyId, setCartQtyBusyId] = useState<string | null>(null);
  const [cartCheckingOut, setCartCheckingOut] = useState(false);
  const [payingEntryId, setPayingEntryId] = useState<string | null>(null);
  const [cartCouponInput, setCartCouponInput] = useState("");
  const [destination, setDestination] = useState<ShippingDestination>(emptyDestination());
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [directProduct, setDirectProduct] = useState<ProductRow | null>(null);
  const [directDestination, setDirectDestination] = useState<ShippingDestination>(emptyDestination());
  const [directFulfillmentMethod, setDirectFulfillmentMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [directServiceId, setDirectServiceId] = useState<string | null>(null);
  const [directQuote, setDirectQuote] = useState<ShippingQuotePreview | null>(null);
  const [directQuoting, setDirectQuoting] = useState(false);
  const [directSubmitting, setDirectSubmitting] = useState(false);
  const [billingType, setBillingType] = useState<StoreBillingType>("PIX");
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const onCartUpdatedRef = useRef(onCartUpdated);
  const onFlashErrorRef = useRef(onFlashError);
  const onFlashSuccessRef = useRef(onFlashSuccess);
  const onPaymentNoticeConsumedRef = useRef(onPaymentNoticeConsumed);

  useEffect(() => {
    onCartUpdatedRef.current = onCartUpdated;
    onFlashErrorRef.current = onFlashError;
    onFlashSuccessRef.current = onFlashSuccess;
    onPaymentNoticeConsumedRef.current = onPaymentNoticeConsumed;
  }, [onCartUpdated, onFlashError, onFlashSuccess, onPaymentNoticeConsumed]);

  const history = useMemo(() => mergeStoreHistory(orders, purchases), [orders, purchases]);
  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const product of products) {
      if (product.category?.trim()) values.add(product.category.trim());
    }
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [products]);
  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    return products.filter((product) => product.category?.trim() === categoryFilter);
  }, [categoryFilter, products]);

  useEffect(() => {
    if (!directProduct || directProduct.kind === "DIGITAL") return;
    void refreshDirectQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcular ao abrir o modal
  }, [directProduct?.id]);

  const syncCart = useCallback((next: CartRow | null) => {
    setCart(next);
    onCartUpdatedRef.current?.(next);
    if (next?.couponCode) setCartCouponInput(next.couponCode);
    if (next?.destination) {
      setDestination({
        postalCode: next.destination.postalCode ?? "",
        street: next.destination.street ?? "",
        number: next.destination.number ?? "",
        complement: next.destination.complement ?? "",
        neighborhood: next.destination.neighborhood ?? "",
        city: next.destination.city ?? "",
        state: next.destination.state ?? ""
      });
    }
    if (next?.fulfillmentMethod === "PICKUP" || next?.fulfillmentMethod === "DELIVERY") {
      setFulfillmentMethod(next.fulfillmentMethod);
    }
    if (next?.shippingServiceId !== undefined) {
      setSelectedServiceId(next.shippingServiceId);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [productsResponse, cartResponse, ordersResponse, purchasesResponse] = await Promise.all([
      productsEnabled
        ? apiGet<{ products: ProductRow[] }>("/student/products", token).catch(() => ({ products: [] as ProductRow[] }))
        : Promise.resolve({ products: [] as ProductRow[] }),
      productsEnabled
        ? apiGet<{ cart: CartRow }>("/student/cart", token).catch(() => ({ cart: null }))
        : Promise.resolve({ cart: null }),
      purchasesEnabled
        ? apiGet<{ orders: OrderRow[] }>("/student/orders", token).catch(() => ({ orders: [] as OrderRow[] }))
        : Promise.resolve({ orders: [] as OrderRow[] }),
      purchasesEnabled
        ? apiGet<{ purchases: PurchaseRow[] }>("/student/purchases", token).catch(() => ({ purchases: [] as PurchaseRow[] }))
        : Promise.resolve({ purchases: [] as PurchaseRow[] })
    ]);
    setProducts(productsResponse.products);
    syncCart(cartResponse.cart);
    setOrders(ordersResponse.orders);
    setPurchases(purchasesResponse.purchases);
  }, [productsEnabled, purchasesEnabled, syncCart, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refreshAll()
      .catch(() => {
        if (!cancelled) onFlashErrorRef.current?.("Não foi possível carregar a vitrine.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  useEffect(() => {
    if (!paymentNotice) return;
    onFlashSuccessRef.current?.(paymentNotice);
    onPaymentNoticeConsumedRef.current?.();
    void refreshAll();
  }, [paymentNotice, refreshAll]);

  async function persistCartShipping(input?: {
    fulfillmentMethod?: "PICKUP" | "DELIVERY";
    destination?: ShippingDestination;
    shippingServiceId?: string | null;
    shippingServiceName?: string | null;
    shippingCarrier?: string | null;
  }) {
    setShippingSaving(true);
    try {
      const selected =
        input?.shippingServiceId !== undefined
          ? cart?.shippingServices?.find((service) => service.id === input.shippingServiceId)
          : cart?.shippingServices?.find((service) => service.id === selectedServiceId);
      const response = await apiPut<{ cart: CartRow }>(
        "/student/cart/shipping",
        {
          fulfillmentMethod: input?.fulfillmentMethod ?? fulfillmentMethod,
          destination: input?.destination ?? destination,
          shippingServiceId:
            input?.shippingServiceId !== undefined ? input.shippingServiceId : selectedServiceId,
          shippingServiceName: selected?.name ?? null,
          shippingCarrier: selected?.company ?? null
        },
        token
      );
      syncCart(response.cart);
      return response.cart;
    } catch (error) {
      onFlashErrorRef.current?.(
        error instanceof ApiError ? error.message : "Não foi possível atualizar o frete."
      );
      return null;
    } finally {
      setShippingSaving(false);
    }
  }

  async function handleCepLookup() {
    const cep = destination.postalCode?.replace(/\D/g, "") ?? "";
    if (cep.length !== 8) return;
    try {
      const response = await apiGet<{ address: ShippingDestination & { postalCode: string } }>(
        `/student/shipping/cep/${cep}`,
        token
      );
      const nextDestination = { ...destination, ...response.address };
      setDestination(nextDestination);
      await persistCartShipping({ destination: nextDestination, fulfillmentMethod: "DELIVERY" });
    } catch (error) {
      onFlashErrorRef.current?.(error instanceof ApiError ? error.message : "CEP inválido.");
    }
  }

  function openDirectPurchase(product: ProductRow) {
    const defaultMethod =
      product.kind === "DIGITAL"
        ? ("PICKUP" as const)
        : product.allowsDelivery === false
          ? ("PICKUP" as const)
          : product.allowsPickup === false
            ? ("DELIVERY" as const)
            : ("PICKUP" as const);
    setDirectProduct(product);
    setDirectDestination(emptyDestination());
    setDirectFulfillmentMethod(defaultMethod);
    setDirectServiceId(null);
    setDirectQuote(null);
  }

  function closeDirectPurchase() {
    if (directSubmitting) return;
    setDirectProduct(null);
    setDirectQuote(null);
  }

  async function refreshDirectQuote(input?: {
    fulfillmentMethod?: "PICKUP" | "DELIVERY";
    destination?: ShippingDestination;
    shippingServiceId?: string | null;
  }) {
    if (!directProduct || directProduct.kind === "DIGITAL") return null;
    setDirectQuoting(true);
    try {
      const response = await apiPost<{ quote: ShippingQuotePreview }>(
        "/student/shipping/quote",
        {
          productId: directProduct.id,
          quantity: 1,
          fulfillmentMethod: input?.fulfillmentMethod ?? directFulfillmentMethod,
          destination: input?.destination ?? directDestination,
          shippingServiceId:
            input?.shippingServiceId !== undefined ? input.shippingServiceId : directServiceId
        },
        token
      );
      setDirectQuote(response.quote);
      if (response.quote.fulfillmentMethod === "PICKUP" || response.quote.fulfillmentMethod === "DELIVERY") {
        setDirectFulfillmentMethod(response.quote.fulfillmentMethod);
      }
      return response.quote;
    } catch (error) {
      onFlashErrorRef.current?.(error instanceof ApiError ? error.message : "Não foi possível calcular o frete.");
      return null;
    } finally {
      setDirectQuoting(false);
    }
  }

  async function handleDirectCepLookup() {
    const cep = directDestination.postalCode?.replace(/\D/g, "") ?? "";
    if (cep.length !== 8) return;
    try {
      const response = await apiGet<{ address: ShippingDestination & { postalCode: string } }>(
        `/student/shipping/cep/${cep}`,
        token
      );
      const nextDestination = { ...directDestination, ...response.address };
      setDirectDestination(nextDestination);
      setDirectFulfillmentMethod("DELIVERY");
      await refreshDirectQuote({ destination: nextDestination, fulfillmentMethod: "DELIVERY" });
    } catch (error) {
      onFlashErrorRef.current?.(error instanceof ApiError ? error.message : "CEP inválido.");
    }
  }

  async function handleDirectPurchaseSubmit() {
    if (!directProduct || !purchasesEnabled) return;
    setDirectSubmitting(true);
    try {
      const selected = directQuote?.services.find((service) => service.id === directServiceId);
      const response = await apiPost<{ purchase: PurchaseRow }>(
        "/student/purchases",
        {
          productId: directProduct.id,
          billingType,
          fulfillmentMethod: directProduct.kind === "DIGITAL" ? undefined : directFulfillmentMethod,
          destination: directFulfillmentMethod === "DELIVERY" ? directDestination : undefined,
          shippingServiceId: directServiceId,
          shippingServiceName: selected?.name ?? null,
          shippingCarrier: selected?.company ?? null
        },
        token
      );
      setPurchases((current) => [response.purchase, ...current]);
      closeDirectPurchase();
      if (response.purchase.paymentUrl) {
        openCheckoutUrl(response.purchase.paymentUrl);
        return;
      }
      onFlashSuccess?.("Compra registrada. Aguardando confirmação de pagamento.");
      onTabChange("orders");
    } catch (error) {
      onFlashError?.(error instanceof ApiError ? error.message : "Não foi possível concluir a compra.");
    } finally {
      setDirectSubmitting(false);
    }
  }

  async function handleAddToCart(productId: string, goToCart = false) {
    setBusyProductId(productId);
    try {
      const product = products.find((item) => item.id === productId);
      const inCart = cart?.items.find((item) => item.productId === productId);
      const nextQty = (inCart?.quantity ?? 0) + 1;
      if (product?.stock != null && nextQty > product.stock) {
        onFlashStockLimit?.();
        return;
      }
      const response = await apiPost<{ cart: CartRow }>("/student/cart/items", { productId, quantity: 1 }, token);
      syncCart(response.cart);
      if (goToCart) onTabChange("cart");
      onFlashSuccess?.(goToCart ? "Produto no carrinho. Revise e finalize." : "Adicionado ao carrinho.");
      if (product?.stock != null && nextQty >= product.stock) onFlashStockLimit?.();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível adicionar ao carrinho.";
      if (/estoque|stock|máximo disponível/i.test(message)) onFlashStockLimit?.();
      else onFlashError?.(message);
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleCartQuantity(productId: string, quantity: number) {
    if (cartQtyBusyId) return;
    const item = cart?.items.find((entry) => entry.productId === productId);
    const nextQty = Math.max(0, quantity);
    if (item?.product.stock != null && nextQty > item.product.stock) {
      onFlashStockLimit?.();
      return;
    }
    setCartQtyBusyId(productId);
    try {
      await apiPut<{ cart: CartRow }>(`/student/cart/items/${productId}`, { quantity: nextQty }, token);
      const refreshed = await apiGet<{ cart: CartRow }>("/student/cart", token);
      syncCart(refreshed.cart);
      if (item?.product.stock != null && nextQty >= item.product.stock) onFlashStockLimit?.();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Não foi possível atualizar a quantidade.";
      if (/estoque|stock|máximo disponível/i.test(message)) onFlashStockLimit?.();
      else onFlashError?.(message);
    } finally {
      setCartQtyBusyId(null);
    }
  }

  async function handleApplyCartCoupon() {
    try {
      await apiPut<{ cart: CartRow }>("/student/cart/coupon", { code: cartCouponInput.trim() || null }, token);
      const refreshed = await apiGet<{ cart: CartRow }>("/student/cart", token);
      syncCart(refreshed.cart);
      onFlashSuccess?.(cartCouponInput.trim() ? "Cupom aplicado." : "Cupom removido.");
    } catch (error) {
      onFlashError?.(error instanceof ApiError ? error.message : "Cupom inválido.");
    }
  }

  async function handleCartCheckout() {
    if (!purchasesEnabled) {
      onFlashError?.("Finalização de pedidos indisponível no momento.");
      return;
    }
    setCartCheckingOut(true);
    try {
      const response = await apiPost<{ order: OrderRow }>(
        "/student/cart/checkout",
        { billingType },
        token
      );
      setOrders((current) => [response.order, ...current]);
      syncCart({
        id: cart?.id ?? "empty",
        items: [],
        subtotalInCents: 0,
        discountInCents: 0,
        shippingInCents: 0,
        shippingMethod: "PICKUP",
        amountInCents: 0,
        itemCount: 0,
        couponCode: null
      });
      setCartCouponInput("");
      setDestination(emptyDestination());
      setSelectedServiceId(null);
      if (response.order.paymentUrl) {
        openCheckoutUrl(response.order.paymentUrl);
        return;
      }
      onFlashSuccess?.("Pedido criado. Aguardando confirmação de pagamento.");
      onTabChange("orders");
    } catch (error) {
      onFlashError?.(error instanceof ApiError ? error.message : "Não foi possível finalizar o pedido.");
    } finally {
      setCartCheckingOut(false);
    }
  }

  async function handlePayEntry(entry: StoreHistoryEntry) {
    setPayingEntryId(entry.id);
    try {
      if (entry.paymentUrl) {
        openCheckoutUrl(entry.paymentUrl);
        return;
      }
      if (entry.kind === "order") {
        const response = await apiPost<{ order: OrderRow; alreadyPaid?: boolean }>(
          `/student/orders/${entry.id}/checkout`,
          { billingType },
          token
        );
        setOrders((current) => current.map((order) => (order.id === entry.id ? response.order : order)));
        if (response.alreadyPaid) {
          await refreshAll();
          return;
        }
        if (response.order.paymentUrl) openCheckoutUrl(response.order.paymentUrl);
        else onFlashError?.("Link de pagamento indisponível. Aguarde a confirmação da academia.");
        return;
      }
      const response = await apiPost<{ purchase: PurchaseRow; alreadyPaid?: boolean }>(
        `/student/purchases/${entry.id}/checkout`,
        { billingType },
        token
      );
      setPurchases((current) => current.map((purchase) => (purchase.id === entry.id ? response.purchase : purchase)));
      if (response.alreadyPaid) {
        await refreshAll();
        return;
      }
      if (response.purchase.paymentUrl) openCheckoutUrl(response.purchase.paymentUrl);
      else onFlashError?.("Link de pagamento indisponível. Aguarde a confirmação da academia.");
    } catch (error) {
      onFlashError?.(error instanceof ApiError ? error.message : "Não foi possível abrir o pagamento.");
    } finally {
      setPayingEntryId(null);
    }
  }

  const cartCount = cart?.itemCount ?? 0;
  const pendingCount = history.filter((entry) => entry.status === "PENDING").length;
  const canPickup = cart?.canPickup ?? true;
  const canDeliver = cart?.canDeliver ?? false;
  const showDeliveryForm = fulfillmentMethod === "DELIVERY" && canDeliver;

  return (
    <section className="student-sheet student-store-sheet">
      <div className="student-sheet-heading">
        <span>Loja da academia</span>
        <h1>Vitrine</h1>
        <p>Catálogo, carrinho e histórico de compras em um só lugar — pagamento seguro via Asaas.</p>
      </div>

      <div className="student-store-tabs" role="tablist" aria-label="Seções da vitrine">
        {productsEnabled ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "catalog"}
            className={activeTab === "catalog" ? "is-active" : ""}
            onClick={() => onTabChange("catalog")}
          >
            Catálogo
          </button>
        ) : null}
        {productsEnabled ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "cart"}
            className={activeTab === "cart" ? "is-active" : ""}
            onClick={() => onTabChange("cart")}
          >
            Carrinho{cartCount > 0 ? ` (${cartCount})` : ""}
          </button>
        ) : null}
        {purchasesEnabled ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "orders"}
            className={activeTab === "orders" ? "is-active" : ""}
            onClick={() => onTabChange("orders")}
          >
            Meus pedidos{pendingCount > 0 ? ` · ${pendingCount} pendente(s)` : ""}
          </button>
        ) : null}
      </div>

      {loading ? <p className="student-store-loading">Carregando vitrine…</p> : null}

      {!loading && activeTab === "catalog" && productsEnabled ? (
        <>
          {categories.length > 1 ? (
            <div className="student-store-filters" role="tablist" aria-label="Categorias">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={categoryFilter === category ? "is-active" : ""}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category === "all" ? "Todos" : category}
                </button>
              ))}
            </div>
          ) : null}
          {filteredProducts.length > 0 ? (
            <div className="student-products-grid">
              {filteredProducts.map((product) => (
                <article className="student-product-card" key={product.id}>
                  <div className="student-product-media">
                    {product.imageUrl ? (
                      <img src={mediaUrl(product.imageUrl)} alt={product.name} />
                    ) : (
                      <div className="student-product-fallback" aria-hidden="true">
                        <Package size={30} />
                      </div>
                    )}
                  </div>
                  <div className="student-product-body">
                    <small>
                      {product.category ? `${product.category} · ` : ""}
                      {labelProductKind(product.kind)}
                      {product.shippingMethod
                        ? ` · ${labelShippingMethod(product.shippingMethod)}`
                        : product.kind === "DIGITAL"
                          ? ` · ${labelShippingMethod("DIGITAL")}`
                          : ` · ${labelShippingMethod("PICKUP")}`}
                    </small>
                    <strong className="student-product-name">{product.name}</strong>
                    {product.description ? <span className="student-product-desc">{product.description}</span> : null}
                    <strong className="student-product-price">{formatPriceInBRL(product.priceInCents)}</strong>
                    <div className="student-product-actions">
                      <button
                        className="student-green-button"
                        type="button"
                        disabled={Boolean(product.outOfStock) || busyProductId === product.id}
                        onClick={() => void handleAddToCart(product.id)}
                      >
                        {busyProductId === product.id ? "Adicionando…" : "Adicionar ao carrinho"}
                      </button>
                      <button
                        className="student-outline-button"
                        type="button"
                        disabled={Boolean(product.outOfStock) || busyProductId === product.id}
                        onClick={() => openDirectPurchase(product)}
                      >
                        {product.outOfStock ? "Sem estoque" : "Comprar agora"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <article className="student-empty-state">
              <Package size={34} />
              <strong>Nenhum produto na vitrine</strong>
              <span>Quando a academia publicar itens, eles aparecerão aqui.</span>
            </article>
          )}
        </>
      ) : null}

      {!loading && activeTab === "cart" && productsEnabled ? (
        (cart?.items?.length ?? 0) > 0 ? (
          <>
            {cart!.items.map((item) => {
              const stockLimit = item.product.stock;
              const atStockLimit = stockLimit != null && item.quantity >= stockLimit;
              const qtyBusy = cartQtyBusyId === item.productId;
              return (
                <article className="student-info-card" key={item.id}>
                  {item.product.imageUrl ? (
                    <img className="student-card-image" src={mediaUrl(item.product.imageUrl)} alt={item.product.name} />
                  ) : (
                    <div className="student-card-icon" aria-hidden="true">
                      <Package size={22} />
                    </div>
                  )}
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>{formatPriceInBRL(item.lineTotalInCents)}</span>
                    {(item.shippingInCents ?? 0) > 0 ? (
                      <span className="student-store-item-shipping">
                        Frete deste item: {formatPriceInBRL(item.shippingInCents ?? 0)}
                      </span>
                    ) : null}
                    {stockLimit != null && item.quantity >= stockLimit ? (
                      <span className="student-cart-stock-hint">😅 Estoque esgotado para este item</span>
                    ) : null}
                    <div className="student-cart-item-actions">
                      <div className="student-cart-qty" role="group" aria-label={`Quantidade de ${item.product.name}`}>
                        <button
                          type="button"
                          className="student-cart-qty-btn"
                          aria-label="Diminuir quantidade"
                          disabled={cartCheckingOut || qtyBusy}
                          onClick={() => void handleCartQuantity(item.productId, item.quantity - 1)}
                        >
                          <Minus size={16} />
                        </button>
                        <strong className="student-cart-qty-value">{item.quantity}</strong>
                        <button
                          type="button"
                          className="student-cart-qty-btn"
                          aria-label={atStockLimit ? "Estoque esgotado para este item" : "Aumentar quantidade"}
                          disabled={cartCheckingOut || qtyBusy || atStockLimit}
                          onClick={() => void handleCartQuantity(item.productId, item.quantity + 1)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="student-link-button"
                        disabled={cartCheckingOut || qtyBusy}
                        onClick={() => void handleCartQuantity(item.productId, 0)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            <article className="student-info-card student-cart-summary-card">
              <div className="student-card-icon" aria-hidden="true">
                <ShoppingCart size={22} />
              </div>
              <div className="student-cart-summary">
                <strong className="student-cart-summary-title">Checkout</strong>
                {(canPickup || canDeliver) && (
                  <div className="student-store-fulfillment">
                    <span className="student-field-label">Como receber</span>
                    <div className="student-store-fulfillment-options">
                      {canPickup ? (
                        <button
                          type="button"
                          className={fulfillmentMethod === "PICKUP" ? "is-active" : ""}
                          disabled={shippingSaving || cartCheckingOut}
                          onClick={() => {
                            setFulfillmentMethod("PICKUP");
                            void persistCartShipping({ fulfillmentMethod: "PICKUP" });
                          }}
                        >
                          Retirada na unidade
                        </button>
                      ) : null}
                      {canDeliver ? (
                        <button
                          type="button"
                          className={fulfillmentMethod === "DELIVERY" ? "is-active" : ""}
                          disabled={shippingSaving || cartCheckingOut}
                          onClick={() => {
                            setFulfillmentMethod("DELIVERY");
                            void persistCartShipping({ fulfillmentMethod: "DELIVERY" });
                          }}
                        >
                          Entrega
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                {showDeliveryForm ? (
                  <div className="student-store-address-form">
                    <label className="student-field-label">
                      CEP
                      <input
                        value={destination.postalCode ?? ""}
                        onChange={(event) =>
                          setDestination((current) => ({ ...current, postalCode: event.target.value }))
                        }
                        onBlur={() => void handleCepLookup()}
                        placeholder="00000-000"
                        inputMode="numeric"
                      />
                    </label>
                    <label className="student-field-label">
                      Rua
                      <input
                        value={destination.street ?? ""}
                        onChange={(event) =>
                          setDestination((current) => ({ ...current, street: event.target.value }))
                        }
                        onBlur={() => void persistCartShipping()}
                      />
                    </label>
                    <div className="student-store-address-grid">
                      <label className="student-field-label">
                        Número
                        <input
                          value={destination.number ?? ""}
                          onChange={(event) =>
                            setDestination((current) => ({ ...current, number: event.target.value }))
                          }
                          onBlur={() => void persistCartShipping()}
                        />
                      </label>
                      <label className="student-field-label">
                        Complemento
                        <input
                          value={destination.complement ?? ""}
                          onChange={(event) =>
                            setDestination((current) => ({ ...current, complement: event.target.value }))
                          }
                          onBlur={() => void persistCartShipping()}
                        />
                      </label>
                    </div>
                    <label className="student-field-label">
                      Bairro
                      <input
                        value={destination.neighborhood ?? ""}
                        onChange={(event) =>
                          setDestination((current) => ({ ...current, neighborhood: event.target.value }))
                        }
                        onBlur={() => void persistCartShipping()}
                      />
                    </label>
                    <div className="student-store-address-grid">
                      <label className="student-field-label">
                        Cidade
                        <input
                          value={destination.city ?? ""}
                          onChange={(event) =>
                            setDestination((current) => ({ ...current, city: event.target.value }))
                          }
                          onBlur={() => void persistCartShipping()}
                        />
                      </label>
                      <label className="student-field-label">
                        UF
                        <input
                          value={destination.state ?? ""}
                          maxLength={2}
                          onChange={(event) =>
                            setDestination((current) => ({
                              ...current,
                              state: event.target.value.toUpperCase()
                            }))
                          }
                          onBlur={() => void persistCartShipping()}
                        />
                      </label>
                    </div>
                    {(cart?.shippingServices?.length ?? 0) > 0 ? (
                      <div className="student-store-billing">
                        <span className="student-field-label">Transportadora</span>
                        <div className="student-store-billing-options">
                          {cart!.shippingServices!.map((service) => (
                            <label
                              key={service.id}
                              className={selectedServiceId === service.id ? "is-active" : ""}
                            >
                              <input
                                type="radio"
                                name="store-shipping-service"
                                checked={selectedServiceId === service.id}
                                onChange={() => {
                                  setSelectedServiceId(service.id);
                                  void persistCartShipping({
                                    shippingServiceId: service.id,
                                    fulfillmentMethod: "DELIVERY"
                                  });
                                }}
                              />
                              <strong>
                                {service.company} · {service.name}
                              </strong>
                              <small>
                                {formatPriceInBRL(service.priceInCents)}
                                {service.deliveryDays ? ` · ${service.deliveryDays} dia(s)` : ""}
                              </small>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="student-field-label student-cart-shipping">
                    Entrega
                    <strong>{labelShippingMethod(cart?.shippingMethod ?? "PICKUP")}</strong>
                    {cart?.quoteSource ? (
                      <span className="student-muted-hint">Cálculo: {cart.quoteSource}</span>
                    ) : null}
                  </div>
                )}
                <div className="student-store-billing">
                  <span className="student-field-label">Forma de pagamento</span>
                  <div className="student-store-billing-options">
                    {storeBillingOptions.map((option) => (
                      <label key={option.value} className={billingType === option.value ? "is-active" : ""}>
                        <input
                          type="radio"
                          name="store-billing"
                          value={option.value}
                          checked={billingType === option.value}
                          onChange={() => setBillingType(option.value)}
                        />
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="student-cart-summary-lines">
                  <span>Subtotal {formatPriceInBRL(cart!.subtotalInCents)}</span>
                  {cart!.discountInCents > 0 ? (
                    <span>Desconto −{formatPriceInBRL(cart!.discountInCents)}</span>
                  ) : null}
                  <span>Frete {formatPriceInBRL(cart!.shippingInCents)}</span>
                </div>
                <strong className="student-product-price student-cart-summary-total">
                  {formatPriceInBRL(cart!.amountInCents)}
                </strong>
                <div className="student-cart-summary-actions">
                  <label className="student-field-label">
                    Cupom
                    <input
                      value={cartCouponInput}
                      onChange={(event) => setCartCouponInput(event.target.value)}
                      placeholder="Código promocional"
                    />
                  </label>
                  <button type="button" className="student-green-button" onClick={() => void handleApplyCartCoupon()}>
                    Aplicar cupom
                  </button>
                  <button
                    type="button"
                    className="student-green-button"
                    disabled={cartCheckingOut || !purchasesEnabled || shippingSaving}
                    onClick={() => void handleCartCheckout()}
                  >
                    {cartCheckingOut ? "Finalizando pedido…" : "Ir para pagamento seguro"}
                  </button>
                  <p className="student-store-payment-note">
                    Você será redirecionado ao checkout Asaas. Após pagar, volte aqui em Meus pedidos.
                  </p>
                </div>
              </div>
            </article>
          </>
        ) : (
          <article className="student-empty-state">
            <ShoppingCart size={34} />
            <strong>Carrinho vazio</strong>
            <span>Adicione produtos no catálogo para montar seu pedido.</span>
            <button type="button" className="student-green-button" onClick={() => onTabChange("catalog")}>
              Ver catálogo
            </button>
          </article>
        )
      ) : null}

      {!loading && activeTab === "orders" && purchasesEnabled ? (
        history.length > 0 ? (
          <div className="student-store-history">
            {history.map((entry) => {
              const expanded = expandedEntryId === `${entry.kind}:${entry.id}`;
              return (
                <article className="student-store-history-card" key={`${entry.kind}-${entry.id}`}>
                  <button
                    type="button"
                    className="student-store-history-head"
                    onClick={() =>
                      setExpandedEntryId(expanded ? null : `${entry.kind}:${entry.id}`)
                    }
                  >
                    <div>
                      <strong>{entry.title}</strong>
                      <span>
                        {formatPriceInBRL(entry.amountInCents)} ·{" "}
                        {new Date(entry.createdAt).toLocaleString("pt-BR")}
                      </span>
                      <span className="student-store-history-kind">
                        {entry.kind === "order" ? "Pedido do carrinho" : "Compra direta"}
                      </span>
                    </div>
                    <div className="student-store-history-meta">
                      <span className={`finance-status-badge tone-${storeHistoryStatusTone(entry)}`}>
                        {storeHistoryStatusLabel(entry)}
                      </span>
                      {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>
                  {expanded ? (
                    <div className="student-store-history-body">
                      <p>Pagamento: {storePaymentMethodLabel(entry.paymentMethod)}</p>
                      {entry.kind === "order" ? (
                        <>
                          <p>Entrega: {labelShippingMethod(entry.shippingMethod)}</p>
                          {entry.shippingAddress ? <p>Endereço: {entry.shippingAddress}</p> : null}
                          {entry.couponCode ? <p>Cupom: {entry.couponCode}</p> : null}
                          <ul className="student-store-history-items">
                            {entry.items.map((item) => (
                              <li key={item.id}>
                                {item.productName} × {item.quantity} — {formatPriceInBRL(item.amountInCents)}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p>Tipo: {labelProductKind(entry.productKind)}</p>
                      )}
                      {entry.status === "PENDING" ? (
                        <button
                          type="button"
                          className="student-green-button"
                          disabled={payingEntryId === entry.id}
                          onClick={() => void handlePayEntry(entry)}
                        >
                          {payingEntryId === entry.id ? "Abrindo pagamento…" : "Pagar agora"}
                        </button>
                      ) : entry.status === "CONFIRMED" || entry.status === "DELIVERED" ? (
                        <p className="student-store-history-paid">
                          <Check size={16} /> Pagamento confirmado
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <article className="student-empty-state">
            <ShoppingCart size={34} />
            <strong>Nenhum pedido ainda</strong>
            <span>Finalize uma compra na vitrine para acompanhar aqui.</span>
            <button type="button" className="student-green-button" onClick={() => onTabChange("catalog")}>
              Ir ao catálogo
            </button>
          </article>
        )
      ) : null}

      {directProduct ? (
        <div className="student-store-modal-backdrop" role="presentation" onClick={closeDirectPurchase}>
          <article
            className="student-store-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="direct-purchase-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="student-store-modal-head">
              <div>
                <span>Compra direta</span>
                <strong id="direct-purchase-title">{directProduct.name}</strong>
              </div>
              <button type="button" className="student-store-modal-close" onClick={closeDirectPurchase}>
                Fechar
              </button>
            </header>
            <div className="student-store-modal-body">
              <p className="student-product-price">{formatPriceInBRL(directProduct.priceInCents)}</p>
              {directProduct.kind !== "DIGITAL" ? (
                <>
                  <div className="student-store-fulfillment">
                    <span className="student-field-label">Como receber</span>
                    <div className="student-store-fulfillment-options">
                      {(directQuote?.canPickup ?? directProduct.allowsPickup !== false) ? (
                        <button
                          type="button"
                          className={directFulfillmentMethod === "PICKUP" ? "is-active" : ""}
                          disabled={directQuoting || directSubmitting}
                          onClick={() => {
                            setDirectFulfillmentMethod("PICKUP");
                            void refreshDirectQuote({ fulfillmentMethod: "PICKUP", shippingServiceId: null });
                          }}
                        >
                          Retirada na unidade
                        </button>
                      ) : null}
                      {(directQuote?.canDeliver ?? directProduct.allowsDelivery !== false) ? (
                        <button
                          type="button"
                          className={directFulfillmentMethod === "DELIVERY" ? "is-active" : ""}
                          disabled={directQuoting || directSubmitting}
                          onClick={() => {
                            setDirectFulfillmentMethod("DELIVERY");
                            void refreshDirectQuote({ fulfillmentMethod: "DELIVERY" });
                          }}
                        >
                          Entrega
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {directFulfillmentMethod === "DELIVERY" ? (
                    <div className="student-store-address-form">
                      <label className="student-field-label">
                        CEP
                        <input
                          value={directDestination.postalCode ?? ""}
                          onChange={(event) =>
                            setDirectDestination((current) => ({ ...current, postalCode: event.target.value }))
                          }
                          onBlur={() => void handleDirectCepLookup()}
                          placeholder="00000-000"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="student-field-label">
                        Rua
                        <input
                          value={directDestination.street ?? ""}
                          onChange={(event) =>
                            setDirectDestination((current) => ({ ...current, street: event.target.value }))
                          }
                          onBlur={() => void refreshDirectQuote()}
                        />
                      </label>
                      <div className="student-store-address-grid">
                        <label className="student-field-label">
                          Número
                          <input
                            value={directDestination.number ?? ""}
                            onChange={(event) =>
                              setDirectDestination((current) => ({ ...current, number: event.target.value }))
                            }
                            onBlur={() => void refreshDirectQuote()}
                          />
                        </label>
                        <label className="student-field-label">
                          Complemento
                          <input
                            value={directDestination.complement ?? ""}
                            onChange={(event) =>
                              setDirectDestination((current) => ({ ...current, complement: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                      {(directQuote?.services.length ?? 0) > 0 ? (
                        <div className="student-store-billing">
                          <span className="student-field-label">Transportadora</span>
                          <div className="student-store-billing-options">
                            {directQuote!.services.map((service) => (
                              <label
                                key={service.id}
                                className={directServiceId === service.id ? "is-active" : ""}
                              >
                                <input
                                  type="radio"
                                  name="direct-shipping-service"
                                  checked={directServiceId === service.id}
                                  onChange={() => {
                                    setDirectServiceId(service.id);
                                    void refreshDirectQuote({ shippingServiceId: service.id });
                                  }}
                                />
                                <strong>
                                  {service.company} · {service.name}
                                </strong>
                                <small>
                                  {formatPriceInBRL(service.priceInCents)}
                                  {service.deliveryDays ? ` · ${service.deliveryDays} dia(s)` : ""}
                                </small>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {directQuote ? (
                    <p className="student-muted-hint">
                      Frete: {formatPriceInBRL(directQuote.shippingInCents)}
                      {directQuote.quoteSource ? ` · ${directQuote.quoteSource}` : ""}
                    </p>
                  ) : null}
                </>
              ) : null}
              <div className="student-store-billing">
                <span className="student-field-label">Forma de pagamento</span>
                <div className="student-store-billing-options">
                  {storeBillingOptions.map((option) => (
                    <label key={option.value} className={billingType === option.value ? "is-active" : ""}>
                      <input
                        type="radio"
                        name="direct-billing-type"
                        checked={billingType === option.value}
                        onChange={() => setBillingType(option.value)}
                      />
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </label>
                  ))}
                </div>
              </div>
              {directQuote?.amountInCents != null ? (
                <strong className="student-product-price">
                  Total: {formatPriceInBRL(directQuote.amountInCents)}
                </strong>
              ) : (
                <strong className="student-product-price">
                  Total: {formatPriceInBRL(directProduct.priceInCents + (directQuote?.shippingInCents ?? 0))}
                </strong>
              )}
            </div>
            <footer className="student-store-modal-actions">
              <button type="button" className="student-outline-button" onClick={closeDirectPurchase}>
                Cancelar
              </button>
              <button
                type="button"
                className="student-green-button"
                disabled={directSubmitting || directQuoting || !purchasesEnabled}
                onClick={() => void handleDirectPurchaseSubmit()}
              >
                {directSubmitting ? "Processando…" : "Confirmar compra"}
              </button>
            </footer>
          </article>
        </div>
      ) : null}
    </section>
  );
}
