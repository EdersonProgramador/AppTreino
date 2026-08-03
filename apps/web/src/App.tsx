import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Flame,
  Headphones,
  Home,
  LineChart,
  Loader2,
  LockKeyhole,
  LogOut,
  LogIn,
  MessageCircle,
  Menu,
  Package,
  Play,
  QrCode,
  RefreshCw,
  Ruler,
  Save,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Trophy,
  UserRound,
  UsersRound
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL, initialPlans, type AuthUser } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "./api";
import { LockedOverlay } from "./components/student/LockedOverlay";
import { WorkoutPlayer, type WorkoutPlayerExercise } from "./components/student/WorkoutPlayer";

type View = "home" | "login" | "admin" | "user";
type AuthMode = "login" | "register";
type PlanCode = "monthly" | "annual";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline" | "filled_blue" | "filled_black";
              size: "large" | "medium" | "small";
              type: "standard" | "icon";
              text: "signin_with" | "signup_with" | "continue_with";
              shape: "rectangular" | "pill" | "circle" | "square";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
}

function buildMonthCalendar(year: number, month: number) {
  const firstDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingDays = firstDate.getDay();
  const cells: Array<{ day: number | null; isoDate: string | null }> = [];

  for (let index = 0; index < leadingDays; index += 1) {
    cells.push({ day: null, isoDate: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    cells.push({ day, isoDate });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, isoDate: null });
  }

  return cells;
}

const resources = [
  {
    icon: Dumbbell,
    title: "Treino pronão para seguir",
    text: "Receba sua rotina organizada por dias, exercícios, séries, repetições e descanso."
  },
  {
    icon: LineChart,
    title: "Evolução que você acompanha",
    text: "Veja frequência, histórico, avaliações e sinais claros de progresso ao longo do tempo."
  },
  {
    icon: CircleDollarSign,
    title: "Planos simples",
    text: "Escolha mensal ou anual, pague online e mantenha seu treino ativo sem complicacao."
  },
  {
    icon: MessageCircle,
    title: "Suporte quando precisar",
    text: "Tire dúvidas sobre treino, pagamento ou acesso em um canal direto com a equipe."
  }
];

const workoutRows = [
  { name: "Supino reto", sets: "4x 8-10", load: "72 kg" },
  { name: "Tríceps corda", sets: "3x 12", load: "34 kg" },
  { name: "Desenvolvimento", sets: "3x 10", load: "28 kg" }
];

const faqItems = [
  {
    question: "O App Treino e para quem quer treinar melhor?",
    answer:
      "Sim. O App Treino foi criado para pessoas que querem seguir uma rotina clara, acompanhar progresso e manter consistência nos treinos."
  },
  {
    question: "Preciso já ter experiência com academia?",
    answer:
      "Não. Você pode começar com um plano adequado ao seu nível e evoluir com orientações simples, ficha organizada e acompanhamento."
  },
  {
    question: "Consigo acesso meu treino pelo celular?",
    answer:
      "Sim. A área do aluno mostra sua ficha atual, exercícios do dia, frequência, status do plano e informações importantes do acompanhamento."
  },
  {
    question: "O App Treino também ajuda a acompanhar minha evolução?",
    answer:
      "Sim. Você pode acompanhar avaliações, histórico, eventos, atendimento e planos de treino gerados com apoio de IA."
  }
];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
  enrollmentStatus: "PENDING" | "ACTIVE" | "CANCELED";
  memberships?: Array<{ id: string; status: MembershipRow["status"] }>;
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

interface CmsExerciseRow {
  id: string;
  title?: string | null;
  name?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  targetMuscles: string[];
  equipmentTags: string[];
  alternatives: Array<{ id: string; title?: string | null; name?: string | null }>;
  modalityLinks?: Array<{ id: string; principal: boolean; modality: CmsModalityRow }>;
}

interface CmsModalityRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

interface CmsWorkoutBlockRow {
  id: string;
  title: string;
  structureType: "NORMAL" | "BI_SET" | "DROP_SET" | "REST_PAUSE";
  restTime: number;
  exercises: Array<{
    id: string;
    sets: number;
    repsRange: string;
    order: number;
    exercise: CmsExerciseRow;
  }>;
}

interface CmsProgramRow {
  id: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isActive: boolean;
  modality?: CmsModalityRow | null;
  assignedUsers?: Array<{ id: string; user: AdminUser; currentDay: number; status: "ACTIVE" | "COMPLETED" | "CANCELED" }>;
  days: Array<{
    id: string;
    dayNumber: number;
    order: number;
    workoutBlock: CmsWorkoutBlockRow;
  }>;
}

function parseProgramMetadata(description: string) {
  try {
    const parsed = JSON.parse(description) as { description?: string; modality?: string };

    return {
      description: parsed.description || description,
      modality: parsed.modality || "Hipertrofia"
    };
  } catch {
    return {
      description,
      modality: "Hipertrofia"
    };
  }
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

interface StudentMembershipRow {
  id: string;
  userId: string;
  planId: string;
  status: "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";
  startsAt: string;
  endsAt?: string | null;
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
  userá: AdminUser;
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
  userá: AdminUser;
  assignedTo?: AdminUser | null;
}

interface NotificationRow {
  id: string;
  type: "WORKOUT_PROGRAM" | "EVENT" | "WORKOUT";
  title: string;
  message: string;
  publishedAt: string;
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
  userá: AdminUser;
}

interface CheckoutSessionResponse {
  membership: StudentMembershipRow;
  payment: PaymentRow | null;
  alreadyActive: boolean;
}

interface TodayWorkoutResponse {
  workout: {
    programId: string;
    programTitle: string;
    assignmentId: string;
    dayNumber: number;
    totalDays: number;
    completed?: boolean;
    modality?: string;
    description?: string;
    completedWorkouts?: number;
    teacherNames?: string[];
    unitName?: string;
    membershipStartsAt?: string | null;
    membershipEndsAt?: string | null;
    sequence?: Array<{
      programId: string;
      programTitle: string;
      assignmentId: string;
      dayNumber: number;
      totalDays: number;
      completed?: boolean;
      block: {
        title: string;
        structureType: "NORMAL" | "BI_SET" | "DROP_SET" | "REST_PAUSE";
        restTime: number;
        exercises: WorkoutPlayerExercise[];
      };
    }>;
    block: {
      title: string;
      structureType: "NORMAL" | "BI_SET" | "DROP_SET" | "REST_PAUSE";
      restTime: number;
      exercises: WorkoutPlayerExercise[];
    };
  };
}

interface StudentWorkoutProgramsResponse {
  workouts: TodayWorkoutResponse["workout"][];
}

interface WorkoutSessionResponse {
  session: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED" | "CANCELED";
    startedAt: string;
    finishedAt?: string | null;
    durationSeconds?: number | null;
  };
}

interface WorkoutConsistencyResponse {
  year: number;
  month: number;
  completedWorkoutCount: number;
  totalWorkoutDays: number;
  completedDates: string[];
  historyDates: string[];
  sessions: Array<{
    id: string;
    dayNumber: number;
    startedAt: string;
    finishedAt: string | null;
    durationSeconds: number | null;
  }>;
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
      setLoginError("Não foi possível entrar agora. Verifique se a API e o banco estáo rodando.");
    } finally {
      setLoginState("idle");
    }
  }

  function handleStart(planCode?: string) {
    setSelectedPlanCode(planCode === "monthly" || planCode === "annual" ? planCode : null);
    setView("login");
  }

  async function handleAuthSubmit(
    mode: AuthMode,
    formData: FormData,
    provider: "EMAIL" | "GOOGLE" = "EMAIL"
  ) {
    setLoginError(null);
    setLoginState("submitting");

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const identifier = String(formData.get("identifier") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const billingType = String(formData.get("billingType") ?? "UNDEFINED");
    const idToken = String(formData.get("idToken") ?? "").trim();
    const credential = String(formData.get("credential") ?? "").trim();
    const isCheckoutRegister = mode === "register" && selectedPlanCode;
    const endpoint =
      provider === "GOOGLE"
        ? "/auth/google"
        : mode === "login"
          ? "/auth/login"
          : isCheckoutRegister
            ? "/checkout/register"
            : "/auth/register";

    const payload =
      provider === "GOOGLE"
        ? {
            name: name || "Usuário Google",
            email: email || (identifier.includes("@") ? identifier : undefined),
            phone: phone || (!identifier.includes("@") ? identifier : undefined),
            idToken: idToken || credential || undefined,
            credential: credential || idToken || undefined
          }
        : mode === "login"
          ? {
              email: email || (identifier.includes("@") ? identifier : undefined),
              phone: phone || (!identifier.includes("@") ? identifier : undefined),
              password,
              provider
            }
          : isCheckoutRegister
            ? { name, email: email || undefined, phone: phone || undefined, password, planCode: selectedPlanCode, billingType }
            : { name, email: email || undefined, phone: phone || undefined, password, provider };

    try {
      if (provider === "GOOGLE" && !idToken && !credential) {
        throw new ApiError(401, "Credencial do Google não recebida. Recarregue a página e tente novamente.");
      }

      const response = await apiPost<{ user: AuthUser; token: string }>(endpoint, payload);
      applySession(response);
      setSelectedPlanCode(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setLoginError(
        message ??
          (mode === "login"
            ? "E-mail, telefone ou senha inválidos, ou API indisponível."
            : "Não foi possível criar a conta. Verifique os dados e tente novamente.")
      );
    } finally {
      setLoginState("idle");
    }
  }

  async function handleForgotPassword(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const identifier = String(formData.get("identifier") ?? "").trim();

    try {
      await apiPost("/auth/forgot-password", {
        email: email || (identifier.includes("@") ? identifier : undefined),
        phone: phone || (!identifier.includes("@") ? identifier : undefined)
      });
      setLoginError("Se o e-mail ou telefone estiver cadastrado, as instruções de recuperação foram preparadas.");
    } catch {
      setLoginError("Não foi possível processar a recuperação de senha neste momento.");
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
      {!user && (
        <header className="topbar">
          <button className="brand" onClick={() => setView("home")} aria-label="Ir para início">
            <img className="brand-logo" src={assetUrl("assets/app-treino-logo.svg")} alt="App Treino" />
          </button>
          <nav className="nav-links" aria-label="Navegacao principal">
            <a href="#recursos" onClick={() => setView("home")}>
              Recursos
            </a>
            <a href="#planos" onClick={() => setView("home")}>
              Planos
            </a>
          </nav>
          <div className="topbar-actions">
            <button onClick={() => setView("login")}>
              <LogIn size={18} />
              Entrar
            </button>
          </div>
        </header>
      )}

      {view === "home" && <HomeView onStart={handleStart} />}
      {view === "login" && (
        <LoginView
          loading={loginState}
          error={loginError}
          selectedPlanCode={selectedPlanCode}
          onSubmit={handleAuthSubmit}
          onForgotPassword={handleForgotPassword}
          onAdmin={() => handleDemoLogin("ADMIN")}
          onUser={() => handleDemoLogin("USER")}
        />
      )}
      {view === "admin" && <AdminView token={token} onLogout={handleLogout} />}
      {view === "user" && <UserView token={token} onLogout={handleLogout} />}
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
            <span className="eyebrow">Treino digital para sua rotina</span>
            <h1>App Treino</h1>
            <p>
              Treine com mais clareza, acompanhe sua evolução e tenha sua ficha sempre a mão.
              O App Treino conecta você a planos, pagamentos e suporte em uma experiência simples
              para pessoa física.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => onStart()}>
                Começar meu treino
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
              alt="Mulher atleta usanão o App Treino em um smartphone"
            />
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <span className="eyebrow">Para quem e</span>
          <h2>Para quem quer sair do improvis? e treinar com direcao.</h2>
        </div>
        <div className="audience-grid">
          <article>
            <UserRound />
            <h3>Iniciantes</h3>
            <p>Comece com uma ficha clara, rotina simples e orientacao para manter constancia.</p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Quem já treina</h3>
            <p>Organize exercícios, acompanhe frequência e tenha mais controle da sua evolução.</p>
          </article>
          <article>
            <Sparkles />
            <h3>Rotina corrida</h3>
            <p>Tenha seu plano no celular para treinar no horario que couber no seu dia.</p>
          </article>
        </div>
      </section>

      <section className="section" id="recursos">
        <div className="section-heading">
          <span className="eyebrow">Recursos</span>
          <h2>Tudo para você treinar com mais foco e acompanhar seus resultados.</h2>
          <p>
            A experiência combina ficha de treino, frequência, pagamentos, avaliações e suporte
            para deixar sua rotina fitness mais simples no uso diário.
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
          <h2>Escolha seu plano e comece a treinar com acompanhamento.</h2>
          <p>No App Treino, você encontra uma assinatura simples para manter sua rotina ativa.</p>
        </div>
        <div className="pricing-grid">
          {initialPlans.map((plan, index) => (
            <article className={index === 1 ? "price-card featured" : "price-card"} key={plan.code}>
              {index === 1 && <span className="plan-badge">Mais escolhido</span>}
              <h3>{plan.name}</h3>
              <strong>{formatPriceInBRL(plan.priceInCents)}</strong>
              <span>{plan.billingCycle === "MONTHLY" ? "por mês" : "por ano"}</span>
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
          <p>Respostas diretas para entender como o App Treino ajuda você a treinar melhor.</p>
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
          <span className="eyebrow">Próximo passo</span>
          <h2>Transforme vontade em rotina de treino.</h2>
          <p>Comece hoje com um plano claro, acompanhamento simples e acesso direto pelo celular.</p>
        </div>
        <button className="primary-button" onClick={() => onStart()}>
          Quero meu plano
          <ArrowRight size={18} />
        </button>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <img src={assetUrl("assets/app-treino-mark.svg")} alt="" aria-hidden="true" />
          <div>
            <strong>App Treino</strong>
            <p>Treino digital, acompanhamento e planos para sua rotina fitness.</p>
          </div>
        </div>
        <nav className="footer-links" aria-label="Suporte">
          <strong>Suporte</strong>
          <a href="#faq">Central de Ajuda</a>
          <a href="#faq">Dúvidas frequentes</a>
          <a href="mailto:contato@apptreino.com">Fale conosco</a>
        </nav>
        <nav className="footer-links" aria-label="Institucional">
          <strong>Institucional</strong>
          <a href="#planos">Planos</a>
          <a href="#recursos">Recursos</a>
          <a href="#faq">Como funciona</a>
        </nav>
        <nav className="footer-links" aria-label="Legal e redes sociais">
          <strong>Legal</strong>
          <a href="#termos">Termos de Us?</a>
          <a href="#privacidade">Privacidade</a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
        </nav>
        <div className="footer-bottom">
          <span>© 2026 App Treino. Todos os direitos reservados.</span>
          <span>Feito para quem quer treinar com mais consistência.</span>
        </div>
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
        Frequência registrada hoje
      </div>
    </div>
  );
}

function LoginView({
  loading,
  error,
  selectedPlanCode,
  onSubmit,
  onForgotPassword,
  onAdmin,
  onUser
}: {
  loading: "idle" | "submitting" | "admin" | "user";
  error: string | null;
  selectedPlanCode: PlanCode | null;
  onSubmit: (mode: AuthMode, formData: FormData, provider?: "EMAIL" | "GOOGLE") => Promise<void>;
  onForgotPassword: (formData: FormData) => Promise<void>;
  onAdmin: () => Promise<void>;
  onUser: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>(selectedPlanCode ? "register" : "login");
  const formRef = useRef<HTMLFormElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const isSubmitting = loading !== "idle";
  const selectedPlan = initialPlans.find((plan) => plan.code === selectedPlanCode);

  useEffect(() => {
    if (selectedPlanCode) {
      setMode("register");
    }
  }, [selectedPlanCode]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential || !formRef.current) {
            return;
          }

          const data = new FormData(formRef.current);
          data.set("idToken", response.credential);
          data.set("credential", response.credential);
          void onSubmit(mode, data, "GOOGLE");
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: mode === "login" ? "signin_with" : "signup_with",
        shape: "rectangular",
        width: 320
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity]");

    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
      return () => existingScript.removeEventListener("load", renderGoogleButton);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.addEventListener("load", renderGoogleButton, { once: true });
    document.head.appendChild(script);

    return () => script.removeEventListener("load", renderGoogleButton);
  }, [mode, onSubmit]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(mode, new FormData(event.currentTarget), "EMAIL");
  }

  function handleGoogleSubmit() {
    if (!formRef.current) return;
    void onSubmit(mode, new FormData(formRef.current), "GOOGLE");
  }

  function handleForgotPasswordClick() {
    if (!formRef.current) return;
    void onForgotPassword(new FormData(formRef.current));
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-visual" aria-hidden="true">
          <Play size={22} />
        </div>
        <span className="eyebrow">Acesso de desenãolvimenão</span>
        <h1>Entrar no App Treino</h1>
        <p>
          Entre com e-mail, telefone ou Google para acesso sua área de aluno com o mesmo fluxo de autenticação.
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
        <form ref={formRef} className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Nome
              <input name="name" minLength={2} placeholder="Seu nome" required />
            </label>
          )}
          {mode === "login" ? (
            <label>
              E-mail ou telefone
              <input name="identifier" type="text" placeholder="Seu e-mail ou telefone" required />
            </label>
          ) : (
            <>
              <label>
                E-mail
                <input name="email" type="email" placeholder="seuemail@exemplo.com" />
              </label>
              <label>
                Telefone
                <input name="phone" type="tel" placeholder="+55 11 99999-9999" />
              </label>
            </>
          )}
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
                <option value="CREDIT_CARD">Cartão</option>
              </select>
            </label>
          )}
          {googleClientId ? (
            <div className="google-signin-button" ref={googleButtonRef} />
          ) : (
            <button className="outline-button" type="button" onClick={handleGoogleSubmit} disabled={isSubmitting}>
              {loading === "submitting" ? <Loader2 className="spin" size={18} /> : <UserRound size={18} />}
              {mode === "login" ? "Entrar com Google" : "Criar conta com Google"}
            </button>
          )}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {loading === "submitting" ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
          <button className="link-button" type="button" onClick={handleForgotPasswordClick}>
            Esqueci minha senha
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

function AdminView({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const [adminSection, setAdminSection] = useState<
    "overview" | "users" | "training" | "plans" | "memberships" | "payments" | "operations"
  >("overview");
  const [summary, setSummary] = useState({
    users: 0,
    activeMemberships: 0,
    pendingPayments: 0,
    todayAttendance: 0
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cmsModalities, setCmsModalities] = useState<CmsModalityRow[]>([]);
  const [cmsExercises, setCmsExercises] = useState<CmsExerciseRow[]>([]);
  const [cmsWorkoutBlocks, setCmsWorkoutBlocks] = useState<CmsWorkoutBlockRow[]>([]);
  const [cmsPrograms, setCmsPrograms] = useState<CmsProgramRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  function getApiErrorMessage(error: unknown, fallback: string) {
    return error instanceof ApiError ? error.message : fallback;
  }

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
        cmsModalitiesResponse,
        cmsExercisesResponse,
        cmsWorkoutBlocksResponse,
        cmsProgramsResponse,
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
          apiGet<{ modalities: CmsModalityRow[] }>("/admin/cms/modalities", token),
          apiGet<{ exercises: CmsExerciseRow[] }>("/admin/cms/exercises", token),
          apiGet<{ workoutBlocks: CmsWorkoutBlockRow[] }>("/admin/cms/workout-blocks", token),
          apiGet<{ programs: CmsProgramRow[] }>("/admin/cms/programs", token),
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
      setCmsModalities(cmsModalitiesResponse.modalities);
      setCmsExercises(cmsExercisesResponse.exercises);
      setCmsWorkoutBlocks(cmsWorkoutBlocksResponse.workoutBlocks);
      setCmsPrograms(cmsProgramsResponse.programs);
      setPlans(plansResponse.plans);
      setMemberships(membershipsResponse.memberships);
      setPayments(paymentsResponse.payments);
      setAssessments(assessmentsResponse.assessments);
      setEvents(eventsResponse.events);
      setTickets(ticketsResponse.tickets);
      setAiPlans(aiPlansResponse.plans);
    } catch {
      setFeedback("Não foi possível carregar dados administrativos. Verifique API, banco e permissão.");
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
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o usuário."));
    }
  }

  function parseTagList(value: FormDataEntryValue | null) {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function cmsExerciseLabel(exercise: CmsExerciseRow) {
    return exercise.title ?? exercise.name ?? "Exercício";
  }

  async function handleCreateCmsModality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/cms/modalities",
        {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          icon: String(data.get("icon") ?? ""),
          imageUrl: String(data.get("imageUrl") ?? ""),
          type: String(data.get("type") ?? "EXERCISE"),
          sortOrder: Number(data.get("sortOrder") ?? cmsModalities.length + 1),
          isActive: true
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar a modalidade."));
    }
  }

  function parseCmsWorkoutBlockExercises(data: FormData) {
    return Array.from({ length: 6 })
      .map((_, index) => {
        const row = index + 1;
        const exerciseId = String(data.get(`exerciseId${row}`) ?? "").trim();

        if (!exerciseId) {
          return null;
        }

        return {
          exerciseId,
          sets: Number(data.get(`sets${row}`) ?? 3),
          repsRange: String(data.get(`repsRange${row}`) ?? "10-12").trim(),
          order: row
        };
      })
      .filter((exercise): exercise is { exerciseId: string; sets: number; repsRange: string; order: number } => Boolean(exercise));
  }

  function parseCmsProgramDays(data: FormData) {
    return Array.from({ length: 7 })
      .map((_, index) => {
        const dayNumber = index + 1;
        const workoutBlockId = String(data.get(`workoutBlockId${dayNumber}`) ?? "").trim();

        if (!workoutBlockId) {
          return null;
        }

        return {
          dayNumber,
          workoutBlockId,
          order: Number(data.get(`dayOrder${dayNumber}`) ?? 1)
        };
      })
      .filter((day): day is { dayNumber: number; workoutBlockId: string; order: number } => Boolean(day));
  }

  async function handleCreateCmsExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/cms/exercises",
        {
          title: String(data.get("title") ?? ""),
          videoUrl: String(data.get("videoUrl") ?? ""),
          audioUrl: String(data.get("audioUrl") ?? ""),
          targetMuscles: parseTagList(data.get("targetMuscles")),
          equipmentTags: parseTagList(data.get("equipmentTags")),
          modalityIds: data.getAll("modalityIds").map((item) => String(item)).filter(Boolean),
          alternativeIds: parseTagList(data.get("alternativeIds"))
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o exercício CMS."));
    }
  }

  async function handleCreateCmsWorkoutBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/cms/workout-blocks",
        {
          title: String(data.get("title") ?? ""),
          structureType: String(data.get("structureType") ?? "NORMAL"),
          restTime: Number(data.get("restTime") ?? 60),
          exercises: parseCmsWorkoutBlockExercises(data)
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o bloco CMS."));
    }
  }

  async function handleCreateCmsProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/cms/programs",
        {
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          modalityId: String(data.get("modalityId") ?? ""),
          status: String(data.get("status") ?? "DRAFT"),
          isActive: String(data.get("status") ?? "DRAFT") === "PUBLISHED",
          days: parseCmsProgramDays(data)
        },
        token
      );
      form.reset();
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o programa CMS."));
    }
  }

  async function handlePublishCmsProgram(programId: string) {
    try {
      await apiPost(`/admin/cms/programs/${programId}/publish`, {}, token);
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível publicar o programa CMS."));
    }
  }

  async function handleArchiveCmsProgram(programId: string) {
    try {
      await apiPost(`/admin/cms/programs/${programId}/archive`, {}, token);
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível arquivar o programa CMS."));
    }
  }

  async function handleAssignCmsProgram(programId: string, userIds?: string[], currentDay = 1) {
    const targetUserIds = userIds?.length ? userIds : activeStudents.map((item) => item.id);

    if (targetUserIds.length === 0) {
      setFeedback("Cadastre alunos antes de atribuir o programa.");
      return;
    }

    try {
      await apiPost(`/admin/cms/programs/${programId}/assign`, { userIds: targetUserIds, currentDay }, token);
      await loadAdminData();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atribuir o programa aos alunos."));
    }
  }

  async function handleAssignCmsProgramSubmit(event: FormEvent<HTMLFormElement>, programId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = String(data.get("userId") ?? "");
    const currentDay = Number(data.get("currentDay") ?? 1);

    await handleAssignCmsProgram(programId, userId ? [userId] : undefined, currentDay);
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
      setFeedback("Não foi possível cadastrar o plano.");
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
      setFeedback("Não foi possível criar a matrícula.");
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
      setFeedback("Não foi possível gerar o pagamento.");
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
      setFeedback("Não foi possível registrar a avaliação física.");
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
      setFeedback("Não foi possível criar o evento.");
    }
  }

  async function handleUpdateTicket(ticketId: string, status: SupportTicketRow["status"]) {
    try {
      await apiPut(`/admin/support-tickets/${ticketId}`, { status }, token);
      await loadAdminData();
    } catch {
      setFeedback("Não foi possível atualizar o atendimento.");
    }
  }

  async function handleDelete(path: string) {
    try {
      await apiDelete(path, token);
      await loadAdminData();
    } catch {
      setFeedback("Não foi possível excluir o registro.");
    }
  }

  const stats = [
    { icon: UsersRound, label: "Usuários", value: String(summary.users), trend: "Total" },
    { icon: ShieldCheck, label: "Matrículas ativas", value: String(summary.activeMemberships), trend: "Ativas" },
    { icon: CreditCard, label: "Pagamentos pendentes", value: String(summary.pendingPayments), trend: "Abertos" },
    { icon: Activity, label: "Acessos hoje", value: String(summary.todayAttendance), trend: "Hoje" },
    { icon: Ruler, label: "Avaliações", value: String(assessments.length), trend: "Físicas" },
    { icon: CalendarPlus, label: "Eventos", value: String(events.length), trend: "Agenda" },
    { icon: Headphones, label: "Atendimentos", value: String(tickets.length), trend: "Suporte" },
    { icon: Bot, label: "Planos IA", value: String(aiPlans.length), trend: "Gerados" }
  ];
  const activeStudents = users.filter(
    (item) =>
      item.role === "USER" &&
      item.status === "ACTIVE" &&
      (item.enrollmentStatus === "ACTIVE" || item.memberships?.some((membership) => membership.status === "ACTIVE"))
  );

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="Menu administrativo">
        <div className="workspace-sidebar-brand">
          <img src={assetUrl("assets/app-treino-mark.svg")} alt="" aria-hidden="true" />
          <div>
            <strong>Admin</strong>
            <span>App Treino</span>
          </div>
        </div>
        <nav className="workspace-nav">
          <button className={adminSection === "overview" ? "active" : ""} onClick={() => setAdminSection("overview")}>
            <Activity size={18} />Visao geral
          </button>
          <button className={adminSection === "users" ? "active" : ""} onClick={() => setAdminSection("users")}>
            <UsersRound size={18} />Usuários
          </button>
          <button className={adminSection === "training" ? "active" : ""} onClick={() => setAdminSection("training")}>
            <Dumbbell size={18} />Treinos e CMS
          </button>
          <button className={adminSection === "plans" ? "active" : ""} onClick={() => setAdminSection("plans")}>
            <CircleDollarSign size={18} />Planos
          </button>
          <button className={adminSection === "memberships" ? "active" : ""} onClick={() => setAdminSection("memberships")}>
            <ShieldCheck size={18} />Matrículas
          </button>
          <button className={adminSection === "payments" ? "active" : ""} onClick={() => setAdminSection("payments")}>
            <CreditCard size={18} />Pagamentos
          </button>
          <button className={adminSection === "operations" ? "active" : ""} onClick={() => setAdminSection("operations")}>
            <ClipboardList size={18} />Operação
          </button>
        </nav>
        <button className="workspace-logout" onClick={onLogout}>
          <LogOut size={18} />
          Sair
        </button>
      </aside>
      <section className="workspace-content">
      <section className="dashboard-heading" id="admin-overview">
        <span className="eyebrow">Painel administrativo</span>
        <h1>Operação do App Treino</h1>
        <button className="outline-button compact-button" onClick={loadAdminData} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          Atualizar
        </button>
      </section>
      {feedback && <div className="error-box">{feedback}</div>}
      {adminSection === "overview" && <div className="stats-grid">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <stat.icon size={22} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.trend}</small>
          </article>
        ))}
      </div>}

      {adminSection === "users" && <section className="admin-grid">
        <article className="table-panel" id="admin-users">
          <div className="panel-title">
            <h2>Usuários</h2>
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
            <input name="level" placeholder="Nível" />
            <button className="primary-button">
              <Save size={18} />
              Salvar usuário
            </button>
          </form>
          {users.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                {item.email}
              </span>
              <small>{item.role}</small>
              <button aria-label="Excluir usuário" onClick={() => handleDelete(`/admin/users/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>
      </section>}

      {adminSection === "training" && <section className="admin-grid">
        <article className="table-panel wide-panel cms-panel" id="admin-cms">
          <div className="panel-title">
            <h2>CMS Fitness</h2>
            <span>Fluxo de conteúdo</span>
          </div>
          <div className="cms-workflow">
            <article>
              <strong>1</strong>
              <span>Criar modalidades</span>
              <small>{cmsModalities.filter((item) => item.isActive).length} ativa(s)</small>
            </article>
            <article>
              <strong>2</strong>
              <span>Criar exercícios</span>
              <small>{cmsExercises.length} cadastrado(s)</small>
            </article>
            <article>
              <strong>3</strong>
              <span>Montar blocos</span>
              <small>{cmsWorkoutBlocks.length} bloco(s)</small>
            </article>
            <article>
              <strong>4</strong>
              <span>Publicar programa</span>
              <small>{cmsPrograms.filter((item) => item.status === "PUBLISHED").length} publicado(s)</small>
            </article>
            <article>
              <strong>5</strong>
              <span>Atribuir e acompanhar</span>
              <small>{cmsPrograms.reduce((total, item) => total + (item.assignedUsers?.length ?? 0), 0)} atribuição(ões)</small>
            </article>
          </div>
          <div className="cms-admin-grid">
            <section>
              <div className="panel-title cms-subtitle">
                <h2>1. Modalidades</h2>
                <span>{cmsModalities.length}</span>
              </div>
              <form className="crud-form" onSubmit={handleCreateCmsModality}>
                <input name="name" placeholder="Nome da modalidade" required />
                <input name="description" placeholder="Descrição da modalidade" />
                <input name="icon" placeholder="Ícone ou emoji" />
                <input name="imageUrl" type="url" placeholder="URL da imagem" />
                <input name="sortOrder" type="number" min="0" defaultValue={cmsModalities.length + 1} placeholder="Ordem" />
                <button className="primary-button">
                  <Save size={18} />
                  Salvar modalidade
                </button>
              </form>
              {cmsModalities.slice(0, 10).map((item) => (
                <div className="data-row cms-data-row" key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    {item.description || item.slug} | ID: {item.id}
                  </span>
                  <small>{item.isActive ? "Ativa" : "Inativa"} - ordem {item.sortOrder}</small>
                  <button aria-label="Desativar modalidade" onClick={() => handleDelete(`/admin/cms/modalities/${item.id}`)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>

            <section>
              <div className="panel-title cms-subtitle">
                <h2>2. Exercícios/Aulas</h2>
                <span>{cmsExercises.length}</span>
              </div>
              <form className="crud-form" onSubmit={handleCreateCmsExercise}>
                <input name="title" placeholder="Título do exercício" required />
                <input name="videoUrl" type="url" placeholder="URL do vídeo, imagem ou GIF" />
                <input name="audioUrl" type="url" placeholder="URL do ?udio" />
                <input name="targetMuscles" placeholder="Musculos, separados por virgula" />
                <input name="equipmentTags" placeholder="Equipamentos, separados por virgula" />
                <select name="modalityIds" multiple>
                  {cmsModalities
                    .filter((item) => item.isActive)
                    .map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}
                      </option>
                    ))}
                </select>
                <input name="alternativeIds" placeholder="IDs de alternativas, separados por virgula" />
                <button className="primary-button">
                  <Save size={18} />
                  Salvar exercício CMS
                </button>
              </form>
              {cmsExercises.slice(0, 8).map((item) => (
                <div className="data-row cms-data-row" key={item.id}>
                  <span>
                    <strong>{item.title ?? item.name ?? "Exercício"}</strong>
                    {(item.modalityLinks ?? []).map((link) => link.modality.name).join(", ") || "Sem modalidade"} | ID: {item.id}
                  </span>
                  <small>{item.equipmentTags.join(", ") || "Sem equipamento"}</small>
                  <button aria-label="Excluir exercício CMS" onClick={() => handleDelete(`/admin/cms/exercises/${item.id}`)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>

            <section>
              <div className="panel-title cms-subtitle">
                <h2>3. Treinos/Fichas</h2>
                <span>{cmsWorkoutBlocks.length}</span>
              </div>
              <form className="crud-form" onSubmit={handleCreateCmsWorkoutBlock}>
                <input name="title" placeholder="Título do bloco" required />
                <select name="structureType" defaultValue="NORMAL">
                  <option value="NORMAL">Normal</option>
                  <option value="BI_SET">Bi-set</option>
                  <option value="DROP_SET">Drop-set</option>
                  <option value="REST_PAUSE">Rest-pause</option>
                </select>
                <input name="restTime" type="number" min="0" defaultValue="60" placeholder="Descanso em segundos" required />
                <div className="cms-builder-list">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const row = index + 1;

                    return (
                      <div className="cms-builder-row" key={`block-exercise-${row}`}>
                        <select name={`exerciseId${row}`} required={row === 1} defaultValue="">
                          <option value="">{row === 1 ? "Selecione o exercício" : "Exercício opcional"}</option>
                          {cmsExercises.map((exercise) => (
                            <option value={exercise.id} key={exercise.id}>
                              {cmsExerciseLabel(exercise)}
                            </option>
                          ))}
                        </select>
                        <input name={`sets${row}`} type="number" min="1" defaultValue="3" aria-label={`Séries do exercício ${row}`} />
                        <input name={`repsRange${row}`} defaultValue="10-12" aria-label={`Repetições do exercício ${row}`} />
                      </div>
                    );
                  })}
                </div>
                <button className="primary-button">
                  <Save size={18} />
                  Salvar bloco CMS
                </button>
              </form>
              {cmsWorkoutBlocks.slice(0, 8).map((item) => (
                <div className="data-row cms-data-row" key={item.id}>
                  <span>
                    <strong>{item.title}</strong>
                    {item.exercises.map((row) => row.exercise.title ?? row.exercise.name ?? "Exercício").join(", ") || "Sem exercícios"} | ID: {item.id}
                  </span>
                  <small>{item.structureType} - {item.restTime}s</small>
                  <button aria-label="Excluir bloco CMS" onClick={() => handleDelete(`/admin/cms/workout-blocks/${item.id}`)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>

            <section className="cms-program-section">
              <div className="panel-title cms-subtitle">
                <h2>4. Programas publicados</h2>
                <span>{cmsPrograms.length}</span>
              </div>
              <form className="crud-form" onSubmit={handleCreateCmsProgram}>
                <input name="title" placeholder="Título do programa" required />
                <select name="modalityId" required defaultValue="">
                  <option value="">Selecione a modalidade</option>
                  {cmsModalities
                    .filter((item) => item.isActive)
                    .map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}
                      </option>
                    ))}
                </select>
                <select name="status" defaultValue="DRAFT">
                  <option value="DRAFT">Salvar como rascunho</option>
                  <option value="PUBLISHED">Publicar agora</option>
                </select>
                <textarea name="description" placeholder="Descrição do programa" required />
                <div className="cms-builder-list">
                  {Array.from({ length: 7 }).map((_, index) => {
                    const dayNumber = index + 1;

                    return (
                      <div className="cms-builder-row program-day-row" key={`program-day-${dayNumber}`}>
                        <span>Dia {dayNumber}</span>
                        <select name={`workoutBlockId${dayNumber}`} required={dayNumber === 1} defaultValue="">
                          <option value="">{dayNumber === 1 ? "Selecione o bloco" : "Bloco opcional"}</option>
                          {cmsWorkoutBlocks.map((block) => (
                            <option value={block.id} key={block.id}>
                              {block.title}
                            </option>
                          ))}
                        </select>
                        <input name={`dayOrder${dayNumber}`} type="number" min="1" defaultValue="1" aria-label={`Ordem do dia ${dayNumber}`} />
                      </div>
                    );
                  })}
                </div>
                <button className="primary-button">
                  <Save size={18} />
                  Salvar programa CMS
                </button>
              </form>
              {cmsPrograms.slice(0, 8).map((item) => (
                <article className="cms-program-card" key={item.id}>
                  <div className="cms-program-main">
                    <span className={`cms-status ${item.status.toLowerCase()}`}>{item.status}</span>
                    <h3>{item.title}</h3>
                    <p>{parseProgramMetadata(item.description).description}</p>
                    <small>Modalidade: {item.modality?.name ?? parseProgramMetadata(item.description).modality}</small>
                    <small>{item.days.map((day) => `Dia ${day.dayNumber}: ${day.workoutBlock.title}`).join(" | ") || "Sem dias cadastrados"}</small>
                  </div>
                  <div className="cms-program-actions">
                    <button className="outline-button" onClick={() => handlePublishCmsProgram(item.id)} disabled={item.status === "PUBLISHED"}>
                      <Check size={17} />
                      Publicar
                    </button>
                    <button className="outline-button" onClick={() => handleArchiveCmsProgram(item.id)} disabled={item.status === "ARCHIVED"}>
                      <LockKeyhole size={17} />
                      Arquivar
                    </button>
                    <button className="outline-button danger-button" onClick={() => handleDelete(`/admin/cms/programs/${item.id}`)}>
                      <Trash2 size={17} />
                      Excluir
                    </button>
                  </div>
                  <form className="cms-assign-form" onSubmit={(event) => handleAssignCmsProgramSubmit(event, item.id)}>
                    <select name="userId" disabled={item.status !== "PUBLISHED"}>
                      <option value="">Todos os alunos</option>
                      {activeStudents.map((user) => (
                          <option value={user.id} key={user.id}>
                            {user.name}
                          </option>
                        ))}
                    </select>
                    <input name="currentDay" type="number" min="1" defaultValue="1" disabled={item.status !== "PUBLISHED"} />
                    <button className="primary-button" disabled={item.status !== "PUBLISHED"}>
                      <UsersRound size={17} />
                      Atribuir
                    </button>
                  </form>
                  <div className="cms-assignment-list">
                    <strong>4. Acompanhamento</strong>
                    {(item.assignedUsers ?? []).length > 0 ? (
                      item.assignedUsers?.slice(0, 8).map((assignment) => (
                        <span key={assignment.id}>
                          {assignment.user.name} • dia {assignment.currentDay} • {assignment.status}
                        </span>
                      ))
                    ) : (
                      <span>Nenhum aluno atribuído.</span>
                    )}
                  </div>
                </article>
              ))}
            </section>
          </div>
        </article>
      </section>}

      {adminSection === "plans" && <section className="admin-grid single-section-grid">
        <article className="table-panel" id="admin-plans">
          <div className="panel-title">
            <h2>Planos</h2>
            <span>{plans.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreatePlan}>
            <input name="code" placeholder="Código" required />
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
      </section>}

      {adminSection === "memberships" && <section className="admin-grid single-section-grid">
        <article className="table-panel" id="admin-memberships">
          <div className="panel-title">
            <h2>Matrículas</h2>
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
              Salvar matrícula
            </button>
          </form>
          {memberships.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.user.name}</strong>
                {item.plan.name}
              </span>
              <small>{item.status}</small>
              <button aria-label="Excluir matrícula" onClick={() => handleDelete(`/admin/memberships/${item.id}`)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>
      </section>}

      {adminSection === "payments" && <section className="admin-grid single-section-grid">
        <article className="table-panel wide-panel" id="admin-payments">
          <div className="panel-title">
            <h2>Pagamentos</h2>
            <span>{payments.length}</span>
          </div>
          <form className="crud-form inline-form" onSubmit={handleCreatePayment}>
            <select name="membershipId" required>
              <option value="">Matrícula</option>
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
              <option value="CREDIT_CARD">Cartão</option>
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
      </section>}

      {adminSection === "operations" && <section className="admin-grid phase-three-grid" id="admin-operations">
        <article className="table-panel">
          <div className="panel-title">
            <h2>Avaliações físicas</h2>
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
            <input name="chestCm" type="number" step="0.1" min="1" placeholder="Tórax cm" />
            <input name="hipCm" type="number" step="0.1" min="1" placeholder="Quadril cm" />
            <textarea name="notes" placeholder="Observações da avaliação" />
            <button className="primary-button">
              <Ruler size={18} />
              Salvar avaliação
            </button>
          </form>
          {assessments.slice(0, 8).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.userá.name ?? "Aluno"}</strong>
                {new Date(item.assessedAt).toLocaleDateString("pt-BR")} - {item.weightKg ?? "-"} kg
              </span>
              <small>{item.bodyFatPct ? `${item.bodyFatPct}% gordura` : "Sem dobra"}</small>
              <button aria-label="Excluir avaliação" onClick={() => handleDelete(`/admin/physical-assessments/${item.id}`)}>
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
            <input name="title" placeholder="Título do evento" required />
            <input name="startsAt" type="datetime-local" required />
            <input name="location" placeholder="Local" />
            <input name="capacity" type="number" min="1" placeholder="Vagas" />
            <textarea name="description" placeholder="Descrição" />
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
                {item.userá.name ?? "Aluno"} - {item.category} - {item.message}
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
                <strong>{item.userá.name ?? "Aluno"}</strong>
                {item.plan.summary}
              </span>
              <small>{item.daysPerWeek}x/sem</small>
              <Bot size={18} />
            </div>
          ))}
        </article>
      </section>}

      </section>
    </main>
  );
}

function UserView({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const [studentSection, setStudentSection] = useState<
    | "home"
    | "payments"
    | "training"
    | "products"
    | "menu"
    | "subscription"
    | "locked"
    | "player"
    | "status"
    | "assessments"
    | "events"
    | "support"
    | "ai"
  >("home");
  const [profile, setProfile] = useState<{ name: string; objective?: string; level?: string } | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse["workout"] | null>(null);
  const [publishedWorkouts, setPublishedWorkouts] = useState<TodayWorkoutResponse["workout"][]>([]);
  const [selectedWorkoutModality, setSelectedWorkoutModality] = useState<string | null>(null);
  const [workoutSession, setWorkoutSession] = useState<WorkoutSessionResponse["session"] | null>(null);
  const [consistency, setConsistency] = useState<WorkoutConsistencyResponse | null>(null);
  const [membership, setMembership] = useState<StudentMembershipRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendance, setAttendance] = useState<Array<{ id: string; date: string }>>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [checkoutPayment, setCheckoutPayment] = useState<PaymentRow | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"plans" | "checkout" | "thanks">("plans");
  const [checkoutLoading, setCheckoutLoading] = useState<PlanCode | "sandbox" | null>(null);
  const [streakCalendarOpen, setStreakCalendarOpen] = useState(false);
  const [streakCalendarMonth, setStreakCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const [checkoutDraft, setCheckoutDraft] = useState<{
    planCode: PlanCode;
    billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  }>({
    planCode: "monthly",
    billingType: "UNDEFINED"
  });
  const [error, setError] = useState<string | null>(null);

  async function loadUserData() {
    if (!token) return;

    try {
      const [profileResponse, membershipResponse, paymentsResponse, workoutProgramsResponse] = await Promise.all([
        apiGet<{ profile: { name: string; objective?: string; level?: string } }>("/user/profile", token),
        apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token),
        apiGet<{ payments: PaymentRow[] }>("/user/payments", token),
        apiGet<StudentWorkoutProgramsResponse>("/student/workout/programs", token).catch(() => ({ workouts: [] }))
      ]);

      const activeMembership = membershipResponse.membership?.status === "ACTIVE";
      const firstPublishedWorkout = workoutProgramsResponse.workouts[0] ?? null;

      setProfile(profileResponse.profile);
      setMembership(membershipResponse.membership);
      setPayments(paymentsResponse.payments);
      setPublishedWorkouts(workoutProgramsResponse.workouts);
      setTodayWorkout(firstPublishedWorkout);
      setCheckoutPayment(paymentsResponse.payments.find((item) => item.status === "PENDING") ?? null);

      if (!activeMembership) {
        if (paymentsResponse.payments.some((item) => item.status === "PENDING")) {
          setCheckoutStep("checkout");
        }
        setWorkout(null);
        setTodayWorkout(null);
        setPublishedWorkouts([]);
        setWorkoutSession(null);
        setConsistency(null);
        setAttendance([]);
        setAssessments([]);
        setEvents([]);
        setTickets([]);
        setNotifications([]);
        setNotificationsOpen(false);
        setAiPlans([]);
        return;
      }

      setCheckoutStep("plans");

      const [
        workoutResponse,
        attendanceResponse,
        assessmentsResponse,
        eventsResponse,
        ticketsResponse,
        notificationsResponse,
        aiPlansResponse,
        consistencyResponse
      ] = await Promise.all([
        apiGet<{ workout: WorkoutRow | null }>("/user/workout", token),
        apiGet<{ records: Array<{ id: string; date: string }> }>("/user/attendance", token),
        apiGet<{ assessments: PhysicalAssessmentRow[] }>("/user/physical-assessments", token),
        apiGet<{ events: EventRow[] }>("/user/events", token),
        apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token),
        apiGet<{ notifications: NotificationRow[] }>("/user/notifications", token),
        apiGet<{ plans: AiWorkoutPlanRow[] }>("/user/ai-workout-plans", token),
        apiGet<WorkoutConsistencyResponse>("/student/workout/consistency", token).catch(() => null)
      ]);

      setWorkout(workoutResponse.workout);
      setAttendance(attendanceResponse.records);
      setAssessments(assessmentsResponse.assessments);
      setEvents(eventsResponse.events);
      setTickets(ticketsResponse.tickets);
      setNotifications(notificationsResponse.notifications);
      setAiPlans(aiPlansResponse.plans);
      setConsistency(consistencyResponse);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível carregar sua área. Verifique API e banco.");
    }
  }

  useEffect(() => {
    void loadUserData();
  }, [token]);

  useEffect(() => {
    setSelectedWorkoutModality(null);
  }, [publishedWorkouts]);

  async function handleEventRegistration(eventId: string) {
    try {
      await apiPost("/user/events/register", { eventId }, token);
      await loadUserData();
    } catch {
      setError("Não foi possível confirmar sua inscrição no evento.");
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
      setError("Não foi possível abrir o atendimento.");
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
          objective: String(data.get("objective") ?? profile?.objective ?? "condicionamenão"),
          level: String(data.get("level") ?? profile?.level ?? "iniciante"),
          daysPerWeek: Number(data.get("daysPerWeek") ?? 3),
          focus: String(data.get("focus") ?? "")
        },
        token
      );
      form.reset();
      await loadUserData();
    } catch {
      setError("Não foi possível gerar o plano pelo agente IA.");
    }
  }

  async function handleCreateCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const planCode = String(data.get("planCode") ?? checkoutDraft.planCode) as PlanCode;
    const billingType = String(data.get("billingType") ?? checkoutDraft.billingType) as
      | "BOLETO"
      | "CREDIT_CARD"
      | "PIX"
      | "UNDEFINED";

    setError(null);
    setCheckoutLoading(planCode);
    setCheckoutDraft({
      planCode,
      billingType
    });

    try {
      const response = await apiPost<CheckoutSessionResponse>(
        "/checkout/session",
        {
          planCode,
          billingType
        },
        token
      );

      setMembership(response.membership);
      setCheckoutPayment(response.payment);
      if (response.payment) {
        setPayments((current) => {
          const others = current.filter((item) => item.id !== response.payment?.id);
          return [response.payment, ...others].filter(Boolean) as PaymentRow[];
        });
      }
      setCheckoutStep(response.alreadyActive ? "thanks" : "checkout");
      if (response.alreadyActive) {
        await loadUserData();
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível iniciar o checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleConfirmSandboxPayment() {
    if (!token || !checkoutPayment) return;

    setError(null);
    setCheckoutLoading("sandbox");

    try {
      const response = await apiPost<{ membership: StudentMembershipRow; payment: PaymentRow }>(
        "/checkout/confirm-sandbox",
        {
          paymentId: checkoutPayment.id
        },
        token
      );

      setMembership(response.membership);
      setCheckoutPayment(response.payment);
      await loadUserData();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível confirmar o pagamento sandbox.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleRequestSubstitutes(exerciseId: string) {
    const response = await apiPost<{ alternatives: WorkoutPlayerExercise["alternatives"] }>(
      "/student/workout/substitute",
      { exerciseId },
      token
    );

    return response.alternatives;
  }

  async function handleStartWorkoutSession(workoutToStart = todayWorkout) {
    if (!workoutToStart) return;

    setTodayWorkout(workoutToStart);
    setWorkoutSession(null);
    setStudentSection("player");
  }

  async function handleBeginWorkoutSession() {
    if (!todayWorkout) return;

    try {
      const response = await apiPost<WorkoutSessionResponse>(
        "/student/workout/start-session",
        {
          assignmentId: todayWorkout.assignmentId,
          dayNumber: todayWorkout.dayNumber
        },
        token
      );
      setWorkoutSession(response.session);
      return response.session;
    } catch {
      setError("Não foi possível iniciar o cronômetro do treino.");
      throw new Error("Não foi possível iniciar o cronômetro do treino.");
    }
  }

  async function handleCompleteWorkoutDay() {
    if (!todayWorkout) return;

    try {
      await apiPost(
        "/student/workout/complete-day",
        {
          assignmentId: todayWorkout.assignmentId,
          sessionId: workoutSession?.id
        },
        token
      );
      setWorkoutSession(null);
      await loadUserData();
      setStudentSection("home");
    } catch {
      setError("Não foi possível concluir o treino agora.");
    }
  }

  async function handleCancelWorkoutSession() {
    if (!workoutSession?.id) {
      setWorkoutSession(null);
      return;
    }

    try {
      await apiPost(
        "/student/workout/cancel-session",
        {
          sessionId: workoutSession.id
        },
        token
      );
      setWorkoutSession(null);
    } catch {
      setError("Não foi possível cancelar o treino agora.");
    }
  }

  async function handleExerciseProgressChange(input: {
    sessionId?: string | null;
    exerciseId: string;
    completed: boolean;
    weightUsed: number;
    repsCompleted: number;
    sets: number;
  }) {
    await apiPost(
      "/student/workout/exercise-progress",
      {
        ...input,
        sessionId: input.sessionId ?? workoutSession?.id
      },
      token
    );
  }

  const firstDay = workout?.days[0];
  const pendingPayment = payments.find((item) => item.status === "PENDING");
  const latestAssessment = assessments[0];
  const latestAiPlan = aiPlans[0];
  const hasActiveMembership = membership?.status === "ACTIVE";
  const hasStudentAreaAccess = hasActiveMembership;
  const currentCheckoutPayment = checkoutPayment ?? pendingPayment;
  const lockedFeatures = [
    {
      icon: Dumbbell,
      title: "Ficha atual",
      text: "Treinos, exercícios, séries, repetições e descanso."
    },
    {
      icon: Ruler,
      title: "Avalia??o física",
      text: "Medidas, histórico corporal e acompanhamento de evolução."
    },
    {
      icon: CalendarPlus,
      title: "Eventos",
      text: "Inscricoes em aulas, desafios e enãontros da comunidade."
    },
    {
      icon: Headphones,
      title: "Atendimento",
      text: "Abertura de chamados para suporte de treino, pagamento e acesso."
    },
    {
      icon: Bot,
      title: "Agente de Treino IA",
      text: "Geração de planos personalizados conãorme objetivo e nível."
    }
  ];
  const cmsExercisesToday = todayWorkout?.block.exercises ?? [];
  const cmsMusclesToday = Array.from(
    new Set(cmsExercisesToday.flatMap((exercise) => exercise.targetMuscles ?? []))
  );
  const totalWorkoutDaysFromPrograms = publishedWorkouts.reduce((total, item) => total + item.totalDays, 0);
  const totalWorkoutDays = consistency?.totalWorkoutDays ?? totalWorkoutDaysFromPrograms;
  const workoutsCompleted = Math.min(consistency?.completedWorkoutCount ?? 0, totalWorkoutDays);
  const workoutProgressPercent = Math.min(100, Math.round((workoutsCompleted / Math.max(totalWorkoutDays, 1)) * 100));
  const publishedModalities = useMemo(
    () =>
      Array.from(new Set(publishedWorkouts.map((item) => item.modality ?? "Hipertrofia"))).map((modality) => ({
        modality,
        count: publishedWorkouts.filter((item) => (item.modality ?? "Hipertrofia") === modality).length
      })),
    [publishedWorkouts]
  );
  const modalityWorkouts = selectedWorkoutModality
    ? publishedWorkouts.filter((item) => (item.modality ?? "Hipertrofia") === selectedWorkoutModality)
    : [];
  const workoutSheet = modalityWorkouts[0] ?? (selectedWorkoutModality && todayWorkout?.modality === selectedWorkoutModality ? todayWorkout : null);
  const workoutSequence = workoutSheet?.sequence?.length ? workoutSheet.sequence : publishedWorkouts;
  const sheetCompleted = Math.min(workoutSheet?.completedWorkouts ?? workoutsCompleted, workoutSheet?.totalDays ?? totalWorkoutDays);
  const sheetTotal = workoutSheet?.totalDays ?? totalWorkoutDays;
  const sheetProgressPercent = Math.min(100, Math.round((sheetCompleted / Math.max(sheetTotal, 1)) * 100));
  const currentSequenceWorkout = workoutSequence.find((item) => item.dayNumber === workoutSheet?.dayNumber) ?? workoutSequence[0];
  const formatStudentDate = (date?: string | null) => (date ? new Date(date).toLocaleDateString("pt-BR") : "Não informado");
  const studentCode = profile?.name ? String(profile.name.length * 193 + 1) : "1931";
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentCalendarMonth = currentDate.getMonth() + 1;
  const currentMonth = useMemo(
    () => ({
      year: currentYear,
      month: streakCalendarMonth
    }),
    [currentYear, streakCalendarMonth]
  );
  const calendarCells = useMemo(
    () => buildMonthCalendar(currentMonth.year, currentMonth.month),
    [currentMonth.month, currentMonth.year]
  );
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const streakDateSet = useMemo(
    () => new Set(consistency?.historyDates ?? consistency?.completedDates ?? []),
    [consistency?.completedDates, consistency?.historyDates]
  );
  const monthPrefix = `${currentMonth.year}-${String(currentMonth.month).padStart(2, "0")}-`;
  const completedDateSet = useMemo(
    () => new Set(Array.from(streakDateSet).filter((date) => date.startsWith(monthPrefix))),
    [monthPrefix, streakDateSet]
  );
  const currentStreak = useMemo(() => {
    const date = new Date();
    const todayKey = date.toISOString().slice(0, 10);

    if (!streakDateSet.has(todayKey)) {
      date.setDate(date.getDate() - 1);
      const yesterdayKey = date.toISOString().slice(0, 10);

      if (!streakDateSet.has(yesterdayKey)) {
        return 0;
      }
    }

    let streak = 0;

    while (streakDateSet.has(date.toISOString().slice(0, 10))) {
      streak += 1;
      date.setDate(date.getDate() - 1);
    }

    return streak;
  }, [streakDateSet]);

  if (!hasStudentAreaAccess) {
    return (
      <main className="workspace-shell">
        <aside className="workspace-sidebar" aria-label="Menu do aluno">
          <div className="workspace-sidebar-brand">
            <img src={assetUrl("assets/app-treino-mark.svg")} alt="" aria-hidden="true" />
            <div>
              <strong>Aluno</strong>
              <span>{profile?.name ?? "App Treino"}</span>
            </div>
          </div>
          <nav className="workspace-nav">
            <button className={studentSection === "subscription" ? "active" : ""} onClick={() => setStudentSection("subscription")}>
              <CreditCard size={18} />Assinatura
            </button>
            <button className={studentSection === "locked" ? "active" : ""} onClick={() => setStudentSection("locked")}>
              <LockKeyhole size={18} />Conteúdos
            </button>
          </nav>
          <button className="workspace-logout" onClick={onLogout}>
            <LogOut size={18} />
            Sair
          </button>
        </aside>
        <section className="workspace-content">
        <section className="dashboard-heading">
          <span className="eyebrow">área do aluno</span>
          <h1>{profile?.name ?? "Comece a treinar"}</h1>
        </section>
        {error && <div className="error-box">{error}</div>}
        {(studentSection === "subscription" || !["subscription", "locked"].includes(studentSection)) && <section className="subscription-flow">
          <div className="flow-steps" aria-label="Fluxo de assinatura">
            {["Login", "Assinatura", "Checkout", "Obrigado", "Acesso liberado"].map((step, index) => (
              <span
                className={
                  index === 0 ||
                  (checkoutStep !== "plans" && index <= 2) ||
                  (checkoutStep === "thanks" && index <= 4)
                    ? "active"
                    : ""
                }
                key={step}
              >
                {step}
              </span>
            ))}
          </div>

          {checkoutStep === "thanks" ? (
            <article className="table-panel checkout-panel">
              <div className="auth-visual" aria-hidden="true">
                <Check size={22} />
              </div>
              <span className="eyebrow">Obrigado</span>
              <h2>{membership?.status === "ACTIVE" ? "Seu acesso está liberado." : "Pagamento em processamenão."}</h2>
              <p>
                {membership?.status === "ACTIVE"
                  ? "A assinatura foi confirmada e as funcionalidades do aluno já estáo disponíveis."
                  : "Assim que o Asaas confirmar a assinatura, sua área de treino será liberada automaticamente."}
              </p>
              <div className="checkout-actions">
                <button className="primary-button" onClick={() => void loadUserData()}>
                  <RefreshCw size={18} />
                  Atualizar acesso
                </button>
                <button className="outline-button" onClick={() => setCheckoutStep("checkout")}>
                  Voltar ao checkout
                </button>
                <button className="outline-button" onClick={() => setCheckoutStep("plans")}>
                  Voltar para assinatura
                </button>
              </div>
            </article>
          ) : checkoutStep === "checkout" && currentCheckoutPayment ? (
            <article className="table-panel checkout-panel">
              <span className="eyebrow">Tela de checkout</span>
              <h2>Finalize sua assinatura.</h2>
              <p>
                Pagamento pendente de {formatPriceInBRL(currentCheckoutPayment.amountInCents)}. Depois da confirmação,
                você será levado para a etapa de obrigado e o acesso será liberado.
              </p>
              <div className="checkout-actions">
                {currentCheckoutPayment.paymentUrl && (
                  <a className="primary-button" href={currentCheckoutPayment.paymentUrl} target="_blank" rel="noreferrer">
                    Abrir checkout
                    <ArrowRight size={18} />
                  </a>
                )}
                {!currentCheckoutPayment.paymentUrl && (
                  <button
                    className="primary-button"
                    onClick={handleConfirmSandboxPayment}
                    disabled={checkoutLoading === "sandbox"}
                  >
                    {checkoutLoading === "sandbox" ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
                    Finalizar checkout sandbox
                  </button>
                )}
                <button className="outline-button" onClick={() => setCheckoutStep("plans")}>
                  Voltar para assinatura
                </button>
                <button className="outline-button" onClick={() => setCheckoutStep("thanks")}>
                  J? concluí o pagamento
                </button>
              </div>
            </article>
          ) : (
            <article className="table-panel checkout-panel">
              <span className="eyebrow">Assinatura</span>
              <h2>Comece a treinar com acesso completo.</h2>
              <p>
                Escolha uma assinatura para ir ao checkout. As fichas, eventos, avaliações, atendimento
                e agente IA ficam liberados depois da confirmação do pagamento.
              </p>
              <form className="checkout-form" onSubmit={handleCreateCheckout}>
                <div className="checkout-plan-grid">
                  {initialPlans.map((plan) => (
                    <label className="checkout-planãoption" key={plan.code}>
                      <input
                        name="planCode"
                        type="radio"
                        value={plan.code}
                        checked={checkoutDraft.planCode === plan.code}
                        onChange={() =>
                          setCheckoutDraft((current) => ({
                            ...current,
                            planCode: plan.code
                          }))
                        }
                      />
                      <span>
                        <strong>{plan.name}</strong>
                        {formatPriceInBRL(plan.priceInCents)}
                      </span>
                    </label>
                  ))}
                </div>
                <label>
                  Pagamento
                  <select
                    name="billingType"
                    value={checkoutDraft.billingType}
                    onChange={(event) =>
                      setCheckoutDraft((current) => ({
                        ...current,
                        billingType: event.target.value as typeof current.billingType
                      }))
                    }
                  >
                    <option value="UNDEFINED">Escolher no checkout</option>
                    <option value="PIX">Pix</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="CREDIT_CARD">Cartão</option>
                  </select>
                </label>
                <button className="primary-button" disabled={Boolean(checkoutLoading)}>
                  {checkoutLoading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                  Comece a treinar
                </button>
              </form>
            </article>
          )}
        </section>}
        {studentSection === "locked" && <section className="locked-content" aria-label="Funcionalidades bloqueadas">
          <LockedOverlay onCheckout={() => setCheckoutStep("checkout")} />
          <div className="section-heading locked-heading">
            <span className="eyebrow">Acesso apos pagamento</span>
            <h2>Conteúdos bloqueados enquando sua assinatura não for confirmada.</h2>
          </div>
          <div className="locked-grid">
            {lockedFeatures.map((feature) => (
              <article className="locked-card" key={feature.title}>
                <div className="locked-card-header">
                  <feature.icon size={22} />
                  <LockKeyhole size={18} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>}
        </section>
      </main>
    );
  }

  return (
    <main className="student-app-shell">
      <section className="student-app-header">
        <div className="student-avatar">
          <UserRound size={34} />
        </div>
        <div>
          <strong>{profile?.name ?? "Aluno"}</strong>
          <span>Código: {studentCode}</span>
        </div>
        <div className="student-header-actions">
          <button className="student-streak-button" aria-label={`Ofensiva de ${currentStreak} dias`} onClick={() => setStreakCalendarOpen(true)}>
            <Flame size={18} />
            <span>Ofensiva</span>
            <strong>{currentStreak}</strong>
          </button>
          <div className="student-notification-wrap">
            <button className="student-icon-button" aria-label="Notificações" onClick={() => setNotificationsOpen((open) => !open)}>
              <Bell size={24} />
              {notifications.length > 0 && <span className="student-notification-badge">{notifications.length}</span>}
            </button>
            {notificationsOpen && (
              <section className="student-notification-panel" aria-label="Notificações publicadas">
                <div>
                  <strong>Notificações</strong>
                  <span>{notifications.length}</span>
                </div>
                {notifications.length > 0 ? (
                  notifications.slice(0, 8).map((notification) => (
                    <article key={notification.id}>
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>{new Date(notification.publishedAt).toLocaleDateString("pt-BR")}</small>
                    </article>
                  ))
                ) : (
                  <article>
                    <strong>Nenhuma publicação</strong>
                    <span>Novidades publicadas pelo admin aparecerao aqui.</span>
                  </article>
                )}
              </section>
            )}
          </div>
        </div>
      </section>

      <section className="student-app-content">
        {error && <div className="error-box">{error}</div>}

        {studentSection === "home" && (
          <>
            <section className="student-hero-card">
              <span>É hora do treino</span>
              <div className="student-workout-summary">
                <div className="student-card-icon">
                  <Dumbbell size={26} />
                </div>
                <div>
                  <h2>{todayWorkout ? `Treino de hoje (${todayWorkout.block.title.replace(/^.*?([A-Z])\\b.*$/, "$1")})` : "Treino de hoje"}</h2>
                  <p>{cmsMusclesToday.join(", ") || "Ficha de exercícios"}</p>
                </div>
                <strong>{workoutsCompleted}/{totalWorkoutDays}</strong>
              </div>
              <div className="student-progress-track">
                <span style={{ width: `${workoutProgressPercent}%` }} />
              </div>
              <ol className="student-exercise-preview">
                {cmsExercisesToday.slice(0, 3).map((exercise, index) => (
                  <li key={exercise.id}>{index + 1}- {exercise.title}</li>
                ))}
                {cmsExercisesToday.length > 3 && <li>+{cmsExercisesToday.length - 3} exercícios</li>}
              </ol>
              <button className="student-green-button" onClick={() => setStudentSection("training")}>
                Abrir treino
              </button>
            </section>

            <h2 className="student-section-title">Funcionalidades</h2>
            <section className="student-feature-grid">
              {[
                { icon: UserRound, title: "Perfil", text: "Dados cadastrais", section: "menu" as const },
                { icon: Dumbbell, title: "Treino", text: "Ficha de exercícios", section: "training" as const },
                { icon: ShieldCheck, title: "Matrículas", text: "Visualize seus planos", section: "payments" as const },
                { icon: CreditCard, title: "Pagamentos", text: "Central de cobrancas", section: "payments" as const },
                { icon: Ruler, title: "Avaliações", text: "Veja sua evolução", section: "assessments" as const },
                { icon: CalendarDays, title: "Frequência", text: "Consulte seus acessos", section: "status" as const },
                { icon: CalendarPlus, title: "Eventos", text: "Veja os eventos", section: "events" as const },
                { icon: Headphones, title: "Atendimento", text: "Histórico de conversas", section: "support" as const }
              ].map((item) => (
                <button className="student-feature-card" key={item.title} onClick={() => setStudentSection(item.section)}>
                  <span><item.icon size={25} /></span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </button>
              ))}
            </section>
          </>
        )}

        {studentSection === "training" && (
          <section className="student-sheet">
            {!selectedWorkoutModality && publishedModalities.length > 0 && (
              <>
                <div className="student-sheet-heading">
                  <span>Modalidades publicadas</span>
                  <h1>Treinos</h1>
                  <p>Escolha uma modalidade para acessar sua ficha.</p>
                </div>
                <div className="student-modality-list">
                  {publishedModalities.map((item) => (
                    <button className="student-modality-card" key={item.modality} onClick={() => setSelectedWorkoutModality(item.modality)}>
                      <span><Dumbbell size={26} /></span>
                      <strong>{item.modality}</strong>
                      <small>{item.count} ficha(s) publicada(s)</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {selectedWorkoutModality && workoutSheet && workoutSequence.length > 0 ? (
              <article className="student-training-sheet-card">
                <header className="student-training-sheet-header">
                  <button className="student-training-back-button" onClick={() => setSelectedWorkoutModality(null)}>
                    <ChevronLeft size={18} />
                    Modalidades
                  </button>
                  <span>Ficha de treino</span>
                  <h1>{workoutSheet.programTitle}</h1>
                  <p>{workoutSheet.modality ?? "Hipertrofia"}</p>
                  <div className="student-training-sheet-icon">
                    <Dumbbell size={58} />
                  </div>
                </header>
                <div className="student-training-sheet-meta">
                  <span>Treino de hoje: <strong>{currentSequenceWorkout?.block.title ?? workoutSheet.block.title}</strong></span>
                  <span>Treinos realizados: <strong>{sheetCompleted}/{sheetTotal}</strong> <Settings size={22} /></span>
                </div>
                <div className="student-progress-track">
                  <span style={{ width: `${sheetProgressPercent}%` }} />
                </div>
                <div className="student-program-list">
                  {workoutSequence.map((programWorkout) => {
                    const programMuscles = Array.from(
                      new Set(programWorkout.block.exercises.flatMap((exercise) => exercise.targetMuscles ?? []))
                    );
                    const isCurrent = programWorkout.dayNumber === workoutSheet.dayNumber;

                    return (
                      <article className="student-program-card" key={`${programWorkout.programId}-${programWorkout.dayNumber}`}>
                        <div className={`student-training-card ${isCurrent ? "active" : ""}`}>
                          <div className="student-card-icon">
                            <Dumbbell size={24} />
                          </div>
                          <div>
                            <h2>{programWorkout.block.title}</h2>
                            <p>{programMuscles.join(", ") || "Exercícios do CMS Fitness"}</p>
                          </div>
                          <button onClick={() => void handleStartWorkoutSession(programWorkout)}>
                            {programWorkout.completed ? "Concluído" : "Iniciar"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <button className="student-history-button">
                  <ClipboardList size={22} />
                  Histórico de treinos
                </button>
                <div className="student-training-info-grid">
                  <div>
                    <UsersRound size={24} />
                    <span><strong>Professores:</strong>{workoutSheet.teacherNames?.join(", ") || "Não informado"}</span>
                  </div>
                  <div>
                    <Home size={24} />
                    <span><strong>Unidade:</strong>{workoutSheet.unitName || "Não informada"}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Início:</strong>{formatStudentDate(workoutSheet.membershipStartsAt)}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Vencimento:</strong>{formatStudentDate(workoutSheet.membershipEndsAt)}</span>
                  </div>
                </div>
              </article>
            ) : selectedWorkoutModality ? (
              <article className="student-training-card">
                <Dumbbell size={24} />
                <div>
                  <h2>Treino indisponível</h2>
                  <p>Nenhum programa CMS ativo foi encontrado.</p>
                </div>
              </article>
            ) : null}
          </section>
        )}

        {studentSection === "player" && todayWorkout && (
          <section className="student-player-mobile">
            <WorkoutPlayer
              programTitle={todayWorkout.programTitle}
              blockTitle={todayWorkout.block.title}
              exercises={todayWorkout.block.exercises}
              restTimeDefault={todayWorkout.block.restTime}
              sessionId={workoutSession?.id ?? null}
              onBack={() => setStudentSection("training")}
              onWorkoutStart={handleBeginWorkoutSession}
              onCancelSession={handleCancelWorkoutSession}
              onExerciseProgressChange={handleExerciseProgressChange}
              onWorkoutComplete={handleCompleteWorkoutDay}
            />
          </section>
        )}

        {studentSection === "payments" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Financeiro</span>
              <h1>Pagamentos e matrícula</h1>
              <p>{membership ? `Plano ${membership.plan.name}` : "Nenhum plano ativo"}</p>
            </div>
            <article className="student-info-card">
              <ShieldCheck size={22} />
              <div>
                <strong>Status da matrícula</strong>
                <span>{membership?.status ?? "Sem matrícula"}</span>
              </div>
            </article>
            {payments.slice(0, 6).map((payment) => (
              <article className="student-info-card" key={payment.id}>
                <CreditCard size={22} />
                <div>
                  <strong>{formatPriceInBRL(payment.amountInCents)}</strong>
                  <span>{payment.status} • {new Date(payment.dueDate).toLocaleDateString("pt-BR")}</span>
                </div>
                {payment.paymentUrl && <a href={payment.paymentUrl} target="_blank" rel="noreferrer">Abrir</a>}
              </article>
            ))}
          </section>
        )}

        {studentSection === "products" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Produtos</span>
              <h1>Vitrine online</h1>
              <p>Produtos e compras seráo conectados ao catálogo do App Treino.</p>
            </div>
            <article className="student-empty-state">
              <Package size={34} />
              <strong>Nenhum produto cadastrado</strong>
              <span>Use está área para uma futura lojá fitness.</span>
            </article>
          </section>
        )}

        {studentSection === "assessments" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Avaliações</span>
              <h1>Veja sua evolução</h1>
              <p>{latestAssessment ? new Date(latestAssessment.assessedAt).toLocaleDateString("pt-BR") : "Sem avaliação cadastrada"}</p>
            </div>
            {latestAssessment ? (
              <div className="student-metric-grid">
                <span><strong>{latestAssessment.weightKg ?? "-"}</strong>kg</span>
                <span><strong>{latestAssessment.heightCm ?? "-"}</strong>cm</span>
                <span><strong>{latestAssessment.bodyFatPct ?? "-"}</strong>% gordura</span>
                <span><strong>{latestAssessment.waistCm ?? "-"}</strong>cm cintura</span>
              </div>
            ) : (
              <article className="student-empty-state">
                <Ruler size={34} />
                <strong>Nenhuma avaliação</strong>
                <span>Solicite sua primeira avaliação com a equipe.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "events" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Eventos</span>
              <h1>Agenda da academia</h1>
              <p>{events.length} evento(s) disponíveis</p>
            </div>
            {events.slice(0, 8).map((item) => (
              <article className="student-info-card" key={item.id}>
                <CalendarPlus size={22} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{new Date(item.startsAt).toLocaleString("pt-BR")} • {item.location ?? "Online"}</span>
                </div>
                <button disabled={item.registered} onClick={() => handleEventRegistration(item.id)}>
                  {item.registered ? "Inscrito" : "Entrar"}
                </button>
              </article>
            ))}
          </section>
        )}

        {studentSection === "support" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Atendimento</span>
              <h1>Suporte</h1>
              <p>{tickets.length} chamado(s)</p>
            </div>
            <form className="student-form" onSubmit={handleCreateTicket}>
              <input name="subject" placeholder="Assunto" required />
              <select name="category" defaultValue="GENERAL">
                <option value="GENERAL">Geral</option>
                <option value="WORKOUT">Treino</option>
                <option value="PAYMENT">Pagamento</option>
                <option value="TECHNICAL">Técnico</option>
              </select>
              <textarea name="message" placeholder="Descreva o que você precisa" required />
              <button className="student-green-button">Abrir atendimento</button>
            </form>
            {tickets.slice(0, 4).map((item) => (
              <article className="student-info-card" key={item.id}>
                <MessageCircle size={22} />
                <div>
                  <strong>{item.subject}</strong>
                  <span>{item.status}</span>
                </div>
              </article>
            ))}
          </section>
        )}

        {studentSection === "ai" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Agente IA</span>
              <h1>Plano inteligente</h1>
              <p>Gere uma rotina baseada no seu objetivo.</p>
            </div>
            <form className="student-form" onSubmit={handleCreateAiPlan}>
              <input name="objective" placeholder="Objetivo" defaultValue={profile?.objective ?? ""} required />
              <input name="level" placeholder="Nível" defaultValue={profile?.level ?? ""} required />
              <input name="focus" placeholder="Foco da semana" />
              <select name="daysPerWeek" defaultValue="3">
                <option value="2">2 dias</option>
                <option value="3">3 dias</option>
                <option value="4">4 dias</option>
                <option value="5">5 dias</option>
                <option value="6">6 dias</option>
              </select>
              <button className="student-green-button">Gerar plano</button>
            </form>
            {latestAiPlan && <article className="student-info-card"><Bot size={22} /><div><strong>?ltimo plano</strong><span>{latestAiPlan.plan.summary}</span></div></article>}
          </section>
        )}

        {studentSection === "menu" && (
          <section className="student-menu-list">
            {[
              { icon: UserRound, title: "Perfil", action: () => setStudentSection("status") },
              { icon: Dumbbell, title: "Treino", action: () => setStudentSection("training"), favorite: true },
              { icon: ShieldCheck, title: "Matrículas", action: () => setStudentSection("payments") },
              { icon: CreditCard, title: "Pagamentos", action: () => setStudentSection("payments"), favorite: true },
              { icon: Ruler, title: "Avaliações", action: () => setStudentSection("assessments") },
              { icon: CalendarDays, title: "Frequência", action: () => setStudentSection("status") },
              { icon: Package, title: "Produtos", action: () => setStudentSection("products"), favorite: true },
              { icon: ShoppingCart, title: "Compras", action: () => setStudentSection("products") },
              { icon: CalendarPlus, title: "Eventos", action: () => setStudentSection("events") },
              { icon: Headphones, title: "Atendimento", action: () => setStudentSection("support") },
              { icon: QrCode, title: "QR Code", action: () => setStudentSection("status") },
              { icon: CreditCard, title: "Meus Cartoes", action: () => setStudentSection("payments") },
              { icon: Settings, title: "Configuracoes", action: () => setStudentSection("status") },
              { icon: MessageCircle, title: "Contato", action: () => setStudentSection("support") },
              { icon: Star, title: "Favoritos", action: () => setStudentSection("training") },
              { icon: Trophy, title: "Avaliar", action: () => setStudentSection("assessments") }
            ].map((item) => (
              <button className="student-menu-item" key={item.title} onClick={item.action}>
                <item.icon size={24} />
                <span>{item.title}</span>
                {item.favorite && <Star size={18} />}
              </button>
            ))}
            <button className="student-menu-item danger" onClick={onLogout}>
              <LogOut size={24} />
              <span>Sair</span>
            </button>
          </section>
        )}
      </section>

      {streakCalendarOpen && (
        <div className="student-streak-modal-backdrop" role="presentation" onClick={() => setStreakCalendarOpen(false)}>
          <section
            className="student-streak-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Calendario da ofensiva"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="student-streak-modal-header">
              <div>
                <span>Ano atual: {currentYear}</span>
                <strong>{currentStreak} dia(s)</strong>
                <small>consecutivo(s)</small>
              </div>
              <button className="student-icon-button" aria-label="Fechar calendário" onClick={() => setStreakCalendarOpen(false)}>
                <Check size={20} />
              </button>
            </div>
            <div className="student-consistency-calendar in-modal">
              <div className="student-consistency-heading">
                <button
                  className="student-calendar-arrow"
                  aria-label="Mes anterior"
                  disabled={streakCalendarMonth <= 1}
                  onClick={() => setStreakCalendarMonth((month) => Math.max(1, month - 1))}
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <span>Histórico</span>
                  <strong>{monthLabel(currentMonth.year, currentMonth.month)}</strong>
                </div>
                <button
                  className="student-calendar-arrow"
                  aria-label="Próximo mês"
                  disabled={streakCalendarMonth >= currentCalendarMonth}
                  onClick={() => setStreakCalendarMonth((month) => Math.min(currentCalendarMonth, month + 1))}
                >
                  <ChevronRight size={20} />
                </button>
                <small>{completedDateSet.size} treino(s) no mês</small>
              </div>
              <div className="student-calendar-weekdays" aria-hidden="true">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="student-calendar-grid">
                {calendarCells.map((cell, index) => {
                  const isCompleted = Boolean(cell.isoDate && completedDateSet.has(cell.isoDate));
                  const isToday = cell.isoDate === todayIsoDate;

                  return (
                    <span
                      className={`${cell.day ? "" : "empty"} ${isCompleted ? "completed" : ""} ${isToday ? "today" : ""}`}
                      key={`${cell.isoDate ?? "modal-empty"}-${index}`}
                    >
                      {cell.day}
                    </span>
                  );
                })}
              </div>
              <p>Dias marcados representam treinos concluídos em {currentYear}. O calendário mostra o mês atual e meses anteriores.</p>
            </div>
          </section>
        </div>
      )}

      <nav className="student-bottom-nav" aria-label="Navegacao do aluno">
        <button className={studentSection === "home" ? "active" : ""} onClick={() => setStudentSection("home")}><Home size={22} />Home</button>
        <button className={studentSection === "payments" ? "active" : ""} onClick={() => setStudentSection("payments")}><CreditCard size={22} />Pagamentos</button>
        <button className={studentSection === "training" || studentSection === "player" ? "active" : ""} onClick={() => setStudentSection("training")}><Dumbbell size={22} />Treino</button>
        <button className={studentSection === "products" ? "active" : ""} onClick={() => setStudentSection("products")}><Package size={22} />Produtos</button>
        <button className={studentSection === "menu" ? "active" : ""} onClick={() => setStudentSection("menu")}><Menu size={22} />Menu</button>
      </nav>
    </main>
  );
}
