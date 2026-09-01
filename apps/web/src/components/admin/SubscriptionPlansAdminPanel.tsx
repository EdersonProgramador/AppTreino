import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, Save, Tag, Trash2, X } from "lucide-react";
import { formatPriceInBRL, parseBRLMoneyToCents, buildPlanPromoCouponCode, resolvePlanPromoDiscount } from "@app-treino/shared";
import type { PlanPromoDiscountMode } from "@app-treino/shared";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "../../api";
import { formatBenefitsInput, parseBenefitsInput } from "../../lib/plan-catalog";
import type { CouponRow, PlanRow } from "../../types/shared";
import {
  crudFormClass,
  dataRowClass,
  deleteActionButtonClass,
  panelTitleClass
} from "../../lib/admin-cms-classes";

type Props = {
  token: string;
  plans: PlanRow[];
  onChanged: (message?: string) => Promise<void>;
  onDelete: (id: string, name: string) => void;
};

type PlanDraft = {
  code: string;
  name: string;
  price: string;
  billingCycle: PlanRow["billingCycle"];
  description: string;
  benefits: string;
  badgeLabel: string;
  isFeatured: boolean;
  sortOrder: string;
  showOnFunnel: boolean;
  couponId: string;
};

type CouponDraft = {
  code: string;
  description: string;
  mode: PlanPromoDiscountMode;
  value: string;
  minOrder: string;
  maxUses: string;
};

type PlanPromoDraft = {
  mode: PlanPromoDiscountMode;
  value: string;
};

function emptyCouponDraft(): CouponDraft {
  return {
    code: "",
    description: "",
    mode: "PERCENT",
    value: "",
    minOrder: "",
    maxUses: ""
  };
}

function emptyPlanPromoDraft(): PlanPromoDraft {
  return { mode: "PERCENT", value: "" };
}

function emptyDraft(): PlanDraft {
  return {
    code: "",
    name: "",
    price: "",
    billingCycle: "MONTHLY",
    description: "",
    benefits: "",
    badgeLabel: "",
    isFeatured: false,
    sortOrder: "0",
    showOnFunnel: true,
    couponId: ""
  };
}

function draftFromPlan(plan: PlanRow): PlanDraft {
  return {
    code: plan.code,
    name: plan.name,
    price: formatPriceInBRL(plan.priceInCents).replace(/^R\$\s?/, ""),
    billingCycle: plan.billingCycle,
    description: plan.description ?? "",
    benefits: formatBenefitsInput(plan.cardBenefits),
    badgeLabel: plan.badgeLabel ?? "",
    isFeatured: Boolean(plan.isFeatured),
    sortOrder: String(plan.sortOrder ?? 0),
    showOnFunnel: plan.showOnFunnel !== false,
    couponId: plan.couponId ?? ""
  };
}

function buildPayload(draft: PlanDraft) {
  const priceInCents = parseBRLMoneyToCents(draft.price);
  if (priceInCents == null || priceInCents < 1) {
    throw new Error("Informe um valor válido (ex.: 29,90).");
  }

  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    priceInCents,
    billingCycle: draft.billingCycle,
    description: draft.description.trim() || null,
    cardBenefits: parseBenefitsInput(draft.benefits),
    badgeLabel: draft.badgeLabel.trim() || null,
    isFeatured: draft.isFeatured,
    sortOrder: Number.parseInt(draft.sortOrder, 10) || 0,
    showOnFunnel: draft.showOnFunnel,
    couponId: draft.couponId.trim() || null
  };
}

function formatCouponValue(coupon: CouponRow) {
  if (coupon.percentOff) return `${coupon.percentOff}% off`;
  if (coupon.amountOffCents) return `${formatPriceInBRL(coupon.amountOffCents)} off`;
  return "—";
}

function buildStandaloneCouponPayload(draft: CouponDraft) {
  const minOrderCents = draft.minOrder.trim() ? parseBRLMoneyToCents(draft.minOrder) ?? 0 : 0;
  const maxUses = draft.maxUses.trim() ? Number.parseInt(draft.maxUses, 10) : null;
  const referencePriceInCents = minOrderCents > 0 ? minOrderCents : null;

  if (!draft.code.trim()) {
    throw new Error("Informe o código promocional.");
  }

  let resolved;
  if (draft.mode === "PERCENT") {
    const percentOff = Number.parseInt(draft.value, 10);
    if (!referencePriceInCents) {
      throw new Error("Informe o valor base (pedido mínimo) para calcular desconto percentual.");
    }
    resolved = resolvePlanPromoDiscount({
      planPriceInCents: referencePriceInCents,
      mode: "PERCENT",
      percentOff
    });
  } else if (draft.mode === "AMOUNT_OFF") {
    const amountOffCents = parseBRLMoneyToCents(draft.value);
    if (!referencePriceInCents) {
      throw new Error("Informe o valor base (pedido mínimo) para validar o desconto.");
    }
    resolved = resolvePlanPromoDiscount({
      planPriceInCents: referencePriceInCents,
      mode: "AMOUNT_OFF",
      amountOffCents
    });
  } else {
    const targetPriceInCents = parseBRLMoneyToCents(draft.value);
    if (!referencePriceInCents) {
      throw new Error("Informe o valor base (pedido mínimo) para definir o preço promocional.");
    }
    resolved = resolvePlanPromoDiscount({
      planPriceInCents: referencePriceInCents,
      mode: "TARGET_PRICE",
      targetPriceInCents
    });
  }

  return {
    code: draft.code.trim(),
    description: draft.description.trim() || null,
    ...(resolved.percentOff != null ? { percentOff: resolved.percentOff } : {}),
    ...(resolved.amountOffCents != null ? { amountOffCents: resolved.amountOffCents } : {}),
    minOrderCents: resolved.minOrderCents,
    ...(maxUses != null ? { maxUses } : {})
  };
}

function buildPlanPromoApiBody(promoDraft: PlanPromoDraft, planDraft: PlanDraft) {
  const planPriceInCents = parseBRLMoneyToCents(planDraft.price);
  if (planPriceInCents == null || planPriceInCents < 1) {
    throw new Error("Informe o valor do plano antes de aplicar a promo.");
  }
  if (!planDraft.code.trim()) {
    throw new Error("Informe o slug do plano antes de aplicar a promo.");
  }

  if (promoDraft.mode === "PERCENT") {
    return {
      mode: promoDraft.mode,
      planCode: planDraft.code.trim(),
      planPriceInCents,
      percentOff: Number.parseInt(promoDraft.value, 10)
    };
  }

  if (promoDraft.mode === "AMOUNT_OFF") {
    return {
      mode: promoDraft.mode,
      planCode: planDraft.code.trim(),
      planPriceInCents,
      amountOffCents: parseBRLMoneyToCents(promoDraft.value)
    };
  }

  return {
    mode: promoDraft.mode,
    planCode: planDraft.code.trim(),
    planPriceInCents,
    targetPriceInCents: parseBRLMoneyToCents(promoDraft.value)
  };
}

function previewPlanPromo(promoDraft: PlanPromoDraft, planDraft: PlanDraft) {
  const planPriceInCents = parseBRLMoneyToCents(planDraft.price);
  if (planPriceInCents == null || planPriceInCents < 1 || !promoDraft.value.trim()) {
    return null;
  }

  try {
    if (promoDraft.mode === "PERCENT") {
      return resolvePlanPromoDiscount({
        planPriceInCents,
        mode: "PERCENT",
        percentOff: Number.parseInt(promoDraft.value, 10)
      });
    }
    if (promoDraft.mode === "AMOUNT_OFF") {
      return resolvePlanPromoDiscount({
        planPriceInCents,
        mode: "AMOUNT_OFF",
        amountOffCents: parseBRLMoneyToCents(promoDraft.value)
      });
    }
    return resolvePlanPromoDiscount({
      planPriceInCents,
      mode: "TARGET_PRICE",
      targetPriceInCents: parseBRLMoneyToCents(promoDraft.value)
    });
  } catch {
    return null;
  }
}

function promoModeLabel(mode: PlanPromoDiscountMode) {
  if (mode === "PERCENT") return "Desconto %";
  if (mode === "AMOUNT_OFF") return "Menos R$";
  return "Preço promocional";
}

function promoValueLabel(mode: PlanPromoDiscountMode) {
  if (mode === "PERCENT") return "Desconto (%)";
  if (mode === "AMOUNT_OFF") return "Valor a descontar (R$)";
  return "Preço final com promo (R$)";
}

function promoValuePlaceholder(mode: PlanPromoDiscountMode) {
  if (mode === "PERCENT") return "10";
  if (mode === "AMOUNT_OFF") return "2,00";
  return "4,50";
}

function couponErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Não foi possível criar o cupom.";
}

function PromoModePicker({
  mode,
  onChange
}: {
  mode: PlanPromoDiscountMode;
  onChange: (mode: PlanPromoDiscountMode) => void;
}) {
  const modes: PlanPromoDiscountMode[] = ["PERCENT", "AMOUNT_OFF", "TARGET_PRICE"];
  return (
    <div className="finance-promo-mode" role="group" aria-label="Tipo de desconto">
      {modes.map((item) => (
        <button
          key={item}
          type="button"
          className={mode === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {promoModeLabel(item)}
        </button>
      ))}
    </div>
  );
}

function InlinePlanCouponForm({
  planDraft,
  promoDraft,
  onPromoDraftChange,
  onSubmit,
  submitting,
  feedback,
  linkedCouponCode
}: {
  planDraft: PlanDraft;
  promoDraft: PlanPromoDraft;
  onPromoDraftChange: (next: PlanPromoDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
  feedback: string | null;
  linkedCouponCode?: string | null;
}) {
  const promoCode = planDraft.code.trim() ? buildPlanPromoCouponCode(planDraft.code) : "—";
  const preview = previewPlanPromo(promoDraft, planDraft);

  return (
    <div className="finance-inline-coupon finance-form-span">
      <div className="finance-inline-coupon__head">
        <strong>Promo automática deste plano</strong>
        <span className="text-xs text-sand-muted">
          O slug do plano identifica o checkout; o cupom promocional é gerado automaticamente e aplicado no funil.
        </span>
      </div>
      {feedback ? (
        <p className={`text-sm ${feedback.startsWith("Promo") || feedback.startsWith("Cupom") ? "text-emerald-400" : "text-red-400"}`}>
          {feedback}
        </p>
      ) : null}
      <div className={`${crudFormClass} finance-form finance-form--plans finance-inline-coupon__grid`}>
        <div className="finance-form-span finance-promo-code-preview">
          <span className="text-xs text-sand-muted">Slug do plano</span>
          <strong className="finance-mono">{planDraft.code.trim() || "—"}</strong>
          <span className="text-xs text-sand-muted">Código promocional gerado</span>
          <strong className="finance-mono text-emerald-300">{promoCode}</strong>
          {linkedCouponCode && linkedCouponCode !== promoCode ? (
            <span className="text-xs text-amber-300">
              Ao salvar, o cupom vinculado passará a ser <strong className="finance-mono">{promoCode}</strong>.
            </span>
          ) : null}
        </div>

        <div className="finance-form-span">
          <span className="text-xs text-sand-muted">Como descontar</span>
          <PromoModePicker
            mode={promoDraft.mode}
            onChange={(mode) => onPromoDraftChange({ mode, value: "" })}
          />
        </div>

        <label className="finance-form-span">
          {promoValueLabel(promoDraft.mode)}
          <input
            value={promoDraft.value}
            onChange={(event) => onPromoDraftChange({ ...promoDraft, value: event.target.value })}
            type={promoDraft.mode === "PERCENT" ? "number" : "text"}
            inputMode={promoDraft.mode === "PERCENT" ? "numeric" : "decimal"}
            min={promoDraft.mode === "PERCENT" ? 1 : undefined}
            max={promoDraft.mode === "PERCENT" ? 100 : undefined}
            placeholder={promoValuePlaceholder(promoDraft.mode)}
          />
        </label>

        {preview ? (
          <p className="finance-form-span finance-promo-preview">
            Plano {formatPriceInBRL(parseBRLMoneyToCents(planDraft.price) ?? 0)} →{" "}
            <strong>{formatPriceInBRL(preview.finalPriceInCents)}</strong>
            {" "}(desconto {formatPriceInBRL(preview.discountInCents)})
          </p>
        ) : null}

        <button type="button" className="primary-button finance-form-span" disabled={submitting} onClick={onSubmit}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Tag size={18} />}
          Salvar promo e vincular
        </button>
      </div>
    </div>
  );
}

function PlanFormFields({
  draft,
  onChange,
  idPrefix,
  coupons
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  idPrefix: string;
  coupons: CouponRow[];
}) {
  return (
    <>
      <label>
        Slug do plano
        <input
          id={`${idPrefix}-code`}
          value={draft.code}
          onChange={(event) => onChange({ ...draft, code: event.target.value.trim().replace(/\s+/g, "-") })}
          placeholder="start"
          required
        />
        <span className="text-xs text-sand-muted">Identificador técnico do checkout (ex.: start, mensal). Não é o cupom.</span>
      </label>
      <label>
        Nome
        <input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Plano Mensal"
          required
        />
      </label>
      <label>
        Valor (R$)
        <input
          id={`${idPrefix}-price`}
          value={draft.price}
          onChange={(event) => onChange({ ...draft, price: event.target.value })}
          type="text"
          inputMode="decimal"
          placeholder="29,90"
          required
        />
      </label>
      <label>
        Ciclo
        <select
          id={`${idPrefix}-cycle`}
          value={draft.billingCycle}
          onChange={(event) => onChange({ ...draft, billingCycle: event.target.value as PlanRow["billingCycle"] })}
        >
          <option value="MONTHLY">Mensal</option>
          <option value="YEARLY">Anual</option>
        </select>
      </label>
      <label className="finance-form-span">
        Cupom promocional vinculado
        <select
          id={`${idPrefix}-coupon`}
          value={draft.couponId}
          onChange={(event) => onChange({ ...draft, couponId: event.target.value })}
        >
          <option value="">Sem promo automática</option>
          {coupons.map((coupon) => (
            <option key={coupon.id} value={coupon.id}>
              {coupon.code} · {formatCouponValue(coupon)}
            </option>
          ))}
        </select>
        <span className="text-xs text-sand-muted">
          Cupons reutilizáveis. Para promo exclusiva deste plano, use a seção abaixo — o código será{" "}
          <span className="finance-mono">{draft.code.trim() ? buildPlanPromoCouponCode(draft.code) : "SLUG-PROMO"}</span>.
        </span>
      </label>
      <label className="finance-form-span">
        Subtítulo do card
        <input
          id={`${idPrefix}-description`}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="Ex.: Flexível, 12 meses, Promo de lançamento"
        />
      </label>
      <label className="finance-form-span">
        Benefícios do card (um por linha)
        <textarea
          id={`${idPrefix}-benefits`}
          value={draft.benefits}
          onChange={(event) => onChange({ ...draft, benefits: event.target.value })}
          rows={5}
          placeholder={"Treinos com IA\nCorrida GPS\nHistórico completo"}
        />
      </label>
      <label>
        Selo / badge
        <input
          id={`${idPrefix}-badge`}
          value={draft.badgeLabel}
          onChange={(event) => onChange({ ...draft, badgeLabel: event.target.value })}
          placeholder="Melhor valor"
        />
      </label>
      <label>
        Ordem
        <input
          id={`${idPrefix}-sort`}
          value={draft.sortOrder}
          onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })}
          type="number"
          min={0}
          step={1}
        />
      </label>
      <label className="finance-form-check">
        <input
          type="checkbox"
          checked={draft.isFeatured}
          onChange={(event) => onChange({ ...draft, isFeatured: event.target.checked })}
        />
        Destacar no funil
      </label>
      <label className="finance-form-check">
        <input
          type="checkbox"
          checked={draft.showOnFunnel}
          onChange={(event) => onChange({ ...draft, showOnFunnel: event.target.checked })}
        />
        Exibir no funil e landing
      </label>
    </>
  );
}

export function SubscriptionPlansAdminPanel({ token, plans, onChanged, onDelete }: Props) {
  const [createDraft, setCreateDraft] = useState<PlanDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PlanDraft>(emptyDraft);
  const [savingEdit, setSavingEdit] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(emptyCouponDraft);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [inlinePromoDraft, setInlinePromoDraft] = useState<PlanPromoDraft>(emptyPlanPromoDraft());
  const [inlineCouponFeedback, setInlineCouponFeedback] = useState<string | null>(null);
  const [linkingInlineCoupon, setLinkingInlineCoupon] = useState(false);

  async function refreshCoupons() {
    const response = await apiGet<{ coupons: CouponRow[] }>("/admin/subscription-coupons", token);
    setCoupons(response.coupons ?? []);
    return response.coupons ?? [];
  }

  async function createStandaloneSubscriptionCoupon(draft: CouponDraft) {
    const payload = buildStandaloneCouponPayload(draft);
    const response = await apiPost<{ coupon?: CouponRow }>("/admin/subscription-coupons", payload, token);
    if (!response.coupon?.id) {
      throw new Error("A API não retornou o cupom criado. Recarregue a página e tente novamente.");
    }
    await refreshCoupons();
    return response.coupon;
  }

  useEffect(() => {
    void refreshCoupons().catch(() => setCoupons([]));
  }, [token, plans.length]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setFeedback(null);
    try {
      const payload = buildPayload(createDraft);
      await apiPost("/admin/plans", payload, token);
      setCreateDraft(emptyDraft());
      await onChanged("Plano cadastrado com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível cadastrar o plano.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingCoupon(true);
    setCouponFeedback(null);
    try {
      await createStandaloneSubscriptionCoupon(couponDraft);
      setCouponDraft(emptyCouponDraft());
      setCouponFeedback("Cupom promocional criado. Vincule ao plano em “Cupom promocional vinculado”.");
      await onChanged("Cupom de assinatura criado.");
    } catch (error) {
      setCouponFeedback(couponErrorMessage(error));
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleCreateAndLinkCoupon = async (planId: string) => {
    setLinkingInlineCoupon(true);
    setInlineCouponFeedback(null);
    setFeedback(null);
    try {
      const body = buildPlanPromoApiBody(inlinePromoDraft, editDraft);
      const response = await apiPut<{ coupon: CouponRow }>(`/admin/plans/${planId}/promo-coupon`, body, token);
      if (!response.coupon?.id) {
        throw new Error("A API não retornou o cupom promocional.");
      }
      setEditDraft((current) => ({ ...current, couponId: response.coupon.id }));
      setInlinePromoDraft(emptyPlanPromoDraft());
      setInlineCouponFeedback(`Promo ${response.coupon.code} vinculada ao plano.`);
      await refreshCoupons();
      await onChanged(`Promo ${response.coupon.code} vinculada ao plano.`);
    } catch (error) {
      setInlineCouponFeedback(couponErrorMessage(error));
    } finally {
      setLinkingInlineCoupon(false);
    }
  };

  const removeCoupon = async (couponId: string) => {
    setFeedback(null);
    try {
      await apiDelete(`/admin/subscription-coupons/${couponId}`, token);
      await refreshCoupons();
      await onChanged("Cupom removido.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível remover o cupom.");
    }
  };

  const startEdit = (plan: PlanRow) => {
    setEditingId(plan.id);
    setEditDraft(draftFromPlan(plan));
    setFeedback(null);
    setInlinePromoDraft(emptyPlanPromoDraft());
    setInlineCouponFeedback(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft());
    setInlinePromoDraft(emptyPlanPromoDraft());
    setInlineCouponFeedback(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    setFeedback(null);
    try {
      const payload = buildPayload(editDraft);
      await apiPut(`/admin/plans/${editingId}`, payload, token);
      setEditingId(null);
      await onChanged("Plano atualizado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o plano.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <>
      <article className="table-panel finance-panel" id="admin-subscription-coupons">
        <div className={panelTitleClass}>
          <div>
            <h2>Cupons promocionais reutilizáveis</h2>
            <p>Para campanhas em vários planos. No editar plano, a promo exclusiva usa código automático <span className="finance-mono">SLUG-PROMO</span>.</p>
          </div>
          <span>{coupons.length}</span>
        </div>

        {couponFeedback ? (
          <p className={`mb-3 text-sm ${couponFeedback.startsWith("Cupom promocional") ? "text-emerald-400" : "text-red-400"}`}>
            {couponFeedback}
          </p>
        ) : null}

        <form className={`${crudFormClass} finance-form finance-form--plans`} onSubmit={handleCreateCoupon}>
          <label>
            Código promocional
            <input
              value={couponDraft.code}
              onChange={(event) => setCouponDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              placeholder="LANCAMENTO10"
              required
            />
          </label>
          <label>
            Descrição
            <input
              value={couponDraft.description}
              onChange={(event) => setCouponDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Campanha de lançamento"
            />
          </label>
          <label>
            Valor base (R$)
            <input
              value={couponDraft.minOrder}
              onChange={(event) => setCouponDraft((current) => ({ ...current, minOrder: event.target.value }))}
              placeholder="97,00"
            />
            <span className="text-xs text-sand-muted">Preço de referência para validar o desconto (ex.: valor cheio do plano).</span>
          </label>
          <div className="finance-form-span">
            <span className="text-xs text-sand-muted">Tipo de desconto</span>
            <PromoModePicker
              mode={couponDraft.mode}
              onChange={(mode) => setCouponDraft((current) => ({ ...current, mode, value: "" }))}
            />
          </div>
          <label className="finance-form-span">
            {promoValueLabel(couponDraft.mode)}
            <input
              value={couponDraft.value}
              onChange={(event) => setCouponDraft((current) => ({ ...current, value: event.target.value }))}
              type={couponDraft.mode === "PERCENT" ? "number" : "text"}
              inputMode={couponDraft.mode === "PERCENT" ? "numeric" : "decimal"}
              min={couponDraft.mode === "PERCENT" ? 1 : undefined}
              max={couponDraft.mode === "PERCENT" ? 100 : undefined}
              placeholder={promoValuePlaceholder(couponDraft.mode)}
            />
          </label>
          <label>
            Máx. usos
            <input
              value={couponDraft.maxUses}
              onChange={(event) => setCouponDraft((current) => ({ ...current, maxUses: event.target.value }))}
              type="number"
              min={1}
              placeholder="100"
            />
          </label>
          <button className="primary-button finance-form-span" type="submit" disabled={creatingCoupon}>
            {creatingCoupon ? <Loader2 size={18} className="animate-spin" /> : <Tag size={18} />}
            Criar cupom promocional
          </button>
        </form>

        {coupons.length > 0 ? (
          <div className="finance-coupon-list">
            {coupons.map((coupon) => (
              <div className={dataRowClass} key={coupon.id}>
                <span>
                  <strong>{coupon.code}</strong> · {formatCouponValue(coupon)}
                  {" · "}
                  usados {coupon.usedCount}
                  {coupon.maxUses != null ? `/${coupon.maxUses}` : ""}
                  {coupon.description ? ` · ${coupon.description}` : ""}
                </span>
                <button type="button" className={deleteActionButtonClass} aria-label="Excluir cupom" onClick={() => void removeCoupon(coupon.id)}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <article className="table-panel finance-panel" id="admin-plans">
        <div className={panelTitleClass}>
          <div>
            <h2>Planos de assinatura</h2>
            <p>Valores, benefícios do card, cupom automático e ordem exibidos no funil `/ativar`.</p>
          </div>
          <span>{plans.length}</span>
        </div>

        {feedback ? <p className="mb-3 text-sm text-red-400">{feedback}</p> : null}

        <form className={`${crudFormClass} finance-form finance-form--plans`} onSubmit={handleCreate}>
          <PlanFormFields draft={createDraft} onChange={setCreateDraft} idPrefix="create-plan" coupons={coupons} />
          <button className="primary-button finance-form-span" type="submit" disabled={creating}>
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar plano
          </button>
        </form>

        <div className="finance-table-head finance-table-head--plans" aria-hidden="true">
          <span>Plano</span>
          <span>Valor</span>
          <span>Promo</span>
          <span>Ações</span>
        </div>

        {plans.length > 0 ? (
          plans.map((item) => (
            <div key={item.id}>
              <div className={`${dataRowClass} finance-row finance-row--plans`}>
                <span>
                  <strong>{item.name}</strong>
                  <small className="finance-mono">{item.code}</small>
                  {item.description ? <small className="block text-sand-muted">{item.description}</small> : null}
                </span>
                <span>
                  <strong className="finance-money">{formatPriceInBRL(item.effectivePriceInCents ?? item.priceInCents)}</strong>
                  {(item.discountInCents ?? 0) > 0 ? (
                    <small className="block text-emerald-400 line-through text-sand-muted">
                      {formatPriceInBRL(item.originalPriceInCents ?? item.priceInCents)}
                    </small>
                  ) : null}
                </span>
                <span className="text-sm text-sand-muted">{item.couponCode ?? "—"}</span>
                <span className="finance-row-actions">
                  <button type="button" className="admin-icon-button" aria-label="Editar plano" onClick={() => startEdit(item)}>
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    className={deleteActionButtonClass}
                    aria-label="Excluir plano"
                    onClick={() => onDelete(item.id, item.name)}
                  >
                    <Trash2 size={17} />
                  </button>
                </span>
              </div>

              {editingId === item.id ? (
                <div className={`${crudFormClass} finance-form finance-form--plans finance-plan-edit`}>
                  <PlanFormFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${item.id}`} coupons={coupons} />
                  <InlinePlanCouponForm
                    planDraft={editDraft}
                    promoDraft={inlinePromoDraft}
                    onPromoDraftChange={setInlinePromoDraft}
                    submitting={linkingInlineCoupon}
                    feedback={inlineCouponFeedback}
                    linkedCouponCode={item.couponCode}
                    onSubmit={() => void handleCreateAndLinkCoupon(item.id)}
                  />
                  <div className="finance-form-span finance-plan-edit__actions">
                    <button type="button" className="primary-button" disabled={savingEdit} onClick={() => void saveEdit()}>
                      {savingEdit ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar alterações
                    </button>
                    <button type="button" className="admin-secondary-button" onClick={cancelEdit}>
                      <X size={16} />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="dash-empty">Nenhum plano cadastrado.</div>
        )}
      </article>
    </>
  );
}
