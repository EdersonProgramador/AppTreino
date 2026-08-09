import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  Dumbbell,
  Eye,
  Flame,
  Headphones,
  Home,
  Image as ImageIcon,
  ImageOff,
  LineChart,
  Loader2,
  LockKeyhole,
  LogOut,
  LogIn,
  FileText,
  GripVertical,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Phone,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  UploadCloud,
  UserRound,
  UsersRound,
  Wallet,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL, initialPlans, type AuthUser } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "./api";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "./brazil-data";
import { StateCityFields } from "./components/admin/StateCityFields";
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
const mediaUrl = (path?: string | null) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  return assetUrl(path.replace(/^\/+/, ""));
};
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function studentLocationLabel(profile?: { city?: string | null; state?: string | null } | null) {
  return [profile?.city, profile?.state].filter(Boolean).join(" - ") || "Sem município/UF";
}

function formatAssessmentDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTimeLocalInputValue(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calculateBodyFatEstimate(input: {
  gender?: string;
  heightCm?: number | null;
  neckCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  weightKg?: number | null;
  birthDate?: string;
}): { value: number; method: "Navy" | "IMC" } | null {
  const { gender, heightCm, neckCm, waistCm, hipCm } = input;
  const isMale = gender === "Masculino";
  const isFemale = gender === "Feminino";

  if (
    (!isMale && !isFemale) ||
    !heightCm ||
    !neckCm ||
    !waistCm ||
    heightCm <= 0 ||
    neckCm <= 0 ||
    waistCm <= 0
  ) {
    return null;
  }

  const log10 = Math.log10;

  if (isMale) {
    if (waistCm - neckCm > 0) {
      const bodyFat =
        495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
      return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "Navy" };
    }
  } else if (hipCm && hipCm > 0 && waistCm + hipCm - neckCm > 0) {
    const bodyFat =
      495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
    return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "Navy" };
  }

  const { weightKg, birthDate } = input;
  if (!weightKg || weightKg <= 0) return null;

  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let age = 0;
  if (birthDate) {
    const born = new Date(`${birthDate}T00:00:00`);
    if (!Number.isNaN(born.getTime())) {
      const today = new Date();
      age = today.getFullYear() - born.getFullYear();
      const monthDiff = today.getMonth() - born.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
    }
  }
  const bodyFat = 1.2 * bmi + 0.23 * age - 10.8 * (isMale ? 1 : 0) - 5.4;

  return { value: Math.max(0, Math.min(100, Math.round(bodyFat * 10) / 10)), method: "IMC" };
}

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
  phone?: string | null;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE";
  enrollmentStatus: "PENDING" | "ACTIVE" | "CANCELED";
  createdAt?: string | null;
  profile?: {
    gender?: "MALE" | "FEMALE" | null;
    birthDate?: string | null;
    phone?: string | null;
    document?: string | null;
    objective?: string | null;
    level?: string | null;
    city?: string | null;
    state?: string | null;
    avatarUrl?: string | null;
    locationId?: string | null;
  } | null;
  memberships?: MembershipRow[];
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
  materialUrl?: string | null;
  notes?: string | null;
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

interface CmsLocationRow {
  id: string;
  name: string;
  slug: string;
  type: "ACADEMY" | "UNIT" | "CLUB";
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface CmsAnnouncementRow {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StudentLocationRow {
  id: string;
  name: string;
  slug: string;
  type: "ACADEMY" | "UNIT" | "CLUB";
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
}

interface CmsWorkoutBlockRow {
  id: string;
  title: string;
  identifier?: string | null;
  focus?: string | null;
  weeklyFrequency: number;
  structureType: "NORMAL" | "BI_SET" | "DROP_SET" | "REST_PAUSE";
  restTime: number;
  modality?: CmsModalityRow | null;
  exercises: Array<{
    id: string;
    sets: number;
    repsRange: string;
    initialLoad?: string | null;
    restSeconds?: number | null;
    supportMaterialUrl?: string | null;
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
  targetGender: "ALL" | "MALE" | "FEMALE";
  durationYears: number;
  durationMonths: number;
  durationWeeks: number;
  durationDays: number;
  totalWorkouts: number;
  sortOrder: number;
  modality?: CmsModalityRow | null;
  assignedUsers?: Array<{
    id: string;
    user: AdminUser;
    currentDay: number;
    totalWorkouts: number;
    completedWorkouts: number;
    status: "ACTIVE" | "COMPLETED" | "CANCELED";
  }>;
  days: Array<{
    id: string;
    dayNumber: number;
    order: number;
    workoutBlock: CmsWorkoutBlockRow;
  }>;
}

interface TrashDisplayItem {
  id: string;
  name: string;
  sub?: string | null;
}

type AdminTrashKind =
  | "users"
  | "workouts"
  | "announcements"
  | "plans"
  | "memberships"
  | "payments"
  | "assessments"
  | "events"
  | "tickets"
  | "aiPlans"
  | "products"
  | "purchases"
  | "cards"
  | "favorites"
  | "ratings"
  | "contactMessages"
  | "modalities"
  | "locations"
  | "exercises"
  | "workoutBlocks"
  | "programs";

type AdminTrashData = Record<AdminTrashKind, TrashDisplayItem[]>;

const CMS_TRASH_KINDS: AdminTrashKind[] = ["locations", "modalities", "exercises", "workoutBlocks", "programs"];

const ALL_TRASH_KINDS: AdminTrashKind[] = [
  "users",
  "workouts",
  "announcements",
  "plans",
  "memberships",
  "payments",
  "assessments",
  "events",
  "tickets",
  "aiPlans",
  "products",
  "purchases",
  "cards",
  "favorites",
  "ratings",
  "contactMessages",
  ...CMS_TRASH_KINDS
];

interface CmsDeleteTarget {
  kind: AdminTrashKind;
  id: string;
  name: string;
  permanent?: boolean;
}

function trashResourceBase(kind: AdminTrashKind): string {
  return `/admin/trash/${kind}`;
}

function trashSoftDeleteBase(kind: AdminTrashKind): string {
  const map: Record<AdminTrashKind, string> = {
    users: "/admin/users",
    workouts: "/admin/workouts",
    announcements: "/admin/cms/announcements",
    plans: "/admin/plans",
    memberships: "/admin/memberships",
    payments: "/admin/payments",
    assessments: "/admin/physical-assessments",
    events: "/admin/events",
    tickets: "/admin/support-tickets",
    aiPlans: "/admin/ai-workout-plans",
    products: "/admin/products",
    purchases: "/admin/purchases",
    cards: "/admin/payment-cards",
    favorites: "/admin/favorites",
    ratings: "/admin/ratings",
    contactMessages: "/admin/contact-messages",
    modalities: "/admin/cms/modalities",
    locations: "/admin/cms/locations",
    exercises: "/admin/cms/exercises",
    workoutBlocks: "/admin/cms/workout-blocks",
    programs: "/admin/cms/programs"
  };
  return map[kind];
}

function trashKindLabel(kind: AdminTrashKind): string {
  const labels: Record<AdminTrashKind, string> = {
    users: "Usuários",
    workouts: "Treinos",
    announcements: "Avisos",
    plans: "Planos",
    memberships: "Matrículas",
    payments: "Pagamentos",
    assessments: "Avaliações físicas",
    events: "Eventos",
    tickets: "Atendimentos",
    aiPlans: "Planos IA",
    products: "Produtos",
    purchases: "Compras",
    cards: "Cartões",
    favorites: "Favoritos",
    ratings: "Avaliações",
    contactMessages: "Mensagens de contato",
    modalities: "Modalidades",
    locations: "Localidades",
    exercises: "Exercícios/Aulas",
    workoutBlocks: "Fichas de treino",
    programs: "Publicações"
  };
  return labels[kind];
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

interface StudentProfile {
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  birthDate?: string | null;
  objective?: string | null;
  level?: string | null;
  city?: string | null;
  state?: string | null;
  avatarUrl?: string | null;
  locationId?: string | null;
}

interface PaymentRow {
  id: string;
  membershipId: string;
  amountInCents: number;
  status: "PENDING" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED";
  dueDate: string;
  paidAt?: string | null;
  paymentUrl?: string | null;
  membership?: MembershipRow;
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
  source?: "STUDENT" | "ADMIN";
  details?: PhysicalAssessmentForm | null;
  user: AdminUser;
}

interface PhysicalAssessmentForm {
  formulario_avaliacao_fisica: {
    dados_pessoais_e_objetivos: {
      nome_completo: string;
      data_nascimento: string;
      genero_biologico: { opcoes: string[]; resposta: string };
      objetivo_principal: { opcoes: string[]; resposta: string };
      nivel_atividade_atual: { opcoes: string[]; resposta: string };
    };
    historico_de_saude_anamnese: {
      possui_lesao: { descricao: string; resposta: string };
      medicamento_continuo: { descricao: string; resposta: string };
      restricao_medica_cardiaca: { descricao: string; resposta: string };
    };
    composicao_corporal_basica: {
      instrucao: string;
      peso_atual_kg: number | null;
      altura_cm: number | null;
    };
    perimetros_corporais_cm: {
      instrucao: string;
      pescoço: { detalhe: string; valor: number | null };
      torax: { detalhe: string; valor: number | null };
      cintura: { detalhe: string; valor: number | null };
      abdomen: { detalhe: string; valor: number | null };
      quadril: { detalhe: string; valor: number | null };
      braco_direito_relaxado: { detalhe: string; valor: number | null };
      braco_esquerdo_relaxado: { detalhe: string; valor: number | null };
      coxa_direita: { detalhe: string; valor: number | null };
      coxa_esquerda: { detalhe: string; valor: number | null };
      panturrilha_direita: { detalhe: string; valor: number | null };
      panturrilha_esquerda: { detalhe: string; valor: number | null };
    };
    fotos_analise_visual: {
      instrucao: string;
      arquivos: { foto_frente: string; foto_costas: string; foto_perfil: string };
    };
  };
}

type AssessmentPhotoKey = "foto_frente" | "foto_costas" | "foto_perfil";
type AssessmentPerimeterKey = keyof Omit<PhysicalAssessmentForm["formulario_avaliacao_fisica"]["perimetros_corporais_cm"], "instrucao">;

const assessmentPerimeterKeys = [
  "pescoço",
  "torax",
  "cintura",
  "abdomen",
  "quadril",
  "braco_direito_relaxado",
  "braco_esquerdo_relaxado",
  "coxa_direita",
  "coxa_esquerda",
  "panturrilha_direita",
  "panturrilha_esquerda"
] as const satisfies readonly AssessmentPerimeterKey[];

const assessmentPhotoFields = [
  ["foto_frente", "Foto de frente"],
  ["foto_costas", "Foto de costas"],
  ["foto_perfil", "Foto de perfil"]
] as const satisfies readonly (readonly [AssessmentPhotoKey, string])[];

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

interface TicketMessageRow {
  id: string;
  ticketId: string;
  senderId?: string | null;
  senderType: "STUDENT" | "ADMIN";
  body: string;
  createdAt: string;
}

interface SupportTicketRow {
  id: string;
  userId: string;
  assignedToId?: string | null;
  subject: string;
  message: string;
  category: "GENERAL" | "WORKOUT" | "PAYMENT" | "TECHNICAL";
  status: "OPEN" | "IN_PROGRESS" | "WAITING_STUDENT" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "NORMAL" | "HIGH";
  createdAt: string;
  updatedAt: string;
  user: AdminUser;
  assignedTo?: AdminUser | null;
  messages: TicketMessageRow[];
}

interface NotificationRow {
  id: string;
  type: "WORKOUT_PROGRAM" | "EVENT" | "WORKOUT" | "SUPPORT" | "ANNOUNCEMENT" | "LOCATION";
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
  user: AdminUser;
}

interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  priceInCents: number;
  imageUrl?: string | null;
  category?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { purchases: number; favorites: number; ratings: number };
  purchasedByMe?: boolean;
  favoritedByMe?: boolean;
  ratedByMe?: boolean;
}

type PurchaseStatus = "PENDING" | "CONFIRMED" | "CANCELED" | "REFUNDED";

interface PurchaseRow {
  id: string;
  userId: string;
  productId: string;
  amountInCents: number;
  status: PurchaseStatus;
  paymentMethod?: string | null;
  createdAt: string;
  paidAt?: string | null;
  user: AdminUser;
  product: ProductRow;
}

interface PaymentCardRow {
  id: string;
  userId: string;
  brand?: string | null;
  lastFour: string;
  holderName?: string | null;
  isDefault: boolean;
  createdAt: string;
  user: AdminUser;
}

interface FavoriteRow {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  user: AdminUser;
  product: ProductRow;
}

interface RatingRow {
  id: string;
  userId: string;
  productId?: string | null;
  targetType: string;
  targetId?: string | null;
  score: number;
  comment?: string | null;
  createdAt: string;
  user: AdminUser;
  product?: ProductRow | null;
}

interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  status: "OPEN" | "RESOLVED" | "CLOSED";
  createdAt: string;
  repliedAt?: string | null;
}

interface StudentFavoriteRow {
  id: string;
  createdAt: string;
  program: {
    id: string;
    title: string;
    description: string;
    modality: string | null;
    modalityImageUrl: string | null;
    totalWorkouts: number;
  };
}

interface AdminStudentOverview {
  student: AdminUser;
  activeMembership: MembershipRow | null;
  payments: PaymentRow[];
  assessments: PhysicalAssessmentRow[];
  attendance: Array<{ id: string; date: string }>;
  workoutSessions: Array<{
    id: string;
    dayNumber: number;
    status: "IN_PROGRESS" | "COMPLETED" | "CANCELED";
    startedAt: string;
    finishedAt?: string | null;
    durationSeconds?: number | null;
  }>;
  programAssignments: Array<{
    id: string;
    status: "ACTIVE" | "COMPLETED" | "CANCELED";
    currentDay: number;
    totalWorkouts: number;
    completedWorkouts: number;
    program: CmsProgramRow;
  }>;
  eventRegistrations: Array<{ id: string; event: EventRow }>;
  tickets: SupportTicketRow[];
  aiPlans: AiWorkoutPlanRow[];
  summary: {
    attendanceThisMonth: number;
    completedWorkoutSessions: number;
    pendingPayments: number;
    openTickets: number;
  };
}

interface CheckoutSessionResponse {
  membership: StudentMembershipRow;
  payment: PaymentRow | null;
  alreadyActive: boolean;
}

interface UploadResponse {
  file: {
    url: string;
    originalName: string;
    mimeType: string;
    path: string;
  };
}

function PhysicalAssessmentFormView({
  form,
  photoPreviews,
  submitting,
  submitLabel,
  submittingLabel = "Salvando...",
  cancelLabel = "Cancelar avaliação",
  namePlaceholder,
  onSubmit,
  onCancel,
  onUpdate,
  onPhotoSelect
}: {
  form: PhysicalAssessmentForm;
  photoPreviews: Record<string, string>;
  submitting: boolean;
  submitLabel: string;
  submittingLabel?: string;
  cancelLabel?: string;
  namePlaceholder: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onUpdate: (mutate: (draft: PhysicalAssessmentForm) => void) => void;
  onPhotoSelect: (key: AssessmentPhotoKey, file: File | undefined) => void;
}) {
  const data = form.formulario_avaliacao_fisica;

  return (
    <form className="student-assessment-form" onSubmit={onSubmit}>
      <div className="student-assessment-section">
        <h2>Dados pessoais e objetivos</h2>
        <div className="student-assessment-field">
          <label>Nome completo</label>
          <input
            type="text"
            placeholder={namePlaceholder}
            value={data.dados_pessoais_e_objetivos.nome_completo}
            onChange={(event) =>
              onUpdate((draft) => {
                draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nome_completo = event.target.value;
              })
            }
          />
        </div>
        <div className="student-assessment-field">
          <label>Data de nascimento</label>
          <input
            type="date"
            value={data.dados_pessoais_e_objetivos.data_nascimento}
            onChange={(event) =>
              onUpdate((draft) => {
                draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.data_nascimento = event.target.value;
              })
            }
          />
        </div>
        {(
          [
            ["genero_biologico", "Gênero biológico"],
            ["objetivo_principal", "Objetivo principal"],
            ["nivel_atividade_atual", "Nível de atividade atual"]
          ] as const
        ).map(([key, label]) => {
          const section = data.dados_pessoais_e_objetivos[key];
          return (
            <div className="student-assessment-field" key={key}>
              <label>{label}</label>
              <select
                value={section.resposta}
                onChange={(event) =>
                  onUpdate((draft) => {
                    draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos[key].resposta = event.target.value;
                  })
                }
              >
                <option value="">Selecione</option>
                {section.opcoes.map((opcao) => (
                  <option key={opcao} value={opcao}>{opcao}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="student-assessment-section">
        <h2>Histórico de saúde (anamnese)</h2>
        {(
          [
            ["possui_lesao", "Você possui alguma lesão?"],
            ["medicamento_continuo", "Usa algum medicamento contínuo?"],
            ["restricao_medica_cardiaca", "Alguma restrição médica cardíaca?"]
          ] as const
        ).map(([key, label]) => {
          const field = data.historico_de_saude_anamnese[key];
          return (
            <div className="student-assessment-field" key={key}>
              <label>{label}</label>
              <input
                type="text"
                placeholder={field.descricao}
                value={field.resposta}
                onChange={(event) =>
                  onUpdate((draft) => {
                    draft.formulario_avaliacao_fisica.historico_de_saude_anamnese[key].resposta = event.target.value;
                  })
                }
              />
            </div>
          );
        })}
      </div>

      <div className="student-assessment-section">
        <h2>Composição corporal básica</h2>
        <p className="student-assessment-hint">{data.composicao_corporal_basica.instrucao}</p>
        <div className="student-assessment-inline">
          <div className="student-assessment-field">
            <label>Peso atual (kg)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex.: 72,5"
              value={data.composicao_corporal_basica.peso_atual_kg ?? ""}
              onChange={(event) =>
                onUpdate((draft) => {
                  draft.formulario_avaliacao_fisica.composicao_corporal_basica.peso_atual_kg =
                    event.target.value === "" ? null : Number(event.target.value);
                })
              }
            />
          </div>
          <div className="student-assessment-field">
            <label>Altura (cm)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex.: 175"
              value={data.composicao_corporal_basica.altura_cm ?? ""}
              onChange={(event) =>
                onUpdate((draft) => {
                  draft.formulario_avaliacao_fisica.composicao_corporal_basica.altura_cm =
                    event.target.value === "" ? null : Number(event.target.value);
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="student-assessment-section">
        <h2>Perímetros corporais (cm)</h2>
        <p className="student-assessment-hint">{data.perimetros_corporais_cm.instrucao}</p>
        <div className="student-assessment-grid">
          {assessmentPerimeterKeys.map((key) => {
            const item = data.perimetros_corporais_cm[key];
            return (
              <div className="student-assessment-field" key={key}>
                <label>{key.replace(/_/g, " ")}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={item.detalhe}
                  value={item.valor ?? ""}
                  onChange={(event) =>
                    onUpdate((draft) => {
                      draft.formulario_avaliacao_fisica.perimetros_corporais_cm[key].valor =
                        event.target.value === "" ? null : Number(event.target.value);
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="student-assessment-section">
        <h2>Fotos para análise visual</h2>
        <p className="student-assessment-hint">{data.fotos_analise_visual.instrucao}</p>
        <div className="student-assessment-grid">
          {assessmentPhotoFields.map(([key, label]) => {
            const fileName = data.fotos_analise_visual.arquivos[key];
            const preview = photoPreviews[key] || (/^https?:\/\//i.test(fileName) ? mediaUrl(fileName) : "");
            return (
              <div className="student-assessment-field" key={key}>
                <label>{label}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => onPhotoSelect(key, event.target.files?.[0])}
                />
                {preview && (
                  <div className="student-assessment-photo-confirm">
                    <img src={preview} alt={label} />
                    <div>
                      <strong><Check size={16} /> Foto enviada</strong>
                      <span>{photoPreviews[key] ? fileName : "Imagem atual da avaliação"}</span>
                      <button type="button" onClick={() => onPhotoSelect(key, undefined)}>
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="student-assessment-actions">
        <button className="student-green-button" type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <button className="student-outline-button" type="button" disabled={submitting} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}

interface TodayWorkoutResponse {
  workout: {
    programId: string;
    programTitle: string;
    assignmentId: string;
    dayNumber: number;
    totalDays: number;
    totalWorkouts: number;
    completed?: boolean;
    modality?: string;
    modalityImageUrl?: string | null;
    description?: string;
    completedWorkouts?: number;
    teacherNames?: string[];
    unitName?: string;
    membershipStartsAt?: string | null;
    membershipEndsAt?: string | null;
    favoritedByMe?: boolean;
    ratedByMe?: boolean;
    sequence?: Array<{
      programId: string;
      programTitle: string;
      assignmentId: string;
      dayNumber: number;
      totalDays: number;
      totalWorkouts: number;
      completedWorkouts?: number;
      completed?: boolean;
      block: {
        title: string;
        identifier?: string | null;
        focus?: string | null;
        weeklyFrequency?: number;
        structureType: "NORMAL" | "BI_SET" | "DROP_SET" | "REST_PAUSE";
        restTime: number;
        exercises: WorkoutPlayerExercise[];
      };
    }>;
    block: {
      title: string;
      identifier?: string | null;
      focus?: string | null;
      weeklyFrequency?: number;
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
    const gender = String(formData.get("gender") ?? "").trim();
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
            gender: mode === "register" ? gender || undefined : undefined,
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
            ? { name, email: email || undefined, phone: phone || undefined, gender: gender || undefined, password, planCode: selectedPlanCode, billingType }
            : { name, email: email || undefined, phone: phone || undefined, gender: gender || undefined, password, provider };

    try {
      if (provider === "GOOGLE" && !idToken && !credential) {
        throw new ApiError(401, "Credencial do Google não recebida. Recarregue a página e tente novamente.");
      }

      const response = await apiPost<{ user: AuthUser; token: string; payment?: { paymentUrl?: string | null } }>(
        endpoint,
        payload
      );
      applySession(response);
      if (isCheckoutRegister && response.payment?.paymentUrl) {
        window.open(response.payment.paymentUrl, "_blank");
      }
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
                Assinar agora
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
              <label>
                Sexo
                <select name="gender" required defaultValue="">
                  <option value="">Selecione</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Feminino</option>
                </select>
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

type AdminResource =
  | "summary"
  | "users"
  | "locations"
  | "modalities"
  | "exercises"
  | "workoutBlocks"
  | "programs"
  | "announcements"
  | "plans"
  | "memberships"
  | "payments"
  | "assessments"
  | "events"
  | "tickets"
  | "aiPlans"
  | "products"
  | "purchases"
  | "paymentCards"
  | "favorites"
  | "ratings"
  | "contactMessages"
  | "settings";

const ALL_ADMIN_RESOURCES: AdminResource[] = [
  "summary",
  "users",
  "locations",
  "modalities",
  "exercises",
  "workoutBlocks",
  "programs",
  "announcements",
  "plans",
  "memberships",
  "payments",
  "assessments",
  "events",
  "tickets",
  "aiPlans",
  "products",
  "purchases",
  "paymentCards",
  "favorites",
  "ratings",
  "contactMessages",
  "settings"
];

function AdminDashboardOverview({
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

  const activeMembershipCount = useMemo(
    () => memberships.filter((item) => item.status === "ACTIVE").length,
    [memberships]
  );

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

  return (
    <section className="admin-dashboard">
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

      <section className="admin-dashboard-grid">
        <article className="table-panel dash-panel dash-panel-wide dash-revenue-panel">
          <div className="panel-title">
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

        <article className="table-panel dash-panel dash-quick-panel">
          <div className="panel-title">
            <div>
              <h2>Ações rápidas</h2>
              <p>Atalhos para as áreas operacionais do painel.</p>
            </div>
          </div>
          <div className="dash-quick-actions">
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
                <strong>Treinos e Aulas CMS</strong>
                <small>Monte fichas e publique aulas</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button type="button" onClick={() => onNavigate("programs")}>
              <Play size={18} />
              <span>
                <strong>Publicar treinos</strong>
                <small>Publique fichas e atribua a alunos</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </article>

        {commercialEnabled && (
          <article className="table-panel dash-panel dash-panel-wide">
            <div className="panel-title">
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
                <div className="data-row" key={product.id}>
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
            <div className="data-row">
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

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Pagamentos pendentes</h2>
              <p>Priorize cobranças em aberto ou vencidas.</p>
            </div>
            <span>{pendingPayments.length}</span>
          </div>
          {pendingPayments.length > 0 ? (
            pendingPayments.map((payment) => (
              <div className="data-row" key={payment.id}>
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

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Matrículas a vencer</h2>
              <p>Matrículas ativas que expiram nos próximos 7 dias.</p>
            </div>
            <span>{expiringMemberships.length}</span>
          </div>
          {expiringMemberships.length > 0 ? (
            expiringMemberships.map((membership) => (
              <div className="data-row" key={membership.id}>
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

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Atendimentos abertos</h2>
              <p>Chamados aguardando ação do suporte.</p>
            </div>
            <span>{openTickets.length}</span>
          </div>
          {openTickets.length > 0 ? (
            openTickets.map((ticket) => (
              <div className="data-row ticket-row" key={ticket.id}>
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
          <article className="table-panel dash-panel">
            <div className="panel-title">
              <div>
                <h2>Mensagens de contato</h2>
                <p>Dúvidas e solicitações ainda não respondidas.</p>
              </div>
              <span>{openContactMessages.length}</span>
            </div>
            {openContactMessages.length > 0 ? (
              openContactMessages.map((message) => (
                <div className="data-row" key={message.id}>
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

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Próximos eventos</h2>
              <p>Agenda de eventos ainda abertos para inscrição.</p>
            </div>
            <span>{upcomingEvents.length}</span>
          </div>
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => (
              <div className="data-row" key={event.id}>
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

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Últimos alunos</h2>
              <p>Cadastros mais recentes no painel.</p>
            </div>
            <span>{latestStudents.length}</span>
          </div>
          {latestStudents.length > 0 ? (
            latestStudents.map((student) => (
              <div className="data-row" key={student.id}>
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

function AdminReports({
  users,
  payments,
  assessments,
  ratings,
  lastUpdatedAt,
  loading,
  onRefresh
}: {
  users: AdminUser[];
  payments: PaymentRow[];
  assessments: PhysicalAssessmentRow[];
  ratings: RatingRow[];
  lastUpdatedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const now = useMemo(() => new Date(), [lastUpdatedAt]);

  const monthBuckets = useMemo(() => {
    const buckets: Array<{ key: string; label: string; students: number; assessments: number }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString("pt-BR", { month: "short" }),
        students: 0,
        assessments: 0
      });
    }

    for (const user of users) {
      if (user.role !== "USER" || !user.createdAt) continue;
      const date = new Date(user.createdAt);
      const bucket = buckets.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (bucket) bucket.students += 1;
    }

    for (const assessment of assessments) {
      const date = new Date(assessment.assessedAt);
      const bucket = buckets.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (bucket) bucket.assessments += 1;
    }

    return buckets;
  }, [assessments, now, users]);

  const maxStudents = useMemo(() => Math.max(1, ...monthBuckets.map((bucket) => bucket.students)), [monthBuckets]);
  const maxAssessments = useMemo(() => Math.max(1, ...monthBuckets.map((bucket) => bucket.assessments)), [monthBuckets]);

  const revenueByPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (payment.status !== "CONFIRMED") continue;
      const planName = payment.membership?.plan?.name ?? "Sem plano";
      map.set(planName, (map.get(planName) ?? 0) + payment.amountInCents);
    }
    return [...map.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((first, second) => second.total - first.total)
      .slice(0, 6);
  }, [payments]);
  const maxPlanRevenue = useMemo(() => Math.max(1, ...revenueByPlan.map((item) => item.total)), [revenueByPlan]);

  const ratingSummary = useMemo(() => {
    if (ratings.length === 0) {
      return {
        average: null as number | null,
        count: 0,
        distribution: [5, 4, 3, 2, 1].map((score) => ({ score, count: 0 })),
        workoutCount: 0,
        productCount: 0
      };
    }
    return {
      average: Math.round((ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length) * 10) / 10,
      count: ratings.length,
      distribution: [5, 4, 3, 2, 1].map((score) => ({ score, count: ratings.filter((rating) => rating.score === score).length })),
      workoutCount: ratings.filter((rating) => rating.targetType === "WORKOUT").length,
      productCount: ratings.filter((rating) => rating.targetType === "PRODUCT").length
    };
  }, [ratings]);
  const maxRatingCount = useMemo(() => Math.max(1, ...ratingSummary.distribution.map((item) => item.count)), [ratingSummary]);

  const formatUpdatedAt = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="admin-reports" id="admin-reports">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Análise e desempenho</span>
          <h1>Relatórios</h1>
        </div>
        <div className="dashboard-actions">
          <button className="outline-button compact-button" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            Atualizar
          </button>
        </div>
      </div>
      <p className="admin-sync-label">
        {loading ? "Sincronizando dados..." : `Atualizado às ${formatUpdatedAt} · sincronização automática a cada 1 minuto`}
      </p>

      <section className="admin-dashboard-grid">
        <article className="table-panel dash-panel dash-panel-wide">
          <div className="panel-title">
            <div>
              <h2>Receita confirmada por plano</h2>
              <p>Valor dos pagamentos confirmados de cada plano contratado.</p>
            </div>
            <span>{revenueByPlan.length} plano(s)</span>
          </div>
          {revenueByPlan.length > 0 ? (
            <div className="dash-bar-chart">
              {revenueByPlan.map((item) => (
                <div className="dash-bar-column" key={item.name}>
                  <div className="dash-bar-track">
                    <div className="dash-bar-fill" style={{ height: `${Math.round((item.total / maxPlanRevenue) * 100)}%` }} />
                  </div>
                  <span>{item.name}</span>
                  <strong>{formatPriceInBRL(item.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty">
              <Wallet size={18} />
              Nenhum pagamento confirmado ainda.
            </div>
          )}
        </article>

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Novos alunos</h2>
              <p>Cadastros de alunos nos últimos 6 meses.</p>
            </div>
            <span>{users.filter((item) => item.role === "USER").length}</span>
          </div>
          <div className="dash-bar-chart">
            {monthBuckets.map((bucket) => (
              <div className="dash-bar-column" key={bucket.key}>
                <div className="dash-bar-track">
                  <div className="dash-bar-fill" style={{ height: `${Math.round((bucket.students / maxStudents) * 100)}%` }} />
                </div>
                <span>{bucket.label}</span>
                <strong>{bucket.students}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="table-panel dash-panel">
          <div className="panel-title">
            <div>
              <h2>Avaliações físicas</h2>
              <p>Registros de avaliação realizados por mês.</p>
            </div>
            <span>{assessments.length}</span>
          </div>
          <div className="dash-bar-chart">
            {monthBuckets.map((bucket) => (
              <div className="dash-bar-column" key={bucket.key}>
                <div className="dash-bar-track">
                  <div className="dash-bar-fill" style={{ height: `${Math.round((bucket.assessments / maxAssessments) * 100)}%` }} />
                </div>
                <span>{bucket.label}</span>
                <strong>{bucket.assessments}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-dashboard-grid">
        <article className="table-panel dash-panel dash-panel-wide">
          <div className="panel-title">
            <div>
              <h2>Avaliações de alunos</h2>
              <p>
                {ratingSummary.count} avaliação(ões) · {ratingSummary.workoutCount} treino(s) · {ratingSummary.productCount} produto(s)
              </p>
            </div>
            <span>{ratingSummary.average !== null ? `Média ${String(ratingSummary.average).replace(".", ",")}` : "Sem notas"}</span>
          </div>
          <div className="reports-dist-list">
            {ratingSummary.distribution.map((item) => (
              <div className="reports-dist-row" key={item.score}>
                <span>{item.score} ★</span>
                <div className="reports-dist-track">
                  <div className="reports-dist-fill" style={{ width: `${Math.round((item.count / maxRatingCount) * 100)}%` }} />
                </div>
                <small>{item.count}</small>
              </div>
            ))}
          </div>
          {ratings.length > 0 ? (
            [...ratings]
              .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
              .slice(0, 5)
              .map((rating) => (
                <div className="data-row" key={rating.id}>
                  <span>
                    <strong>{rating.user.name}</strong>
                    {rating.targetType === "WORKOUT" ? "Treino" : rating.product?.name ?? "Produto"}
                  </span>
                  <small>
                    {rating.score} ★ {rating.comment ? ` · ${rating.comment}` : ""}
                  </small>
                </div>
              ))
          ) : (
            <div className="dash-empty">
              <Star size={18} />
              Nenhuma avaliação registrada ainda.
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

function AdminView({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const [adminSection, setAdminSection] = useState<
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
    | "trash"
  >("overview");
  const [summary, setSummary] = useState({
    users: 0,
    activeMemberships: 0,
    pendingPayments: 0,
    todayAttendance: 0
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cmsModalities, setCmsModalities] = useState<CmsModalityRow[]>([]);
  const [cmsModalitiesPage, setCmsModalitiesPage] = useState(1);
  const [cmsModalitiesSortDir, setCmsModalitiesSortDir] = useState<"asc" | "desc">("asc");
  const cmsModalityDragRef = useRef<{ fromIndex: number; overIndex: number } | null>(null);
  const [cmsModalityDragState, setCmsModalityDragState] = useState<{ fromIndex: number; overIndex: number } | null>(null);
  const [cmsModalityNavTarget, setCmsModalityNavTarget] = useState<"prev" | "next" | null>(null);
  const cmsModalityNavTimerRef = useRef<number | null>(null);
  const [cmsLocations, setCmsLocations] = useState<CmsLocationRow[]>([]);
  const [cmsAnnouncements, setCmsAnnouncements] = useState<CmsAnnouncementRow[]>([]);
  const [cmsLocationImagePreview, setCmsLocationImagePreview] = useState<string | null>(null);
  const [cmsLocationImageRemove, setCmsLocationImageRemove] = useState(false);
  const cmsLocationImageRef = useRef<HTMLInputElement | null>(null);
  const [editingCmsLocation, setEditingCmsLocation] = useState<CmsLocationRow | null>(null);
  const [cmsModalityImagePreview, setCmsModalityImagePreview] = useState<string | null>(null);
  const [cmsModalityImageRemove, setCmsModalityImageRemove] = useState(false);
  const cmsModalityImageRef = useRef<HTMLInputElement | null>(null);
  const [editingCmsModality, setEditingCmsModality] = useState<CmsModalityRow | null>(null);
  const [editingCmsExercise, setEditingCmsExercise] = useState<CmsExerciseRow | null>(null);
  const cmsLessonFileRef = useRef<HTMLInputElement | null>(null);
  const cmsMaterialFileRef = useRef<HTMLInputElement | null>(null);
  const [cmsLessonFilePreview, setCmsLessonFilePreview] = useState<string | null>(null);
  const [cmsLessonFileRemove, setCmsLessonFileRemove] = useState(false);
  const [cmsMaterialFilePreview, setCmsMaterialFilePreview] = useState<string | null>(null);
  const [cmsMaterialFileRemove, setCmsMaterialFileRemove] = useState(false);
  const [cmsExercises, setCmsExercises] = useState<CmsExerciseRow[]>([]);
  const [cmsWorkoutBlocks, setCmsWorkoutBlocks] = useState<CmsWorkoutBlockRow[]>([]);
  const [editingCmsWorkoutBlock, setEditingCmsWorkoutBlock] = useState<CmsWorkoutBlockRow | null>(null);
  const [cmsLessonsModalityFilter, setCmsLessonsModalityFilter] = useState("");
  const [cmsLessonsPage, setCmsLessonsPage] = useState(1);
  const [cmsBlocksModalityFilter, setCmsBlocksModalityFilter] = useState("");
  const [cmsBlocksPage, setCmsBlocksPage] = useState(1);
  const [cmsBlockFormModality, setCmsBlockFormModality] = useState("");
  const [editingCmsProgram, setEditingCmsProgram] = useState<CmsProgramRow | null>(null);
  const [cmsProgramDurationYears, setCmsProgramDurationYears] = useState(0);
  const [cmsProgramDurationMonths, setCmsProgramDurationMonths] = useState(0);
  const [cmsProgramDurationWeeks, setCmsProgramDurationWeeks] = useState(4);
  const [expandedCmsProgramId, setExpandedCmsProgramId] = useState<string | null>(null);
  const cmsProgramDragRef = useRef<{ fromIndex: number; overIndex: number } | null>(null);
  const [cmsProgramDragState, setCmsProgramDragState] = useState<{ fromIndex: number; overIndex: number } | null>(null);
  const [adminTrash, setAdminTrash] = useState<AdminTrashData>(() =>
    Object.fromEntries(ALL_TRASH_KINDS.map((kind) => [kind, []])) as unknown as AdminTrashData
  );
  const [adminTrashLoading, setAdminTrashLoading] = useState(false);
  const [cmsTrashOpen, setCmsTrashOpen] = useState(false);
  const [pendingCmsDelete, setPendingCmsDelete] = useState<CmsDeleteTarget | null>(null);
  const adminTrashTotal = ALL_TRASH_KINDS.reduce((total, kind) => total + adminTrash[kind].length, 0);
  const cmsTrashTotal = CMS_TRASH_KINDS.reduce((total, kind) => total + adminTrash[kind].length, 0);
  const MODALITIES_PAGE_SIZE = 10;
  const cmsModalitiesView = cmsModalitiesSortDir === "desc" ? [...cmsModalities].reverse() : cmsModalities;
  const cmsModalitiesPageCount = Math.max(1, Math.ceil(cmsModalitiesView.length / MODALITIES_PAGE_SIZE));
  const cmsModalitiesSafePage = Math.min(cmsModalitiesPage, cmsModalitiesPageCount);
  const cmsModalitiesPageItems = cmsModalitiesView.slice(
    (cmsModalitiesSafePage - 1) * MODALITIES_PAGE_SIZE,
    cmsModalitiesSafePage * MODALITIES_PAGE_SIZE
  );

  const activeCmsModalities = cmsModalities.filter((item) => item.isActive);
  const cmsProgramFormModalities = cmsModalities.filter((item) => item.isActive || item.id === editingCmsProgram?.modality?.id);
  const cmsBlockFormModalities = cmsModalities.filter((item) => item.isActive || item.id === editingCmsWorkoutBlock?.modality?.id);
  const filteredCmsExercises = cmsLessonsModalityFilter
    ? cmsExercises.filter((item) => (item.modalityLinks ?? []).some((link) => link.modality.id === cmsLessonsModalityFilter))
    : cmsExercises;
  const CMS_LESSONS_PAGE_SIZE = 10;
  const cmsLessonsPageCount = Math.max(1, Math.ceil(filteredCmsExercises.length / CMS_LESSONS_PAGE_SIZE));
  const cmsLessonsSafePage = Math.min(cmsLessonsPage, cmsLessonsPageCount);
  const cmsLessonsPageItems = filteredCmsExercises.slice(
    (cmsLessonsSafePage - 1) * CMS_LESSONS_PAGE_SIZE,
    cmsLessonsSafePage * CMS_LESSONS_PAGE_SIZE
  );
  const filteredCmsWorkoutBlocks = cmsBlocksModalityFilter
    ? cmsWorkoutBlocks.filter((item) => item.modality?.id === cmsBlocksModalityFilter)
    : cmsWorkoutBlocks;
  const CMS_BLOCKS_PAGE_SIZE = 10;
  const cmsBlocksPageCount = Math.max(1, Math.ceil(filteredCmsWorkoutBlocks.length / CMS_BLOCKS_PAGE_SIZE));
  const cmsBlocksSafePage = Math.min(cmsBlocksPage, cmsBlocksPageCount);
  const cmsBlocksPageItems = filteredCmsWorkoutBlocks.slice(
    (cmsBlocksSafePage - 1) * CMS_BLOCKS_PAGE_SIZE,
    cmsBlocksSafePage * CMS_BLOCKS_PAGE_SIZE
  );
  const cmsBlockModalityExercises = cmsBlockFormModality
    ? cmsExercises.filter((item) => (item.modalityLinks ?? []).some((link) => link.modality.id === cmsBlockFormModality))
    : cmsExercises;
  const [cmsPrograms, setCmsPrograms] = useState<CmsProgramRow[]>([]);
  const publishedCmsPrograms = cmsPrograms
    .filter((item) => item.status === "PUBLISHED" && item.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
  const draftCmsPrograms = cmsPrograms
    .filter((item) => item.status !== "PUBLISHED" || !item.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedChatTicketId, setSelectedChatTicketId] = useState<string | null>(null);
  const [pendingFinalizeTicketId, setPendingFinalizeTicketId] = useState<string | null>(null);
  const [ticketsReadAt, setTicketsReadAt] = useState<string | null>(() => window.localStorage.getItem("admin-tickets-read-at"));
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [paymentCards, setPaymentCards] = useState<PaymentCardRow[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
  const [selectedAdminStudentId, setSelectedAdminStudentId] = useState<string | null>(null);
  const [selectedAdminStudent, setSelectedAdminStudent] = useState<AdminStudentOverview | null>(null);
  const [studentOverviewLoading, setStudentOverviewLoading] = useState(false);
  const [managedUserSearch, setManagedUserSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"ALL" | AdminUser["role"]>("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState<"ALL" | AdminUser["status"]>("ALL");
  const [usersPage, setUsersPage] = useState(1);
  const [assessmentSearch, setAssessmentSearch] = useState("");
  const [assessmentSourceFilter, setAssessmentSourceFilter] = useState<"ALL" | "STUDENT" | "ADMIN">("ALL");
  const [assessmentStateFilter, setAssessmentStateFilter] = useState("");
  const [assessmentCityFilter, setAssessmentCityFilter] = useState("");
  const [assessmentsPage, setAssessmentsPage] = useState(1);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState<"ALL" | EventRow["status"]>("ALL");
  const [adminAssessmentForm, setAdminAssessmentForm] = useState<PhysicalAssessmentForm>(() => createEmptyAdminAssessmentForm());
  const [adminAssessmentFormOpen, setAdminAssessmentFormOpen] = useState(false);
  const [adminAssessmentEditingId, setAdminAssessmentEditingId] = useState<string | null>(null);
  const [adminAssessmentUserId, setAdminAssessmentUserId] = useState("");
  const [adminAssessmentAssessedAt, setAdminAssessmentAssessedAt] = useState(() => formatDateTimeLocalInputValue());
  const [adminAssessmentPhotoPreviews, setAdminAssessmentPhotoPreviews] = useState<Record<string, string>>({});
  const [adminAssessmentPhotoFiles, setAdminAssessmentPhotoFiles] = useState<Partial<Record<AssessmentPhotoKey, File>>>({});
  const [adminSubmittingAssessment, setAdminSubmittingAssessment] = useState(false);
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<string | null>(null);
  const [assessmentLightbox, setAssessmentLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const filteredAssessments = useMemo(() => {
    const term = assessmentSearch.trim().toLowerCase();
    let items = assessments;
    if (assessmentSourceFilter !== "ALL") items = items.filter((item) => item.source === assessmentSourceFilter);
    if (assessmentStateFilter) items = items.filter((item) => item.user?.profile?.state === assessmentStateFilter);
    if (assessmentCityFilter) items = items.filter((item) => item.user?.profile?.city === assessmentCityFilter);
    if (term) {
      items = items.filter((item) =>
        [
          item.user?.name,
          item.user?.email,
          item.user?.phone,
          item.user?.profile?.phone,
          item.user?.profile?.document,
          item.user?.profile?.city,
          item.user?.profile?.state
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    }
    return items;
  }, [assessments, assessmentCityFilter, assessmentSearch, assessmentSourceFilter, assessmentStateFilter]);
  const assessmentsPageSize = 5;
  const assessmentsTotalPages = Math.max(1, Math.ceil(filteredAssessments.length / assessmentsPageSize));
  const currentAssessmentsPage = Math.min(assessmentsPage, assessmentsTotalPages);
  const visibleAssessments = filteredAssessments.slice(
    (currentAssessmentsPage - 1) * assessmentsPageSize,
    currentAssessmentsPage * assessmentsPageSize
  );
  const selectedAdminAssessmentStudent = users.find((item) => item.id === adminAssessmentUserId);
  const assessmentCityOptions = useMemo(
    () => (assessmentStateFilter ? CITIES_BY_STATE[assessmentStateFilter] ?? [] : []),
    [assessmentStateFilter]
  );

  useEffect(() => {
    setAssessmentsPage(1);
  }, [assessmentCityFilter, assessmentSearch, assessmentSourceFilter, assessmentStateFilter]);

  useEffect(() => {
    if (assessmentCityFilter && !assessmentCityOptions.includes(assessmentCityFilter)) {
      setAssessmentCityFilter("");
    }
  }, [assessmentCityFilter, assessmentCityOptions]);

  useEffect(() => {
    if (!assessmentLightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssessmentLightbox(null);
      if (event.key === "ArrowLeft") {
        setAssessmentLightbox((current) =>
          current ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length } : current
        );
      }
      if (event.key === "ArrowRight") {
        setAssessmentLightbox((current) =>
          current ? { ...current, index: (current.index + 1) % current.urls.length } : current
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assessmentLightbox]);

  const filteredEvents = useMemo(() => {
    let items = events;
    if (eventStatusFilter !== "ALL") items = items.filter((item) => item.status === eventStatusFilter);
    const term = eventSearch.trim().toLowerCase();
    if (term) items = items.filter((item) => item.title.toLowerCase().includes(term) || (item.location ?? "").toLowerCase().includes(term));
    return items;
  }, [events, eventStatusFilter, eventSearch]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cmsStep, setCmsStep] = useState<"locations" | "modalities" | "lessons" | "blocks" | "publish">("locations");

  function getApiErrorMessage(error: unknown, fallback: string) {
    return error instanceof ApiError ? error.message : fallback;
  }

  function optionalNumber(value: FormDataEntryValue | null) {
    const stringValue = String(value ?? "").trim();
    return stringValue ? Number(stringValue) : undefined;
  }

  async function fetchAdminResource(resource: AdminResource) {
    switch (resource) {
      case "summary": {
        const response = await apiGet<typeof summary>("/admin/summary", token);
        setSummary(response);
        break;
      }
      case "users": {
        const response = await apiGet<{ users: AdminUser[] }>("/admin/users", token);
        setUsers(response.users);
        break;
      }
      case "modalities": {
        const response = await apiGet<{ modalities: CmsModalityRow[] }>("/admin/cms/modalities", token);
        setCmsModalities(response.modalities);
        break;
      }
      case "locations": {
        const response = await apiGet<{ locations: CmsLocationRow[] }>("/admin/cms/locations", token);
        setCmsLocations(response.locations);
        break;
      }
      case "announcements": {
        const response = await apiGet<{ announcements: CmsAnnouncementRow[] }>("/admin/cms/announcements", token);
        setCmsAnnouncements(response.announcements);
        break;
      }
      case "exercises": {
        const response = await apiGet<{ exercises: CmsExerciseRow[] }>("/admin/cms/exercises", token);
        setCmsExercises(response.exercises);
        break;
      }
      case "workoutBlocks": {
        const response = await apiGet<{ workoutBlocks: CmsWorkoutBlockRow[] }>("/admin/cms/workout-blocks", token);
        setCmsWorkoutBlocks(response.workoutBlocks);
        break;
      }
      case "programs": {
        const response = await apiGet<{ programs: CmsProgramRow[] }>("/admin/cms/programs", token);
        setCmsPrograms(response.programs);
        break;
      }
      case "plans": {
        const response = await apiGet<{ plans: PlanRow[] }>("/admin/plans", token);
        setPlans(response.plans);
        break;
      }
      case "memberships": {
        const response = await apiGet<{ memberships: MembershipRow[] }>("/admin/memberships", token);
        setMemberships(response.memberships);
        break;
      }
      case "payments": {
        const response = await apiGet<{ payments: PaymentRow[] }>("/admin/payments", token);
        setPayments(response.payments);
        break;
      }
      case "assessments": {
        const response = await apiGet<{ assessments: PhysicalAssessmentRow[] }>("/admin/physical-assessments", token);
        setAssessments(response.assessments);
        break;
      }
      case "events": {
        const response = await apiGet<{ events: EventRow[] }>("/admin/events", token);
        setEvents(response.events);
        break;
      }
      case "tickets": {
        const response = await apiGet<{ tickets: SupportTicketRow[] }>("/admin/support-tickets", token);
        setTickets(response.tickets);
        break;
      }
      case "aiPlans": {
        const response = await apiGet<{ plans: AiWorkoutPlanRow[] }>("/admin/ai-workout-plans", token);
        setAiPlans(response.plans);
        break;
      }
      case "products": {
        const response = await apiGet<{ products: ProductRow[] }>("/admin/products", token);
        setProducts(response.products);
        break;
      }
      case "purchases": {
        const response = await apiGet<{ purchases: PurchaseRow[] }>("/admin/purchases", token);
        setPurchases(response.purchases);
        break;
      }
      case "paymentCards": {
        const response = await apiGet<{ paymentCards: PaymentCardRow[] }>("/admin/payment-cards", token);
        setPaymentCards(response.paymentCards);
        break;
      }
      case "favorites": {
        const response = await apiGet<{ favorites: FavoriteRow[] }>("/admin/favorites", token);
        setFavorites(response.favorites);
        break;
      }
      case "ratings": {
        const response = await apiGet<{ ratings: RatingRow[] }>("/admin/ratings", token);
        setRatings(response.ratings);
        break;
      }
      case "contactMessages": {
        const response = await apiGet<{ contactMessages: ContactMessageRow[] }>("/admin/contact-messages", token);
        setContactMessages(response.contactMessages);
        break;
      }
      case "settings": {
        const response = await apiGet<{ settings: Record<string, string> }>("/admin/settings", token);
        setSystemSettings(response.settings);
        break;
      }
    }
  }

  async function loadAdminData(resources?: AdminResource[]) {
    if (!token) return;

    const requested = resources && resources.length > 0 ? resources : ALL_ADMIN_RESOURCES;
    const lightweight = requested.length === 1 && requested[0] === "summary";

    setFeedback(null);
    if (!lightweight) {
      setLoading(true);
    }

    try {
      await Promise.all(requested.map((resource) => fetchAdminResource(resource)));
      setLastUpdatedAt(new Date());
    } catch {
      setFeedback("Não foi possível carregar dados administrativos. Verifique API, banco e permissão.");
    } finally {
      setLoading(false);
    }
  }

  async function applyAdminChange(resources: AdminResource[], successMessage = "Alteração aplicada com sucesso.") {
    await loadAdminData(resources);
    setSuccess(successMessage);
  }

  useEffect(() => {
    void loadAdminData();
  }, [token]);

  useEffect(() => {
    void loadAdminTrash();
  }, [token]);

  useEffect(() => {
    if (!success) return;

    const timeout = window.setTimeout(() => setSuccess(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  useEffect(() => {
    if (adminSection !== "overview") return;

    const interval = window.setInterval(() => {
      void loadAdminData(["summary"]);
    }, 60000);

    return () => window.clearInterval(interval);
  }, [adminSection, token]);

  async function loadAdminStudentOverview(studentId = selectedAdminStudentId) {
    if (!token || !studentId) return;

    setStudentOverviewLoading(true);
    try {
      const response = await apiGet<AdminStudentOverview>(`/admin/students/${studentId}/overview`, token);
      setSelectedAdminStudent(response);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível carregar a visão completa do aluno."));
    } finally {
      setStudentOverviewLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedAdminStudentId) {
      setSelectedAdminStudent(null);
      return;
    }

    void loadAdminStudentOverview(selectedAdminStudentId);
  }, [selectedAdminStudentId, token]);

  useEffect(() => {
    setUsersPage(1);
  }, [userRoleFilter, userSearch, userStatusFilter]);

  useEffect(() => {
    if (adminSection !== "contact" || !token) return;
    const interval = window.setInterval(() => {
      void apiGet<{ tickets: SupportTicketRow[] }>("/admin/support-tickets", token)
        .then((response) => setTickets(response.tickets))
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [adminSection, token]);

  async function refreshAdminStudentOverview(resources: AdminResource[] = ["users", "summary"]) {
    await Promise.all([loadAdminData(resources), loadAdminStudentOverview()]);
  }

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
          gender: String(data.get("gender") ?? ""),
          objective: String(data.get("objective") ?? ""),
          level: String(data.get("level") ?? ""),
          city: String(data.get("city") ?? ""),
          state: String(data.get("state") ?? ""),
          locationId: String(data.get("locationId") ?? "")
        },
        token
      );
      form.reset();
      await applyAdminChange(["users", "summary"], "Usuário cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o usuário."));
    }
  }

  async function handleUpdateUserStatus(userId: string, status: AdminUser["status"]) {
    try {
      await apiPut(`/admin/users/${userId}`, { status }, token);
      await refreshAdminStudentOverview();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o status do usuário."));
    }
  }

  async function handleUpdateAdminStudentProfile(event: FormEvent<HTMLFormElement>, studentId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPut(
        `/admin/users/${studentId}`,
        {
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          document: String(data.get("document") ?? ""),
          gender: String(data.get("gender") ?? ""),
          objective: String(data.get("objective") ?? ""),
          level: String(data.get("level") ?? ""),
          city: String(data.get("city") ?? ""),
          state: String(data.get("state") ?? ""),
          status: String(data.get("status") ?? "ACTIVE"),
          locationId: String(data.get("locationId") ?? "")
        },
        token
      );
      await refreshAdminStudentOverview();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o perfil do aluno."));
    }
  }

  function parseTagList(value: FormDataEntryValue | null) {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function uploadCmsFile(value: FormDataEntryValue | null, group: "lessons" | "materials" | "images" | "audio") {
    if (!(value instanceof File) || value.size === 0) {
      return "";
    }

    const uploadData = new FormData();
    uploadData.append("file", value);
    const response = await apiUpload<UploadResponse>(`/admin/uploads?group=${group}`, uploadData, token);

    return response.file.url;
  }

  function cmsExerciseLabel(exercise: CmsExerciseRow) {
    return exercise.title ?? exercise.name ?? "Exercício";
  }

  function cmsMediaKind(url: string): "youtube" | "image" | "video" | "audio" | "pdf" | "file" {
    const lower = url.toLowerCase();
    if (/youtu\.?be/i.test(lower)) return "youtube";
    if (lower.startsWith("data:image") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(lower)) return "image";
    if (lower.startsWith("data:video") || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(lower)) return "video";
    if (lower.startsWith("data:audio") || /\.(mp3|wav|oga|m4a|aac)(\?|#|$)/i.test(lower)) return "audio";
    if (/\.pdf(\?|#|$)/i.test(lower)) return "pdf";
    return "file";
  }

  function cmsYouTubeVideoId(url: string) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return match ? match[1] : "";
  }

  function cmsExerciseThumbSrc(videoUrl?: string | null) {
    const url = String(videoUrl ?? "");
    if (!url) return "";

    const kind = cmsMediaKind(url);
    if (kind === "youtube") {
      const id = cmsYouTubeVideoId(url);
      return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
    }
    if (kind === "image" || kind === "video") {
      return url.startsWith("data:") ? url : mediaUrl(url);
    }
    return "";
  }

  function cmsPreviewMedia(src: string, label: string) {
    const kind = cmsMediaKind(src);

    if (kind === "youtube") {
      const id = cmsYouTubeVideoId(src);
      return id ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : null;
    }

    const resolved = src.startsWith("data:") ? src : mediaUrl(src);

    if (kind === "image") return <img src={resolved} alt={label} />;
    if (kind === "video") return <video src={resolved} controls />;
    if (kind === "audio") return <audio src={resolved} controls />;

    return (
      <span className="cms-file-preview-label">
        <FileText size={18} />
        <a href={resolved} target="_blank" rel="noreferrer">{label}</a>
      </span>
    );
  }

  function handleCmsLessonFileChange(file: File | null) {
    if (!file) {
      setCmsLessonFilePreview(null);
      return;
    }

    setCmsLessonFileRemove(false);
    const reader = new FileReader();
    reader.onload = () => setCmsLessonFilePreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCmsLessonFileClear() {
    setCmsLessonFilePreview(null);
    if (cmsLessonFileRef.current) {
      cmsLessonFileRef.current.value = "";
    }
  }

  function handleCmsMaterialFileChange(file: File | null) {
    if (!file) {
      setCmsMaterialFilePreview(null);
      return;
    }

    setCmsMaterialFileRemove(false);
    const reader = new FileReader();
    reader.onload = () => setCmsMaterialFilePreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCmsMaterialFileClear() {
    setCmsMaterialFilePreview(null);
    if (cmsMaterialFileRef.current) {
      cmsMaterialFileRef.current.value = "";
    }
  }

  async function handleSaveCmsModality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const uploadedImage = await uploadCmsFile(data.get("modalityImage"), "images");
      const imageUrl = cmsModalityImageRemove ? "" : (uploadedImage || (editingCmsModality?.imageUrl ?? "") || "");
      const payload = {
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        icon: String(data.get("icon") ?? ""),
        imageUrl,
        type: String(data.get("type") ?? "EXERCISE"),
        sortOrder: Number(data.get("sortOrder") ?? cmsModalities.length + 1),
        isActive: true
      };

      if (editingCmsModality) {
        await apiPut(`/admin/cms/modalities/${editingCmsModality.id}`, payload, token);
        form.reset();
        setCmsModalityImagePreview(null);
        setCmsModalityImageRemove(false);
        setEditingCmsModality(null);
        await applyAdminChange(["modalities"], "Modalidade atualizada com sucesso.");
        return;
      }

      await apiPost("/admin/cms/modalities", payload, token);
      form.reset();
      setCmsModalityImagePreview(null);
      setCmsModalityImageRemove(false);
      await applyAdminChange(["modalities"], "Modalidade cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a modalidade."));
    }
  }

  function startEditCmsModality(item: CmsModalityRow) {
    setEditingCmsModality(item);
    setCmsModalityImagePreview(null);
    setCmsModalityImageRemove(false);
    if (cmsModalityImageRef.current) {
      cmsModalityImageRef.current.value = "";
    }
  }

  function handleCancelCmsModalityEdit() {
    setEditingCmsModality(null);
    setCmsModalityImagePreview(null);
    setCmsModalityImageRemove(false);
    if (cmsModalityImageRef.current) {
      cmsModalityImageRef.current.value = "";
    }
  }

  async function handleReorderCmsModalities(nextView: CmsModalityRow[]) {
    const nextCanonical = cmsModalitiesSortDir === "desc" ? [...nextView].reverse() : nextView;
    setCmsModalities(nextCanonical);
    try {
      const response = await apiPost<{ modalities: CmsModalityRow[] }>(
        "/admin/cms/modalities/reorder",
        { ids: nextCanonical.map((item) => item.id) },
        token
      );
      setCmsModalities(response.modalities);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a nova ordem."));
      await applyAdminChange(["modalities"]);
    }
  }

  function handleCmsModalityDragStart(index: number) {
    const value = { fromIndex: index, overIndex: index };
    cmsModalityDragRef.current = value;
    setCmsModalityDragState(value);
  }

  function handleCmsModalityDragOver(index: number) {
    const current = cmsModalityDragRef.current;
    if (!current || current.overIndex === index) return;
    const value = { ...current, overIndex: index };
    cmsModalityDragRef.current = value;
    setCmsModalityDragState(value);
  }

  function handleCmsModalityDrop() {
    const drag = cmsModalityDragRef.current;
    cmsModalityDragRef.current = null;
    setCmsModalityDragState(null);
    setCmsModalityNavTarget(null);
    clearCmsModalityNavTimer();
    if (!drag || drag.fromIndex === drag.overIndex) return;
    const nextView = [...cmsModalitiesView];
    const moved = nextView[drag.fromIndex];
    nextView[drag.fromIndex] = nextView[drag.overIndex];
    nextView[drag.overIndex] = moved;
    void handleReorderCmsModalities(nextView);
  }

  function clearCmsModalityNavTimer() {
    if (cmsModalityNavTimerRef.current != null) {
      window.clearTimeout(cmsModalityNavTimerRef.current);
      cmsModalityNavTimerRef.current = null;
    }
  }

  function handleCmsModalityNavDragOver(direction: "prev" | "next") {
    if (!cmsModalityDragRef.current) return;
    setCmsModalityNavTarget(direction);
    const step = direction === "prev" ? -1 : 1;
    const targetPage = Math.min(cmsModalitiesPageCount, Math.max(1, cmsModalitiesSafePage + step));
    if (targetPage === cmsModalitiesSafePage) return;
    if (cmsModalityNavTimerRef.current != null) return;
    cmsModalityNavTimerRef.current = window.setTimeout(() => {
      cmsModalityNavTimerRef.current = null;
      setCmsModalitiesPage(targetPage);
    }, 600);
  }

  function handleCmsModalityDragEnd() {
    cmsModalityDragRef.current = null;
    setCmsModalityDragState(null);
    setCmsModalityNavTarget(null);
    clearCmsModalityNavTimer();
  }

  function handleCmsModalityImageChange(file: File | null) {
    if (!file) {
      setCmsModalityImagePreview(null);
      return;
    }

    setCmsModalityImageRemove(false);
    const reader = new FileReader();
    reader.onload = () => setCmsModalityImagePreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCmsModalityImageClear() {
    setCmsModalityImagePreview(null);
    if (cmsModalityImageRef.current) {
      cmsModalityImageRef.current.value = "";
    }
  }

  async function handleCreateCmsLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const uploadedImage = await uploadCmsFile(data.get("locationImage"), "images");
      const imageUrl = cmsLocationImageRemove ? "" : (uploadedImage || (editingCmsLocation?.imageUrl ?? "") || "");

      if (editingCmsLocation) {
        await apiPut(
          `/admin/cms/locations/${editingCmsLocation.id}`,
          {
            name: String(data.get("name") ?? ""),
            type: String(data.get("type") ?? "ACADEMY"),
            description: String(data.get("description") ?? ""),
            address: String(data.get("address") ?? ""),
            city: String(data.get("city") ?? ""),
            state: String(data.get("state") ?? ""),
            phone: String(data.get("phone") ?? ""),
            imageUrl
          },
          token
        );
        form.reset();
        setCmsLocationImagePreview(null);
        setCmsLocationImageRemove(false);
        setEditingCmsLocation(null);
        await applyAdminChange(["locations"], "Localidade atualizada com sucesso.");
        return;
      }

      await apiPost(
        "/admin/cms/locations",
        {
          name: String(data.get("name") ?? ""),
          type: String(data.get("type") ?? "ACADEMY"),
          description: String(data.get("description") ?? ""),
          address: String(data.get("address") ?? ""),
          city: String(data.get("city") ?? ""),
          state: String(data.get("state") ?? ""),
          phone: String(data.get("phone") ?? ""),
          imageUrl,
          isActive: true
        },
        token
      );
      form.reset();
      setCmsLocationImagePreview(null);
      setCmsLocationImageRemove(false);
      await applyAdminChange(["locations"], "Localidade cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a localidade."));
    }
  }

  function startEditCmsLocation(item: CmsLocationRow) {
    setEditingCmsLocation(item);
    setCmsLocationImagePreview(null);
    setCmsLocationImageRemove(false);
    if (cmsLocationImageRef.current) {
      cmsLocationImageRef.current.value = "";
    }
  }

  function handleCancelCmsLocationEdit() {
    setEditingCmsLocation(null);
    setCmsLocationImagePreview(null);
    setCmsLocationImageRemove(false);
    if (cmsLocationImageRef.current) {
      cmsLocationImageRef.current.value = "";
    }
  }

  function handleCmsLocationImageChange(file: File | null) {
    if (!file) {
      setCmsLocationImagePreview(null);
      return;
    }

    setCmsLocationImageRemove(false);
    const reader = new FileReader();
    reader.onload = () => setCmsLocationImagePreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCmsLocationImageClear() {
    setCmsLocationImagePreview(null);
    if (cmsLocationImageRef.current) {
      cmsLocationImageRef.current.value = "";
    }
  }

  async function handleUpdateCmsLocationStatus(id: string, isActive: boolean) {
    try {
      await apiPut(`/admin/cms/locations/${id}`, { isActive }, token);
      await applyAdminChange(["locations"], isActive ? "Localidade reativada." : "Localidade desativada.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a localidade."));
    }
  }

  async function handleCreateCmsAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/cms/announcements",
        {
          title: String(data.get("title") ?? ""),
          body: String(data.get("body") ?? ""),
          status: data.get("publishNow") ? "PUBLISHED" : "DRAFT"
        },
        token
      );
      form.reset();
      await applyAdminChange(["announcements"], data.get("publishNow") ? "Aviso publicado para os alunos." : "Aviso salvo como rascunho.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o aviso."));
    }
  }

  async function handleToggleCmsAnnouncement(announcement: CmsAnnouncementRow) {
    try {
      await apiPut(
        `/admin/cms/announcements/${announcement.id}`,
        { status: announcement.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" },
        token
      );
      await applyAdminChange(
        ["announcements"],
        announcement.status === "PUBLISHED" ? "Publicação recolhida (rascunho)." : "Aviso publicado para os alunos."
      );
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o aviso."));
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
          initialLoad: String(data.get(`initialLoad${row}`) ?? "").trim(),
          restSeconds: String(data.get(`restSeconds${row}`) ?? "").trim() === "" ? undefined : Number(data.get(`restSeconds${row}`)),
          supportMaterialUrl: String(data.get(`supportMaterialUrl${row}`) ?? "").trim(),
          order: row
        };
      })
      .filter((exercise): exercise is {
        exerciseId: string;
        sets: number;
        repsRange: string;
        initialLoad: string;
        restSeconds: number | undefined;
        supportMaterialUrl: string;
        order: number;
      } => Boolean(exercise));
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

  async function handleSaveCmsExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const uploadedLessonUrl = await uploadCmsFile(data.get("lessonFile"), "lessons");
      const uploadedMaterialUrl = await uploadCmsFile(data.get("materialFile"), "materials");
      const lessonUrl = cmsLessonFileRemove ? "" : (uploadedLessonUrl || String(data.get("videoUrl") ?? ""));
      const materialUrl = cmsMaterialFileRemove ? "" : (uploadedMaterialUrl || String(data.get("materialUrl") ?? ""));
      const payload = {
        title: String(data.get("title") ?? ""),
        videoUrl: lessonUrl,
        audioUrl: String(data.get("audioUrl") ?? ""),
        materialUrl,
        notes: String(data.get("notes") ?? ""),
        targetMuscles: parseTagList(data.get("targetMuscles")),
        equipmentTags: parseTagList(data.get("equipmentTags")),
        modalityIds: data.getAll("modalityIds").map((item) => String(item)).filter(Boolean),
        alternativeIds: data.getAll("alternativeIds").map((item) => String(item)).filter(Boolean)
      };

      if (editingCmsExercise) {
        await apiPut(`/admin/cms/exercises/${editingCmsExercise.id}`, payload, token);
        form.reset();
        setCmsLessonFilePreview(null);
        setCmsLessonFileRemove(false);
        setCmsMaterialFilePreview(null);
        setCmsMaterialFileRemove(false);
        setEditingCmsExercise(null);
        await applyAdminChange(["exercises", "workoutBlocks"], "Aula atualizada com sucesso.");
        return;
      }

      await apiPost("/admin/cms/exercises", payload, token);
      form.reset();
      setCmsLessonFilePreview(null);
      setCmsLessonFileRemove(false);
      setCmsMaterialFilePreview(null);
      setCmsMaterialFileRemove(false);
      await applyAdminChange(["exercises", "workoutBlocks"], "Aula cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar o exercício CMS."));
    }
  }

  function startEditCmsExercise(item: CmsExerciseRow) {
    setEditingCmsExercise(item);
    setCmsLessonFilePreview(null);
    setCmsLessonFileRemove(false);
    setCmsMaterialFilePreview(null);
    setCmsMaterialFileRemove(false);
    if (cmsLessonFileRef.current) {
      cmsLessonFileRef.current.value = "";
    }
    if (cmsMaterialFileRef.current) {
      cmsMaterialFileRef.current.value = "";
    }
  }

  function handleCancelCmsExerciseEdit() {
    setEditingCmsExercise(null);
    setCmsLessonFilePreview(null);
    setCmsLessonFileRemove(false);
    setCmsMaterialFilePreview(null);
    setCmsMaterialFileRemove(false);
    if (cmsLessonFileRef.current) {
      cmsLessonFileRef.current.value = "";
    }
    if (cmsMaterialFileRef.current) {
      cmsMaterialFileRef.current.value = "";
    }
  }

  async function handleSaveCmsWorkoutBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const selectedModalityId = String(data.get("modalityId") ?? "").trim();
      const payload = {
        title: String(data.get("title") ?? ""),
        identifier: String(data.get("identifier") || data.get("title") || ""),
        focus: String(data.get("focus") ?? ""),
        weeklyFrequency: Number(data.get("weeklyFrequency") ?? 1),
        structureType: String(data.get("structureType") ?? "NORMAL"),
        restTime: Number(data.get("restTime") ?? 60),
        modalityId: selectedModalityId ? selectedModalityId : null,
        exercises: parseCmsWorkoutBlockExercises(data)
      };

      if (editingCmsWorkoutBlock) {
        await apiPut(`/admin/cms/workout-blocks/${editingCmsWorkoutBlock.id}`, payload, token);
        form.reset();
        setEditingCmsWorkoutBlock(null);
        setCmsBlockFormModality("");
        await applyAdminChange(["workoutBlocks", "programs"], "Ficha atualizada com sucesso.");
        return;
      }

      await apiPost("/admin/cms/workout-blocks", payload, token);
      form.reset();
      setCmsBlockFormModality("");
      await applyAdminChange(["workoutBlocks", "programs"], "Ficha cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar o bloco CMS."));
    }
  }

  function startEditCmsWorkoutBlock(item: CmsWorkoutBlockRow) {
    setEditingCmsWorkoutBlock(item);
    setCmsBlockFormModality(item.modality?.id ?? "");
  }

  function handleCancelCmsWorkoutBlockEdit() {
    setEditingCmsWorkoutBlock(null);
    setCmsBlockFormModality("");
  }

  async function handleSaveCmsProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const status = String(data.get("status") ?? "DRAFT");
    const durationWeeks = Math.max(1, Number(data.get("durationWeeks") ?? cmsProgramDurationWeeks) || 1);
    const durationDays = durationWeeks * 7;
    const payload = {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      modalityId: String(data.get("modalityId") ?? ""),
      durationYears: Math.max(0, Number(data.get("durationYears") ?? 0) || 0),
      durationMonths: Math.max(0, Number(data.get("durationMonths") ?? 0) || 0),
      durationWeeks,
      durationDays,
      targetGender: String(data.get("targetGender") ?? "ALL"),
      totalWorkouts: Number(data.get("totalWorkouts") ?? durationDays),
      status,
      isActive: status === "PUBLISHED",
      days: parseCmsProgramDays(data)
    };

    try {
      if (editingCmsProgram) {
        await apiPut(`/admin/cms/programs/${editingCmsProgram.id}`, payload, token);
        form.reset();
        setEditingCmsProgram(null);
        setCmsProgramDurationYears(0);
        setCmsProgramDurationMonths(0);
        setCmsProgramDurationWeeks(4);
        await applyAdminChange(["programs"], "Programa atualizado com sucesso.");
        return;
      }

      await apiPost("/admin/cms/programs", payload, token);
      form.reset();
      setCmsProgramDurationYears(0);
      setCmsProgramDurationMonths(0);
      setCmsProgramDurationWeeks(4);
      await applyAdminChange(["programs"], "Programa cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar o programa CMS."));
    }
  }

  function startEditCmsProgram(item: CmsProgramRow) {
    setEditingCmsProgram(item);
    setCmsProgramDurationYears(item.durationYears ?? 0);
    setCmsProgramDurationMonths(item.durationMonths ?? 0);
    setCmsProgramDurationWeeks(item.durationWeeks ?? 4);
    setExpandedCmsProgramId(item.id);
  }

  function handleCancelCmsProgramEdit() {
    setEditingCmsProgram(null);
    setCmsProgramDurationYears(0);
    setCmsProgramDurationMonths(0);
    setCmsProgramDurationWeeks(4);
  }

  async function handleReorderCmsPrograms(nextPrograms: CmsProgramRow[]) {
    const reorderedPrograms = nextPrograms.map((item, index) => ({ ...item, sortOrder: index + 1 }));
    setCmsPrograms((current) => [
      ...reorderedPrograms,
      ...current.filter((item) => item.status !== "PUBLISHED" || !item.isActive)
    ]);
    try {
      const response = await apiPost<{ programs: CmsProgramRow[] }>(
        "/admin/cms/programs/reorder",
        { ids: reorderedPrograms.map((item) => item.id) },
        token
      );
      setCmsPrograms(response.programs);
      setFeedback("Ordem dos programas atualizada para os alunos.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a nova ordem dos programas."));
      await applyAdminChange(["programs"]);
    }
  }

  function handleCmsProgramDragStart(index: number) {
    const value = { fromIndex: index, overIndex: index };
    cmsProgramDragRef.current = value;
    setCmsProgramDragState(value);
  }

  function handleCmsProgramDragOver(index: number) {
    const current = cmsProgramDragRef.current;
    if (!current || current.overIndex === index) return;
    const value = { ...current, overIndex: index };
    cmsProgramDragRef.current = value;
    setCmsProgramDragState(value);
  }

  function handleCmsProgramDrop() {
    const drag = cmsProgramDragRef.current;
    cmsProgramDragRef.current = null;
    setCmsProgramDragState(null);
    if (!drag || drag.fromIndex === drag.overIndex) return;
    const nextPrograms = [...publishedCmsPrograms];
    const [moved] = nextPrograms.splice(drag.fromIndex, 1);
    nextPrograms.splice(drag.overIndex, 0, moved);
    void handleReorderCmsPrograms(nextPrograms);
  }

  function handleCmsProgramDragEnd() {
    cmsProgramDragRef.current = null;
    setCmsProgramDragState(null);
  }

  async function handlePublishCmsProgram(programId: string) {
    try {
      await apiPost(`/admin/cms/programs/${programId}/publish`, {}, token);
      await applyAdminChange(["programs"], "Programa publicado para os alunos.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível publicar o programa CMS."));
    }
  }

  async function handleArchiveCmsProgram(programId: string) {
    try {
      await apiPost(`/admin/cms/programs/${programId}/archive`, {}, token);
      await applyAdminChange(["programs"], "Programa arquivado.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível arquivar o programa CMS."));
    }
  }

  async function handleUpdateCmsModalityStatus(modalityId: string, isActive: boolean) {
    try {
      await apiPut(`/admin/cms/modalities/${modalityId}`, { isActive }, token);
      await applyAdminChange(["modalities"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a modalidade."));
    }
  }

  async function handleUpdateCmsWorkoutBlockRest(workoutBlockId: string, restTime: number) {
    try {
      await apiPut(`/admin/cms/workout-blocks/${workoutBlockId}`, { restTime }, token);
      await applyAdminChange(["workoutBlocks"], "Ficha atualizada.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a ficha."));
    }
  }

  async function handleUpdateCmsProgramGender(programId: string, targetGender: CmsProgramRow["targetGender"]) {
    try {
      await apiPut(`/admin/cms/programs/${programId}`, { targetGender }, token);
      await applyAdminChange(["programs"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o público do programa."));
    }
  }

  async function handleUpdateCmsProgramTotalWorkouts(programId: string, totalWorkouts: number) {
    try {
      await apiPut(`/admin/cms/programs/${programId}`, { totalWorkouts }, token);
      await applyAdminChange(["programs"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a meta de treinos."));
    }
  }

  async function handleAssignCmsProgram(programId: string, userIds?: string[], currentDay = 1, totalWorkouts = 30) {
    try {
      await apiPost(
        `/admin/cms/programs/${programId}/assign`,
        { ...(userIds?.length ? { userIds } : {}), currentDay, totalWorkouts },
        token
      );
      await applyAdminChange(["programs"], "Programa atribuído aos alunos.");
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
    const totalWorkouts = Number(data.get("totalWorkouts") ?? 30);

    await handleAssignCmsProgram(programId, userId ? [userId] : undefined, currentDay, totalWorkouts);
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
      await applyAdminChange(["plans"], "Plano cadastrado com sucesso.");
    } catch {
      setFeedback("Não foi possível cadastrar o plano.");
    }
  }

  async function handleUpdatePlanBilling(planId: string, billingCycle: PlanRow["billingCycle"]) {
    try {
      await apiPut(`/admin/plans/${planId}`, { billingCycle }, token);
      await applyAdminChange(["plans"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o plano."));
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
      await applyAdminChange(["memberships", "users", "summary"], "Matrícula criada com sucesso.");
    } catch {
      setFeedback("Não foi possível criar a matrícula.");
    }
  }

  async function handleUpdateMembershipStatus(membershipId: string, status: MembershipRow["status"]) {
    try {
      await apiPut(`/admin/memberships/${membershipId}`, { status }, token);
      await refreshAdminStudentOverview(["memberships", "users", "summary"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a matrícula."));
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
      await applyAdminChange(["payments", "memberships", "summary"], "Pagamento gerado com sucesso.");
    } catch {
      setFeedback("Não foi possível gerar o pagamento.");
    }
  }

  async function handleUpdatePaymentStatus(paymentId: string, status: PaymentRow["status"]) {
    try {
      await apiPut(
        `/admin/payments/${paymentId}`,
        { status, paidAt: status === "CONFIRMED" ? new Date().toISOString() : null },
        token
      );
      await refreshAdminStudentOverview(["payments", "memberships", "summary"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o pagamento."));
    }
  }

  function createEmptyAdminAssessmentForm(): PhysicalAssessmentForm {
    return {
      formulario_avaliacao_fisica: {
        dados_pessoais_e_objetivos: {
          nome_completo: "",
          data_nascimento: "",
          genero_biologico: { opcoes: ["Masculino", "Feminino"], resposta: "" },
          objetivo_principal: { opcoes: ["Emagrecimento", "Hipertrofia", "Condicionamento/Saúde"], resposta: "" },
          nivel_atividade_atual: { opcoes: ["Sedentário", "Leve", "Moderado", "Intenso"], resposta: "" }
        },
        historico_de_saude_anamnese: {
          possui_lesao: { descricao: "Joelho, coluna, ombro, etc.", resposta: "" },
          medicamento_continuo: { descricao: "Se sim, qual?", resposta: "" },
          restricao_medica_cardiaca: { descricao: "Se sim, qual?", resposta: "" }
        },
        composicao_corporal_basica: {
          instrucao: "Aferir preferencialmente em jejum, pela manhã",
          peso_atual_kg: null,
          altura_cm: null
        },
        perimetros_corporais_cm: {
          instrucao: "Use uma fita métrica, sem apertar a pele e sem prender a respiração",
          pescoço: { detalhe: "Abaixo do pomo de Adão", valor: null },
          torax: { detalhe: "Na linha dos mamilos", valor: null },
          cintura: { detalhe: "Na parte mais estreita do tronco", valor: null },
          abdomen: { detalhe: "Exatamente sobre a linha do umbigo", valor: null },
          quadril: { detalhe: "Na maior parte dos glúteos", valor: null },
          braco_direito_relaxado: { detalhe: "Linha média do bíceps", valor: null },
          braco_esquerdo_relaxado: { detalhe: "Linha média do bíceps", valor: null },
          coxa_direita: { detalhe: "Na região média da coxa", valor: null },
          coxa_esquerda: { detalhe: "Na região média da coxa", valor: null },
          panturrilha_direita: { detalhe: "Na maior porção do músculo", valor: null },
          panturrilha_esquerda: { detalhe: "Na maior porção do músculo", valor: null }
        },
        fotos_analise_visual: {
          instrucao: "Anexar fotos com roupas leves, postura relaxada e câmera na altura da cintura",
          arquivos: { foto_frente: "", foto_costas: "", foto_perfil: "" }
        }
      }
    };
  }

  function updateAdminAssessmentForm(mutate: (draft: PhysicalAssessmentForm) => void) {
    setAdminAssessmentForm((current) => {
      const draft = current ? structuredClone(current) : createEmptyAdminAssessmentForm();
      mutate(draft);
      return draft;
    });
  }

  function handleAdminAssessmentPhotoSelect(key: AssessmentPhotoKey, file: File | undefined) {
    updateAdminAssessmentForm((draft) => {
      draft.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key] = file?.name ?? "";
    });
    setAdminAssessmentPhotoFiles((current) => {
      const next = { ...current };
      if (!file) {
        delete next[key];
      } else {
        next[key] = file;
      }
      return next;
    });
    setAdminAssessmentPhotoPreviews((current) => {
      if (current[key]) {
        URL.revokeObjectURL(current[key]);
      }
      if (!file) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: URL.createObjectURL(file) };
    });
  }

  function clearAdminAssessmentForm() {
    setAdminAssessmentForm(createEmptyAdminAssessmentForm());
    setAdminAssessmentFormOpen(false);
    setAdminAssessmentEditingId(null);
    setAdminAssessmentUserId("");
    setAdminAssessmentAssessedAt(formatDateTimeLocalInputValue());
    setExpandedAssessmentId(null);
    setAdminAssessmentPhotoFiles({});
    setAdminAssessmentPhotoPreviews((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
  }

  function handleStartAdminAssessment(userId: string) {
    const student = users.find((item) => item.id === userId);
    setAdminAssessmentUserId(userId);
    setAdminAssessmentFormOpen(Boolean(userId));
    setAdminAssessmentEditingId(null);
    setAdminAssessmentAssessedAt(formatDateTimeLocalInputValue());
    setAdminAssessmentForm(() => {
      const draft = createEmptyAdminAssessmentForm();
      const section = draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos;
      section.nome_completo = student?.name ?? "";
      section.data_nascimento = student?.profile?.birthDate ?? "";
      section.genero_biologico.resposta =
        student?.profile?.gender === "MALE" ? "Masculino" : student?.profile?.gender === "FEMALE" ? "Feminino" : "";
      return draft;
    });
    setAdminAssessmentPhotoFiles({});
    setAdminAssessmentPhotoPreviews({});
  }

  function handleEditAdminAssessment(item: PhysicalAssessmentRow) {
    const existing = item.details ? structuredClone(item.details) : createEmptyAdminAssessmentForm();
    const section = existing.formulario_avaliacao_fisica.dados_pessoais_e_objetivos;
    if (!section.nome_completo) section.nome_completo = item.user?.name ?? "";
    if (!section.data_nascimento && item.user?.profile?.birthDate) section.data_nascimento = item.user.profile.birthDate;
    setAdminAssessmentForm(existing);
    setAdminAssessmentFormOpen(true);
    setAdminAssessmentEditingId(item.id);
    setAdminAssessmentUserId(item.userId);
    setAdminAssessmentAssessedAt(formatDateTimeLocalInputValue(item.assessedAt));
    setAdminAssessmentPhotoFiles({});
    setAdminAssessmentPhotoPreviews({});
  }

  async function handleSubmitAdminAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminAssessmentUserId) {
      setFeedback("Selecione o aluno antes de salvar a avaliação.");
      return;
    }
    setAdminSubmittingAssessment(true);
    const editingId = adminAssessmentEditingId;
    try {
      let arquivos = adminAssessmentForm.formulario_avaliacao_fisica.fotos_analise_visual.arquivos;
      for (const [key] of assessmentPhotoFields) {
        const file = adminAssessmentPhotoFiles[key];
        if (!file) continue;
        const uploadData = new FormData();
        uploadData.append("file", file);
        const uploaded = await apiUpload<UploadResponse>("/admin/uploads?group=images", uploadData, token);
        arquivos = { ...arquivos, [key]: uploaded.file.url };
      }
      const submittedAt = adminAssessmentAssessedAt ? new Date(adminAssessmentAssessedAt) : new Date();
      const payload = {
        ...adminAssessmentForm,
        formulario_avaliacao_fisica: {
          ...adminAssessmentForm.formulario_avaliacao_fisica,
          fotos_analise_visual: {
            ...adminAssessmentForm.formulario_avaliacao_fisica.fotos_analise_visual,
            arquivos
          }
        },
        userId: adminAssessmentUserId,
        assessedAt: Number.isNaN(submittedAt.getTime()) ? new Date().toISOString() : submittedAt.toISOString()
      };
      if (editingId) {
        const response = await apiPut<{ assessment: PhysicalAssessmentRow }>(
          `/admin/physical-assessments/${editingId}`,
          payload,
          token
        );
        setAssessments((current) => current.map((item) => (item.id === response.assessment.id ? response.assessment : item)));
      } else {
        const response = await apiPost<{ assessment: PhysicalAssessmentRow }>(
          "/admin/physical-assessments",
          payload,
          token
        );
        setAssessments((current) => [response.assessment, ...current]);
      }
      clearAdminAssessmentForm();
      setSuccess(editingId ? "Avaliação física atualizada com sucesso." : "Avaliação física registrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a avaliação física."));
    } finally {
      setAdminSubmittingAssessment(false);
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
      await applyAdminChange(["events"], "Evento criado com sucesso.");
    } catch {
      setFeedback("Não foi possível criar o evento.");
    }
  }

  async function handleUpdateEventStatus(eventId: string, status: EventRow["status"]) {
    try {
      await apiPut(`/admin/events/${eventId}`, { status }, token);
      await applyAdminChange(["events"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o evento."));
    }
  }

  async function handleUpdateTicket(ticketId: string, status: SupportTicketRow["status"]) {
    try {
      await apiPut(`/admin/support-tickets/${ticketId}`, { status }, token);
      await refreshAdminStudentOverview(["tickets"]);
    } catch {
      setFeedback("Não foi possível atualizar o atendimento.");
    }
  }

  async function handleSendTicketMessage(ticketId: string, body: string) {
    try {
      await apiPost(`/admin/support-tickets/${ticketId}/messages`, { body }, token);
      await refreshAdminStudentOverview(["tickets"]);
    } catch {
      setFeedback("Não foi possível enviar a resposta.");
    }
  }

  function openFinalizeModal(ticketId: string) {
    setPendingFinalizeTicketId(ticketId);
  }

  async function confirmFinalizeTicket() {
    if (!pendingFinalizeTicketId) return;
    try {
      await apiPost(`/admin/support-tickets/${pendingFinalizeTicketId}/finalize`, {}, token);
      setPendingFinalizeTicketId(null);
      await refreshAdminStudentOverview(["tickets"]);
    } catch {
      setFeedback("Não foi possível finalizar a chamada.");
    }
  }

  async function handleCloseTicket(ticketId: string) {
    try {
      await apiPost(`/admin/support-tickets/${ticketId}/close`, {}, token);
      await refreshAdminStudentOverview(["tickets"]);
    } catch {
      setFeedback("Não foi possível encerrar a chamada.");
    }
  }

  function trashDeleteResources(kind: AdminTrashKind): AdminResource[] {
    const map: Record<AdminTrashKind, AdminResource[]> = {
      users: ["users", "summary"],
      workouts: ["summary"],
      announcements: ["announcements"],
      plans: ["plans", "memberships", "payments"],
      memberships: ["memberships", "users", "summary"],
      payments: ["payments", "memberships", "summary"],
      assessments: ["assessments"],
      events: ["events"],
      tickets: ["tickets"],
      aiPlans: ["aiPlans"],
      products: ["products", "purchases", "favorites", "ratings"],
      purchases: ["purchases"],
      cards: ["paymentCards"],
      favorites: ["favorites", "products"],
      ratings: ["ratings", "products"],
      contactMessages: ["contactMessages"],
      modalities: ["modalities"],
      locations: ["locations"],
      exercises: ["exercises", "workoutBlocks"],
      workoutBlocks: ["workoutBlocks", "programs"],
      programs: ["programs"]
    };
    return map[kind];
  }

  async function loadAdminTrash() {
    if (!token) return;
    setAdminTrashLoading(true);
    try {
      const response = await apiGet<{ trash: AdminTrashData }>("/admin/trash", token);
      setAdminTrash(response.trash);
    } catch {
      setFeedback("Não foi possível carregar a lixeira.");
    } finally {
      setAdminTrashLoading(false);
    }
  }

  async function confirmCmsDelete() {
    const target = pendingCmsDelete;
    if (!target) return;
    try {
      const base = trashResourceBase(target.kind);
      const softBase = trashSoftDeleteBase(target.kind);
      await apiDelete(target.permanent ? `${base}/${target.id}/permanent` : `${softBase}/${target.id}`, token);
      setPendingCmsDelete(null);
      await loadAdminTrash();
      await applyAdminChange(trashDeleteResources(target.kind), target.permanent ? "Excluído definitivamente da lixeira." : "Movido para a lixeira.");
    } catch {
      setFeedback("Não foi possível excluir o registro.");
    }
  }

  async function handleRestoreCmsItem(target: CmsDeleteTarget) {
    try {
      const base = trashResourceBase(target.kind);
      await apiPost(`${base}/${target.id}/restore`, {}, token);
      await loadAdminTrash();
      await applyAdminChange(trashDeleteResources(target.kind), "Item restaurado com sucesso.");
    } catch {
      setFeedback("Não foi possível restaurar o item.");
    }
  }

  function renderTrashGroup(kind: AdminTrashKind, label: string, items: TrashDisplayItem[]) {
    return (
      <div className="cms-trash-group" key={kind}>
        <h3>{label}</h3>
        {items.length === 0 ? (
          <p className="cms-empty-hint">Nenhum item na lixeira.</p>
        ) : (
          items.map((item) => (
            <div className="cms-data-row cms-trash-item" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                {item.sub ? <small>{item.sub}</small> : null}
              </span>
              <div className="cms-row-actions">
                <button type="button" aria-label={`Restaurar ${label}: ${item.name}`} onClick={() => void handleRestoreCmsItem({ kind, id: item.id, name: item.name })}>
                  <RotateCcw size={17} />
                  Restaurar
                </button>
                <button type="button" className="danger-button" aria-label={`Excluir em definitivo ${label}: ${item.name}`} onClick={() => setPendingCmsDelete({ kind, id: item.id, name: item.name, permanent: true })}>
                  <Trash2 size={17} />
                  Excluir em definitivo
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/products",
        {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? "") || undefined,
          category: String(data.get("category") ?? "") || undefined,
          priceInCents: Math.round(Number(data.get("price") ?? 0) * 100),
          isActive: true
        },
        token
      );
      form.reset();
      await applyAdminChange(["products"], "Produto cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o produto."));
    }
  }

  async function handleUpdateProductStatus(productId: string, isActive: boolean) {
    try {
      await apiPut(`/admin/products/${productId}`, { isActive }, token);
      await applyAdminChange(["products"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o produto."));
    }
  }

  async function handleCreatePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = String(data.get("userId") ?? "");
    const productId = String(data.get("productId") ?? "");
    const product = products.find((item) => item.id === productId);

    if (!userId || !product) {
      setFeedback("Selecione o aluno e o produto.");
      return;
    }

    try {
      await apiPost(
        "/admin/purchases",
        {
          userId,
          productId,
          amountInCents: Number(data.get("amountInCents") ?? product.priceInCents) || product.priceInCents,
          status: "CONFIRMED",
          paymentMethod: String(data.get("paymentMethod") ?? "") || undefined
        },
        token
      );
      form.reset();
      await applyAdminChange(["purchases", "products"], "Compra registrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível registrar a compra."));
    }
  }

  async function handleUpdatePurchaseStatus(purchaseId: string, status: PurchaseStatus) {
    try {
      await apiPut(`/admin/purchases/${purchaseId}`, { status }, token);
      await applyAdminChange(["purchases"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a compra."));
    }
  }

  async function handleCreatePaymentCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/admin/payment-cards",
        {
          userId: String(data.get("userId") ?? ""),
          brand: String(data.get("brand") ?? "") || undefined,
          lastFour: String(data.get("lastFour") ?? ""),
          holderName: String(data.get("holderName") ?? "") || undefined,
          isDefault: data.get("isDefault") === "on"
        },
        token
      );
      form.reset();
      await applyAdminChange(["paymentCards"], "Cartão cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível cadastrar o cartão."));
    }
  }

  async function handleUpdateContactMessageStatus(messageId: string, status: ContactMessageRow["status"]) {
    try {
      await apiPut(`/admin/contact-messages/${messageId}`, { status }, token);
      await applyAdminChange(["contactMessages"]);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a mensagem."));
    }
  }

  async function handleSaveSettings(next: Record<string, string>) {
    try {
      await apiPut("/admin/settings", next, token);
      await applyAdminChange(["settings"], "Configurações salvas com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar as configurações."));
    }
  }

  function toggleSystemSetting(key: string) {
    const current = systemSettings[key] === "true";
    void handleSaveSettings({ ...systemSettings, [key]: current ? "false" : "true" });
  }

  function setSystemSettingValue(key: string, value: string) {
    setSystemSettings((previous) => ({ ...previous, [key]: value }));
  }

  const moduleSettingRows = [
    { key: "module_products", label: "Produtos", description: "Catálogo de produtos e vendas." },
    { key: "module_purchases", label: "Compras", description: "Registro de compras e pagamentos." },
    { key: "module_qr", label: "QR Code", description: "Check-in por QR Code na academia." },
    { key: "module_cards", label: "Meus Cartões", description: "Cartões salvos para cobranças." },
    { key: "module_contact", label: "Contato", description: "Mensagens recebidas dos visitantes." },
    { key: "module_favorites", label: "Favoritos", description: "Favoritos dos alunos." },
    { key: "module_ratings", label: "Avaliar", description: "Avaliações de produtos e treinos." }
  ];

  const nowForStats = new Date();
  const currentMonthForStats = `${nowForStats.getFullYear()}-${nowForStats.getMonth()}`;
  const revenueThisMonth = payments
    .filter((payment) => {
      if (payment.status !== "CONFIRMED") return false;
      const date = new Date(payment.paidAt ?? payment.dueDate);
      return `${date.getFullYear()}-${date.getMonth()}` === currentMonthForStats;
    })
    .reduce((sum, payment) => sum + payment.amountInCents, 0);
  const purchasesThisMonth = purchases.filter((purchase) => {
    const date = new Date(purchase.createdAt);
    return `${date.getFullYear()}-${date.getMonth()}` === currentMonthForStats;
  }).length;
  const averageRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length : null;

  const stats = [
    { icon: UsersRound, label: "Usuários", value: String(summary.users), trend: "Total" },
    { icon: ShieldCheck, label: "Matrículas ativas", value: String(summary.activeMemberships), trend: "Ativas" },
    { icon: CreditCard, label: "Pagamentos pendentes", value: String(summary.pendingPayments), trend: "Abertos" },
    { icon: Activity, label: "Acessos hoje", value: String(summary.todayAttendance), trend: "Hoje" },
    { icon: Wallet, label: "Receita no mês", value: formatPriceInBRL(revenueThisMonth), trend: "Confirmada" },
    { icon: Package, label: "Produtos", value: String(products.length), trend: "Catálogo" },
    { icon: ShoppingCart, label: "Compras no mês", value: String(purchasesThisMonth), trend: "Vendas" },
    { icon: Star, label: "Avaliação média", value: averageRating !== null ? String(Math.round(averageRating * 10) / 10).replace(".", ",") : "—", trend: `${ratings.length} voto(s)` }
  ];
  const activeStudents = users.filter(
    (item) =>
      item.role === "USER" &&
      item.status === "ACTIVE" &&
      (item.enrollmentStatus === "ACTIVE" || item.memberships?.some((membership) => membership.status === "ACTIVE"))
  );
  const usersPageSize = 12;
  const filteredAdminUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    return users.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.email.toLowerCase().includes(normalizedSearch) ||
        item.profile?.document?.toLowerCase().includes(normalizedSearch) ||
        item.phone?.toLowerCase().includes(normalizedSearch) ||
        item.profile?.phone?.toLowerCase().includes(normalizedSearch);
      const matchesRole = userRoleFilter === "ALL" || item.role === userRoleFilter;
      const matchesStatus = userStatusFilter === "ALL" || item.status === userStatusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [userRoleFilter, userSearch, userStatusFilter, users]);
  const managerUserOptions = useMemo(() => {
    const normalizedSearch = managedUserSearch.trim().toLowerCase();

    return users
      .filter((item) => item.role === "USER")
      .filter((item) => {
        if (!normalizedSearch) return true;

        return (
          item.name.toLowerCase().includes(normalizedSearch) ||
          item.email.toLowerCase().includes(normalizedSearch) ||
          item.profile?.document?.toLowerCase().includes(normalizedSearch) ||
          item.phone?.toLowerCase().includes(normalizedSearch) ||
          item.profile?.phone?.toLowerCase().includes(normalizedSearch)
        );
      });
  }, [managedUserSearch, users]);
  const usersTotalPages = Math.max(1, Math.ceil(filteredAdminUsers.length / usersPageSize));
  const currentUsersPage = Math.min(usersPage, usersTotalPages);
  const visibleAdminUsers = filteredAdminUsers.slice((currentUsersPage - 1) * usersPageSize, currentUsersPage * usersPageSize);
  const cmsPublishedCount = cmsPrograms.filter((item) => item.status === "PUBLISHED").length;
  const cmsAssignmentCount = cmsPrograms.reduce((total, item) => total + (item.assignedUsers?.length ?? 0), 0);
  const cmsStepCards = [
    {
      id: "locations" as const,
      icon: MapPin,
      title: "Localidades",
      text: "Gerencie academias, unidades ou clubes.",
      metric: `${cmsLocations.filter((item) => item.isActive).length} ativa(s)`
    },
    {
      id: "modalities" as const,
      icon: Dumbbell,
      title: "Modalidades",
      text: "Crie categorias de treino para organizar o catálogo.",
      metric: `${cmsModalities.filter((item) => item.isActive).length} ativa(s)`
    },
    {
      id: "lessons" as const,
      icon: UploadCloud,
      title: "Exercícios/Aulas e Materiais",
      text: "Crie, edite e exclua exercícios, aulas e materiais de apoio.",
      metric: `${cmsExercises.length} ativo(s)`
    },
    {
      id: "blocks" as const,
      icon: ClipboardList,
      title: "Fichas de treino",
      text: "Defina divisões, exercícios, séries, carga e descanso.",
      metric: `${cmsWorkoutBlocks.length} ativo(s)`
    },
    {
      id: "publish" as const,
      icon: Check,
      title: "Publicações",
      text: "Publique conteúdo para alunos.",
      metric: `${cmsPublishedCount} publicado(s)`
    }
  ];

  const selectedChatTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedChatTicketId) ?? tickets[0] ?? null,
    [selectedChatTicketId, tickets]
  );

  const unreadTicketsCount = useMemo(() => {
    const since = ticketsReadAt ? new Date(ticketsReadAt) : new Date(0);
    return tickets.filter((ticket) => {
      const last = ticket.messages[ticket.messages.length - 1];
      return Boolean(last && last.senderType === "STUDENT" && new Date(last.createdAt) > since);
    }).length;
  }, [tickets, ticketsReadAt]);

  useEffect(() => {
    if (adminSection !== "contact") return;
    const now = new Date().toISOString();
    setTicketsReadAt(now);
    window.localStorage.setItem("admin-tickets-read-at", now);
  }, [adminSection]);

  const ticketStatusLabel: Record<SupportTicketRow["status"], string> = {
    OPEN: "Aguardando resposta",
    IN_PROGRESS: "Em andamento",
    WAITING_STUDENT: "Aguardando aluno",
    RESOLVED: "Resolvido",
    CLOSED: "Encerrado"
  };

  return (
    <main className={sidebarCollapsed ? "workspace-shell admin-workspace-shell sidebar-collapsed" : "workspace-shell admin-workspace-shell"}>
      <aside className="workspace-sidebar" aria-label="Menu administrativo">
        <div className="workspace-sidebar-brand">
          <img src={assetUrl("assets/app-treino-mark.svg")} alt="" aria-hidden="true" />
          <div>
            <strong>App Treino</strong>
            <span>Admin</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav className="workspace-nav">
          <span className="admin-nav-group-label">Principal</span>
          <button className={adminSection === "overview" ? "active" : ""} onClick={() => setAdminSection("overview")}>
            <Home size={18} />
            <span className="sidebar-label">Dashboard</span>
          </button>

          <span className="admin-nav-group-label">Conteúdo e membros</span>
          <button
            className={adminSection === "training" ? "active" : ""}
            onClick={() => {
              setAdminSection("training");
              setCmsStep("locations");
            }}
          >
            <Dumbbell size={18} />
            <span className="sidebar-label">Treinos e Aulas CMS</span>
          </button>
          <button
            className={adminSection === "users" ? "active" : ""}
            onClick={() => setAdminSection("users")}
          >
            <UsersRound size={18} />
            <span className="sidebar-label">Dados do usuário</span>
          </button>
          <button className={adminSection === "finance" ? "active" : ""} onClick={() => setAdminSection("finance")}>
            <CircleDollarSign size={18} />
            <span className="sidebar-label">Financeiro</span>
          </button>

          <span className="admin-nav-group-label">Comercial</span>
          <button className={adminSection === "products" ? "active" : ""} onClick={() => setAdminSection("products")}>
            <Package size={18} />
            <span className="sidebar-label">Produtos</span>
          </button>
          <button className={adminSection === "purchases" ? "active" : ""} onClick={() => setAdminSection("purchases")}>
            <ShoppingCart size={18} />
            <span className="sidebar-label">Compras</span>
          </button>
          <button className={adminSection === "qr" ? "active" : ""} onClick={() => setAdminSection("qr")}>
            <QrCode size={18} />
            <span className="sidebar-label">QR Code</span>
          </button>
          <button className={adminSection === "cards" ? "active" : ""} onClick={() => setAdminSection("cards")}>
            <CreditCard size={18} />
            <span className="sidebar-label">Meus Cartões</span>
          </button>

          <span className="admin-nav-group-label">Avaliação e eventos</span>
          <button className={adminSection === "assessments" ? "active" : ""} onClick={() => setAdminSection("assessments")}>
            <Ruler size={18} />
            <span className="sidebar-label">Avaliações físicas</span>
          </button>
          <button className={adminSection === "events" ? "active" : ""} onClick={() => setAdminSection("events")}>
            <CalendarPlus size={18} />
            <span className="sidebar-label">Eventos</span>
          </button>

          <span className="admin-nav-group-label">Relacionamento</span>
          <button className={adminSection === "contact" ? "active" : ""} onClick={() => setAdminSection("contact")}>
            <MessageCircle size={18} />
            <span className="sidebar-label">Contato</span>
            {unreadTicketsCount > 0 && <span className="admin-nav-badge">{unreadTicketsCount}</span>}
          </button>
          <button className={adminSection === "favorites" ? "active" : ""} onClick={() => setAdminSection("favorites")}>
            <Star size={18} />
            <span className="sidebar-label">Favoritos</span>
          </button>
          <button className={adminSection === "ratings" ? "active" : ""} onClick={() => setAdminSection("ratings")}>
            <Sparkles size={18} />
            <span className="sidebar-label">Avaliar</span>
          </button>

          <span className="admin-nav-group-label">Sistema</span>
          <button className={adminSection === "trash" ? "active" : ""} onClick={() => setAdminSection("trash")}>
            <Trash2 size={18} />
            <span className="sidebar-label">Lixeira</span>
            {adminTrashTotal > 0 && <span className="admin-nav-badge">{adminTrashTotal}</span>}
          </button>
          <button className={adminSection === "settings" ? "active" : ""} onClick={() => setAdminSection("settings")}>
            <Settings size={18} />
            <span className="sidebar-label">Configurações</span>
          </button>
        </nav>
        <button className="workspace-logout" onClick={onLogout}>
          <LogOut size={18} />
          <span className="sidebar-label">Sair</span>
        </button>
        <div className="workspace-sidebar-user">
          <span>
            <UserRound size={18} />
          </span>
          <div className="sidebar-user-info">
            <strong>Admin</strong>
            <small>Administrador</small>
          </div>
        </div>
      </aside>
      <section className="workspace-content admin-workspace-content">
      <section className="dashboard-heading" id="admin-overview">
        <div>
          <span className="eyebrow">Painel administrativo</span>
          <h1>Operação do App Treino</h1>
        </div>
        <div className="dashboard-actions">
          <button className="outline-button compact-button" onClick={() => void loadAdminData()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            Atualizar
          </button>
          <button
            className="primary-button compact-button admin-publish-shortcut"
            onClick={() => {
              setAdminSection("training");
              setCmsStep("publish");
            }}
            type="button"
          >
            <UploadCloud size={18} />
            Publicar para alunos
          </button>
        </div>
      </section>
      {success && <div className="success-box">{success}</div>}
      {feedback && <div className="error-box">{feedback}</div>}
      {adminSection === "overview" && (
        <>
          <AdminDashboardOverview
            stats={stats}
            payments={payments}
            events={events}
            tickets={tickets}
            users={users}
            memberships={memberships}
            products={products}
            purchases={purchases}
            contactMessages={contactMessages}
            favorites={favorites}
            ratings={ratings}
            systemSettings={systemSettings}
            lastUpdatedAt={lastUpdatedAt}
            loading={loading}
            onRefresh={() => void loadAdminData()}
            onNavigate={(section) => {
              setAdminSection(section);
              if (section === "training") setCmsStep("lessons");
              if (section === "programs") setCmsStep("publish");
            }}
          />
          <AdminReports
            users={users}
            payments={payments}
            assessments={assessments}
            ratings={ratings}
            lastUpdatedAt={lastUpdatedAt}
            loading={loading}
            onRefresh={() => void loadAdminData()}
          />
        </>
      )}

      {adminSection === "users" && <section className="admin-grid">
        <article className="table-panel wide-panel" id="admin-users">
          <div className="panel-title">
            <div>
              <h2>Usuários</h2>
              <p>Cadastro e gestão de alunos e administradores da academia.</p>
            </div>
            <span>{filteredAdminUsers.length}/{users.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateUser}>
            <input name="name" placeholder="Nome" required />
            <input name="email" type="email" placeholder="E-mail" required />
            <input name="password" type="password" placeholder="Senha" minLength={6} required />
            <select name="role" defaultValue="USER">
              <option value="USER">Aluno</option>
              <option value="ADMIN">Admin</option>
            </select>
            <select name="gender" defaultValue="">
              <option value="">Sexo</option>
              <option value="MALE">Masculino</option>
              <option value="FEMALE">Feminino</option>
            </select>
            <input name="objective" placeholder="Objetivo" />
            <input name="level" placeholder="Nível" />
            <StateCityFields />
            <select name="locationId" defaultValue="">
              <option value="">Localidade</option>
              {cmsLocations.filter((item) => item.isActive).map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button className="primary-button">
              <Save size={18} />
              Salvar usuário
            </button>
          </form>
          <div className="admin-users-toolbar">
            <label>
              Filtrar usuário
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Nome, e-mail, telefone ou documento"
              />
            </label>
            <label>
              Perfil
              <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as "ALL" | AdminUser["role"])}>
                <option value="ALL">Todos</option>
                <option value="USER">Alunos</option>
                <option value="ADMIN">Admins</option>
              </select>
            </label>
            <label>
              Status
              <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value as "ALL" | AdminUser["status"])}>
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </label>
          </div>
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Matrícula</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleAdminUsers.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.email}</small>
                      </span>
                    </td>
                    <td>{item.role === "USER" ? "Aluno" : "Admin"}</td>
                    <td>
                      <select
                        aria-label="Status do usuário"
                        value={item.status}
                        onChange={(event) => handleUpdateUserStatus(item.id, event.target.value as AdminUser["status"])}
                      >
                        <option value="ACTIVE">Ativo</option>
                        <option value="INACTIVE">Inativo</option>
                      </select>
                    </td>
                    <td>
                      <small>{item.enrollmentStatus}</small>
                    </td>
                    <td>
                      <div className="admin-users-actions">
                        {item.role === "USER" && (
                          <button type="button" onClick={() => setSelectedAdminStudentId(item.id)}>
                            Gerenciar
                          </button>
                        )}
                        <button aria-label="Excluir usuário" onClick={() => setPendingCmsDelete({ kind: "users", id: item.id, name: item.name })}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleAdminUsers.length === 0 && (
                  <tr>
                    <td colSpan={5}>Nenhum usuário encontrado para os filtros selecionados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-users-pagination">
            <span>
              Página {currentUsersPage} de {usersTotalPages} • {filteredAdminUsers.length} registro(s)
            </span>
            <div>
              <button type="button" onClick={() => setUsersPage((page) => Math.max(1, page - 1))} disabled={currentUsersPage <= 1}>
                <ChevronLeft size={17} />
                Anterior
              </button>
              <button type="button" onClick={() => setUsersPage((page) => Math.min(usersTotalPages, page + 1))} disabled={currentUsersPage >= usersTotalPages}>
                Próxima
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </article>

        <article className="table-panel wide-panel admin-student-control-panel" id="admin-user-manager">
            <div className="panel-title">
              <div>
                <h2>Ficha do usuário</h2>
                <p>Filtre um aluno e edite as informações completas sincronizadas com o painel do aluno.</p>
              </div>
              <span>{studentOverviewLoading ? "Carregando" : selectedAdminStudent?.student.name ?? "Selecione um usuário"}</span>
            </div>
            <div className="admin-student-toolbar">
              <label className="admin-student-filter">
                Filtrar usuário
                <input
                  value={managedUserSearch}
                  onChange={(event) => setManagedUserSearch(event.target.value)}
                  placeholder="Nome, e-mail, telefone ou documento"
                />
              </label>
              <select
                aria-label="Selecionar aluno"
                value={selectedAdminStudentId ?? ""}
                onChange={(event) => setSelectedAdminStudentId(event.target.value)}
              >
                <option value="">Selecione um usuário</option>
                {managerUserOptions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {selectedAdminStudentId && (
                <button className="outline-button compact-button" type="button" onClick={() => setSelectedAdminStudentId(null)}>
                  <ChevronLeft size={18} />
                  Limpar seleção
                </button>
              )}
            </div>
            {selectedAdminStudent ? (
              <>
            <div className="admin-student-summary-grid">
              <span><UserRound size={18} /><strong>{selectedAdminStudent.student.status}</strong><small>Perfil</small></span>
              <span><Dumbbell size={18} /><strong>{selectedAdminStudent.summary.completedWorkoutSessions}</strong><small>Treinos concluídos</small></span>
              <span><CalendarDays size={18} /><strong>{selectedAdminStudent.summary.attendanceThisMonth}</strong><small>Frequência no mês</small></span>
              <span><CreditCard size={18} /><strong>{selectedAdminStudent.summary.pendingPayments}</strong><small>Pagamentos pendentes</small></span>
              <span><Headphones size={18} /><strong>{selectedAdminStudent.summary.openTickets}</strong><small>Atendimentos abertos</small></span>
            </div>

            <section className="admin-student-section-grid">
              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <UserRound size={18} />
                  <strong>Perfil</strong>
                </div>
                <form className="crud-form admin-student-profile-form" onSubmit={(event) => handleUpdateAdminStudentProfile(event, selectedAdminStudent.student.id)}>
                  <input name="name" defaultValue={selectedAdminStudent.student.name} placeholder="Nome" required />
                  <input name="email" type="email" defaultValue={selectedAdminStudent.student.email ?? ""} placeholder="E-mail" required />
                  <input name="phone" defaultValue={selectedAdminStudent.student.phone ?? selectedAdminStudent.student.profile?.phone ?? ""} placeholder="Telefone" />
                  <input name="document" defaultValue={selectedAdminStudent.student.profile?.document ?? ""} placeholder="Documento" />
                  <select name="gender" defaultValue={selectedAdminStudent.student.profile?.gender ?? ""}>
                    <option value="">Sexo</option>
                    <option value="MALE">Masculino</option>
                    <option value="FEMALE">Feminino</option>
                  </select>
                  <select name="status" defaultValue={selectedAdminStudent.student.status}>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                  <input name="objective" defaultValue={selectedAdminStudent.student.profile?.objective ?? ""} placeholder="Objetivo" />
                  <input name="level" defaultValue={selectedAdminStudent.student.profile?.level ?? ""} placeholder="Nível" />
                  <StateCityFields
                    stateDefault={selectedAdminStudent.student.profile?.state ?? ""}
                    cityDefault={selectedAdminStudent.student.profile?.city ?? ""}
                  />
                  <select name="locationId" defaultValue={selectedAdminStudent.student.profile?.locationId ?? ""}>
                    <option value="">Localidade</option>
                    {cmsLocations.filter((item) => item.isActive).map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button">
                    <Save size={18} />
                    Salvar perfil
                  </button>
                </form>
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <Dumbbell size={18} />
                  <strong>Treino</strong>
                </div>
                {selectedAdminStudent.programAssignments.length > 0 ? (
                  selectedAdminStudent.programAssignments.slice(0, 4).map((assignment) => (
                    <div className="data-row" key={assignment.id}>
                      <span>
                        <strong>{assignment.program.title}</strong>
                        {assignment.completedWorkouts}/{assignment.totalWorkouts} treino(s) - dia {assignment.currentDay}
                      </span>
                      <small>{assignment.status}</small>
                    </div>
                  ))
                ) : (
                  <p>Nenhum programa atribuído.</p>
                )}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <ShieldCheck size={18} />
                  <strong>Matrículas</strong>
                </div>
                {selectedAdminStudent.student.memberships?.slice(0, 4).map((membership) => (
                  <div className="data-row" key={membership.id}>
                    <span>
                      <strong>{membership.plan?.name ?? "Plano"}</strong>
                      Status da assinatura
                    </span>
                    <select
                      aria-label="Status da matrícula do aluno"
                      value={membership.status}
                      onChange={(event) => void handleUpdateMembershipStatus(membership.id, event.target.value as MembershipRow["status"])}
                    >
                      <option value="PENDING">Pendente</option>
                      <option value="ACTIVE">Ativa</option>
                      <option value="OVERDUE">Atrasada</option>
                      <option value="CANCELED">Cancelada</option>
                    </select>
                  </div>
                )) ?? <p>Nenhuma matrícula.</p>}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <CreditCard size={18} />
                  <strong>Pagamentos</strong>
                </div>
                {selectedAdminStudent.payments.slice(0, 5).map((payment) => (
                  <div className="data-row" key={payment.id}>
                    <span>
                      <strong>{formatPriceInBRL(payment.amountInCents)}</strong>
                      {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
                    </span>
                    <select
                      aria-label="Status do pagamento do aluno"
                      value={payment.status}
                      onChange={(event) => void handleUpdatePaymentStatus(payment.id, event.target.value as PaymentRow["status"])}
                    >
                      <option value="PENDING">Pendente</option>
                      <option value="CONFIRMED">Confirmado</option>
                      <option value="OVERDUE">Atrasado</option>
                      <option value="REFUNDED">Reembolsado</option>
                      <option value="CANCELED">Cancelado</option>
                    </select>
                  </div>
                ))}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <Ruler size={18} />
                  <strong>Avaliações</strong>
                </div>
                {selectedAdminStudent.assessments.slice(0, 4).map((assessment) => (
                  <div className="data-row" key={assessment.id}>
                    <span>
                      <strong>{formatAssessmentDateTime(assessment.assessedAt)}</strong>
                      {assessment.weightKg ?? "-"}kg - {assessment.bodyFatPct ?? "-"}% gordura
                    </span>
                  </div>
                ))}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <CalendarDays size={18} />
                  <strong>Frequência</strong>
                </div>
                {selectedAdminStudent.workoutSessions.slice(0, 5).map((session) => (
                  <div className="data-row" key={session.id}>
                    <span>
                      <strong>Treino dia {session.dayNumber}</strong>
                      {new Date(session.startedAt).toLocaleString("pt-BR")}
                    </span>
                    <small>{session.status}</small>
                  </div>
                ))}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <CalendarPlus size={18} />
                  <strong>Eventos</strong>
                </div>
                {selectedAdminStudent.eventRegistrations.slice(0, 4).map((registration) => (
                  <div className="data-row" key={registration.id}>
                    <span>
                      <strong>{registration.event.title}</strong>
                      {new Date(registration.event.startsAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <Headphones size={18} />
                  <strong>Atendimento</strong>
                </div>
                {selectedAdminStudent.tickets.slice(0, 5).map((ticket) => (
                  <div className="data-row ticket-row" key={ticket.id}>
                    <span>
                      <strong>{ticket.subject}</strong>
                      {ticket.category}
                    </span>
                    <select
                      aria-label="Status do atendimento do aluno"
                      value={ticket.status}
                      onChange={(event) => void handleUpdateTicket(ticket.id, event.target.value as SupportTicketRow["status"])}
                    >
                      <option value="OPEN">Aberto</option>
                      <option value="IN_PROGRESS">Em andamento</option>
                      <option value="RESOLVED">Resolvido</option>
                      <option value="CLOSED">Fechado</option>
                    </select>
                  </div>
                ))}
              </article>
            </section>

            <section className="admin-student-placeholder-grid">
              {[
                { icon: Package, title: "Produtos", text: "Catálogo ainda não possui entidade própria no banco." },
                { icon: ShoppingCart, title: "Compras", text: "Depende do CRUD de pedidos/produtos." },
                { icon: QrCode, title: "QR Code", text: `Código do aluno: ${selectedAdminStudent.student.id.slice(-8).toUpperCase()}` },
                { icon: CreditCard, title: "Meus Cartões", text: "Cartões não são armazenados localmente; ficam no gateway." },
                { icon: Settings, title: "Configurações", text: "Status, sexo, objetivo, nível e assinatura já editáveis acima." },
                { icon: MessageCircle, title: "Contato", text: selectedAdminStudent.student.phone ?? selectedAdminStudent.student.email },
                { icon: Star, title: "Favoritos", text: "Ainda sem tabela de favoritos vinculada ao aluno." },
                { icon: Trophy, title: "Avaliar", text: "Avaliações físicas estão integradas; nota/review ainda não existe." }
              ].map((item) => (
                <div className="settings-card" key={item.title}>
                  <item.icon size={20} />
                  <span>
                    <strong>{item.title}</strong>
                    {item.text}
                  </span>
                </div>
              ))}
            </section>
              </>
            ) : (
              <div className="admin-student-picker-grid">
                {managerUserOptions.slice(0, 12).map((item) => (
                  <button type="button" key={item.id} onClick={() => setSelectedAdminStudentId(item.id)}>
                    <UserRound size={18} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.email}</small>
                    </span>
                  </button>
                ))}
                {managerUserOptions.length === 0 && (
                  <div className="settings-card">
                    <Search size={20} />
                    <span>
                      <strong>Nenhum usuário encontrado</strong>
                      Ajuste o filtro para localizar o aluno que deseja gerenciar.
                    </span>
                  </div>
                )}
              </div>
            )}
          </article>
      </section>}

      {(adminSection === "training" || adminSection === "programs") && <section className="admin-grid">
        <article className="table-panel wide-panel cms-panel" id="admin-cms">
          <div className="panel-title">
            <h2>CMS Fitness</h2>
            <span>Publicação para alunos</span>
          </div>
          <div className="cms-hero">
            <div>
              <span className="eyebrow">CMS Fitness</span>
              <h3>Crie uma aula, monte a ficha e publique para alunos sem procurar campos escondidos.</h3>
              <p>
                O fluxo está separado por etapas: localidades, modalidades, aulas com materiais, fichas de treino e publicação.
              </p>
            </div>
            <div className="cms-hero-metrics">
              <span><UploadCloud size={18} /><strong>{cmsExercises.length}</strong><small>Aulas</small></span>
              <span><UsersRound size={18} /><strong>{cmsModalities.length}</strong><small>Turmas</small></span>
              <span><Play size={18} /><strong>{cmsWorkoutBlocks.length}</strong><small>Fichas</small></span>
              <span><UserRound size={18} /><strong>{activeStudents.length}</strong><small>Alunos ativos</small></span>
            </div>
          </div>
          <div className="cms-workflow">
            {cmsStepCards.map((step, index) => (
              <button
                className={cmsStep === step.id ? "active" : ""}
                key={step.id}
                onClick={() => setCmsStep(step.id)}
                type="button"
              >
                <strong>{index + 1}</strong>
                <span><step.icon size={18} />{step.title}</span>
                <small>{step.text}</small>
                <small className="cms-step-metric">{step.metric}</small>
              </button>
            ))}
          </div>
          <div className="cms-admin-grid cms-studio-grid">
            {!cmsTrashOpen && cmsStep === "locations" && <section className="cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Localidades</h2>
                  <p>Gerencie academias, unidades ou clubes exibidos para os alunos.</p>
                </div>
                <span>{cmsLocations.length}</span>
              </div>
              <form key={editingCmsLocation?.id ?? "new-location"} className="crud-form cms-form" onSubmit={handleCreateCmsLocation}>
                <label>
                  Nome
                  <input name="name" placeholder="Ex.: Academia Centro" defaultValue={editingCmsLocation?.name ?? ""} required />
                </label>
                <label>
                  Tipo
                  <select name="type" defaultValue={editingCmsLocation?.type ?? "ACADEMY"}>
                    <option value="ACADEMY">Academia</option>
                    <option value="UNIT">Unidade</option>
                    <option value="CLUB">Clube</option>
                  </select>
                </label>
                <label className="wide-field">
                  Descrição
                  <input name="description" placeholder="Resumo da unidade" defaultValue={editingCmsLocation?.description ?? ""} />
                </label>
                <label className="wide-field">
                  Endereço
                  <input name="address" placeholder="Rua, número, bairro" defaultValue={editingCmsLocation?.address ?? ""} />
                </label>
                <StateCityFields
                  stateDefault={editingCmsLocation?.state ?? ""}
                  cityDefault={editingCmsLocation?.city ?? ""}
                  withLabels
                />
                <label className="wide-field">
                  Telefone
                  <input name="phone" placeholder="(11) 99999-9999" defaultValue={editingCmsLocation?.phone ?? ""} />
                </label>
                <label className="cms-upload-field wide-field">
                  <ImageIcon size={24} />
                  <strong>Imagem da localidade</strong>
                  <small>Upload com preview. Envie uma imagem (PNG ou JPG).</small>
                  <input
                    name="locationImage"
                    type="file"
                    accept="image/*"
                    aria-label="Selecionar imagem da localidade"
                    ref={cmsLocationImageRef}
                    onChange={(event) => handleCmsLocationImageChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                {cmsLocationImagePreview ? (
                  <div className="cms-image-preview wide-field">
                    <img src={cmsLocationImagePreview} alt="Prévia da imagem da localidade" />
                    <button type="button" onClick={handleCmsLocationImageClear}>
                      <Trash2 size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsLocation?.imageUrl && !cmsLocationImageRemove ? (
                  <div className="cms-image-preview wide-field">
                    <img src={mediaUrl(editingCmsLocation.imageUrl)} alt="Imagem atual da localidade" />
                    <small>Imagem atual (envie uma nova para substituir)</small>
                    <button type="button" onClick={() => setCmsLocationImageRemove(true)}>
                      <ImageOff size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsLocation?.imageUrl ? (
                  <div className="cms-image-preview wide-field">
                    <small>Foto marcada para remoção — ela será apagada ao salvar.</small>
                    <button type="button" onClick={() => setCmsLocationImageRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsLocation ? "Salvar alterações" : "Salvar localidade"}
                </button>
                {editingCmsLocation && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsLocationEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              {cmsLocations.slice(0, 12).map((item) => (
                <div className={`data-row cms-data-row${item.imageUrl ? " with-thumb" : ""}`} key={item.id}>
                  {item.imageUrl && (
                    <img className="cms-data-row-thumb" src={mediaUrl(item.imageUrl)} alt={item.name} />
                  )}
                  <span>
                    <strong>{item.name}</strong>
                    {[item.city, item.state].filter(Boolean).join(" - ") || item.address || item.slug}
                  </span>
                  <select
                    aria-label="Status da localidade"
                    value={item.isActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(event) => handleUpdateCmsLocationStatus(item.id, event.target.value === "ACTIVE")}
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="INACTIVE">Inativa</option>
                  </select>
                  <small>ordem {item.sortOrder}</small>
                  <div className="cms-row-actions">
                    <button aria-label="Editar localidade" onClick={() => startEditCmsLocation(item)}>
                      <Pencil size={17} />
                    </button>
                    <button aria-label="Excluir localidade" onClick={() => setPendingCmsDelete({ kind: "locations", id: item.id, name: item.name })}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </section>}

            {!cmsTrashOpen && cmsStep === "modalities" && <section className="cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Modalidades</h2>
                  <p>Crie categorias simples para organizar o catálogo do aluno.</p>
                </div>
                <span>{cmsModalities.length}</span>
              </div>
              <form className="crud-form cms-form" key={editingCmsModality?.id ?? "new"} onSubmit={handleSaveCmsModality}>
                <label>
                  Nome
                  <input name="name" placeholder="Ex.: Musculação iniciante" required defaultValue={editingCmsModality?.name ?? ""} />
                </label>
                <label className="wide-field">
                  Descrição curta
                  <input name="description" placeholder="Resumo para identificar a categoria" defaultValue={editingCmsModality?.description ?? ""} />
                </label>
                <label>
                  Ícone
                  <input name="icon" placeholder="Ex.: força, mobilidade" defaultValue={editingCmsModality?.icon ?? ""} />
                </label>
                <label className="wide-field">
                  <strong>Capa da modalidade</strong>
                  <small>Upload com preview. Envie uma imagem (PNG ou JPG).</small>
                  <input
                    name="modalityImage"
                    type="file"
                    accept="image/*"
                    aria-label="Selecionar imagem da modalidade"
                    ref={cmsModalityImageRef}
                    onChange={(event) => handleCmsModalityImageChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                {cmsModalityImagePreview ? (
                  <div className="cms-image-preview wide-field">
                    <img src={cmsModalityImagePreview} alt="Prévia da imagem da modalidade" />
                    <button type="button" onClick={handleCmsModalityImageClear}>
                      <Trash2 size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsModality?.imageUrl && !cmsModalityImageRemove ? (
                  <div className="cms-image-preview wide-field">
                    <img src={mediaUrl(editingCmsModality.imageUrl)} alt="Imagem atual da modalidade" />
                    <small>Imagem atual (envie uma nova para substituir)</small>
                    <button type="button" onClick={() => setCmsModalityImageRemove(true)}>
                      <ImageOff size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsModality?.imageUrl ? (
                  <div className="cms-image-preview wide-field">
                    <small>Foto marcada para remoção — ela será apagada ao salvar.</small>
                    <button type="button" onClick={() => setCmsModalityImageRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <label>
                  Ordem
                  <input name="sortOrder" type="number" min="0" defaultValue={editingCmsModality?.sortOrder ?? cmsModalities.length + 1} />
                </label>
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsModality ? "Salvar alterações" : "Salvar modalidade"}
                </button>
                {editingCmsModality && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsModalityEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="cms-sort-toggle">
                <span>Ordenar por posição:</span>
                <button
                  type="button"
                  className={cmsModalitiesSortDir === "asc" ? "active" : ""}
                  onClick={() => {
                    setCmsModalitiesPage(1);
                    setCmsModalitiesSortDir("asc");
                  }}
                >
                  Crescente
                </button>
                <button
                  type="button"
                  className={cmsModalitiesSortDir === "desc" ? "active" : ""}
                  onClick={() => {
                    setCmsModalitiesPage(1);
                    setCmsModalitiesSortDir("desc");
                  }}
                >
                  Decrescente
                </button>
              </div>
              {cmsModalitiesPageItems.map((item, index) => {
                const rowIndex = (cmsModalitiesSafePage - 1) * MODALITIES_PAGE_SIZE + index;
                const dragging = cmsModalityDragState?.fromIndex === rowIndex;
                const draggingOver = cmsModalityDragState?.overIndex === rowIndex;
                return (
                  <div
                    className={`data-row cms-data-row cms-sortable-row${item.imageUrl ? " with-thumb" : ""}${dragging ? " is-dragging" : ""}${draggingOver ? " is-drag-over" : ""}`}
                    key={item.id}
                    draggable
                    onDragStart={() => handleCmsModalityDragStart(rowIndex)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      handleCmsModalityDragOver(rowIndex);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleCmsModalityDrop();
                    }}
                    onDragEnd={handleCmsModalityDragEnd}
                  >
                    <span className="cms-drag-handle" aria-hidden="true">
                      <GripVertical size={17} />
                    </span>
                    {item.imageUrl && (
                      <img className="cms-data-row-thumb" src={mediaUrl(item.imageUrl)} alt={item.name} />
                    )}
                    <span>
                      <strong>{item.name}</strong>
                      {item.description || item.slug}
                    </span>
                    <select
                      aria-label="Status da modalidade"
                      value={item.isActive ? "ACTIVE" : "INACTIVE"}
                      onChange={(event) => handleUpdateCmsModalityStatus(item.id, event.target.value === "ACTIVE")}
                    >
                      <option value="ACTIVE">Ativa</option>
                      <option value="INACTIVE">Inativa</option>
                    </select>
                    <small>ordem {item.sortOrder}</small>
                    <div className="cms-row-actions">
                      <button aria-label="Editar modalidade" onClick={() => startEditCmsModality(item)}>
                        <Pencil size={17} />
                      </button>
                      <button aria-label="Excluir modalidade" onClick={() => setPendingCmsDelete({ kind: "modalities", id: item.id, name: item.name })}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {cmsModalities.length > MODALITIES_PAGE_SIZE && (
                <div className="admin-users-pagination">
                  <span>
                    Página {cmsModalitiesSafePage} de {cmsModalitiesPageCount} • {cmsModalities.length} modalidade(s)
                  </span>
                  <div>
                    <button
                      type="button"
                      className={`${cmsModalityNavTarget === "prev" ? "is-nav-target" : ""}`}
                      onClick={() => setCmsModalitiesPage((page) => Math.max(1, page - 1))}
                      disabled={cmsModalitiesSafePage <= 1}
                      onDragOver={(event) => {
                        event.preventDefault();
                        handleCmsModalityNavDragOver("prev");
                      }}
                      onDragLeave={() => setCmsModalityNavTarget((prev) => (prev === "prev" ? null : prev))}
                    >
                      <ChevronLeft size={17} />
                      Anterior
                    </button>
                    <button
                      type="button"
                      className={`${cmsModalityNavTarget === "next" ? "is-nav-target" : ""}`}
                      onClick={() => setCmsModalitiesPage((page) => Math.min(cmsModalitiesPageCount, page + 1))}
                      disabled={cmsModalitiesSafePage >= cmsModalitiesPageCount}
                      onDragOver={(event) => {
                        event.preventDefault();
                        handleCmsModalityNavDragOver("next");
                      }}
                      onDragLeave={() => setCmsModalityNavTarget((prev) => (prev === "next" ? null : prev))}
                    >
                      Próxima
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </section>}

            {!cmsTrashOpen && cmsStep === "lessons" && <section className="cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Exercícios/Aulas e Materiais</h2>
                  <p>Aqui serão criados, adicionados, editados e deletados todos os exercícios, aulas e materiais que já estão ativos para os alunos com assinatura ativa no sistema e os que serão adicionados.</p>
                </div>
                <span>{cmsExercises.length}</span>
              </div>
              <form className="crud-form cms-form" key={editingCmsExercise?.id ?? "new"} onSubmit={handleSaveCmsExercise}>
                <label className="wide-field">
                  Título da aula
                  <input name="title" placeholder="Ex.: Agachamento livre" required defaultValue={editingCmsExercise?.title ?? editingCmsExercise?.name ?? ""} />
                </label>
                <label className="cms-upload-field">
                  <UploadCloud size={24} />
                  <strong>Upload de aula</strong>
                  <small>Vídeo, imagem ou GIF. Se preferir, cole uma URL pública no campo abaixo.</small>
                  <input name="lessonFile" type="file" accept="video/*,image/*,.gif" aria-label="Selecionar mídia da aula" ref={cmsLessonFileRef} onChange={(event) => handleCmsLessonFileChange(event.target.files?.[0] ?? null)} />
                </label>
                {cmsLessonFilePreview ? (
                  <div className="cms-image-preview wide-field">
                    {cmsPreviewMedia(cmsLessonFilePreview, "Prévia da aula enviada")}
                    <button type="button" onClick={handleCmsLessonFileClear}>
                      <Trash2 size={17} />
                      Remover arquivo
                    </button>
                  </div>
                ) : editingCmsExercise?.videoUrl && !cmsLessonFileRemove ? (
                  <div className="cms-image-preview wide-field">
                    {cmsPreviewMedia(editingCmsExercise.videoUrl, "Mídia atual da aula")}
                    <small>Mídia atual (envie um novo arquivo para substituir)</small>
                    <button type="button" onClick={() => setCmsLessonFileRemove(true)}>
                      <ImageOff size={17} />
                      Remover mídia
                    </button>
                  </div>
                ) : editingCmsExercise?.videoUrl ? (
                  <div className="cms-image-preview wide-field">
                    <small>Mídia marcada para remoção — ela será apagada ao salvar.</small>
                    <button type="button" onClick={() => setCmsLessonFileRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <label className="cms-upload-field">
                  <FileText size={24} />
                  <strong>Arquivo de apoio</strong>
                  <small>PDF, planilha, ficha ou guia complementar para anexar ao conteúdo da aula.</small>
                  <input name="materialFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" aria-label="Selecionar material de apoio" ref={cmsMaterialFileRef} onChange={(event) => handleCmsMaterialFileChange(event.target.files?.[0] ?? null)} />
                </label>
                {cmsMaterialFilePreview ? (
                  <div className="cms-image-preview wide-field">
                    {cmsPreviewMedia(cmsMaterialFilePreview, "Prévia do material enviado")}
                    <button type="button" onClick={handleCmsMaterialFileClear}>
                      <Trash2 size={17} />
                      Remover material
                    </button>
                  </div>
                ) : editingCmsExercise?.materialUrl && !cmsMaterialFileRemove ? (
                  <div className="cms-image-preview wide-field">
                    {cmsPreviewMedia(editingCmsExercise.materialUrl, "Material atual")}
                    <small>Material atual (envie um novo arquivo para substituir)</small>
                    <button type="button" onClick={() => setCmsMaterialFileRemove(true)}>
                      <ImageOff size={17} />
                      Remover material
                    </button>
                  </div>
                ) : editingCmsExercise?.materialUrl ? (
                  <div className="cms-image-preview wide-field">
                    <small>Material marcado para remoção — ele será apagado ao salvar.</small>
                    <button type="button" onClick={() => setCmsMaterialFileRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <label>
                  URL do vídeo, imagem ou GIF
                  <input name="videoUrl" type="text" placeholder="https://.../aula.mp4" defaultValue={editingCmsExercise?.videoUrl ?? ""} />
                </label>
                <label>
                  URL do áudio
                  <input name="audioUrl" type="text" placeholder="https://.../orientacao.mp3" defaultValue={editingCmsExercise?.audioUrl ?? ""} />
                </label>
                {editingCmsExercise?.audioUrl && (
                  <div className="cms-image-preview wide-field">
                    {cmsPreviewMedia(editingCmsExercise.audioUrl, "Áudio atual da aula")}
                  </div>
                )}
                <label className="wide-field">
                  URL do material de apoio
                  <input name="materialUrl" type="text" placeholder="https://.../ficha.pdf" defaultValue={editingCmsExercise?.materialUrl ?? ""} />
                </label>
                <label className="wide-field">
                  Descrição e instruções da aula
                  <textarea name="notes" placeholder="Descreva execução, postura, cuidados e sequência lógica do exercício" defaultValue={editingCmsExercise?.notes ?? ""} />
                </label>
                <label>
                  Músculos trabalhados
                  <input name="targetMuscles" placeholder="Peitoral, tríceps, ombros" defaultValue={(editingCmsExercise?.targetMuscles ?? []).join(", ")} />
                </label>
                <label>
                  Equipamentos
                  <input name="equipmentTags" placeholder="Barra, banco, halteres" defaultValue={(editingCmsExercise?.equipmentTags ?? []).join(", ")} />
                </label>
                <label className="wide-field">
                  Modalidades
                  <div className="cms-chip-group">
                    {activeCmsModalities.length === 0 && <small className="cms-empty-hint">Cadastre modalidades primeiro.</small>}
                    {activeCmsModalities.map((modality) => {
                      const checked = (editingCmsExercise?.modalityLinks ?? []).some((link) => link.modality.id === modality.id);
                      return (
                        <label className="cms-chip" key={modality.id}>
                          <input
                            type="checkbox"
                            name="modalityIds"
                            value={modality.id}
                            defaultChecked={checked}
                          />
                          <span>{modality.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </label>
                <label className="wide-field">
                  Alternativas
                  <select name="alternativeIds" multiple defaultValue={(editingCmsExercise?.alternatives ?? []).map((item) => item.id)}>
                    {cmsExercises.map((exercise) => (
                      <option value={exercise.id} key={exercise.id}>
                        {cmsExerciseLabel(exercise)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsExercise ? "Salvar alterações" : "Salvar aula"}
                </button>
                {editingCmsExercise && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsExerciseEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="cms-filter-bar wide-field">
                <label className="cms-filter-label">
                  <span>Filtrar por modalidade</span>
                  <select
                    value={cmsLessonsModalityFilter}
                    onChange={(event) => {
                      setCmsLessonsModalityFilter(event.target.value);
                      setCmsLessonsPage(1);
                    }}
                  >
                    <option value="">Todas as modalidades</option>
                    {activeCmsModalities.map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="cms-filter-count">{filteredCmsExercises.length} aula(s)</span>
              </div>
              {cmsLessonsPageItems.map((item) => {
                const thumbSrc = cmsExerciseThumbSrc(item.videoUrl);
                const thumbKind = item.videoUrl ? cmsMediaKind(item.videoUrl) : "file";
                return (
                  <div className={`data-row cms-data-row cms-lessons-row${thumbSrc ? " with-thumb" : ""}`} key={item.id}>
                    {thumbSrc && thumbKind === "video" ? (
                      <video className="cms-data-row-thumb" src={thumbSrc} muted preload="metadata" />
                    ) : thumbSrc ? (
                      <img className="cms-data-row-thumb" src={thumbSrc} alt={cmsExerciseLabel(item)} />
                    ) : null}
                    <span>
                      <strong>{item.title ?? item.name ?? "Exercício"}</strong>
                      <span className="cms-badge-group">
                        {(item.modalityLinks ?? []).length > 0 ? (
                          (item.modalityLinks ?? []).map((link) => (
                            <em className="cms-modality-badge" key={link.id}>{link.modality.name}</em>
                          ))
                        ) : (
                          <em className="cms-modality-badge muted">Sem modalidade</em>
                        )}
                      </span>
                    </span>
                    <small>{item.materialUrl ? "Material anexado" : item.equipmentTags.join(", ") || "Sem equipamento"}</small>
                    <div className="cms-row-actions">
                      <button aria-label="Editar exercício" onClick={() => startEditCmsExercise(item)}>
                        <Pencil size={17} />
                      </button>
                      <button aria-label="Excluir exercício CMS" onClick={() => setPendingCmsDelete({ kind: "exercises", id: item.id, name: item.title ?? item.name ?? "Aula" })}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredCmsExercises.length > CMS_LESSONS_PAGE_SIZE && (
                <div className="admin-users-pagination">
                  <span>
                    Página {cmsLessonsSafePage} de {cmsLessonsPageCount} • {filteredCmsExercises.length} aula(s)
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() => setCmsLessonsPage((page) => Math.max(1, page - 1))}
                      disabled={cmsLessonsSafePage <= 1}
                    >
                      <ChevronLeft size={17} />
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setCmsLessonsPage((page) => Math.min(cmsLessonsPageCount, page + 1))}
                      disabled={cmsLessonsSafePage >= cmsLessonsPageCount}
                    >
                      Próxima
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </section>}

            {!cmsTrashOpen && cmsStep === "blocks" && <section className="cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Divisões e execução da ficha</h2>
                  <p>Cadastre cada divisão do treino e detalhe exatamente o que o aluno deve executar.</p>
                </div>
                <span>{cmsWorkoutBlocks.length}</span>
              </div>
              <form className="crud-form cms-form" key={editingCmsWorkoutBlock?.id ?? "new"} onSubmit={handleSaveCmsWorkoutBlock}>
                <div className="cms-form-section-title wide-field">
                  <span>Bloco 2</span>
                  <div>
                    <h3>Divisão dos treinos</h3>
                    <p>Identifique o treino, informe o foco e indique quantas vezes ele deve ser realizado na semana.</p>
                  </div>
                </div>
                <label>
                  Identificador
                  <input name="title" placeholder="Ex.: Treino A" required defaultValue={editingCmsWorkoutBlock?.identifier ?? editingCmsWorkoutBlock?.title ?? ""} />
                </label>
                <label>
                  Foco/Grupo muscular
                  <input name="focus" placeholder="Ex.: Costas + bíceps" defaultValue={editingCmsWorkoutBlock?.focus ?? ""} />
                </label>
                <label>
                  Frequência semanal recomendada
                  <input name="weeklyFrequency" type="number" min="1" max="7" defaultValue={editingCmsWorkoutBlock?.weeklyFrequency ?? 1} />
                </label>
                <label>
                  Estrutura
                  <select name="structureType" defaultValue={editingCmsWorkoutBlock?.structureType ?? "NORMAL"}>
                    <option value="NORMAL">Normal</option>
                    <option value="BI_SET">Bi-set</option>
                    <option value="DROP_SET">Drop-set</option>
                    <option value="REST_PAUSE">Rest-pause</option>
                  </select>
                </label>
                <label>
                  Descanso padrão
                  <input name="restTime" type="number" min="0" defaultValue={editingCmsWorkoutBlock?.restTime ?? 60} placeholder="Segundos" required />
                </label>
                <label className="wide-field">
                  Modalidade da ficha
                  <div className="cms-chip-group">
                    <label className="cms-chip">
                      <input
                        type="radio"
                        name="modalityId"
                        value=""
                        checked={!cmsBlockFormModality}
                        onChange={(event) => setCmsBlockFormModality(event.target.value)}
                      />
                      <span>Sem modalidade</span>
                    </label>
                    {cmsBlockFormModalities.map((modality) => (
                      <label className="cms-chip" key={modality.id}>
                        <input
                          type="radio"
                          name="modalityId"
                          value={modality.id}
                          checked={cmsBlockFormModality === modality.id}
                          onChange={(event) => setCmsBlockFormModality(event.target.value)}
                        />
                        <span>{modality.name}{modality.isActive ? "" : " (inativa)"}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <div className="cms-form-section-title wide-field">
                  <span>Bloco 3</span>
                  <div>
                    <h3>Exercícios e execução</h3>
                    <p>Defina séries, repetições, carga inicial, descanso do cronômetro e material de apoio.</p>
                  </div>
                </div>
                <div className="cms-builder-list wide-field">
                  <div className="cms-builder-heading exercise-execution-row">
                    <span>Aula</span>
                    <span>Séries</span>
                    <span>Repetições</span>
                    <span>Carga inicial</span>
                    <span>Descanso</span>
                    <span>Material</span>
                  </div>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const row = index + 1;
                    const editRow = editingCmsWorkoutBlock?.exercises.find((entry) => entry.order === row);

                    return (
                      <div className="cms-builder-row exercise-execution-row" key={`block-exercise-${row}`}>
                        <select name={`exerciseId${row}`} required={row === 1} defaultValue={editRow?.exercise.id ?? ""}>
                          <option value="">{row === 1 ? "Selecione a primeira aula" : "Aula opcional"}</option>
                          {cmsBlockModalityExercises.map((exercise) => (
                            <option value={exercise.id} key={exercise.id}>
                              {cmsExerciseLabel(exercise)}
                            </option>
                          ))}
                          {editRow && !cmsBlockModalityExercises.some((exercise) => exercise.id === editRow.exercise.id) && (
                            <option value={editRow.exercise.id}>
                              {cmsExerciseLabel(editRow.exercise)}
                            </option>
                          )}
                        </select>
                        <input name={`sets${row}`} type="number" min="1" defaultValue={editRow?.sets ?? 3} aria-label={`Séries do exercício ${row}`} />
                        <input name={`repsRange${row}`} placeholder="10-12 ou falha" defaultValue={editRow?.repsRange ?? "10-12"} aria-label={`Repetições do exercício ${row}`} />
                        <input name={`initialLoad${row}`} placeholder="Ex.: 20kg" defaultValue={editRow?.initialLoad ?? ""} aria-label={`Carga inicial do exercício ${row}`} />
                        <input name={`restSeconds${row}`} type="number" min="0" placeholder="60" defaultValue={editRow?.restSeconds ?? ""} aria-label={`Descanso do exercício ${row}`} />
                        <input
                          name={`supportMaterialUrl${row}`}
                          type="text"
                          list="cms-support-materials"
                          placeholder={editRow?.exercise.materialUrl ? "Material da aula ou URL" : "Selecione ou informe a URL"}
                          defaultValue={editRow?.supportMaterialUrl ?? ""}
                          aria-label={`Material de apoio do exercício ${row}`}
                        />
                      </div>
                    );
                  })}
                  <datalist id="cms-support-materials">
                    {cmsExercises.map((exercise) => exercise.materialUrl && (
                      <option value={exercise.materialUrl} label={`${cmsExerciseLabel(exercise)} - material`} key={`${exercise.id}-material`} />
                    ))}
                    {cmsExercises.map((exercise) => exercise.videoUrl && (
                      <option value={exercise.videoUrl} label={`${cmsExerciseLabel(exercise)} - vídeo`} key={`${exercise.id}-video`} />
                    ))}
                  </datalist>
                </div>
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsWorkoutBlock ? "Salvar alterações" : "Salvar ficha"}
                </button>
                {editingCmsWorkoutBlock && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsWorkoutBlockEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="cms-filter-bar wide-field">
                <label className="cms-filter-label">
                  <span>Filtrar por modalidade</span>
                  <select
                    value={cmsBlocksModalityFilter}
                    onChange={(event) => {
                      setCmsBlocksModalityFilter(event.target.value);
                      setCmsBlocksPage(1);
                    }}
                  >
                    <option value="">Todas as modalidades</option>
                    {activeCmsModalities.map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="cms-filter-count">{filteredCmsWorkoutBlocks.length} ficha(s)</span>
              </div>
              {cmsBlocksPageItems.map((item) => (
                <div className="data-row cms-data-row" key={item.id}>
                  <span>
                    <strong>{item.identifier ?? item.title}</strong>
                    <span className="cms-badge-group">
                      {item.modality ? (
                        <em className="cms-modality-badge">{item.modality.name}</em>
                      ) : (
                        <em className="cms-modality-badge muted">Sem modalidade</em>
                      )}
                    </span>
                    {item.focus ? `${item.focus} - ` : ""}
                    {item.weeklyFrequency}x/semana -{" "}
                    {item.exercises.map((row) => row.exercise.title ?? row.exercise.name ?? "Exercício").join(", ") || "Sem exercícios"}
                  </span>
                  <select
                    aria-label="Descanso da ficha"
                    value={item.restTime}
                    onChange={(event) => handleUpdateCmsWorkoutBlockRest(item.id, Number(event.target.value))}
                  >
                    <option value="45">45s</option>
                    <option value="60">60s</option>
                    <option value="90">90s</option>
                    <option value="120">120s</option>
                  </select>
                  <small>{item.structureType}</small>
                  <div className="cms-row-actions">
                    <button aria-label="Editar ficha" onClick={() => startEditCmsWorkoutBlock(item)}>
                      <Pencil size={17} />
                    </button>
                    <button aria-label="Excluir bloco CMS" onClick={() => setPendingCmsDelete({ kind: "workoutBlocks", id: item.id, name: item.title })}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredCmsWorkoutBlocks.length > CMS_BLOCKS_PAGE_SIZE && (
                <div className="admin-users-pagination">
                  <span>
                    Página {cmsBlocksSafePage} de {cmsBlocksPageCount} • {filteredCmsWorkoutBlocks.length} ficha(s)
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() => setCmsBlocksPage((page) => Math.max(1, page - 1))}
                      disabled={cmsBlocksSafePage <= 1}
                    >
                      <ChevronLeft size={17} />
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setCmsBlocksPage((page) => Math.min(cmsBlocksPageCount, page + 1))}
                      disabled={cmsBlocksSafePage >= cmsBlocksPageCount}
                    >
                      Próxima
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </section>}

            {!cmsTrashOpen && cmsStep === "publish" && <section className="cms-program-section cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Cabeçalho, vigência e publicação</h2>
                  <p>Finalize a ficha, revise sua duração e publique para um aluno ou para todos.</p>
                </div>
                <span>{cmsPrograms.length}</span>
              </div>
              <form className="crud-form cms-form" key={editingCmsProgram?.id ?? "new"} onSubmit={handleSaveCmsProgram}>
                <div className="cms-form-section-title wide-field">
                  <span>Bloco 1</span>
                  <div>
                    <h3>Cabeçalho e vigência</h3>
                    <p>Dê um nome claro à ficha e informe por quanto tempo o aluno deverá segui-la.</p>
                  </div>
                </div>
                <label>
                  Nome da ficha
                  <input name="title" placeholder="Ex.: Treino Iniciante ABC - Academia" required defaultValue={editingCmsProgram?.title ?? ""} />
                </label>
                <label>
                  Modalidade
                  <select name="modalityId" required defaultValue={editingCmsProgram?.modality?.id ?? ""}>
                    <option value="">Selecione a modalidade</option>
                    {cmsProgramFormModalities.map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}{modality.isActive ? "" : " (inativa)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status inicial
                  <select name="status" defaultValue={editingCmsProgram?.status ?? "DRAFT"}>
                    <option value="DRAFT">Salvar como rascunho</option>
                    <option value="PUBLISHED">Publicar agora</option>
                    {editingCmsProgram?.status === "ARCHIVED" && <option value="ARCHIVED">Manter arquivado</option>}
                  </select>
                </label>
                <label>
                  Público por sexo
                  <select name="targetGender" defaultValue={editingCmsProgram?.targetGender ?? "ALL"}>
                    <option value="ALL">Todos</option>
                    <option value="MALE">Masculino</option>
                    <option value="FEMALE">Feminino</option>
                  </select>
                </label>
                <label>
                  Anos
                  <input
                    name="durationYears"
                    type="number"
                    min="0"
                    value={cmsProgramDurationYears}
                    onChange={(event) => setCmsProgramDurationYears(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
                <label>
                  Meses
                  <input
                    name="durationMonths"
                    type="number"
                    min="0"
                    value={cmsProgramDurationMonths}
                    onChange={(event) => setCmsProgramDurationMonths(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
                <label>
                  Semanas
                  <input
                    name="durationWeeks"
                    type="number"
                    min="1"
                    required
                    value={cmsProgramDurationWeeks}
                    onChange={(event) => setCmsProgramDurationWeeks(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <label>
                  Dias de treino
                  <div className="cms-readonly-duration">
                    <input name="totalWorkouts" type="number" min="1" value={cmsProgramDurationWeeks * 7} readOnly />
                    <span>{cmsProgramDurationWeeks * 7} dias de duração</span>
                  </div>
                </label>
                <label className="wide-field">
                  Descrição para o aluno
                  <textarea
                    name="description"
                    placeholder="Explique objetivo, frequência e como seguir o treino"
                    required
                    defaultValue={editingCmsProgram ? parseProgramMetadata(editingCmsProgram.description).description : ""}
                  />
                </label>
                <div className="cms-form-section-title wide-field">
                  <span>Montagem</span>
                  <div>
                    <h3>Divisões da ficha</h3>
                    <p>Vincule os Treinos A, B e C já configurados na etapa anterior.</p>
                  </div>
                </div>
                <div className="cms-builder-list wide-field">
                  {Array.from({ length: 7 }).map((_, index) => {
                    const dayNumber = index + 1;
                    const editDay = editingCmsProgram?.days.find((day) => day.dayNumber === dayNumber);

                    return (
                      <div className="cms-builder-row program-day-row" key={`program-day-${dayNumber}`}>
                        <span>Dia {dayNumber}</span>
                        <select name={`workoutBlockId${dayNumber}`} required={dayNumber === 1} defaultValue={editDay?.workoutBlock.id ?? ""}>
                          <option value="">{dayNumber === 1 ? "Selecione a ficha" : "Ficha opcional"}</option>
                          {cmsWorkoutBlocks.map((block) => (
                            <option value={block.id} key={block.id}>
                              {block.identifier ?? block.title}{block.focus ? ` - ${block.focus}` : ""} ({block.weeklyFrequency ?? 1}x/semana)
                            </option>
                          ))}
                        </select>
                        <input name={`dayOrder${dayNumber}`} type="number" min="1" defaultValue={editDay?.order ?? 1} aria-label={`Ordem do dia ${dayNumber}`} />
                      </div>
                    );
                  })}
                </div>
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsProgram ? "Salvar alterações" : "Salvar programa"}
                </button>
                {editingCmsProgram && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsProgramEdit}>
                    <X size={18} />
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="cms-program-list-title">
                <strong>Programas publicados</strong>
                <small>Arraste para definir a ordem que aparece para alunos assinantes.</small>
              </div>
              <div className="accordion cms-program-accordion" id="cmsProgramsAccordion">
                {publishedCmsPrograms.map((item, index) => {
                  const programMetadata = parseProgramMetadata(item.description);
                  const expanded = expandedCmsProgramId === item.id;
                  const dragging = cmsProgramDragState?.fromIndex === index;
                  const draggingOver = cmsProgramDragState?.overIndex === index;
                  const programOrder = index + 1;
                  const programCollapseId = `cms-program-collapse-${item.id}`;
                  const programHeadingId = `cms-program-heading-${item.id}`;

                  return (
                    <article
                      className={`accordion-item cms-program-card${dragging ? " is-dragging" : ""}${draggingOver ? " is-drag-over" : ""}`}
                      key={item.id}
                      onDragOver={(event) => {
                        event.preventDefault();
                        handleCmsProgramDragOver(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleCmsProgramDrop();
                      }}
                      onDragEnd={handleCmsProgramDragEnd}
                    >
                      <h3 className="accordion-header cms-program-header" id={programHeadingId}>
                        <span
                          className="cms-drag-handle"
                          aria-label="Arrastar programa"
                          title="Arrastar programa"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", item.id);
                            handleCmsProgramDragStart(index);
                          }}
                        >
                          <GripVertical size={17} />
                        </span>
                        <span className="cms-program-order">#{programOrder}</span>
                        <button
                          className={`accordion-button cms-program-toggle${expanded ? "" : " collapsed"}`}
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={programCollapseId}
                          onClick={() => setExpandedCmsProgramId(expanded ? null : item.id)}
                        >
                          <span className={`cms-status ${item.status.toLowerCase()}`}>{item.status}</span>
                          <span className="cms-program-title-group">
                            <strong>{item.title}</strong>
                            <small>
                              {item.modality?.name ?? programMetadata.modality} • {item.durationDays ?? item.totalWorkouts} dia(s) • {item.days.length} bloco(s)
                            </small>
                          </span>
                        </button>
                      </h3>
                      <div
                        id={programCollapseId}
                        className={`accordion-collapse collapse${expanded ? " show" : ""}`}
                        aria-labelledby={programHeadingId}
                      >
                        <div className="accordion-body cms-program-body">
                          <div className="cms-program-main">
                            <p>{programMetadata.description}</p>
                            <small>Público: {item.targetGender === "MALE" ? "Masculino" : item.targetGender === "FEMALE" ? "Feminino" : "Todos"}</small>
                            <small>Duração: {item.durationYears ?? 0} ano(s), {item.durationMonths ?? 0} mês(es), {item.durationWeeks ?? 0} semana(s)</small>
                            <small>{item.days.map((day) => `Dia ${day.dayNumber}: ${day.workoutBlock.identifier ?? day.workoutBlock.title}${day.workoutBlock.focus ? ` (${day.workoutBlock.focus})` : ""}`).join(" | ") || "Sem dias cadastrados"}</small>
                          </div>
                          <div className="cms-program-actions">
                            <button className="outline-button" type="button" onClick={() => startEditCmsProgram(item)}>
                              <Pencil size={17} />
                              Editar
                            </button>
                            <select
                              aria-label="Público do programa"
                              value={item.targetGender}
                              onChange={(event) => handleUpdateCmsProgramGender(item.id, event.target.value as CmsProgramRow["targetGender"])}
                            >
                              <option value="ALL">Todos</option>
                              <option value="MALE">Masculino</option>
                              <option value="FEMALE">Feminino</option>
                            </select>
                            <select
                              aria-label="Meta de treinos do programa"
                              value={item.totalWorkouts}
                              onChange={(event) => handleUpdateCmsProgramTotalWorkouts(item.id, Number(event.target.value))}
                            >
                              <option value="12">12 treinos</option>
                              <option value="18">18 treinos</option>
                              <option value="24">24 treinos</option>
                              <option value="30">30 treinos</option>
                              <option value="36">36 treinos</option>
                            </select>
                            <button className="outline-button" type="button" onClick={() => handlePublishCmsProgram(item.id)} disabled={item.status === "PUBLISHED"}>
                              <Check size={17} />
                              Publicar
                            </button>
                            <button className="outline-button" type="button" onClick={() => handleArchiveCmsProgram(item.id)} disabled={item.status === "ARCHIVED"}>
                              <LockKeyhole size={17} />
                              Arquivar
                            </button>
                            <button className="outline-button danger-button" type="button" onClick={() => setPendingCmsDelete({ kind: "programs", id: item.id, name: item.title })}>
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
                            <input name="totalWorkouts" type="number" min="1" defaultValue={item.totalWorkouts ?? 30} disabled={item.status !== "PUBLISHED"} aria-label="Meta de treinos da atribuição" />
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
                                  {assignment.user.name} • {assignment.completedWorkouts}/{assignment.totalWorkouts} treino(s) • dia {assignment.currentDay} • {assignment.status}
                                </span>
                              ))
                            ) : (
                              <span>Nenhum aluno atribuído.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {publishedCmsPrograms.length === 0 && (
                  <div className="cms-empty-hint">Nenhum programa publicado para ordenar.</div>
                )}
              </div>
              {draftCmsPrograms.length > 0 && (
                <>
                  <div className="cms-program-list-title secondary">
                    <strong>Rascunhos e arquivados</strong>
                    <small>Publique um programa para incluir no drag & drop dos alunos.</small>
                  </div>
                  <div className="accordion cms-program-accordion" id="cmsDraftProgramsAccordion">
                    {draftCmsPrograms.map((item) => {
                      const programMetadata = parseProgramMetadata(item.description);
                      const expanded = expandedCmsProgramId === item.id;
                      const programCollapseId = `cms-program-collapse-${item.id}`;
                      const programHeadingId = `cms-program-heading-${item.id}`;

                      return (
                        <article className="accordion-item cms-program-card is-not-sortable" key={item.id}>
                          <h3 className="accordion-header cms-program-header" id={programHeadingId}>
                            <span className="cms-drag-handle disabled" aria-hidden="true">
                              <LockKeyhole size={15} />
                            </span>
                            <span className="cms-program-order">-</span>
                            <button
                              className={`accordion-button cms-program-toggle${expanded ? "" : " collapsed"}`}
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={programCollapseId}
                              onClick={() => setExpandedCmsProgramId(expanded ? null : item.id)}
                            >
                              <span className={`cms-status ${item.status.toLowerCase()}`}>{item.status}</span>
                              <span className="cms-program-title-group">
                                <strong>{item.title}</strong>
                                <small>
                                  {item.modality?.name ?? programMetadata.modality} • {item.durationDays ?? item.totalWorkouts} dia(s) • {item.days.length} bloco(s)
                                </small>
                              </span>
                            </button>
                          </h3>
                          <div
                            id={programCollapseId}
                            className={`accordion-collapse collapse${expanded ? " show" : ""}`}
                            aria-labelledby={programHeadingId}
                          >
                            <div className="accordion-body cms-program-body">
                              <div className="cms-program-main">
                                <p>{programMetadata.description}</p>
                                <small>Público: {item.targetGender === "MALE" ? "Masculino" : item.targetGender === "FEMALE" ? "Feminino" : "Todos"}</small>
                                <small>Duração: {item.durationYears ?? 0} ano(s), {item.durationMonths ?? 0} mês(es), {item.durationWeeks ?? 0} semana(s)</small>
                                <small>{item.days.map((day) => `Dia ${day.dayNumber}: ${day.workoutBlock.identifier ?? day.workoutBlock.title}${day.workoutBlock.focus ? ` (${day.workoutBlock.focus})` : ""}`).join(" | ") || "Sem dias cadastrados"}</small>
                              </div>
                              <div className="cms-program-actions">
                                <button className="outline-button" type="button" onClick={() => startEditCmsProgram(item)}>
                                  <Pencil size={17} />
                                  Editar
                                </button>
                                <button className="outline-button" type="button" onClick={() => handlePublishCmsProgram(item.id)}>
                                  <Check size={17} />
                                  Publicar
                                </button>
                                <button className="outline-button danger-button" type="button" onClick={() => setPendingCmsDelete({ kind: "programs", id: item.id, name: item.title })}>
                                  <Trash2 size={17} />
                                  Excluir
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>}

            {!cmsTrashOpen && cmsStep === "publish" && <section className="cms-studio-card">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Avisos para alunos</h2>
                  <p>Publique avisos gerais que aparecem na central de notificações do aluno.</p>
                </div>
                <span>{cmsAnnouncements.length}</span>
              </div>
              <form className="crud-form cms-form" onSubmit={handleCreateCmsAnnouncement}>
                <label className="wide-field">
                  Título do aviso
                  <input name="title" placeholder="Ex.: Treino liberado no sábado" required />
                </label>
                <label className="wide-field">
                  Mensagem
                  <textarea name="body" placeholder="Escreva o conteúdo do aviso" required />
                </label>
                <label className="cms-publish-check wide-field">
                  <input name="publishNow" type="checkbox" defaultChecked />
                  Publicar agora (se desmarcado, vira rascunho)
                </label>
                <button className="primary-button">
                  <Send size={18} />
                  Salvar aviso
                </button>
              </form>
              {cmsAnnouncements.slice(0, 12).map((item) => (
                <div className="data-row cms-data-row" key={item.id}>
                  <span>
                    <strong>{item.title}</strong>
                    {item.body}
                  </span>
                  <small>
                    {item.status === "PUBLISHED" ? `Publicado ${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("pt-BR") : ""}` : "Rascunho"}
                  </small>
                  <button aria-label={item.status === "PUBLISHED" ? "Recolher aviso" : "Publicar aviso"} onClick={() => void handleToggleCmsAnnouncement(item)}>
                    {item.status === "PUBLISHED" ? <Megaphone size={17} /> : <Send size={17} />}
                  </button>
                  <button aria-label="Excluir aviso" onClick={() => setPendingCmsDelete({ kind: "announcements", id: item.id, name: item.title })}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </section>}

            {cmsTrashOpen && <section className="cms-studio-card cms-trash-panel">
              <div className="panel-title cms-subtitle">
                <div>
                  <h2>Lixeira</h2>
                  <p>Itens excluídos ficam aqui. Restaure ou remova em definitivo.</p>
                </div>
                <span>{cmsTrashTotal}</span>
              </div>
              {adminTrashLoading ? (
                <div className="cms-empty-hint">Carregando lixeira...</div>
              ) : (
                CMS_TRASH_KINDS.map((kind) => renderTrashGroup(kind, trashKindLabel(kind), adminTrash[kind]))
              )}
            </section>}
          </div>
        </article>
      </section>}

      {adminSection === "finance" && <section className="admin-grid finance-admin-grid">
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
              <select
                aria-label="Ciclo do plano"
                value={item.billingCycle}
                onChange={(event) => handleUpdatePlanBilling(item.id, event.target.value as PlanRow["billingCycle"])}
              >
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
              <button aria-label="Excluir plano" onClick={() => setPendingCmsDelete({ kind: "plans", id: item.id, name: item.name })}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

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
              <select
                aria-label="Status da matrícula"
                value={item.status}
                onChange={(event) => handleUpdateMembershipStatus(item.id, event.target.value as MembershipRow["status"])}
              >
                <option value="PENDING">Pendente</option>
                <option value="ACTIVE">Ativa</option>
                <option value="OVERDUE">Atrasada</option>
                <option value="CANCELED">Cancelada</option>
              </select>
              <button aria-label="Excluir matrícula" onClick={() => setPendingCmsDelete({ kind: "memberships", id: item.id, name: item.user.name })}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>

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
              <select
                aria-label="Status do pagamento"
                value={item.status}
                onChange={(event) => handleUpdatePaymentStatus(item.id, event.target.value as PaymentRow["status"])}
              >
                <option value="PENDING">Pendente</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="OVERDUE">Atrasado</option>
                <option value="REFUNDED">Reembolsado</option>
                <option value="CANCELED">Cancelado</option>
              </select>
              {item.paymentUrl && (
                <a href={item.paymentUrl} target="_blank" rel="noreferrer">
                  Abrir
                </a>
              )}
              <button aria-label="Excluir pagamento" onClick={() => setPendingCmsDelete({ kind: "payments", id: item.id, name: item.membership?.user?.name ?? "Pagamento" })}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>
      </section>}

      {adminSection === "overview" && <section className="admin-grid phase-three-grid" id="admin-operations">
        <h2 className="admin-reports-operations-title">Operações e atendimento</h2>
        <div className="admin-reports-operations-grid">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Avaliações físicas</h2>
              <p>Registro de avaliações e acompanhamento de evolução.</p>
            </div>
            <span>{assessments.length}</span>
          </div>
          {assessments.slice(0, 4).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.user?.name ?? "Aluno"}</strong>
                {formatAssessmentDateTime(item.assessedAt)} - {item.weightKg ?? "-"} kg
              </span>
              <small>{item.bodyFatPct ? `${item.bodyFatPct}% gordura` : "Sem dobra"}</small>
            </div>
          ))}
          <button className="dash-link-button" type="button" onClick={() => setAdminSection("assessments")}>
            Abrir Avaliações físicas
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Eventos</h2>
              <p>Eventos, aulas abertas e agenda de inscrição.</p>
            </div>
            <span>{events.length}</span>
          </div>
          {events.slice(0, 4).map((item) => (
            <div className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {new Date(item.startsAt).toLocaleString("pt-BR")} - {item.location ?? "Sem local"}
              </span>
              <small>{item.registrations?.length ?? 0}/{item.capacity ?? "sem limite"}</small>
            </div>
          ))}
          <button className="dash-link-button" type="button" onClick={() => setAdminSection("events")}>
            Abrir Eventos
            <ArrowRight size={15} />
          </button>
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
                <option value="WAITING_STUDENT">Aguardando aluno</option>
                <option value="RESOLVED">Resolvido</option>
                <option value="CLOSED">Fechado</option>
              </select>
              <small>{item.priority}</small>
              <button aria-label="Excluir atendimento" onClick={() => setPendingCmsDelete({ kind: "tickets", id: item.id, name: item.subject })}>
                <Trash2 size={17} />
              </button>
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
              <button aria-label="Excluir plano IA" onClick={() => setPendingCmsDelete({ kind: "aiPlans", id: item.id, name: item.objective })}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </article>
        </div>
      </section>}

      {adminSection === "assessments" && <section className="admin-grid phase-three-grid" id="admin-assessments">
        <article className="table-panel wide-panel">
          <div className="cms-panel">
            <section className="student-sheet">
              <div className="student-sheet-heading">
                <span>Avaliações</span>
                <h1>Veja a evolução dos alunos</h1>
                <p>
                  {adminAssessmentEditingId
                    ? formatAssessmentDateTime(adminAssessmentAssessedAt)
                    : assessments.length > 0
                      ? `${assessments.length} avaliação(ões) cadastrada(s) · Última em ${formatAssessmentDateTime(assessments[0].assessedAt)}`
                    : "Sem avaliação cadastrada"}
                </p>
              </div>
              {!adminAssessmentFormOpen ? (
                <>
                  <article className="student-empty-state">
                    <Ruler size={34} />
                    <strong>Avaliações físicas</strong>
                    <span>Selecione um aluno para registrar uma nova avaliação física.</span>
                  </article>
                  <button
                    className="student-outline-button student-assessment-new-button"
                    type="button"
                    onClick={() => {
                      setAdminAssessmentForm(createEmptyAdminAssessmentForm());
                      setAdminAssessmentEditingId(null);
                      setAdminAssessmentUserId("");
                      setAdminAssessmentAssessedAt(formatDateTimeLocalInputValue());
                      setAdminAssessmentFormOpen(true);
                    }}
                  >
                    Preencher avaliação física
                  </button>
                </>
              ) : (
                <>
                  <div className="crud-form">
                    <label className="student-assessment-field">
                      <span>Aluno</span>
                      <select
                        value={adminAssessmentUserId}
                        onChange={(event) => handleStartAdminAssessment(event.target.value)}
                      >
                        <option value="">Selecione o aluno</option>
                        {users
                          .filter((item) => item.role === "USER")
                          .map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="student-assessment-field">
                      <span>Data e hora da avaliação</span>
                      <input
                        type="datetime-local"
                        value={adminAssessmentAssessedAt}
                        onChange={(event) => setAdminAssessmentAssessedAt(event.target.value)}
                      />
                    </label>
                  </div>
                  <article className="student-info-card">
                    <MapPin size={22} />
                    <div>
                      <strong>Cadastro do aluno</strong>
                      <span>{studentLocationLabel(selectedAdminAssessmentStudent?.profile)}</span>
                    </div>
                  </article>
                  {adminAssessmentEditingId ? (
                    <p className="student-assessment-hint">
                      Editando a avaliação registrada em {formatAssessmentDateTime(adminAssessmentAssessedAt)}.
                    </p>
                  ) : (
                    <p className="student-assessment-hint">Preencha o formulário abaixo e salve a nova avaliação física.</p>
                  )}
                  <PhysicalAssessmentFormView
                    form={adminAssessmentForm}
                    photoPreviews={adminAssessmentPhotoPreviews}
                    submitting={adminSubmittingAssessment}
                    submitLabel={adminAssessmentEditingId ? "Atualizar avaliação física" : "Salvar avaliação física"}
                    namePlaceholder="Nome do aluno"
                    onSubmit={handleSubmitAdminAssessment}
                    onCancel={clearAdminAssessmentForm}
                    onUpdate={updateAdminAssessmentForm}
                    onPhotoSelect={handleAdminAssessmentPhotoSelect}
                  />
                </>
              )}
            </section>
          <div className="cms-panel">
            <div className="assessment-section-heading">
              <h3>Histórico de avaliações</h3>
              <span>{filteredAssessments.length}</span>
            </div>
          <div className="cms-filter-bar">
            <Search size={16} />
            <input
              value={assessmentSearch}
              onChange={(event) => setAssessmentSearch(event.target.value)}
              placeholder="Buscar por aluno, documento, telefone ou local..."
            />
            <select
              className="cms-filter-select"
              value={assessmentSourceFilter}
              onChange={(event) => setAssessmentSourceFilter(event.target.value as "ALL" | "STUDENT" | "ADMIN")}
              aria-label="Filtrar por origem"
            >
              <option value="ALL">Todas as origens</option>
              <option value="STUDENT">Enviadas pelo aluno</option>
              <option value="ADMIN">Registradas pelo admin</option>
            </select>
            <select
              className="cms-filter-select"
              value={assessmentStateFilter}
              onChange={(event) => {
                setAssessmentStateFilter(event.target.value);
                setAssessmentCityFilter("");
              }}
              aria-label="Filtrar por Estado"
            >
              <option value="">Todos os Estados</option>
              {BRAZILIAN_STATES.map((state) => (
                <option key={state.uf} value={state.uf}>
                  {state.name} ({state.uf})
                </option>
              ))}
            </select>
            <select
              className="cms-filter-select"
              value={assessmentCityFilter}
              onChange={(event) => setAssessmentCityFilter(event.target.value)}
              aria-label="Filtrar por Município"
              disabled={!assessmentStateFilter}
            >
              <option value="">Todos os municípios</option>
              {assessmentCityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          {filteredAssessments.length > 0 ? (
            visibleAssessments.map((item) => (
              <div className="assessment-history-item" key={item.id}>
                <div className="data-row">
                  <span>
                    <strong>{item.user?.name ?? "Aluno"}</strong>
                    <span className={item.source === "ADMIN" ? "assessment-source-badge admin" : "assessment-source-badge"}>
                      {item.source === "ADMIN" ? "Registrada pelo admin" : "Enviada pelo aluno"}
                    </span>
                    <span className="assessment-source-badge">{studentLocationLabel(item.user?.profile)}</span>
                    {formatAssessmentDateTime(item.assessedAt)} - {item.weightKg ?? "-"} kg
                    {item.bodyFatPct != null ? ` · ${item.bodyFatPct}% gordura` : ""}
                    {item.waistCm != null ? ` · ${item.waistCm} cm` : ""}
                  </span>
                  <button
                    aria-label="Ver detalhes"
                    onClick={() => setExpandedAssessmentId((current) => (current === item.id ? null : item.id))}
                  >
                    <Eye size={17} />
                  </button>
                  <button aria-label="Editar avaliação" onClick={() => handleEditAdminAssessment(item)}>
                    <Pencil size={17} />
                  </button>
                  <button aria-label="Excluir avaliação" onClick={() => setPendingCmsDelete({ kind: "assessments", id: item.id, name: item.user.name })}>
                    <Trash2 size={17} />
                  </button>
                </div>
                {expandedAssessmentId === item.id && (
                  <div className="assessment-detail">
                    {item.details ? (
                      <>
                        <div className="student-assessment-section">
                          <h2>Dados pessoais e objetivos</h2>
                          <div className="student-assessment-summary">
                            <span><strong>Nome</strong>{item.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nome_completo || "-"}</span>
                            <span><strong>Nascimento</strong>{item.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.data_nascimento || "-"}</span>
                            <span><strong>Gênero</strong>{item.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.genero_biologico.resposta || "-"}</span>
                            <span><strong>Objetivo</strong>{item.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.objetivo_principal.resposta || "-"}</span>
                            <span><strong>Nível de atividade</strong>{item.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nivel_atividade_atual.resposta || "-"}</span>
                            <span><strong>Estado/Município</strong>{studentLocationLabel(item.user?.profile)}</span>
                          </div>
                        </div>
                        <div className="student-assessment-section">
                          <h2>Histórico de saúde</h2>
                          <div className="student-assessment-summary">
                            <span><strong>Lesões</strong>{item.details.formulario_avaliacao_fisica.historico_de_saude_anamnese.possui_lesao.resposta || "Nenhuma informada"}</span>
                            <span><strong>Medicação contínua</strong>{item.details.formulario_avaliacao_fisica.historico_de_saude_anamnese.medicamento_continuo.resposta || "Nenhuma informada"}</span>
                            <span><strong>Restrição cardíaca</strong>{item.details.formulario_avaliacao_fisica.historico_de_saude_anamnese.restricao_medica_cardiaca.resposta || "Nenhuma informada"}</span>
                          </div>
                        </div>
                        <div className="student-assessment-section">
                          <h2>Composição corporal</h2>
                          <div className="student-metric-grid">
                            <span><strong>{item.details.formulario_avaliacao_fisica.composicao_corporal_basica.peso_atual_kg ?? "-"}</strong>kg</span>
                            <span><strong>{item.details.formulario_avaliacao_fisica.composicao_corporal_basica.altura_cm ?? "-"}</strong>cm</span>
                            <span><strong>{item.bodyFatPct ?? "-"}</strong>% gordura</span>
                          </div>
                        </div>
                        <div className="student-assessment-section">
                          <h2>Perímetros (cm)</h2>
                          <div className="student-assessment-grid">
                            {assessmentPerimeterKeys.map((key) => {
                              const perimeter = item.details!.formulario_avaliacao_fisica.perimetros_corporais_cm[key];
                              return (
                                <span className="student-assessment-summary-item" key={key}>
                                  <strong>{key.replace(/_/g, " ")}</strong>
                                  {perimeter.valor != null ? `${perimeter.valor} cm` : "-"}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        {assessmentPhotoFields.some(([key]) => item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key]) && (
                          <div className="student-assessment-section">
                            <h2>Fotos para análise</h2>
                            <div className="student-assessment-photo-grid">
                              {assessmentPhotoFields.map(([key, label]) =>
                                item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key] ? (
                                  <figure className="student-assessment-photo" key={key}>
                                    <figcaption><strong>{label}</strong></figcaption>
                                    {/^https?:\/\//i.test(item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key]) ? (
                                      <button
                                        className="student-assessment-photo-open"
                                        type="button"
                                        title="Clique para ampliar"
                                        onClick={() => {
                                          const urls = assessmentPhotoFields
                                            .map(([photoKey]) => photoKey)
                                            .map((k) => item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[k])
                                            .filter((value): value is string => Boolean(value) && /^https?:\/\//i.test(value))
                                            .map((path) => mediaUrl(path));
                                          setAssessmentLightbox({
                                            urls,
                                            index: urls.indexOf(mediaUrl(item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key]))
                                          });
                                        }}
                                      >
                                        <img src={mediaUrl(item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key])} alt={label} />
                                      </button>
                                    ) : (
                                      <span>{item.details!.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key]}</span>
                                    )}
                                  </figure>
                                ) : null
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="student-assessment-section">
                        <h2>Resumo</h2>
                        <div className="student-assessment-summary">
                          <span><strong>Peso</strong>{item.weightKg ?? "-"} kg</span>
                          <span><strong>Altura</strong>{item.heightCm ?? "-"} cm</span>
                          <span><strong>Gordura</strong>{item.bodyFatPct ?? "-"}%</span>
                          <span><strong>Cintura</strong>{item.waistCm ?? "-"} cm</span>
                          {item.chestCm != null && <span><strong>Tórax</strong>{item.chestCm} cm</span>}
                          {item.hipCm != null && <span><strong>Quadril</strong>{item.hipCm} cm</span>}
                          {item.notes ? <span><strong>Observações</strong>{item.notes}</span> : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Ruler size={18} />
              {assessmentSearch || assessmentSourceFilter !== "ALL"
                ? "Nenhuma avaliação encontrada para os filtros."
                : "Nenhuma avaliação registrada ainda."}
            </div>
          )}
          {filteredAssessments.length > 0 && (
            <div className="admin-users-pagination">
              <span>
                Página {currentAssessmentsPage} de {assessmentsTotalPages} • {filteredAssessments.length} avaliação(ões)
              </span>
              <div>
                <button type="button" onClick={() => setAssessmentsPage((page) => Math.max(1, page - 1))} disabled={currentAssessmentsPage <= 1}>
                  <ChevronLeft size={17} />
                  Anterior
                </button>
                <button type="button" onClick={() => setAssessmentsPage((page) => Math.min(assessmentsTotalPages, page + 1))} disabled={currentAssessmentsPage >= assessmentsTotalPages}>
                  Próxima
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          )}
          </div>
          </div>
        </article>

        {assessmentLightbox && (
          <div
            className="assessment-lightbox"
            role="dialog"
            aria-modal="true"
            onClick={() => setAssessmentLightbox(null)}
          >
            <div className="assessment-lightbox-content" onClick={(event) => event.stopPropagation()}>
              <button
                className="assessment-lightbox-close"
                type="button"
                aria-label="Fechar"
                onClick={() => setAssessmentLightbox(null)}
              >
                <X size={22} />
              </button>
              {assessmentLightbox.urls.length > 1 && (
                <button
                  className="assessment-lightbox-nav prev"
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() =>
                    setAssessmentLightbox((current) =>
                      current
                        ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length }
                        : current
                    )
                  }
                >
                  <ChevronLeft size={28} />
                </button>
              )}
              <img src={assessmentLightbox.urls[assessmentLightbox.index]} alt="Foto da avaliação física" />
              {assessmentLightbox.urls.length > 1 && (
                <button
                  className="assessment-lightbox-nav next"
                  type="button"
                  aria-label="Próxima foto"
                  onClick={() =>
                    setAssessmentLightbox((current) =>
                      current ? { ...current, index: (current.index + 1) % current.urls.length } : current
                    )
                  }
                >
                  <ChevronRight size={28} />
                </button>
              )}
              <span className="assessment-lightbox-counter">
                {assessmentLightbox.index + 1} / {assessmentLightbox.urls.length}
              </span>
            </div>
          </div>
        )}
      </section>}

      {adminSection === "events" && <section className="admin-grid phase-three-grid" id="admin-events">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Eventos</h2>
              <p>Crie e gerencie eventos, aulas abertas e agendas para inscrição.</p>
            </div>
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
        </article>

        <article className="table-panel wide-panel">
          <div className="panel-title">
            <div>
              <h2>Agenda de eventos</h2>
              <p>Confira os eventos cadastrados, inscrições e status.</p>
            </div>
            <span>{filteredEvents.length}</span>
          </div>
          <div className="cms-filter-bar">
            <Search size={16} />
            <input
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
              placeholder="Buscar por título ou local..."
            />
            <select
              aria-label="Filtrar por status"
              value={eventStatusFilter}
              onChange={(event) => setEventStatusFilter(event.target.value as "ALL" | EventRow["status"])}
            >
              <option value="ALL">Todos os status</option>
              <option value="SCHEDULED">Agendado</option>
              <option value="CANCELED">Cancelado</option>
              <option value="FINISHED">Finalizado</option>
            </select>
          </div>
          {filteredEvents.length > 0 ? (
            filteredEvents.map((item) => (
              <div className="data-row" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  {new Date(item.startsAt).toLocaleString("pt-BR")} - {item.location ?? "Sem local"}
                </span>
                <select
                  aria-label="Status do evento"
                  value={item.status}
                  onChange={(event) => handleUpdateEventStatus(item.id, event.target.value as EventRow["status"])}
                >
                  <option value="SCHEDULED">Agendado</option>
                  <option value="CANCELED">Cancelado</option>
                  <option value="FINISHED">Finalizado</option>
                </select>
                <small>{item.registrations?.length ?? 0}/{item.capacity ?? "sem limite"}</small>
                <button aria-label="Excluir evento" onClick={() => setPendingCmsDelete({ kind: "events", id: item.id, name: item.title })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <CalendarPlus size={18} />
              {eventSearch || eventStatusFilter !== "ALL" ? "Nenhum evento encontrado para os filtros." : "Nenhum evento cadastrado ainda."}
            </div>
          )}
        </article>
      </section>}

      {adminSection === "products" && <section className="admin-grid phase-three-grid" id="admin-products">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Catálogo de produtos</h2>
              <p>Configure itens disponíveis para venda (planos, consultorias, suplementos).</p>
            </div>
            <span>{products.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreateProduct}>
            <input name="name" placeholder="Nome do produto" required />
            <input name="category" placeholder="Categoria" />
            <input name="price" type="number" step="0.01" min="0" placeholder="Preço (R$)" required />
            <input name="description" placeholder="Descrição curta" />
            <button className="primary-button">
              <Save size={18} />
              Cadastrar produto
            </button>
          </form>
          {products.length > 0 ? (
            products.map((product) => (
              <div className="data-row" key={product.id}>
                <span>
                  <strong>{product.name}</strong>
                  {product.category ?? "Sem categoria"} · {formatPriceInBRL(product.priceInCents)} · {product._count?.purchases ?? 0} venda(s)
                </span>
                <select
                  aria-label="Status do produto"
                  value={product.isActive ? "true" : "false"}
                  onChange={(event) => void handleUpdateProductStatus(product.id, event.target.value === "true")}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
                <button aria-label="Excluir produto" onClick={() => setPendingCmsDelete({ kind: "products", id: product.id, name: product.name })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Package size={18} />
              Nenhum produto cadastrado ainda.
            </div>
          )}
        </article>
      </section>}

      {adminSection === "purchases" && <section className="admin-grid phase-three-grid" id="admin-purchases">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Registrar compra</h2>
              <p>Associe um produto a um aluno de forma manual.</p>
            </div>
            <span>Manual</span>
          </div>
          <form className="crud-form" onSubmit={handleCreatePurchase}>
            <select name="userId" required>
              <option value="">Aluno</option>
              {users.filter((item) => item.role === "USER").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select name="productId" required>
              <option value="">Produto</option>
              {products.filter((item) => item.isActive).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatPriceInBRL(item.priceInCents)}
                </option>
              ))}
            </select>
            <select name="paymentMethod" defaultValue="PIX">
              <option value="PIX">PIX</option>
              <option value="CARD">Cartão</option>
              <option value="BOLETO">Boleto</option>
            </select>
            <button className="primary-button">
              <Save size={18} />
              Registrar compra
            </button>
          </form>
        </article>
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Compras</h2>
              <p>Histórico de compras e status de pagamento.</p>
            </div>
            <span>{purchases.length}</span>
          </div>
          {purchases.length > 0 ? (
            purchases.slice(0, 30).map((purchase) => (
              <div className="data-row" key={purchase.id}>
                <span>
                  <strong>{purchase.product.name}</strong>
                  {purchase.user.name} · {formatPriceInBRL(purchase.amountInCents)} ·{" "}
                  {new Date(purchase.createdAt).toLocaleDateString("pt-BR")}
                </span>
                <select
                  aria-label="Status da compra"
                  value={purchase.status}
                  onChange={(event) =>
                    void handleUpdatePurchaseStatus(purchase.id, event.target.value as PurchaseStatus)
                  }
                >
                  <option value="PENDING">Pendente</option>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="CANCELED">Cancelada</option>
                  <option value="REFUNDED">Reembolsada</option>
                </select>
                <button aria-label="Excluir compra" onClick={() => setPendingCmsDelete({ kind: "purchases", id: purchase.id, name: purchase.product?.name ?? "Compra" })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <ShoppingCart size={18} />
              Nenhuma compra registrada.
            </div>
          )}
        </article>
      </section>}

      {adminSection === "qr" && <section className="admin-grid phase-three-grid" id="admin-qr">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>QR Code de check-in</h2>
              <p>Configure o QR exibido para os alunos validarem presença na academia.</p>
            </div>
            <span>Check-in</span>
          </div>
          <label className="admin-field-label">
            URL de check-in
            <input
              type="url"
              value={systemSettings["qr_checkin_url"] ?? "http://localhost:5173/checkin"}
              onChange={(event) => setSystemSettingValue("qr_checkin_url", event.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className="data-row">
            <span>
              <strong>Check-in por QR habilitado</strong>
              Alunos escaneiam o QR para registrar a presença.
            </span>
            <select
              aria-label="Habilitar QR Code"
              value={systemSettings["qr_checkin_enabled"] ?? "true"}
              onChange={(event) => setSystemSettingValue("qr_checkin_enabled", event.target.value)}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <button
            className="primary-button compact-button"
            onClick={() =>
              void handleSaveSettings({
                ...systemSettings,
                qr_checkin_url: systemSettings["qr_checkin_url"] || "http://localhost:5173/checkin",
                qr_checkin_enabled: systemSettings["qr_checkin_enabled"] || "true"
              })
            }
          >
            <Save size={18} />
            Salvar configuração
          </button>
        </article>
        <article className="table-panel dash-qr-preview-panel">
          <div className="panel-title">
            <div>
              <h2>Pré-visualização</h2>
              <p>QR gerado a partir da URL configurada.</p>
            </div>
          </div>
          <div className="dash-qr-box">
            {systemSettings["qr_checkin_enabled"] !== "false" ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  systemSettings["qr_checkin_url"] ?? "http://localhost:5173/checkin"
                )}`}
                alt="QR Code de check-in"
              />
            ) : (
              <div className="dash-empty">
                <QrCode size={18} />
                QR Code desativado.
              </div>
          )}
          </div>
        </article>
      </section>}

      {adminSection === "cards" && <section className="admin-grid phase-three-grid" id="admin-cards">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Cartões dos alunos</h2>
              <p>Cartões salvos para pagamentos recorrentes.</p>
            </div>
            <span>{paymentCards.length}</span>
          </div>
          <form className="crud-form" onSubmit={handleCreatePaymentCard}>
            <select name="userId" required>
              <option value="">Aluno</option>
              {users.filter((item) => item.role === "USER").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input name="brand" placeholder="Bandeira" />
            <input name="lastFour" placeholder="Últimos 4 dígitos" maxLength={4} pattern="[0-9]{4}" required />
            <input name="holderName" placeholder="Nome no cartão" />
            <label className="admin-checkbox">
              <input name="isDefault" type="checkbox" />
              Cartão principal
            </label>
            <button className="primary-button">
              <Save size={18} />
              Adicionar cartão
            </button>
          </form>
          {paymentCards.length > 0 ? (
            paymentCards.map((card) => (
              <div className="data-row" key={card.id}>
                <span>
                  <strong>{card.holderName ?? card.user.name}</strong>
                  {card.brand ?? "Cartão"} •••• {card.lastFour} · {card.user.name}
                </span>
                <small className="dash-badge">{card.isDefault ? "Principal" : "Adicional"}</small>
                <button aria-label="Excluir cartão" onClick={() => setPendingCmsDelete({ kind: "cards", id: card.id, name: card.brand ? `${card.brand} •••• ${card.lastFour}` : card.lastFour })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <CreditCard size={18} />
              Nenhum cartão salvo.
            </div>
          )}
        </article>
      </section>}

      {adminSection === "contact" && <section className="admin-grid phase-three-grid" id="admin-contact">
        <article className="table-panel admin-chat-panel">
          <div className="panel-title">
            <div>
              <h2>Chat de atendimento</h2>
              <p>Dúvidas e solicitações enviadas pelos alunos no painel.</p>
            </div>
            <span>{tickets.filter((item) => item.status !== "CLOSED" && item.status !== "RESOLVED").length} ativa(s)</span>
          </div>
          {tickets.length > 0 ? (
            <div className="admin-chat">
              <div className="admin-chat-list">
                {[...tickets]
                  .sort((first, second) => {
                    const firstActive = first.status !== "CLOSED" && first.status !== "RESOLVED" ? 0 : 1;
                    const secondActive = second.status !== "CLOSED" && second.status !== "RESOLVED" ? 0 : 1;
                    if (firstActive !== secondActive) return firstActive - secondActive;
                    return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
                  })
                  .slice(0, 30)
                  .map((ticket) => {
                    const lastMessage = ticket.messages[ticket.messages.length - 1];
                    const closed = ticket.status === "CLOSED" || ticket.status === "RESOLVED";
                    return (
                    <button
                      type="button"
                      key={ticket.id}
                      className={selectedChatTicket?.id === ticket.id ? "admin-chat-item active" : "admin-chat-item"}
                      onClick={() => setSelectedChatTicketId(ticket.id)}
                    >
                      <span className="admin-chat-item-head">
                        <strong>{ticket.user?.name ?? "Aluno"}</strong>
                        <small>{new Date(ticket.updatedAt).toLocaleDateString("pt-BR")}</small>
                      </span>
                      <span>{ticket.subject}</span>
                      <small>{lastMessage ? lastMessage.body : ticket.message}</small>
                      <em className={closed ? "admin-chat-status closed" : "admin-chat-status"}>
                        {ticketStatusLabel[ticket.status]}
                      </em>
                    </button>
                  );
                })}
              </div>
              <div className="admin-chat-thread">
                {selectedChatTicket ? (
                  <>
                    <div className="admin-chat-header">
                      <span>
                        <strong>{selectedChatTicket.user?.name ?? "Aluno"}</strong>
                        <small>{selectedChatTicket.subject} · {selectedChatTicket.category}</small>
                      </span>
                      <em className={selectedChatTicket.status === "CLOSED" || selectedChatTicket.status === "RESOLVED" ? "admin-chat-status closed" : "admin-chat-status"}>
                        {ticketStatusLabel[selectedChatTicket.status]}
                      </em>
                    </div>
                    <div className="admin-chat-messages">
                      {selectedChatTicket.messages.length > 0 ? (
                        selectedChatTicket.messages.map((message) => (
                          <div key={message.id} className={message.senderType === "ADMIN" ? "admin-chat-msg admin-chat-msg--admin" : "admin-chat-msg"}>
                            <strong>{message.senderType === "ADMIN" ? "Equipe" : selectedChatTicket.user?.name ?? "Aluno"}</strong>
                            <p>{message.body}</p>
                            <small>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>
                          </div>
                        ))
                      ) : (
                        <div className="admin-chat-placeholder">Sem mensagens ainda.</div>
                      )}
                    </div>
                    {selectedChatTicket.status !== "CLOSED" && selectedChatTicket.status !== "RESOLVED" ? (
                      <>
                        {selectedChatTicket.status === "WAITING_STUDENT" && (
                          <p className="admin-chat-hint">
                            Perguntamos se há algo a mais em que podemos ajudar. O chat será encerrado automaticamente se o aluno não responder em 24h.
                          </p>
                        )}
                        <form
                          className="admin-chat-composer"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = event.currentTarget;
                            const input = form.elements.namedItem("body") as HTMLTextAreaElement;
                            const value = input.value.trim();
                            if (!value) return;
                            void handleSendTicketMessage(selectedChatTicket.id, value);
                            input.value = "";
                          }}
                        >
                          <textarea name="body" placeholder="Digite a resposta..." required />
                          <button type="submit" className="outline-button compact-button">Enviar</button>
                        </form>
                        <div className="admin-chat-actions">
                          {selectedChatTicket.status !== "WAITING_STUDENT" && (
                          <button type="button" className="outline-button compact-button" onClick={() => openFinalizeModal(selectedChatTicket.id)}>
                            Finalizar chamada
                          </button>
                          )}
                          <button type="button" className="outline-button compact-button admin-chat-danger" onClick={() => void handleCloseTicket(selectedChatTicket.id)}>
                            Encerrar agora
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="admin-chat-closed">Chamado encerrado.</p>
                    )}
                  </>
                ) : (
                  <div className="admin-chat-placeholder">Selecione uma conversa para responder.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="dash-empty">
              <MessageCircle size={18} />
              Nenhuma dúvida enviada pelos alunos ainda.
            </div>
          )}
        </article>

        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Mensagens de contato</h2>
              <p>Dúvidas e solicitações enviadas pelos visitantes.</p>
            </div>
            <span>{contactMessages.filter((item) => item.status === "OPEN").length} abertas</span>
          </div>
          {contactMessages.length > 0 ? (
            contactMessages.slice(0, 30).map((message) => (
              <div className="data-row" key={message.id}>
                <span>
                  <strong>{message.subject ?? message.name}</strong>
                  {message.name} · {message.email}
                  <small>{message.message}</small>
                </span>
                <select
                  aria-label="Status da mensagem"
                  value={message.status}
                  onChange={(event) =>
                    void handleUpdateContactMessageStatus(message.id, event.target.value as ContactMessageRow["status"])
                  }
                >
                  <option value="OPEN">Aberta</option>
                  <option value="RESOLVED">Resolvida</option>
                  <option value="CLOSED">Encerrada</option>
                </select>
                <button
                  aria-label="Excluir mensagem"
                  onClick={() => setPendingCmsDelete({ kind: "contactMessages", id: message.id, name: message.name })}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <MessageCircle size={18} />
              Nenhuma mensagem recebida.
            </div>
          )}
        </article>

        {pendingFinalizeTicketId && (
          <div className="admin-finalize-modal-backdrop" role="presentation" onClick={() => setPendingFinalizeTicketId(null)}>
            <section
              className="admin-finalize-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Finalizar chamada"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="admin-finalize-modal-header">
                <div>
                  <span>Enviar mensagem</span>
                  <strong>Finalizar chamada?</strong>
                </div>
                <button className="student-icon-button" aria-label="Fechar" onClick={() => setPendingFinalizeTicketId(null)}>
                  <Check size={20} />
                </button>
              </div>
              <p className="admin-finalize-modal-text">Antes de encerrar, envie esta mensagem ao aluno:</p>
              <div className="admin-finalize-modal-bubble">
                <strong>Equipe App Treino</strong>
                <p>Há algo a mais em que podemos ajudar?</p>
              </div>
              <p className="admin-finalize-modal-hint">
                O aluno poderá continuar a conversa ou finalizar. Sem resposta em 24h, o chat será encerrado automaticamente.
              </p>
              <div className="admin-finalize-modal-actions">
                <button type="button" className="outline-button compact-button" onClick={() => setPendingFinalizeTicketId(null)}>
                  Cancelar
                </button>
                <button type="button" className="admin-finalize-confirm" onClick={() => void confirmFinalizeTicket()}>
                  Enviar ao aluno
                </button>
              </div>
            </section>
          </div>
        )}
      </section>}

      {adminSection === "favorites" && <section className="admin-grid phase-three-grid" id="admin-favorites">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Favoritos dos alunos</h2>
              <p>Produtos e conteúdos marcados como favoritos.</p>
            </div>
            <span>{favorites.length}</span>
          </div>
          {favorites.length > 0 ? (
            favorites.slice(0, 30).map((favorite) => (
              <div className="data-row" key={favorite.id}>
                <span>
                  <strong>{favorite.product.name}</strong>
                  {favorite.user.name} · favoritou em {new Date(favorite.createdAt).toLocaleDateString("pt-BR")}
                </span>
                <Star size={18} />
                <button aria-label="Remover favorito" onClick={() => setPendingCmsDelete({ kind: "favorites", id: favorite.id, name: favorite.product?.name ?? "Favorito" })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Star size={18} />
              Nenhum favorito registrado.
            </div>
          )}
        </article>
      </section>}

      {adminSection === "ratings" && <section className="admin-grid phase-three-grid" id="admin-ratings">
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Avaliações</h2>
              <p>Notas e comentários dos alunos sobre produtos e treinos.</p>
            </div>
            <span>{ratings.length}</span>
          </div>
          {ratings.length > 0 ? (
            ratings.slice(0, 30).map((rating) => (
              <div className="data-row" key={rating.id}>
                <span>
                  <strong>{rating.product?.name ?? rating.targetType}</strong>
                  {rating.user.name} · {new Date(rating.createdAt).toLocaleDateString("pt-BR")}
                  <small>{rating.comment}</small>
                </span>
                <small className="dash-badge">{rating.score}/5</small>
                <button aria-label="Excluir avaliação" onClick={() => setPendingCmsDelete({ kind: "ratings", id: rating.id, name: rating.product?.name ?? "Avaliação" })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <div className="dash-empty">
              <Sparkles size={18} />
              Nenhuma avaliação recebida.
            </div>
          )}
        </article>
      </section>}

      {adminSection === "settings" && <section className="admin-grid phase-three-grid" id="admin-settings">
        <article className="table-panel">
          <div className="panel-title">
            <h2>Configurações do sistema</h2>
            <span>Operacional</span>
          </div>
          <div className="settings-grid">
            <div className="settings-card">
              <Settings size={20} />
              <span>
                <strong>Publicação automática</strong>
                Programas publicados continuam disponíveis para alunos ativos e pagos.
              </span>
            </div>
            <div className="settings-card">
              <ShieldCheck size={20} />
              <span>
                <strong>Assinaturas</strong>
                Matrículas ativas liberam o fluxo do aluno.
              </span>
            </div>
            <div className="settings-card">
              <UsersRound size={20} />
              <span>
                <strong>Segmentação por sexo</strong>
                Treinos masculinos e femininos respeitam o cadastro do aluno.
              </span>
            </div>
          </div>
        </article>
        <article className="table-panel">
          <div className="panel-title">
            <div>
              <h2>Módulos do sistema</h2>
              <p>Ative ou desative cada módulo para preparar sua evolução.</p>
            </div>
            <span>
              {moduleSettingRows.filter((item) => systemSettings[item.key] !== "false").length} ativos
            </span>
          </div>
          {moduleSettingRows.map((module) => (
            <div className="data-row" key={module.key}>
              <span>
                <strong>{module.label}</strong>
                {module.description}
              </span>
              <select
                aria-label={`Módulo ${module.label}`}
                value={systemSettings[module.key] ?? "true"}
                onChange={(event) => setSystemSettingValue(module.key, event.target.value)}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>
          ))}
          <button
            className="primary-button compact-button"
            onClick={() => void handleSaveSettings(systemSettings)}
          >
            <Save size={18} />
            Salvar configurações dos módulos
          </button>
        </article>
        <article className="table-panel">
          <div className="panel-title">
            <h2>Manutenção</h2>
            <span>Dados</span>
          </div>
          <div className="data-row">
            <span>
              <strong>Atualizar dados administrativos</strong>
              Recarrega usuários, financeiro, CMS e relatórios.
            </span>
            <button className="outline-button compact-button" onClick={() => void loadAdminData()} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              Atualizar
            </button>
          </div>
        </article>
      </section>}

      {adminSection === "trash" && <section className="admin-grid phase-three-grid" id="admin-trash">
        <article className="table-panel wide-panel cms-trash-panel admin-trash-panel">
          <div className="panel-title">
            <div>
              <h2>Lixeira</h2>
              <p>Todos os registros excluídos ficam aqui até serem restaurados ou removidos em definitivo.</p>
            </div>
            <span>{adminTrashTotal}</span>
          </div>
          {adminTrashLoading ? (
            <div className="cms-empty-hint">Carregando lixeira...</div>
          ) : (
            ALL_TRASH_KINDS.map((kind) => renderTrashGroup(kind, trashKindLabel(kind), adminTrash[kind]))
          )}
        </article>
      </section>}

      </section>

      {pendingCmsDelete && (
        <div className="cms-confirm-overlay" role="presentation" onMouseDown={() => setPendingCmsDelete(null)}>
          <section
            className="cms-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cms-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="cms-confirm-icon">
              <Trash2 size={26} />
            </div>
            <h2 id="cms-confirm-title">{pendingCmsDelete.permanent ? "Excluir em definitivo" : "Excluir registro"}</h2>
            <p>
              {pendingCmsDelete.permanent ? (
                <>Esta ação é <strong>permanente e irreversível</strong>. O item abaixo será removido do sistema de vez e não poderá ser recuperado.</>
              ) : (
                <>O item abaixo será movido para a <strong>Lixeira</strong>. Você poderá restaurá-lo depois se precisar.</>
              )}
            </p>
            <div className="cms-confirm-target">
              <small>{trashKindLabel(pendingCmsDelete.kind)}</small>
              <strong>{pendingCmsDelete.name}</strong>
            </div>
            <div className="cms-confirm-actions">
              <button type="button" className="outline-button" onClick={() => setPendingCmsDelete(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void confirmCmsDelete()}
                autoFocus
              >
                {pendingCmsDelete.permanent ? "Excluir em definitivo" : "Mover para a lixeira"}
              </button>
            </div>
          </section>
        </div>
      )}
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
    | "history"
    | "profile"
    | "membership"
    | "purchases"
    | "favorites"
    | "ratings"
    | "locations"
  >("home");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse["workout"] | null>(null);
  const [publishedWorkouts, setPublishedWorkouts] = useState<TodayWorkoutResponse["workout"][]>([]);
  const [selectedWorkoutModality, setSelectedWorkoutModality] = useState<string | null>(null);
  const [selectedWorkoutProgramId, setSelectedWorkoutProgramId] = useState<string | null>(null);
  const [workoutSession, setWorkoutSession] = useState<WorkoutSessionResponse["session"] | null>(null);
  const [consistency, setConsistency] = useState<WorkoutConsistencyResponse | null>(null);
  const [membership, setMembership] = useState<StudentMembershipRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendance, setAttendance] = useState<Array<{ id: string; date: string }>>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedStudentTicketId, setSelectedStudentTicketId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [studentLocations, setStudentLocations] = useState<StudentLocationRow[]>([]);
  const [studentAvatarPreview, setStudentAvatarPreview] = useState<string | null>(null);
  const [studentProfileEditing, setStudentProfileEditing] = useState(false);
  const [studentProfileUf, setStudentProfileUf] = useState<string>(profile?.state ?? "");
  const [notificationsReadAt, setNotificationsReadAt] = useState<string | null>(() =>
    window.localStorage.getItem("student-notifications-read-at")
  );
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [publicConfig, setPublicConfig] = useState<Record<string, string>>({});
  const [showStudentQr, setShowStudentQr] = useState(false);
  const [studentPaymentCards, setStudentPaymentCards] = useState<PaymentCardRow[]>([]);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [checkoutPayment, setCheckoutPayment] = useState<PaymentRow | null>(null);
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
  const [assessmentForm, setAssessmentForm] = useState<PhysicalAssessmentForm | null>(null);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [assessmentPhotoPreviews, setAssessmentPhotoPreviews] = useState<Record<string, string>>({});
  const [assessmentPhotoFiles, setAssessmentPhotoFiles] = useState<Partial<Record<AssessmentPhotoKey, File>>>({});
  const [studentExpandedAssessmentId, setStudentExpandedAssessmentId] = useState<string | null>(null);
  const [studentLightbox, setStudentLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [studentProducts, setStudentProducts] = useState<ProductRow[]>([]);
  const [studentPurchases, setStudentPurchases] = useState<PurchaseRow[]>([]);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [purchaseConfirmId, setPurchaseConfirmId] = useState<string | null>(null);
  const purchaseConfirmTimer = useRef<number | null>(null);
  const [studentWorkoutFavorites, setStudentWorkoutFavorites] = useState<StudentFavoriteRow[]>([]);
  const [ratingDraft, setRatingDraft] = useState<Record<string, { score: number; comment: string }>>({});
  const [submittingRatingId, setSubmittingRatingId] = useState<string | null>(null);
  const [favoritingProgramId, setFavoritingProgramId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 2000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!studentLightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStudentLightbox(null);
      if (event.key === "ArrowLeft") {
        setStudentLightbox((current) =>
          current ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length } : current
        );
      }
      if (event.key === "ArrowRight") {
        setStudentLightbox((current) =>
          current ? { ...current, index: (current.index + 1) % current.urls.length } : current
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [studentLightbox]);

  async function loadUserData() {
    if (!token) return;

    try {
      const [profileResponse, membershipResponse, paymentsResponse, workoutProgramsResponse] = await Promise.all([
        apiGet<{ profile: StudentProfile }>("/user/profile", token),
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

      const [
        workoutResponse,
        attendanceResponse,
        assessmentsResponse,
        eventsResponse,
        ticketsResponse,
        notificationsResponse,
        aiPlansResponse,
        consistencyResponse,
        productsResponse,
        purchasesResponse,
        workoutFavoritesResponse,
        locationsResponse
      ] = await Promise.all([
        apiGet<{ workout: WorkoutRow | null }>("/user/workout", token),
        apiGet<{ records: Array<{ id: string; date: string }> }>("/user/attendance", token),
        apiGet<{ assessments: PhysicalAssessmentRow[] }>("/user/physical-assessments", token),
        apiGet<{ events: EventRow[] }>("/user/events", token),
        apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token),
        apiGet<{ notifications: NotificationRow[] }>("/user/notifications", token),
        apiGet<{ plans: AiWorkoutPlanRow[] }>("/user/ai-workout-plans", token),
        apiGet<WorkoutConsistencyResponse>("/student/workout/consistency", token).catch(() => null),
        apiGet<{ products: ProductRow[] }>("/student/products", token),
        apiGet<{ purchases: PurchaseRow[] }>("/student/purchases", token),
        apiGet<{ favorites: StudentFavoriteRow[] }>("/student/workout/favorites", token),
        apiGet<{ locations: StudentLocationRow[] }>("/student/locations", token)
      ]);

      setWorkout(workoutResponse.workout);
      setAttendance(attendanceResponse.records);
      setAssessments(assessmentsResponse.assessments);
      setEvents(eventsResponse.events);
      setTickets(ticketsResponse.tickets);
      setNotifications(notificationsResponse.notifications);
      setStudentLocations(locationsResponse.locations);
      setAiPlans(aiPlansResponse.plans);
      setConsistency(consistencyResponse);
      setStudentProducts(productsResponse.products);
      setStudentPurchases(purchasesResponse.purchases);
      setStudentWorkoutFavorites(workoutFavoritesResponse.favorites);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível carregar sua área. Verifique API e banco.");
    }
  }

  useEffect(() => {
    setStudentProfileUf(profile?.state ?? "");
  }, [profile]);

  useEffect(() => {
    void loadUserData();
    apiGet<{ config: Record<string, string> }>("/public/config")
      .then((response) => setPublicConfig(response.config))
      .catch(() => {});
    loadStudentCards();
  }, [token]);

  useEffect(() => {
    setSelectedWorkoutModality(null);
    setSelectedWorkoutProgramId(null);
  }, [publishedWorkouts]);

  useEffect(() => {
    if (!token) return;
    if (membership?.status === "ACTIVE") return;

    const pending = checkoutPayment ?? payments.find((item) => item.status === "PENDING");
    if (!pending) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token);
        if (response.membership?.status === "ACTIVE") {
          setMembership(response.membership);
          await loadUserData();
        }
      } catch {
        // Ignora falhas transitórias enquanto aguarda a confirmação do pagamento.
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [token, membership?.status, checkoutPayment, payments]);

  useEffect(() => {
    if (studentSection !== "support" || !token) return;
    const interval = window.setInterval(() => {
      void apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token)
        .then((response) => setTickets(response.tickets))
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [studentSection, token]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const now = new Date().toISOString();
    setNotificationsReadAt(now);
    window.localStorage.setItem("student-notifications-read-at", now);
  }, [notificationsOpen]);

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
      const created = await apiPost<{ ticket: SupportTicketRow }>(
        "/user/support-tickets",
        {
          subject: String(data.get("subject") ?? ""),
          message: String(data.get("message") ?? ""),
          category: String(data.get("category") ?? "GENERAL")
        },
        token
      );
      form.reset();
      setSelectedStudentTicketId(created.ticket.id);
      await loadUserData();
    } catch {
      setError("Não foi possível abrir o atendimento.");
    }
  }

  async function handleStudentSendTicketMessage(ticketId: string, body: string) {
    try {
      await apiPost(`/user/support-tickets/${ticketId}/messages`, { body }, token);
      await loadUserData();
    } catch {
      setError("Não foi possível enviar a mensagem.");
    }
  }

  async function handleStudentCloseTicket(ticketId: string) {
    try {
      await apiPost(`/user/support-tickets/${ticketId}/close`, {}, token);
      await loadUserData();
    } catch {
      setError("Não foi possível encerrar o atendimento.");
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

      if (response.alreadyActive) {
        await loadUserData();
        return;
      }

      if (response.payment?.paymentUrl) {
        window.location.href = response.payment.paymentUrl;
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível iniciar o checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  function openAsaasCheckout(url: string) {
    window.location.href = url;
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
      setStudentSection("training");
      setSelectedWorkoutModality(todayWorkout.modality ?? selectedWorkoutModality);
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

  async function loadStudentCards() {
    if (!token) return;
    try {
      const response = await apiGet<{ paymentCards: PaymentCardRow[] }>("/student/payment-cards", token);
      setStudentPaymentCards(response.paymentCards);
    } catch {
      setStudentPaymentCards([]);
    }
  }

  async function handleAddStudentCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiPost(
        "/student/payment-cards",
        {
          brand: String(data.get("brand") ?? "") || undefined,
          lastFour: String(data.get("lastFour") ?? ""),
          holderName: String(data.get("holderName") ?? "") || undefined,
          isDefault: data.get("isDefault") === "on"
        },
        token
      );
      form.reset();
      await loadStudentCards();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível adicionar o cartão.");
    }
  }

  async function handleDeleteStudentCard(cardId: string) {
    if (!token) return;
    try {
      await apiDelete(`/student/payment-cards/${cardId}`, token);
      await loadStudentCards();
    } catch {
      setError("Não foi possível remover o cartão.");
    }
  }

  function handleStudentAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setStudentAvatarPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function handleCancelStudentProfileEdit() {
    setStudentProfileEditing(false);
    setStudentAvatarPreview(null);
  }

  function handleUpdateStudentProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveStudentProfile(event.currentTarget);
  }

  async function saveStudentProfile(form: HTMLFormElement) {
    if (!token) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const document = String(data.get("document") ?? "").trim();
    const gender = String(data.get("gender") ?? "");
    const birthDate = String(data.get("birthDate") ?? "").trim();
    const objective = String(data.get("objective") ?? "").trim();
    const level = String(data.get("level") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();
    const state = String(data.get("state") ?? "").trim();
    const avatarFile = data.get("avatar");

    if (!name) {
      setError("Informe seu nome.");
      return;
    }

    try {
      let avatarUrl: string | undefined;
      if (avatarFile instanceof File && avatarFile.size > 0) {
        const uploadData = new FormData();
        uploadData.append("file", avatarFile);
        const uploaded = await apiUpload<UploadResponse>(`/user/uploads?group=images`, uploadData, token);
        avatarUrl = uploaded.file.url;
      }

      const response = await apiPut<{ profile: StudentProfile }>(
        "/user/profile",
        {
          name,
          phone: phone || undefined,
          document: document || undefined,
          gender: gender === "MALE" || gender === "FEMALE" ? gender : null,
          birthDate: birthDate ? `${birthDate}T12:00:00.000Z` : undefined,
          objective: objective || undefined,
          level: level || undefined,
          city: city || undefined,
          state: state || undefined,
          avatarUrl
        },
        token
      );
      setProfile(response.profile);
      setStudentAvatarPreview(null);
      setStudentProfileEditing(false);
      setSuccess("Dados cadastrais atualizados com sucesso.");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível salvar seus dados.");
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

  function createEmptyAssessmentForm(): PhysicalAssessmentForm {
    return {
      formulario_avaliacao_fisica: {
        dados_pessoais_e_objetivos: {
          nome_completo: profile?.name ?? "",
          data_nascimento: profile?.birthDate ?? "",
          genero_biologico: {
            opcoes: ["Masculino", "Feminino"],
            resposta: profile?.gender === "MALE" ? "Masculino" : profile?.gender === "FEMALE" ? "Feminino" : ""
          },
          objetivo_principal: {
            opcoes: ["Emagrecimento", "Hipertrofia", "Condicionamento/Saúde"],
            resposta: ""
          },
          nivel_atividade_atual: {
            opcoes: ["Sedentário", "Leve", "Moderado", "Intenso"],
            resposta: ""
          }
        },
        historico_de_saude_anamnese: {
          possui_lesao: { descricao: "Joelho, coluna, ombro, etc.", resposta: "" },
          medicamento_continuo: { descricao: "Se sim, qual?", resposta: "" },
          restricao_medica_cardiaca: { descricao: "Se sim, qual?", resposta: "" }
        },
        composicao_corporal_basica: {
          instrucao: "Aferir preferencialmente em jejum, pela manhã",
          peso_atual_kg: null,
          altura_cm: null
        },
        perimetros_corporais_cm: {
          instrucao: "Use uma fita métrica, sem apertar a pele e sem prender a respiração",
          pescoço: { detalhe: "Abaixo do pomo de Adão", valor: null },
          torax: { detalhe: "Na linha dos mamilos", valor: null },
          cintura: { detalhe: "Na parte mais estreita do tronco", valor: null },
          abdomen: { detalhe: "Exatamente sobre a linha do umbigo", valor: null },
          quadril: { detalhe: "Na maior parte dos glúteos", valor: null },
          braco_direito_relaxado: { detalhe: "Linha média do bíceps", valor: null },
          braco_esquerdo_relaxado: { detalhe: "Linha média do bíceps", valor: null },
          coxa_direita: { detalhe: "Na região média da coxa", valor: null },
          coxa_esquerda: { detalhe: "Na região média da coxa", valor: null },
          panturrilha_direita: { detalhe: "Na maior porção do músculo", valor: null },
          panturrilha_esquerda: { detalhe: "Na maior porção do músculo", valor: null }
        },
        fotos_analise_visual: {
          instrucao: "Anexar fotos com roupas leves, postura relaxada e câmera na altura da cintura",
          arquivos: { foto_frente: "", foto_costas: "", foto_perfil: "" }
        }
      }
    };
  }

  function updateAssessmentForm(mutate: (draft: PhysicalAssessmentForm) => void) {
    setAssessmentForm((current) => {
      const draft = current ? structuredClone(current) : createEmptyAssessmentForm();
      mutate(draft);
      return draft;
    });
  }

  function handleAssessmentPhotoSelect(key: AssessmentPhotoKey, file: File | undefined) {
    updateAssessmentForm((draft) => {
      draft.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key] = file?.name ?? "";
    });
    setAssessmentPhotoFiles((current) => {
      const next = { ...current };
      if (!file) {
        delete next[key];
      } else {
        next[key] = file;
      }
      return next;
    });
    setAssessmentPhotoPreviews((current) => {
      if (current[key]) {
        URL.revokeObjectURL(current[key]);
      }
      if (!file) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: URL.createObjectURL(file) };
    });
  }

  function clearAssessmentForm() {
    setAssessmentForm(null);
    setEditingAssessmentId(null);
    setAssessmentPhotoFiles({});
    setAssessmentPhotoPreviews((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
  }

  function handleEditStudentAssessment(item: PhysicalAssessmentRow) {
    const existing = item.details ? structuredClone(item.details) : createEmptyAssessmentForm();
    const form = existing.formulario_avaliacao_fisica;
    if (!form.dados_pessoais_e_objetivos.nome_completo) form.dados_pessoais_e_objetivos.nome_completo = profile?.name ?? "";
    if (!form.dados_pessoais_e_objetivos.data_nascimento && profile?.birthDate) {
      form.dados_pessoais_e_objetivos.data_nascimento = profile.birthDate;
    }
    if (item.weightKg != null) form.composicao_corporal_basica.peso_atual_kg = item.weightKg;
    if (item.heightCm != null) form.composicao_corporal_basica.altura_cm = item.heightCm;
    if (item.waistCm != null) form.perimetros_corporais_cm.cintura.valor = item.waistCm;
    if (item.chestCm != null) form.perimetros_corporais_cm.torax.valor = item.chestCm;
    if (item.hipCm != null) form.perimetros_corporais_cm.quadril.valor = item.hipCm;

    setAssessmentForm(existing);
    setEditingAssessmentId(item.id);
    setStudentExpandedAssessmentId(item.id);
    setAssessmentPhotoFiles({});
    setAssessmentPhotoPreviews((current) => {
      Object.values(current).forEach((url) => URL.revokeObjectURL(url));
      return {};
    });
  }

  async function handleSubmitPhysicalAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assessmentForm) return;
    setSubmittingAssessment(true);
    setError(null);
    try {
      let arquivos = assessmentForm.formulario_avaliacao_fisica.fotos_analise_visual.arquivos;
      for (const [key] of assessmentPhotoFields) {
        const file = assessmentPhotoFiles[key];
        if (!file) continue;
        const uploadData = new FormData();
        uploadData.append("file", file);
        const uploaded = await apiUpload<UploadResponse>("/user/uploads?group=images", uploadData, token);
        arquivos = { ...arquivos, [key]: uploaded.file.url };
      }
      const payload: PhysicalAssessmentForm = {
        ...assessmentForm,
        formulario_avaliacao_fisica: {
          ...assessmentForm.formulario_avaliacao_fisica,
          fotos_analise_visual: {
            ...assessmentForm.formulario_avaliacao_fisica.fotos_analise_visual,
            arquivos
          }
        }
      };
      const editingId = editingAssessmentId;
      const response = editingId
        ? await apiPut<{ assessment: PhysicalAssessmentRow }>(
            `/user/physical-assessments/${editingId}`,
            payload,
            token
          )
        : await apiPost<{ assessment: PhysicalAssessmentRow }>(
            "/user/physical-assessments",
            payload,
            token
          );
      setAssessments((current) =>
        editingId
          ? current.map((item) => (item.id === response.assessment.id ? response.assessment : item))
          : [response.assessment, ...current.filter((item) => item.id !== response.assessment.id)]
      );
      clearAssessmentForm();
      setSuccess(editingId ? "Avaliação física atualizada com sucesso." : "Avaliação física salva com sucesso.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : "Não foi possível salvar a avaliação física."
      );
    } finally {
      setSubmittingAssessment(false);
    }
  }

  async function handleBuyProduct(productId: string) {
    setPurchasingProductId(productId);
    setError(null);
    try {
      const response = await apiPost<{ purchase: PurchaseRow }>("/student/purchases", { productId }, token);
      setStudentPurchases([response.purchase, ...studentPurchases]);
      setStudentProducts((current) =>
        current.map((item) => (item.id === productId ? { ...item, purchasedByMe: true } : item))
      );
      setPurchaseConfirmId(productId);
      if (purchaseConfirmTimer.current) {
        window.clearTimeout(purchaseConfirmTimer.current);
      }
      purchaseConfirmTimer.current = window.setTimeout(() => {
        setPurchaseConfirmId(null);
        purchaseConfirmTimer.current = null;
      }, 2000);
    } catch (buyError) {
      setError(buyError instanceof ApiError ? buyError.message : "Não foi possível registrar a compra.");
    } finally {
      setPurchasingProductId(null);
    }
  }

  async function handleToggleWorkoutFavorite(programId: string) {
    setFavoritingProgramId(programId);
    setError(null);
    try {
      const response = await apiPost<{ favorited: boolean }>(`/student/workout/favorites/${programId}`, {}, token);
      const favorited = response.favorited;
      setPublishedWorkouts((current) =>
        current.map((item) => (item.programId === programId ? { ...item, favoritedByMe: favorited } : item))
      );
      if (favorited) {
        const program = publishedWorkouts.find((item) => item.programId === programId);
        if (program) {
          setStudentWorkoutFavorites([
            {
              id: `fav-${programId}`,
              createdAt: new Date().toISOString(),
              program: {
                id: program.programId,
                title: program.programTitle,
                description: program.description ?? "",
                modality: program.modality ?? null,
                modalityImageUrl: program.modalityImageUrl ?? null,
                totalWorkouts: program.totalWorkouts ?? program.totalDays
              }
            },
            ...studentWorkoutFavorites
          ]);
        }
      } else {
        setStudentWorkoutFavorites((current) => current.filter((item) => item.program.id !== programId));
      }
    } catch (favoriteError) {
      setError(favoriteError instanceof ApiError ? favoriteError.message : "Não foi possível atualizar o favorito.");
    } finally {
      setFavoritingProgramId(null);
    }
  }

  async function handleSubmitWorkoutProgramRating(
    programId: string,
    assignmentId: string,
    scoreOverride?: number,
    commentOverride?: string
  ) {
    const draft = ratingDraft[programId];
    const finalScore = scoreOverride ?? draft?.score;
    const finalComment = (commentOverride ?? draft?.comment)?.trim() || undefined;
    if (!finalScore || finalScore < 1) return;
    setSubmittingRatingId(programId);
    setError(null);
    try {
      await apiPost(
        "/student/ratings",
        {
          score: finalScore,
          comment: finalComment,
          targetType: "WORKOUT",
          targetId: assignmentId
        },
        token
      );
      const program = publishedWorkouts.find((item) => item.programId === programId);
      const alreadyFavorited = program?.favoritedByMe ?? false;
      let favoritedNow = false;
      if (!alreadyFavorited) {
        try {
          const favoriteResponse = await apiPost<{ favorited: boolean }>(
            `/student/workout/favorites/${programId}`,
            {},
            token
          );
          favoritedNow = favoriteResponse.favorited;
        } catch {
          favoritedNow = false;
        }
      }
      setPublishedWorkouts((current) =>
        current.map((item) =>
          item.programId === programId
            ? { ...item, ratedByMe: true, favoritedByMe: item.favoritedByMe || favoritedNow }
            : item
        )
      );
      if (favoritedNow && program) {
        setStudentWorkoutFavorites((current) => [
          {
            id: `fav-${programId}`,
            createdAt: new Date().toISOString(),
            program: {
              id: program.programId,
              title: program.programTitle,
              description: program.description ?? "",
              modality: program.modality ?? null,
              modalityImageUrl: program.modalityImageUrl ?? null,
              totalWorkouts: program.totalWorkouts ?? program.totalDays
            }
          },
          ...current
        ]);
      }
      setRatingDraft((current) => {
        const next = { ...current };
        delete next[programId];
        return next;
      });
      setSuccess("Avaliação enviada.");
    } catch (ratingError) {
      setError(ratingError instanceof ApiError ? ratingError.message : "Não foi possível enviar a avaliação.");
    } finally {
      setSubmittingRatingId(null);
    }
  }

  const firstDay = workout?.days[0];
  const pendingPayment = payments.find((item) => item.status === "PENDING");
  const latestAssessment = assessments[0];
  const latestAssessmentForm = latestAssessment?.details?.formulario_avaliacao_fisica ?? null;
  const computedBodyFat = latestAssessmentForm
    ? calculateBodyFatEstimate({
        gender: latestAssessmentForm.dados_pessoais_e_objetivos.genero_biologico.resposta,
        heightCm: latestAssessmentForm.composicao_corporal_basica.altura_cm,
        neckCm: latestAssessmentForm.perimetros_corporais_cm.pescoço.valor,
        waistCm: latestAssessmentForm.perimetros_corporais_cm.cintura.valor,
        hipCm: latestAssessmentForm.perimetros_corporais_cm.quadril.valor,
        weightKg: latestAssessmentForm.composicao_corporal_basica.peso_atual_kg,
        birthDate: latestAssessmentForm.dados_pessoais_e_objetivos.data_nascimento
      })
    : null;
  const computedBodyFatPct = computedBodyFat?.value ?? null;
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
  const totalWorkoutGoalFromPrograms = publishedWorkouts.reduce((total, item) => total + (item.totalWorkouts ?? item.totalDays), 0);
  const totalWorkoutDays = consistency?.totalWorkoutDays ?? totalWorkoutGoalFromPrograms ?? totalWorkoutDaysFromPrograms;
  const workoutsCompleted = Math.min(consistency?.completedWorkoutCount ?? 0, totalWorkoutDays);
  const workoutProgressPercent = Math.min(100, Math.round((workoutsCompleted / Math.max(totalWorkoutDays, 1)) * 100));
  const publishedModalities = useMemo(
    () =>
      Array.from(new Set(publishedWorkouts.map((item) => item.modality ?? "Hipertrofia"))).map((modality) => ({
        modality,
        count: publishedWorkouts.filter((item) => (item.modality ?? "Hipertrofia") === modality).length,
        imageUrl:
          publishedWorkouts.find((item) => (item.modality ?? "Hipertrofia") === modality)?.modalityImageUrl ?? null
      })),
    [publishedWorkouts]
  );
  const modalityWorkouts = selectedWorkoutModality
    ? publishedWorkouts.filter((item) => (item.modality ?? "Hipertrofia") === selectedWorkoutModality)
    : [];
  const selectedProgramWorkout =
    selectedWorkoutProgramId && selectedWorkoutModality
      ? modalityWorkouts.find((item) => item.programId === selectedWorkoutProgramId) ?? null
      : null;
  const workoutSheet =
    selectedProgramWorkout ??
    (selectedWorkoutModality && modalityWorkouts.length === 1 ? modalityWorkouts[0] : null) ??
    (selectedWorkoutModality && todayWorkout?.modality === selectedWorkoutModality && modalityWorkouts.length <= 1 ? todayWorkout : null);
  const workoutSequence = workoutSheet?.sequence?.length ? workoutSheet.sequence : publishedWorkouts;
  const sheetCompleted = Math.min(workoutSheet?.completedWorkouts ?? workoutsCompleted, workoutSheet?.totalWorkouts ?? workoutSheet?.totalDays ?? totalWorkoutDays);
  const sheetTotal = workoutSheet?.totalWorkouts ?? workoutSheet?.totalDays ?? totalWorkoutDays;
  const sheetProgressPercent = Math.min(100, Math.round((sheetCompleted / Math.max(sheetTotal, 1)) * 100));
  const currentSequenceWorkout = workoutSequence.find((item) => item.dayNumber === workoutSheet?.dayNumber) ?? workoutSequence[0];
  const sheetMembershipStartsAt = workoutSheet?.membershipStartsAt ?? membership?.startsAt ?? null;
  const sheetMembershipEndsAt = workoutSheet?.membershipEndsAt ?? membership?.endsAt ?? null;
  const formatStudentDate = (date?: string | null) => (date ? new Date(date).toLocaleDateString("pt-BR") : "Não informado");
  const formatWorkoutDuration = (seconds?: number | null) => {
    if (!seconds) return "Duração não informada";
    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}min ${restSeconds}s` : `${restSeconds}s`;
  };
  const getWorkoutHistoryMuscles = (dayNumber: number) => {
    const workoutFromDay = workoutSequence.find((item) => item.dayNumber === dayNumber) ?? workoutSheet;
    const muscles = workoutFromDay?.block.exercises.flatMap((exercise) => exercise.targetMuscles ?? []) ?? [];
    return Array.from(new Set(muscles)).join(", ") || "Músculos não registrados";
  };
  async function handleShareWorkoutHistory(session: WorkoutConsistencyResponse["sessions"][number]) {
    const text = `Treino dia ${session.dayNumber} concluído em ${new Date(session.startedAt).toLocaleString("pt-BR")} no App Treino.`;

    if (navigator.share) {
      await navigator.share({
        title: "Histórico de treino",
        text
      });
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }
  const workoutHistorySessions = useMemo(
    () =>
      [...(consistency?.sessions ?? [])].sort(
        (first, second) => new Date(second.finishedAt ?? second.startedAt).getTime() - new Date(first.finishedAt ?? first.startedAt).getTime()
      ),
    [consistency?.sessions]
  );
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

  const attendanceMonthPrefix = `${currentYear}-${String(currentCalendarMonth).padStart(2, "0")}-`;
  const attendanceThisMonth = attendance.filter((record) => record.date.startsWith(attendanceMonthPrefix)).length;
  const recentAccesses = useMemo(
    () =>
      [...attendance]
        .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
        .slice(0, 8),
    [attendance]
  );

  const selectedStudentTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedStudentTicketId) ?? tickets[0] ?? null,
    [selectedStudentTicketId, tickets]
  );

  const unreadNotificationsCount = useMemo(() => {
    const since = notificationsReadAt ? new Date(notificationsReadAt) : new Date(0);
    return notifications.filter((notification) => new Date(notification.publishedAt) > since).length;
  }, [notifications, notificationsReadAt]);

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
        {success && <div className="success-box">{success}</div>}
        {(studentSection === "subscription" || !["subscription", "locked"].includes(studentSection)) && <section className="subscription-flow">
          <article className="table-panel checkout-panel">
            <span className="eyebrow">Assinatura</span>
            <h2>Assine agora e comece a treinar.</h2>
            <p>
              Escolha seu plano e finalize o pagamento com Pix ou cartão no checkout seguro do Asaas.
              O acesso é liberado automaticamente assim que o pagamento for confirmado.
            </p>
            {currentCheckoutPayment && (
              <div className="pending-payment-note">
                <strong>Pagamento pendente de {formatPriceInBRL(currentCheckoutPayment.amountInCents)}</strong>
                <span>Continue no checkout do Asaas para concluir sua assinatura.</span>
              </div>
            )}
            <form className="checkout-form" onSubmit={handleCreateCheckout}>
              <div className="checkout-plan-grid">
                {initialPlans.map((plan) => (
                  <label className="checkout-plan-option" key={plan.code}>
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
                  <option value="CREDIT_CARD">Cartão</option>
                </select>
              </label>
              {currentCheckoutPayment?.paymentUrl && (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => openAsaasCheckout(currentCheckoutPayment.paymentUrl as string)}
                >
                  <ArrowUpRight size={18} />
                  Abrir checkout do Asaas
                </button>
              )}
              {currentCheckoutPayment && !currentCheckoutPayment.paymentUrl && (
                <button
                  className="outline-button"
                  type="button"
                  onClick={handleConfirmSandboxPayment}
                  disabled={checkoutLoading === "sandbox"}
                >
                  {checkoutLoading === "sandbox" ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
                  Finalizar checkout sandbox
                </button>
              )}
              <button className="primary-button" disabled={Boolean(checkoutLoading)}>
                {checkoutLoading ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
                Assinar agora
              </button>
            </form>
          </article>
        </section>}
        {studentSection === "locked" && <section className="locked-content" aria-label="Funcionalidades bloqueadas">
          <LockedOverlay onCheckout={() => setStudentSection("subscription")} />
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

  const studentTicketStatusLabel: Record<SupportTicketRow["status"], string> = {
    OPEN: "Aguardando resposta",
    IN_PROGRESS: "Em andamento",
    WAITING_STUDENT: "Aguardando sua resposta",
    RESOLVED: "Resolvido",
    CLOSED: "Encerrado"
  };

  return (
    <main className="student-app-shell">
      <section className="student-app-header">
        <div className="student-avatar">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <UserRound size={34} />
          )}
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
              {unreadNotificationsCount > 0 && <span className="student-notification-badge">{unreadNotificationsCount}</span>}
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

      <>
        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}

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
              <div className="student-hero-actions">
                <button className="student-green-button" onClick={() => setStudentSection("training")}>
                  Abrir treino
                </button>
                {publicConfig["module_qr"] !== "false" && publicConfig["qr_checkin_enabled"] !== "false" && (
                  <button
                    className="student-outline-button"
                    onClick={() => setShowStudentQr((value) => !value)}
                  >
                    <QrCode size={18} />
                    {showStudentQr ? "Fechar QR" : "QR de check-in"}
                  </button>
                )}
              </div>
              {showStudentQr && (
                <div className="student-qr-panel">
                  <div className="dash-qr-box">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                        publicConfig["qr_checkin_url"] || "http://localhost:5173/checkin"
                      )}`}
                      alt="QR Code de check-in"
                    />
                  </div>
                  <span>Mostre este código na recepção para registrar sua presença.</span>
                </div>
              )}
            </section>

            <h2 className="student-section-title">Funcionalidades</h2>
            <section className="student-feature-grid">
              {[
                { icon: UserRound, title: "Perfil", text: "Dados cadastrais", section: "profile" as const },
                { icon: Dumbbell, title: "Treino", text: "Ficha de exercícios", section: "training" as const },
                { icon: ShieldCheck, title: "Matrículas", text: "Seu plano e vigência", section: "membership" as const },
                { icon: CreditCard, title: "Pagamentos", text: "Central de cobrancas", section: "payments" as const },
                { icon: Ruler, title: "Avaliações", text: "Veja sua evolução", section: "assessments" as const },
                { icon: CalendarDays, title: "Frequência", text: "Consulte seus acessos", section: "status" as const },
                { icon: CalendarPlus, title: "Eventos", text: "Veja os eventos", section: "events" as const },
                { icon: MapPin, title: "Localidades", text: "Nossas unidades e clubes", section: "locations" as const },
                { icon: Headphones, title: "Atendimento", text: "Histórico de conversas", section: "support" as const },
                ...(publicConfig["module_products"] !== "false"
                  ? [{ icon: Package, title: "Produtos", text: "Vitrine online", section: "products" as const }]
                  : []),
                ...(publicConfig["module_purchases"] !== "false"
                  ? [{ icon: ShoppingCart, title: "Compras", text: "Seu histórico de compras", section: "purchases" as const }]
                  : []),
                ...(publicConfig["module_favorites"] !== "false"
                  ? [{ icon: Star, title: "Favoritos", text: "Treinos que você favoritou", section: "favorites" as const }]
                  : []),
                ...(publicConfig["module_ratings"] !== "false"
                  ? [{ icon: Trophy, title: "Avaliar", text: "Dê sua nota aos treinos", section: "ratings" as const }]
                  : [])
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
                    <button
                      className="student-modality-card"
                      key={item.modality}
                      onClick={() => {
                        setSelectedWorkoutModality(item.modality);
                        setSelectedWorkoutProgramId(null);
                      }}
                    >
                      <span className={`student-modality-media ${item.imageUrl ? "with-image" : ""}`}>
                        {item.imageUrl ? (
                          <img src={mediaUrl(item.imageUrl)} alt="" aria-hidden="true" />
                        ) : (
                          <Dumbbell size={26} />
                        )}
                      </span>
                      <span className="student-modality-copy">
                        <strong>{item.modality}</strong>
                        <small>{item.count} ficha(s) publicada(s)</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {selectedWorkoutModality && !workoutSheet && modalityWorkouts.length > 1 ? (
              <article className="student-training-sheet-card">
                <header className="student-training-sheet-header">
                  <button
                    className="student-training-back-button"
                    onClick={() => {
                      setSelectedWorkoutModality(null);
                      setSelectedWorkoutProgramId(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                    Modalidades
                  </button>
                  <span>Fichas publicadas</span>
                  <h1>{selectedWorkoutModality}</h1>
                  <p>Escolha o programa que deseja abrir.</p>
                </header>
                <div className="student-program-list">
                  {modalityWorkouts.map((programWorkout) => (
                    <article className="student-program-card" key={programWorkout.programId}>
                      <div className="student-training-card">
                        <div className="student-card-icon">
                          <Dumbbell size={24} />
                        </div>
                        <div>
                          <h2>{programWorkout.programTitle}</h2>
                          <p>{programWorkout.completedWorkouts ?? 0}/{programWorkout.totalWorkouts} treino(s) realizados</p>
                        </div>
                        <button onClick={() => setSelectedWorkoutProgramId(programWorkout.programId)}>
                          Abrir
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            {selectedWorkoutModality && workoutSheet && workoutSequence.length > 0 ? (
              <article className="student-training-sheet-card">
                <header className="student-training-sheet-header">
                  <button
                    className="student-training-back-button"
                    onClick={() => {
                      if (modalityWorkouts.length > 1 && selectedWorkoutProgramId) {
                        setSelectedWorkoutProgramId(null);
                        return;
                      }
                      setSelectedWorkoutModality(null);
                      setSelectedWorkoutProgramId(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                    {modalityWorkouts.length > 1 && selectedWorkoutProgramId ? "Fichas" : "Modalidades"}
                  </button>
                  <span>Ficha de treino</span>
                  <h1>{workoutSheet.programTitle}</h1>
                  <p>{workoutSheet.modality ?? "Hipertrofia"}</p>
                  {workoutSheet.favoritedByMe ? (
                    <span className="student-favorite-badge">
                      <Star size={15} fill="currentColor" />
                      Favoritado
                    </span>
                  ) : (
                    <div className="student-header-rating">
                      <span>Avaliar treino</span>
                      <div className="student-rating-stars">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            type="button"
                            aria-label={`${score} estrelas`}
                            className={ratingDraft[workoutSheet.programId] && score <= (ratingDraft[workoutSheet.programId]?.score ?? 0) ? "active" : ""}
                            disabled={submittingRatingId === workoutSheet.programId}
                            onClick={() =>
                              void handleSubmitWorkoutProgramRating(
                                workoutSheet.programId,
                                workoutSheet.assignmentId,
                                score
                              )
                            }
                          >
                            <Star
                              size={22}
                              fill={
                                ratingDraft[workoutSheet.programId] && score <= (ratingDraft[workoutSheet.programId]?.score ?? 0)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="student-training-sheet-icon">
                    <Dumbbell size={58} />
                  </div>
                </header>
                <div className="student-training-sheet-meta">
                  <span>
                    <small>Treino de hoje</small>
                    <strong>{currentSequenceWorkout?.block.identifier ?? currentSequenceWorkout?.block.title ?? workoutSheet.block.identifier ?? workoutSheet.block.title}</strong>
                  </span>
                  <span>
                    <small>Foco</small>
                    <strong>{currentSequenceWorkout?.block.focus ?? workoutSheet.block.focus ?? "Ficha de exercícios"}</strong>
                  </span>
                  <span>
                    <small>Treinos realizados</small>
                    <strong>{sheetCompleted}/{sheetTotal}</strong>
                    <Settings size={22} />
                  </span>
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
                    const blockLabel = programWorkout.block.identifier ?? programWorkout.block.title;
                    const blockFocus = programWorkout.block.focus || programMuscles.join(", ") || "Exercícios do CMS Fitness";

                    return (
                      <article className="student-program-card" key={`${programWorkout.programId}-${programWorkout.dayNumber}`}>
                        <div className={`student-training-card ${isCurrent ? "active" : ""}`}>
                          <div className="student-card-icon">
                            <Dumbbell size={24} />
                          </div>
                          <div>
                            <h2>{blockLabel}</h2>
                            <p>{blockFocus} • {programWorkout.block.weeklyFrequency ?? 1}x/semana • descanso {programWorkout.block.restTime}s</p>
                          </div>
                          <button onClick={() => void handleStartWorkoutSession(programWorkout)}>
                            {programWorkout.completed ? "Concluído" : "Iniciar"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <button className="student-history-button" onClick={() => setStudentSection("history")}>
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
                    <span><strong>Início:</strong>{formatStudentDate(sheetMembershipStartsAt)}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Vencimento:</strong>{formatStudentDate(sheetMembershipEndsAt)}</span>
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
              blockTitle={todayWorkout.block.identifier ?? todayWorkout.block.title}
              exercises={todayWorkout.block.exercises}
              restTimeDefault={todayWorkout.block.restTime}
              structureType={todayWorkout.block.structureType}
              sessionId={workoutSession?.id ?? null}
              onBack={() => setStudentSection("training")}
              onWorkoutStart={handleBeginWorkoutSession}
              onCancelSession={handleCancelWorkoutSession}
              onExerciseProgressChange={handleExerciseProgressChange}
              onRequestSubstitutes={handleRequestSubstitutes}
              onWorkoutComplete={handleCompleteWorkoutDay}
            />
          </section>
        )}

        {studentSection === "membership" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Matrículas</span>
              <h1>Seu plano e vigência</h1>
              <p>{membership ? `Plano ${membership.plan.name}` : "Nenhuma matrícula ativa"}</p>
            </div>
            {membership ? (
              <>
                <article className="student-info-card">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>{membership.plan.name}</strong>
                    <span>Status: {membership.status}</span>
                  </div>
                </article>
                <div className="student-metric-grid">
                  <span><strong>{formatPriceInBRL(membership.plan.priceInCents)}</strong>{membership.plan.billingCycle === "YEARLY" ? "/ano" : "/mês"}</span>
                  <span><strong>Início</strong>{new Date(membership.startsAt).toLocaleDateString("pt-BR")}</span>
                  <span><strong>Vigência</strong>{membership.endsAt ? `até ${new Date(membership.endsAt).toLocaleDateString("pt-BR")}` : "sem término"}</span>
                  <span><strong>{membership.plan.billingCycle === "YEARLY" ? "Anual" : "Mensal"}</strong>cobrança</span>
                </div>
              </>
            ) : (
              <article className="student-empty-state">
                <ShieldCheck size={34} />
                <strong>Nenhuma matrícula ativa</strong>
                <span>Matrículas ativas liberam o fluxo do aluno.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "payments" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Financeiro</span>
              <h1>Pagamentos</h1>
              <p>{payments.length > 0 ? `${payments.length} cobrança(s)` : "Nenhuma cobrança registrada"}</p>
            </div>
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
            {publicConfig["module_cards"] !== "false" && (
              <>
                <div className="student-section-title-row">
                  <h2 className="student-section-title">Meus Cartões</h2>
                  <button
                    className="student-outline-button"
                    onClick={() => setShowAddCardForm((value) => !value)}
                  >
                    {showAddCardForm ? "Fechar" : "Adicionar cartão"}
                  </button>
                </div>
                {showAddCardForm && (
                  <form className="student-info-card student-card-form" onSubmit={handleAddStudentCard}>
                    <input name="brand" placeholder="Bandeira" />
                    <input name="lastFour" placeholder="Últimos 4 dígitos" maxLength={4} pattern="[0-9]{4}" required />
                    <input name="holderName" placeholder="Nome no cartão" />
                    <label className="admin-checkbox">
                      <input name="isDefault" type="checkbox" />
                      Cartão principal
                    </label>
                    <button className="student-green-button" type="submit">
                      Salvar cartão
                    </button>
                  </form>
                )}
                {studentPaymentCards.length > 0 ? (
                  studentPaymentCards.map((card) => (
                    <article className="student-info-card" key={card.id}>
                      <CreditCard size={22} />
                      <div>
                        <strong>{card.holderName ?? "Cartão"} •••• {card.lastFour}</strong>
                        <span>
                          {card.brand ?? "Cartão"}
                          {card.isDefault ? " · principal" : ""}
                        </span>
                      </div>
                      <button
                        className="student-delete-button"
                        aria-label="Remover cartão"
                        onClick={() => void handleDeleteStudentCard(card.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </article>
                  ))
                ) : (
                  <article className="student-empty-state">
                    <CreditCard size={28} />
                    <strong>Nenhum cartão salvo</strong>
                    <span>Adicione um cartão para pagamentos recorrentes.</span>
                  </article>
                )}
              </>
            )}
          </section>
        )}

        {studentSection === "products" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Produtos</span>
              <h1>Vitrine online</h1>
              <p>{studentProducts.length} produto(s) disponíveis</p>
            </div>
            {purchaseConfirmId && (
              <div className="student-toast-confirm" role="status">
                <Check size={18} />
                Compra registrada
              </div>
            )}
            {studentProducts.length > 0 ? (
              <div className="student-products-grid">
                {studentProducts.map((product) => (
                  <article className="student-product-card" key={product.id}>
                    {product.imageUrl ? (
                      <img src={mediaUrl(product.imageUrl)} alt={product.name} />
                    ) : (
                      <div className="student-product-fallback">
                        <Package size={30} />
                      </div>
                    )}
                    <div className="student-product-body">
                      {product.category && <small>{product.category}</small>}
                      <strong>{product.name}</strong>
                      {product.description && <span>{product.description}</span>}
                      <strong className="student-product-price">{formatPriceInBRL(product.priceInCents)}</strong>
                      <button
                        className="student-green-button"
                        type="button"
                        disabled={Boolean(product.purchasedByMe) || purchasingProductId === product.id}
                        onClick={() => void handleBuyProduct(product.id)}
                      >
                        {product.purchasedByMe
                          ? "Já solicitado"
                          : purchasingProductId === product.id
                            ? "Registrando..."
                            : "Comprar"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className="student-empty-state">
                <Package size={34} />
                <strong>Nenhum produto cadastrado</strong>
                <span>A vitrine será preenchida quando a academia cadastrar produtos.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "purchases" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Compras</span>
              <h1>Meu histórico de compras</h1>
              <p>{studentPurchases.length} compra(s) registrada(s)</p>
            </div>
            {studentPurchases.length > 0 ? (
              studentPurchases.map((purchase) => (
                <article className="student-info-card" key={purchase.id}>
                  <ShoppingCart size={22} />
                  <div>
                    <strong>{purchase.product.name}</strong>
                    <span>
                      {formatPriceInBRL(purchase.amountInCents)} • {purchase.status}
                    </span>
                    <span>{new Date(purchase.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </article>
              ))
            ) : (
              <article className="student-empty-state">
                <ShoppingCart size={34} />
                <strong>Nenhuma compra ainda</strong>
                <span>Os produtos que você comprar aparecerão aqui.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "favorites" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Favoritos</span>
              <h1>Treinos favoritos</h1>
              <p>{studentWorkoutFavorites.length} favorito(s)</p>
            </div>
            {studentWorkoutFavorites.length > 0 ? (
              <div className="student-favorites-grid">
                {studentWorkoutFavorites.map((favorite) => (
                  <article className="student-favorite-card" key={favorite.id}>
                    <span className="student-favorite-media">
                      {favorite.program.modalityImageUrl ? (
                        <img src={mediaUrl(favorite.program.modalityImageUrl)} alt="" aria-hidden="true" />
                      ) : (
                        <Dumbbell size={24} />
                      )}
                    </span>
                    <strong>{favorite.program.title}</strong>
                    <span className="student-favorite-meta">
                      {favorite.program.modality ?? "Hipertrofia"} • {favorite.program.totalWorkouts} treinos
                    </span>
                    <button
                      className="student-delete-button"
                      type="button"
                      disabled={favoritingProgramId === favorite.program.id}
                      onClick={() => void handleToggleWorkoutFavorite(favorite.program.id)}
                    >
                      {favoritingProgramId === favorite.program.id ? "Removendo..." : <><Trash2 size={17} /> Remover</>}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <article className="student-empty-state">
                <Star size={34} />
                <strong>Nenhum favorito ainda</strong>
                <span>Toque em "Favoritar treino" na sua ficha para guardá-lo aqui.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "ratings" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Avaliar</span>
              <h1>Avalie seus treinos</h1>
              <p>{publishedWorkouts.length} treino(s) disponíveis</p>
            </div>
            {publishedWorkouts.length > 0 ? (
              publishedWorkouts.map((programWorkout) => {
                const draft = ratingDraft[programWorkout.programId];
                const alreadyRated = programWorkout.ratedByMe;
                return (
                  <article className="student-info-card student-rating-card" key={`${programWorkout.programId}-${programWorkout.dayNumber}`}>
                    <div>
                      <strong>{programWorkout.programTitle}</strong>
                      <span>{programWorkout.modality ?? "Hipertrofia"}</span>
                    </div>
                    {alreadyRated ? (
                      <span className="student-rating-done"><Check size={16} /> Avaliado</span>
                    ) : (
                      <div className="student-rating-form">
                        <div className="student-rating-stars">
                          {[1, 2, 3, 4, 5].map((score) => (
                            <button
                              key={score}
                              type="button"
                              aria-label={`${score} estrelas`}
                              className={draft && score <= draft.score ? "active" : ""}
                              onClick={() =>
                                setRatingDraft((current) => ({
                                  ...current,
                                  [programWorkout.programId]: { score, comment: current[programWorkout.programId]?.comment ?? "" }
                                }))
                              }
                            >
                              <Star size={24} fill={draft && score <= draft.score ? "currentColor" : "none"} />
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Comentário (opcional)"
                          value={draft?.comment ?? ""}
                          onChange={(event) =>
                            setRatingDraft((current) => ({
                              ...current,
                              [programWorkout.programId]: { score: current[programWorkout.programId]?.score ?? 0, comment: event.target.value }
                            }))
                          }
                        />
                        <button
                          className="student-green-button"
                          type="button"
                          disabled={!draft || draft.score < 1 || submittingRatingId === programWorkout.programId}
                          onClick={() => void handleSubmitWorkoutProgramRating(programWorkout.programId, programWorkout.assignmentId)}
                        >
                          {submittingRatingId === programWorkout.programId ? "Enviando..." : "Enviar avaliação"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <article className="student-empty-state">
                <Trophy size={34} />
                <strong>Nenhum treino para avaliar</strong>
                <span>Os treinos publicados aparecerão aqui para você avaliar.</span>
              </article>
            )}
          </section>
        )}
        {studentSection === "assessments" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Avaliações</span>
              <h1>Veja sua evolução</h1>
              <p>{latestAssessment ? formatAssessmentDateTime(latestAssessment.assessedAt) : "Sem avaliação cadastrada"}</p>
            </div>
            {latestAssessment ? (
              <div className="student-metric-grid">
                <span><strong>{latestAssessment.weightKg ?? "-"}</strong>kg</span>
                <span><strong>{latestAssessment.heightCm ?? "-"}</strong>cm</span>
                <span><strong>{latestAssessment.bodyFatPct ?? computedBodyFatPct ?? "-"}</strong>% gordura</span>
                <span><strong>{latestAssessment.waistCm ?? "-"}</strong>cm cintura</span>
              </div>
            ) : (
              <article className="student-empty-state">
                <Ruler size={34} />
                <strong>Nenhuma avaliação</strong>
                <span>Solicite sua primeira avaliação com a equipe.</span>
              </article>
            )}

            {assessmentForm ? (
              <>
                <article className="student-info-card">
                  <MapPin size={22} />
                  <div>
                    <strong>Seu cadastro</strong>
                    <span>{studentLocationLabel(profile)}</span>
                  </div>
                </article>
                <PhysicalAssessmentFormView
                  form={assessmentForm}
                  photoPreviews={assessmentPhotoPreviews}
                  submitting={submittingAssessment}
                  submitLabel={editingAssessmentId ? "Atualizar avaliação física" : "Salvar avaliação física"}
                  namePlaceholder="Seu nome"
                  onSubmit={handleSubmitPhysicalAssessment}
                  onCancel={clearAssessmentForm}
                  onUpdate={updateAssessmentForm}
                  onPhotoSelect={handleAssessmentPhotoSelect}
                />
              </>
            ) : (
              <button
                className="student-outline-button student-assessment-new-button"
                onClick={() => {
                  setEditingAssessmentId(null);
                  setAssessmentPhotoFiles({});
                  setAssessmentPhotoPreviews((current) => {
                    Object.values(current).forEach((url) => URL.revokeObjectURL(url));
                    return {};
                  });
                  setAssessmentForm(createEmptyAssessmentForm());
                }}
              >
                Preencher avaliação física
              </button>
            )}

            {assessments.length > 0 && (
              <div className="student-assessment-section">
                <div className="assessment-section-heading">
                  <h3>Histórico de avaliações</h3>
                  <span>{assessments.length}</span>
                </div>
                {assessments.map((item) => {
                  const form = item.details?.formulario_avaliacao_fisica ?? null;
                  const bodyFat = form
                    ? calculateBodyFatEstimate({
                        gender: form.dados_pessoais_e_objetivos.genero_biologico.resposta,
                        heightCm: form.composicao_corporal_basica.altura_cm,
                        neckCm: form.perimetros_corporais_cm.pescoço.valor,
                        waistCm: form.perimetros_corporais_cm.cintura.valor,
                        hipCm: form.perimetros_corporais_cm.quadril.valor,
                        weightKg: form.composicao_corporal_basica.peso_atual_kg,
                        birthDate: form.dados_pessoais_e_objetivos.data_nascimento
                      })
                    : null;
                  const bodyFatPct = item.bodyFatPct ?? bodyFat?.value ?? null;
                  const waistCm = item.waistCm ?? form?.perimetros_corporais_cm.cintura.valor ?? null;

                  return (
                    <div className="assessment-history-item" key={item.id}>
                      <div className="data-row">
                        <span>
                          <strong>{formatAssessmentDateTime(item.assessedAt)}</strong>
                          <span className={item.source === "ADMIN" ? "assessment-source-badge admin" : "assessment-source-badge"}>
                            {item.source === "ADMIN" ? "Registrada pelo admin" : "Enviada pelo aluno"}
                          </span>
                          <span className="assessment-source-badge">{studentLocationLabel(profile)}</span>
                          {item.weightKg ?? form?.composicao_corporal_basica.peso_atual_kg ?? "-"} kg
                          {bodyFatPct != null ? ` · ${bodyFatPct}% gordura` : ""}
                          {waistCm != null ? ` · ${waistCm} cm cintura` : ""}
                        </span>
                        <button
                          aria-label="Ver detalhes da avaliação"
                          type="button"
                          onClick={() => setStudentExpandedAssessmentId((current) => (current === item.id ? null : item.id))}
                        >
                          <Eye size={17} />
                        </button>
                        {item.source !== "ADMIN" && (
                          <button
                            aria-label="Editar avaliação"
                            type="button"
                            onClick={() => handleEditStudentAssessment(item)}
                          >
                            <Pencil size={17} />
                          </button>
                        )}
                      </div>

                      {studentExpandedAssessmentId === item.id && (
                        <div className="assessment-detail">
                          {form ? (
                            <>
                              <div className="student-assessment-section">
                                <h2>Dados pessoais e objetivos</h2>
                                <div className="student-assessment-summary">
                                  <span><strong>Nome</strong>{form.dados_pessoais_e_objetivos.nome_completo || "-"}</span>
                                  <span><strong>Nascimento</strong>{form.dados_pessoais_e_objetivos.data_nascimento || "-"}</span>
                                  <span><strong>Gênero</strong>{form.dados_pessoais_e_objetivos.genero_biologico.resposta || "-"}</span>
                                  <span><strong>Objetivo</strong>{form.dados_pessoais_e_objetivos.objetivo_principal.resposta || "-"}</span>
                                  <span><strong>Nível de atividade</strong>{form.dados_pessoais_e_objetivos.nivel_atividade_atual.resposta || "-"}</span>
                                  <span><strong>Estado/Município</strong>{studentLocationLabel(profile)}</span>
                                </div>
                              </div>
                              <div className="student-assessment-section">
                                <h2>Histórico de saúde</h2>
                                <div className="student-assessment-summary">
                                  <span><strong>Lesões</strong>{form.historico_de_saude_anamnese.possui_lesao.resposta || "Nenhuma informada"}</span>
                                  <span><strong>Medicação contínua</strong>{form.historico_de_saude_anamnese.medicamento_continuo.resposta || "Nenhuma informada"}</span>
                                  <span><strong>Restrição cardíaca</strong>{form.historico_de_saude_anamnese.restricao_medica_cardiaca.resposta || "Nenhuma informada"}</span>
                                </div>
                              </div>
                              <div className="student-assessment-section">
                                <h2>Composição corporal</h2>
                                <div className="student-metric-grid">
                                  <span><strong>{form.composicao_corporal_basica.peso_atual_kg ?? "-"}</strong>kg</span>
                                  <span><strong>{form.composicao_corporal_basica.altura_cm ?? "-"}</strong>cm</span>
                                  <span><strong>{bodyFatPct ?? "-"}</strong>% gordura</span>
                                </div>
                              </div>
                              <div className="student-assessment-section">
                                <h2>Perímetros (cm)</h2>
                                <div className="student-assessment-grid">
                                  {assessmentPerimeterKeys.map((key) => {
                                    const perimeter = form.perimetros_corporais_cm[key];
                                    return (
                                      <span className="student-assessment-summary-item" key={key}>
                                        <strong>{key.replace(/_/g, " ")}</strong>
                                        {perimeter.valor != null ? `${perimeter.valor} cm` : "-"}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                              {assessmentPhotoFields.some(([key]) => form.fotos_analise_visual.arquivos[key]) && (
                                <div className="student-assessment-section">
                                  <h2>Fotos anexadas</h2>
                                  <div className="student-assessment-summary">
                                    {assessmentPhotoFields.map(([key, label]) =>
                                      form.fotos_analise_visual.arquivos[key] ? (
                                        <span className="student-assessment-photo" key={key}>
                                          <strong>{label}</strong>
                                          {/^https?:\/\//i.test(form.fotos_analise_visual.arquivos[key]) ? (
                                            <button
                                              className="student-assessment-photo-open"
                                              type="button"
                                              title="Clique para ampliar"
                                              onClick={() => {
                                                const urls = assessmentPhotoFields
                                                  .map(([photoKey]) => photoKey)
                                                  .map((k) => form.fotos_analise_visual.arquivos[k])
                                                  .filter((value): value is string => Boolean(value) && /^https?:\/\//i.test(value))
                                                  .map((path) => mediaUrl(path));
                                                setStudentLightbox({
                                                  urls,
                                                  index: urls.indexOf(mediaUrl(form.fotos_analise_visual.arquivos[key]))
                                                });
                                              }}
                                            >
                                              <img src={mediaUrl(form.fotos_analise_visual.arquivos[key])} alt={label} />
                                            </button>
                                          ) : (
                                            <small>{form.fotos_analise_visual.arquivos[key]}</small>
                                          )}
                                        </span>
                                      ) : null
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="student-assessment-section">
                              <h2>Resumo</h2>
                              <div className="student-assessment-summary">
                                <span><strong>Peso</strong>{item.weightKg ?? "-"} kg</span>
                                <span><strong>Altura</strong>{item.heightCm ?? "-"} cm</span>
                                <span><strong>Gordura</strong>{item.bodyFatPct ?? "-"}%</span>
                                <span><strong>Cintura</strong>{item.waistCm ?? "-"} cm</span>
                                {item.chestCm != null && <span><strong>Tórax</strong>{item.chestCm} cm</span>}
                                {item.hipCm != null && <span><strong>Quadril</strong>{item.hipCm} cm</span>}
                                {item.notes ? <span><strong>Observações</strong>{item.notes}</span> : null}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

        {studentSection === "locations" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Localidades</span>
              <h1>Nossas unidades e clubes</h1>
              <p>{studentLocations.length} localidade(s) disponível(is)</p>
            </div>
            {studentLocations.length > 0 ? (
              studentLocations.slice(0, 12).map((item) => (
                <article className="student-info-card" key={item.id}>
                  {item.imageUrl ? (
                    <img className="student-location-thumb" src={mediaUrl(item.imageUrl)} alt={item.name} />
                  ) : (
                    <Building2 size={22} />
                  )}
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.type === "ACADEMY" ? "Academia" : item.type === "UNIT" ? "Unidade" : "Clube"}
                      {item.address ? ` • ${item.address}` : ""}
                    </span>
                    <span>
                      {[item.city, item.state].filter(Boolean).join(" - ")}
                      {item.phone ? ` • ${item.phone}` : ""}
                    </span>
                    {item.description && <small>{item.description}</small>}
                  </div>
                </article>
              ))
            ) : (
              <article className="student-info-card">
                <MapPin size={22} />
                <div>
                  <strong>Nenhuma localidade publicada</strong>
                  <span>As unidades e clubes cadastrados aparecerão aqui.</span>
                </div>
              </article>
            )}
          </section>
        )}

        {studentSection === "support" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Atendimento</span>
              <h1>Suporte</h1>
              <p>{tickets.length} chamado(s)</p>
            </div>

            {tickets.length > 0 && selectedStudentTicket ? (
              <>
                <div className="student-chat-list">
                  {tickets.slice(0, 8).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={selectedStudentTicket.id === item.id ? "student-chat-item active" : "student-chat-item"}
                      onClick={() => setSelectedStudentTicketId(item.id)}
                    >
                      <strong>{item.subject}</strong>
                      <span>{item.category} · {studentTicketStatusLabel[item.status]}</span>
                    </button>
                  ))}
                </div>

                <article className="student-chat">
                  <div className="student-chat-head">
                    <strong>{selectedStudentTicket.subject}</strong>
                    <span>{studentTicketStatusLabel[selectedStudentTicket.status]}</span>
                  </div>
                  <div className="student-chat-messages">
                    {selectedStudentTicket.messages.map((message) => (
                      <div key={message.id} className={message.senderType === "STUDENT" ? "student-chat-msg student-chat-msg--me" : "student-chat-msg"}>
                        <strong>{message.senderType === "STUDENT" ? "Você" : "Equipe App Treino"}</strong>
                        <p>{message.body}</p>
                        <small>
                          {new Date(message.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </small>
                      </div>
                    ))}
                  </div>
                  {selectedStudentTicket.status !== "CLOSED" && selectedStudentTicket.status !== "RESOLVED" ? (
                    <>
                      {selectedStudentTicket.status === "WAITING_STUDENT" && (
                        <p className="student-chat-hint">
                          A equipe perguntou se há algo a mais em que podemos ajudar. Responda para continuar a conversa ou finalize o
                          atendimento. Sem resposta em 24h, o chat será encerrado automaticamente.
                        </p>
                      )}
                      <form
                        className="student-chat-composer"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          const input = form.elements.namedItem("body") as HTMLTextAreaElement;
                          const value = input.value.trim();
                          if (!value) return;
                          void handleStudentSendTicketMessage(selectedStudentTicket.id, value);
                          input.value = "";
                        }}
                      >
                        <textarea name="body" placeholder="Digite uma mensagem" required />
                        <button type="submit" className="student-green-button">Enviar</button>
                      </form>
                      <button
                        type="button"
                        className="student-outline-button"
                        onClick={() => void handleStudentCloseTicket(selectedStudentTicket.id)}
                      >
                        Encerrar atendimento
                      </button>
                    </>
                  ) : (
                    <p className="student-chat-closed">Atendimento encerrado.</p>
                  )}
                </article>
              </>
            ) : (
              <div className="student-empty-state">
                <MessageCircle size={26} />
                <strong>Nenhum chamado aberto</strong>
                <span>Envie sua dúvida abaixo para falar com a equipe.</span>
              </div>
            )}

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

        {studentSection === "profile" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Perfil</span>
              <h1>Dados cadastrais</h1>
              <p>Complete seus dados para personalizar sua experiência e seus treinos.</p>
            </div>
            <article className="student-profile-note">
              <ShieldCheck size={18} />
              <span>
                Nome, e-mail, telefone e sexo já foram informados na contratação do plano. Complete o restante quando
                quiser.
              </span>
            </article>
            <form
              id="student-profile-form"
              className={`student-profile-form${studentProfileEditing ? "" : " student-profile-locked"}`}
              onSubmit={handleUpdateStudentProfile}
            >
              <label className="student-avatar-field wide-field">
                Foto de perfil
                <span className="student-avatar-preview">
                  {studentAvatarPreview ?? profile?.avatarUrl ? (
                    <img src={studentAvatarPreview ?? profile?.avatarUrl ?? ""} alt="" />
                  ) : (
                    <UserRound size={34} className="student-avatar-placeholder" />
                  )}
                </span>
                <input
                  name="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleStudentAvatarChange}
                  disabled={!studentProfileEditing}
                />
                <small>Formatos JPG, PNG, WEBP ou GIF.</small>
              </label>
              <label>
                Nome
                <input name="name" defaultValue={profile?.name ?? ""} minLength={2} required placeholder="Seu nome completo" disabled={!studentProfileEditing} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" value={profile?.email ?? ""} readOnly disabled placeholder="seuemail@exemplo.com" />
              </label>
              <label>
                Telefone
                <input name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="+55 11 99999-9999" disabled={!studentProfileEditing} />
              </label>
              <label>
                CPF
                <input name="document" defaultValue={profile?.document ?? ""} placeholder="000.000.000-00" disabled={!studentProfileEditing} />
              </label>
              <label>
                Data de nascimento
                <input
                  name="birthDate"
                  type="date"
                  defaultValue={profile?.birthDate ? profile.birthDate.slice(0, 10) : ""}
                  disabled={!studentProfileEditing}
                />
              </label>
              <label>
                Sexo
                <select name="gender" defaultValue={profile?.gender ?? ""} disabled={!studentProfileEditing}>
                  <option value="">Selecione</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Feminino</option>
                </select>
              </label>
              <label className="wide-field">
                Estado
                <select
                  name="state"
                  defaultValue={profile?.state ?? ""}
                  onChange={(event) => setStudentProfileUf(event.target.value)}
                  disabled={!studentProfileEditing}
                >
                  <option value="">Selecione seu estado</option>
                  {BRAZILIAN_STATES.map((state) => (
                    <option key={state.uf} value={state.uf}>
                      {state.name} ({state.uf})
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide-field">
                Cidade
                <select name="city" defaultValue={profile?.city ?? ""} disabled={!studentProfileEditing}>
                  <option value="">Selecione sua cidade</option>
                  {profile?.city &&
                    studentProfileUf === profile?.state &&
                    !(CITIES_BY_STATE[studentProfileUf] ?? []).includes(profile.city) && (
                      <option value={profile.city}>{profile.city}</option>
                    )}
                  {(CITIES_BY_STATE[studentProfileUf] ?? []).map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objetivo
                <select name="objective" defaultValue={profile?.objective ?? ""} disabled={!studentProfileEditing}>
                  <option value="">Selecione seu objetivo</option>
                  <option value="Hipertrofia">Hipertrofia</option>
                  <option value="Emagrecimento">Emagrecimento</option>
                  <option value="Condicionamento">Condicionamento</option>
                  <option value="Saúde">Saúde</option>
                  <option value="Definição">Definição</option>
                </select>
              </label>
              <label>
                Nível
                <select name="level" defaultValue={profile?.level ?? ""} disabled={!studentProfileEditing}>
                  <option value="">Selecione seu nível</option>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediário">Intermediário</option>
                  <option value="Avançado">Avançado</option>
                </select>
              </label>
            </form>
            <div className="student-profile-actions">
              {studentProfileEditing ? (
                <>
                  <button
                    className="student-green-button"
                    type="button"
                    onClick={() => {
                      const form = document.getElementById("student-profile-form");
                      if (form instanceof HTMLFormElement) void saveStudentProfile(form);
                    }}
                  >
                    Salvar dados cadastrais
                  </button>
                  <button className="student-outline-button" type="button" onClick={handleCancelStudentProfileEdit}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="student-green-button" type="button" onClick={() => setStudentProfileEditing(true)}>
                  Editar Informações
                </button>
              )}
            </div>
          </section>
        )}

        {studentSection === "status" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Frequência</span>
              <h1>Acessos e ofensiva</h1>
              <p>Sua constância na academia, dia a dia.</p>
            </div>
            <div className="student-metric-grid">
              <span><strong>{currentStreak}</strong> dias de ofensiva</span>
              <span><strong>{workoutsCompleted}/{totalWorkoutDays}</strong> treinos feitos</span>
              <span><strong>{attendanceThisMonth}</strong> acessos no mês</span>
              <span><strong>{attendance.length}</strong> acessos registrados</span>
            </div>
            <div className="student-consistency-calendar">
              <div className="student-consistency-heading">
                <button
                  className="student-calendar-arrow"
                  aria-label="Mês anterior"
                  disabled={streakCalendarMonth <= 1}
                  onClick={() => setStreakCalendarMonth((month) => Math.max(1, month - 1))}
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <span>Treinos concluídos</span>
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
                      key={`${cell.isoDate ?? "freq-empty"}-${index}`}
                    >
                      {cell.day}
                    </span>
                  );
                })}
              </div>
              <p>Dias marcados representam treinos concluídos. O calendário mostra o mês atual e meses anteriores.</p>
            </div>
            <div className="student-section-title-row">
              <h2 className="student-section-title">Registros de acesso</h2>
            </div>
            {recentAccesses.length > 0 ? (
              recentAccesses.map((record) => (
                <article className="student-info-card" key={record.id}>
                  <CalendarDays size={22} />
                  <div>
                    <strong>{new Date(record.date).toLocaleDateString("pt-BR")}</strong>
                    <span>Presença registrada</span>
                  </div>
                </article>
              ))
            ) : (
              <article className="student-empty-state">
                <CalendarDays size={28} />
                <strong>Nenhum acesso registrado</strong>
                <span>Registre sua presença com o QR de check-in na recepção.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "menu" && (
          <section className="student-menu-list">
            {[
              { icon: UserRound, title: "Perfil", action: () => setStudentSection("profile") },
              { icon: Dumbbell, title: "Treino", action: () => setStudentSection("training"), favorite: true },
              { icon: ShieldCheck, title: "Matrículas", action: () => setStudentSection("membership") },
              { icon: CreditCard, title: "Pagamentos", action: () => setStudentSection("payments"), favorite: true },
              { icon: Ruler, title: "Avaliações", action: () => setStudentSection("assessments") },
              { icon: CalendarDays, title: "Frequência", action: () => setStudentSection("status") },
              { icon: Package, title: "Produtos", action: () => setStudentSection("products"), favorite: true },
              { icon: ShoppingCart, title: "Compras", action: () => setStudentSection("purchases") },
              { icon: CalendarPlus, title: "Eventos", action: () => setStudentSection("events") },
              { icon: Headphones, title: "Atendimento", action: () => setStudentSection("support") },
              { icon: QrCode, title: "QR Code", action: () => { setStudentSection("home"); setShowStudentQr(true); } },
              { icon: CreditCard, title: "Meus Cartoes", action: () => setStudentSection("payments") },
              { icon: Settings, title: "Configuracoes", action: () => setStudentSection("profile") },
              { icon: MessageCircle, title: "Contato", action: () => setStudentSection("support") },
              { icon: Star, title: "Favoritos", action: () => setStudentSection("favorites") },
              { icon: Trophy, title: "Avaliar", action: () => setStudentSection("ratings") }
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
      </>

        {studentSection === "history" && (
          <section className="student-workout-history-page" aria-label="Histórico de treinos">
            <div className="student-workout-history-header">
              <div className="student-workout-history-icon">
                <ClipboardList size={30} />
              </div>
              <div>
                <h2>Histórico de treinos</h2>
                <p>Consulte todas as execuções da sua ficha de treino atual.</p>
              </div>
            </div>
            <div className="student-workout-history-list">
              {workoutHistorySessions.length > 0 ? (
                workoutHistorySessions.slice(0, 12).map((session) => (
                  <article key={session.id}>
                    <div className="student-history-card-heading">
                      <div>
                        <span>Treino</span>
                        <strong>Treino dia {session.dayNumber}</strong>
                      </div>
                      <small>{new Date(session.startedAt).toLocaleString("pt-BR")}</small>
                    </div>
                    <div className="student-history-muscles">
                      <Target size={20} />
                      <span>{getWorkoutHistoryMuscles(session.dayNumber)}</span>
                    </div>
                    <div className="student-history-metrics">
                      <span><strong>Batimentos (bpm)</strong>Não registrado</span>
                      <span><strong>Tempo de duração</strong>{formatWorkoutDuration(session.durationSeconds)}</span>
                      <span><strong>Calorias gastas</strong>Não registrado</span>
                      <span><strong>Sessão</strong>{session.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <button className="student-history-share-button" onClick={() => void handleShareWorkoutHistory(session)}>
                      <Share2 size={18} />
                      Compartilhar histórico
                    </button>
                  </article>
                ))
              ) : (
                <div className="student-empty-state">
                  <ClipboardList size={34} />
                  <strong>Nenhum treino concluído</strong>
                  <span>Finalize um treino para registrar no histórico.</span>
                </div>
              )}
            </div>
            <button className="student-history-back-button" onClick={() => setStudentSection("training")}>
              <ChevronLeft size={20} />
              Voltar
            </button>
          </section>
        )}

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

      {studentLightbox && (
        <div
          className="assessment-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setStudentLightbox(null)}
        >
          <div className="assessment-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button
              className="assessment-lightbox-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setStudentLightbox(null)}
            >
              <X size={22} />
            </button>
            {studentLightbox.urls.length > 1 && (
              <button
                className="assessment-lightbox-nav prev"
                type="button"
                aria-label="Foto anterior"
                onClick={() =>
                  setStudentLightbox((current) =>
                    current
                      ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length }
                      : current
                  )
                }
              >
                <ChevronLeft size={28} />
              </button>
            )}
            <img src={studentLightbox.urls[studentLightbox.index]} alt="Foto da avaliação física" />
            {studentLightbox.urls.length > 1 && (
              <button
                className="assessment-lightbox-nav next"
                type="button"
                aria-label="Próxima foto"
                onClick={() =>
                  setStudentLightbox((current) =>
                    current ? { ...current, index: (current.index + 1) % current.urls.length } : current
                  )
                }
              >
                <ChevronRight size={28} />
              </button>
            )}
            <span className="assessment-lightbox-counter">
              {studentLightbox.index + 1} / {studentLightbox.urls.length}
            </span>
          </div>
        </div>
      )}

      <nav className="student-bottom-nav" aria-label="Navegacao do aluno">
        <button className={studentSection === "home" ? "active" : ""} onClick={() => setStudentSection("home")}><Home size={22} />Home</button>
        <button className={studentSection === "payments" ? "active" : ""} onClick={() => setStudentSection("payments")}><CreditCard size={22} />Pagamentos</button>
        <button className={studentSection === "training" || studentSection === "player" || studentSection === "history" ? "active" : ""} onClick={() => setStudentSection("training")}><Dumbbell size={22} />Treino</button>
        <button className={studentSection === "products" ? "active" : ""} onClick={() => setStudentSection("products")}><Package size={22} />Produtos</button>
        <button className={studentSection === "menu" ? "active" : ""} onClick={() => setStudentSection("menu")}><Menu size={22} />Menu</button>
      </nav>
    </main>
  );
}
