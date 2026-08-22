import {
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
  CreditCard,
  Dumbbell,
  Eye,
  Flame,
  Headphones,
  Home,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Music2,
  Package,
  Pencil,
  Plus,
  QrCode,
  Radio,
  Ruler,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  SquarePlus,
  Star,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  UserRound,
  UsersRound,
  Video,
  X
} from "lucide-react";
import { lazy, Suspense, type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { formatPriceInBRL, initialPlans } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";
import { levelLabel } from "../onboarding/onboarding.schema";
import { calculateBodyFatEstimate } from "../../lib/body-composition";
import { buildMonthCalendar, formatAssessmentDateTime, formatDateTimeLocalInputValue, monthLabel } from "../../lib/dates";
import { formatProgramDuration } from "../../lib/cms";
import { assetUrl, mediaUrl } from "../../lib/urls";
import {
  financeStatusBadgeClass,
  labelBillingCycle,
  labelMembershipStatus,
  labelPaymentStatus
} from "../../lib/finance";
import { labelProductKind, labelPurchaseStatus, labelOrderStatus, labelShippingMethod, purchaseStatusTone } from "../../lib/commerce";
import { labelLocationType, studentLocationLabel } from "../../lib/locations";
import { sessionLabelFromBlock, trainingCopy } from "../../lib/training-copy";
import { brand } from "../../lib/brand";
import { StudentAthleteProfileSection } from "./StudentAthleteProfileSection";
import { RunnerIcon } from "../shared/RunnerIcon";
import { AnimatedList } from "../shared/AnimatedList";
import { MediaImg } from "../shared/MediaImg";
import {
  useStudentSyncStore,
  type StudentPanelSection
} from "../../stores/studentSyncStore";
import type { PanelDestination } from "../../lib/event-bus";
import type {
  AiWorkoutPlanRow,
  AssessmentPhotoKey,
  CheckoutSessionResponse,
  EventRow,
  NotificationRow,
  PaymentCardRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  PlanRow,
  ProductRow,
  PurchaseRow,
  CartRow,
  OrderRow,
  StudentFavoriteRow,
  StudentLocationRow,
  StudentMembershipRow,
  StudentProfile,
  StudentWorkoutProgramsResponse,
  SupportTicketRow,
  TodayWorkoutResponse,
  UploadResponse,
  WorkoutConsistencyResponse,
  WorkoutRow,
  WorkoutSessionResponse
} from "../../types";
import type { PlanCode } from "../../types/auth";
import { assessmentPerimeterKeys, assessmentPhotoFields } from "../../types/admin";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import { LockedOverlay } from "./LockedOverlay";
import { StudentSettingsPanel } from "./StudentSettingsPanel";
import { StudentMusicPlayerHost } from "./StudentMusicPlayerHost";
import { StudentPlaySection } from "./StudentPlaySection";
import { StudentFeedSection } from "./StudentFeedSection";
import {
  StudentChatSection,
  StudentLiveSection,
  StudentMessagesSection,
  StudentReelsSection,
  StudentRequestsSection
} from "./StudentSocialInfraSections";
import { StudentClubSection } from "./StudentClubSection";
import { StudentActivitySection } from "./StudentActivitySection";
import { useMusicPlayerStore } from "../../stores/musicPlayerStore";
import { useFeedChromeStore } from "../../stores/feedChromeStore";
import { isNativeAppShell } from "../../lib/native-bridge";
import { readStudentPanel, writeStudentPanel } from "../../lib/student-panel-persist";
import { clearWorkoutRunner } from "../../lib/workout-runner-persist";
import { flushShellStateToNative } from "../../lib/shell-persist";
import { PhysicalAssessmentFormView } from "../shared/PhysicalAssessmentFormView";
import { uiSounds } from "../../lib/ui-sounds";

const WorkoutPlayer = lazy(async () => {
  const module = await import("./WorkoutPlayer");
  return { default: module.WorkoutPlayer };
});

export function UserView({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const { user: authUser, exitAdminPreview } = useAuth();
  const isAdminPreview = Boolean(authUser?.previewMode && authUser?.canReturnToAdmin);
  const [previewExiting, setPreviewExiting] = useState(false);
  const emitSystemEvent = useStudentSyncStore((state) => state.emit);
  const syncNavigateTo = useStudentSyncStore((state) => state.navigateTo);
  const syncPendingRefresh = useStudentSyncStore((state) => state.pendingRefresh);
  const syncNotifications = useStudentSyncStore((state) => state.syncNotifications);
  const highlightedSections = useStudentSyncStore((state) => state.highlightedSections);
  const consumeNavigate = useStudentSyncStore((state) => state.consumeNavigate);
  const consumeRefresh = useStudentSyncStore((state) => state.consumeRefresh);
  const markNotificationRead = useStudentSyncStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useStudentSyncStore((state) => state.markAllNotificationsRead);
  const clearSectionHighlight = useStudentSyncStore((state) => state.clearSectionHighlight);
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredPanel = readStudentPanel();
  const [studentSection, setStudentSection] = useState<StudentPanelSection>(
    restoredPanel?.section === "home" || restoredPanel?.section === "feed"
      ? "training"
      : restoredPanel?.section ?? "training"
  );
  const studentSectionRef = useRef(studentSection);
  studentSectionRef.current = studentSection;
  const [playerSessionActive, setPlayerSessionActive] = useState(Boolean(restoredPanel?.playerSessionActive));
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [athleteSocial, setAthleteSocial] = useState<{
    followersCount: number;
    followingCount: number;
    postsCount: number;
    isPrivate: boolean;
  } | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkoutResponse["workout"] | null>(null);
  const [publishedWorkouts, setPublishedWorkouts] = useState<TodayWorkoutResponse["workout"][]>([]);
  const [lockedPreviewModalities, setLockedPreviewModalities] = useState<
    Array<{ id: string; name: string; description: string | null; imageUrl: string | null; locked: boolean }>
  >([]);
  const [selectedWorkoutModality, setSelectedWorkoutModality] = useState<string | null>(restoredPanel?.modality ?? null);
  const [selectedWorkoutProgramId, setSelectedWorkoutProgramId] = useState<string | null>(
    restoredPanel?.programId ?? null
  );
  const [workoutSession, setWorkoutSession] = useState<WorkoutSessionResponse["session"] | null>(() =>
    restoredPanel?.workoutSessionId
      ? {
          id: restoredPanel.workoutSessionId,
          status: "IN_PROGRESS",
          startedAt: new Date().toISOString()
        }
      : null
  );
  const [consistency, setConsistency] = useState<WorkoutConsistencyResponse | null>(null);
  const [membership, setMembership] = useState<StudentMembershipRow | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [attendance, setAttendance] = useState<Array<{ id: string; date: string }>>([]);
  const [assessments, setAssessments] = useState<PhysicalAssessmentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedStudentTicketId, setSelectedStudentTicketId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [socialMenuOpen, setSocialMenuOpen] = useState(false);
  const [corridaOpenKey, setCorridaOpenKey] = useState(0);
  const [studentLocations, setStudentLocations] = useState<StudentLocationRow[]>([]);
  const [studentAvatarPreview, setStudentAvatarPreview] = useState<string | null>(null);
  const [studentProfileEditing, setStudentProfileEditing] = useState(false);
  const [studentProfileUf, setStudentProfileUf] = useState<string>(profile?.state ?? "");
  const [studentProfileFormKey, setStudentProfileFormKey] = useState(0);
  const [aiPlans, setAiPlans] = useState<AiWorkoutPlanRow[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
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
  const [studentCart, setStudentCart] = useState<CartRow | null>(null);
  const [studentOrders, setStudentOrders] = useState<OrderRow[]>([]);
  const [cartShippingMethod, setCartShippingMethod] = useState<"PICKUP" | "DELIVERY" | "DIGITAL">("PICKUP");
  const [cartAddress, setCartAddress] = useState("");
  const [cartCouponInput, setCartCouponInput] = useState("");
  const [cartCheckingOut, setCartCheckingOut] = useState(false);
  const [cartQtyBusyId, setCartQtyBusyId] = useState<string | null>(null);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [purchaseConfirmId, setPurchaseConfirmId] = useState<string | null>(null);
  const purchaseConfirmTimer = useRef<number | null>(null);
  const [studentWorkoutFavorites, setStudentWorkoutFavorites] = useState<StudentFavoriteRow[]>([]);
  const [ratingDraft, setRatingDraft] = useState<Record<string, { score: number; comment: string }>>({});
  const [submittingRatingId, setSubmittingRatingId] = useState<string | null>(null);
  const [favoritingProgramId, setFavoritingProgramId] = useState<string | null>(null);
  const [repeatingProgramId, setRepeatingProgramId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<"error" | "warning">("error");
  const [errorTick, setErrorTick] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);

  function flashError(message: string) {
    setSuccess(null);
    setErrorTone("error");
    setErrorTick((tick) => tick + 1);
    setError(message);
  }

  function flashStockLimit() {
    setSuccess(null);
    setErrorTone("warning");
    setErrorTick((tick) => tick + 1);
    setError("😅 Esse é o máximo disponível por enquanto.");
  }

  useEffect(() => {
    if (!token || !accessReady) return;
    void apiGet<{
      followersCount: number;
      followingCount: number;
      postsCount: number;
      isPrivate: boolean;
    }>("/student/social/me", token)
      .then((data) =>
        setAthleteSocial({
          followersCount: data.followersCount,
          followingCount: data.followingCount,
          postsCount: data.postsCount,
          isPrivate: data.isPrivate
        })
      )
      .catch(() => undefined);
  }, [token, accessReady, studentSection]);

  useEffect(() => {
    if (studentSection !== "feed" && studentSection !== "home") {
      setSocialMenuOpen(false);
    }
  }, [studentSection]);

  useEffect(() => {
    if (!socialMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".student-avatar-menu-wrap")) return;
      setSocialMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [socialMenuOpen]);

  useEffect(() => {
    if (!success) return;
    uiSounds.success();
    const timer = window.setTimeout(() => setSuccess(null), 2000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    if (errorTone === "warning") {
      uiSounds.info();
    } else {
      uiSounds.error();
    }
    const timer = window.setTimeout(() => setError(null), errorTone === "warning" ? 3000 : 2000);
    return () => window.clearTimeout(timer);
  }, [error, errorTick, errorTone]);

  useEffect(() => {
    if (!accessReady) return;
    uiSounds.bootUp();
  }, [accessReady]);

  useEffect(() => {
    if (!studentLightbox) return;
    uiSounds.popupOpen();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        uiSounds.popupClose();
        setStudentLightbox(null);
      }
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

  async function loadUserData(options?: { soft?: boolean }) {
    if (!token) return;

    try {
      const [profileResponse, membershipResponse, paymentsResponse, workoutProgramsResponse] = await Promise.all([
        apiGet<{ profile: StudentProfile }>("/user/profile", token),
        apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token),
        apiGet<{ payments: PaymentRow[] }>("/user/payments", token),
        apiGet<StudentWorkoutProgramsResponse>("/student/workout/programs", token).catch(() => ({ workouts: [] }))
      ]);

      const activeMembership = membershipResponse.membership?.status === "ACTIVE";
      const enrollmentActive = profileResponse.profile.enrollmentStatus === "ACTIVE";
      const hasAccess = activeMembership || enrollmentActive;
      const firstPublishedWorkout = workoutProgramsResponse.workouts[0] ?? null;
      const restoredProgramId = selectedWorkoutProgramId ?? restoredPanel?.programId ?? null;
      const restoredWorkout = restoredProgramId
        ? workoutProgramsResponse.workouts.find((item) => item.programId === restoredProgramId) ?? null
        : null;

      setProfile(profileResponse.profile);
      setMembership(membershipResponse.membership);
      setPayments(paymentsResponse.payments);
      setPublishedWorkouts(workoutProgramsResponse.workouts);
      setTodayWorkout(restoredWorkout ?? firstPublishedWorkout);
      setCheckoutPayment(paymentsResponse.payments.find((item) => item.status === "PENDING") ?? null);
      setAccessReady(true);

      if (!hasAccess) {
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
        try {
          const catalog = await apiGet<{
            modalities: Array<{
              id: string;
              name: string;
              description: string | null;
              imageUrl: string | null;
              locked: boolean;
            }>;
          }>("/student/catalog/modalities", token);
          setLockedPreviewModalities(catalog.modalities);
        } catch {
          setLockedPreviewModalities([]);
        }
        return;
      }

      setLockedPreviewModalities([]);

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
        cartResponse,
        ordersResponse,
        workoutFavoritesResponse,
        locationsResponse
      ] = await Promise.all([
        apiGet<{ workout: WorkoutRow | null }>("/user/workout", token).catch(() => ({ workout: null })),
        apiGet<{ records: Array<{ id: string; date: string }> }>("/user/attendance", token).catch(() => ({
          records: [] as Array<{ id: string; date: string }>
        })),
        apiGet<{ assessments: PhysicalAssessmentRow[] }>("/user/physical-assessments", token).catch(() => ({
          assessments: [] as PhysicalAssessmentRow[]
        })),
        apiGet<{ events: EventRow[] }>("/user/events", token).catch(() => ({ events: [] as EventRow[] })),
        apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token).catch(() => ({
          tickets: [] as SupportTicketRow[]
        })),
        apiGet<{ notifications: NotificationRow[] }>("/user/notifications", token).catch(() => ({
          notifications: [] as NotificationRow[]
        })),
        apiGet<{ plans: AiWorkoutPlanRow[] }>("/user/ai-workout-plans", token).catch(() => ({
          plans: [] as AiWorkoutPlanRow[]
        })),
        apiGet<WorkoutConsistencyResponse>("/student/workout/consistency", token).catch(() => null),
        apiGet<{ products: ProductRow[] }>("/student/products", token).catch(() => ({ products: [] as ProductRow[] })),
        apiGet<{ purchases: PurchaseRow[] }>("/student/purchases", token).catch(() => ({ purchases: [] as PurchaseRow[] })),
        apiGet<{ cart: CartRow }>("/student/cart", token).catch(() => ({ cart: null })),
        apiGet<{ orders: OrderRow[] }>("/student/orders", token).catch(() => ({ orders: [] as OrderRow[] })),
        apiGet<{ favorites: StudentFavoriteRow[] }>("/student/workout/favorites", token).catch(() => ({
          favorites: [] as StudentFavoriteRow[]
        })),
        apiGet<{ locations: StudentLocationRow[] }>("/student/locations", token).catch(() => ({
          locations: [] as StudentLocationRow[]
        }))
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
      setStudentCart(cartResponse.cart);
      if (cartResponse.cart?.shippingMethod) {
        setCartShippingMethod(cartResponse.cart.shippingMethod);
      }
      if (cartResponse.cart?.couponCode) {
        setCartCouponInput(cartResponse.cart.couponCode);
      }
      setStudentOrders(ordersResponse.orders);
      setStudentWorkoutFavorites(workoutFavoritesResponse.favorites);

      // Refresh/abandono: sem resume — reseta sessões órfãs fora do player.
      // Não faz isso no retorno de segundo plano (soft), senão o treino some ao trocar de app.
      if (!options?.soft && studentSectionRef.current !== "player") {
        await apiPost("/student/workout/reset-abandoned", {}, token).catch(() => {});
        setWorkoutSession(null);
        clearWorkoutRunner();
        flushShellStateToNative();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível carregar sua área. Verifique API e banco.");
      setAccessReady(true);
    }
  }

  useEffect(() => {
    setStudentProfileUf(profile?.state ?? "");
  }, [profile]);

  useEffect(() => {
    setAccessReady(false);
    void loadUserData();
    apiGet<{ config: Record<string, string> }>("/public/config")
      .then((response) => setPublicConfig(response.config))
      .catch(() => {});
    loadStudentCards();
  }, [token]);

  useEffect(() => {
    writeStudentPanel({
      section: studentSection,
      modality: selectedWorkoutModality,
      programId: selectedWorkoutProgramId,
      workoutSessionId: workoutSession?.id ?? null,
      playerSessionActive
    });
  }, [studentSection, selectedWorkoutModality, selectedWorkoutProgramId, workoutSession?.id, playerSessionActive]);

  useEffect(() => {
    if (!token) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      // No Expo, visibility/focus dispara ao trocar de app — não recarregar a Home.
      if (isNativeAppShell()) return;
      void loadUserData({ soft: true });
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [token]);

  /** Consumidores do Event Bus: sincronizam destinos e notificam o painel. */
  useEffect(() => {
    if (!syncNavigateTo && syncPendingRefresh.length === 0) return;

    const nextSection = consumeNavigate();
    const refreshTypes = consumeRefresh();

    if (nextSection) {
      setStudentSection(nextSection === "home" ? "feed" : nextSection);
    }

    if (refreshTypes.length === 0 || !token) return;

    void (async () => {
      try {
        if (refreshTypes.includes("COMPRA_CONCLUIDA")) {
          const [membershipResponse, paymentsResponse, productsResponse, purchasesResponse] = await Promise.all([
            apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token),
            apiGet<{ payments: PaymentRow[] }>("/user/payments", token),
            apiGet<{ products: ProductRow[] }>("/student/products", token),
            apiGet<{ purchases: PurchaseRow[] }>("/student/purchases", token)
          ]);
          setMembership(membershipResponse.membership);
          setPayments(paymentsResponse.payments);
          setStudentProducts(productsResponse.products);
          setStudentPurchases(purchasesResponse.purchases);
          setSuccess("Pagamentos e Matrículas atualizados após a compra.");
          uiSounds.paymentApproved();
        }

        if (refreshTypes.includes("CARTAO_ATUALIZADO")) {
          const paymentsResponse = await apiGet<{ payments: PaymentRow[] }>("/user/payments", token);
          setPayments(paymentsResponse.payments);
          await loadStudentCards();
          setSuccess("Forma de cobrança sincronizada com Pagamentos.");
        }

        if (refreshTypes.includes("CHECKIN_REALIZADO")) {
          const today = new Date().toISOString().slice(0, 10);
          setAttendance((current) => {
            if (current.some((item) => item.date.slice(0, 10) === today)) return current;
            return [{ id: `checkin-${today}`, date: new Date().toISOString() }, ...current];
          });
          const [attendanceResponse, locationsResponse] = await Promise.all([
            apiGet<{ records: Array<{ id: string; date: string }> }>("/user/attendance", token),
            apiGet<{ locations: StudentLocationRow[] }>("/student/locations", token)
          ]);
          setAttendance(attendanceResponse.records);
          setStudentLocations(locationsResponse.locations);
          setSuccess("Frequência e Unidades atualizadas após o check-in.");
        }

        if (refreshTypes.includes("MENSAGEM_ENVIADA")) {
          const ticketsResponse = await apiGet<{ tickets: SupportTicketRow[] }>("/user/support-tickets", token);
          setTickets(ticketsResponse.tickets);
          setSuccess("Atendimento atualizado com a nova mensagem.");
        }

        if (refreshTypes.includes("AVALIACAO_SUBMETIDA")) {
          const workoutProgramsResponse = await apiGet<StudentWorkoutProgramsResponse>(
            "/student/workout/programs",
            token
          ).catch(() => ({ workouts: [] as TodayWorkoutResponse["workout"][] }));
          setPublishedWorkouts(workoutProgramsResponse.workouts);
          setSuccess("Feedback sincronizado com Avaliação física / Treino.");
        }

        if (refreshTypes.includes("PRODUTO_PUBLICADO")) {
          const [productsResponse, notificationsResponse] = await Promise.all([
            apiGet<{ products: ProductRow[] }>("/student/products", token),
            apiGet<{ notifications: NotificationRow[] }>("/user/notifications", token)
          ]);
          setStudentProducts(productsResponse.products);
          setNotifications(notificationsResponse.notifications);
          setSuccess("Novo produto disponível na vitrine.");
          uiSounds.popupNotify();
        }

        if (refreshTypes.includes("PROGRAMA_PUBLICADO") || refreshTypes.includes("CMS_ATUALIZADO")) {
          await loadUserData();
          if (refreshTypes.includes("PROGRAMA_PUBLICADO")) {
            setSuccess("Novo treino publicado disponível na área de Treino.");
            uiSounds.success();
          } else {
            setSuccess("Informações atualizadas com as alterações do admin.");
            uiSounds.popupNotify();
          }
        }
      } catch {
        setError("Não foi possível sincronizar os módulos do painel.");
      }
    })();
  }, [syncNavigateTo, syncPendingRefresh, consumeNavigate, consumeRefresh, token]);

  useEffect(() => {
    const destination = studentSection as PanelDestination;
    if (highlightedSections.includes(destination)) {
      clearSectionHighlight(destination);
    }
  }, [studentSection, highlightedSections, clearSectionHighlight]);

  useEffect(() => {
    setSelectedWorkoutProgramId((current) => {
      if (!current) return current;
      const stillExists = publishedWorkouts.some((item) => item.programId === current);
      return stillExists ? current : null;
    });
    setSelectedWorkoutModality((current) => {
      if (!current) return current;
      const stillExists = publishedWorkouts.some((item) => (item.modality ?? "Hipertrofia") === current);
      return stillExists ? current : null;
    });
  }, [publishedWorkouts]);

  useEffect(() => {
    if (studentSection !== "player") {
      setPlayerSessionActive(false);
    }
  }, [studentSection]);

  useEffect(() => {
    const scroller = document.querySelector(".student-app-scroll");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [studentSection]);

  /** Menu inferior some só com sessão de treino iniciada; ao sair, retorna. */
  const hideStudentChrome =
    studentSection === "player" && (playerSessionActive || Boolean(workoutSession));
  const musicQueueLength = useMusicPlayerStore((state) => state.queue.length);

  const restoreStudentChrome = () => {
    setPlayerSessionActive(false);
  };

  const goToSection = (section: StudentPanelSection) => {
    const nextSection = section === "favorites" ? "ratings" : section === "home" ? "feed" : section;
    if (studentSection === "player" && nextSection !== "player") {
      // Sair sem concluir = reset do treino do dia.
      void (async () => {
        await handleCancelWorkoutSession();
        restoreStudentChrome();
        uiSounds.studentPage();
        uiSounds.pageChange();
        useMusicPlayerStore.getState().collapse();
        setStudentSection(nextSection);
      })();
      return;
    }
    uiSounds.studentPage();
    uiSounds.pageChange();
    if (nextSection !== "play") {
      useMusicPlayerStore.getState().collapse();
    }
    setStudentSection(nextSection);
  };

  useEffect(() => {
    const raw = searchParams.get("section");
    if (!raw) return;
    const next = (raw === "home" ? "feed" : raw === "favorites" ? "ratings" : raw) as StudentPanelSection;
    const allowed: StudentPanelSection[] = [
      "feed",
      "club",
      "activity",
      "training",
      "play",
      "products",
      "cart",
      "menu",
      "profile",
      "profile-settings",
      "membership",
      "payments",
      "assessments",
      "status",
      "events",
      "support",
      "ai",
      "history",
      "settings",
      "purchases",
      "orders",
      "ratings",
      "locations",
      "reels",
      "live",
      "messages",
      "chat",
      "requests"
    ];
    if (!allowed.includes(next) || next === studentSectionRef.current) return;
    setStudentSection(next);
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("section");
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  const openTrainingCatalog = () => {
    setSelectedWorkoutModality(null);
    setSelectedWorkoutProgramId(null);
    goToSection("training");
  };

  const openCorrida = () => {
    setCorridaOpenKey((key) => key + 1);
    goToSection("activity");
  };

  const CorridaNavIcon = ({ size = 22, strokeWidth: _sw }: { size?: number; strokeWidth?: number }) => (
    <RunnerIcon size={size} gender={profile?.gender} />
  );

  const openTodaySession = () => {
    const target = todayWorkout ?? (publishedWorkouts.length === 1 ? publishedWorkouts[0] : null);
    if (!target) {
      openTrainingCatalog();
      return;
    }
    setSelectedWorkoutModality(target.modality ?? "Hipertrofia");
    setSelectedWorkoutProgramId(target.programId);
    goToSection("training");
  };

  useEffect(() => {
    if (!token) return;
    if (membership?.status === "ACTIVE" || profile?.enrollmentStatus === "ACTIVE") return;

    const pending = checkoutPayment ?? payments.find((item) => item.status === "PENDING");
    if (!pending) return;

    const interval = window.setInterval(async () => {
      try {
        const [membershipResponse, profileResponse] = await Promise.all([
          apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token),
          apiGet<{ profile: StudentProfile }>("/user/profile", token)
        ]);
        if (
          membershipResponse.membership?.status === "ACTIVE" ||
          profileResponse.profile.enrollmentStatus === "ACTIVE"
        ) {
          setMembership(membershipResponse.membership);
          setProfile(profileResponse.profile);
          await loadUserData();
        }
      } catch {
        // Ignora falhas transitórias enquanto aguarda a confirmação do pagamento.
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [token, membership?.status, profile?.enrollmentStatus, checkoutPayment, payments]);

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
    if (studentSection !== "cart" || !token || publicConfig["module_products"] === "false") return;
    void refreshStudentCart().catch(() => {
      setError("Não foi possível abrir o carrinho.");
    });
  }, [studentSection, token, publicConfig]);

  useEffect(() => {
    if (!notificationsOpen || !token) return;
    markAllNotificationsRead();
    void apiPost<{ ok: boolean; unreadCount: number }>("/user/notifications/read", { all: true }, token)
      .then(() => {
        setNotifications((current) =>
          current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
        );
      })
      .catch(() => undefined);
  }, [notificationsOpen, markAllNotificationsRead, token]);

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
      emitSystemEvent("MENSAGEM_ENVIADA", {
        ticketId: created.ticket.id,
        action: "created",
        subject: created.ticket.subject,
        source: "contato"
      });
    } catch {
      setError("Não foi possível abrir o atendimento.");
    }
  }

  async function handleStudentSendTicketMessage(ticketId: string, body: string) {
    try {
      await apiPost(`/user/support-tickets/${ticketId}/messages`, { body }, token);
      emitSystemEvent("MENSAGEM_ENVIADA", {
        ticketId,
        action: "replied",
        source: "contato"
      });
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

    setError(null);
    setAiBusy(true);
    uiSounds.submit();
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
      uiSounds.success();
    } catch {
      setError("Não foi possível gerar o plano pelo agente IA.");
      uiSounds.error();
    } finally {
      setAiBusy(false);
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
        uiSounds.paymentApproved();
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
      uiSounds.paymentApproved();
      await loadUserData();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      uiSounds.paymentDisconnected();
      setError(message ?? "Não foi possível confirmar o pagamento sandbox.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  const handleStartWorkoutSession = async (workoutToStart = todayWorkout) => {
    if (!workoutToStart) return;
    if (workoutToStart.cycleCompleted) {
      flashError(trainingCopy.programCompleted);
      return;
    }
    const currentDayForProgram =
      publishedWorkouts.find((item) => item.programId === workoutToStart.programId)?.dayNumber ??
      todayWorkout?.dayNumber ??
      null;
    if (currentDayForProgram != null && workoutToStart.dayNumber !== currentDayForProgram) {
      flashError("Conclua o dia atual antes de iniciar outro treino.");
      return;
    }

    uiSounds.open();
    clearWorkoutRunner();
    flushShellStateToNative();
    setSelectedWorkoutProgramId(workoutToStart.programId);
    setSelectedWorkoutModality(workoutToStart.modality ?? "Hipertrofia");
    setTodayWorkout(workoutToStart);
    setWorkoutSession(null);
      setStudentSection("player");
  };

  const handleRepeatWorkoutProgram = async (workoutToRepeat: TodayWorkoutResponse["workout"]) => {
    if (!token || !workoutToRepeat.cycleCompleted) return;

    setRepeatingProgramId(workoutToRepeat.programId);
    setError(null);

    try {
      await apiPost("/student/workout/repeat", { assignmentId: workoutToRepeat.assignmentId }, token);
      await loadUserData();
      setSelectedWorkoutModality(workoutToRepeat.modality ?? selectedWorkoutModality);
      setSelectedWorkoutProgramId(workoutToRepeat.programId);
      setSuccess(trainingCopy.repeatStartedToast);
    } catch (repeatError) {
      flashError(
        repeatError instanceof ApiError ? repeatError.message : "Não foi possível repetir este treino."
      );
    } finally {
      setRepeatingProgramId(null);
    }
  };

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
      setPlayerSessionActive(true);
      return response.session;
    } catch (startError) {
      const message =
        startError instanceof ApiError
          ? startError.message
          : "Não foi possível iniciar o cronômetro do treino.";
      setError(message);
      throw new Error(message);
    }
  }

  const handleCompleteWorkoutDay = async () => {
    if (!todayWorkout || !workoutSession?.id) {
      setError("Inicie o treino antes de concluir.");
      return;
    }

    try {
      const response = await apiPost<{ completed?: boolean }>(
        "/student/workout/complete-day",
        {
          assignmentId: todayWorkout.assignmentId,
          sessionId: workoutSession.id
        },
        token
      );
      setWorkoutSession(null);
      await loadUserData();
      setSelectedWorkoutModality(todayWorkout.modality ?? selectedWorkoutModality);
      setSuccess(
        response.completed ? trainingCopy.programCompletedToast : "Treino concluído! Próximo dia liberado."
      );
      setPlayerSessionActive(false);
    } catch (completeError) {
      uiSounds.error();
      setError(
        completeError instanceof ApiError
          ? completeError.message
          : "Não foi possível concluir o treino agora."
      );
      throw completeError;
    }
  };

  async function handleCancelWorkoutSession() {
    if (!workoutSession?.id) {
      uiSounds.void();
      setWorkoutSession(null);
      clearWorkoutRunner();
      flushShellStateToNative();
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
      uiSounds.void();
    } catch {
      setError("Não foi possível resetar o treino agora.");
    } finally {
      setWorkoutSession(null);
      clearWorkoutRunner();
      flushShellStateToNative();
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
      emitSystemEvent("CARTAO_ATUALIZADO", {
        action: "added",
        source: "meus_cartoes"
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível adicionar o cartão.");
    }
  }

  async function handleDeleteStudentCard(cardId: string) {
    if (!token) return;
    try {
      await apiDelete(`/student/payment-cards/${cardId}`, token);
      emitSystemEvent("CARTAO_ATUALIZADO", {
        cardId,
        action: "removed",
        source: "meus_cartoes"
      });
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
    setStudentProfileUf(profile?.state ?? "");
    setStudentProfileFormKey((key) => key + 1);
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
        uiSounds.screenshot();
        avatarUrl = uploaded.file.url;
      }

      // Sexo não é enviado na edição: só cadastro/onboarding (quando ainda vazio) ou admin.
      const response = await apiPut<{ profile: StudentProfile }>(
        "/user/profile",
        {
          name,
          phone: phone || undefined,
          document: document || undefined,
          birthDate: birthDate ? `${birthDate}T12:00:00.000Z` : undefined,
          objective: objective || undefined,
          level: level || undefined,
          city: city || undefined,
          state: state || undefined,
          avatarUrl
        },
        token
      );
      setProfile((current) => ({
        ...current,
        ...response.profile,
        enrollmentStatus: current?.enrollmentStatus ?? response.profile.enrollmentStatus
      }));
      setStudentProfileUf(response.profile.state ?? "");
      setStudentAvatarPreview(null);
      setStudentProfileEditing(false);
      setStudentProfileFormKey((key) => key + 1);
      await loadUserData();
      setSuccess("Dados cadastrais atualizados com sucesso.");
      uiSounds.success();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : null;
      setError(message ?? "Não foi possível salvar seus dados.");
    }
  }

  async function handleCompleteOnboarding(payload: WorkoutOnboardingSubmitPayload) {
    if (!token) return;
    setCompletingOnboarding(true);
    setError(null);

    try {
      const response = await apiPut<{ profile: StudentProfile }>(
        "/user/profile",
        {
          name: payload.name,
          phone: payload.phone || undefined,
          ...(profile?.gender ? {} : { gender: payload.gender }),
          birthDate: `${payload.birthDate}T12:00:00.000Z`,
          objective: payload.objective,
          level: levelLabel(payload.level),
          daysPerWeek: payload.daysPerWeekNumber,
          equipmentTags: payload.equipment
        },
        token
      );
      setProfile(response.profile);
      setSuccess("Perfil concluído. Seus treinos foram liberados conforme o público definido.");
      await loadUserData();
    } catch (completeError) {
      const message = completeError instanceof ApiError ? completeError.message : null;
      setError(message ?? "Não foi possível concluir o onboarding.");
    } finally {
      setCompletingOnboarding(false);
    }
  }

  async function handleExerciseProgressChange(input: {
    sessionId?: string | null;
    exerciseId: string;
    prescriptionId: string;
    completed: boolean;
    weightUsed: number;
    repsCompleted: number;
    sets: number;
    durationSeconds?: number;
    distanceMeters?: number;
    roundsCompleted?: number;
    perceivedExertion?: number;
    notes?: string;
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
    uiSounds.submit();
    try {
      let arquivos = assessmentForm.formulario_avaliacao_fisica.fotos_analise_visual.arquivos;
      for (const [key] of assessmentPhotoFields) {
        const file = assessmentPhotoFiles[key];
        if (!file) continue;
        const uploadData = new FormData();
        uploadData.append("file", file);
        const uploaded = await apiUpload<UploadResponse>("/user/uploads?group=images", uploadData, token);
        uiSounds.screenshot();
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

  async function refreshStudentCart() {
    if (!token) return null;
    const response = await apiGet<{ cart: CartRow }>("/student/cart", token);
    setStudentCart(response.cart);
    setCartShippingMethod(response.cart.shippingMethod);
    if (response.cart.couponCode) {
      setCartCouponInput(response.cart.couponCode);
    }
    return response.cart;
  }

  async function handleAddToCart(productId: string) {
    setPurchasingProductId(productId);
    setError(null);
    setSuccess(null);
    try {
      const product = studentProducts.find((item) => item.id === productId);
      const inCart = studentCart?.items.find((item) => item.productId === productId);
      const nextQty = (inCart?.quantity ?? 0) + 1;
      if (product?.stock != null && nextQty > product.stock) {
        flashStockLimit();
        return;
      }

      const response = await apiPost<{ cart: CartRow }>("/student/cart/items", { productId, quantity: 1 }, token);
      setStudentCart(response.cart);
      setCartShippingMethod(response.cart.shippingMethod);
      goToSection("cart");
      if (product?.stock != null && nextQty >= product.stock) {
        flashStockLimit();
      } else {
        setSuccess("Adicionado ao carrinho.");
      }
    } catch (cartError) {
      const message = cartError instanceof ApiError ? cartError.message : "Não foi possível adicionar ao carrinho.";
      if (/estoque|stock|máximo disponível/i.test(message)) {
        flashStockLimit();
      } else {
        flashError(message);
      }
    } finally {
      setPurchasingProductId(null);
    }
  }

  async function handleCartQuantity(productId: string, quantity: number) {
    if (cartQtyBusyId) return;
    const item = studentCart?.items.find((entry) => entry.productId === productId);
    const nextQty = Math.max(0, quantity);
    if (item?.product.stock != null && nextQty > item.product.stock) {
      flashStockLimit();
      return;
    }

    setCartQtyBusyId(productId);
    setError(null);
    setSuccess(null);
    try {
      await apiPut<{ cart: CartRow }>(
        `/student/cart/items/${productId}`,
        { quantity: nextQty },
        token
      );
      await refreshStudentCart();
      if (item?.product.stock != null && nextQty >= item.product.stock) {
        flashStockLimit();
      }
    } catch (qtyError) {
      const message = qtyError instanceof ApiError ? qtyError.message : "Não foi possível atualizar a quantidade.";
      if (/estoque|stock|máximo disponível/i.test(message)) {
        flashStockLimit();
      } else {
        flashError(message);
      }
    } finally {
      setCartQtyBusyId(null);
    }
  }

  async function handleApplyCartCoupon() {
    setError(null);
    try {
      await apiPut<{ cart: CartRow }>(
        "/student/cart/coupon",
        { code: cartCouponInput.trim() || null },
        token
      );
      await refreshStudentCart();
      setSuccess(cartCouponInput.trim() ? "Cupom aplicado." : "Cupom removido.");
    } catch (couponError) {
      flashError(couponError instanceof ApiError ? couponError.message : "Cupom inválido.");
    }
  }

  async function handleCartCheckout() {
    setCartCheckingOut(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiPost<{ order: OrderRow }>("/student/cart/checkout", {
        shippingAddress: cartAddress,
        billingType: "UNDEFINED"
      }, token);
      setStudentOrders((current) => [response.order, ...current]);
      setStudentCart({
        id: studentCart?.id ?? "empty",
        items: [],
        subtotalInCents: 0,
        discountInCents: 0,
        shippingInCents: 0,
        shippingMethod: "PICKUP",
        amountInCents: 0,
        itemCount: 0,
        couponCode: null
      });
      setCartCouponInput("");
      setCartAddress("");
      if (response.order.paymentUrl) {
        window.location.href = response.order.paymentUrl;
        return;
      }
      setSuccess("Pedido criado. Aguardando confirmação de pagamento.");
      goToSection("orders");
    } catch (checkoutError) {
      flashError(checkoutError instanceof ApiError ? checkoutError.message : "Não foi possível finalizar o pedido.");
    } finally {
      setCartCheckingOut(false);
    }
  }

  async function handleBuyProduct(productId: string) {
    setPurchasingProductId(productId);
    setError(null);
    try {
      const response = await apiPost<{ purchase: PurchaseRow }>("/student/purchases", { productId }, token);
      const productName = studentProducts.find((item) => item.id === productId)?.name;
      setStudentPurchases([response.purchase, ...studentPurchases]);
      setStudentProducts((current) =>
        current.map((item) => (item.id === productId ? { ...item, purchasedByMe: true } : item))
      );
      setPurchaseConfirmId(productId);
      emitSystemEvent(
        "COMPRA_CONCLUIDA",
        {
          productId,
          purchaseId: response.purchase.id,
          productName,
          source: "produtos"
        },
        { navigateTo: response.purchase.paymentUrl ? null : "purchases" }
      );

      if (response.purchase.paymentUrl) {
        window.location.href = response.purchase.paymentUrl;
        return;
      }

      if (purchaseConfirmTimer.current) {
        window.clearTimeout(purchaseConfirmTimer.current);
      }
      purchaseConfirmTimer.current = window.setTimeout(() => {
        setPurchaseConfirmId(null);
        purchaseConfirmTimer.current = null;
      }, 2500);
    } catch (buyError) {
      setError(buyError instanceof ApiError ? buyError.message : "Não foi possível registrar o pedido.");
    } finally {
      setPurchasingProductId(null);
    }
  }

  async function handlePayPurchase(purchaseId: string) {
    setError(null);
    setPurchasingProductId(purchaseId);
    try {
      const existing = studentPurchases.find((item) => item.id === purchaseId);
      if (existing?.paymentUrl) {
        openAsaasCheckout(existing.paymentUrl);
        return;
      }
      const response = await apiPost<{ purchase: PurchaseRow; alreadyPaid?: boolean }>(
        `/student/purchases/${purchaseId}/checkout`,
        {},
        token
      );
      setStudentPurchases((current) =>
        current.map((item) => (item.id === purchaseId ? response.purchase : item))
      );
      if (response.alreadyPaid) {
        await loadUserData();
        return;
      }
      if (response.purchase.paymentUrl) {
        openAsaasCheckout(response.purchase.paymentUrl);
        return;
      }
      setError("Link de pagamento indisponível. Aguarde a confirmação da academia.");
    } catch (payError) {
      setError(payError instanceof ApiError ? payError.message : "Não foi possível abrir o pagamento.");
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
      if (favorited) {
        uiSounds.itemSelect();
      } else {
        uiSounds.itemDeselect();
      }
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
      emitSystemEvent("AVALIACAO_SUBMETIDA", {
        programId,
        assignmentId,
        score: finalScore,
        programTitle: program?.programTitle,
        source: "avaliar"
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
  const hasAdminEnrollment = profile?.enrollmentStatus === "ACTIVE";
  /** Liberação: membership/enrollment ativos, ou admin em modo preview blindado. */
  const hasStudentAreaAccess = hasActiveMembership || hasAdminEnrollment || isAdminPreview;

  async function handleExitAdminPreview() {
    if (previewExiting) return;
    setPreviewExiting(true);
    setError(null);
    try {
      await exitAdminPreview();
    } catch (exitError) {
      setError(exitError instanceof ApiError ? exitError.message : "Não foi possível voltar ao painel admin.");
      setPreviewExiting(false);
    }
  }

  const adminPreviewBanner = isAdminPreview ? (
    <div className="admin-preview-banner" role="status">
      <div className="admin-preview-banner-copy">
        <Eye size={16} />
        <span>
          <strong>Modo preview</strong>
          · você está vendo o app como atleta com a sua conta
        </span>
      </div>
      <button
        type="button"
        className="admin-preview-banner-action"
        disabled={previewExiting}
        onClick={() => {
          void handleExitAdminPreview();
        }}
      >
        {previewExiting ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
        Voltar ao admin
      </button>
    </div>
  ) : null;
  const needsOnboarding = Boolean(profile && (!profile.gender || !profile.objective || !profile.level));
  const currentCheckoutPayment = checkoutPayment ?? pendingPayment;
  const lockedFeatures = [
    {
      icon: Dumbbell,
      title: trainingCopy.todayWorkout,
      text: "Sessões, exercícios, séries, repetições e descanso."
    },
    {
      icon: Ruler,
      title: trainingCopy.physicalAssessment,
      text: "Medidas, histórico corporal e acompanhamento de evolução."
    },
    {
      icon: CalendarPlus,
      title: "Eventos",
      text: "Inscrições em aulas, desafios e encontros da comunidade."
    },
    {
      icon: Headphones,
      title: "Atendimento",
      text: "Abertura de chamados para suporte de treino, pagamento e acesso."
    },
    {
      icon: Bot,
      title: "Agente de Treino IA",
      text: "Geração de planos personalizados conforme objetivo e nível."
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
  const selectedProgramWorkout = selectedWorkoutProgramId
    ? publishedWorkouts.find((item) => item.programId === selectedWorkoutProgramId) ?? null
    : null;
  /** Só abre a ficha quando o aluno escolhe um treino na lista. */
  const workoutSheet = selectedProgramWorkout;
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
    const text = `Treino dia ${session.dayNumber} concluído em ${new Date(session.startedAt).toLocaleString("pt-BR")} ${brand.shareSuffix}.`;

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
    const remoteUnread = notifications.filter((notification) => !notification.readAt).length;
    const syncUnread = syncNotifications.filter((notification) => !notification.read).length;
    return remoteUnread + syncUnread;
  }, [notifications, syncNotifications]);

  const mergedNotifications = useMemo(() => {
    const syncItems = syncNotifications.map((item) => ({
      id: item.id,
      kind: "sync" as const,
      title: item.title,
      message: item.message,
      publishedAt: item.publishedAt,
      origin: item.origin,
      targets: item.targets,
      read: item.read
    }));
    const remoteItems = notifications.map((item) => {
      const section = item.targetSection as PanelDestination | null | undefined;
      const targetsFromSection = section ? ([section] as PanelDestination[]) : [];
      const targetsFromType =
        item.type === "PRODUCT"
          ? (["products"] as PanelDestination[])
          :                         item.type === "WORKOUT_PROGRAM" || item.type === "WORKOUT"
                          ? (["training"] as PanelDestination[])
                          : item.type === "ACHIEVEMENT"
                            ? (["profile"] as PanelDestination[])
                            : item.type === "LOCATION"
              ? (["locations"] as PanelDestination[])
              : item.type === "SUPPORT"
                ? (["support"] as PanelDestination[])
                :         item.type === "EVENT"
                  ? (["events"] as PanelDestination[])
                  : item.type === "MUSIC_ALBUM" || item.type === "MUSIC_TRACK"
                    ? (["play"] as PanelDestination[])
                    : [];
      return {
        id: item.id,
        kind: "remote" as const,
        type: item.type,
        title: item.title,
        message: item.message,
        publishedAt: item.publishedAt,
        origin: null as string | null,
        targets: targetsFromSection.length ? targetsFromSection : targetsFromType,
        read: Boolean(item.readAt)
      };
    });
    return [...syncItems, ...remoteItems]
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 20);
  }, [syncNotifications, notifications]);

  if (!accessReady) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink p-6 text-sand">
        <div className="pointer-events-none absolute inset-0 [background-image:var(--shell-bg)]" aria-hidden="true" />
        <div className="relative grid animate-fade-up gap-4 rounded-3xl border border-[color:var(--app-border)] bg-ink-elev/70 px-8 py-10 text-center shadow-panel backdrop-blur-sm">
          <Loader2 className="mx-auto animate-spin text-brand-gold" size={36} />
          <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-gold">{brand.areaEyebrow}</span>
          <p className="m-0 text-sand-muted">Verificando sua liberação de acesso...</p>
        </div>
      </main>
    );
  }

  if (needsOnboarding) {
    return (
      <main className="auth-layout">
        {adminPreviewBanner}
        <section className="auth-panel">
          <span className="eyebrow">Personalização</span>
          <h1>Complete seu perfil de treino</h1>
          <p>Faltam alguns dados para liberar os treinos certos para o seu perfil.</p>
          <WorkoutOnboarding
            mode="complete"
            submitting={completingOnboarding}
            error={error}
            requirePassword={false}
            initialValues={{
              name: profile?.name ?? "",
              email: profile?.email ?? "",
              phone: profile?.phone ?? "",
              gender: profile?.gender ?? undefined,
              birthYear: profile?.birthDate ? String(new Date(profile.birthDate).getUTCFullYear()) : "",
              goal: "hypertrophy",
              level: "beginner",
              daysPerWeek: profile?.daysPerWeek ? (String(profile.daysPerWeek) as "3" | "4" | "5" | "6") : "4",
              equipment: (profile?.equipmentTags?.length
                ? profile.equipmentTags
                : ["gym"]) as Array<"gym" | "dumbbells" | "bodyweight" | "bands">
            }}
            onSubmit={handleCompleteOnboarding}
          />
          {success && <div className="success-box">{success}</div>}
          <button className="link-button" type="button" onClick={onLogout}>
            Sair
          </button>
        </section>
      </main>
    );
  }

  if (!hasStudentAreaAccess) {
    return (
      <div className="admin-preview-shell-wrap">
        {adminPreviewBanner}
      <main className="workspace-shell grid min-h-screen grid-cols-[280px_minmax(0,1fr)] bg-ink text-sand max-[980px]:grid-cols-1">
        <aside
          className="workspace-sidebar sticky top-0 grid min-h-0 content-start gap-[22px] self-start border-r border-[color:var(--app-border)] bg-gradient-to-b from-[var(--app-fill)] to-transparent bg-ink-soft px-[18px] py-[22px] min-[981px]:min-h-screen"
          aria-label={brand.menuAria}
        >
          <div className="workspace-sidebar-brand flex min-w-0 items-center gap-3 border-b border-[color:var(--app-border)] pb-[18px]">
            <img
              className="h-[42px] w-[42px] shrink-0 rounded-lg bg-brand-gold/10"
              src={assetUrl("assets/app-treino-mark.svg")}
              alt=""
              aria-hidden="true"
            />
            <div className="grid min-w-0 gap-0.5">
              <strong className="text-base text-sand">{brand.athlete}</strong>
              <span className="truncate text-[13px] font-extrabold text-sand-faint">{profile?.name ?? brand.name}</span>
            </div>
          </div>
          <nav className="workspace-nav grid gap-1.5">
            <button className={studentSection === "subscription" ? "active" : ""} onClick={() => goToSection("subscription")}>
              <CreditCard size={18} />Assinatura
            </button>
            <button className={studentSection === "locked" ? "active" : ""} onClick={() => goToSection("locked")}>
              <LockKeyhole size={18} />Conteúdos
            </button>
            <button className={studentSection === "settings" ? "active" : ""} onClick={() => goToSection("settings")}>
              <Settings size={18} />Configurações
            </button>
          </nav>
          <button
            className="workspace-logout mt-3 flex w-full min-h-[44px] items-center justify-start gap-2.5 rounded-lg border border-brand-ember/20 bg-brand-ember/10 px-3 text-left font-extrabold transition hover:border-brand-ember/35 hover:bg-brand-ember/15"
            onClick={() => {
              uiSounds.toggleOff();
              onLogout();
            }}
          >
            <LogOut size={18} />
            Sair
          </button>
        </aside>
        <section className="workspace-content min-w-0 p-[clamp(28px,4vw,48px)]">
        <section className="dashboard-heading grid items-start gap-3">
          <span className="eyebrow w-fit">{brand.areaEyebrow}</span>
          <h1 className="font-display m-0 text-[clamp(38px,5.4vw,72px)] leading-[0.95] tracking-tight text-sand">
            {profile?.name ?? "Comece a treinar"}
          </h1>
        </section>
        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}
        {(studentSection === "subscription" || !["subscription", "locked", "settings"].includes(studentSection)) && <section className="subscription-flow">
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
                      onChange={() => {
                        uiSounds.radioSelect();
                        setCheckoutDraft((current) => ({
                          ...current,
                          planCode: plan.code
                        }));
                      }}
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
          <LockedOverlay onCheckout={() => goToSection("subscription")} />
          <div className="section-heading locked-heading">
            <span className="eyebrow">Prévia do app</span>
            <h2>Modalidades disponíveis para o seu perfil</h2>
            <p className="locked-heading-copy">
              Conteúdo filtrado pelo seu sexo cadastrado. Assine para liberar os treinos.
            </p>
          </div>
          {lockedPreviewModalities.length > 0 ? (
            <div className="student-modality-list locked-modality-preview">
              {lockedPreviewModalities.map((item) => (
                <button
                  className="student-modality-card is-locked"
                  key={item.id}
                  type="button"
                  onClick={() => {
                    uiSounds.blocked();
                    goToSection("subscription");
                  }}
                >
                  <span className={`student-modality-media ${item.imageUrl ? "with-image" : ""}`}>
                    {item.imageUrl ? (
                      <MediaImg src={item.imageUrl} width={480} alt="" aria-hidden="true" />
                    ) : (
                      <Dumbbell size={26} />
                    )}
                    <span className="student-modality-lock-badge" aria-hidden="true">
                      <LockKeyhole size={16} />
                    </span>
                  </span>
                  <span className="student-modality-copy">
                    <strong>{item.name}</strong>
                    <small>{item.description?.trim() || "Bloqueado · finalize a assinatura"}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
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
          )}
        </section>}
        {studentSection === "settings" && (
          <StudentSettingsPanel onBack={() => goToSection("subscription")} />
        )}
        </section>
      </main>
      </div>
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
    <main
      className={`student-app-shell${hideStudentChrome ? " workout-immersive" : ""}${
        musicQueueLength ? " has-music-dock" : ""
      }${studentSection === "play" ? " is-play" : ""}${studentSection === "activity" ? " is-activity" : ""}${
        studentSection === "feed" || studentSection === "home" ? " is-feed" : ""
      }`}
    >
      {adminPreviewBanner}
      {!hideStudentChrome && (
      <section className="student-app-header">
        <div className="student-header-brand">
          <button
            type="button"
            className="student-brand-mark"
            aria-label={brand.name}
            onClick={() => openTrainingCatalog()}
          >
            <span>TS</span>
          </button>
          <button type="button" className="student-brand-copy" onClick={() => openTrainingCatalog()}>
            <strong className="student-brand-name">{brand.name}</strong>
            <span className="student-brand-athlete">
              {profile?.name ?? brand.athlete} · {brand.codeLabel} {studentCode}
            </span>
          </button>
        </div>

        <div className="student-header-actions">
          {(studentSection === "feed" || studentSection === "home") && (
            <>
              <button
                type="button"
                className="student-icon-button"
                aria-label="Criar"
                onClick={() => {
                  uiSounds.popupOpen();
                  useFeedChromeStore.getState().toggleCreate();
                }}
              >
                <SquarePlus size={22} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="student-icon-button"
                aria-label="Pesquisar no Feed"
                onClick={() => {
                  uiSounds.popupOpen();
                  useFeedChromeStore.getState().requestSearch();
                }}
              >
                <Search size={20} strokeWidth={2.2} />
              </button>
            </>
          )}
          <button className="student-streak-button" aria-label={`Ofensiva de ${currentStreak} dias`} onClick={() => {
            uiSounds.popupOpen();
            setStreakCalendarOpen(true);
          }}>
            <Flame size={18} />
            <span>Ofensiva</span>
            <strong>{currentStreak}</strong>
          </button>
          {publicConfig["module_products"] !== "false" && (studentCart?.itemCount ?? 0) > 0 && (
            <div className="student-cart-wrap">
              <button
                type="button"
                className={[
                  "student-icon-button",
                  "student-cart-button",
                  "has-items",
                  studentSection === "cart" ? "is-active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`Carrinho com ${studentCart!.itemCount} ${studentCart!.itemCount === 1 ? "item" : "itens"}`}
                aria-current={studentSection === "cart" ? "page" : undefined}
                onClick={() => {
                  setNotificationsOpen(false);
                  goToSection("cart");
                }}
              >
                <ShoppingCart size={22} strokeWidth={2.25} />
                <span className="student-notification-badge student-cart-badge">
                  {studentCart!.itemCount > 99 ? "99+" : studentCart!.itemCount}
                </span>
              </button>
            </div>
          )}
          <div className="student-notification-wrap">
            <button className="student-icon-button" aria-label="Notificações" onClick={() => setNotificationsOpen((open) => {
              if (open) uiSounds.popupClose();
              else {
                uiSounds.popupOpen();
                uiSounds.popupNotify();
              }
              setSocialMenuOpen(false);
              return !open;
            })}>
              <Bell size={20} />
              {unreadNotificationsCount > 0 && <span className="student-notification-badge">{unreadNotificationsCount}</span>}
            </button>
            {notificationsOpen && (
              <section className="student-notification-panel" aria-label="Notificações publicadas">
                <header className="student-notification-panel-head">
                  <div>
                    <strong>Notificações</strong>
                    <span>{mergedNotifications.length}</span>
                  </div>
                  <button
                    type="button"
                    className="student-notification-close"
                    aria-label="Fechar notificações"
                    onClick={() => {
                      uiSounds.popupClose();
                      setNotificationsOpen(false);
                    }}
                  >
                    <X size={18} strokeWidth={2.75} />
                  </button>
                </header>
                <div className="student-notification-panel-list">
                  {mergedNotifications.length > 0 ? (
                    mergedNotifications.map((notification) => {
                      const targetLabels: Record<string, string> = {
                        payments: "Pagamentos",
                        membership: "Matrículas",
                        status: "Frequência",
                        locations: "Localidades",
                        support: "Atendimento",
                        ratings: trainingCopy.favoritesAndRatings,
                        training: trainingCopy.workout,
                        assessments: trainingCopy.physicalAssessment,
                        products: "Vitrine",
                        purchases: "Minhas compras",
                        events: "Eventos",
                        play: "Play",
                        profile: brand.athleteProfile
                      };
                      const primaryTarget = notification.targets[0];
                      const openLabel = primaryTarget
                        ? targetLabels[primaryTarget] ?? primaryTarget
                        : null;

                      return (
                        <article
                          key={notification.id}
                          className={[
                            notification.kind === "sync" ? "student-sync-notification" : "",
                            !notification.read ? "student-notification-unread" : ""
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined}
                        >
                          <strong>{notification.title}</strong>
                          {notification.origin && <em className="student-sync-origin">{notification.origin}</em>}
                          <span>{notification.message}</span>
                          <small>{new Date(notification.publishedAt).toLocaleString("pt-BR")}</small>
                          {primaryTarget && openLabel && (
                            <button
                              type="button"
                              className="student-sync-open"
                              onClick={() => {
                                if (notification.kind === "sync") {
                                  markNotificationRead(notification.id);
                                }
                                setStudentSection(
                                  primaryTarget === "home" ? "feed" : (primaryTarget as StudentPanelSection)
                                );
                                setNotificationsOpen(false);
                              }}
                            >
                              Abrir {openLabel}
                            </button>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <article>
                      <strong>Nenhuma publicação</strong>
                      <span>Novidades publicadas pelo admin e sincronizações entre módulos aparecerão aqui.</span>
                    </article>
                  )}
                </div>
              </section>
            )}
          </div>
          <div className="student-avatar-menu-wrap">
            <button
              type="button"
              className="student-avatar"
              aria-label={
                studentSection === "feed" || studentSection === "home" ? "Menu social" : "Abrir perfil"
              }
              aria-expanded={socialMenuOpen}
              onClick={() => {
                if (studentSection === "feed" || studentSection === "home") {
                  setNotificationsOpen(false);
                  setSocialMenuOpen((open) => {
                    if (open) uiSounds.popupClose();
                    else uiSounds.popupOpen();
                    return !open;
                  });
                  return;
                }
                goToSection("profile");
              }}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                <UserRound size={28} />
              )}
            </button>
            {socialMenuOpen && (studentSection === "feed" || studentSection === "home") && (
              <section className="student-social-menu" aria-label="Menu da rede social">
                {(
                  [
                    { label: "Feed", icon: Home, action: () => goToSection("feed") },
                    { label: "Treino", icon: Dumbbell, action: () => openTrainingCatalog() },
                    { label: "Corrida", icon: CorridaNavIcon, action: () => openCorrida() },
                    { label: "Desafios", icon: Trophy, action: () => goToSection("club") },
                    { label: "Menu completo", icon: Menu, action: () => goToSection("menu") },
                    { label: "Meu Perfil", icon: UserRound, action: () => goToSection("profile") },
                    { label: "Clipes", icon: Video, action: () => goToSection("reels") },
                    { label: "Ao vivo", icon: Radio, action: () => goToSection("live") },
                    { label: "Mensagens", icon: MessageCircle, action: () => goToSection("messages") },
                    { label: "Chat global", icon: UsersRound, action: () => goToSection("chat") },
                    { label: "Pedidos", icon: UserPlus, action: () => goToSection("requests") }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="student-social-menu-item"
                    onClick={() => {
                      setSocialMenuOpen(false);
                      uiSounds.itemSelect();
                      item.action();
                    }}
                  >
                    <item.icon size={18} strokeWidth={2} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="student-social-menu-item is-danger"
                  onClick={() => {
                    setSocialMenuOpen(false);
                    uiSounds.toggleOff();
                    onLogout();
                  }}
                >
                  <LogOut size={18} strokeWidth={2} />
                  <span>Sair</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </section>
      )}

      <div className="student-app-scroll">
        {error && (
          <div
            className={`error-box${errorTone === "warning" ? " is-warning" : ""}`}
            key={`error-${errorTick}`}
            role="alert"
          >
            {error}
          </div>
        )}
        {success && (
          <div className="success-box" key={`success-${success}`} role="status">
            {success}
          </div>
        )}

        {(studentSection === "home" || studentSection === "feed") && token && (
          <StudentFeedSection token={token} onNavigate={(section) => goToSection(section)} />
        )}

        {studentSection === "reels" && token && <StudentReelsSection token={token} />}
        {studentSection === "live" && token && <StudentLiveSection token={token} />}
        {studentSection === "messages" && token && <StudentMessagesSection token={token} />}
        {studentSection === "chat" && token && <StudentChatSection token={token} />}
        {studentSection === "requests" && token && <StudentRequestsSection token={token} />}

        {studentSection === "club" && token && <StudentClubSection token={token} />}

        {studentSection === "activity" && token && (
          <StudentActivitySection
            token={token}
            preferredSport="RUN"
            preferredSportKey={corridaOpenKey}
            athleteGender={profile?.gender}
            onOpenPlay={() => goToSection("play")}
            onPublished={() => goToSection("feed")}
          />
        )}

        {studentSection === "training" && (
          <>
            {!selectedWorkoutModality && (
              <section className="student-hero-card">
                <span>{todayWorkout ? "Pronto para treinar" : "Seu treino"}</span>
                <div className="student-workout-summary">
                  <div className="student-card-icon">
                    <Dumbbell size={26} />
                  </div>
                  <div>
                    <h2>
                      {todayWorkout
                        ? `${trainingCopy.todayWorkout} · ${sessionLabelFromBlock(todayWorkout.block.identifier ?? todayWorkout.block.title)}`
                        : trainingCopy.todayWorkout}
                    </h2>
                    <p>
                      {todayWorkout
                        ? (cmsMusclesToday.join(", ") || todayWorkout.programTitle || trainingCopy.sessionFocusFallback)
                        : trainingCopy.noWorkoutsHint}
                    </p>
                  </div>
                  <strong>{trainingCopy.sessionsDone(workoutsCompleted, totalWorkoutDays)}</strong>
                </div>
                <div className="student-progress-track">
                  <span style={{ width: `${workoutProgressPercent}%` }} />
                </div>
                {cmsExercisesToday.length > 0 && (
                  <ol className="student-exercise-preview">
                    {cmsExercisesToday.slice(0, 3).map((exercise, index) => (
                      <li key={exercise.id}>{index + 1}- {exercise.title}</li>
                    ))}
                    {cmsExercisesToday.length > 3 && <li>+{cmsExercisesToday.length - 3} exercícios</li>}
                  </ol>
                )}
                <div className="student-hero-actions">
                  {todayWorkout ? (
                    <>
                      <button
                        className="student-green-button"
                        onClick={() => openTodaySession()}
                      >
                        {trainingCopy.continueWorkout}
                      </button>
                      <button
                        className="student-outline-button"
                        onClick={() => {
                          setSelectedWorkoutModality(todayWorkout.modality ?? "Hipertrofia");
                          setSelectedWorkoutProgramId(null);
                        }}
                      >
                        {trainingCopy.browseWorkouts}
                      </button>
                    </>
                  ) : (
                    publishedWorkouts.length === 0 ? (
                      <button className="student-green-button" type="button" disabled>
                        {trainingCopy.browseWorkouts}
                      </button>
                    ) : null
                  )}
                  {publicConfig["module_qr"] !== "false" && publicConfig["qr_checkin_enabled"] !== "false" && (
                    <button
                      className="student-outline-button"
                      onClick={() => setShowStudentQr((value) => {
                        if (value) uiSounds.popupClose();
                        else uiSounds.popupOpen();
                        return !value;
                      })}
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
                          publicConfig["qr_checkin_url"] || "https://edersonprogramador.com/checkin"
                        )}`}
                        alt="QR Code de check-in"
                      />
                    </div>
                    <span>Mostre este código na recepção para registrar sua presença.</span>
                    <button
                      className="student-green-button"
                      type="button"
                      onClick={() => {
                        emitSystemEvent(
                          "CHECKIN_REALIZADO",
                          {
                            checkInUrl: publicConfig["qr_checkin_url"] || "https://edersonprogramador.com/checkin",
                            locationId: profile?.locationId ?? studentLocations[0]?.id,
                            locationName: studentLocations.find((item) => item.id === profile?.locationId)?.name
                              ?? studentLocations[0]?.name,
                            source: "qr_code"
                          },
                          { navigateTo: "status" }
                        );
                        setShowStudentQr(false);
                      }}
                    >
                      Confirmar check-in
                    </button>
                  </div>
                )}
              </section>
            )}
          <section className="student-sheet">
            {!selectedWorkoutModality && (
              <>
                <div className="student-sheet-heading">
                  <span>{trainingCopy.workout}</span>
                  <h1>{trainingCopy.modalities}</h1>
                  <p>{publishedModalities.length > 0 ? trainingCopy.pickModality : trainingCopy.noWorkoutsHint}</p>
                </div>

                {publishedModalities.length > 0 ? (
                  <div className="student-modality-list">
                    {publishedModalities.map((item) => (
                      <button
                        className="student-modality-card"
                        key={item.modality}
                        type="button"
                        onClick={() => {
                          setSelectedWorkoutModality(item.modality);
                          setSelectedWorkoutProgramId(null);
                        }}
                      >
                        <span className={`student-modality-media ${item.imageUrl ? "with-image" : ""}`}>
                          {item.imageUrl ? (
                            <MediaImg src={item.imageUrl} width={480} alt="" aria-hidden="true" />
                          ) : (
                            <Dumbbell size={26} />
                          )}
                        </span>
                        <span className="student-modality-copy">
                          <strong>{item.modality}</strong>
                          <small>{trainingCopy.workoutsCount(item.count)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <article className="student-training-card">
                    <div className="student-card-icon">
                      <Dumbbell size={24} />
                    </div>
                    <div className="student-card-body">
                      <h2>{trainingCopy.noWorkouts}</h2>
                      <p>{trainingCopy.noWorkoutsHint}</p>
                    </div>
                  </article>
                )}
              </>
            )}

            {selectedWorkoutModality && !workoutSheet && (
              <>
                <div className="student-sheet-heading">
                  <button
                    className="student-training-back-button"
                    type="button"
                    onClick={() => {
                      setSelectedWorkoutModality(null);
                      setSelectedWorkoutProgramId(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                    {trainingCopy.backToModalities}
                  </button>
                  <span>{selectedWorkoutModality}</span>
                  <h1>{trainingCopy.modalityWorkoutsHeading}</h1>
                  <p>{trainingCopy.pickWorkout}</p>
                </div>

                {modalityWorkouts.length > 0 ? (
                  <AnimatedList className="student-program-list">
                    {modalityWorkouts.map((programWorkout) => {
                      const done = programWorkout.completedWorkouts ?? 0;
                      const total = programWorkout.totalWorkouts ?? programWorkout.totalDays;
                      const isToday = todayWorkout?.programId === programWorkout.programId;
                      const cycleCompleted = Boolean(programWorkout.cycleCompleted);
                      const completionCount = programWorkout.completionCount ?? 0;
                      const showCompletedSeal = cycleCompleted || completionCount > 0;
                      const repeating = repeatingProgramId === programWorkout.programId;
                      const focus =
                        programWorkout.block?.focus ||
                        programWorkout.sequence?.[0]?.block.focus ||
                        trainingCopy.sessionFocusFallback;
                      return (
                        <article className="student-program-card" key={programWorkout.programId}>
                          <div className={`student-training-card${isToday ? " active" : ""}${cycleCompleted ? " completed" : ""}`}>
                            {showCompletedSeal ? (
                              <span className="student-completed-seal">
                                <Trophy size={12} />
                                {trainingCopy.completedBadge}
                                {completionCount > 1 ? ` · ${completionCount}x` : ""}
                              </span>
                            ) : null}
                            {programWorkout.modalityImageUrl ? (
                              <MediaImg
                                className="student-card-image"
                                src={programWorkout.modalityImageUrl}
                                width={640}
                                alt=""
                              />
                            ) : (
                              <div className="student-card-icon">
                                <Dumbbell size={24} />
                              </div>
                            )}
                            <div
                              className="student-card-body"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedWorkoutProgramId(programWorkout.programId);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedWorkoutProgramId(programWorkout.programId);
                                }
                              }}
                            >
                              <h2>{programWorkout.programTitle}</h2>
                              <p>
                                {focus} · {trainingCopy.sessionsDone(done, total)}
                                {cycleCompleted
                                  ? ` · ${trainingCopy.completedBadge}`
                                  : completionCount > 0
                                    ? ` · ${trainingCopy.completedBadge}${completionCount > 1 ? ` ${completionCount}x` : ""}`
                                    : isToday
                                      ? ` · ${trainingCopy.todayWorkout}`
                                      : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={repeating}
                              onClick={() => {
                                if (cycleCompleted) {
                                  void handleRepeatWorkoutProgram(programWorkout);
                                  return;
                                }
                                setSelectedWorkoutProgramId(programWorkout.programId);
                              }}
                            >
                              {repeating
                                ? "Abrindo..."
                                : cycleCompleted
                                  ? trainingCopy.repeatWorkout
                                  : trainingCopy.openWorkout}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </AnimatedList>
                ) : (
                  <article className="student-training-card">
                    <div className="student-card-icon">
                      <Dumbbell size={24} />
                    </div>
                    <div className="student-card-body">
                      <h2>{trainingCopy.noWorkouts}</h2>
                      <p>{trainingCopy.noWorkoutsHint}</p>
                    </div>
                  </article>
                )}
              </>
            )}

            {workoutSheet && workoutSequence.length > 0 ? (
              <article className="student-training-sheet-card">
                <header className="student-training-sheet-header">
                  <button
                    className="student-training-back-button"
                    onClick={() => {
                      setSelectedWorkoutProgramId(null);
                    }}
                  >
                    <ChevronLeft size={18} />
                    {trainingCopy.backToWorkouts}
                  </button>
                  <span>{trainingCopy.workout}</span>
                  <h1>{workoutSheet.programTitle}</h1>
                  <p>{workoutSheet.modality ?? trainingCopy.modality}</p>
                  {workoutSheet.cycleCompleted ? (
                    <span className="student-completed-seal student-completed-seal-inline">
                      <Trophy size={12} />
                      {trainingCopy.completedBadge}
                      {(workoutSheet.completionCount ?? 0) > 1 ? ` · ${workoutSheet.completionCount}x` : ""}
                    </span>
                  ) : null}
                  {workoutSheet.cycleCompleted ? (
                    <button
                      type="button"
                      className="student-repeat-workout-button"
                      disabled={repeatingProgramId === workoutSheet.programId}
                      onClick={() => void handleRepeatWorkoutProgram(workoutSheet)}
                    >
                      {repeatingProgramId === workoutSheet.programId ? "Abrindo..." : trainingCopy.repeatWorkout}
                    </button>
                  ) : null}
                  {workoutSheet.favoritedByMe ? (
                    <span className="student-favorite-badge">
                      <Star size={15} fill="currentColor" />
                      Favoritado
                    </span>
                  ) : (
                    <div className="student-header-rating">
                      <span>{trainingCopy.rateWorkout}</span>
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
                    <small>{trainingCopy.todayWorkout}</small>
                    <strong>
                      {sessionLabelFromBlock(
                        currentSequenceWorkout?.block.identifier ??
                          currentSequenceWorkout?.block.title ??
                          workoutSheet.block.identifier ??
                          workoutSheet.block.title
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Foco</small>
                    <strong>
                      {currentSequenceWorkout?.block.focus ?? workoutSheet.block.focus ?? trainingCopy.sessionFocusFallback}
                    </strong>
                  </span>
                  <span>
                    <small>{trainingCopy.sessions}</small>
                    <strong>{trainingCopy.sessionsDone(sheetCompleted, sheetTotal)}</strong>
                    <Settings size={22} />
                  </span>
                </div>
                <div className="student-progress-track">
                  <span style={{ width: `${sheetProgressPercent}%` }} />
                </div>
                <AnimatedList className="student-program-list">
                  {workoutSequence.map((programWorkout) => {
                    const programMuscles = Array.from(
                      new Set(programWorkout.block.exercises.flatMap((exercise) => exercise.targetMuscles ?? []))
                    );
                    const cycleCompleted = Boolean(workoutSheet.cycleCompleted);
                    const isCurrent = !cycleCompleted && programWorkout.dayNumber === workoutSheet.dayNumber;
                    const blockLabel = sessionLabelFromBlock(
                      programWorkout.block.identifier ?? programWorkout.block.title
                    );
                    const blockFocus =
                      programWorkout.block.focus || programMuscles.join(", ") || trainingCopy.sessionFocusFallback;
                    const cardImage = workoutSheet.modalityImageUrl ?? null;

                    return (
                      <article className="student-program-card" key={`${programWorkout.programId}-${programWorkout.dayNumber}`}>
                        <div className={`student-training-card${isCurrent ? " active" : ""}${cycleCompleted ? " completed" : ""}`}>
                          {cycleCompleted ? (
                            <span className="student-completed-seal">
                              <Trophy size={12} />
                              {trainingCopy.completedBadge}
                            </span>
                          ) : null}
                          {cardImage ? (
                            <MediaImg className="student-card-image" src={cardImage} width={640} alt={blockLabel} />
                          ) : (
                            <div className="student-card-icon">
                              <Dumbbell size={24} />
                            </div>
                          )}
                          <div className="student-card-body">
                            <h2>{blockLabel}</h2>
                            <p>
                              {blockFocus} · {programWorkout.block.weeklyFrequency ?? 1}x/semana · descanso{" "}
                              {programWorkout.block.restTime}s
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!isCurrent}
                            title={
                              cycleCompleted
                                ? trainingCopy.programCompleted
                                : isCurrent
                                  ? undefined
                                  : "Conclua o dia atual para liberar este treino"
                            }
                            onClick={() => void handleStartWorkoutSession(programWorkout)}
                          >
                            {cycleCompleted
                              ? trainingCopy.completedBadge
                              : isCurrent
                                ? trainingCopy.startSession
                                : "Bloqueado"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </AnimatedList>
                <button className="student-history-button" onClick={() => setStudentSection("history")}>
                  <ClipboardList size={22} />
                  {trainingCopy.workoutHistory}
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
                    <span><strong>Início da matrícula:</strong>{formatStudentDate(sheetMembershipStartsAt)}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Vencimento da matrícula:</strong>{formatStudentDate(sheetMembershipEndsAt)}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Duração do treino:</strong>{formatProgramDuration(workoutSheet.duration)}</span>
                  </div>
                  <div>
                    <CalendarDays size={24} />
                    <span><strong>Término previsto:</strong>{formatStudentDate(workoutSheet.duration?.plannedEndsAt)}</span>
                  </div>
                </div>
              </article>
            ) : null}
          </section>
          </>
        )}

         {studentSection === "player" && todayWorkout && (
           <section className="student-player-mobile">
             <Suspense fallback={<div className="workout-player-empty">Carregando execução...</div>}>
               <WorkoutPlayer
                 programTitle={todayWorkout.programTitle}
                 blockTitle={todayWorkout.block.identifier ?? todayWorkout.block.title}
                 exercises={todayWorkout.block.exercises}
                 restTimeDefault={todayWorkout.block.restTime}
                 structureType={todayWorkout.block.structureType}
                 protocolRounds={todayWorkout.block.protocolRounds}
                 workSeconds={todayWorkout.block.workSeconds}
                 timeCapSeconds={todayWorkout.block.timeCapSeconds}
                 instructions={todayWorkout.block.instructions}
                 sessionId={workoutSession?.id ?? null}
                 onBack={() => {
                   // Após cancel/reset (ou sem sessão), volta ao catálogo sem re-disparar goToSection.
                   restoreStudentChrome();
                   uiSounds.studentPage();
                   uiSounds.pageChange();
                   setStudentSection("training");
                 }}
                 onSessionActiveChange={setPlayerSessionActive}
                 onWorkoutStart={handleBeginWorkoutSession}
                 onCancelSession={handleCancelWorkoutSession}
                 onExerciseProgressChange={handleExerciseProgressChange}
                 onWorkoutComplete={async () => {
                   await handleCompleteWorkoutDay();
                   restoreStudentChrome();
                   uiSounds.studentPage();
                   uiSounds.pageChange();
                   // Minimiza o player expandido, mas não pausa a trilha.
                   useMusicPlayerStore.getState().collapse();
                   setStudentSection("feed");
                 }}
               />
             </Suspense>
           </section>
         )}

        {studentSection === "membership" && (
          <section className="student-sheet student-finance-sheet">
            <div className="student-sheet-heading">
              <span>Financeiro</span>
              <h1>Matrícula</h1>
              <p>{membership ? `Plano ${membership.plan.name}` : "Nenhuma matrícula ativa"}</p>
            </div>
            {membership ? (
              <>
                <article className="student-info-card">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>{membership.plan.name}</strong>
                    <span className={financeStatusBadgeClass(membership.status)}>
                      {labelMembershipStatus(membership.status)}
                    </span>
                  </div>
                </article>
                <div className="student-metric-grid">
                  <span>
                    <strong>{formatPriceInBRL(membership.plan.priceInCents)}</strong>
                    {membership.plan.billingCycle === "YEARLY" ? "/ano" : "/mês"}
                  </span>
                  <span>
                    <strong>Início</strong>
                    {new Date(membership.startsAt).toLocaleDateString("pt-BR")}
                  </span>
                  <span>
                    <strong>Vigência</strong>
                    {membership.endsAt ? `até ${new Date(membership.endsAt).toLocaleDateString("pt-BR")}` : "sem término"}
                  </span>
                  <span>
                    <strong>{labelBillingCycle(membership.plan.billingCycle)}</strong>
                    cobrança
                  </span>
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
          <section className="student-sheet student-finance-sheet">
            <div className="student-sheet-heading">
              <span>Financeiro</span>
              <h1>Pagamentos</h1>
              <p>{payments.length > 0 ? `${payments.length} cobrança(s)` : "Nenhuma cobrança registrada"}</p>
            </div>
            {payments.slice(0, 6).map((payment) => (
              <article className="student-info-card student-finance-payment-card" key={payment.id}>
                <CreditCard size={22} />
                <div>
                  <strong>{formatPriceInBRL(payment.amountInCents)}</strong>
                  <span>
                    <em className={financeStatusBadgeClass(payment.status)}>{labelPaymentStatus(payment.status)}</em>
                    {" · "}
                    vence {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {payment.paymentUrl && (
                  <a className="finance-link" href={payment.paymentUrl} target="_blank" rel="noreferrer">
                    Abrir checkout
                  </a>
                )}
              </article>
            ))}
            {payments.length === 0 && (
              <article className="student-empty-state">
                <CircleDollarSign size={28} />
                <strong>Nenhuma cobrança</strong>
                <span>Quando houver faturas, elas aparecem aqui com status padronizado.</span>
              </article>
            )}
            {publicConfig["module_cards"] !== "false" && (
              <>
                <div className="student-section-title-row">
                  <h2 className="student-section-title">Meus cartões</h2>
                  <button
                    className="student-outline-button"
                    onClick={() => setShowAddCardForm((value) => !value)}
                  >
                    {showAddCardForm ? "Fechar" : "Adicionar cartão"}
                  </button>
                </div>
                {showAddCardForm && (
                  <form className="student-card-form" onSubmit={handleAddStudentCard}>
                    <header className="student-card-form-header">
                      <CreditCard size={20} aria-hidden />
                      <div>
                        <strong>Novo cartão</strong>
                        <span>Dados para cobrança recorrente</span>
                      </div>
                    </header>
                    <div className="student-card-form-grid">
                      <label className="student-card-field">
                        <span>Bandeira</span>
                        <input name="brand" placeholder="Visa, Mastercard…" autoComplete="cc-type" />
                      </label>
                      <label className="student-card-field">
                        <span>Últimos 4 dígitos</span>
                        <input
                          name="lastFour"
                          placeholder="0000"
                          maxLength={4}
                          pattern="[0-9]{4}"
                          inputMode="numeric"
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label className="student-card-field student-card-field-full">
                        <span>Nome impresso no cartão</span>
                        <input
                          name="holderName"
                          placeholder="Como aparece no cartão"
                          autoComplete="cc-name"
                        />
                      </label>
                    </div>
                    <label className="student-card-checkbox">
                      <input name="isDefault" type="checkbox" />
                      Definir como cartão principal
                    </label>
                    <button className="student-green-button" type="submit">
                      Salvar cartão
                    </button>
                  </form>
                )}
                {studentPaymentCards.length > 0 ? (
                  studentPaymentCards.map((card) => (
                    <article className="student-payment-card" key={card.id}>
                      <div className="student-payment-card-icon" aria-hidden>
                        <CreditCard size={22} />
                      </div>
                      <div className="student-payment-card-body">
                        <strong>
                          {(card.brand ?? "Cartão").toUpperCase()} •••• {card.lastFour}
                        </strong>
                        <span>{card.holderName ?? "Titular não informado"}</span>
                        {card.isDefault ? (
                          <em className="finance-status-badge tone-success">Principal</em>
                        ) : null}
                      </div>
                      <button
                        className="student-delete-button delete-action-button"
                        aria-label="Remover cartão"
                        type="button"
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

        {studentSection === "products" && publicConfig["module_products"] !== "false" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Loja da academia</span>
              <h1>Vitrine online</h1>
              <p>
                {studentProducts.length} produto(s) · peça e retire na unidade ou receba o digital após confirmação
              </p>
            </div>
            {purchaseConfirmId && (
              <div className="student-toast-confirm" role="status">
                <Check size={18} />
                Pedido criado — abrindo pagamento…
              </div>
            )}
            {studentProducts.length > 0 ? (
              <div className="student-products-grid">
                {studentProducts.map((product) => (
                  <article className="student-product-card" key={product.id}>
                    <div className="student-product-media">
                      {product.imageUrl ? (
                        <img src={mediaUrl(product.imageUrl)} alt={product.name} />
                      ) : (
                        <div className="student-product-fallback" aria-hidden="true">
                          <Package size={30} />
                        </div>
                      )}
                    </div>
                    <div className="student-product-body">
                      <small>
                        {product.category ? `${product.category} · ` : ""}
                        {labelProductKind(product.kind)}
                        {product.shippingMethod
                          ? ` · ${labelShippingMethod(product.shippingMethod)}`
                          : product.kind === "DIGITAL"
                            ? ` · ${labelShippingMethod("DIGITAL")}`
                            : ` · ${labelShippingMethod("PICKUP")}`}
                      </small>
                      <strong className="student-product-name">{product.name}</strong>
                      {product.description ? (
                        <span className="student-product-desc">{product.description}</span>
                      ) : null}
                      <strong className="student-product-price">{formatPriceInBRL(product.priceInCents)}</strong>
                      <div className="student-product-actions">
                        <button
                          className="student-green-button"
                          type="button"
                          disabled={Boolean(product.outOfStock) || purchasingProductId === product.id}
                          onClick={() => void handleAddToCart(product.id)}
                        >
                          {purchasingProductId === product.id ? "Adicionando…" : "Adicionar ao carrinho"}
                        </button>
                        <button
                          className="student-green-button"
                          type="button"
                          disabled={
                            Boolean(product.purchasedByMe) ||
                            Boolean(product.outOfStock) ||
                            purchasingProductId === product.id
                          }
                          onClick={() => void handleBuyProduct(product.id)}
                        >
                          {product.outOfStock
                            ? "Sem estoque"
                            : product.purchasedByMe
                              ? product.kind === "DIGITAL"
                                ? "Já adquirido"
                                : "Pedido em andamento"
                              : purchasingProductId === product.id
                                ? "Abrindo pagamento…"
                                : "Comprar agora"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className="student-empty-state">
                <Package size={34} />
                <strong>Nenhum produto na vitrine</strong>
                <span>Quando a academia publicar itens, eles aparecerão aqui.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "cart" && publicConfig["module_products"] !== "false" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Loja</span>
              <h1>Carrinho</h1>
              <p>
                {(studentCart?.itemCount ?? 0) > 0
                  ? `${studentCart!.itemCount} item(ns) salvos · finalize quando quiser`
                  : "Seus itens ficam salvos enquanto você navega"}
              </p>
            </div>
            {(studentCart?.items?.length ?? 0) > 0 ? (
              <>
                {studentCart!.items.map((item) => {
                  const stockLimit = item.product.stock;
                  const atStockLimit = stockLimit != null && item.quantity >= stockLimit;
                  const qtyBusy = cartQtyBusyId === item.productId;
                  return (
                  <article className="student-info-card" key={item.id}>
                    {item.product.imageUrl ? (
                      <img
                        className="student-card-image"
                        src={mediaUrl(item.product.imageUrl)}
                        alt={item.product.name}
                      />
                    ) : (
                      <div className="student-card-icon" aria-hidden="true">
                        <Package size={22} />
                      </div>
                    )}
                    <div>
                      <strong>{item.product.name}</strong>
                      <span>{formatPriceInBRL(item.lineTotalInCents)}</span>
                      {stockLimit != null && item.quantity >= stockLimit ? (
                        <span className="student-cart-stock-hint">😅 Estoque esgotado para este item</span>
                      ) : null}
                      <div className="student-cart-item-actions">
                        <div className="student-cart-qty" role="group" aria-label={`Quantidade de ${item.product.name}`}>
                          <button
                            type="button"
                            className="student-cart-qty-btn"
                            aria-label="Diminuir quantidade"
                            disabled={cartCheckingOut || qtyBusy}
                            onClick={() => void handleCartQuantity(item.productId, item.quantity - 1)}
                          >
                            <Minus size={16} />
                          </button>
                          <strong className="student-cart-qty-value">{item.quantity}</strong>
                          <button
                            type="button"
                            className="student-cart-qty-btn"
                            aria-label={
                              atStockLimit
                                ? "Estoque esgotado para este item"
                                : "Aumentar quantidade"
                            }
                            disabled={cartCheckingOut || qtyBusy || atStockLimit}
                            onClick={() => void handleCartQuantity(item.productId, item.quantity + 1)}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="student-link-button"
                          disabled={cartCheckingOut || qtyBusy}
                          onClick={() => void handleCartQuantity(item.productId, 0)}
                        >
                          Remover do carrinho
                        </button>
                      </div>
                    </div>
                  </article>
                  );
                })}
                <article className="student-info-card student-cart-summary-card">
                  <div className="student-card-icon" aria-hidden="true">
                    <ShoppingCart size={22} />
                  </div>
                  <div className="student-cart-summary">
                    <strong className="student-cart-summary-title">Resumo</strong>
                    <div className="student-cart-summary-lines">
                      <span>Subtotal {formatPriceInBRL(studentCart!.subtotalInCents)}</span>
                      {studentCart!.discountInCents > 0 && (
                        <span>Desconto −{formatPriceInBRL(studentCart!.discountInCents)}</span>
                      )}
                      <span>Frete {formatPriceInBRL(studentCart!.shippingInCents)}</span>
                    </div>
                    <strong className="student-product-price student-cart-summary-total">
                      {formatPriceInBRL(studentCart!.amountInCents)}
                    </strong>
                    <div className="student-cart-summary-actions">
                      <label className="student-field-label">
                        Cupom
                        <input
                          value={cartCouponInput}
                          onChange={(event) => setCartCouponInput(event.target.value)}
                          placeholder="Código"
                        />
                      </label>
                      <button type="button" className="student-green-button" onClick={() => void handleApplyCartCoupon()}>
                        Aplicar cupom de desconto
                      </button>
                      <div className="student-field-label student-cart-shipping">
                        Entrega
                        <strong>{labelShippingMethod(cartShippingMethod)}</strong>
                        <span className="student-muted-hint">Definida pelo admin no produto</span>
                      </div>
                      {cartShippingMethod === "DELIVERY" && (
                        <label className="student-field-label">
                          Endereço
                          <input
                            value={cartAddress}
                            onChange={(event) => setCartAddress(event.target.value)}
                            placeholder="Rua, número, bairro, cidade"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="student-green-button"
                        disabled={cartCheckingOut}
                        onClick={() => void handleCartCheckout()}
                      >
                        {cartCheckingOut ? "Finalizando pedido…" : "Finalizar compra"}
                      </button>
                    </div>
                  </div>
                </article>
              </>
            ) : (
              <article className="student-empty-state">
                <ShoppingCart size={34} />
                <strong>Carrinho vazio</strong>
                <span>Adicione produtos na vitrine para montar o pedido.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "orders" && publicConfig["module_purchases"] !== "false" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Pedidos</span>
              <h1>Pedidos do carrinho</h1>
              <p>{studentOrders.length} pedido(s) multi-item</p>
            </div>
            {studentOrders.length > 0 ? (
              studentOrders.map((order) => (
                <article className="student-info-card" key={order.id}>
                  <ShoppingCart size={22} />
                  <div>
                    <strong>
                      {order.items.map((item) => `${item.productName}×${item.quantity}`).join(", ")}
                    </strong>
                    <span>
                      {formatPriceInBRL(order.amountInCents)} · {labelShippingMethod(order.shippingMethod)}
                    </span>
                    <span className={`finance-status-badge tone-${purchaseStatusTone(order.status)}`}>
                      {labelOrderStatus(order.status)}
                    </span>
                    <span>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</span>
                    {order.status === "PENDING" && order.paymentUrl && (
                      <button
                        type="button"
                        className="student-green-button"
                        style={{ marginTop: 8, minHeight: 40 }}
                        onClick={() => openAsaasCheckout(order.paymentUrl as string)}
                      >
                        Pagar agora
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <article className="student-empty-state">
                <ShoppingCart size={34} />
                <strong>Nenhum pedido do carrinho</strong>
                <span>Finalize um carrinho para ver os pedidos aqui.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "purchases" && publicConfig["module_purchases"] !== "false" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Pedidos</span>
              <h1>Minhas compras</h1>
              <p>{studentPurchases.length} pedido(s) · status atualizado pela academia</p>
            </div>
            {studentPurchases.length > 0 ? (
              studentPurchases.map((purchase) => (
                <article className="student-info-card" key={purchase.id}>
                  <ShoppingCart size={22} />
                  <div>
                    <strong>{purchase.product.name}</strong>
                    <span>
                      {formatPriceInBRL(purchase.amountInCents)} · {labelProductKind(purchase.product.kind)}
                    </span>
                    <span className={`finance-status-badge tone-${purchaseStatusTone(purchase.status)}`}>
                      {labelPurchaseStatus(purchase.status)}
                    </span>
                    <span>{new Date(purchase.createdAt).toLocaleDateString("pt-BR")}</span>
                    {purchase.status === "PENDING" && (
                      <button
                        type="button"
                        className="student-green-button"
                        style={{ marginTop: 8, minHeight: 40 }}
                        disabled={purchasingProductId === purchase.id}
                        onClick={() => void handlePayPurchase(purchase.id)}
                      >
                        {purchasingProductId === purchase.id
                          ? "Abrindo..."
                          : purchase.paymentUrl
                            ? "Pagar agora"
                            : "Gerar pagamento"}
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <article className="student-empty-state">
                <ShoppingCart size={34} />
                <strong>Nenhum pedido ainda</strong>
                <span>Solicite um produto na vitrine para acompanhar aqui.</span>
              </article>
            )}
          </section>
        )}

        {studentSection === "ratings" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>Engajamento</span>
              <h1>{trainingCopy.favoritesAndRatings}</h1>
              <p>
                {studentWorkoutFavorites.length} favorito(s) · {publishedWorkouts.length} treino(s) para avaliar
              </p>
            </div>

            <h2 className="student-sheet-subtitle">Favoritos</h2>
            {studentWorkoutFavorites.length > 0 ? (
              <div className="student-favorites-grid">
                {studentWorkoutFavorites.map((favorite) => (
                  <article className="student-favorite-card" key={favorite.id}>
                    <span className="student-favorite-media">
                      {favorite.program.modalityImageUrl ? (
                        <MediaImg
                          src={favorite.program.modalityImageUrl}
                          width={360}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : (
                        <Dumbbell size={24} />
                      )}
                    </span>
                    <strong>{favorite.program.title}</strong>
                    <span className="student-favorite-meta">
                      {favorite.program.modality ?? "Hipertrofia"} • {favorite.program.totalWorkouts} treinos
                    </span>
                    <button
                      className="student-delete-button delete-action-button"
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
                <Star size={28} />
                <strong>Nenhum favorito ainda</strong>
                <span>Ao avaliar um treino, ele também pode ser salvo aqui automaticamente.</span>
              </article>
            )}

            <h2 className="student-sheet-subtitle">{trainingCopy.rateWorkout}</h2>
            {publishedWorkouts.length > 0 ? (
              publishedWorkouts.map((programWorkout) => {
                const draft = ratingDraft[programWorkout.programId];
                const alreadyRated = programWorkout.ratedByMe;
                return (
                  <article
                    className="student-rating-card"
                    data-theme-surface="card"
                    key={`${programWorkout.programId}-${programWorkout.dayNumber}`}
                  >
                    <div className="student-rating-top">
                      <div className="student-rating-heading">
                        <strong>{programWorkout.programTitle}</strong>
                        <span>{programWorkout.modality ?? "Hipertrofia"}</span>
                      </div>
                      {alreadyRated ? (
                        <span className="student-rating-done"><Check size={16} /> Avaliado</span>
                      ) : (
                        <div className="student-rating-stars" role="group" aria-label="Nota do treino">
                          {[1, 2, 3, 4, 5].map((score) => {
                            const selected = Boolean(draft && score <= draft.score);
                            return (
                              <button
                                key={score}
                                type="button"
                                aria-label={score === 1 ? "1 estrela" : `${score} estrelas`}
                                aria-pressed={selected}
                                className={selected ? "active" : undefined}
                                onClick={() =>
                                  setRatingDraft((current) => ({
                                    ...current,
                                    [programWorkout.programId]: { score, comment: current[programWorkout.programId]?.comment ?? "" }
                                  }))
                                }
                              >
                                <Star size={18} fill={selected ? "currentColor" : "none"} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {!alreadyRated && (
                      <div className="student-rating-form">
                        <input
                          type="text"
                          className="ui-input"
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
                          className="ui-btn-primary student-rating-submit"
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
                <Trophy size={28} />
                <strong>Nenhum treino para avaliar</strong>
                <span>Os treinos publicados aparecerão aqui para você avaliar.</span>
              </article>
            )}
          </section>
        )}
        {studentSection === "assessments" && (
          <section className="student-sheet">
            <div className="student-sheet-heading">
              <span>{trainingCopy.physicalAssessment}</span>
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
                  <h3>Histórico de avaliações físicas</h3>
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
                            className="edit-action-button"
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
              <span>Unidades</span>
              <h1>Academias, boxes e studios</h1>
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
                      {labelLocationType(item.type)}
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
              <span>Central de ajuda</span>
              <h1>Atendimento</h1>
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
                        <strong>{message.senderType === "STUDENT" ? "Você" : brand.supportTeam}</strong>
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
              <button className="student-green-button" disabled={aiBusy}>
                {aiBusy ? "Gerando…" : "Gerar plano"}
              </button>
            </form>
            {latestAiPlan ? (
              <article className="student-ai-plan">
                <div className="student-info-card">
                  <Bot size={22} />
                  <div>
                    <strong>Último plano</strong>
                    <span>{latestAiPlan.plan.summary}</span>
                    <small>
                      {latestAiPlan.objective} · {latestAiPlan.level} · {latestAiPlan.daysPerWeek}x
                    </small>
                  </div>
                </div>
                {(latestAiPlan.plan.days ?? []).map((day) => (
                  <article className="student-info-card" key={day.title}>
                    <Dumbbell size={22} />
                    <div>
                      <strong>{day.title}</strong>
                      <span>{day.focus}</span>
                      {(day.exercises ?? []).map((exercise) => (
                        <small key={exercise.name}>
                          {exercise.name} · {exercise.sets}x {exercise.reps}
                        </small>
                      ))}
                    </div>
                  </article>
                ))}
                {(latestAiPlan.plan.recommendations ?? []).length > 0 ? (
                  <article className="student-info-card">
                    <Sparkles size={22} />
                    <div>
                      <strong>Recomendações</strong>
                      {latestAiPlan.plan.recommendations.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </article>
                ) : null}
              </article>
            ) : null}
          </section>
        )}

        {studentSection === "profile" && token && (
          <StudentAthleteProfileSection
            token={token}
            profile={profile}
            athleteSocial={athleteSocial}
            onOpenSettings={() => goToSection("profile-settings")}
            onProfileUpdated={(next) => {
              setProfile((current) => ({
                ...current,
                ...next,
                enrollmentStatus: current?.enrollmentStatus ?? next.enrollmentStatus
              }));
              void apiGet<{
                followersCount: number;
                followingCount: number;
                postsCount: number;
                isPrivate: boolean;
              }>("/student/social/me", token)
                .then((data) =>
                  setAthleteSocial({
                    followersCount: data.followersCount,
                    followingCount: data.followingCount,
                    postsCount: data.postsCount,
                    isPrivate: data.isPrivate
                  })
                )
                .catch(() => undefined);
            }}
          />
        )}

        {studentSection === "profile-settings" && (
          <section className="student-sheet student-profile-sheet">
            <div className="student-sheet-heading">
              <span>{brand.profileSettings}</span>
              <h1>Dados cadastrais</h1>
              <p>{brand.profileSettingsHint}</p>
            </div>
            <div className="student-athlete-social-actions" style={{ marginBottom: 16 }}>
              <button type="button" className="student-ghost-chip" onClick={() => goToSection("profile")}>
                ← Voltar ao perfil social
              </button>
            </div>

            <form
              key={`student-profile-form-${studentProfileFormKey}`}
              id="student-profile-form"
              className={`student-profile-form${studentProfileEditing ? "" : " student-profile-locked"}`}
              onSubmit={handleUpdateStudentProfile}
            >
              <div className="student-profile-identity">
                <label className="student-avatar-field">
                  <span className="student-avatar-preview">
                    {studentAvatarPreview ?? profile?.avatarUrl ? (
                      <img src={studentAvatarPreview ?? profile?.avatarUrl ?? ""} alt="" />
                    ) : (
                      <UserRound size={32} className="student-avatar-placeholder" />
                    )}
                  </span>
                  {studentProfileEditing && (
                    <>
                      <input
                        name="avatar"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleStudentAvatarChange}
                      />
                      <small>JPG, PNG, WEBP ou GIF</small>
                    </>
                  )}
                </label>
                <div className="student-profile-identity-copy">
                  <strong>{profile?.name ?? brand.athlete}</strong>
                  <span>{profile?.email ?? "—"}</span>
                  <em>
                    {profile?.gender === "MALE"
                      ? "Masculino"
                      : profile?.gender === "FEMALE"
                        ? "Feminino"
                        : "Sexo não informado"}
                  </em>
                </div>
              </div>

              <div className="student-achievement-panel">
                <strong>{trainingCopy.achievementsHeading}</strong>
                <span>{trainingCopy.achievementsHint}</span>
                {(profile?.achievements?.length ?? 0) > 0 ? (
                  <div className="student-achievement-grid">
                    {profile?.achievements?.map((achievement) => (
                      <article className="student-achievement-seal-card" key={achievement.modalityId}>
                        <span className="student-achievement-medal">
                          {achievement.modalityImageUrl ? (
                            <img src={achievement.modalityImageUrl} alt="" />
                          ) : (
                            <Trophy size={26} />
                          )}
                        </span>
                        <strong>{achievement.modalityName}</strong>
                        <em>
                          {achievement.completionCount === 1
                            ? "1 ciclo concluído"
                            : `${achievement.completionCount} ciclos concluídos`}
                        </em>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="student-achievement-empty">{trainingCopy.achievementsEmpty}</p>
                )}
              </div>

              <fieldset className="student-profile-group">
                <legend>Identificação</legend>
                <label>
                  Nome completo
                  <input
                    name="name"
                    defaultValue={profile?.name ?? ""}
                    minLength={2}
                    required
                    placeholder="Como no documento"
                    disabled={!studentProfileEditing}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    value={profile?.email ?? ""}
                    readOnly
                    disabled
                    placeholder="seuemail@exemplo.com"
                  />
                </label>
                <label>
                  CPF
                  <input
                    name="document"
                    defaultValue={profile?.document ?? ""}
                    placeholder="000.000.000-00"
                    disabled={!studentProfileEditing}
                  />
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
                <label className="student-profile-locked-field">
                  Sexo
                  <select
                    name="gender"
                    defaultValue={profile?.gender ?? ""}
                    disabled
                    aria-readonly="true"
                    title="Definido no cadastro. Somente a academia pode alterar."
                  >
                    <option value="">Não informado</option>
                    <option value="MALE">Masculino</option>
                    <option value="FEMALE">Feminino</option>
                  </select>
                  <small>Definido no cadastro · só a academia altera</small>
                </label>
              </fieldset>

              <fieldset className="student-profile-group">
                <legend>Contato e localização</legend>
                <label>
                  Telefone
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={profile?.phone ?? ""}
                    placeholder="+55 11 99999-9999"
                    disabled={!studentProfileEditing}
                  />
                </label>
                <label>
                  Estado
                  <select
                    name="state"
                    defaultValue={profile?.state ?? ""}
                    onChange={(event) => setStudentProfileUf(event.target.value)}
                    disabled={!studentProfileEditing}
                  >
                    <option value="">Selecione</option>
                    {BRAZILIAN_STATES.map((state) => (
                      <option key={state.uf} value={state.uf}>
                        {state.name} ({state.uf})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="student-profile-wide">
                  Cidade
                  <select name="city" defaultValue={profile?.city ?? ""} disabled={!studentProfileEditing}>
                    <option value="">Selecione</option>
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
              </fieldset>

              <fieldset className="student-profile-group">
                <legend>Treino</legend>
                <label>
                  Objetivo
                  <select name="objective" defaultValue={profile?.objective ?? ""} disabled={!studentProfileEditing}>
                    <option value="">Selecione</option>
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
                    <option value="">Selecione</option>
                    <option value="Iniciante">Iniciante</option>
                    <option value="Intermediário">Intermediário</option>
                    <option value="Avançado">Avançado</option>
                  </select>
                </label>
              </fieldset>

              <article className="student-profile-note">
                <ShieldCheck size={16} />
                <span>Sexo não pode ser alterado pelo aluno. Solicite correção à academia, se necessário.</span>
              </article>
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
                    Salvar alterações
                  </button>
                  <button className="student-outline-button" type="button" onClick={handleCancelStudentProfileEdit}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="student-outline-button edit-action-button" type="button" onClick={() => setStudentProfileEditing(true)}>
                  <Pencil size={18} />
                  Editar informações
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
          <section className="student-menu-list p-4 sm:p-6">
            {(
              [
                { group: "Conta", icon: UserRound, title: brand.athleteProfile, action: () => goToSection("profile") },
                { group: "Conta", icon: Settings, title: "Configurações do perfil", action: () => goToSection("profile-settings") },
                { group: "Treino", icon: Dumbbell, title: trainingCopy.workout, action: () => openTrainingCatalog(), favorite: true },
                { group: "Treino", icon: CorridaNavIcon, title: "Corrida", action: () => openCorrida(), favorite: true },
                { group: "Treino", icon: Trophy, title: "Desafios", action: () => goToSection("club"), favorite: true },
                { group: "Treino", icon: Sparkles, title: "Plano inteligente", action: () => goToSection("ai") },
                { group: "Conta", icon: ShieldCheck, title: "Matrículas", action: () => goToSection("membership") },
                { group: "Conta", icon: CreditCard, title: "Pagamentos", action: () => goToSection("payments"), favorite: true },
                { group: "Saúde", icon: Ruler, title: trainingCopy.physicalAssessment, action: () => goToSection("assessments") },
                { group: "Saúde", icon: CalendarDays, title: "Frequência", action: () => goToSection("status") },
                {
                  group: "Play e loja",
                  icon: Package,
                  title: "Vitrine",
                  action: () => goToSection("products"),
                  favorite: true,
                  moduleKey: "module_products"
                },
                {
                  group: "Play e loja",
                  icon: ShoppingCart,
                  title: "Carrinho",
                  action: () => goToSection("cart"),
                  moduleKey: "module_products"
                },
                {
                  group: "Play e loja",
                  icon: ShoppingCart,
                  title: "Pedidos online",
                  action: () => goToSection("orders"),
                  moduleKey: "module_purchases"
                },
                {
                  group: "Play e loja",
                  icon: ShoppingCart,
                  title: "Compras rápidas",
                  action: () => goToSection("purchases"),
                  moduleKey: "module_purchases"
                },
                { group: "Play e loja", icon: Music2, title: "Play", action: () => goToSection("play"), favorite: true },
                { group: "Comunidade", icon: CalendarPlus, title: "Eventos", action: () => goToSection("events") },
                { group: "Comunidade", icon: Video, title: "Clipes", action: () => goToSection("reels"), favorite: true },
                { group: "Comunidade", icon: Radio, title: "Ao vivo", action: () => goToSection("live") },
                { group: "Comunidade", icon: MessageCircle, title: "Mensagens", action: () => goToSection("messages") },
                { group: "Comunidade", icon: UsersRound, title: "Chat global", action: () => goToSection("chat") },
                { group: "Comunidade", icon: UserPlus, title: "Pedidos para seguir", action: () => goToSection("requests") },
                { group: "Comunidade", icon: MapPin, title: "Unidades", action: () => goToSection("locations") },
                { group: "Ajuda", icon: Headphones, title: "Atendimento", action: () => goToSection("support") },
                { group: "Ajuda", icon: QrCode, title: "QR Code", action: () => { openTrainingCatalog(); setShowStudentQr(true); } },
                { group: "Conta", icon: CreditCard, title: "Meus Cartões", action: () => goToSection("payments"), moduleKey: "module_cards" },
                {
                  group: "Ajuda",
                  icon: Bell,
                  title: "Notificações",
                  action: () => {
                    uiSounds.popupOpen();
                    uiSounds.popupNotify();
                    setNotificationsOpen(true);
                  }
                },
                { group: "Conta", icon: Settings, title: "Configurações", action: () => goToSection("settings") },
                { group: "Conta", icon: Star, title: trainingCopy.favoritesAndRatings, action: () => goToSection("ratings") }
              ] as Array<{
                group: string;
                icon: typeof UserRound;
                title: string;
                action: () => void;
                favorite?: boolean;
                moduleKey?: string;
              }>
            )
              .filter((item) => !item.moduleKey || publicConfig[item.moduleKey] !== "false")
              .reduce(
                (acc, item, index, list) => {
                  if (index === 0 || list[index - 1].group !== item.group) {
                    acc.push({ type: "group" as const, title: item.group });
                  }
                  acc.push({ type: "item" as const, item });
                  return acc;
                },
                [] as Array<
                  | { type: "group"; title: string }
                  | {
                      type: "item";
                      item: {
                        group: string;
                        icon: typeof UserRound;
                        title: string;
                        action: () => void;
                        favorite?: boolean;
                        moduleKey?: string;
                      };
                    }
                >
              )
              .map((row) =>
                row.type === "group" ? (
                  <h2 className="student-menu-group" key={`g-${row.title}`}>
                    {row.title}
                  </h2>
                ) : (
                  <button className="student-menu-item" key={row.item.title} onClick={row.item.action}>
                    <row.item.icon size={24} />
                    <span>{row.item.title}</span>
                    {row.item.favorite && <Star size={18} />}
                  </button>
                )
              )}
            <button
              className="student-menu-item danger"
              onClick={() => {
                uiSounds.toggleOff();
                onLogout();
              }}
            >
              <LogOut size={24} />
              <span>Sair</span>
            </button>
          </section>
        )}

        {studentSection === "settings" && (
          <StudentSettingsPanel onBack={() => goToSection("menu")} />
        )}

        {studentSection === "play" && token && <StudentPlaySection token={token} />}

        {studentSection === "history" && (
          <section className="student-workout-history-page" aria-label="Histórico de treinos">
            <div className="student-workout-history-header">
              <div className="student-workout-history-icon">
                <ClipboardList size={30} />
              </div>
              <div>
                <h2>Histórico de treinos</h2>
                <p>Consulte todas as execuções do seu treino atual.</p>
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
      </div>

      {streakCalendarOpen &&
        createPortal(
          <div
            className="student-streak-modal-backdrop"
            role="presentation"
            onClick={() => {
              uiSounds.popupClose();
              setStreakCalendarOpen(false);
            }}
          >
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
                <button
                  className="student-streak-modal-close"
                  type="button"
                  aria-label="Fechar calendário"
                  onClick={() => {
                    uiSounds.popupClose();
                    setStreakCalendarOpen(false);
                  }}
                >
                  <X size={18} strokeWidth={2.75} />
                </button>
              </div>
              <div className="student-consistency-calendar in-modal">
                <div className="student-consistency-heading">
                  <button
                    className="student-calendar-arrow"
                    type="button"
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
                    type="button"
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
                <p>
                  Dias marcados representam treinos concluídos em {currentYear}. O calendário mostra o mês atual e meses
                  anteriores.
                </p>
              </div>
            </section>
          </div>,
          document.body
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

      {token && (
        <StudentMusicPlayerHost
          compact={hideStudentChrome}
          hideMini={studentSection === "player"}
        />
      )}
      {!hideStudentChrome && (
      <nav className="student-bottom-nav" aria-label={brand.navAria}>
        <button className={studentSection === "feed" || studentSection === "home" ? "active" : ""} onClick={() => goToSection("feed")}><Home size={22} />Feed</button>
        <button className={studentSection === "activity" ? "active" : ""} onClick={() => openCorrida()}><CorridaNavIcon size={22} />Corrida</button>
        <button className={studentSection === "training" || studentSection === "player" || studentSection === "history" ? "active" : ""} onClick={() => openTrainingCatalog()}><Dumbbell size={22} />Treino</button>
        <button className={studentSection === "club" ? "active" : ""} onClick={() => goToSection("club")}><Trophy size={22} />Desafios</button>
        <button className={studentSection === "menu" ? "active" : ""} onClick={() => goToSection("menu")}><Menu size={22} />Menu</button>
      </nav>
      )}
    </main>
  );
}

