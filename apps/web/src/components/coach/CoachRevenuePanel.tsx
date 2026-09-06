import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Wallet } from "lucide-react";
import { formatPriceInBRL, COACH_MIN_WITHDRAWAL_CENTS } from "@app-treino/shared";
import { apiGet, apiPost, apiPut } from "../../api";

type AffiliateSummary = {
  commissionRateLabel: string;
  minWithdrawalInCents: number;
  holdingDays: number;
  referralUrl: string | null;
  activeReferrals: number;
  referralLink: {
    slug: string;
    clickCount: number;
    signupCount: number;
  } | null;
  wallet: {
    availableInCents: number;
    pendingInCents: number;
    lockedInCents: number;
    withdrawnInCents: number;
    pixKey: string | null;
    pixKeyType: string | null;
  };
  commissions: Array<{
    id: string;
    amountInCents: number;
    status: string;
    createdAt: string;
    athlete: { id: string; name: string; email: string | null };
  }>;
  withdrawals: Array<{
    id: string;
    amountInCents: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
};

type Props = {
  token: string;
  busy: boolean;
  onBusy: (action: () => Promise<void>, success: string) => Promise<void>;
  onError: (message: string) => void;
};

export function CoachRevenuePanel({ token, busy, onBusy, onError }: Props) {
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pixKey, setPixKey] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<AffiliateSummary>("/coach/affiliate/summary", token);
      setSummary(data);
      setPixKey(data.wallet.pixKey ?? "");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao carregar receitas.");
    } finally {
      setLoading(false);
    }
  }, [onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async () => {
    if (!summary?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(summary.referralUrl);
      setCopyFeedback("Link copiado.");
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      setCopyFeedback("Não foi possível copiar.");
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-sand-muted">
        <Loader2 className="animate-spin" size={18} />
        Carregando receitas...
      </div>
    );
  }

  if (!summary) return null;

  const wallet = summary.wallet;

  return (
    <section className="grid gap-6">
      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
          <Wallet size={18} />
          Receitas de afiliado
        </h2>
        <p className="mb-4 text-sm text-sand-muted">
          Comissão de {summary.commissionRateLabel} sobre cada pagamento confirmado de alunos indicados, enquanto
          estiverem ativos na plataforma.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
            <span className="block text-xs uppercase tracking-wide text-sand-muted">Disponível</span>
            <strong className="text-xl text-emerald-400">{formatPriceInBRL(wallet.availableInCents)}</strong>
          </div>
          <div className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
            <span className="block text-xs uppercase tracking-wide text-sand-muted">Pendente</span>
            <strong className="text-xl">{formatPriceInBRL(wallet.pendingInCents)}</strong>
            <span className="block text-xs text-sand-muted">Carência {summary.holdingDays} dias</span>
          </div>
          <div className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
            <span className="block text-xs uppercase tracking-wide text-sand-muted">Em saque</span>
            <strong className="text-xl">{formatPriceInBRL(wallet.lockedInCents)}</strong>
          </div>
          <div className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
            <span className="block text-xs uppercase tracking-wide text-sand-muted">Já sacado</span>
            <strong className="text-xl">{formatPriceInBRL(wallet.withdrawnInCents)}</strong>
          </div>
        </div>
      </article>

      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 text-lg font-bold text-sand">Link de indicação</h2>
        {summary.referralUrl ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 rounded-xl border border-[color:var(--app-border)] bg-black/20 px-3 py-2 text-sm">
                {summary.referralUrl}
              </code>
              <button type="button" className="admin-secondary-button" onClick={() => void copyLink()}>
                <Copy size={16} />
                Copiar
              </button>
            </div>
            {copyFeedback && <p className="text-sm text-emerald-400">{copyFeedback}</p>}
            <p className="text-sm text-sand-muted">
              {summary.referralLink?.clickCount ?? 0} cliques · {summary.referralLink?.signupCount ?? 0} cadastros ·{" "}
              {summary.activeReferrals} alunos ativos na sua base
            </p>
          </div>
        ) : (
          <p className="text-sm text-sand-muted">Seu link de afiliado será gerado automaticamente.</p>
        )}
      </article>

      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 text-lg font-bold text-sand">Solicitar saque</h2>
        <div className="grid max-w-xl gap-3">
          <label className="grid gap-1 text-sm">
            Chave PIX
            <input
              className="admin-input"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="E-mail, CPF, telefone ou chave aleatória"
            />
          </label>
          <button
            type="button"
            className="admin-secondary-button w-fit"
            disabled={busy || pixKey.trim().length < 5}
            onClick={() =>
              void onBusy(async () => {
                await apiPut("/coach/affiliate/pix", { pixKey: pixKey.trim() }, token);
                await load();
              }, "Chave PIX salva.")
            }
          >
            Salvar PIX
          </button>
          <label className="grid gap-1 text-sm">
            Valor do saque (R$)
            <input
              className="admin-input"
              inputMode="decimal"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={`Mínimo ${formatPriceInBRL(COACH_MIN_WITHDRAWAL_CENTS)}`}
            />
          </label>
          <button
            type="button"
            className="admin-primary-button w-fit"
            disabled={busy}
            onClick={() =>
              void onBusy(async () => {
                const normalized = withdrawAmount.replace(",", ".").trim();
                const parsed = Math.round(Number.parseFloat(normalized) * 100);
                if (!Number.isFinite(parsed) || parsed < COACH_MIN_WITHDRAWAL_CENTS) {
                  throw new Error(`Saque mínimo: ${formatPriceInBRL(COACH_MIN_WITHDRAWAL_CENTS)}.`);
                }
                await apiPost("/coach/affiliate/withdrawals", { amountInCents: parsed }, token);
                setWithdrawAmount("");
                await load();
              }, "Solicitação de saque enviada.")
            }
          >
            Solicitar saque
          </button>
        </div>
      </article>

      <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
        <h2 className="mb-4 text-lg font-bold text-sand">Extrato de comissões</h2>
        {summary.commissions.length === 0 ? (
          <p className="text-sm text-sand-muted">Nenhuma comissão registrada ainda.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {summary.commissions.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                <strong>{formatPriceInBRL(item.amountInCents)}</strong>
                <span className="block text-xs text-sand-muted">
                  {item.athlete.name} · {item.status} · {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {summary.withdrawals.length > 0 && (
        <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
          <h2 className="mb-4 text-lg font-bold text-sand">Saques</h2>
          <ul className="grid gap-2 text-sm">
            {summary.withdrawals.map((item) => (
              <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                <strong>{formatPriceInBRL(item.amountInCents)}</strong>
                <span className="block text-xs text-sand-muted">
                  {item.status} · {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
