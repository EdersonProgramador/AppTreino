import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from "@app-treino/shared";
import { apiGet, apiPut } from "../../api";
import { dataRowClass, panelTitleClass } from "../../lib/admin-cms-classes";

type PlanRow = {
  id: string;
  name: string;
  code: string;
};

type Props = {
  token: string;
  plans: PlanRow[];
};

const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  running_engine: "Motor de corrida (GPS)",
  walking_engine: "Motor de caminhada (GPS)",
  cycling_engine: "Motor de ciclismo (GPS)",
  fixed_training_programs: "Programas de treino fixos",
  progress_tracking: "Acompanhamento de progresso",
  activity_history: "Histórico de atividades"
};

export function PlanFeaturesAdminPanel({ token, plans }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadFeatures = useCallback(async () => {
    if (!selectedPlanId) {
      setEnabledKeys(new Set());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ featureKeys: string[] }>(`/admin/plans/${selectedPlanId}/features`, token);
      setEnabledKeys(new Set(data.featureKeys));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar features.");
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId, token]);

  useEffect(() => {
    if (!selectedPlanId && plans[0]) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  const toggleKey = (key: string) => {
    setEnabledKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiPut(
        `/admin/plans/${selectedPlanId}/features`,
        { featureKeys: [...enabledKeys] },
        token
      );
      setFeedback("Features do plano atualizadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar features.");
    } finally {
      setSaving(false);
    }
  };

  if (!plans.length) return null;

  return (
    <article className="table-panel finance-panel mt-6" id="admin-plan-features">
      <div className={panelTitleClass}>
        <div>
          <h2>Features por plano</h2>
          <p>Entitlements individuais — corrida, caminhada, ciclismo e treinos incluídos na assinatura.</p>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {feedback && <p className="mb-3 text-sm text-emerald-400">{feedback}</p>}

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,280px)_auto] md:items-end">
        <label className="grid gap-1 text-sm">
          Plano
          <select className="admin-input" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.code})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="admin-primary-button" disabled={saving || loading || !selectedPlanId} onClick={() => void save()}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar features
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-sand-muted">Carregando...</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {PLAN_FEATURE_KEYS.map((key) => (
            <li key={key} className={dataRowClass}>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={enabledKeys.has(key)} onChange={() => toggleKey(key)} className="mt-1" />
                <span>
                  <strong>{FEATURE_LABELS[key]}</strong>
                  <small className="block font-mono text-xs text-sand-muted">{key}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
