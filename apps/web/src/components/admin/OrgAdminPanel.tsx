import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Plus, RefreshCw, Search, UsersRound } from "lucide-react";
import { apiGet, apiPost } from "../../api";
import { dataRowClass, panelTitleClass } from "../../lib/admin-cms-classes";

type OrgType = "ACADEMY" | "BOX" | "STUDIO" | "RUNNING_TEAM" | "OTHER";

type Unit = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  status: string;
  units: Unit[];
};

type OrgUser = {
  id: string;
  name: string;
  email: string | null;
  profile: { avatarUrl: string | null } | null;
};

type TrainingClass = {
  id: string;
  name: string;
  description: string | null;
  coach: { id: string; name: string; email: string | null };
  unit: { id: string; name: string };
  members: Array<{ id: string; athleteId: string }>;
};

type NutritionPlan = {
  id: string;
  title: string;
  status: string;
  nutritionist: { id: string; name: string; email: string | null };
  unit: { id: string; name: string };
  assignments: Array<{ id: string; athleteId: string }>;
};

type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  user: { id: string; name: string; email: string | null } | null;
  organization: { id: string; name: string } | null;
  unit: { id: string; name: string } | null;
};

type Props = {
  token: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function OrgAdminPanel({ token }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [classes, setClasses] = useState<TrainingClass[]>([]);
  const [nutritionPlans, setNutritionPlans] = useState<NutritionPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("BOX");

  const [unitName, setUnitName] = useState("");
  const [unitCity, setUnitCity] = useState("");
  const [unitState, setUnitState] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<OrgUser[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");

  const [className, setClassName] = useState("");
  const [classCoachId, setClassCoachId] = useState("");
  const [classUnitId, setClassUnitId] = useState("");

  const [planTitle, setPlanTitle] = useState("");
  const [planNutritionistId, setPlanNutritionistId] = useState("");
  const [planUnitId, setPlanUnitId] = useState("");

  const selectedOrg = useMemo(
    () => organizations.find((item) => item.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId]
  );

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ organizations: Organization[] }>("/org/organizations", token);
      setOrganizations(data.organizations);
      if (!selectedOrgId && data.organizations[0]) {
        setSelectedOrgId(data.organizations[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar organizações.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, token]);

  const loadOrgDetails = useCallback(async () => {
    if (!selectedOrgId) {
      setClasses([]);
      setNutritionPlans([]);
      setAuditLogs([]);
      return;
    }

    try {
      const [classesData, plansData, logsData] = await Promise.all([
        apiGet<{ classes: TrainingClass[] }>(`/org/organizations/${selectedOrgId}/classes`, token),
        apiGet<{ plans: NutritionPlan[] }>(`/org/organizations/${selectedOrgId}/nutrition-plans`, token),
        apiGet<{ logs: AuditLog[] }>(`/org/audit-logs?organizationId=${selectedOrgId}&limit=25`, token)
      ]);
      setClasses(classesData.classes);
      setNutritionPlans(plansData.plans);
      setAuditLogs(logsData.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar detalhes da organização.");
    }
  }, [selectedOrgId, token]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    void loadOrgDetails();
  }, [loadOrgDetails]);

  useEffect(() => {
    if (selectedOrg?.units[0]) {
      setSelectedUnitId(selectedOrg.units[0].id);
      setClassUnitId(selectedOrg.units[0].id);
      setPlanUnitId(selectedOrg.units[0].id);
    }
  }, [selectedOrg]);

  const searchUsers = async () => {
    if (userQuery.trim().length < 2) return;
    try {
      const data = await apiGet<{ users: OrgUser[] }>(
        `/org/users?q=${encodeURIComponent(userQuery.trim())}`,
        token
      );
      setUserResults(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na busca de usuários.");
    }
  };

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(successMessage);
      await loadOrganizations();
      await loadOrgDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  };

  const createOrganization = () =>
    runAction(async () => {
      const slug = orgSlug.trim() || slugify(orgName);
      await apiPost("/org/organizations", { name: orgName.trim(), slug, type: orgType }, token);
      setOrgName("");
      setOrgSlug("");
    }, "Organização criada.");

  const createUnit = () => {
    if (!selectedOrgId) return;
    return runAction(async () => {
      await apiPost(
        `/org/organizations/${selectedOrgId}/units`,
        {
          name: unitName.trim(),
          city: unitCity.trim() || undefined,
          state: unitState.trim().toUpperCase() || undefined
        },
        token
      );
      setUnitName("");
      setUnitCity("");
      setUnitState("");
    }, "Unidade criada.");
  };

  const linkAthlete = () => {
    if (!selectedOrgId || !selectedUnitId || !selectedAthleteId) return;
    return runAction(async () => {
      await apiPost(
        "/org/athlete-links",
        {
          athleteId: selectedAthleteId,
          organizationId: selectedOrgId,
          unitId: selectedUnitId,
          status: "ACTIVE"
        },
        token
      );
      setSelectedAthleteId("");
      setUserQuery("");
      setUserResults([]);
    }, "Aluno vinculado à organização.");
  };

  const createClass = () => {
    if (!selectedOrgId || !classUnitId || !classCoachId.trim()) return;
    return runAction(async () => {
      await apiPost(
        "/org/classes",
        {
          organizationId: selectedOrgId,
          unitId: classUnitId,
          coachId: classCoachId.trim(),
          name: className.trim()
        },
        token
      );
      setClassName("");
      setClassCoachId("");
    }, "Turma criada.");
  };

  const createNutritionPlan = () => {
    if (!selectedOrgId || !planUnitId || !planNutritionistId.trim()) return;
    return runAction(async () => {
      await apiPost(
        "/org/nutrition-plans",
        {
          organizationId: selectedOrgId,
          unitId: planUnitId,
          nutritionistId: planNutritionistId.trim(),
          title: planTitle.trim(),
          status: "DRAFT"
        },
        token
      );
      setPlanTitle("");
      setPlanNutritionistId("");
    }, "Plano nutricional criado.");
  };

  return (
    <section className="finance-hub">
      <header className="finance-hub-header">
        <div>
          <span className="eyebrow w-fit">Organizações</span>
          <h1 className={panelTitleClass}>Gestão organizacional</h1>
          <p>Academias, boxes e studios com unidades, vínculos de alunos, turmas e nutrição.</p>
        </div>
        <button type="button" className="dash-link-button" onClick={() => void loadOrganizations()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {feedback && <p className="text-sm text-emerald-400">{feedback}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
            <Plus size={18} />
            Nova organização
          </h2>
          <div className="grid gap-3">
            <input
              className="admin-input"
              placeholder="Nome (ex.: Box Cross)"
              value={orgName}
              onChange={(event) => {
                setOrgName(event.target.value);
                if (!orgSlug) setOrgSlug(slugify(event.target.value));
              }}
            />
            <input
              className="admin-input"
              placeholder="Slug (ex.: box-cross)"
              value={orgSlug}
              onChange={(event) => setOrgSlug(event.target.value)}
            />
            <select className="admin-input" value={orgType} onChange={(event) => setOrgType(event.target.value as OrgType)}>
              <option value="BOX">Box</option>
              <option value="ACADEMY">Academia</option>
              <option value="STUDIO">Studio</option>
              <option value="RUNNING_TEAM">Equipe de corrida</option>
              <option value="OTHER">Outro</option>
            </select>
            <button type="button" className="admin-primary-button" disabled={busy || orgName.trim().length < 2} onClick={() => void createOrganization()}>
              Criar organização
            </button>
          </div>
        </article>

        <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
            <Building2 size={18} />
            Organizações cadastradas
          </h2>
          {organizations.length === 0 ? (
            <p className="text-sm text-sand-muted">Nenhuma organização ainda.</p>
          ) : (
            <div className="grid gap-2">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className={`${dataRowClass} text-left ${selectedOrgId === org.id ? "ring-1 ring-brand-gold/50" : ""}`}
                  onClick={() => setSelectedOrgId(org.id)}
                >
                  <strong>{org.name}</strong>
                  <span className="block text-xs text-sand-muted">
                    {org.type} · {org.units.length} unidade(s) · {org.slug}
                  </span>
                </button>
              ))}
            </div>
          )}
        </article>
      </div>

      {selectedOrg && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h2 className="mb-4 text-lg font-bold text-sand">Unidade em {selectedOrg.name}</h2>
            <div className="grid gap-3">
              <input className="admin-input" placeholder="Nome da unidade" value={unitName} onChange={(e) => setUnitName(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className="admin-input" placeholder="Cidade" value={unitCity} onChange={(e) => setUnitCity(e.target.value)} />
                <input className="admin-input" placeholder="UF" maxLength={2} value={unitState} onChange={(e) => setUnitState(e.target.value)} />
              </div>
              <button type="button" className="admin-primary-button" disabled={busy || unitName.trim().length < 2} onClick={() => void createUnit()}>
                Adicionar unidade
              </button>
              {selectedOrg.units.length > 0 && (
                <ul className="mt-2 grid gap-1 text-sm text-sand-muted">
                  {selectedOrg.units.map((unit) => (
                    <li key={unit.id}>
                      {unit.name}
                      {unit.city ? ` — ${unit.city}${unit.state ? `/${unit.state}` : ""}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
              <UsersRound size={18} />
              Vincular aluno
            </h2>
            <div className="grid gap-3">
              <div className="flex gap-2">
                <input
                  className="admin-input flex-1"
                  placeholder="Buscar por nome ou e-mail"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
                <button type="button" className="admin-secondary-button" onClick={() => void searchUsers()}>
                  <Search size={16} />
                </button>
              </div>
              <select className="admin-input" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
                {selectedOrg.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              {userResults.length > 0 && (
                <select className="admin-input" value={selectedAthleteId} onChange={(e) => setSelectedAthleteId(e.target.value)}>
                  <option value="">Selecione o aluno</option>
                  {userResults.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} {user.email ? `(${user.email})` : ""}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="admin-primary-button"
                disabled={busy || !selectedAthleteId || !selectedUnitId}
                onClick={() => void linkAthlete()}
              >
                Vincular aluno
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h2 className="mb-4 text-lg font-bold text-sand">Turmas</h2>
            <div className="mb-4 grid gap-3">
              <input className="admin-input" placeholder="Nome da turma" value={className} onChange={(e) => setClassName(e.target.value)} />
              <input className="admin-input" placeholder="ID do coach (usuário)" value={classCoachId} onChange={(e) => setClassCoachId(e.target.value)} />
              <select className="admin-input" value={classUnitId} onChange={(e) => setClassUnitId(e.target.value)}>
                {selectedOrg.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <button type="button" className="admin-primary-button" disabled={busy || className.trim().length < 2} onClick={() => void createClass()}>
                Criar turma
              </button>
            </div>
            {classes.length === 0 ? (
              <p className="text-sm text-sand-muted">Nenhuma turma cadastrada.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {classes.map((item) => (
                  <li key={item.id} className={dataRowClass}>
                    <strong>{item.name}</strong>
                    <span className="block text-xs text-sand-muted">
                      {item.unit.name} · Coach: {item.coach.name} · {item.members.length} aluno(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
            <h2 className="mb-4 text-lg font-bold text-sand">Planos nutricionais</h2>
            <div className="mb-4 grid gap-3">
              <input className="admin-input" placeholder="Título do plano" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} />
              <input
                className="admin-input"
                placeholder="ID do nutricionista (usuário)"
                value={planNutritionistId}
                onChange={(e) => setPlanNutritionistId(e.target.value)}
              />
              <select className="admin-input" value={planUnitId} onChange={(e) => setPlanUnitId(e.target.value)}>
                {selectedOrg.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-primary-button"
                disabled={busy || planTitle.trim().length < 2}
                onClick={() => void createNutritionPlan()}
              >
                Criar plano
              </button>
            </div>
            {nutritionPlans.length === 0 ? (
              <p className="text-sm text-sand-muted">Nenhum plano nutricional.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {nutritionPlans.map((plan) => (
                  <li key={plan.id} className={dataRowClass}>
                    <strong>{plan.title}</strong>
                    <span className="block text-xs text-sand-muted">
                      {plan.status} · {plan.unit.name} · Nutri: {plan.nutritionist.name} · {plan.assignments.length} atribuição(ões)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5 lg:col-span-2">
            <h2 className="mb-4 text-lg font-bold text-sand">Auditoria recente</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-sand-muted">Sem registros de auditoria para esta organização.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {auditLogs.map((log) => (
                  <li key={log.id} className={dataRowClass}>
                    <strong>{log.action}</strong>
                    <span className="block text-xs text-sand-muted">
                      {new Date(log.createdAt).toLocaleString("pt-BR")} · {log.user?.name ?? "Sistema"} · {log.resourceType}
                      {log.unit ? ` · ${log.unit.name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
