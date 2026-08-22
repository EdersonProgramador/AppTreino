import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { api } from "@/lib";
import { TreinoPage, Panel, PrimaryButton } from "@/components/treino/TreinoPage";

export default function CarrinhoPage() {
  const router = useRouter();
  const [cart, setCart] = useState<any>({ items: [], totalLabel: "R$ 0,00" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api().get("/fitness/shop/cart");
    setCart(res.data);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  async function checkout() {
    setBusy(true);
    try {
      await api().post("/fitness/shop/checkout");
      toast.success("Pedido confirmado");
      router.push("/loja/pedidos");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Falha no checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TreinoPage title="Carrinho" subtitle="Revise e finalize a compra." backHref="/loja">
      {(cart.items || []).map((item: any) => (
        <Panel key={item.id}>
          <strong className="text-ink">{item.product.name}</strong>
          <p className="text-sm text-slate-500">
            {item.qty} × {item.product.priceLabel}
          </p>
        </Panel>
      ))}
      <Panel>
        <p className="mb-3 text-sm text-slate-600">Total: <strong>{cart.totalLabel}</strong></p>
        <PrimaryButton disabled={busy || !(cart.items || []).length} onClick={() => void checkout()}>
          Finalizar pedido
        </PrimaryButton>
      </Panel>
    </TreinoPage>
  );
}
