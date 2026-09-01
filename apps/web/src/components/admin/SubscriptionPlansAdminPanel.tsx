import { useState, type FormEvent } from "react";
import { Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { formatPriceInBRL, parseBRLMoneyToCents, resolvePlanPromoDiscount } from "@app-treino/shared";
import type { PlanPromoDiscountMode } from "@app-treino/shared";
import { apiDelete, apiPost, apiPut, ApiError } from "../../api";
import { formatBenefitsInput, parseBenefitsInput } from "../../lib/plan-catalog";
import type { PlanRow } from "../../types/shared";
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

type PlanPromoDraft = {
  enabled: boolean;
  couponCode: string;
  mode: PlanPromoDiscountMode;
  value: string;
  maxUses: string;
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
  promo: PlanPromoDraft;
};

function emptyPromoDraft(): PlanPromoDraft {
  return {
    enabled: false,
    couponCode: "",
    mode: "TARGET_PRICE",
    value: "",
    maxUses: ""
  };
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
    promo: emptyPromoDraft()
  };
}

function promoDraftFromPlan(plan: PlanRow): PlanPromoDraft {
  if (!plan.couponId || !plan.couponCode) {
    return emptyPromoDraft();
  }

  if (plan.couponPercentOff) {
    return {
      enabled: true,
      couponCode: plan.couponCode,
      mode: "PERCENT",
      value: String(plan.couponPercentOff),
      maxUses: plan.couponMaxUses != null ? String(plan.couponMaxUses) : ""
    };
  }

  const effective = plan.effectivePriceInCents ?? plan.priceInCents;
  if ((plan.discountInCents ?? 0) > 0 && effective < plan.priceInCents) {
    return {
      enabled: true,
      couponCode: plan.couponCode,
      mode: "TARGET_PRICE",
      value: formatPriceInBRL(effective).replace(/^R\$\s?/, ""),
      maxUses: plan.couponMaxUses != null ? String(plan.couponMaxUses) : ""
    };
  }

  if (plan.couponAmountOffCents) {
    return {
      enabled: true,
      couponCode: plan.couponCode,
      mode: "AMOUNT_OFF",
      value: formatPriceInBRL(plan.couponAmountOffCents).replace(/^R\$\s?/, ""),
      maxUses: plan.couponMaxUses != null ? String(plan.couponMaxUses) : ""
    };
  }

  return {
    enabled: true,
    couponCode: plan.couponCode,
    mode: "TARGET_PRICE",
    value: "",
    maxUses: plan.couponMaxUses != null ? String(plan.couponMaxUses) : ""
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
    promo: promoDraftFromPlan(plan)
  };
}

function buildPlanPayload(draft: PlanDraft) {
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
    showOnFunnel: draft.showOnFunnel
  };
}

function buildPromoApiBody(promo: PlanPromoDraft, planDraft: PlanDraft) {
  if (!promo.enabled) return null;
  if (!promo.couponCode.trim()) {
    throw new Error("Informe o nome do cupom (código no checkout).");
  }
  if (!promo.value.trim()) {
    throw new Error("Informe o valor do desconto.");
  }

  const planPriceInCents = parseBRLMoneyToCents(planDraft.price);
  if (planPriceInCents == null || planPriceInCents < 1) {
    throw new Error("Informe o valor do plano antes de configurar a promo.");
  }

  const maxUses = promo.maxUses.trim() ? Number.parseInt(promo.maxUses, 10) : null;
  const base = {
    couponCode: promo.couponCode.trim(),
    planPriceInCents,
    ...(maxUses != null ? { maxUses } : {})
  };

  if (promo.mode === "PERCENT") {
    return { ...base, mode: promo.mode, percentOff: Number.parseInt(promo.value, 10) };
  }
  if (promo.mode === "AMOUNT_OFF") {
    return { ...base, mode: promo.mode, amountOffCents: parseBRLMoneyToCents(promo.value) };
  }
  return { ...base, mode: promo.mode, targetPriceInCents: parseBRLMoneyToCents(promo.value) };
}

function previewPlanPromo(promo: PlanPromoDraft, planDraft: PlanDraft) {
  if (!promo.enabled) return null;
  const planPriceInCents = parseBRLMoneyToCents(planDraft.price);
  if (planPriceInCents == null || planPriceInCents < 1 || !promo.value.trim()) {
    return null;
  }

  try {
    if (promo.mode === "PERCENT") {
      return resolvePlanPromoDiscount({
        planPriceInCents,
        mode: "PERCENT",
        percentOff: Number.parseInt(promo.value, 10)
      });
    }
    if (promo.mode === "AMOUNT_OFF") {
      return resolvePlanPromoDiscount({
        planPriceInCents,
        mode: "AMOUNT_OFF",
        amountOffCents: parseBRLMoneyToCents(promo.value)
      });
    }
    return resolvePlanPromoDiscount({
      planPriceInCents,
      mode: "TARGET_PRICE",
      targetPriceInCents: parseBRLMoneyToCents(promo.value)
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
  return "Preço final com cupom (R$)";
}

function promoValuePlaceholder(mode: PlanPromoDiscountMode) {
  if (mode === "PERCENT") return "10";
  if (mode === "AMOUNT_OFF") return "2,00";
  return "4,50";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
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
        <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => onChange(item)}>
          {promoModeLabel(item)}
        </button>
      ))}
    </div>
  );
}

function PlanPromoFields({
  planDraft,
  promo,
  onPromoChange
}: {
  planDraft: PlanDraft;
  promo: PlanPromoDraft;
  onPromoChange: (next: PlanPromoDraft) => void;
}) {
  const preview = previewPlanPromo(promo, planDraft);

  return (
    <div className="finance-inline-coupon finance-form-span">
      <div className="finance-inline-coupon__head">
        <strong>Cupom deste plano</strong>
        <span className="text-xs text-sand-muted">
          Um cupom por plano. O nome abaixo é o código que o aluno vê no checkout (ex.: LANCAMENTO, START5).
        </span>
      </div>

      <label className="finance-form-check finance-form-span">
        <input
          type="checkbox"
          checked={promo.enabled}
          onChange={(event) => onPromoChange({ ...promo, enabled: event.target.checked })}
        />
        Ativar cupom promocional neste plano
      </label>

      {promo.enabled ? (
        <div className={`${crudFormClass} finance-form finance-form--plans finance-inline-coupon__grid`}>
          <label className="finance-form-span">
            Nome do cupom (checkout)
            <input
              value={promo.couponCode}
              onChange={(event) =>
                onPromoChange({ ...promo, couponCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })
              }
              placeholder="LANCAMENTO"
            />
            <span className="text-xs text-sand-muted">
              Diferente do slug do plano (<span className="finance-mono">{planDraft.code.trim() || "start"}</span>).
            </span>
          </label>

          <div className="finance-form-span">
            <span className="text-xs text-sand-muted">Como descontar</span>
            <PromoModePicker mode={promo.mode} onChange={(mode) => onPromoChange({ ...promo, mode, value: "" })} />
          </div>

          <label>
            {promoValueLabel(promo.mode)}
            <input
              value={promo.value}
              onChange={(event) => onPromoChange({ ...promo, value: event.target.value })}
              type={promo.mode === "PERCENT" ? "number" : "text"}
              inputMode={promo.mode === "PERCENT" ? "numeric" : "decimal"}
              min={promo.mode === "PERCENT" ? 1 : undefined}
              max={promo.mode === "PERCENT" ? 100 : undefined}
              placeholder={promoValuePlaceholder(promo.mode)}
            />
          </label>

          <label>
            Máx. usos
            <input
              value={promo.maxUses}
              onChange={(event) => onPromoChange({ ...promo, maxUses: event.target.value })}
              type="number"
              min={1}
              placeholder="Ilimitado"
            />
          </label>

          {preview ? (
            <p className="finance-form-span finance-promo-preview">
              Plano {formatPriceInBRL(parseBRLMoneyToCents(planDraft.price) ?? 0)} → cupom{" "}
              <strong className="finance-mono">{promo.couponCode.trim() || "—"}</strong> →{" "}
              <strong>{formatPriceInBRL(preview.finalPriceInCents)}</strong>
              {" "}(desconto {formatPriceInBRL(preview.discountInCents)})
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanFormFields({
  draft,
  onChange,
  idPrefix
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  idPrefix: string;
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
        <span className="text-xs text-sand-muted">Identificador técnico do checkout. Não é o cupom.</span>
      </label>
      <label>
        Nome
        <input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Plano Start"
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
      <PlanPromoFields
        planDraft={draft}
        promo={draft.promo}
        onPromoChange={(promo) => onChange({ ...draft, promo })}
      />
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
  const [hadPromoOnEdit, setHadPromoOnEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function syncPlanPromo(planId: string, draft: PlanDraft, hadPromo: boolean) {
    const promoBody = buildPromoApiBody(draft.promo, draft);
    if (promoBody) {
      await apiPut(`/admin/plans/${planId}/promo-coupon`, promoBody, token);
      return;
    }
    if (hadPromo) {
      await apiDelete(`/admin/plans/${planId}/promo-coupon`, token);
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setFeedback(null);
    try {
      const payload = buildPlanPayload(createDraft);
      const response = await apiPost<{ plan: PlanRow }>("/admin/plans", payload, token);
      const planId = response.plan?.id;
      if (!planId) {
        throw new Error("Plano criado, mas a API não retornou o identificador.");
      }
      await syncPlanPromo(planId, createDraft, false);
      setCreateDraft(emptyDraft());
      await onChanged("Plano cadastrado com sucesso.");
    } catch (error) {
      setFeedback(errorMessage(error, "Não foi possível cadastrar o plano."));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (plan: PlanRow) => {
    setEditingId(plan.id);
    setEditDraft(draftFromPlan(plan));
    setHadPromoOnEdit(Boolean(plan.couponId));
    setFeedback(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft());
    setHadPromoOnEdit(false);
    setFeedback(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    setFeedback(null);
    try {
      const payload = buildPlanPayload(editDraft);
      await apiPut(`/admin/plans/${editingId}`, payload, token);
      await syncPlanPromo(editingId, editDraft, hadPromoOnEdit);
      setEditingId(null);
      setHadPromoOnEdit(false);
      await onChanged("Plano atualizado.");
    } catch (error) {
      setFeedback(errorMessage(error, "Não foi possível atualizar o plano."));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <article className="table-panel finance-panel" id="admin-plans">
      <div className={panelTitleClass}>
        <div>
          <h2>Planos de assinatura</h2>
          <p>Valor, cupom exclusivo por plano e benefícios exibidos no funil `/ativar`.</p>
        </div>
        <span>{plans.length}</span>
      </div>

      {feedback ? <p className="mb-3 text-sm text-red-400">{feedback}</p> : null}

      <form className={`${crudFormClass} finance-form finance-form--plans`} onSubmit={handleCreate}>
        <PlanFormFields draft={createDraft} onChange={setCreateDraft} idPrefix="create-plan" />
        <button className="primary-button finance-form-span" type="submit" disabled={creating}>
          {creating ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Salvar plano
        </button>
      </form>

      <div className="finance-table-head finance-table-head--plans" aria-hidden="true">
        <span>Plano</span>
        <span>Valor</span>
        <span>Cupom</span>
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
                <PlanFormFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${item.id}`} />
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
  );
}
