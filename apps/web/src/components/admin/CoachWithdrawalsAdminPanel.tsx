import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { formatPriceInBRL } from "@app-treino/shared";
import { apiGet, apiPost } from "../../api";

type WithdrawalRow = {
  id: string;
  amountInCents: number;
  pixKey: string;
  status: string;
  createdAt: string;
  coach: { id: string; name: string; email: string | null; phone: string | null };
};

type Props = {
  token: string;
};

export function CoachWithdrawalsAdminPanel({ token }: Props) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ withdrawals: WithdrawalRow[] }>("/admin/coach-withdrawals", token);
      setRows(data.withdrawals);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "pay" | "reject") => {
    setBusyId(id);
    setFeedback(null);
    try {
      await apiPost(`/admin/coach-withdrawals/${id}/${action}`, {}, token);
      setFeedback(action === "pay" ? "Saque marcado como pago." : "Saque rejeitado.");
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-sand">Saques de coaches</h2>
          <p className="text-sm text-sand-muted">Aprovação manual de PIX para comissões de afiliados.</p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </div>
      {feedback && <p className="mb-3 text-sm text-emerald-400">{feedback}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-sand-muted">Nenhuma solicitação pendente.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>{row.coach.name}</strong>
                  <span className="block text-xs text-sand-muted">
                    {formatPriceInBRL(row.amountInCents)} · PIX {row.pixKey} · {row.status}
                  </span>
                  <span className="block text-xs text-sand-muted">
                    {row.coach.email ?? row.coach.phone ?? "—"} ·{" "}
                    {new Date(row.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                {row.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="admin-primary-button"
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, "pay")}
                    >
                      {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Pago
                    </button>
                    <button
                      type="button"
                      className="admin-secondary-button"
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, "reject")}
                    >
                      <X size={14} />
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
