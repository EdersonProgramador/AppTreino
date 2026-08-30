import { ChevronRight, Package, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { apiGet } from "../../api";
import {
  mergeStoreHistory,
  storeHistoryPendingCount,
  storeHistoryStatusLabel,
  storeHistoryStatusTone,
  type StoreTab
} from "../../lib/store-commerce";
import type { OrderRow, PurchaseRow } from "../../types/shared";

type StoreSummaryResponse = {
  cartItemCount: number;
  cartAmountInCents: number;
  orderCount: number;
  purchaseCount: number;
  pendingCount: number;
  orders: OrderRow[];
  purchases: PurchaseRow[];
};

type Props = {
  token: string;
  enabled: boolean;
  onOpenStore: (tab?: StoreTab) => void;
};

export function StudentProfileStorePanel({ token, enabled, onOpenStore }: Props) {
  const [summary, setSummary] = useState<StoreSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiGet<StoreSummaryResponse>("/student/store/summary", token)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  const history = useMemo(
    () => mergeStoreHistory(summary?.orders ?? [], summary?.purchases ?? []).slice(0, 3),
    [summary?.orders, summary?.purchases]
  );

  const totalCount = (summary?.orderCount ?? 0) + (summary?.purchaseCount ?? 0);
  const pendingCount = summary ? summary.pendingCount : storeHistoryPendingCount(history);

  if (!enabled) return null;

  return (
    <section className="student-profile-store-panel" aria-label="Minhas compras na vitrine">
      <header className="student-profile-store-head">
        <div>
          <span className="student-profile-store-kicker">Vitrine</span>
          <h2>Minhas compras ({loading ? "…" : totalCount})</h2>
        </div>
        <button type="button" className="student-outline-button student-profile-store-open" onClick={() => onOpenStore("catalog")}>
          Abrir vitrine
          <ChevronRight size={16} />
        </button>
      </header>

      <div className="student-profile-store-stats">
        <article>
          <ShoppingBag size={18} />
          <strong>{loading ? "…" : summary?.cartItemCount ?? 0}</strong>
          <span>No carrinho</span>
        </article>
        <article>
          <Package size={18} />
          <strong>{loading ? "…" : pendingCount}</strong>
          <span>Pagamento pendente</span>
        </article>
      </div>

      {!loading && history.length === 0 ? (
        <p className="student-profile-store-empty">Nenhuma compra ainda. Explore a vitrine da academia.</p>
      ) : (
        <div className="student-profile-store-list">
          {history.map((entry) => (
            <button
              key={`${entry.kind}-${entry.id}`}
              type="button"
              className="student-profile-store-item"
              onClick={() => onOpenStore("orders")}
            >
              <div>
                <strong>{entry.title}</strong>
                <span>
                  {formatPriceInBRL(entry.amountInCents)} ·{" "}
                  {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <span className={`finance-status-badge tone-${storeHistoryStatusTone(entry)}`}>
                {storeHistoryStatusLabel(entry)}
              </span>
            </button>
          ))}
        </div>
      )}

      <button type="button" className="student-link-button student-profile-store-history" onClick={() => onOpenStore("orders")}>
        Ver histórico completo na vitrine
      </button>
    </section>
  );
}
