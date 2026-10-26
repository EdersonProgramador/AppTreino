import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Copy,
  Dumbbell,
  Eye,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  UserPlus,
  Utensils,
  Wallet,
  LayoutGrid
} from "lucide-react";
import { ApiError, apiGet, apiPost } from "../../api";
import { brand } from "../../lib/brand";
import { assetUrl } from "../../lib/urls";
import { paths } from "../../auth/paths";
import { CoachStaffBadge } from "../shared/CoachStaffBadge";
import { useStaffSummary } from "../../hooks/useStaffSummary";
import { CoachTrainingStudio } from "./CoachTrainingStudio";
import { CoachAgendaPanel } from "./CoachAgendaPanel";
import { CoachRevenuePanel } from "./CoachRevenuePanel";
import { CoachAccessGate } from "./CoachAccessGate";

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
  previewAsCoach?: boolean;
  isCoachOnly?: boolean;
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

type Tab = "overview" | "athletes" | "classes" | "agenda" | "programs" | "nutrition" | "revenue";

export function CoachView({ token, userName, onLogout }: Props) {
  const { summary: staffSummary, loading: staffSummaryLoading, refresh: refreshStaffSummary } = useStaffSummary(token);
  const [searchParams] = useSearchParams();
  const previewCoach = searchParams.get("preview") === "coach";
  const workspacePath = previewCoach ? "/org/me/workspace?preview=coach" : "/org/me/workspace";
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
  const [planTitle, setPlanTitle] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planUnitId, setPlanUnitId] = useState("");
  const [nutritionAssignPlanId, setNutritionAssignPlanId] = useState("");
  const [nutritionAssignAthleteId, setNutritionAssignAthleteId] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regUnitId, setRegUnitId] = useState("");
  const [regMode, setRegMode] = useState<"manual" | "invite">("manual");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Workspace>(workspacePath, token);
      setWorkspace(data);
      if (!selectedOrgId && data.organizations[0]) {
        setSelectedOrgId(data.organizations[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar workspace.");
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, token, workspacePath]);

  const retryAccess = useCallback(async () => {
    await refreshStaffSummary();
    await load();
  }, [load, refreshStaffSummary]);

  useEffect(() => {
    void retryAccess();
  }, [retryAccess]);

  useEffect(() => {
    if (previewCoach || !workspace || workspace.isStaff) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 3) {
        window.clearInterval(timer);
        return;
      }
      void retryAccess();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [previewCoach, retryAccess, workspace]);

  useEffect(() => {
    if (!workspace?.isStaff || !workspace.userId) return;
    const key = `atlly-coach-welcome-${workspace.userId}`;
    if (!localStorage.getItem(key)) {
      setShowWelcome(true);
      localStorage.setItem(key, "1");
    }
  }, [workspace?.isStaff, workspace?.userId]);

  useEffect(() => {
    if (!workspace?.organizations.length) return;
    const hasSelected = workspace.organizations.some((org) => org.id === selectedOrgId);
    if (!hasSelected) {
      setSelectedOrgId(workspace.organizations[0].id);
    }
  }, [selectedOrgId, workspace]);

  const selectedOrg = useMemo(() => {
    if (!workspace?.organizations.length) return null;
    return workspace.organizations.find((item) => item.id === selectedOrgId) ?? workspace.organizations[0];
  }, [selectedOrgId, workspace]);

  useEffect(() => {
    if (selectedOrg?.units[0] && !classUnitId) {
      setClassUnitId(selectedOrg.units[0].id);
    }
    if (selectedOrg?.units[0] && !planUnitId) {
      setPlanUnitId(selectedOrg.units[0].id);
    }
    if (selectedOrg?.units[0] && !regUnitId) {
      setRegUnitId(selectedOrg.units[0].id);
    }
  }, [classUnitId, planUnitId, regUnitId, selectedOrg]);

  const loadInviteLink = useCallback(async () => {
    if (!selectedOrg || !regUnitId) {
      setInviteError("Selecione a unidade antes de gerar o link.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const payload = { organizationId: selectedOrg.id, unitId: regUnitId };
      let data: { inviteUrl: string; inviteToken: string };
      try {
        data = await apiPost("/org/coach-athletes/invite-link", payload, token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          data = await apiPost("/coach/managed-athletes/invite-link", payload, token);
        } else {
          throw err;
        }
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const localInviteUrl = data.inviteToken
        ? `${origin}/convite-coach?token=${encodeURIComponent(data.inviteToken)}`
        : data.inviteUrl;
      setInviteUrl(localInviteUrl || data.inviteUrl);
      setFeedback("Link de convite gerado.");
    } catch (err) {
      let message = err instanceof Error ? err.message : "Não foi possível gerar o link.";
      if (err instanceof ApiError && err.status === 402) {
        message =
          "Plano Coach ATLLY Profissional necessário (R$ 1.300/ano) para cadastrar alunos. Ative em Para Coaches.";
      }
      if (err instanceof ApiError && err.status === 404) {
        message =
          "Rota da API não encontrada. Reinicie a API local ou faça deploy da versão mais recente no Render.";
      }
      setInviteError(message);
      setError(message);
      setInviteUrl(null);
    } finally {
      setInviteLoading(false);
    }
  }, [regUnitId, selectedOrg, token]);

  useEffect(() => {
    if (regMode !== "invite") {
      setInviteError(null);
      return;
    }
    setInviteUrl(null);
    if (!selectedOrg || !regUnitId) return;
    void loadInviteLink();
  }, [loadInviteLink, regMode, regUnitId, selectedOrg?.id]);

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
  const isCoachMember = (workspace?.memberships ?? []).some((item) => item.role === "COACH");

  const tabs: Array<{ id: Tab; label: string; icon: typeof UsersRound }> = [
    { id: "overview", label: "Visão geral", icon: ClipboardList },
    { id: "athletes", label: "Alunos", icon: UsersRound },
    { id: "classes", label: "Turmas", icon: LayoutGrid },
    { id: "agenda", label: "Agenda", icon: CalendarDays },
    { id: "programs", label: "Estúdio", icon: Dumbbell },
    { id: "nutrition", label: "Nutrição", icon: Utensils },
    { id: "revenue", label: "Receitas", icon: Wallet }
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
      <CoachAccessGate
        userName={userName}
        staffSummary={staffSummary}
        staffLoading={staffSummaryLoading}
        workspaceLoading={loading}
        onRetry={retryAccess}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="admin-preview-shell-wrap coach-shell min-h-screen text-sand">
      {previewCoach && (
        <div className="admin-preview-banner" role="status">
          <div className="admin-preview-banner-copy">
            <Eye size={16} />
            <span>
              <strong>Modo preview</strong>
              · visão de coach (escopo limitado à sua equipe e turmas)
            </span>
          </div>
          <div className="admin-preview-banner-controls">
            <Link className="admin-preview-banner-action no-underline" to={paths.admin}>
              <ShieldCheck size={16} />
              Voltar ao admin
            </Link>
          </div>
        </div>
      )}

      <div className="ui-shell min-h-screen text-sand">
      <header className="coach-topbar sticky top-0 z-20 border-b border-[color:var(--app-border)] bg-[var(--app-panel)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src={assetUrl("assets/atlly-logo.png")} alt={brand.name} className="h-8 w-auto" />
            <div className="min-w-0">
              <p className="m-0 text-xs uppercase tracking-wide text-sand-muted">Painel profissional</p>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="block truncate">{userName}</strong>
                {staffSummary.isActiveCoach ? <CoachStaffBadge compact /> : null}
                {isCoachMember && !staffSummary.isActiveCoach ? (
                  <span className="coach-staff-badge coach-staff-badge--staff coach-staff-badge--compact">
                    Coach inativo
                  </span>
                ) : null}
              </div>
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

      <main className="coach-main">
        {(selectedOrg || workspace) && (
          <div className="coach-hero">
            <div>
              <p className="coach-hero__eyebrow">Painel Coach · {brand.name}</p>
              <h1>{selectedOrg?.name ?? userName}</h1>
              <p className="coach-hero__meta">
                {selectedOrg
                  ? `${selectedOrg.type.replaceAll("_", " ")} · ${selectedOrg.units.length} unidade(s)`
                  : "Sem organização vinculada"}{" "}
                · aba {tabs.find((t) => t.id === tab)?.label ?? "Visão geral"}
              </p>
            </div>
            {(workspace?.organizations.length ?? 0) > 1 ? (
              <label className="coach-org-picker">
                Organização ativa
                <select className="admin-input" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
                  {workspace?.organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}

        {showWelcome && (
          <div className="coach-welcome-banner" role="status">
            <div>
              <strong>Bem-vindo ao painel Coach ATLLY</strong>
              <p>
                Você continua como aluno em /aluno e gerencia turmas, estúdio e receitas aqui. Comissão de indicação
                exige assinatura ATLLY ativa.
              </p>
            </div>
            <button type="button" className="coach-welcome-banner__close" onClick={() => setShowWelcome(false)}>
              Entendi
            </button>
          </div>
        )}
        {error && <p className="coach-alert coach-alert--error">{error}</p>}
        {feedback && <p className="coach-alert coach-alert--success">{feedback}</p>}

        <nav className="coach-tabs" aria-label="Seções do coach">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => {
                setTab(item.id);
                setError(null);
              }}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="coach-panel-body" key={tab}>
        {tab === "overview" && workspace && (
          <section className="coach-kpi-grid">
            {(
              [
                { label: "Alunos", value: workspace.assignedAthletes.length, tone: "coach-kpi--athletes", icon: UsersRound },
                { label: "Turmas", value: workspace.classes.length, tone: "coach-kpi--classes", icon: LayoutGrid },
                { label: "Programas", value: workspace.programs.length, tone: "coach-kpi--programs", icon: Dumbbell },
                { label: "Planos nutri", value: workspace.nutritionPlans.length, tone: "coach-kpi--nutrition", icon: Utensils }
              ] as const
            ).map((kpi) => (
              <article key={kpi.label} className={`coach-kpi ${kpi.tone}`}>
                <kpi.icon className="coach-kpi__icon" size={28} />
                <p className="coach-kpi__label">{kpi.label}</p>
                <strong className="coach-kpi__value">{kpi.value}</strong>
              </article>
            ))}
            <article className="coach-section coach-section--wide">
              <div className="coach-section__head">
                <h2 className="coach-section__title">Organizações vinculadas</h2>
                <p className="coach-section__subtitle">Boxes, academias e studios em que você atua como profissional.</p>
              </div>
              {workspace.organizations.length === 0 ? (
                <p className="coach-empty">Nenhuma organização vinculada.</p>
              ) : (
                <ul className="coach-list sm:grid sm:grid-cols-2">
                  {workspace.organizations.map((org) => (
                    <li key={org.id} className="coach-list-item">
                      <strong>{org.name}</strong>
                      <span>
                        {org.type.replaceAll("_", " ")} · {org.units.length} unidade(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "athletes" && workspace && selectedOrg && (
          <section className="coach-layout-2">
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">
                  <UserPlus size={20} />
                  Cadastrar aluno
                </h2>
              </div>
              <p className="coach-empty" style={{ marginBottom: "1rem" }}>
                O aluno recebe apenas treinos exclusivos que você agenda e distribui — jornada fechada à sua operação.
              </p>
              <div className="coach-form-stack">
              <div className="activate-account-tabs mb-4" role="tablist" aria-label="Modo de cadastro">
                <button
                  type="button"
                  role="tab"
                  aria-selected={regMode === "manual"}
                  className={regMode === "manual" ? "is-active" : undefined}
                  onClick={() => setRegMode("manual")}
                >
                  Cadastro manual
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={regMode === "invite"}
                  className={regMode === "invite" ? "is-active" : undefined}
                  onClick={() => {
                    setRegMode("invite");
                    setInviteError(null);
                    setInviteUrl(null);
                  }}
                >
                  Link de convite
                </button>
              </div>
              <label>
                Unidade
                <select className="admin-input" value={regUnitId} onChange={(e) => setRegUnitId(e.target.value)}>
                  {selectedOrg.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              {regMode === "manual" ? (
                <div className="coach-form-stack">
                  <label>
                    Nome completo
                    <input
                      className="admin-input"
                      placeholder="Nome do aluno"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                    />
                  </label>
                  <label>
                    E-mail (opcional se tiver telefone)
                    <input
                      className="admin-input"
                      type="email"
                      placeholder="aluno@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Telefone (opcional se tiver e-mail)
                    <input
                      className="admin-input"
                      placeholder="5511999999999"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </label>
                  <label>
                    Senha inicial (repasse ao aluno)
                    <input
                      className="admin-input"
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={
                      busy ||
                      regName.trim().length < 2 ||
                      !regUnitId ||
                      regPassword.trim().length < 6 ||
                      (!regEmail.trim() && !regPhone.trim())
                    }
                    onClick={() =>
                      void runAction(async () => {
                        await apiPost(
                          "/org/coach-athletes/register",
                          {
                            organizationId: selectedOrg.id,
                            unitId: regUnitId,
                            name: regName.trim(),
                            email: regEmail.trim() || undefined,
                            phone: regPhone.trim() || undefined,
                            initialPassword: regPassword.trim()
                          },
                          token
                        );
                        setRegName("");
                        setRegEmail("");
                        setRegPhone("");
                        setRegPassword("");
                      }, "Aluno cadastrado. Passe a senha inicial para ele entrar em /login.")
                    }
                  >
                    Cadastrar aluno
                  </button>
                </div>
              ) : (
                <div className="coach-form-stack">
                  <p className="text-sm text-sand-muted">
                    Envie este link para o aluno criar a própria conta. Ele será vinculado automaticamente a você nesta
                    unidade.
                  </p>
                  {inviteError ? <p className="coach-alert coach-alert--error">{inviteError}</p> : null}
                  {inviteLoading ? (
                    <p className="coach-empty">
                      <Loader2 className="spin inline" size={16} /> Gerando link…
                    </p>
                  ) : inviteUrl ? (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs break-all text-sand-muted">
                        {inviteUrl}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="admin-primary-button"
                          onClick={() =>
                            void navigator.clipboard.writeText(inviteUrl).then(() => {
                              setFeedback("Link copiado.");
                            })
                          }
                        >
                          <Copy size={16} /> Copiar link
                        </button>
                        <button type="button" className="outline-button compact-button" onClick={() => void loadInviteLink()}>
                          <Link2 size={16} /> Atualizar link
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="admin-primary-button" disabled={!regUnitId || inviteLoading} onClick={() => void loadInviteLink()}>
                      Gerar link de convite
                    </button>
                  )}
                </div>
              )}
              </div>
            </article>
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">
                  <UsersRound size={20} />
                  Meus alunos
                </h2>
              </div>
              {workspace.assignedAthletes.length === 0 ? (
                <p className="coach-empty">Nenhum aluno atribuído ainda.</p>
              ) : (
                <ul className="coach-list">
                  {workspace.assignedAthletes.map((athlete) => (
                    <li key={athlete.id} className="coach-list-item">
                      <strong>{athlete.name}</strong>
                      <span>{athlete.email ?? athlete.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">
                  <ClipboardList size={20} />
                  Atribuições
                </h2>
              </div>
              {workspace.assignments.length === 0 ? (
                <p className="coach-empty">Sem atribuições coach/nutri.</p>
              ) : (
                <ul className="coach-list">
                  {workspace.assignments.map((item) => (
                    <li key={item.id} className="coach-list-item">
                      <strong>
                        {item.professional.name} → {item.athlete.name}
                      </strong>
                      <span>
                        {item.professionalType} · {item.organization.name} · {item.unit.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {workspace.athleteLinks.length > 0 && (
                <>
                  <h3 className="coach-section__divider">Vínculos da organização</h3>
                  <ul className="coach-list">
                    {workspace.athleteLinks.slice(0, 40).map((link) => (
                      <li key={link.id} className="coach-list-item">
                        <strong>{link.athlete.name}</strong>
                        <span>
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
          <section className="coach-layout-2">
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">
                  <LayoutGrid size={20} />
                  Nova turma
                </h2>
              </div>
              <div className="coach-form-stack">
                <label>
                  Nome da turma
                  <input className="admin-input" placeholder="Ex.: Cross manhã" value={className} onChange={(e) => setClassName(e.target.value)} />
                </label>
                <label>
                  Unidade
                  <select className="admin-input" value={classUnitId} onChange={(e) => setClassUnitId(e.target.value)}>
                  {selectedOrg.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                  </select>
                </label>
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
              <h3 className="coach-section__divider">Adicionar aluno à turma</h3>
              <div className="coach-form-stack">
                <label>
                  Turma
                  <select className="admin-input" value={memberClassId} onChange={(e) => setMemberClassId(e.target.value)}>
                  <option value="">Selecione</option>
                  {workspace.classes
                    .filter((item) => item.organization.id === selectedOrg.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aluno
                  <select className="admin-input" value={memberAthleteId} onChange={(e) => setMemberAthleteId(e.target.value)}>
                  <option value="">Selecione</option>
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
                </label>
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
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">Turmas ativas</h2>
                <p className="coach-section__subtitle">Resumo das turmas sob sua responsabilidade.</p>
              </div>
              {workspace.classes.length === 0 ? (
                <p className="coach-empty">Nenhuma turma cadastrada.</p>
              ) : (
                <ul className="coach-list">
                  {workspace.classes.map((item) => (
                    <li key={item.id} className="coach-list-item">
                      <strong>{item.name}</strong>
                      <span>
                        {item.organization.name} · {item.unit.name} · {item.members.length} aluno(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "agenda" && workspace && (
          <CoachAgendaPanel
            token={token}
            organization={selectedOrg ?? null}
            coachUserId={workspace.userId}
            busy={busy}
            onBusy={setBusy}
            onFeedback={setFeedback}
            onError={setError}
          />
        )}

        {tab === "programs" && workspace && (
          selectedOrg ? (
            <div className="coach-studio-wrap coach-section">
              <CoachTrainingStudio
                token={token}
                organizationId={selectedOrg.id}
                organizationName={selectedOrg.name}
                units={selectedOrg.units}
                assignedAthletes={workspace.assignedAthletes}
                busy={busy}
                onBusy={runAction}
                onError={(message) => setError(message)}
              />
            </div>
          ) : (
            <article className="coach-section">
              <p className="coach-empty">
                Nenhuma organização vinculada ao seu perfil de coach. Peça ao administrador para adicioná-lo à equipe.
              </p>
            </article>
          )
        )}

        {tab === "nutrition" && workspace && selectedOrg && (
          <section className="coach-layout-2">
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">
                  <Utensils size={20} />
                  Novo plano nutricional
                </h2>
                <p className="coach-section__subtitle">
                  Refeições, macros e orientações — o aluno vê em Minha organização.
                </p>
              </div>
              <div className="coach-form-stack">
                <label>
                  Título
                  <input
                    className="admin-input"
                    placeholder="Ex.: Plano cutting março"
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                  />
                </label>
                <label>
                  Conteúdo
                  <textarea
                    className="admin-input min-h-[140px]"
                    placeholder="Conteúdo do plano…"
                    value={planDescription}
                    onChange={(e) => setPlanDescription(e.target.value)}
                  />
                </label>
                <label>
                  Unidade
                  <select className="admin-input" value={planUnitId} onChange={(e) => setPlanUnitId(e.target.value)}>
                  {selectedOrg.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                  </select>
                </label>
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
              <h3 className="coach-section__divider">Atribuir a aluno</h3>
              <div className="coach-form-stack">
                <label>
                  Plano
                  <select
                    className="admin-input"
                    value={nutritionAssignPlanId}
                    onChange={(e) => setNutritionAssignPlanId(e.target.value)}
                  >
                  <option value="">Selecione</option>
                  {workspace.nutritionPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                  </select>
                </label>
                <label>
                  Aluno
                  <select
                    className="admin-input"
                    value={nutritionAssignAthleteId}
                    onChange={(e) => setNutritionAssignAthleteId(e.target.value)}
                  >
                  <option value="">Selecione</option>
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
                </label>
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
            <article className="coach-section">
              <div className="coach-section__head">
                <h2 className="coach-section__title">Planos nutricionais</h2>
              </div>
              {workspace.nutritionPlans.length === 0 ? (
                <p className="coach-empty">Nenhum plano nutricional no seu escopo.</p>
              ) : (
                <ul className="coach-list">
                  {workspace.nutritionPlans.map((plan) => (
                    <li key={plan.id} className="coach-list-item">
                      <strong>{plan.title}</strong>
                      <span>
                        {plan.status} · {plan.organization.name} · {plan.nutritionist.name} · {plan.assignments.length}{" "}
                        atribuição(ões)
                      </span>
                      {plan.description ? (
                        <span className="mt-2 block whitespace-pre-wrap text-xs opacity-80">{plan.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {tab === "revenue" && (
          <CoachRevenuePanel token={token} busy={busy} onBusy={runAction} />
        )}
        </div>
      </main>
      </div>
    </div>
  );
}
