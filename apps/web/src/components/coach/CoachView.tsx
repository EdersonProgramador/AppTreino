import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  Dumbbell,
  Loader2,
  LogOut,
  RefreshCw,
  UsersRound,
  Utensils
} from "lucide-react";
import { apiGet, apiPost } from "../../api";
import { brand } from "../../lib/brand";
import { assetUrl } from "../../lib/urls";
import { paths } from "../../auth/paths";
import { OrgProgramsPanel } from "../admin/OrgProgramsPanel";

type OrgUser = { id: string; name: string; email: string | null };
type Unit = { id: string; name: string };
type OrgBrief = { id: string; name: string };

type Membership = {
  organizationId: string;
  unitId: string | null;
  role: string;
  status: string;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  type: string;
  units: Unit[];
};

type Assignment = {
  id: string;
  professionalType: string;
  athlete: OrgUser;
  professional: OrgUser;
  unit: Unit;
  organization: OrgBrief;
};

type TrainingClass = {
  id: string;
  name: string;
  coach: OrgUser;
  unit: Unit;
  organization: OrgBrief;
  members: Array<{ id: string; athleteId: string }>;
};

type OrgProgram = {
  id: string;
  title: string;
  status: string;
  sourceType: string;
  modality: { id: string; name: string } | null;
  organization: OrgBrief | null;
  days: Array<{ id: string; dayNumber: number }>;
  assignedUsers: Array<{ id: string; userId: string }>;
};

type NutritionPlan = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  nutritionist: OrgUser;
  unit: Unit;
  organization: OrgBrief;
  assignments: Array<{ id: string; athleteId: string }>;
};

type AthleteLink = {
  id: string;
  status: string;
  athlete: OrgUser;
  unit: Unit;
  organization: OrgBrief;
};

type Workspace = {
  isStaff: boolean;
  userId: string;
  memberships: Membership[];
  organizations: Organization[];
  assignedAthletes: OrgUser[];
  assignments: Assignment[];
  classes: TrainingClass[];
  programs: OrgProgram[];
  nutritionPlans: NutritionPlan[];
  athleteLinks: AthleteLink[];
};

type Props = {
  token: string;
  userName: string;
  onLogout: () => void;
};

type Tab = "overview" | "athletes" | "classes" | "programs" | "nutrition";

export function CoachView({ token, userName, onLogout }: Props) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedOrgId, setSelectedOrgId] = useState("");

  const [className, setClassName] = useState("");
  const [classUnitId, setClassUnitId] = useState("");
  const [memberClassId, setMemberClassId] = useState("");
  const [memberAthleteId, setMemberAthleteId] = useState("");
  const [assignProgramId, setAssignProgramId] = useState("");
  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planUnitId, setPlanUnitId] = useState("");
  const [nutritionAssignPlanId, setNutritionAssignPlanId] = useState("");
  const [nutritionAssignAthleteId, setNutritionAssignAthleteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Workspace>("/org/me/workspace", token);
      setWorkspace(data);
      if (!selectedOrgId && data.organizations[0]) {
        setSelectedOrgId(data.organizations[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar workspace.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedOrg = useMemo(
    () => workspace?.organizations.find((item) => item.id === selectedOrgId) ?? null,
    [selectedOrgId, workspace]
  );

  useEffect(() => {
    if (selectedOrg?.units[0] && !classUnitId) {
      setClassUnitId(selectedOrg.units[0].id);
    }
    if (selectedOrg?.units[0] && !planUnitId) {
      setPlanUnitId(selectedOrg.units[0].id);
    }
  }, [classUnitId, planUnitId, selectedOrg]);

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  };

  const rolesLabel = (workspace?.memberships ?? [])
    .map((item) => item.role.replaceAll("_", " "))
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" · ");

  const tabs: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
    { id: "overview", label: "Visão geral", icon: ClipboardList },
    { id: "athletes", label: "Alunos", icon: UsersRound },
    { id: "classes", label: "Turmas", icon: UsersRound },
    { id: "programs", label: "Programas", icon: Dumbbell },
    { id: "nutrition", label: "Nutrição", icon: Utensils }
  ];

  if (loading && !workspace) {
    return (
      <div className="ui-shell flex min-h-screen items-center justify-center gap-3 text-sand">
        <Loader2 className="animate-spin" size={22} />
        Abrindo painel profissional...
      </div>
    );
  }

  if (workspace && !workspace.isStaff) {
    return (
      <div className="ui-shell mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 text-sand">
        <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className="h-10 w-auto self-start" />
        <h1 className="m-0 text-2xl font-bold">Sem acesso profissional</h1>
        <p className="m-0 text-sand-muted">
          Sua conta ainda não está vinculada como coach, nutricionista ou administrador de uma organização.
          Peça ao owner da plataforma para adicioná-lo na equipe.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="admin-primary-button no-underline" to={paths.student}>
            Ir para área do aluno
          </Link>
          <button type="button" className="admin-secondary-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-shell min-h-screen bg-[var(--app-bg)] text-sand">
      <header className="sticky top-0 z-20 border-b border-[color:var(--app-border)] bg-[var(--app-panel)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className="h-8 w-auto" />
            <div className="min-w-0">
              <p className="m-0 text-xs uppercase tracking-wide text-sand-muted">Painel profissional</p>
              <strong className="block truncate">{userName}</strong>
              {rolesLabel && <span className="block text-xs text-sand-muted">{rolesLabel}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="admin-secondary-button no-underline" to={paths.student}>
              <ArrowLeft size={16} />
              Área do aluno
            </Link>
            <button type="button" className="admin-secondary-button" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Atualizar
            </button>
            <button type="button" className="admin-secondary-button" onClick={onLogout}>
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
        {error && <p className="m-0 text-sm text-red-400">{error}</p>}
        {feedback && <p className="m-0 text-sm text-emerald-400">{feedback}</p>}

        {(workspace?.organizations.length ?? 0) > 1 && (
          <label className="grid max-w-md gap-1 text-sm">
            Organização ativa
            <select className="admin-input" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
              {workspace?.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav className="finance-hub-tabs" aria-label="Seções do coach">
          {tabs.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && workspace && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Alunos", value: workspace.assignedAthletes.length },
              { label: "Turmas", value: workspace.classes.length },
              { label: "Programas", value: workspace.programs.length },
              { label: "Planos nutri", value: workspace.nutritionPlans.length }
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <p className="m-0 text-xs uppercase tracking-wide text-sand-muted">{kpi.label}</p>
                <strong className="mt-2 block text-3xl">{kpi.value}</strong>
              </article>
            ))}
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5 sm:col-span-2 lg:col-span-4">
              <h2 className="mb-3 text-lg font-bold">Organizações</h2>
              {workspace.organizations.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhuma organização vinculada.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {workspace.organizations.map((org) => (
                    <li key={org.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>{org.name}</strong>
                      <span className="block text-xs text-sand-muted">
                        {org.type} · {org.units.length} unidade(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "athletes" && workspace && (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-4 text-lg font-bold">Meus alunos</h2>
              {workspace.assignedAthletes.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhum aluno atribuído ainda.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {workspace.assignedAthletes.map((athlete) => (
                    <li key={athlete.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>{athlete.name}</strong>
                      <span className="block text-xs text-sand-muted">{athlete.email ?? athlete.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-4 text-lg font-bold">Atribuições</h2>
              {workspace.assignments.length === 0 ? (
                <p className="text-sm text-sand-muted">Sem atribuições coach/nutri.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {workspace.assignments.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>
                        {item.professional.name} → {item.athlete.name}
                      </strong>
                      <span className="block text-xs text-sand-muted">
                        {item.professionalType} · {item.organization.name} · {item.unit.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {workspace.athleteLinks.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-sm font-bold">Vínculos da organização</h3>
                  <ul className="grid gap-2 text-sm">
                    {workspace.athleteLinks.slice(0, 40).map((link) => (
                      <li key={link.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                        <strong>{link.athlete.name}</strong>
                        <span className="block text-xs text-sand-muted">
                          {link.organization.name} · {link.unit.name} · {link.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          </section>
        )}

        {tab === "classes" && workspace && selectedOrg && (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-4 text-lg font-bold">Nova turma</h2>
              <div className="grid gap-3">
                <input className="admin-input" placeholder="Nome da turma" value={className} onChange={(e) => setClassName(e.target.value)} />
                <select className="admin-input" value={classUnitId} onChange={(e) => setClassUnitId(e.target.value)}>
                  {selectedOrg.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-primary-button"
                  disabled={busy || className.trim().length < 2 || !classUnitId}
                  onClick={() =>
                    void runAction(async () => {
                      await apiPost(
                        "/org/classes",
                        {
                          organizationId: selectedOrg.id,
                          unitId: classUnitId,
                          coachId: workspace.userId,
                          name: className.trim()
                        },
                        token
                      );
                      setClassName("");
                    }, "Turma criada.")
                  }
                >
                  Criar turma
                </button>
              </div>
              <h3 className="mb-2 mt-6 text-sm font-bold">Adicionar aluno à turma</h3>
              <div className="grid gap-3">
                <select className="admin-input" value={memberClassId} onChange={(e) => setMemberClassId(e.target.value)}>
                  <option value="">Turma</option>
                  {workspace.classes
                    .filter((item) => item.organization.id === selectedOrg.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <select className="admin-input" value={memberAthleteId} onChange={(e) => setMemberAthleteId(e.target.value)}>
                  <option value="">Aluno</option>
                  {workspace.assignedAthletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                  {workspace.athleteLinks.map((link) => (
                    <option key={`link-${link.athlete.id}`} value={link.athlete.id}>
                      {link.athlete.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-primary-button"
                  disabled={busy || !memberClassId || !memberAthleteId}
                  onClick={() =>
                    void runAction(async () => {
                      await apiPost(
                        "/org/class-members",
                        { classId: memberClassId, athleteId: memberAthleteId, status: "ACTIVE" },
                        token
                      );
                      setMemberAthleteId("");
                    }, "Aluno adicionado à turma.")
                  }
                >
                  Adicionar à turma
                </button>
              </div>
            </article>
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-4 text-lg font-bold">Turmas</h2>
              {workspace.classes.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhuma turma.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {workspace.classes.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>{item.name}</strong>
                      <span className="block text-xs text-sand-muted">
                        {item.organization.name} · {item.unit.name} · {item.members.length} aluno(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "programs" && selectedOrg && (
          <section className="grid gap-6">
            <OrgProgramsPanel
              token={token}
              organizationId={selectedOrg.id}
              units={selectedOrg.units}
              busy={busy}
              onBusy={runAction}
              onError={(message) => setError(message)}
            />
            {workspace && workspace.assignedAthletes.length > 0 && (
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-3 text-lg font-bold">Atribuição rápida</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  <select className="admin-input" value={assignProgramId} onChange={(e) => setAssignProgramId(e.target.value)}>
                    <option value="">Programa publicado</option>
                    {workspace.programs
                      .filter((item) => item.status === "PUBLISHED" && item.organization?.id === selectedOrg.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                  <select className="admin-input" value={assignAthleteId} onChange={(e) => setAssignAthleteId(e.target.value)}>
                    <option value="">Aluno</option>
                    {workspace.assignedAthletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={busy || !assignProgramId || !assignAthleteId}
                    onClick={() =>
                      void runAction(async () => {
                        await apiPost(`/org/programs/${assignProgramId}/assign`, { athleteIds: [assignAthleteId] }, token);
                        setAssignAthleteId("");
                      }, "Programa atribuído.")
                    }
                  >
                    Atribuir
                  </button>
                </div>
              </article>
            )}
          </section>
        )}

        {tab === "nutrition" && workspace && selectedOrg && (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-2 text-lg font-bold">Novo plano nutricional</h2>
              <p className="mb-4 text-sm text-sand-muted">
                Escreva o conteúdo completo (refeições, macros, orientações). O aluno vê no app em Minha organização.
              </p>
              <div className="grid gap-3">
                <input
                  className="admin-input"
                  placeholder="Título"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                />
                <textarea
                  className="admin-input min-h-[140px]"
                  placeholder="Conteúdo do plano…"
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
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
                  disabled={busy || planTitle.trim().length < 2 || !planUnitId}
                  onClick={() =>
                    void runAction(async () => {
                      await apiPost(
                        "/org/nutrition-plans",
                        {
                          organizationId: selectedOrg.id,
                          unitId: planUnitId,
                          nutritionistId: workspace.userId,
                          title: planTitle.trim(),
                          description: planDescription.trim() || undefined,
                          status: "ACTIVE"
                        },
                        token
                      );
                      setPlanTitle("");
                      setPlanDescription("");
                    }, "Plano nutricional criado.")
                  }
                >
                  Criar plano
                </button>
              </div>
              <h3 className="mb-2 mt-6 text-sm font-bold">Atribuir a aluno</h3>
              <div className="grid gap-3">
                <select
                  className="admin-input"
                  value={nutritionAssignPlanId}
                  onChange={(e) => setNutritionAssignPlanId(e.target.value)}
                >
                  <option value="">Plano</option>
                  {workspace.nutritionPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                </select>
                <select
                  className="admin-input"
                  value={nutritionAssignAthleteId}
                  onChange={(e) => setNutritionAssignAthleteId(e.target.value)}
                >
                  <option value="">Aluno</option>
                  {workspace.assignedAthletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                  {workspace.athleteLinks.map((link) => (
                    <option key={`n-${link.athlete.id}`} value={link.athlete.id}>
                      {link.athlete.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-primary-button"
                  disabled={busy || !nutritionAssignPlanId || !nutritionAssignAthleteId}
                  onClick={() =>
                    void runAction(async () => {
                      await apiPost(
                        "/org/nutrition-assignments",
                        {
                          nutritionPlanId: nutritionAssignPlanId,
                          athleteId: nutritionAssignAthleteId,
                          startDate: new Date().toISOString()
                        },
                        token
                      );
                      setNutritionAssignAthleteId("");
                    }, "Plano atribuído.")
                  }
                >
                  Atribuir
                </button>
              </div>
            </article>
            <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
              <h2 className="mb-4 text-lg font-bold">Planos nutricionais</h2>
              {workspace.nutritionPlans.length === 0 ? (
                <p className="text-sm text-sand-muted">Nenhum plano nutricional no seu escopo.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {workspace.nutritionPlans.map((plan) => (
                    <li key={plan.id} className="rounded-2xl border border-[color:var(--app-border)] px-4 py-3">
                      <strong>{plan.title}</strong>
                      <span className="block text-xs text-sand-muted">
                        {plan.status} · {plan.organization.name} · {plan.nutritionist.name} · {plan.assignments.length}{" "}
                        atribuição(ões)
                      </span>
                      {plan.description ? (
                        <span className="mt-2 block whitespace-pre-wrap text-xs text-sand-muted">{plan.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
