import { useEffect, useState } from "react";
import { api } from "@/lib";
import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function PedidosPage() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    void api()
      .get("/fitness/shop/orders")
      .then(res => setOrders(res.data.orders || []));
  }, []);

  return (
    <TreinoPage title="Pedidos" subtitle="Compras recentes na vitrine." backHref="/loja">
      {orders.map(order => (
        <Panel key={order.id}>
          <strong className="text-ink">{order.totalLabel}</strong>
          <p className="text-sm text-slate-500">
            {order.status} · {new Date(order.createdAt).toLocaleString("pt-BR")}
          </p>
          <ul className="mt-2 text-sm text-slate-600">
            {order.items?.map((item: any) => (
              <li key={item.id}>
                {item.qty}× {item.product?.name}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      {!orders.length ? <Panel><p className="text-sm text-slate-500">Nenhum pedido ainda.</p></Panel> : null}
    </TreinoPage>
  );
}
