import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Wallet } from "lucide-react";
import {
  formatPriceInBRL,
  COACH_MIN_WITHDRAWAL_CENTS,
  formatReferralCodeForDisplay
} from "@app-treino/shared";
import { apiGet, apiPost, apiPut } from "../../api";

type AffiliateSummary = {
  commissionRateLabel: string;
  minWithdrawalInCents: number;
  holdingDays: number;
  hasCoachRole?: boolean;
  hasActiveSubscription?: boolean;
  isActiveCoach?: boolean;
  eligibilityMessage?: string | null;
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
};

export function CoachRevenuePanel({ token, busy, onBusy }: Props) {
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPanelError(null);
    try {
      const data = await apiGet<AffiliateSummary>("/coach/affiliate/summary", token);
      setSummary(data);
      setPixKey(data.wallet.pixKey ?? "");
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Falha ao carregar receitas.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const referralCode = summary?.referralLink?.slug
    ? formatReferralCodeForDisplay(summary.referralLink.slug)
    : null;

  const copyLink = async () => {
    const target = summary?.referralUrl;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setCopyFeedback("Link copiado.");
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch {
      setCopyFeedback("Não foi possível copiar.");
    }
  };

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopyFeedback("Código copiado.");
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

  if (!summary) {
    return (
      <div className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5 text-sm text-red-400">
        {panelError ?? "Não foi possível carregar receitas."}
      </div>
    );
  }

  const wallet = summary.wallet;
  const commissionActive = summary.isActiveCoach !== false;

  return (
    <section className="grid gap-6">
      {summary.eligibilityMessage ? (
        <article className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {summary.eligibilityMessage}
        </article>
      ) : null}
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
        <h2 className="mb-4 text-lg font-bold text-sand">Indicação</h2>
        {summary.referralUrl && referralCode ? (
          <div className="grid gap-4">
            <p className="text-sm text-sand-muted">
              Seu código exclusivo não revela nome ou box. Compartilhe o link ou o código com quem quiser indicar.
            </p>

            <div className="grid max-w-xl gap-2">
              <span className="text-xs uppercase tracking-wide text-sand-muted">Código de indicação</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-xl border border-[color:var(--app-border)] bg-black/20 px-4 py-2 text-lg font-semibold tracking-widest">
                  {referralCode}
                </code>
                <button type="button" className="admin-secondary-button" onClick={() => void copyCode()}>
                  <Copy size={16} />
                  Copiar código
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-xs uppercase tracking-wide text-sand-muted">Link de cadastro</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 rounded-xl border border-[color:var(--app-border)] bg-black/20 px-3 py-2 text-sm break-all">
                  {summary.referralUrl}
                </code>
                <button type="button" className="admin-secondary-button" onClick={() => void copyLink()}>
                  <Copy size={16} />
                  Copiar link
                </button>
              </div>
            </div>

            {copyFeedback && <p className="text-sm text-emerald-400">{copyFeedback}</p>}

            <p className="text-sm text-sand-muted">
              {summary.referralLink?.clickCount ?? 0} cliques · {summary.referralLink?.signupCount ?? 0} cadastros ·{" "}
              {summary.activeReferrals} alunos ativos na sua base
            </p>
          </div>
        ) : (
          <p className="text-sm text-sand-muted">Seu código de indicação será gerado automaticamente.</p>
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
            disabled={busy || !commissionActive || pixKey.trim().length < 5}
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
            disabled={busy || !commissionActive}
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
