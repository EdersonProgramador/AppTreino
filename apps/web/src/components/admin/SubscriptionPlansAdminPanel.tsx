import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, Save, Tag, Trash2, X } from "lucide-react";
import { formatPriceInBRL, parseBRLMoneyToCents } from "@app-treino/shared";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api";
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
  percentOff: string;
  amountOff: string;
  minOrder: string;
  maxUses: string;
};

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

function emptyCouponDraft(): CouponDraft {
  return {
    code: "",
    description: "",
    percentOff: "",
    amountOff: "",
    minOrder: "",
    maxUses: ""
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
        Código
        <input
          id={`${idPrefix}-code`}
          value={draft.code}
          onChange={(event) => onChange({ ...draft, code: event.target.value })}
          placeholder="monthly"
          required
        />
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
        Cupom automático
        <select
          id={`${idPrefix}-coupon`}
          value={draft.couponId}
          onChange={(event) => onChange({ ...draft, couponId: event.target.value })}
        >
          <option value="">Sem cupom automático</option>
          {coupons.map((coupon) => (
            <option key={coupon.id} value={coupon.id}>
              {coupon.code} · {formatCouponValue(coupon)}
            </option>
          ))}
        </select>
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
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(emptyCouponDraft);
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  useEffect(() => {
    void apiGet<{ coupons: CouponRow[] }>("/admin/subscription-coupons", token)
      .then((response) => setCoupons(response.coupons ?? []))
      .catch(() => setCoupons([]));
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
    setFeedback(null);
    try {
      const percentOff = couponDraft.percentOff.trim() ? Number.parseInt(couponDraft.percentOff, 10) : null;
      const amountOffCents = couponDraft.amountOff.trim() ? parseBRLMoneyToCents(couponDraft.amountOff) : null;
      const minOrderCents = couponDraft.minOrder.trim() ? parseBRLMoneyToCents(couponDraft.minOrder) ?? 0 : 0;
      const maxUses = couponDraft.maxUses.trim() ? Number.parseInt(couponDraft.maxUses, 10) : null;

      if (!percentOff && (amountOffCents == null || amountOffCents < 1)) {
        throw new Error("Informe desconto percentual ou valor fixo.");
      }

      await apiPost(
        "/admin/subscription-coupons",
        {
          code: couponDraft.code.trim(),
          description: couponDraft.description.trim() || null,
          percentOff,
          amountOffCents,
          minOrderCents,
          maxUses
        },
        token
      );
      setCouponDraft(emptyCouponDraft());
      const response = await apiGet<{ coupons: CouponRow[] }>("/admin/subscription-coupons", token);
      setCoupons(response.coupons ?? []);
      setFeedback(null);
      await onChanged("Cupom de assinatura criado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível criar o cupom.");
    } finally {
      setCreatingCoupon(false);
    }
  };

  const removeCoupon = async (couponId: string) => {
    setFeedback(null);
    try {
      await apiDelete(`/admin/subscription-coupons/${couponId}`, token);
      const response = await apiGet<{ coupons: CouponRow[] }>("/admin/subscription-coupons", token);
      setCoupons(response.coupons ?? []);
      await onChanged("Cupom removido.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível remover o cupom.");
    }
  };

  const startEdit = (plan: PlanRow) => {
    setEditingId(plan.id);
    setEditDraft(draftFromPlan(plan));
    setFeedback(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft());
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
            <h2>Cupons de assinatura</h2>
            <p>Crie cupons e vincule ao plano para desconto automático no funil e no checkout.</p>
          </div>
          <span>{coupons.length}</span>
        </div>

        <form className={`${crudFormClass} finance-form finance-form--plans`} onSubmit={handleCreateCoupon}>
          <label>
            Código
            <input
              value={couponDraft.code}
              onChange={(event) => setCouponDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              placeholder="ATLLY10"
              required
            />
          </label>
          <label>
            Descrição
            <input
              value={couponDraft.description}
              onChange={(event) => setCouponDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Lançamento 10%"
            />
          </label>
          <label>
            % off
            <input
              value={couponDraft.percentOff}
              onChange={(event) => setCouponDraft((current) => ({ ...current, percentOff: event.target.value }))}
              type="number"
              min={1}
              max={100}
              placeholder="10"
            />
          </label>
          <label>
            R$ off
            <input
              value={couponDraft.amountOff}
              onChange={(event) => setCouponDraft((current) => ({ ...current, amountOff: event.target.value }))}
              placeholder="10,00"
            />
          </label>
          <label>
            Pedido mínimo
            <input
              value={couponDraft.minOrder}
              onChange={(event) => setCouponDraft((current) => ({ ...current, minOrder: event.target.value }))}
              placeholder="0,00"
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
            Criar cupom
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
                  <PlanFormFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${item.id}`} coupons={coupons} />
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
