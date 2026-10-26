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
      <p className="coach-empty">
        <Loader2 className="inline animate-spin mr-2" size={18} />
        Carregando receitas...
      </p>
    );
  }

  if (!summary) {
    return <p className="coach-alert coach-alert--error">{panelError ?? "Não foi possível carregar receitas."}</p>;
  }

  const wallet = summary.wallet;
  const commissionActive = summary.isActiveCoach !== false;

  return (
    <section className="coach-panel-body">
      {summary.eligibilityMessage ? (
        <p className="coach-alert" style={{ borderColor: "rgba(245, 158, 11, 0.35)", background: "rgba(245, 158, 11, 0.12)" }}>
          {summary.eligibilityMessage}
        </p>
      ) : null}
      <article className="coach-section coach-section--wide">
        <div className="coach-section__head">
          <h2 className="coach-section__title">
            <Wallet size={20} />
            Receitas de afiliado
          </h2>
          <p className="coach-section__subtitle">
            Comissão de {summary.commissionRateLabel} sobre cada pagamento confirmado de alunos indicados, enquanto
            estiverem ativos na plataforma.
          </p>
        </div>
        <div className="coach-kpi-grid">
          <article className="coach-kpi coach-kpi--nutrition">
            <p className="coach-kpi__label">Disponível</p>
            <strong className="coach-kpi__value text-emerald-500">{formatPriceInBRL(wallet.availableInCents)}</strong>
          </article>
          <article className="coach-kpi coach-kpi--programs">
            <p className="coach-kpi__label">Pendente</p>
            <strong className="coach-kpi__value">{formatPriceInBRL(wallet.pendingInCents)}</strong>
            <span className="block text-xs text-sand-muted mt-1">Carência {summary.holdingDays} dias</span>
          </article>
          <article className="coach-kpi coach-kpi--classes">
            <p className="coach-kpi__label">Em saque</p>
            <strong className="coach-kpi__value">{formatPriceInBRL(wallet.lockedInCents)}</strong>
          </article>
          <article className="coach-kpi coach-kpi--athletes">
            <p className="coach-kpi__label">Já sacado</p>
            <strong className="coach-kpi__value">{formatPriceInBRL(wallet.withdrawnInCents)}</strong>
          </article>
        </div>
      </article>

      <article className="coach-section">
        <div className="coach-section__head">
          <h2 className="coach-section__title">Indicação</h2>
        </div>
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

      <article className="coach-section">
        <div className="coach-section__head">
          <h2 className="coach-section__title">Solicitar saque</h2>
        </div>
        <div className="coach-form-stack max-w-xl">
          <label>
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
          <label>
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

      <article className="coach-section">
        <div className="coach-section__head">
          <h2 className="coach-section__title">Extrato de comissões</h2>
        </div>
        {summary.commissions.length === 0 ? (
          <p className="coach-empty">Nenhuma comissão registrada ainda.</p>
        ) : (
          <ul className="coach-list">
            {summary.commissions.map((item) => (
              <li key={item.id} className="coach-list-item">
                <strong>{formatPriceInBRL(item.amountInCents)}</strong>
                <span>
                  {item.athlete.name} · {item.status} · {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {summary.withdrawals.length > 0 && (
        <article className="coach-section">
          <div className="coach-section__head">
            <h2 className="coach-section__title">Saques</h2>
          </div>
          <ul className="coach-list">
            {summary.withdrawals.map((item) => (
              <li key={item.id} className="coach-list-item">
                <strong>{formatPriceInBRL(item.amountInCents)}</strong>
                <span>
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
