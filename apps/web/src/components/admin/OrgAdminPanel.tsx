import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Dumbbell, Loader2, Plus, RefreshCw, Search, Trash2, UserCog, UsersRound } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api";
import { dataRowClass, panelTitleClass } from "../../lib/admin-cms-classes";
import { paths } from "../../auth/paths";
import { OrgProgramsPanel } from "./OrgProgramsPanel";

type OrgType = "ACADEMY" | "BOX" | "STUDIO" | "RUNNING_TEAM" | "OTHER";
type OrgTab = "estrutura" | "equipe" | "alunos" | "turmas" | "nutricao" | "modalidades" | "programas";
type MemberRole = "ORGANIZATION_ADMIN" | "UNIT_MANAGER" | "COACH" | "NUTRITIONIST" | "ATHLETE";
type ProfessionalType = "COACH" | "NUTRITIONIST";

type Unit = { id: string; name: string; city: string | null; state: string | null };

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
};

type OrgMember = {
  id: string;
  role: MemberRole;
  status: string;
  user: OrgUser;
  unit: { id: string; name: string } | null;
};

type AthleteLink = {
  id: string;
  status: string;
  athlete: OrgUser;
  unit: { id: string; name: string };
};

type ProfessionalAssignment = {
  id: string;
  professionalType: ProfessionalType;
  status: string;
  professional: OrgUser;
  athlete: OrgUser;
  unit: { id: string; name: string };
};

type TrainingClass = {
  id: string;
  name: string;
  coach: OrgUser;
  unit: { id: string; name: string };
  members: Array<{ id: string; athleteId: string }>;
};

type NutritionPlan = {
  id: string;
  title: string;
  status: string;
  nutritionist: OrgUser;
  unit: { id: string; name: string };
  assignments: Array<{ id: string; athleteId: string }>;
};

type UnitModality = {
  id: string;
  enabled: boolean;
  modality: { id: string; name: string; slug: string; isActive: boolean };
};

type PlatformModality = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  user: OrgUser | null;
  unit: { id: string; name: string } | null;
};

type Props = { token: string };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function UserPicker({
  label,
  query,
  onQueryChange,
  onSearch,
  results,
  value,
  onChange
}: {
  label: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  results: OrgUser[];
  value: string;
  onChange: (userId: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-sand-muted">{label}</span>
      <div className="flex gap-2">
        <input
          className="admin-input flex-1"
          placeholder="Buscar nome ou e-mail"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button type="button" className="admin-secondary-button" onClick={onSearch}>
          <Search size={16} />
        </button>
      </div>
      {results.length > 0 && (
        <select className="admin-input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione</option>
          {results.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} {user.email ? `(${user.email})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function OrgAdminPanel({ token }: Props) {
  const [tab, setTab] = useState<OrgTab>("estrutura");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [athleteLinks, setAthleteLinks] = useState<AthleteLink[]>([]);
  const [assignments, setAssignments] = useState<ProfessionalAssignment[]>([]);
  const [classes, setClasses] = useState<TrainingClass[]>([]);
  const [nutritionPlans, setNutritionPlans] = useState<NutritionPlan[]>([]);
  const [unitModalities, setUnitModalities] = useState<UnitModality[]>([]);
  const [platformModalities, setPlatformModalities] = useState<PlatformModality[]>([]);
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
  const [selectedUnitId, setSelectedUnitId] = useState("");

  const [memberRole, setMemberRole] = useState<MemberRole>("COACH");
  const [memberUserQuery, setMemberUserQuery] = useState("");
  const [memberUserResults, setMemberUserResults] = useState<OrgUser[]>([]);
  const [memberUserId, setMemberUserId] = useState("");

  const [athleteQuery, setAthleteQuery] = useState("");
  const [athleteResults, setAthleteResults] = useState<OrgUser[]>([]);
  const [athleteId, setAthleteId] = useState("");

  const [profQuery, setProfQuery] = useState("");
  const [profResults, setProfResults] = useState<OrgUser[]>([]);
  const [profId, setProfId] = useState("");
  const [assignAthleteQuery, setAssignAthleteQuery] = useState("");
  const [assignAthleteResults, setAssignAthleteResults] = useState<OrgUser[]>([]);
  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [assignType, setAssignType] = useState<ProfessionalType>("COACH");
  const [assignUnitId, setAssignUnitId] = useState("");

  const [className, setClassName] = useState("");
  const [classCoachQuery, setClassCoachQuery] = useState("");
  const [classCoachResults, setClassCoachResults] = useState<OrgUser[]>([]);
  const [classCoachId, setClassCoachId] = useState("");
  const [classUnitId, setClassUnitId] = useState("");
  const [classMemberClassId, setClassMemberClassId] = useState("");
  const [classMemberQuery, setClassMemberQuery] = useState("");
  const [classMemberResults, setClassMemberResults] = useState<OrgUser[]>([]);
  const [classMemberAthleteId, setClassMemberAthleteId] = useState("");

  const [planTitle, setPlanTitle] = useState("");
  const [planNutriQuery, setPlanNutriQuery] = useState("");
  const [planNutriResults, setPlanNutriResults] = useState<OrgUser[]>([]);
  const [planNutriId, setPlanNutriId] = useState("");
  const [planUnitId, setPlanUnitId] = useState("");
  const [nutritionAssignPlanId, setNutritionAssignPlanId] = useState("");
  const [nutritionAssignQuery, setNutritionAssignQuery] = useState("");
  const [nutritionAssignResults, setNutritionAssignResults] = useState<OrgUser[]>([]);
  const [nutritionAssignAthleteId, setNutritionAssignAthleteId] = useState("");

  const [modalityUnitId, setModalityUnitId] = useState("");
  const [modalityId, setModalityId] = useState("");

  const selectedOrg = useMemo(
    () => organizations.find((item) => item.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId]
  );

  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) return [] as OrgUser[];
    const data = await apiGet<{ users: OrgUser[] }>(`/org/users?q=${encodeURIComponent(query.trim())}`, token);
    return data.users;
  };

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ organizations: Organization[] }>("/org/organizations", token);
      setOrganizations(data.organizations);
      if (!selectedOrgId && data.organizations[0]) setSelectedOrgId(data.organizations[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar organizações.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, token]);

  const loadOrgDetails = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const unitId = modalityUnitId || selectedOrg?.units[0]?.id;
      const requests: Promise<void>[] = [
        apiGet<{ members: OrgMember[] }>(`/org/organizations/${selectedOrgId}/members`, token).then((d) =>
          setMembers(d.members)
        ),
        apiGet<{ links: AthleteLink[] }>(`/org/organizations/${selectedOrgId}/athlete-links`, token).then((d) =>
          setAthleteLinks(d.links)
        ),
        apiGet<{ assignments: ProfessionalAssignment[] }>(
          `/org/organizations/${selectedOrgId}/professional-assignments`,
          token
        ).then((d) => setAssignments(d.assignments)),
        apiGet<{ classes: TrainingClass[] }>(`/org/organizations/${selectedOrgId}/classes`, token).then((d) =>
          setClasses(d.classes)
        ),
        apiGet<{ plans: NutritionPlan[] }>(`/org/organizations/${selectedOrgId}/nutrition-plans`, token).then((d) =>
          setNutritionPlans(d.plans)
        ),
        apiGet<{ logs: AuditLog[] }>(`/org/audit-logs?organizationId=${selectedOrgId}&limit=25`, token).then((d) =>
          setAuditLogs(d.logs)
        )
      ];
      if (unitId) {
        requests.push(
          apiGet<{ modalities: UnitModality[] }>(`/org/units/${unitId}/modalities`, token).then((d) =>
            setUnitModalities(d.modalities)
          )
        );
      }
      await Promise.all(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar detalhes.");
    }
  }, [modalityUnitId, selectedOrg?.units, selectedOrgId, token]);

  useEffect(() => {
    void loadOrganizations();
    void apiGet<{ modalities: PlatformModality[] }>("/admin/cms/modalities", token)
      .then((d) => setPlatformModalities(d.modalities.filter((m) => m.isActive)))
      .catch(() => undefined);
  }, [loadOrganizations, token]);

  useEffect(() => {
    void loadOrgDetails();
  }, [loadOrgDetails]);

  useEffect(() => {
    if (!selectedOrg?.units[0]) return;
    const first = selectedOrg.units[0].id;
    setSelectedUnitId(first);
    setClassUnitId(first);
    setPlanUnitId(first);
    setAssignUnitId(first);
    setModalityUnitId(first);
  }, [selectedOrg]);

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

  const tabs: Array<{ id: OrgTab; label: string }> = [
    { id: "estrutura", label: "Estrutura" },
    { id: "equipe", label: "Equipe" },
    { id: "alunos", label: "Alunos" },
    { id: "programas", label: "Programas" },
    { id: "turmas", label: "Turmas" },
    { id: "nutricao", label: "Nutrição" },
    { id: "modalidades", label: "Modalidades" }
  ];

  return (
    <section className="finance-hub">
      <header className="finance-hub-header">
        <div>
          <span className="eyebrow w-fit">Organizações</span>
          <h1 className={panelTitleClass}>Gestão organizacional</h1>
          <p>Academias, boxes e studios — equipe, alunos, turmas, nutrição e modalidades por unidade.</p>
        </div>
        <button type="button" className="dash-link-button" onClick={() => void loadOrganizations()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
        <Link className="dash-link-button no-underline" to={paths.coach}>
          Abrir painel coach
        </Link>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {feedback && <p className="text-sm text-emerald-400">{feedback}</p>}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
            <Plus size={18} /> Nova organização
          </h2>
          <div className="grid gap-3">
            <input className="admin-input" placeholder="Nome" value={orgName} onChange={(e) => { setOrgName(e.target.value); if (!orgSlug) setOrgSlug(slugify(e.target.value)); }} />
            <input className="admin-input" placeholder="Slug" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} />
            <select className="admin-input" value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)}>
              <option value="BOX">Box</option>
              <option value="ACADEMY">Academia</option>
              <option value="STUDIO">Studio</option>
              <option value="RUNNING_TEAM">Equipe de corrida</option>
              <option value="OTHER">Outro</option>
            </select>
            <button type="button" className="admin-primary-button" disabled={busy || orgName.trim().length < 2} onClick={() => void runAction(async () => {
              await apiPost("/org/organizations", { name: orgName.trim(), slug: orgSlug.trim() || slugify(orgName), type: orgType }, token);
              setOrgName(""); setOrgSlug("");
            }, "Organização criada.")}>
              Criar organização
            </button>
          </div>
        </article>

        <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand">
            <Building2 size={18} /> Selecionar organização
          </h2>
          {organizations.length === 0 ? (
            <p className="text-sm text-sand-muted">Nenhuma organização cadastrada.</p>
          ) : (
            <div className="grid gap-2">
              {organizations.map((org) => (
                <button key={org.id} type="button" className={`${dataRowClass} text-left ${selectedOrgId === org.id ? "ring-1 ring-brand-gold/50" : ""}`} onClick={() => setSelectedOrgId(org.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <span>
                      <strong>{org.name}</strong>
                      <span className="block text-xs text-sand-muted">{org.type} · {org.units.length} unidade(s)</span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-red-400"
                      title="Remover organização"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(async () => {
                          await apiDelete(`/org/organizations/${org.id}`, token);
                          if (selectedOrgId === org.id) setSelectedOrgId("");
                        }, "Organização removida.");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.click();
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>
      </div>

      {selectedOrg && (
        <>
          <nav className="finance-hub-tabs mb-6" aria-label="Seções organizacionais">
            {tabs.map((item) => (
              <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "estrutura" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Unidades — {selectedOrg.name}</h2>
                <div className="grid gap-3">
                  <input className="admin-input" placeholder="Nome da unidade" value={unitName} onChange={(e) => setUnitName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="admin-input" placeholder="Cidade" value={unitCity} onChange={(e) => setUnitCity(e.target.value)} />
                    <input className="admin-input" placeholder="UF" maxLength={2} value={unitState} onChange={(e) => setUnitState(e.target.value)} />
                  </div>
                  <button type="button" className="admin-primary-button" disabled={busy || unitName.trim().length < 2} onClick={() => void runAction(async () => {
                    await apiPost(`/org/organizations/${selectedOrgId}/units`, { name: unitName.trim(), city: unitCity.trim() || undefined, state: unitState.trim().toUpperCase() || undefined }, token);
                    setUnitName(""); setUnitCity(""); setUnitState("");
                  }, "Unidade criada.")}>Adicionar unidade</button>
                  <ul className="grid gap-1 text-sm text-sand-muted">
                    {selectedOrg.units.map((unit) => (
                      <li key={unit.id} className="flex items-center justify-between gap-2">
                        <span>
                          {unit.name}
                          {unit.city ? ` — ${unit.city}/${unit.state ?? ""}` : ""}
                        </span>
                        <button
                          type="button"
                          className="text-red-400"
                          disabled={busy}
                          title="Remover unidade"
                          onClick={() =>
                            void runAction(async () => {
                              await apiDelete(`/org/units/${unit.id}`, token);
                            }, "Unidade removida.")
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5 lg:col-span-1">
                <h2 className="mb-4 text-lg font-bold text-sand">Auditoria recente</h2>
                {auditLogs.length === 0 ? <p className="text-sm text-sand-muted">Sem registros.</p> : (
                  <ul className="grid gap-2 text-sm max-h-80 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <li key={log.id} className={dataRowClass}>
                        <strong>{log.action}</strong>
                        <span className="block text-xs text-sand-muted">{new Date(log.createdAt).toLocaleString("pt-BR")} · {log.user?.name ?? "Sistema"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          )}

          {tab === "equipe" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand"><UserCog size={18} /> Adicionar membro</h2>
                <div className="grid gap-3">
                  <select className="admin-input" value={memberRole} onChange={(e) => setMemberRole(e.target.value as MemberRole)}>
                    <option value="ORGANIZATION_ADMIN">Admin da organização</option>
                    <option value="UNIT_MANAGER">Gerente de unidade</option>
                    <option value="COACH">Coach</option>
                    <option value="NUTRITIONIST">Nutricionista</option>
                    <option value="ATHLETE">Atleta (papel org)</option>
                  </select>
                  <select className="admin-input" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
                    <option value="">Toda a organização</option>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <UserPicker label="Usuário" query={memberUserQuery} onQueryChange={setMemberUserQuery} value={memberUserId} onChange={setMemberUserId} results={memberUserResults} onSearch={() => void searchUsers(memberUserQuery).then(setMemberUserResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !memberUserId} onClick={() => void runAction(async () => {
                    await apiPost("/org/members", { organizationId: selectedOrgId, userId: memberUserId, role: memberRole, unitId: selectedUnitId || undefined, status: "ACTIVE" }, token);
                    setMemberUserId(""); setMemberUserQuery(""); setMemberUserResults([]);
                  }, "Membro adicionado.")}>Salvar membro</button>
                </div>
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Equipe cadastrada</h2>
                {members.length === 0 ? <p className="text-sm text-sand-muted">Nenhum membro.</p> : (
                  <ul className="grid gap-2 text-sm">
                    {members.map((m) => (
                      <li key={m.id} className={`${dataRowClass} flex items-start justify-between gap-2`}>
                        <span>
                          <strong>{m.user.name}</strong>
                          <span className="block text-xs text-sand-muted">{m.role} · {m.status}{m.unit ? ` · ${m.unit.name}` : ""}</span>
                        </span>
                        {m.status === "ACTIVE" && (
                          <button
                            type="button"
                            className="text-red-400"
                            disabled={busy}
                            title="Desativar membro"
                            onClick={() =>
                              void runAction(async () => {
                                await apiDelete(`/org/members/${m.id}`, token);
                              }, "Membro desativado.")
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          )}

          {tab === "alunos" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand"><UsersRound size={18} /> Vincular aluno à unidade</h2>
                <div className="grid gap-3">
                  <select className="admin-input" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <UserPicker label="Aluno" query={athleteQuery} onQueryChange={setAthleteQuery} value={athleteId} onChange={setAthleteId} results={athleteResults} onSearch={() => void searchUsers(athleteQuery).then(setAthleteResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !athleteId || !selectedUnitId} onClick={() => void runAction(async () => {
                    await apiPost("/org/athlete-links", { athleteId, organizationId: selectedOrgId, unitId: selectedUnitId, status: "ACTIVE" }, token);
                    setAthleteId(""); setAthleteQuery(""); setAthleteResults([]);
                  }, "Aluno vinculado.")}>Vincular</button>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-bold text-sand">Vínculos ativos</h3>
                {athleteLinks.length === 0 ? <p className="text-sm text-sand-muted">Nenhum vínculo.</p> : (
                  <ul className="grid gap-2 text-sm">{athleteLinks.map((l) => (
                    <li key={l.id} className={`${dataRowClass} flex items-start justify-between gap-2`}>
                      <span>
                        <strong>{l.athlete.name}</strong>
                        <span className="block text-xs text-sand-muted">{l.unit.name} · {l.status}</span>
                      </span>
                      {l.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="text-red-400"
                          disabled={busy}
                          title="Cancelar vínculo"
                          onClick={() =>
                            void runAction(async () => {
                              await apiPatch(`/org/athlete-links/${l.id}`, { status: "CANCELLED" }, token);
                            }, "Vínculo cancelado.")
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}</ul>
                )}
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Atribuir coach / nutricionista</h2>
                <div className="grid gap-3">
                  <select className="admin-input" value={assignType} onChange={(e) => setAssignType(e.target.value as ProfessionalType)}>
                    <option value="COACH">Coach</option>
                    <option value="NUTRITIONIST">Nutricionista</option>
                  </select>
                  <select className="admin-input" value={assignUnitId} onChange={(e) => setAssignUnitId(e.target.value)}>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <UserPicker label="Profissional" query={profQuery} onQueryChange={setProfQuery} value={profId} onChange={setProfId} results={profResults} onSearch={() => void searchUsers(profQuery).then(setProfResults).catch(() => setError("Busca falhou."))} />
                  <UserPicker label="Aluno" query={assignAthleteQuery} onQueryChange={setAssignAthleteQuery} value={assignAthleteId} onChange={setAssignAthleteId} results={assignAthleteResults} onSearch={() => void searchUsers(assignAthleteQuery).then(setAssignAthleteResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !profId || !assignAthleteId || !assignUnitId} onClick={() => void runAction(async () => {
                    await apiPost("/org/professional-assignments", { organizationId: selectedOrgId, unitId: assignUnitId, professionalId: profId, athleteId: assignAthleteId, professionalType: assignType }, token);
                    setProfId(""); setAssignAthleteId(""); setProfQuery(""); setAssignAthleteQuery(""); setProfResults([]); setAssignAthleteResults([]);
                  }, "Atribuição criada.")}>Atribuir</button>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-bold text-sand">Atribuições</h3>
                {assignments.length === 0 ? <p className="text-sm text-sand-muted">Nenhuma atribuição.</p> : (
                  <ul className="grid gap-2 text-sm">{assignments.map((a) => (
                    <li key={a.id} className={`${dataRowClass} flex items-start justify-between gap-2`}>
                      <span>
                        <strong>{a.professional.name}</strong> → {a.athlete.name}
                        <span className="block text-xs text-sand-muted">{a.professionalType} · {a.unit.name}</span>
                      </span>
                      {a.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="text-red-400"
                          disabled={busy}
                          title="Encerrar atribuição"
                          onClick={() =>
                            void runAction(async () => {
                              await apiPatch(`/org/professional-assignments/${a.id}`, { status: "ENDED" }, token);
                            }, "Atribuição encerrada.")
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}</ul>
                )}
              </article>
            </div>
          )}

          {tab === "programas" && (
            <OrgProgramsPanel
              token={token}
              organizationId={selectedOrgId}
              units={selectedOrg.units}
              busy={busy}
              onBusy={runAction}
              onError={(message) => setError(message)}
            />
          )}

          {tab === "turmas" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Nova turma</h2>
                <div className="grid gap-3">
                  <input className="admin-input" placeholder="Nome da turma" value={className} onChange={(e) => setClassName(e.target.value)} />
                  <select className="admin-input" value={classUnitId} onChange={(e) => setClassUnitId(e.target.value)}>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <UserPicker label="Coach" query={classCoachQuery} onQueryChange={setClassCoachQuery} value={classCoachId} onChange={setClassCoachId} results={classCoachResults} onSearch={() => void searchUsers(classCoachQuery).then(setClassCoachResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !className.trim() || !classCoachId} onClick={() => void runAction(async () => {
                    await apiPost("/org/classes", { organizationId: selectedOrgId, unitId: classUnitId, coachId: classCoachId, name: className.trim() }, token);
                    setClassName(""); setClassCoachId(""); setClassCoachQuery(""); setClassCoachResults([]);
                  }, "Turma criada.")}>Criar turma</button>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-bold text-sand">Adicionar aluno à turma</h3>
                <div className="grid gap-3">
                  <select className="admin-input" value={classMemberClassId} onChange={(e) => setClassMemberClassId(e.target.value)}>
                    <option value="">Selecione a turma</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <UserPicker label="Aluno" query={classMemberQuery} onQueryChange={setClassMemberQuery} value={classMemberAthleteId} onChange={setClassMemberAthleteId} results={classMemberResults} onSearch={() => void searchUsers(classMemberQuery).then(setClassMemberResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !classMemberClassId || !classMemberAthleteId} onClick={() => void runAction(async () => {
                    await apiPost("/org/class-members", { classId: classMemberClassId, athleteId: classMemberAthleteId, status: "ACTIVE" }, token);
                    setClassMemberAthleteId(""); setClassMemberQuery(""); setClassMemberResults([]);
                  }, "Aluno adicionado à turma.")}>Adicionar à turma</button>
                </div>
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Turmas</h2>
                {classes.length === 0 ? <p className="text-sm text-sand-muted">Nenhuma turma.</p> : (
                  <ul className="grid gap-2 text-sm">{classes.map((c) => (
                    <li key={c.id} className={`${dataRowClass} flex items-start justify-between gap-2`}>
                      <span>
                        <strong>{c.name}</strong>
                        <span className="block text-xs text-sand-muted">{c.unit.name} · Coach: {c.coach.name} · {c.members.length} aluno(s)</span>
                      </span>
                      <button
                        type="button"
                        className="text-red-400"
                        disabled={busy}
                        title="Arquivar turma"
                        onClick={() =>
                          void runAction(async () => {
                            await apiDelete(`/org/classes/${c.id}`, token);
                          }, "Turma arquivada.")
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}</ul>
                )}
              </article>
            </div>
          )}

          {tab === "nutricao" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Novo plano nutricional</h2>
                <div className="grid gap-3">
                  <input className="admin-input" placeholder="Título" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} />
                  <select className="admin-input" value={planUnitId} onChange={(e) => setPlanUnitId(e.target.value)}>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <UserPicker label="Nutricionista" query={planNutriQuery} onQueryChange={setPlanNutriQuery} value={planNutriId} onChange={setPlanNutriId} results={planNutriResults} onSearch={() => void searchUsers(planNutriQuery).then(setPlanNutriResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !planTitle.trim() || !planNutriId} onClick={() => void runAction(async () => {
                    await apiPost("/org/nutrition-plans", { organizationId: selectedOrgId, unitId: planUnitId, nutritionistId: planNutriId, title: planTitle.trim(), status: "DRAFT" }, token);
                    setPlanTitle(""); setPlanNutriId(""); setPlanNutriQuery(""); setPlanNutriResults([]);
                  }, "Plano criado.")}>Criar plano</button>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-bold text-sand">Atribuir plano a aluno</h3>
                <div className="grid gap-3">
                  <select className="admin-input" value={nutritionAssignPlanId} onChange={(e) => setNutritionAssignPlanId(e.target.value)}>
                    <option value="">Plano</option>
                    {nutritionPlans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <UserPicker label="Aluno" query={nutritionAssignQuery} onQueryChange={setNutritionAssignQuery} value={nutritionAssignAthleteId} onChange={setNutritionAssignAthleteId} results={nutritionAssignResults} onSearch={() => void searchUsers(nutritionAssignQuery).then(setNutritionAssignResults).catch(() => setError("Busca falhou."))} />
                  <button type="button" className="admin-primary-button" disabled={busy || !nutritionAssignPlanId || !nutritionAssignAthleteId} onClick={() => void runAction(async () => {
                    await apiPost("/org/nutrition-assignments", { nutritionPlanId: nutritionAssignPlanId, athleteId: nutritionAssignAthleteId, startDate: new Date().toISOString() }, token);
                    setNutritionAssignAthleteId(""); setNutritionAssignQuery(""); setNutritionAssignResults([]);
                  }, "Plano atribuído ao aluno.")}>Atribuir plano</button>
                </div>
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Planos nutricionais</h2>
                {nutritionPlans.length === 0 ? <p className="text-sm text-sand-muted">Nenhum plano.</p> : (
                  <ul className="grid gap-2 text-sm">{nutritionPlans.map((p) => (
                    <li key={p.id} className={`${dataRowClass} flex items-start justify-between gap-2`}>
                      <span>
                        <strong>{p.title}</strong>
                        <span className="block text-xs text-sand-muted">{p.status} · {p.nutritionist.name} · {p.assignments.length} atribuição(ões)</span>
                      </span>
                      <button
                        type="button"
                        className="text-red-400"
                        disabled={busy}
                        title="Arquivar plano"
                        onClick={() =>
                          void runAction(async () => {
                            await apiDelete(`/org/nutrition-plans/${p.id}`, token);
                          }, "Plano arquivado.")
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}</ul>
                )}
              </article>
            </div>
          )}

          {tab === "modalidades" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-sand"><Dumbbell size={18} /> Modalidade por unidade</h2>
                <div className="grid gap-3">
                  <select className="admin-input" value={modalityUnitId} onChange={(e) => { setModalityUnitId(e.target.value); void loadOrgDetails(); }}>
                    {selectedOrg.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select className="admin-input" value={modalityId} onChange={(e) => setModalityId(e.target.value)}>
                    <option value="">Modalidade da plataforma</option>
                    {platformModalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button type="button" className="admin-primary-button" disabled={busy || !modalityUnitId || !modalityId} onClick={() => void runAction(async () => {
                    await apiPost("/org/unit-modalities", { unitId: modalityUnitId, modalityId, enabled: true }, token);
                    setModalityId("");
                  }, "Modalidade habilitada na unidade.")}>Habilitar modalidade</button>
                </div>
              </article>
              <article className="rounded-3xl border border-[color:var(--app-border)] bg-[var(--app-panel)] p-5">
                <h2 className="mb-4 text-lg font-bold text-sand">Modalidades da unidade</h2>
                {unitModalities.length === 0 ? <p className="text-sm text-sand-muted">Nenhuma modalidade vinculada.</p> : (
                  <ul className="grid gap-2 text-sm">{unitModalities.map((item) => (
                    <li key={item.id} className={dataRowClass}><strong>{item.modality.name}</strong><span className="block text-xs text-sand-muted">{item.enabled ? "Ativa" : "Inativa"} · {item.modality.slug}</span></li>
                  ))}</ul>
                )}
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}
