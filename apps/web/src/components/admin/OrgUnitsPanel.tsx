import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiPost, apiPut } from "../../api";
import { StateCityFields } from "./StateCityFields";

export type OrgUnit = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status?: string;
};

export type UnitUsageStats = {
  athletes: number;
  members: number;
  classes: number;
};

type Props = {
  token: string;
  organizationId: string;
  organizationName: string;
  units: OrgUnit[];
  unitStats: Record<string, UnitUsageStats>;
  selectedUnitId: string;
  busy: boolean;
  onSelectUnit: (unitId: string) => void;
  onRefresh: () => Promise<void>;
  onRunAction: (action: () => Promise<string | void>, successMessage: string) => Promise<void>;
};

function unitLocationLabel(unit: OrgUnit) {
  if (unit.city && unit.state) return `${unit.city}, ${unit.state}`;
  if (unit.state) return unit.state;
  if (unit.city) return unit.city;
  return "Localização pendente";
}

function UnitCard({
  unit,
  stats,
  token,
  busy,
  isSelected,
  onSelect,
  onRefresh,
  onDelete
}: {
  unit: OrgUnit;
  stats: UnitUsageStats;
  token: string;
  busy: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const locationComplete = Boolean(unit.city && unit.state);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(unit.name);
  const [city, setCity] = useState(unit.city ?? "");
  const [state, setState] = useState(unit.state ?? "");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setName(unit.name);
    setCity(unit.city ?? "");
    setState(unit.state ?? "");
    setExpanded(!unit.city || !unit.state);
  }, [unit.city, unit.id, unit.name, unit.state]);

  const dirty = name.trim() !== unit.name || city !== (unit.city ?? "") || state !== (unit.state ?? "");
  const canSave = name.trim().length >= 2 && Boolean(state && city);

  return (
    <article className={`org-unit-card${isSelected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`}>
      <header className="org-unit-card__header">
        <button type="button" className="org-unit-card__main" onClick={onSelect}>
          <span className="org-unit-card__icon" aria-hidden>
            <Building2 size={18} />
          </span>
          <span className="org-unit-card__copy">
            <strong>{unit.name}</strong>
            <span className="org-unit-card__meta">
              <MapPin size={12} />
              {unitLocationLabel(unit)}
            </span>
          </span>
        </button>
        <div className="org-unit-card__actions">
          {!locationComplete && <em className="org-unit-card__badge is-warning">Incompleta</em>}
          {locationComplete && <em className="org-unit-card__badge is-ok">Ativa</em>}
          <button
            type="button"
            className="org-unit-card__icon-btn"
            title={expanded ? "Recolher" : "Editar unidade"}
            disabled={busy || saving}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={16} /> : <Pencil size={16} />}
          </button>
          <button
            type="button"
            className="org-unit-card__icon-btn is-danger"
            title="Remover unidade"
            disabled={busy || saving}
            onClick={() => void onDelete()}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <dl className="org-unit-card__stats">
        <div>
          <dt>Alunos</dt>
          <dd>{stats.athletes}</dd>
        </div>
        <div>
          <dt>Equipe</dt>
          <dd>{stats.members}</dd>
        </div>
        <div>
          <dt>Turmas</dt>
          <dd>{stats.classes}</dd>
        </div>
      </dl>

      {expanded && (
        <div className="org-unit-card__form">
          <label className="org-field">
            <span>Nome da unidade</span>
            <input
              className="admin-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy || saving}
            />
          </label>
          <StateCityFields
            withLabels
            layout="inline"
            selectClassName="admin-input"
            stateValue={state}
            cityValue={city}
            onStateChange={setState}
            onCityChange={setCity}
            disabled={busy || saving}
          />
          {localError && <p className="org-unit-card__error">{localError}</p>}
          <div className="org-unit-card__form-actions">
            <button
              type="button"
              className="admin-secondary-button"
              disabled={busy || saving}
              onClick={() => {
                setName(unit.name);
                setCity(unit.city ?? "");
                setState(unit.state ?? "");
                setExpanded(!locationComplete);
                setLocalError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-primary-button"
              disabled={busy || saving || !dirty || !canSave}
              onClick={() =>
                void (async () => {
                  setSaving(true);
                  setLocalError(null);
                  try {
                    await apiPut(
                      `/org/units/${unit.id}`,
                      { name: name.trim(), city, state },
                      token
                    );
                    await onRefresh();
                    setExpanded(false);
                  } catch (err) {
                    setLocalError(err instanceof Error ? err.message : "Falha ao salvar unidade.");
                  } finally {
                    setSaving(false);
                  }
                })()
              }
            >
              {saving ? "Salvando…" : "Salvar unidade"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function OrgUnitsPanel({
  token,
  organizationId,
  organizationName,
  units,
  unitStats,
  selectedUnitId,
  busy,
  onSelectUnit,
  onRefresh,
  onRunAction
}: Props) {
  const [unitName, setUnitName] = useState("");
  const [unitCity, setUnitCity] = useState("");
  const [unitState, setUnitState] = useState("");

  const completeUnits = useMemo(
    () => units.filter((unit) => unit.city && unit.state).length,
    [units]
  );

  return (
    <section className="org-units-panel">
      <header className="org-units-panel__header">
        <div>
          <h2 className="org-units-panel__title">Unidades — {organizationName}</h2>
          <p className="org-units-panel__subtitle">
            {units.length} cadastrada(s) · {completeUnits} com cidade/UF definidos
          </p>
        </div>
        {units.length > 0 && (
          <label className="org-units-panel__filter">
            <span>Unidade padrão</span>
            <select
              className="admin-input"
              value={selectedUnitId}
              onChange={(event) => onSelectUnit(event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                  {unit.city && unit.state ? ` (${unit.city}/${unit.state})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {units.length === 0 ? (
        <div className="org-units-empty">
          <Building2 size={28} />
          <strong>Nenhuma unidade cadastrada</strong>
          <p>Crie a primeira unidade abaixo para vincular alunos, equipe e turmas.</p>
        </div>
      ) : (
        <div className="org-units-list-section">
          <h3 className="org-units-list-section__title">Unidades cadastradas</h3>
          <ul className="org-units-list">
          {units.map((unit) => (
            <li key={unit.id}>
              <UnitCard
                unit={unit}
                stats={unitStats[unit.id] ?? { athletes: 0, members: 0, classes: 0 }}
                token={token}
                busy={busy}
                isSelected={selectedUnitId === unit.id}
                onSelect={() => onSelectUnit(unit.id)}
                onRefresh={onRefresh}
                onDelete={() =>
                  onRunAction(async () => {
                    await apiDelete(`/org/units/${unit.id}`, token);
                  }, "Unidade removida.")
                }
              />
            </li>
          ))}
          </ul>
        </div>
      )}

      <article className="org-units-create">
        <h3 className="org-units-create__title">
          <Plus size={18} />
          Nova unidade
        </h3>
        <div className="org-units-create__grid">
          <label className="org-field org-units-create__name">
            <span>Nome da unidade</span>
            <input
              className="admin-input"
              placeholder="Ex.: POWER BRAIN Medicilândia"
              value={unitName}
              onChange={(event) => setUnitName(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="org-units-create__location">
            <StateCityFields
              withLabels
              layout="inline"
              selectClassName="admin-input"
              stateValue={unitState}
              cityValue={unitCity}
              onStateChange={setUnitState}
              onCityChange={setUnitCity}
              disabled={busy}
            />
          </div>
        </div>
        <button
          type="button"
          className="admin-primary-button org-units-create__submit"
          disabled={busy || unitName.trim().length < 2 || !unitState || !unitCity}
          onClick={() =>
            void onRunAction(async () => {
              await apiPost(
                `/org/organizations/${organizationId}/units`,
                { name: unitName.trim(), city: unitCity, state: unitState },
                token
              );
              setUnitName("");
              setUnitCity("");
              setUnitState("");
            }, "Unidade criada.")
          }
        >
          Adicionar unidade
        </button>
      </article>
    </section>
  );
}
