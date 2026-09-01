import { ArrowRight, Check, CreditCard, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { brand } from "../../lib/brand";
import { heroTrustItems } from "../../lib/home-content";
import { formatPlanPriceLines, getCheckoutMinimumAmountMessage, getEffectivePriceCents, isCheckoutEligiblePlan, type CatalogPlan } from "../../lib/plan-catalog";

export type BillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

type SubscriptionFunnelPanelProps = {
  step: 1 | 2 | 3;
  plans: CatalogPlan[];
  plansLoading?: boolean;
  monthlyBaseline?: CatalogPlan | null;
  selectedPlanCode: string;
  onSelectPlan: (code: string) => void;
  billingType: BillingType;
  onBillingTypeChange: (value: BillingType) => void;
  checkoutLoading?: boolean;
  pendingPayment?: { amountInCents: number; paymentUrl?: string | null } | null;
  error?: string | null;
  onContinuePlan?: () => void;
  onSubmitCheckout?: () => void;
  onOpenPendingCheckout?: (url: string) => void;
  onConfirmSandbox?: () => void;
  showSandbox?: boolean;
  showPaymentStep?: boolean;
  accountSlot?: ReactNode;
  couponCode?: string | null;
  couponDraft?: string;
  onCouponDraftChange?: (value: string) => void;
  onApplyCoupon?: () => void;
  couponFeedback?: string | null;
};

const STEPS = [
  { id: 1, label: "Plano" },
  { id: 2, label: "Conta" },
  { id: 3, label: "Pagamento" }
] as const;

function PlanCard({
  plan,
  monthlyBaseline,
  selected,
  onSelect
}: {
  plan: CatalogPlan;
  monthlyBaseline: CatalogPlan | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const priceLines = formatPlanPriceLines(plan, monthlyBaseline);
  const benefits = plan.cardBenefits.length > 0 ? plan.cardBenefits : ["Acesso completo ao ecossistema ATLLY"];
  const featured = plan.isFeatured || Boolean(plan.badgeLabel);
  const minimumMessage = getCheckoutMinimumAmountMessage(plan);

  return (
    <button
      type="button"
      className={`activate-plan-card${featured ? " is-featured" : ""}${selected ? " is-selected" : ""}${minimumMessage ? " is-below-minimum" : ""}`}
      onClick={onSelect}
    >
      {plan.badgeLabel ? <span className="activate-plan-card__badge">{plan.badgeLabel}</span> : null}
      <div className="activate-plan-card__head">
        <strong>{plan.name}</strong>
        {plan.description ? <span>{plan.description}</span> : null}
      </div>
      <div className="activate-plan-card__price">
        {plan.couponCode && (plan.discountInCents ?? 0) > 0 ? (
          <span className="activate-plan-card__coupon">Cupom {plan.couponCode}</span>
        ) : null}
        {priceLines.anchor ? <span className="activate-plan-card__anchor">{priceLines.anchor}</span> : null}
        {priceLines.discountLabel ? <span className="activate-plan-card__discount">{priceLines.discountLabel}</span> : null}
        <span className="activate-plan-card__amount">{priceLines.primary}</span>
        <span className="activate-plan-card__cycle">{priceLines.secondary}</span>
        {minimumMessage ? <span className="activate-plan-card__minimum">{minimumMessage}</span> : null}
      </div>
      <ul className="activate-plan-perks">
        {benefits.map((perk) => (
          <li key={perk}>
            <Check size={14} />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function SubscriptionFunnelPanel({
  step,
  plans,
  plansLoading,
  monthlyBaseline = null,
  selectedPlanCode,
  onSelectPlan,
  billingType,
  onBillingTypeChange,
  checkoutLoading,
  pendingPayment,
  error,
  onContinuePlan,
  onSubmitCheckout,
  onOpenPendingCheckout,
  onConfirmSandbox,
  showSandbox,
  showPaymentStep = false,
  accountSlot,
  couponCode,
  couponDraft = "",
  onCouponDraftChange,
  onApplyCoupon,
  couponFeedback
}: SubscriptionFunnelPanelProps) {
  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) ?? plans[0] ?? null;
  const selectedPlanCheckoutError = selectedPlan ? getCheckoutMinimumAmountMessage(selectedPlan) : null;
  const canCheckoutSelectedPlan = selectedPlan ? isCheckoutEligiblePlan(selectedPlan) : false;

  return (
    <div className="activate-funnel-panel">
      <div className="activate-funnel-steps" aria-label="Progresso da ativação">
        {STEPS.map((item) => (
          <div
            key={item.id}
            className={`activate-funnel-step${step >= item.id ? " is-active" : ""}${step === item.id ? " is-current" : ""}`}
          >
            <span className="activate-funnel-step__dot">{item.id}</span>
            <span className="activate-funnel-step__label">{item.label}</span>
          </div>
        ))}
      </div>

      {error ? <div className="activate-funnel-error">{error}</div> : null}

      {(step === 1 || showPaymentStep) && (
        <section className="activate-plan-stage">
          <header className="activate-plan-stage__head">
            <span className="home-telemetry-label">{brand.areaEyebrow}</span>
            <h2 className="activate-plan-stage__title">Escolha seu plano</h2>
            <p className="activate-plan-stage__copy">Acesso imediato após confirmação do pagamento.</p>
          </header>

          {plansLoading && plans.length === 0 ? (
            <p className="activate-plan-loading">Carregando planos…</p>
          ) : plans.length > 0 ? (
            <div className="activate-plan-grid">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  monthlyBaseline={monthlyBaseline ?? null}
                  selected={selectedPlanCode === plan.code}
                  onSelect={() => onSelectPlan(plan.code)}
                />
              ))}
            </div>
          ) : (
            <p className="activate-plan-loading">Nenhum plano disponível no momento.</p>
          )}

          {(step === 1 || showPaymentStep) && onApplyCoupon && onCouponDraftChange ? (
            <div className="activate-coupon-box">
              <div className="activate-coupon-field">
                <span className="activate-coupon-field__hint">Tem um cupom?</span>
                <div className="activate-coupon-field__row">
                  <input
                    value={couponDraft}
                    onChange={(event) => onCouponDraftChange(event.target.value.toUpperCase())}
                    placeholder="Código"
                    autoComplete="off"
                    aria-label="Código do cupom"
                  />
                  <button type="button" className="activate-coupon-apply" onClick={onApplyCoupon}>
                    Aplicar
                  </button>
                </div>
              </div>
              {couponFeedback ? <p className="activate-coupon-feedback">{couponFeedback}</p> : null}
            </div>
          ) : null}

          {step === 1 && onContinuePlan ? (
            <>
              {selectedPlanCheckoutError ? <p className="activate-coupon-feedback is-error">{selectedPlanCheckoutError}</p> : null}
              <button
                type="button"
                className="ui-btn-primary activate-funnel-cta"
                onClick={onContinuePlan}
                disabled={!selectedPlan || !canCheckoutSelectedPlan}
              >
                Ativar agora
                <ArrowRight size={18} />
              </button>
            </>
          ) : null}
        </section>
      )}

      {step === 2 && accountSlot ? (
        <section className="activate-account-stage">
          <header className="activate-plan-stage__head">
            <span className="home-telemetry-label">Passo 2</span>
            <h2 className="activate-plan-stage__title">Crie sua conta ou entre</h2>
            <p className="activate-plan-stage__copy">
              Plano selecionado:{" "}
              <strong>
                {selectedPlan
                  ? `${selectedPlan.name} · ${formatPriceInBRL(getEffectivePriceCents(selectedPlan))}`
                  : "—"}
              </strong>
            </p>
          </header>
          {accountSlot}
        </section>
      ) : null}

      {showPaymentStep && step === 3 ? (
        <section className="activate-payment-stage">
          <header className="activate-plan-stage__head">
            <span className="home-telemetry-label">Passo 3</span>
            <h2 className="activate-plan-stage__title">Finalize sua ativação</h2>
            <p className="activate-plan-stage__copy">Pagamento seguro via Asaas · Pix ou cartão.</p>
          </header>

          {pendingPayment ? (
            <div className="activate-pending-payment">
              <strong>Pagamento pendente · {formatPriceInBRL(pendingPayment.amountInCents)}</strong>
              <span>Conclua no checkout seguro para liberar o acesso.</span>
              {pendingPayment.paymentUrl && onOpenPendingCheckout ? (
                <button type="button" className="ui-btn-primary" onClick={() => onOpenPendingCheckout(pendingPayment.paymentUrl as string)}>
                  Continuar pagamento
                  <ArrowRight size={18} />
                </button>
              ) : null}
            </div>
          ) : selectedPlan ? (
            <div className="activate-pending-payment">
              <strong>
                {selectedPlan.name} · {formatPriceInBRL(getEffectivePriceCents(selectedPlan))}
              </strong>
              <span>Confirme abaixo para gerar o pagamento deste plano.</span>
              <span className="activate-plan-stage__copy">Alterou plano ou cupom? Gere um checkout novo em Ativar agora.</span>
            </div>
          ) : null}

          <label className="activate-billing-field">
            <span>Forma de pagamento</span>
            <select value={billingType} onChange={(event) => onBillingTypeChange(event.target.value as BillingType)}>
              <option value="UNDEFINED">Escolher no checkout</option>
              <option value="PIX">Pix</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
            </select>
          </label>

          <button
            type="button"
            className="ui-btn-primary activate-funnel-cta"
            onClick={onSubmitCheckout}
            disabled={Boolean(checkoutLoading) || !canCheckoutSelectedPlan}
          >
            {checkoutLoading ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
            Ativar agora
          </button>

          {showSandbox && onConfirmSandbox ? (
            <button type="button" className="ui-btn-secondary activate-funnel-secondary" onClick={onConfirmSandbox} disabled={Boolean(checkoutLoading)}>
              Finalizar sandbox (dev)
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="activate-funnel-trust">
        {heroTrustItems.slice(0, 3).map((item) => (
          <span key={item}>
            <Check size={12} />
            {item}
          </span>
        ))}
      </div>

      <div className="activate-funnel-guarantee">
        <ShieldCheck size={18} />
        <div>
          <strong>Garantia ATLLY · 7 dias</strong>
          <span>Experimente na sua rotina. Cancele conforme as condições se não fizer sentido.</span>
        </div>
      </div>

      <div className="activate-funnel-ai-note">
        <Sparkles size={16} />
        <span>Inclui {brand.aiCoach} · treinos, corrida e performance em um único sistema.</span>
      </div>
    </div>
  );
}
