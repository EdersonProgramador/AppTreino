import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { apiGet, apiPost } from "../auth/api";
import type { NativeSession } from "../auth/types";
import { FALLBACK_WORKOUT_MODALITY } from "./navigate";
import type {
  AiWorkoutPlan,
  AssessmentRow,
  AttendanceRow,
  CartRow,
  EventRow,
  LocationRow,
  MembershipRow,
  NotificationRow,
  OrderRow,
  PaymentCardRow,
  PaymentRow,
  ProductRow,
  PurchaseRow,
  StudentProfile,
  TicketRow,
  WorkoutFavorite,
  WorkoutProgram
} from "../types";
import { streakFromDates } from "./theme";

type ModalityRow = { id: string; name: string; description?: string | null; imageUrl?: string | null };
export type StreakKind = "WORKOUT" | "RUN" | "WALK" | "RIDE";

type Consistency = {
  completedWorkoutCount: number;
  totalWorkoutDays: number;
  completedDates?: string[];
  historyDates?: string[];
  dayKinds?: Record<string, StreakKind[]>;
  sportTotals?: Record<StreakKind, { count: number; km: number; minutes: number; calories?: number }>;
  weeklyVolume?: Array<{ weekStart: string; workouts: number; outdoorKm: number; minutes: number }>;
  sessions: Array<{
    id: string;
    dayNumber: number;
    startedAt: string;
    finishedAt: string | null;
    durationSeconds: number | null;
  }>;
};

type StudentData = {
  session: NativeSession;
  loading: boolean;
  error: string | null;
  hasAccess: boolean;
  profile: StudentProfile | null;
  membership: MembershipRow;
  payments: PaymentRow[];
  paymentCards: PaymentCardRow[];
  programs: WorkoutProgram[];
  favorites: WorkoutFavorite[];
  products: ProductRow[];
  cart: CartRow | null;
  orders: OrderRow[];
  purchases: PurchaseRow[];
  notifications: NotificationRow[];
  locations: LocationRow[];
  modalities: ModalityRow[];
  events: EventRow[];
  tickets: TicketRow[];
  attendance: AttendanceRow[];
  assessments: AssessmentRow[];
  aiPlans: AiWorkoutPlan[];
  consistency: Consistency | null;
  publicConfig: Record<string, string>;
  streak: number;
  streakDates: string[];
  streakDayKinds: Record<string, StreakKind[]>;
  qrRequested: boolean;
  requestQr: () => void;
  clearQr: () => void;
  refresh: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<StudentData | null>(null);

export function StudentProvider({
  session,
  onLogout,
  children
}: {
  session: NativeSession;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [membership, setMembership] = useState<MembershipRow>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentCards, setPaymentCards] = useState<PaymentCardRow[]>([]);
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [favorites, setFavorites] = useState<WorkoutFavorite[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [modalities, setModalities] = useState<ModalityRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlan[]>([]);
  const [consistency, setConsistency] = useState<Consistency | null>(null);
  const [publicConfig, setPublicConfig] = useState<Record<string, string>>({});
  const [qrRequested, setQrRequested] = useState(false);

  const refresh = useCallback(async () => {
    const token = session.token;
    setError(null);
    try {
      await apiPost("/student/workout/reset-abandoned", {}, token).catch(() => undefined);
      const [configRes, profileRes, membershipRes, paymentsRes, programsRes, modalitiesRes] = await Promise.all([
        apiGet<{ config: Record<string, string> }>("/public/config").catch(() => ({ config: {} as Record<string, string> })),
        apiGet<{ profile: StudentProfile }>("/user/profile", token),
        apiGet<{ membership: MembershipRow }>("/user/membership", token),
        apiGet<{ payments: PaymentRow[] }>("/user/payments", token).catch(() => ({ payments: [] as PaymentRow[] })),
        apiGet<{ workouts: WorkoutProgram[] }>("/student/workout/programs", token).catch(() => ({
          workouts: [] as WorkoutProgram[]
        })),
        apiGet<{ modalities: ModalityRow[] }>("/student/catalog/modalities", token).catch(() => ({
          modalities: [] as ModalityRow[]
        }))
      ]);

      setPublicConfig(configRes.config ?? {});
      const nextProfile = profileRes.profile;
      const nextMembership = membershipRes.membership;
      const access = nextMembership?.status === "ACTIVE" || nextProfile.enrollmentStatus === "ACTIVE";
      const nextModalities = modalitiesRes.modalities;
      const coverByModality = new Map<string, string | null>();
      for (const item of nextModalities) {
        if (!item.imageUrl) continue;
        coverByModality.set(item.name, item.imageUrl);
        coverByModality.set(item.name.toLowerCase(), item.imageUrl);
      }
      const withCovers = (workouts: WorkoutProgram[]) =>
        workouts.map((workout) => ({
          ...workout,
          modalityImageUrl:
            workout.modalityImageUrl ||
            coverByModality.get(workout.modality ?? FALLBACK_WORKOUT_MODALITY) ||
            coverByModality.get((workout.modality ?? FALLBACK_WORKOUT_MODALITY).toLowerCase()) ||
            null
        }));

      setProfile(nextProfile);
      setMembership(nextMembership);
      setPayments(paymentsRes.payments);
      setModalities(nextModalities);
      setPrograms(access ? withCovers(programsRes.workouts) : []);

      const extra = await Promise.all([
        apiGet<{ products: ProductRow[] }>("/student/products", token).catch(() => ({ products: [] as ProductRow[] })),
        apiGet<{ cart: CartRow | null }>("/student/cart", token).catch(() => ({ cart: null })),
        apiGet<{ orders: OrderRow[] }>("/student/orders", token).catch(() => ({ orders: [] as OrderRow[] })),
        apiGet<{ purchases: PurchaseRow[] }>("/student/purchases", token).catch(() => ({ purchases: [] as PurchaseRow[] })),
        apiGet<{ notifications: NotificationRow[] }>("/user/notifications", token).catch(() => ({
          notifications: [] as NotificationRow[]
        })),
        apiGet<{ locations: LocationRow[] }>("/student/locations", token).catch(() => ({ locations: [] as LocationRow[] })),
        apiGet<{ events: EventRow[] }>("/user/events", token).catch(() => ({ events: [] as EventRow[] })),
        apiGet<{ tickets: TicketRow[] }>("/user/support-tickets", token).catch(() => ({ tickets: [] as TicketRow[] })),
        apiGet<{ records: AttendanceRow[] }>("/user/attendance", token).catch(() => ({ records: [] as AttendanceRow[] })),
        apiGet<Consistency>("/student/workout/consistency", token).catch(() => null),
        apiGet<{ assessments: AssessmentRow[] }>("/user/physical-assessments", token).catch(() => ({
          assessments: [] as AssessmentRow[]
        })),
        apiGet<{ paymentCards: PaymentCardRow[] }>("/student/payment-cards", token).catch(() => ({
          paymentCards: [] as PaymentCardRow[]
        })),
        apiGet<{ favorites: WorkoutFavorite[] }>("/student/workout/favorites", token).catch(() => ({
          favorites: [] as WorkoutFavorite[]
        })),
        apiGet<{ plans: AiWorkoutPlan[] }>("/user/ai-workout-plans", token).catch(() => ({
          plans: [] as AiWorkoutPlan[]
        }))
      ]);

      setProducts(access ? extra[0].products : []);
      setCart(access ? extra[1].cart : null);
      setOrders(access ? extra[2].orders : []);
      setPurchases(access ? extra[3].purchases : []);
      setNotifications(extra[4].notifications);
      setLocations(extra[5].locations);
      setEvents(extra[6].events);
      setTickets(extra[7].tickets);
      setAttendance(extra[8].records);
      setConsistency(access ? extra[9] : null);
      setAssessments(extra[10].assessments);
      setPaymentCards(extra[11].paymentCards);
      setFavorites(access ? extra[12].favorites : []);
      setAiPlans(extra[13].plans);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasAccess = membership?.status === "ACTIVE" || profile?.enrollmentStatus === "ACTIVE";
  const streakDates = useMemo(() => {
    const fromConsistency = consistency?.historyDates ?? consistency?.completedDates ?? [];
    const fromAttendance = attendance.map((item) => item.date.slice(0, 10));
    return Array.from(new Set([...fromConsistency, ...fromAttendance]));
  }, [attendance, consistency?.completedDates, consistency?.historyDates]);
  const streakDayKinds = useMemo(() => {
    const map: Record<string, StreakKind[]> = { ...(consistency?.dayKinds ?? {}) };
    for (const item of attendance) {
      const day = item.date.slice(0, 10);
      if (!map[day]?.length) map[day] = ["WORKOUT"];
    }
    return map;
  }, [attendance, consistency?.dayKinds]);
  const streak = useMemo(() => streakFromDates(streakDates), [streakDates]);

  const value = useMemo<StudentData>(
    () => ({
      session,
      loading,
      error,
      hasAccess: Boolean(hasAccess),
      profile,
      membership,
      payments,
      paymentCards,
      programs,
      favorites,
      products,
      cart,
      orders,
      purchases,
      notifications,
      locations,
      modalities,
      events,
      tickets,
      attendance,
      assessments,
      aiPlans,
      consistency,
      publicConfig,
      streak,
      streakDates,
      streakDayKinds,
      qrRequested,
      requestQr: () => setQrRequested(true),
      clearQr: () => setQrRequested(false),
      refresh,
      logout: onLogout
    }),
    [
      session,
      loading,
      error,
      hasAccess,
      profile,
      membership,
      payments,
      paymentCards,
      programs,
      favorites,
      products,
      cart,
      orders,
      purchases,
      notifications,
      locations,
      modalities,
      events,
      tickets,
      attendance,
      assessments,
      aiPlans,
      consistency,
      publicConfig,
      streak,
      streakDates,
      streakDayKinds,
      qrRequested,
      refresh,
      onLogout
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudent() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudent fora do StudentProvider");
  return ctx;
}
