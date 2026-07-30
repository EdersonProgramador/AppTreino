import {
  Activity,
  ArrowRight,
  Bot,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Flame,
  Headphones,
  LineChart,
  Loader2,
  LogIn,
  MessageCircle,
  Play,
  RefreshCw,
  Ruler,
  Save,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  UserRound,
  UsersRound
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { formatPriceInBRL, initialPlans, type AuthUser } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "./api";

type View = "home" | "login" | "admin" | "user";
type AuthMode = "login" | "register";
type PlanCode = "monthly" | "annual";

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const resources = [
  {
    icon: Dumbbell,
    title: "Treinos organizados",
    text: "Ficha por dias, exercicios, series, repeticoes e observacoes em uma rotina clara."
  },
  {
    icon: LineChart,
    title: "Evolucao visivel",
    text: "Historico de acesso, frequencia e base para avaliacoes fisicas recorrentes."
  },
  {
    icon: CircleDollarSign,
    title: "Planos recorrentes",
    text: "Estrutura pronta para mensalidade, anualidade e integracao com pagamentos."
  },
  {
    icon: MessageCircle,
    title: "Atendimento centralizado",
    text: "Contato, suporte e acompanhamento em um fluxo simples para aluno e equipe."
  }
];

const workoutRows = [
  { name: "Supino reto", sets: "4x 8-10", load: "72 kg" },
  { name: "Triceps corda", sets: "3x 12", load: "34 kg" },
  { name: "Desenvolvimento", sets: "3x 10", load: "28 kg" }
];

const faqItems = [
  {
    question: "O App Treino serve para alunos e administradores?",
    answer:
      "Sim. Alunos acompanham treinos, planos, pagamentos e avaliacoes. Administradores gerenciam usuarios, matriculas, treinos, eventos e suporte."
  },
  {
    question: "Consigo vender planos recorrentes pela plataforma?",
    answer:
      "A estrutura ja contempla planos mensais e anuais, matriculas e geracao de cobrancas para evoluir a operacao com pagamentos recorrentes."
  },
  {
    question: "O aluno acessa o treino do dia pelo app?",
    answer:
      "Sim. A area do aluno mostra a ficha atual, exercicios, frequencia, status do plano e informacoes importantes do acompanhamento."
  },
  {
    question: "Existe suporte para evolucao fisica e atendimento?",
    answer:
      "Sim. A plataforma inclui avaliacoes fisicas, historico, eventos, tickets de atendimento e base para planos de treino com IA."
  }
];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  priceInCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
}

interface WorkoutRow {
  id: string;
  title: string;
  objective?: string | null;
  days: Array<{
    id: string;
    title: string;
    exercises: Array<{
      id: string;
      name: string;
      sets: number;
      reps: string;
      restSeconds?: number | null;
    }>;
  }>;
}

interface MembershipRow {
  id: string;
  userId: string;
  planId: string;
  status: "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";
  startsAt: string;
  endsAt?: string | null;
  user: AdminUser;
  plan: PlanRow;
}

interface PaymentRow {
  id: string;
  membershipId: string;
  amountInCents: number;
  status: "PENDING" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED";
  dueDate: string;
  paidAt?: string | null;
  paymentUrl?: string | null;
}

interface PhysicalAssessmentRow {
  id: string;
  userId: string;
  assessedAt: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipCm?: number | null;
  notes?: string | null;
  user?: AdminUser;
}

interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  capacity?: number | null;
  status: "SCHEDULED" | "CANCELED" | "FINISHED";
  registered?: boolean;
  registrationCount?: number;
  registrations?: Array<{ id: string; user: AdminUser }>;
}

interface SupportTicketRow {
  id: string;
  userId: string;
  assignedToId?: string | null;
  subject: string;
  message: string;
  category: "GENERAL" | "WORKOUT" | "PAYMENT" | "TECHNICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH";
  createdAt: string;
  updatedAt: string;
  user?: AdminUser;
  assignedTo?: AdminUser | null;
}

interface AiWorkoutPlanRow {
  id: string;
  objective: string;
  level: string;
  daysPerWeek: number;
  focus?: string | null;
  plan: {
    summary: string;
    days: Array<{
      title: string;
      focus: string;
      exercises: Array<{
        name: string;
        sets: number;
        reps: string;
        restSeconds: number;
      }>;
    }>;
    recommendations: string[];
  };
  createdAt: string;
  user?: AdminUser;
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState(() => window.localStorage.getItem("app-treino-token"));
  const [loginState, setLoginState] = useState<"idle" | "submitting" | "admin" | "user">("idle");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode | null>(null);

  const currentArea = useMemo(() => {
    if (!user) return "Visitante";
    return user.role === "ADMIN" ? "Administrador" : "Aluno";
  }, [user]);

  useEffect(() => {
    if (!token) return;

    apiGet<{ user: AuthUser | null }>("/me", token)
      .then((response) => {
        if (!response.user) {
          window.localStorage.removeItem("app-treino-token");
          setToken(null);
          return;
        }

        setUser(response.user);
        setView(response.user.role === "ADMIN" ? "admin" : "user");
      })
      .catch(() => {
        window.localStorage.removeItem("app-treino-token");
        setToken(null);
      });
  }, [token]);

  function applySession(response: { user: AuthUser; token: string }) {
    window.localStorage.setItem("app-treino-token", response.token);
    setToken(response.token);
    setUser(response.user);
    setView(response.user.role === "ADMIN" ? "admin" : "user");
  }

  async function handleDemoLogin(role: "ADMIN" | "USER") {
    setLoginError(null);
    setLoginState(role === "ADMIN" ? "admin" : "user");

    try {
      const email = role === "ADMIN" ? "admin@app-treino.local" : "aluno@app-treino.local";
      const response = await apiPost<{ user: AuthUser; token: string }>("/auth/login", {
        email,
        password: "123456"
      });

      applySession(response);
    } catch {
      setLoginError("Nao foi possivel entrar agora. Verifique se a API e o banco estao rodando.");
    } finally {
      setLoginState("idle");
    }
  }

  function handleStart(planCode?: string) {
    setSelectedPlanCode(planCode === "monthly" || planCode === "annual" ? planCode : null);
    setView("login");
  }

  async function handleAuthSubmit(mode: AuthMode, formData: FormData) {
    setLoginError(null);
    setLoginState("submitting");

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const billingType = String(formData.get("billingType") ?? "UNDEFINED");
    const isCheckoutRegister = mode === "register" && selectedPlanCode;
    const endpoint = mode === "login" ? "/auth/login" : isCheckoutRegister ? "/checkout/register" : "/auth/register";
    const payload =
      mode === "login"
        ? { email, password }
        : isCheckoutRegister
          ? { name, email, password, planCode: selectedPlanCode, billingType }
          : { name, email, password };

    try {
      const response = await apiPost<{ user: AuthUser; token: string }>(endpoint, payload);
      applySession(response);
      setSelectedPlanCode(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setLoginError(
        message ??
          (mode === "login"
          ? "E-mail ou senha invalidos, ou API indisponivel."
          : "Nao foi possivel criar a conta. Verifique os dados e tente novamente.")
      );
    } finally {
      setLoginState("idle");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("app-treino-token");
    setToken(null);
    setUser(null);
    setView("home");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")} aria-label="Ir para inicio">
          <img className="brand-logo" src={assetUrl("assets/app-treino-logo.svg")} alt="App Treino" />
        </button>
        <nav className="nav-links" aria-label="Navegacao principal">
          <a href="#recursos" onClick={() => setView("home")}>
            Recursos
          </a>
          <a href="#planos" onClick={() => setView("home")}>
            Planos
          </a>
          <button onClick={() => (user ? handleLogout() : setView("login"))}>
            <LogIn size={18} />
            {user ? "Sair" : "Entrar"}
          </button>
        </nav>
        <span className="area-badge">{currentArea}</span>
      </header>

      {view === "home" && <HomeView onStart={handleStart} />}
      {view === "login" && (
        <LoginView
          loading={loginState}
          error={loginError}
          selectedPlanCode={selectedPlanCode}
          onSubmit={handleAuthSubmit}
          onAdmin={() => handleDemoLogin("ADMIN")}
          onUser={() => handleDemoLogin("USER")}
        />
      )}
      {view === "admin" && <AdminView token={token} />}
      {view === "user" && <UserView token={token} />}
    </div>
  );
}

function HomeView({ onStart }: { onStart: (planCode?: string) => void }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <div className="hero-vignette" />
        </div>
        <div className="hero-content">
          <div className="hero-copy">
            <span className="eyebrow">Gestao fitness de alta performance</span>
            <h1>App Treino</h1>
            <p>
              Uma plataforma para vender planos, liberar treinos, acompanhar alunos e centralizar
              pagamentos recorrentes com uma experiencia premium para quem treina.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => onStart()}>
                Teste gratuitamente
                <ArrowRight size={18} />
              </button>
              <a className="secondary-link" href="#planos">
                Ver planos
                <ChevronRight size={18} />
              </a>
            </div>
          </div>

          <div className="hero-panel hero-image-panel" aria-label="Imagem oficial do App Treino">
            <img
              src={assetUrl("assets/hero-banner-app-treino.png")}
              alt="Mulher atleta usando o App Treino em um smartphone"
            />
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <span className="eyebrow">Para quem e</span>
          <h2>Controle de estudio, academia e assessoria em uma tela.</h2>
        </div>
        <div className="audience-grid">
          <article>
            <UserRound />
            <h3>Alunos</h3>
            <p>Acompanham treino, plano, pagamentos, avaliacoes e frequencia diaria.</p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Administradores</h3>
            <p>Gerenciam usuarios, matriculas, treinos e suporte em uma rotina organizada.</p>
          </article>
          <article>
            <Sparkles />
            <h3>Assessoria fitness</h3>
            <p>Cria uma base pronta para atendimento digital, recorrencia e evolucao futura.</p>
          </article>
        </div>
      </section>

      <section className="section" id="recursos">
        <div className="section-heading">
          <span className="eyebrow">Recursos</span>
          <h2>Tudo que uma operacao fitness precisa para subir de nivel.</h2>
          <p>
            A interface combina rotina de treino, controle de aluno e visao operacional para manter
            a experiencia simples no uso diario.
          </p>
        </div>
        <div className="resource-grid">
          {resources.map((resource) => (
            <article className="resource-card" key={resource.title}>
              <resource.icon size={24} />
              <h3>{resource.title}</h3>
              <p>{resource.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section pricing" id="planos">
        <div className="section-heading">
          <span className="eyebrow">Planos</span>
          <h2>Planos sob medida para seu treino fisico.</h2>
          <p>No App Treino, voce encontra a estrutura ideal para comecar, vender e escalar.</p>
        </div>
        <div className="pricing-grid">
          {initialPlans.map((plan, index) => (
            <article className={index === 1 ? "price-card featured" : "price-card"} key={plan.code}>
              {index === 1 && <span className="plan-badge">Mais escolhido</span>}
              <h3>{plan.name}</h3>
              <strong>{formatPriceInBRL(plan.priceInCents)}</strong>
              <span>{plan.billingCycle === "MONTHLY" ? "por mes" : "por ano"}</span>
              <button onClick={() => onStart(plan.code)}>
                Comece a treinar
                <ArrowRight size={18} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <div className="section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>Perguntas frequentes sobre o App Treino.</h2>
          <p>Respostas diretas para entender como a plataforma organiza treino, gestao e evolucao.</p>
        </div>
        <div className="faq-grid">
          {faqItems.map((item) => (
            <details className="faq-card" key={item.question}>
              <summary>
                <h3>{item.question}</h3>
                <ChevronRight size={20} />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <div>
          <span className="eyebrow">Proximo passo</span>
          <h2>Transforme cada acesso em consistencia.</h2>
          <p>Comece hoje com uma base visual solida para evoluir produto, treino e atendimento.</p>
        </div>
        <button className="primary-button" onClick={() => onStart()}>
          Comece hoje mesmo
          <ArrowRight size={18} />
        </button>
      </section>

      <footer className="footer">
        <span>@2026 App Treino. Todos os direitos reservados.</span>
        <span>Central de Ajuda | Documentacao | Fale conosco</span>
        <span>Termos de Uso | Privacidade | Instagram | TikTok</span>
      </footer>
    </main>
  );
}

function PhonePreview() {
  return (
    <div className="phone-preview">
      <div className="phone-header">
        <span>Treino de hoje</span>
        <Dumbbell size={20} />
      </div>
      <div className="session-score">
        <span>Peito e triceps</span>
        <strong>84%</strong>
      </div>
      {workoutRows.slice(0, 2).map((exercise) => (
        <div className="exercise-row" key={exercise.name}>
          <span>{exercise.name}</span>
          <strong>{exercise.sets}</strong>
        </div>
      ))}
      <div className="attendance-strip">
        <CalendarDays size={18} />
        Frequencia registrada hoje
      </div>
    </div>
  );
}

function LoginView({
  loading,
  error,
  selectedPlanCode,
  onSubmit,
  onAdmin,
  onUser
}: {
  loading: "idle" | "submitting" | "admin" | "user";
  error: string | null;
  selectedPlanCode: PlanCode | null;
  onSubmit: (mode: AuthMode, formData: FormData) => Promise<void>;
  onAdmin: () => Promise<void>;
  onUser: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>(selectedPlanCode ? "register" : "login");
  const isSubmitting = loading !== "idle";
  const selectedPlan = initialPlans.find((plan) => plan.code === selectedPlanCode);

  useEffect(() => {
    if (selectedPlanCode) {
      setMode("register");
    }
  }, [selectedPlanCode]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(mode, new FormData(event.currentTarget));
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-visual" aria-hidden="true">
          <Play size={22} />
        </div>
        <span className="eyebrow">Acesso de desenvolvimento</span>
        <h1>Entrar no App Treino</h1>
        <p>
          Acesse sua area de aluno ou entre com perfil administrativo para acompanhar a operacao.
        </p>
        {selectedPlan && (
          <div className="selected-plan-box">
            <span>Plano selecionado</span>
            <strong>
              {selectedPlan.name} - {formatPriceInBRL(selectedPlan.priceInCents)}
            </strong>
          </div>
        )}
        <div className="auth-tabs" role="tablist" aria-label="Modo de acesso">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Cadastro
          </button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Nome
              <input name="name" minLength={2} placeholder="Seu nome" required />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" placeholder="voce@email.com" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" minLength={6} placeholder="Minimo 6 caracteres" required />
          </label>
          {mode === "register" && selectedPlan && (
            <label>
              Pagamento
              <select name="billingType" defaultValue="UNDEFINED">
                <option value="UNDEFINED">Escolher no checkout</option>
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartao</option>
              </select>
            </label>
          )}
          <button className="primary-button" disabled={isSubmitting}>
            {loading === "submitting" ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        {error && <div className="error-box">{error}</div>}
        <div className="auth-actions">
          <button className="outline-button" onClick={onAdmin} disabled={isSubmitting}>
            {loading === "admin" ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Demo admin
          </button>
          <button className="outline-button" onClick={onUser} disabled={isSubmitting}>
            {loading === "user" ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
            Demo aluno
          </button>
        </div>
      </section>
    </main>
  );
}

function AdminView({ token }: { token: string | null }) {
  const [summary, setSummary] = useState({
    users: 0,
    activeMemberships: 0,
    pendingPayments: 0,
    todayAttendance: 0
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  function optionalNumber(value: FormDataEntryValue | null) {
    const stringValue = String(value ?? "").trim();
    return stringValue ? Number(stringValue) : undefined;
  }

  async function loadAdminData() {
    if (!token) return;
    setLoading(true);
    setFeedback(null);

    try {
      const [
        summaryResponse,
        usersResponse,
        workoutsResponse,
        plansResponse,
        membershipsResponse,
        paymentsResponse,
        assessmentsResponse,
        eventsResponse,
        ticketsResponse,
        aiPlansResponse
      ] = await Promise.all([
          apiGet<typeof summary>("/admin/summary", token),
          apiGet<{ users: AdminUser[] }>("/admin/users", token),
          apiGet<{ workouts: WorkoutRow[] }>("/admin/workouts", token),
          apiGet<{ plans: PlanRow[] }>("/admin/plans", token),
          apiGet<{ memberships: MembershipRow[] }>("/admin/memberships", token),
          apiGet<{ payments: PaymentRow[] }>("/admin/payments", token),
          apiGet<{ assessments: PhysicalAssessmentRow[] }>("/admin/physical-assessments", token),
          apiGet<{ events: EventRow[] }>("/admin/events", token),
          apiGet<{ tickets: SupportTicketRow[] }>("/admin/support-tickets", token),
          apiGet<{ plans: AiWorkoutPlanRow[] }>("/admin/ai-workout-plans", token)
        ]);

      setSummary(summaryResponse);
      setUsers(usersResponse.users);
      setWorkouts(workoutsResponse.workouts);
      setPlans(plansResponse.plans);
      setMemberships(membershipsResponse.memberships);
      setPayments(paymentsResponse.payments);
      setAssessments(assessmentsResponse.assessments);
      setEvents(eventsResponse.events);
      setTickets(ticketsResponse.tickets);
      setAiPlans(aiPlansResponse.plans);
    } catch {
      setFeedback("Nao foi possivel carregar dados administrativos. Verifique API, banco e permissao.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, [token]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/users",
        {
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          role: String(data.get("role") ?? "USER"),
          objective: String(data.get("objective") ?? ""),
          level: String(data.get("level") ?? "")
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel cadastrar o usuario.");
    }
  }

  async function handleCreateWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/workouts",
        {
          title: String(data.get("title") ?? ""),
          objective: String(data.get("objective") ?? ""),
          days: [
            {
              title: String(data.get("dayTitle") ?? "Treino A"),
              exercises: String(data.get("exercises") ?? "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [name = "", sets = "3", reps = "10", restSeconds = "60"] = line.split(";");
                  return {
                    name: name.trim(),
                    sets: Number(sets),
                    reps: reps.trim(),
                    restSeconds: Number(restSeconds)
                  };
                })
            }
          ]
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel cadastrar o treino.");
    }
  }

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/plans",
        {
          code: String(data.get("code") ?? ""),
          name: String(data.get("name") ?? ""),
          priceInCents: Math.round(Number(data.get("price") ?? 0) * 100),
          billingCycle: String(data.get("billingCycle") ?? "MONTHLY")
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel cadastrar o plano.");
    }
  }

  async function handleCreateMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/memberships",
        {
          userId: String(data.get("userId") ?? ""),
          planId: String(data.get("planId") ?? ""),
          status: String(data.get("status") ?? "PENDING"),
          startsAt: String(data.get("startsAt") ?? new Date().toISOString().slice(0, 10))
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel criar a matricula.");
    }
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/payments",
        {
          membershipId: String(data.get("membershipId") ?? ""),
          amountInCents: Math.round(Number(data.get("amount") ?? 0) * 100),
          dueDate: String(data.get("dueDate") ?? new Date().toISOString().slice(0, 10)),
          billingType: String(data.get("billingType") ?? "UNDEFINED")
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel gerar o pagamento.");
    }
  }

  async function handleCreateAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/physical-assessments",
        {
          userId: String(data.get("userId") ?? ""),
          assessedAt: String(data.get("assessedAt") ?? new Date().toISOString().slice(0, 10)),
          weightKg: optionalNumber(data.get("weightKg")),
          heightCm: optionalNumber(data.get("heightCm")),
          bodyFatPct: optionalNumber(data.get("bodyFatPct")),
          waistCm: optionalNumber(data.get("waistCm")),
          chestCm: optionalNumber(data.get("chestCm")),
          hipCm: optionalNumber(data.get("hipCm")),
          notes: String(data.get("notes") ?? "")
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel registrar a avaliacao fisica.");
    }
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/events",
        {
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          startsAt: String(data.get("startsAt") ?? ""),
          location: String(data.get("location") ?? ""),
          capacity: optionalNumber(data.get("capacity"))
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel criar o evento.");
    }
  }

  async function handleUpdateTicket(ticketId: string, status: SupportTicketRow["status"]) {
    try {
      await apiPut(`/admin/support-tickets/${ticketId}`, { status }, token);
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel atualizar o atendimento.");
    }
  }

  async function handleDelete(path: string) {
    try {
      await apiDelete(path, token);
      await loadAdminData();
    } catch {
      setFeedback("Nao foi possivel excluir o registro.");
    }
  }

  const stats = [
    { icon: UsersRound, label: "Usuarios", value: String(summary.users), trend: "Total" },
    { icon: ShieldCheck, label: "Matriculas ativas", value: String(summary.activeMemberships), trend: "Ativas" },
    { icon: CreditCard, label: "Pagamentos pendentes", value: String(summary.pendingPayments), trend: "Abertos" },
    { icon: Activity, label: "Acessos hoje", value: String(summary.todayAttendance), trend: "Hoje" },
    { icon: Ruler, label: "Avaliacoes", value: String(assessments.length), trend: "Fisicas" },
    { icon: CalendarPlus, label: "Eventos", value: String(events.length), trend: "Agenda" },
    { icon: Headphones, label: "Atendimentos", value: String(tickets.length), trend: "Suporte" },
    { icon: Bot, label: "Planos IA", value: String(aiPlans.length), trend: "Gerados" }
  ];

  return (
    <main className="dashboard">
      <section className="dashboard-heading">
        <span className="eyebrow">Painel administrativo</span>
        <h1>Operacao do App Treino</h1>
        <button className="outline-button compact-button" onClick={loadAdminData} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          Atualizar
        </button>
      </section>
      {feedback && <div className="error-box">{feedback}</div>}
      <div className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <stat.icon size={22} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.trend}</small>
          </article>
        ))}
      </div>

      <section className="admin-grid">
        <article className="table-panel">
          <div className="panel-title">
            <h2>Usuarios</h2>
            <span>{users.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateUser}>
            <input name="name" placeholder="Nome" required />
            <input name="email" type="email" placeholder="E-mail" required />
            <input name="password" type="password" placeholder="Senha" minLength={6} required />
            <select name="role" defaultValue="USER">
              <option value="USER">Aluno</option>
              <option value="ADMIN">Admin</option>
            </select>
            <input name="objective" placeholder="Objetivo" />
            <input name="level" placeholder="Nivel" />
            <button className="primary-button">
              <Save size={18} />
              Salvar usuario
            </button>
          </form>
          {users.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                {item.email}
              </span>
              <small>{item.role}</small>
              <button aria-label="Excluir usuario" onClick={() => handleDelete(`/admin/users/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Treinos</h2>
            <span>{workouts.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateWorkout}>
            <input name="title" placeholder="Titulo do treino" required />
            <input name="objective" placeholder="Objetivo" />
            <input name="dayTitle" placeholder="Dia, ex: Peito e triceps" required />
            <textarea
              name="exercises"
              placeholder={"Exercicio;series;reps;descanso\nSupino reto;4;8-10;90"}
              required
            />
            <button className="primary-button">
              <Save size={18} />
              Salvar treino
            </button>
          </form>
          {workouts.slice(0, 6).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {item.days.length} dia(s)
              </span>
              <small>{item.objective ?? "Sem objetivo"}</small>
              <button aria-label="Excluir treino" onClick={() => handleDelete(`/admin/workouts/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Planos</h2>
            <span>{plans.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreatePlan}>
            <input name="code" placeholder="Codigo" required />
            <input name="name" placeholder="Nome" required />
            <input name="price" type="number" step="0.01" min="1" placeholder="Valor" required />
            <select name="billingCycle" defaultValue="MONTHLY">
              <option value="MONTHLY">Mensal</option>
              <option value="YEARLY">Anual</option>
            </select>
            <button className="primary-button">
              <Save size={18} />
              Salvar plano
            </button>
          </form>
          {plans.map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                {item.code}
              </span>
              <small>{formatPriceInBRL(item.priceInCents)}</small>
              <button aria-label="Excluir plano" onClick={() => handleDelete(`/admin/plans/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Matriculas</h2>
            <span>{memberships.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateMembership}>
            <select name="userId" required>
              <option value="">Aluno</option>
              {users
                .filter((item) => item.role === "USER")
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <select name="planId" required>
              <option value="">Plano</option>
              {plans.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="startsAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <select name="status" defaultValue="PENDING">
              <option value="PENDING">Pendente</option>
              <option value="ACTIVE">Ativa</option>
              <option value="OVERDUE">Atrasada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
            <button className="primary-button">
              <Save size={18} />
              Salvar matricula
            </button>
          </form>
          {memberships.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.user.name}</strong>
                {item.plan.name}
              </span>
              <small>{item.status}</small>
              <button aria-label="Excluir matricula" onClick={() => handleDelete(`/admin/memberships/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel wide-panel">
          <div className="panel-title">
            <h2>Pagamentos</h2>
            <span>{payments.length}</span>
          </div>
          <form className="crud-form inline-form" onSubmit={handleCreatePayment}>
            <select name="membershipId" required>
              <option value="">Matricula</option>
              {memberships.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.user.name} - {item.plan.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" min="1" placeholder="Valor" required />
            <input name="dueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <select name="billingType" defaultValue="UNDEFINED">
              <option value="UNDEFINED">Escolha do aluno</option>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDIT_CARD">Cartao</option>
            </select>
            <button className="primary-button">
              <CreditCard size={18} />
              Gerar cobranca
            </button>
          </form>
          {payments.slice(0, 10).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{formatPriceInBRL(item.amountInCents)}</strong>
                Vence em {new Date(item.dueDate).toLocaleDateString("pt-BR")}
              </span>
              <small>{item.status}</small>
              {item.paymentUrl && (
                <a href={item.paymentUrl} target="_blank" rel="noreferrer">
                  Abrir
                </a>
              )}
            </div>
          ))}
        </article>
      </section>

      <section className="admin-grid phase-three-grid">
        <article className="table-panel">
          <div className="panel-title">
            <h2>Avaliacoes fisicas</h2>
            <span>{assessments.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateAssessment}>
            <select name="userId" required>
              <option value="">Aluno</option>
              {users
                .filter((item) => item.role === "USER")
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <input name="assessedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <input name="weightKg" type="number" step="0.1" min="1" placeholder="Peso kg" />
            <input name="heightCm" type="number" step="0.1" min="1" placeholder="Altura cm" />
            <input name="bodyFatPct" type="number" step="0.1" min="0" max="100" placeholder="Gordura %" />
            <input name="waistCm" type="number" step="0.1" min="1" placeholder="Cintura cm" />
            <input name="chestCm" type="number" step="0.1" min="1" placeholder="Torax cm" />
            <input name="hipCm" type="number" step="0.1" min="1" placeholder="Quadril cm" />
            <textarea name="notes" placeholder="Observacoes da avaliacao" />
            <button className="primary-button">
              <Ruler size={18} />
              Salvar avaliacao
            </button>
          </form>
          {assessments.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.user?.name ?? "Aluno"}</strong>
                {new Date(item.assessedAt).toLocaleDateString("pt-BR")} - {item.weightKg ?? "-"} kg
              </span>
              <small>{item.bodyFatPct ? `${item.bodyFatPct}% gordura` : "Sem dobra"}</small>
              <button aria-label="Excluir avaliacao" onClick={() => handleDelete(`/admin/physical-assessments/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Eventos</h2>
            <span>{events.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateEvent}>
            <input name="title" placeholder="Titulo do evento" required />
            <input name="startsAt" type="datetime-local" required />
            <input name="location" placeholder="Local" />
            <input name="capacity" type="number" min="1" placeholder="Vagas" />
            <textarea name="description" placeholder="Descricao" />
            <button className="primary-button">
              <CalendarPlus size={18} />
              Salvar evento
            </button>
          </form>
          {events.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {new Date(item.startsAt).toLocaleString("pt-BR")} - {item.location ?? "Sem local"}
              </span>
              <small>{item.registrations?.length ?? 0}/{item.capacity ?? "sem limite"}</small>
              <button aria-label="Excluir evento" onClick={() => handleDelete(`/admin/events/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Atendimento</h2>
            <span>{tickets.length}</span>
          </div>
          {tickets.slice(0, 10).map((item) => (
            <div className="data-row ticket-row" key={item.id}>
              <span>
                <strong>{item.subject}</strong>
                {item.user?.name ?? "Aluno"} - {item.category} - {item.message}
              </span>
              <select
                aria-label="Status do atendimento"
                value={item.status}
                onChange={(event) => handleUpdateTicket(item.id, event.target.value as SupportTicketRow["status"])}
              >
                <option value="OPEN">Aberto</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
              <small>{item.priority}</small>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Agente IA</h2>
            <span>{aiPlans.length}</span>
          </div>
          {aiPlans.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.user?.name ?? "Aluno"}</strong>
                {item.plan.summary}
              </span>
              <small>{item.daysPerWeek}x/sem</small>
              <Bot size={18} />
            </div>
          ))}
        </article>
      </section>

      <section className="table-panel">
        <div className="panel-title">
          <h2>Fase 3</h2>
          <span>Implementada</span>
        </div>
        <div className="task-row">
          <Check size={18} />
          Avaliacoes fisicas com historico por aluno
        </div>
        <div className="task-row">
          <Check size={18} />
          Eventos com inscricoes e controle de vagas
        </div>
        <div className="task-row">
          <Check size={18} />
          Atendimento com tickets e status operacional
        </div>
        <div className="task-row">
          <Check size={18} />
          App mobile e agente de treino IA conectados a mesma API
        </div>
      </section>
    </main>
  );
}

function UserView({ token }: { token: string | null }) {
  const [profile, setProfile] = useState<{ name: string; objective?: string; level?: string } | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [membership, setMembership] = useState<(MembershipRow & { plan: PlanRow }) | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendance, setAttendance] = useState<Array<{ id: string; date: string }>>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadUserData() {
    if (!token) return;

    try {
      const [
        profileResponse,
        workoutResponse,
        membershipResponse,
        paymentsResponse,
        attendanceResponse,
        assessmentsResponse,
        eventsResponse,
        ticketsResponse,
        aiPlansResponse
      ] = await Promise.all([
        apiGet<{ profile: { name: string; objective?: string; level?: string } }>("/user/profile", token),
        apiGet<{ workout: WorkoutRow | null }>("/user/workout", token),
        apiGet<{ membership: (MembershipRow & { plan: PlanRow }) | null }>("/user/membership", token),
        apiGet<{ payments: PaymentRow[] }>("/user/payments", token),
        apiGet<{ records: Array<{ id: string; date: string }> }>("/user/attendance", token),
        apiGet<{ assessments: PhysicalAssessmentRow[] }>("/user/physical-assessments", token),
        apiGet<{ events: EventRow[] }>("/user/events", token),
        apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token),
        apiGet<{ plans: AiWorkoutPlanRow[] }>("/user/ai-workout-plans", token)
      ]);

      setProfile(profileResponse.profile);
      setWorkout(workoutResponse.workout);
      setMembership(membershipResponse.membership);
      setPayments(paymentsResponse.payments);
      setAttendance(attendanceResponse.records);
      setAssessments(assessmentsResponse.assessments);
      setEvents(eventsResponse.events);
      setTickets(ticketsResponse.tickets);
      setAiPlans(aiPlansResponse.plans);
    } catch {
      setError("Nao foi possivel carregar sua area. Verifique API e banco.");
    }
  }

  useEffect(() => {
    void loadUserData();
  }, [token]);

  async function handleEventRegistration(eventId: string) {
    try {
      await apiPost("/user/events/register", { eventId }, token);
      await loadUserData();
    } catch {
      setError("Nao foi possivel confirmar sua inscricao no evento.");
    }
  }

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/user/support-tickets",
        {
          subject: String(data.get("subject") ?? ""),
          message: String(data.get("message") ?? ""),
          category: String(data.get("category") ?? "GENERAL")
        },
        token
      );
      form.reset();
      await loadUserData();
    } catch {
      setError("Nao foi possivel abrir o atendimento.");
    }
  }

  async function handleCreateAiPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/user/ai-workout-plans",
        {
          objective: String(data.get("objective") ?? profile?.objective ?? "condicionamento"),
          level: String(data.get("level") ?? profile?.level ?? "iniciante"),
          daysPerWeek: Number(data.get("daysPerWeek") ?? 3),
          focus: String(data.get("focus") ?? "")
        },
        token
      );
      form.reset();
      await loadUserData();
    } catch {
      setError("Nao foi possivel gerar o plano pelo agente IA.");
    }
  }

  const firstDay = workout?.days[0];
  const pendingPayment = payments.find((item) => item.status === "PENDING");
  const latestAssessment = assessments[0];
  const latestAiPlan = aiPlans[0];

  return (
    <main className="dashboard">
      <section className="dashboard-heading">
        <span className="eyebrow">Area do aluno</span>
        <h1>{profile?.name ?? "Treino de hoje"}</h1>
      </section>
      {error && <div className="error-box">{error}</div>}
      <div className="student-grid">
        <article className="table-panel workout-panel">
          <div className="panel-title">
            <h2>Ficha atual</h2>
            <span>{firstDay?.title ?? "Sem treino"}</span>
          </div>
          {(firstDay?.exercises.length ? firstDay.exercises : workoutRows).map((exercise) => (
            <div className="exercise-row" key={exercise.name}>
              <span>{exercise.name}</span>
              <strong>{"reps" in exercise ? `${exercise.sets}x ${exercise.reps}` : exercise.sets}</strong>
              <small>{"load" in exercise ? exercise.load : `${exercise.restSeconds ?? 60}s`}</small>
            </div>
          ))}
        </article>
        <article className="table-panel">
          <div className="panel-title">
            <h2>Status</h2>
            <span>{membership?.status ?? "Sem matricula"}</span>
          </div>
          <div className="task-row">
            <CreditCard size={18} />
            {membership ? `Plano ${membership.plan.name}` : "Nenhum plano ativo"}
          </div>
          <div className="task-row">
            <CalendarDays size={18} />
            {attendance.length > 0 ? "Frequencia registrada hoje" : "Frequencia aguardando acesso"}
          </div>
          <div className="task-row">
            <MessageCircle size={18} />
            {pendingPayment ? `Pagamento pendente: ${formatPriceInBRL(pendingPayment.amountInCents)}` : "Pagamentos em dia"}
          </div>
          <div className="mini-goals">
            <span>
              <Flame size={18} />
              {attendance.length} acesso(s) recentes
            </span>
            <span>
              <Timer size={18} />
              {profile?.objective ?? "Objetivo nao informado"}
            </span>
            <span>
              <Trophy size={18} />
              {profile?.level ?? "Nivel nao informado"}
            </span>
          </div>
          {pendingPayment?.paymentUrl && (
            <a className="primary-button payment-link" href={pendingPayment.paymentUrl} target="_blank" rel="noreferrer">
              Pagar agora
              <ArrowRight size={18} />
            </a>
          )}
        </article>
      </div>

      <section className="student-grid phase-three-grid">
        <article className="table-panel">
          <div className="panel-title">
            <h2>Avaliacao fisica</h2>
            <span>{latestAssessment ? new Date(latestAssessment.assessedAt).toLocaleDateString("pt-BR") : "Sem dados"}</span>
          </div>
          {latestAssessment ? (
            <div className="metric-grid">
              <span>
                <strong>{latestAssessment.weightKg ?? "-"}</strong>
                kg
              </span>
              <span>
                <strong>{latestAssessment.heightCm ?? "-"}</strong>
                cm
              </span>
              <span>
                <strong>{latestAssessment.bodyFatPct ?? "-"}</strong>
                % gordura
              </span>
              <span>
                <strong>{latestAssessment.waistCm ?? "-"}</strong>
                cm cintura
              </span>
            </div>
          ) : (
            <div className="task-row">
              <Ruler size={18} />
              Solicite sua primeira avaliacao com a equipe.
            </div>
          )}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Eventos</h2>
            <span>{events.length}</span>
          </div>
          {events.slice(0, 4).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {new Date(item.startsAt).toLocaleString("pt-BR")} - {item.location ?? "Online"}
              </span>
              <small>{item.registrationCount ?? 0}/{item.capacity ?? "livre"}</small>
              <button disabled={item.registered} onClick={() => handleEventRegistration(item.id)}>
                {item.registered ? <Check size={17} /> : <CalendarPlus size={17} />}
              </button>
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Atendimento</h2>
            <span>{tickets.length}</span>
          </div>
          <form className="crud-form support-form" onSubmit={handleCreateTicket}>
            <input name="subject" placeholder="Assunto" required />
            <select name="category" defaultValue="GENERAL">
              <option value="GENERAL">Geral</option>
              <option value="WORKOUT">Treino</option>
              <option value="PAYMENT">Pagamento</option>
              <option value="TECHNICAL">Tecnico</option>
            </select>
            <textarea name="message" placeholder="Descreva o que voce precisa" required />
            <button className="primary-button">
              <Headphones size={18} />
              Abrir atendimento
            </button>
          </form>
          {tickets.slice(0, 3).map((item) => (
            <div className="task-row" key={item.id}>
              <MessageCircle size={18} />
              {item.subject} - {item.status}
            </div>
          ))}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <h2>Agente de Treino IA</h2>
            <span>{aiPlans.length}</span>
          </div>
          <form className="crud-form support-form" onSubmit={handleCreateAiPlan}>
            <input name="objective" placeholder="Objetivo" defaultValue={profile?.objective ?? ""} required />
            <input name="level" placeholder="Nivel" defaultValue={profile?.level ?? ""} required />
            <input name="focus" placeholder="Foco da semana" />
            <select name="daysPerWeek" defaultValue="3">
              <option value="2">2 dias</option>
              <option value="3">3 dias</option>
              <option value="4">4 dias</option>
              <option value="5">5 dias</option>
              <option value="6">6 dias</option>
            </select>
            <button className="primary-button">
              <Bot size={18} />
              Gerar plano
            </button>
          </form>
          {latestAiPlan && (
            <div className="ai-plan">
              <strong>{latestAiPlan.plan.summary}</strong>
              {latestAiPlan.plan.days.slice(0, 2).map((day) => (
                <div className="task-row" key={day.title}>
                  <ClipboardList size={18} />
                  {day.title}: {day.exercises.map((exercise) => exercise.name).join(", ")}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
