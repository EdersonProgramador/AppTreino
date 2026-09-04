import { ArrowRight, Check, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { brand } from "../../lib/brand";
import { heroTrustItems } from "../../lib/home-content";
import {
  formatPlanPriceLines,
  getCheckoutMinimumAmountMessage,
  getEffectivePriceCents,
  isCheckoutEligiblePlan,
  planHasPromoDiscount,
  type CatalogPlan
} from "../../lib/plan-catalog";
import { NativeCheckoutPayment, type NativeBillingType } from "./NativeCheckoutPayment";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow } from "../../types/shared";

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
  pendingPayment?: PaymentRow | null;
  nativeCheckout?: NativeCheckoutPayload | null;
  checkoutToken?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerDocument?: string | null;
  error?: string | null;
  onContinuePlan?: () => void;
  onPrepareCheckout?: (input?: { cpfCnpj?: string }) => void;
  onCheckoutSessionResponse?: (response: CheckoutSessionResponse) => void;
  onPaymentConfirmed?: () => void;
  onCheckoutError?: (message: string) => void;
  onConfirmSandbox?: () => void;
  showSandbox?: boolean;
  showPaymentStep?: boolean;
  accountSlot?: ReactNode;
  couponCode?: string | null;
  /** Cupom da URL/intent ainda em validação ou aguardando plano compatível. */
  stagedCouponCode?: string | null;
  couponDraft?: string;
  onCouponDraftChange?: (value: string) => void;
  onApplyCoupon?: () => void;
  onRemoveCoupon?: () => void;
  couponFeedback?: string | null;
  couponApplying?: boolean;
  couponValidForSelection?: boolean | null;
  selectedPlanHasDiscount?: boolean;
};

const STEPS = [
  { id: 1, label: "Plano" },
  { id: 2, label: "Conta" },
  { id: 3, label: "Pagamento" }
] as const;

function toNativeBillingType(value: BillingType): NativeBillingType | null {
  if (value === "CREDIT_CARD") return "CREDIT_CARD";
  if (value === "PIX") return "PIX";
  return null;
}

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
  const hasPromoPrice = Boolean(priceLines.anchor);

  return (
    <button
      type="button"
      className={`activate-plan-card${featured ? " is-featured" : ""}${selected ? " is-selected" : ""}${minimumMessage ? " is-below-minimum" : ""}${hasPromoPrice ? " has-promo-price" : ""}`}
      onClick={onSelect}
    >
      {plan.badgeLabel ? <span className="activate-plan-card__badge">{plan.badgeLabel}</span> : null}
      <div className="activate-plan-card__head">
        <strong>{plan.name}</strong>
        {plan.description ? <span>{plan.description}</span> : null}
      </div>
      <div className="activate-plan-card__price">
        {priceLines.anchor ? <span className="activate-plan-card__anchor">{priceLines.anchor}</span> : null}
        <div className="activate-plan-card__price-main">
          <span className="activate-plan-card__amount">{priceLines.primary}</span>
          <span className="activate-plan-card__cycle">{priceLines.secondary}</span>
        </div>
        {priceLines.discountLabel ? <span className="activate-plan-card__discount">{priceLines.discountLabel}</span> : null}
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
  nativeCheckout = null,
  checkoutToken,
  payerName,
  payerEmail,
  payerPhone,
  payerDocument,
  error,
  onContinuePlan,
  onPrepareCheckout,
  onCheckoutSessionResponse,
  onPaymentConfirmed,
  onCheckoutError,
  onConfirmSandbox,
  showSandbox,
  showPaymentStep = false,
  accountSlot,
  couponCode,
  stagedCouponCode = null,
  couponDraft = "",
  onCouponDraftChange,
  onApplyCoupon,
  onRemoveCoupon,
  couponFeedback,
  couponApplying = false,
  couponValidForSelection = false,
  selectedPlanHasDiscount = false
}: SubscriptionFunnelPanelProps) {
  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) ?? plans[0] ?? null;
  const selectedPlanCheckoutError = selectedPlan ? getCheckoutMinimumAmountMessage(selectedPlan) : null;
  const canCheckoutSelectedPlan = selectedPlan ? isCheckoutEligiblePlan(selectedPlan) : false;
  const couponBlocksCheckout = Boolean(stagedCouponCode) && couponValidForSelection === null;
  const resolvedSelectedPlanHasDiscount = selectedPlanHasDiscount || planHasPromoDiscount(selectedPlan);
  const nativeBillingType = toNativeBillingType(billingType);
  const visibleCouponCode = couponCode ?? (couponValidForSelection === null ? stagedCouponCode : null);
  const showAppliedCouponRow = Boolean(
    (couponCode && resolvedSelectedPlanHasDiscount) ||
      (stagedCouponCode && couponValidForSelection === null)
  );

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
              {showAppliedCouponRow && visibleCouponCode ? (
                <div className="activate-coupon-applied-row">
                  <span className="activate-coupon-applied">
                    Cupom <strong>{visibleCouponCode}</strong> {couponApplying ? "validando…" : "aplicado"}
                  </span>
                  {onRemoveCoupon ? (
                    <button type="button" className="activate-coupon-apply" onClick={onRemoveCoupon}>
                      Remover
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="activate-coupon-field">
                  <span className="activate-coupon-field__hint">Tem um cupom?</span>
                  <div className="activate-coupon-field__row">
                    <input
                      value={couponDraft}
                      onChange={(event) => onCouponDraftChange(event.target.value.toUpperCase())}
                      placeholder="Código"
                      autoComplete="off"
                      aria-label="Código do cupom"
                      disabled={couponApplying}
                    />
                    <button
                      type="button"
                      className="activate-coupon-apply"
                      onClick={onApplyCoupon}
                      disabled={couponApplying || !couponDraft.trim()}
                    >
                      {couponApplying ? "…" : "Aplicar"}
                    </button>
                  </div>
                </div>
              )}
              {couponFeedback ? (
                <p className={`activate-coupon-feedback${couponFeedback.includes("inválido") ? " is-error" : ""}`}>
                  {couponFeedback}
                </p>
              ) : null}
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

      {showPaymentStep && step === 3 && selectedPlan && checkoutToken ? (
        <section className="activate-payment-stage">
          <header className="activate-plan-stage__head">
            <span className="home-telemetry-label">Passo 3</span>
            <h2 className="activate-plan-stage__title">Finalize sua ativação</h2>
            <p className="activate-plan-stage__copy">Pagamento 100% {brand.name} · Pix ou cartão de crédito na mesma tela.</p>
          </header>

          <NativeCheckoutPayment
            token={checkoutToken}
            planName={selectedPlan.name}
            amountInCents={pendingPayment?.amountInCents ?? getEffectivePriceCents(selectedPlan)}
            billingCycle={selectedPlan.billingCycle}
            payment={pendingPayment ?? null}
            nativeCheckout={nativeCheckout}
            billingType={nativeBillingType}
            onBillingTypeChange={(value) => onBillingTypeChange(value)}
            loading={Boolean(checkoutLoading)}
            prepareDisabled={!canCheckoutSelectedPlan || couponBlocksCheckout}
            defaultEmail={payerEmail}
            defaultPhone={payerPhone}
            defaultName={payerName}
            defaultDocument={payerDocument}
            onPrepareCheckout={onPrepareCheckout}
            onSessionResponse={(response) => onCheckoutSessionResponse?.(response)}
            onPaymentConfirmed={() => onPaymentConfirmed?.()}
            onError={(message) => onCheckoutError?.(message)}
          />

          {couponBlocksCheckout ? (
            <p className="activate-coupon-feedback">Aguarde a validação do cupom para gerar o pagamento.</p>
          ) : null}

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
        <strong>Garantia {brand.name} · 7 dias</strong>
        <span>Experimente na sua rotina. Cancele conforme as condições se não fizer sentido.</span>
      </div>

      <div className="activate-funnel-ai-note">
        <Sparkles size={16} />
        <span>Inclui {brand.aiCoach} · treinos, corrida e performance em um único sistema.</span>
      </div>
    </div>
  );
}
