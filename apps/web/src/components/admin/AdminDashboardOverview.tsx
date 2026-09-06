import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Dumbbell,
  Loader2,
  MessageCircle,
  Package,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Star,
  Target,
  TrendingUp,
  UsersRound,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
  GPS_SCALE_TIER_DEFINITIONS,
  SUBSCRIPTION_PLAN_GOAL_DEFINITIONS,
  buildGpsScaleTierProgressList,
  buildSubscriptionPlanGoalProgress,
  formatPriceInBRL,
  type GpsScaleTierProgress,
  type SubscriptionPlanGoalProgress
} from "@app-treino/shared";
import { dataRowClass, panelTitleClass } from "../../lib/admin-cms-classes";
import { trainingCopy } from "../../lib/training-copy";
import type {
  AdminUser,
  ContactMessageRow,
  EventRow,
  FavoriteRow,
  MembershipRow,
  PaymentRow,
  ProductRow,
  PurchaseRow,
  RatingRow,
  SupportTicketRow
} from "../../types";

/** Meta de assinaturas ativas para liberar o lançamento B2B. */
const B2B_LAUNCH_GOAL = 1000;

function gpsTierStatusLabel(status: GpsScaleTierProgress["status"]) {
  if (status === "critical") return "Acima da capacidade";
  if (status === "warning") return "Próximo do limite";
  return "Dentro da capacidade";
}

function GpsScaleTierCard({ tier }: { tier: GpsScaleTierProgress }) {
  return (
    <article
      className={`dash-subscription-goal dash-gps-tier${tier.status === "critical" ? " is-critical" : tier.status === "warning" ? " is-warning" : ""}`}
      aria-label={`${tier.label}: ${tier.current} de ${tier.limit} corredores GPS simultâneos`}
    >
      <div className="dash-subscription-goal-head">
        <strong>{tier.label}</strong>
        <small className="finance-mono">{tier.limit.toLocaleString("pt-BR")} simultâneos</small>
      </div>
      <div className="dash-subscription-goal-count">
        <strong>
          {tier.current.toLocaleString("pt-BR")}
          <span> / {tier.limit.toLocaleString("pt-BR")}</span>
        </strong>
        <small>{gpsTierStatusLabel(tier.status)} · folga {tier.headroom.toLocaleString("pt-BR")}</small>
      </div>
      <div
        className="dash-b2b-goal-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={tier.limit}
        aria-valuenow={tier.current}
        aria-valuetext={`${tier.percent}% da capacidade ${tier.label}`}
      >
        <span style={{ width: `${tier.percent}%` }} />
      </div>
      <div className="dash-subscription-goal-meta">
        <span>{tier.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da capacidade</span>
        <span>{tier.infraSummary}</span>
      </div>
    </article>
  );
}

function SubscriptionPlanGoalCard({ goal }: { goal: SubscriptionPlanGoalProgress }) {
  const remaining = Math.max(0, goal.goal - goal.active);
  return (
    <article
      className={`dash-subscription-goal${goal.reached ? " is-complete" : ""}`}
      aria-label={`Meta ${goal.planName}: ${goal.active} de ${goal.goal} assinaturas ativas`}
    >
      <div className="dash-subscription-goal-head">
        <strong>{goal.planName}</strong>
        <small className="finance-mono">{goal.planCode}</small>
      </div>
      <div className="dash-subscription-goal-count">
        <strong>
          {goal.active.toLocaleString("pt-BR")}
          <span> / {goal.goal.toLocaleString("pt-BR")}</span>
        </strong>
        <small>{goal.reached ? "Meta atingida" : `${remaining.toLocaleString("pt-BR")} restantes`}</small>
      </div>
      <div
        className="dash-b2b-goal-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal.goal}
        aria-valuenow={goal.active}
        aria-valuetext={`${goal.percent}% da meta ${goal.planName}`}
      >
        <span style={{ width: `${goal.percent}%` }} />
      </div>
      <div className="dash-subscription-goal-meta">
        <span>{goal.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta</span>
        <span>matrículas ACTIVE</span>
      </div>
    </article>
  );
}

export function AdminDashboardOverview({
  stats,
  payments,
  events,
  tickets,
  users,
  memberships,
  products,
  purchases,
  contactMessages,
  favorites,
  ratings,
  systemSettings,
  subscriptionGoals = [],
  gpsScaleTiers = [],
  activeGpsScalePhase = "phase1",
  liveOutdoorActivities = 0,
  lastUpdatedAt,
  loading,
  onRefresh,
  onNavigate
}: {
  stats: Array<{ icon: LucideIcon; label: string; value: string; trend: string }>;
  payments: PaymentRow[];
  events: EventRow[];
  tickets: SupportTicketRow[];
  users: AdminUser[];
  memberships: MembershipRow[];
  products: ProductRow[];
  purchases: PurchaseRow[];
  contactMessages: ContactMessageRow[];
  favorites: FavoriteRow[];
  ratings: RatingRow[];
  systemSettings: Record<string, string>;
  subscriptionGoals?: SubscriptionPlanGoalProgress[];
  gpsScaleTiers?: GpsScaleTierProgress[];
  activeGpsScalePhase?: "phase1" | "phase2" | "phase3";
  liveOutdoorActivities?: number;
  lastUpdatedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigate: (
    section:
      | "overview"
      | "training"
      | "users"
      | "finance"
      | "programs"
      | "settings"
      | "products"
      | "purchases"
      | "qr"
      | "cards"
      | "contact"
      | "favorites"
      | "ratings"
      | "assessments"
      | "events"
  ) => void;
}) {
  void products;
  const scrollToOperations = () => {
    document.getElementById("admin-operations")?.scrollIntoView({ behavior: "smooth" });
  };
  const now = useMemo(() => new Date(), [lastUpdatedAt]);
  const currentMonthKey = useMemo(() => `${now.getFullYear()}-${now.getMonth()}`, [now]);

  const revenueBuckets = useMemo(() => {
    const buckets: Array<{ key: string; label: string; total: number }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString("pt-BR", { month: "short" }),
        total: 0
      });
    }

    for (const payment of payments) {
      if (payment.status !== "CONFIRMED") continue;
      const date = new Date(payment.paidAt ?? payment.dueDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = buckets.find((item) => item.key === key);
      if (bucket) bucket.total += payment.amountInCents;
    }

    return buckets;
  }, [now, payments]);

  const maxRevenue = useMemo(() => Math.max(1, ...revenueBuckets.map((bucket) => bucket.total)), [revenueBuckets]);
  const totalRevenue = useMemo(() => revenueBuckets.reduce((sum, bucket) => sum + bucket.total, 0), [revenueBuckets]);
  const monthRevenue = revenueBuckets[revenueBuckets.length - 1]?.total ?? 0;

  const newStudentsThisMonth = useMemo(
    () =>
      users.filter((user) => {
        if (user.role !== "USER" || !user.createdAt) return false;
        const date = new Date(user.createdAt);
        return `${date.getFullYear()}-${date.getMonth()}` === currentMonthKey;
      }).length,
    [currentMonthKey, users]
  );

  const activeMembershipCount = useMemo(() => {
    const kpi = stats.find((stat) => stat.label === "Matrículas ativas");
    if (kpi) {
      const parsed = Number(kpi.value);
      if (Number.isFinite(parsed)) return parsed;
    }
    const now = new Date();
    return memberships.filter((item) => {
      if (item.status !== "ACTIVE") return false;
      const startsAt = new Date(item.startsAt);
      if (startsAt.getTime() > now.getTime()) return false;
      if (!item.endsAt) return true;
      return new Date(item.endsAt).getTime() >= now.getTime();
    }).length;
  }, [memberships, stats]);

  const pendingPayments = useMemo(
    () =>
      payments
        .filter((payment) => payment.status === "PENDING" || payment.status === "OVERDUE")
        .sort((first, second) => new Date(first.dueDate).getTime() - new Date(second.dueDate).getTime())
        .slice(0, 5),
    [payments]
  );

  const openTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS")
        .slice(0, 5),
    [tickets]
  );

  const upcomingEvents = useMemo(
    () =>
      events
        .filter(
          (event) => event.status === "SCHEDULED" && new Date(event.startsAt).getTime() >= now.getTime()
        )
        .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime())
        .slice(0, 5),
    [events, now]
  );

  const latestStudents = useMemo(
    () =>
      users
        .filter((user) => user.role === "USER")
        .sort(
          (first, second) =>
            new Date(second.createdAt ?? 0).getTime() - new Date(first.createdAt ?? 0).getTime()
        )
        .slice(0, 5),
    [users]
  );

  const productsRevenueThisMonth = useMemo(
    () =>
      purchases
        .filter((purchase) => {
          const date = new Date(purchase.paidAt ?? purchase.createdAt);
          return purchase.status === "CONFIRMED" && `${date.getFullYear()}-${date.getMonth()}` === currentMonthKey;
        })
        .reduce((sum, purchase) => sum + purchase.amountInCents, 0),
    [currentMonthKey, purchases]
  );

  const purchasesThisMonth = useMemo(
    () =>
      purchases.filter((purchase) => {
        const date = new Date(purchase.createdAt);
        return `${date.getFullYear()}-${date.getMonth()}` === currentMonthKey;
      }).length,
    [currentMonthKey, purchases]
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; revenue: number }>();
    for (const purchase of purchases) {
      const entry = map.get(purchase.productId) ?? {
        id: purchase.productId,
        name: purchase.product.name,
        count: 0,
        revenue: 0
      };
      entry.count += 1;
      if (purchase.status === "CONFIRMED") entry.revenue += purchase.amountInCents;
      map.set(purchase.productId, entry);
    }
    return [...map.values()].sort((first, second) => second.count - first.count).slice(0, 3);
  }, [purchases]);

  const averageRating = useMemo(
    () =>
      ratings.length > 0
        ? Math.round((ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length) * 10) / 10
        : null,
    [ratings]
  );

  const openContactMessages = useMemo(
    () => contactMessages.filter((message) => message.status === "OPEN").slice(0, 5),
    [contactMessages]
  );

  const expiringMemberships = useMemo(() => {
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return memberships
      .filter((membership) => {
        if (membership.status !== "ACTIVE" || !membership.endsAt) return false;
        const endsAt = new Date(membership.endsAt);
        return endsAt.getTime() <= inSevenDays.getTime() && endsAt.getTime() >= now.getTime();
      })
      .sort(
        (first, second) =>
          new Date(first.endsAt ?? 0).getTime() - new Date(second.endsAt ?? 0).getTime()
      )
      .slice(0, 5);
  }, [memberships, now]);

  const commercialEnabled =
    systemSettings["module_products"] !== "false" ||
    systemSettings["module_purchases"] !== "false" ||
    systemSettings["module_favorites"] !== "false" ||
    systemSettings["module_ratings"] !== "false";

  const contactEnabled = systemSettings["module_contact"] !== "false";

  const formatUpdatedAt = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "nunca";

  const b2bProgress = useMemo(() => {
    const current = activeMembershipCount;
    const remaining = Math.max(0, B2B_LAUNCH_GOAL - current);
    const percent = Math.min(100, Math.round((current / B2B_LAUNCH_GOAL) * 1000) / 10);
    const reached = current >= B2B_LAUNCH_GOAL;
    return { current, remaining, percent, reached };
  }, [activeMembershipCount]);

  const displaySubscriptionGoals = useMemo(() => {
    if (subscriptionGoals.length > 0) return subscriptionGoals;
    return SUBSCRIPTION_PLAN_GOAL_DEFINITIONS.map((definition) =>
      buildSubscriptionPlanGoalProgress(definition, 0, systemSettings)
    );
  }, [subscriptionGoals, systemSettings]);

  const displayGpsScaleTiers = useMemo(() => {
    if (gpsScaleTiers.length > 0) return gpsScaleTiers;
    return buildGpsScaleTierProgressList(liveOutdoorActivities, systemSettings);
  }, [gpsScaleTiers, liveOutdoorActivities, systemSettings]);

  const activePhaseLabel =
    activeGpsScalePhase === "phase3" ? "Fase 3" : activeGpsScalePhase === "phase2" ? "Fase 2" : "Fase 1";

  return (
    <section className="finance-hub dash-hub" id="admin-dashboard">
      <header className="finance-hub-header">
        <div>
          <span className="eyebrow w-fit">Visão operacional</span>
          <h1>Dashboard</h1>
          <p>Indicadores e atalhos do painel no mesmo padrão visual do Financeiro.</p>
        </div>
        <div className="finance-hub-kpis dash-stats-kpis">
          {stats.map((stat) => (
            <article className="finance-kpi" key={stat.label}>
              <stat.icon size={18} />
              <div>
                <strong>{stat.value}</strong>
                <span>
                  {stat.label} · {stat.trend}
                </span>
              </div>
            </article>
          ))}
        </div>
      </header>

      <article
        className={`dash-b2b-goal${b2bProgress.reached ? " is-complete" : ""}`}
        aria-label={`Meta B2B: ${b2bProgress.current} de ${B2B_LAUNCH_GOAL} assinaturas ativas`}
      >
        <div className="dash-b2b-goal-heading">
          <div className="dash-b2b-goal-icon" aria-hidden="true">
            {b2bProgress.reached ? <Rocket size={20} /> : <Target size={20} />}
          </div>
          <div className="dash-b2b-goal-copy">
            <span className="dash-b2b-goal-eyebrow">Roadmap de produto</span>
            <strong>Meta para lançar o B2B</strong>
            <p>
              {b2bProgress.reached
                ? "Meta atingida. Você pode iniciar o desenvolvimento e o lançamento do SaaS para Academias, Box e Studio."
                : "Desenvolvimento e lançamento do SaaS B2B (Academias, Box e Studio) após 1.000 assinaturas ativas no B2C."}
            </p>
          </div>
          <div className="dash-b2b-goal-count">
            <strong>
              {b2bProgress.current.toLocaleString("pt-BR")}
              <span> / {B2B_LAUNCH_GOAL.toLocaleString("pt-BR")}</span>
            </strong>
            <small>{b2bProgress.reached ? "Meta concluída" : `${b2bProgress.remaining.toLocaleString("pt-BR")} restantes`}</small>
          </div>
        </div>
        <div
          className="dash-b2b-goal-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={B2B_LAUNCH_GOAL}
          aria-valuenow={b2bProgress.current}
          aria-valuetext={`${b2bProgress.percent}% da meta B2B`}
        >
          <span style={{ width: `${b2bProgress.percent}%` }} />
        </div>
        <div className="dash-b2b-goal-meta">
          <span>{b2bProgress.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta</span>
          <span>Assinaturas ativas (matrículas ACTIVE)</span>
        </div>
      </article>

      <section className="dash-subscription-goals" aria-labelledby="dash-plan-goals-title">
        <div className="dash-subscription-goals-header dash-subscription-goals-header--single">
          <div>
            <span className="dash-b2b-goal-eyebrow" id="dash-plan-goals-title">
              Metas B2C por plano
            </span>
            <strong>Assinaturas ativas por tier</strong>
            <p>Start, Pro e Atlly Coach IA — metas comerciais de matrículas ACTIVE (ajustáveis em system_settings).</p>
          </div>
        </div>
        <div className="dash-subscription-goals-grid">
          {displaySubscriptionGoals.map((goal) => (
            <SubscriptionPlanGoalCard key={goal.planCode} goal={goal} />
          ))}
        </div>
      </section>

      <section className="dash-subscription-goals dash-gps-scale-section" aria-labelledby="dash-gps-scale-title">
        <div className="dash-subscription-goals-header">
          <div>
            <span className="dash-b2b-goal-eyebrow" id="dash-gps-scale-title">
              Capacidade GPS + API
            </span>
            <strong>Metas de escala por fase de infraestrutura</strong>
            <p>
              Carga atual ({liveOutdoorActivities.toLocaleString("pt-BR")} corredores LIVE) comparada aos limites
              recomendados: 1k, 5k e 10k usuários simultâneos com GPS. Fase operacional sugerida:{" "}
              <strong>{activePhaseLabel}</strong>.
            </p>
          </div>
          <article className="dash-gps-live-kpi" aria-label={`${liveOutdoorActivities} atividades outdoor ao vivo`}>
            <Activity size={18} />
            <div>
              <strong>{liveOutdoorActivities.toLocaleString("pt-BR")}</strong>
              <span>correndo agora (GPS LIVE)</span>
            </div>
          </article>
        </div>
        <div className="dash-subscription-goals-grid">
          {displayGpsScaleTiers.map((tier) => (
            <GpsScaleTierCard key={tier.id} tier={tier} />
          ))}
        </div>
        <p className="dash-gps-scale-footnote">
          Roadmap técnico: <code>docs/gps-scale-phase-1.md</code> · limites ajustáveis via{" "}
          {GPS_SCALE_TIER_DEFINITIONS.map((item) => item.settingKey).join(", ")}.
        </p>
      </section>

      <div className="admin-sync-bar">
        <span className={loading ? "admin-sync-indicator syncing" : "admin-sync-indicator"} aria-hidden="true">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </span>
        <span className="admin-sync-label">
          {loading
            ? "Sincronizando dados..."
            : `Atualizado às ${formatUpdatedAt} · sincronização automática a cada 1 minuto`}
        </span>
        <button className="outline-button compact-button" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          Atualizar
        </button>
      </div>

      <section className="admin-dashboard-grid">
        <article className="table-panel finance-panel dash-panel-wide dash-revenue-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Receita confirmada</h2>
              <p>Valor dos pagamentos confirmados nos últimos 6 meses.</p>
            </div>
            <span>{formatPriceInBRL(totalRevenue)}</span>
          </div>
          <div className="dash-bar-chart">
            {revenueBuckets.map((bucket) => (
              <div className="dash-bar-column" key={bucket.key}>
                <div className="dash-bar-track">
                  <div
                    className="dash-bar-fill"
                    style={{ height: `${Math.round((bucket.total / maxRevenue) * 100)}%` }}
                  />
                </div>
                <span>{bucket.label}</span>
                <strong>{formatPriceInBRL(bucket.total)}</strong>
              </div>
            ))}
          </div>
          <div className="dash-metric-strip">
            <span>
              <Wallet size={17} />
              <strong>{formatPriceInBRL(monthRevenue)}</strong>
              <small>no mês atual</small>
            </span>
            <span>
              <TrendingUp size={17} />
              <strong>{newStudentsThisMonth}</strong>
              <small>novos alunos no mês</small>
            </span>
            <span>
              <UsersRound size={17} />
              <strong>{activeMembershipCount}</strong>
              <small>matrículas ativas</small>
            </span>
          </div>
        </article>

        <article className="table-panel finance-panel dash-quick-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Ações rápidas</h2>
              <p>Atalhos para as áreas operacionais do painel.</p>
            </div>
          </div>
          <div className="dash-quick-actions dash-quick-actions--stack">
            <button type="button" onClick={() => onNavigate("finance")}>
              <CircleDollarSign size={18} />
              <span>
                <strong>Financeiro</strong>
                <small>Planos, matrículas e pagamentos</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button type="button" onClick={() => onNavigate("training")}>
              <Dumbbell size={18} />
              <span>
                <strong>{trainingCopy.adminStudioTitle}</strong>
                <small>Monte divisões e publique treinos</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button type="button" onClick={() => onNavigate("programs")}>
              <Play size={18} />
              <span>
                <strong>{trainingCopy.adminStepPublish}</strong>
                <small>Publique treinos e atribua a alunos</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </article>

        {commercialEnabled && (
          <article className="table-panel finance-panel dash-panel-wide">
            <div className={panelTitleClass}>
              <div>
                <h2>Comercial</h2>
                <p>Receita de produtos, vendas e avaliações dos módulos.</p>
              </div>
              <span>{purchases.length} venda(s)</span>
            </div>
            <div className="dash-metric-strip">
              <span>
                <ShoppingCart size={17} />
                <strong>{formatPriceInBRL(productsRevenueThisMonth)}</strong>
                <small>receita de produtos no mês</small>
              </span>
              <span>
                <Package size={17} />
                <strong>{purchasesThisMonth}</strong>
                <small>compras no mês</small>
              </span>
              <span>
                <Star size={17} />
                <strong>{averageRating !== null ? String(averageRating).replace(".", ",") : "—"}</strong>
                <small>{ratings.length} avaliação(ões)</small>
              </span>
            </div>
            {topProducts.length > 0 ? (
              topProducts.map((product) => (
                <div className={dataRowClass} key={product.id}>
                  <span>
                    <strong>{product.name}</strong>
                    {product.count} venda(s) · {formatPriceInBRL(product.revenue)}
                  </span>
                  <small className="dash-badge">{product.revenue > 0 ? formatPriceInBRL(product.revenue) : "Sem receita"}</small>
                </div>
              ))
            ) : (
              <div className="dash-empty">
                <ShoppingCart size={18} />
                Nenhuma compra registrada ainda.
              </div>
            )}
            <div className={dataRowClass}>
              <span>
                <strong>Favoritos</strong>
                {favorites.length} item(ns) favoritados pelos alunos
              </span>
              <Star size={17} />
            </div>
            <button className="dash-link-button" type="button" onClick={() => onNavigate("products")}>
              Gerenciar catálogo
              <ArrowRight size={15} />
            </button>
          </article>
        )}

        <article className="table-panel finance-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Pagamentos pendentes</h2>
              <p>Priorize cobranças em aberto ou vencidas.</p>
            </div>
            <span>{pendingPayments.length}</span>
          </div>
          {pendingPayments.length > 0 ? (
            pendingPayments.map((payment) => (
              <div className={dataRowClass} key={payment.id}>
                <span>
                  <strong>{payment.membership?.user?.name ?? "Aluno"}</strong>
                  {formatPriceInBRL(payment.amountInCents)} · vence{" "}
                  {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
                </span>
                <small className={payment.status === "OVERDUE" ? "dash-badge danger" : "dash-badge"}>
                  {payment.status === "OVERDUE" ? "Vencido" : "Pendente"}
                </small>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Check size={18} />
              Nenhuma cobrança em aberto.
            </div>
          )}
          <button className="dash-link-button" type="button" onClick={() => onNavigate("finance")}>
            Ver todas as cobranças
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel finance-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Matrículas a vencer</h2>
              <p>Matrículas ativas que expiram nos próximos 7 dias.</p>
            </div>
            <span>{expiringMemberships.length}</span>
          </div>
          {expiringMemberships.length > 0 ? (
            expiringMemberships.map((membership) => (
              <div className={dataRowClass} key={membership.id}>
                <span>
                  <strong>{membership.user?.name ?? "Aluno"}</strong>
                  {membership.plan?.name ?? "Plano"} · expira em{" "}
                  {membership.endsAt ? new Date(membership.endsAt).toLocaleDateString("pt-BR") : "—"}
                </span>
                <small className="dash-badge danger">Atenção</small>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <ShieldCheck size={18} />
              Nenhuma matrícula vence nos próximos 7 dias.
            </div>
          )}
          <button className="dash-link-button" type="button" onClick={() => onNavigate("finance")}>
            Gerenciar matrículas
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel finance-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Atendimentos abertos</h2>
              <p>Chamados aguardando ação do suporte.</p>
            </div>
            <span>{openTickets.length}</span>
          </div>
          {openTickets.length > 0 ? (
            openTickets.map((ticket) => (
              <div className={`${dataRowClass} ticket-row`} key={ticket.id}>
                <span>
                  <strong>{ticket.subject}</strong>
                  {ticket.user?.name ?? "Aluno"} · {ticket.category}
                </span>
                <small className={ticket.priority === "HIGH" ? "dash-badge danger" : "dash-badge"}>
                  {ticket.priority === "HIGH" ? "Prioridade alta" : ticket.priority.toLowerCase()}
                </small>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Check size={18} />
              Nenhum atendimento aberto.
            </div>
          )}
          <button className="dash-link-button" type="button" onClick={scrollToOperations}>
            Ver atendimentos
            <ArrowRight size={15} />
          </button>
        </article>

        {contactEnabled && (
          <article className="table-panel finance-panel">
            <div className={panelTitleClass}>
              <div>
                <h2>Mensagens de contato</h2>
                <p>Dúvidas e solicitações ainda não respondidas.</p>
              </div>
              <span>{openContactMessages.length}</span>
            </div>
            {openContactMessages.length > 0 ? (
              openContactMessages.map((message) => (
                <div className={dataRowClass} key={message.id}>
                  <span>
                    <strong>{message.subject ?? message.name}</strong>
                    {message.name} · {message.email}
                  </span>
                  <small className="dash-badge">Aberta</small>
                </div>
              ))
            ) : (
              <div className="dash-empty">
                <MessageCircle size={18} />
                Nenhuma mensagem em aberto.
              </div>
            )}
            <button className="dash-link-button" type="button" onClick={() => onNavigate("contact")}>
              Abrir caixa de entrada
              <ArrowRight size={15} />
            </button>
          </article>
        )}

        <article className="table-panel finance-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Próximos eventos</h2>
              <p>Agenda de eventos ainda abertos para inscrição.</p>
            </div>
            <span>{upcomingEvents.length}</span>
          </div>
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => (
              <div className={dataRowClass} key={event.id}>
                <span>
                  <strong>{event.title}</strong>
                  {new Date(event.startsAt).toLocaleString("pt-BR")} ·{" "}
                  {event.registrationCount ?? event.registrations?.length ?? 0}/{event.capacity ?? "sem limite"}
                </span>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <CalendarDays size={18} />
              Nenhum evento agendado.
            </div>
          )}
          <button className="dash-link-button" type="button" onClick={() => onNavigate("events")}>
            Gerenciar eventos
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel finance-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Últimos alunos</h2>
              <p>Cadastros mais recentes no painel.</p>
            </div>
            <span>{latestStudents.length}</span>
          </div>
          {latestStudents.length > 0 ? (
            latestStudents.map((student) => (
              <div className={dataRowClass} key={student.id}>
                <span>
                  <strong>{student.name}</strong>
                  {student.email}
                </span>
                <small>{student.createdAt ? new Date(student.createdAt).toLocaleDateString("pt-BR") : "—"}</small>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <UsersRound size={18} />
              Nenhum aluno cadastrado ainda.
            </div>
          )}
          <button className="dash-link-button" type="button" onClick={() => onNavigate("users")}>
            Gerenciar usuários
            <ArrowRight size={15} />
          </button>
        </article>
      </section>
    </section>
  );
}
