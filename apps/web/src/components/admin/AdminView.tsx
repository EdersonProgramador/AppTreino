import {
  Activity,
  AlertCircle,
  ArrowRight,
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
  Eye,
  Headphones,
  Home,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  LockKeyhole,
  LogOut,
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
  Play,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  UploadCloud,
  UserRound,
  UsersRound,
  Wallet,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatPriceInBRL, parseBRLMoneyToCents } from "@app-treino/shared";
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api";
import { BRAZILIAN_STATES, CITIES_BY_STATE } from "../../brazil-data";
import {
  cmsProgramStatusLabel,
  cmsTargetGenderLabel,
  estimateProgramCalendarDays,
  formatProgramDuration,
  getCmsProgramReadiness,
  parseProgramMetadata,
  trashKindLabel,
  trashResourceBase,
  trashSoftDeleteBase
} from "../../lib/cms";
import { calculateBodyFatEstimate } from "../../lib/body-composition";
import { formatAssessmentDateTime, formatDateTimeLocalInputValue } from "../../lib/dates";
import { trainingCopy } from "../../lib/training-copy";
import { assetUrl, mediaUrl } from "../../lib/urls";
import { studentLocationLabel } from "../../lib/locations";
import {
  cmsFilterBarClass,
  cmsFormClass,
  cmsFormSectionTitleClass,
  cmsImagePreviewClass,
  cmsImagePreviewMetaClass,
  cmsStudioCardClass,
  cmsUploadFieldClass,
  cmsUploadFieldBase,
  cmsDataRowThumbClass,
  crudFormClass,
  crudFormInlineClass,
  dangerButtonClass,
  dataRowClass,
  panelTitleClass,
  wideFieldClass
} from "../../lib/admin-cms-classes";
import type {
  AdminResource,
  AdminStudentOverview,
  AdminTrashData,
  AdminTrashKind,
  AdminUser,
  AiWorkoutPlanRow,
  AssessmentPhotoKey,
  CmsAnnouncementRow,
  CmsDeleteTarget,
  CmsExerciseRow,
  CmsLocationRow,
  CmsModalityRow,
  CmsProgramRow,
  CmsPublishPreview,
  CmsWorkoutBlockRow,
  CmsWorkflowSummary,
  ContactMessageRow,
  EventRow,
  FavoriteRow,
  MembershipRow,
  PaymentCardRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  PlanRow,
  ProductRow,
  PurchaseRow,
  RatingRow,
  SupportTicketRow,
  UploadResponse,
  WorkoutRow
} from "../../types";
import { ALL_ADMIN_RESOURCES, ALL_TRASH_KINDS, assessmentPerimeterKeys, assessmentPhotoFields, CMS_TRASH_KINDS } from "../../types/admin";
import type { TrashDisplayItem } from "../../types/admin";
import type { PurchaseStatus } from "../../types/shared";
import type { WorkoutIntensityType, WorkoutPrescriptionType } from "../student/WorkoutPlayer";
import { ThemeModeSwitch } from "../shared/ThemeModeSwitch";
import { uiSounds } from "../../lib/ui-sounds";
import { useUiPrefsStore } from "../../stores/uiPrefsStore";
import { useAuth } from "../../auth/AuthContext";
import { useAuthStore } from "../../stores/authStore";
import { publish as publishSystemEvent } from "../../lib/event-bus";
import { PhysicalAssessmentFormView } from "../shared/PhysicalAssessmentFormView";
import { StateCityFields } from "./StateCityFields";
import { AdminDashboardOverview } from "./AdminDashboardOverview";
import { AdminPaginationBar } from "./AdminPaginationBar";
import { AdminReports } from "./AdminReports";

type AdminSelfProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  birthDate: string | null;
  gender: "MALE" | "FEMALE" | null;
  city: string | null;
  state: string | null;
  role: string;
  status: string;
  provider: string;
  avatarUrl: string | null;
  createdAt?: string;
};

type AdminSection =
  | "overview"
  | "training"
  | "users"
  | "finance"
  | "programs"
  | "settings"
  | "profile"
  | "products"
  | "purchases"
  | "qr"
  | "cards"
  | "contact"
  | "favorites"
  | "ratings"
  | "assessments"
  | "events"
  | "trash";

const AdminSoundToggle = () => {
  const soundEnabled = useUiPrefsStore((state) => state.soundEnabled);
  const setSoundEnabled = useUiPrefsStore((state) => state.setSoundEnabled);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="m-0 text-lg font-extrabold text-sand">Efeitos sonoros</h3>
        <p className="m-0 text-sm text-sand-faint">Ative ou silencie os feedbacks do painel admin.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={soundEnabled}
          className={`rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${
            soundEnabled
              ? "border-brand-gold/50 bg-gradient-to-r from-brand-gold/25 to-brand-coral/15 text-sand"
              : "border-[color:var(--app-border)] bg-[var(--app-fill)] text-sand-muted"
          }`}
          onClick={() => {
            setSoundEnabled(true);
            uiSounds.toggleOn();
          }}
        >
          Com efeitos sonoros
        </button>
        <button
          type="button"
          aria-pressed={!soundEnabled}
          className={`rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${
            !soundEnabled
              ? "border-brand-gold/50 bg-gradient-to-r from-[var(--app-elev)] to-[var(--app-panel)] text-[color:var(--app-text)]"
              : "border-[color:var(--app-border)] bg-[var(--app-fill)] text-sand-muted"
          }`}
          onClick={() => {
            uiSounds.toggleOff();
            setSoundEnabled(false);
          }}
        >
          Sem efeitos sonoros
        </button>
      </div>
    </div>
  );
};

type CmsBlockExerciseDraft = {
  clientKey: string;
  exerciseId: string;
  sets: number;
  repsRange: string;
  prescriptionType: WorkoutPrescriptionType;
  repsMin: string;
  repsMax: string;
  durationSeconds: string;
  distanceMeters: string;
  rounds: string;
  workSeconds: string;
  intensityType: WorkoutIntensityType;
  intensityValue: string;
  tempo: string;
  side: string;
  executionNotes: string;
  initialLoad: string;
  restSeconds: string;
  supportMaterialUrl: string;
};

function createCmsBlockExerciseDraft(
  seed?: Partial<CmsBlockExerciseDraft> & { exerciseId?: string }
): CmsBlockExerciseDraft {
  return {
    clientKey: seed?.clientKey ?? `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId: seed?.exerciseId ?? "",
    sets: seed?.sets ?? 3,
    repsRange: seed?.repsRange ?? "10-12",
    prescriptionType: seed?.prescriptionType ?? "REPETITIONS",
    repsMin: seed?.repsMin ?? "",
    repsMax: seed?.repsMax ?? "",
    durationSeconds: seed?.durationSeconds ?? "",
    distanceMeters: seed?.distanceMeters ?? "",
    rounds: seed?.rounds ?? "",
    workSeconds: seed?.workSeconds ?? "",
    intensityType: seed?.intensityType ?? "NONE",
    intensityValue: seed?.intensityValue ?? "",
    tempo: seed?.tempo ?? "",
    side: seed?.side ?? "",
    executionNotes: seed?.executionNotes ?? "",
    initialLoad: seed?.initialLoad ?? "",
    restSeconds: seed?.restSeconds ?? "",
    supportMaterialUrl: seed?.supportMaterialUrl ?? ""
  };
}

function draftFromCmsExercise(entry: CmsWorkoutBlockRow["exercises"][number]): CmsBlockExerciseDraft {
  return createCmsBlockExerciseDraft({
    clientKey: entry.id,
    exerciseId: entry.exercise.id,
    sets: entry.sets,
    repsRange: entry.repsRange,
    prescriptionType: entry.prescriptionType,
    repsMin: entry.repsMin != null ? String(entry.repsMin) : "",
    repsMax: entry.repsMax != null ? String(entry.repsMax) : "",
    durationSeconds: entry.durationSeconds != null ? String(entry.durationSeconds) : "",
    distanceMeters: entry.distanceMeters != null ? String(entry.distanceMeters) : "",
    rounds: entry.rounds != null ? String(entry.rounds) : "",
    workSeconds: entry.workSeconds != null ? String(entry.workSeconds) : "",
    intensityType: entry.intensityType ?? "NONE",
    intensityValue: entry.intensityValue ?? "",
    tempo: entry.tempo ?? "",
    side: entry.side ?? "",
    executionNotes: entry.executionNotes ?? "",
    initialLoad: entry.initialLoad ?? "",
    restSeconds: entry.restSeconds != null ? String(entry.restSeconds) : "",
    supportMaterialUrl: entry.supportMaterialUrl ?? ""
  });
}

export function AdminView({ token, onLogout }: { token: string | null; onLogout: () => void }) {
  const { enterAdminPreview } = useAuth();
  const authUser = useAuthStore((state) => state.user);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [adminPreviewEntering, setAdminPreviewEntering] = useState(false);

  const goAdminSection = (section: AdminSection) => {
    if (section === "trash") uiSounds.trash();
    else uiSounds.pageChange();
    // Favoritos e avaliações compartilham a mesma tela.
    setAdminSection(section === "favorites" ? "ratings" : section);
    setAdminNavOpen(false);
  };

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
  const [cmsModalityImageJustSaved, setCmsModalityImageJustSaved] = useState(false);
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
  const [cmsBlockExerciseDrafts, setCmsBlockExerciseDrafts] = useState<CmsBlockExerciseDraft[]>(() => [
    createCmsBlockExerciseDraft()
  ]);
  const [editingCmsProgram, setEditingCmsProgram] = useState<CmsProgramRow | null>(null);
  const [cmsProgramFormOpen, setCmsProgramFormOpen] = useState(false);
  const [assigningCmsProgramId, setAssigningCmsProgramId] = useState<string | null>(null);
  const [cmsProgramFormModality, setCmsProgramFormModality] = useState("");
  const [cmsProgramsModalityFilter, setCmsProgramsModalityFilter] = useState("");
  const [cmsProgramDurationYears, setCmsProgramDurationYears] = useState(0);
  const [cmsProgramDurationMonths, setCmsProgramDurationMonths] = useState(0);
  const [cmsProgramDurationWeeks, setCmsProgramDurationWeeks] = useState(4);
  const [cmsProgramDurationExtraDays, setCmsProgramDurationExtraDays] = useState(0);
  const [cmsProgramPlannedSessions, setCmsProgramPlannedSessions] = useState(12);
  const [cmsProgramCycleLengthDays, setCmsProgramCycleLengthDays] = useState(7);
  const cmsProgramEstimatedDays = estimateProgramCalendarDays(
    cmsProgramDurationYears,
    cmsProgramDurationMonths,
    cmsProgramDurationWeeks,
    cmsProgramDurationExtraDays
  );
  const [expandedCmsProgramId, setExpandedCmsProgramId] = useState<string | null>(null);
  const cmsProgramDragRef = useRef<{ fromIndex: number; overIndex: number } | null>(null);
  const [cmsProgramDragState, setCmsProgramDragState] = useState<{ fromIndex: number; overIndex: number } | null>(null);
  const [adminTrash, setAdminTrash] = useState<AdminTrashData>(() =>
    Object.fromEntries(ALL_TRASH_KINDS.map((kind) => [kind, []])) as unknown as AdminTrashData
  );
  const [adminTrashLoading, setAdminTrashLoading] = useState(false);
  const [cmsTrashOpen, setCmsTrashOpen] = useState(false);
  const [pendingCmsDelete, setPendingCmsDelete] = useState<CmsDeleteTarget | null>(null);
  const [cmsWorkflowSummary, setCmsWorkflowSummary] = useState<CmsWorkflowSummary | null>(null);
  const [cmsPublishPreview, setCmsPublishPreview] = useState<CmsPublishPreview | null>(null);
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
  const cmsProgramFormWorkoutBlocks = cmsProgramFormModality
    ? cmsWorkoutBlocks.filter(
        (item) => !item.modality || item.modality.id === cmsProgramFormModality
      )
    : cmsWorkoutBlocks;
  const [cmsPrograms, setCmsPrograms] = useState<CmsProgramRow[]>([]);
  const filteredCmsPrograms = cmsProgramsModalityFilter
    ? cmsPrograms.filter((item) => item.modality?.id === cmsProgramsModalityFilter)
    : cmsPrograms;
  const publishedCmsPrograms = filteredCmsPrograms
    .filter((item) => item.status === "PUBLISHED" && item.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
  const draftCmsPrograms = filteredCmsPrograms
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
  const [savingStudentProfile, setSavingStudentProfile] = useState(false);
  const [adminStudentProfileFormKey, setAdminStudentProfileFormKey] = useState(0);
  const [managedUserSearch, setManagedUserSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"ALL" | AdminUser["role"]>("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState<"ALL" | AdminUser["status"]>("ALL");
  const [usersPage, setUsersPage] = useState(1);
  const [membershipsPage, setMembershipsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [ratingsPage, setRatingsPage] = useState(1);
  const [contactPage, setContactPage] = useState(1);
  const [cardsPage, setCardsPage] = useState(1);
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

  const FINANCE_MEMBERSHIPS_PAGE_SIZE = 8;
  const membershipsTotalPages = Math.max(1, Math.ceil(memberships.length / FINANCE_MEMBERSHIPS_PAGE_SIZE));
  const currentMembershipsPage = Math.min(membershipsPage, membershipsTotalPages);
  const visibleFinanceMemberships = memberships.slice(
    (currentMembershipsPage - 1) * FINANCE_MEMBERSHIPS_PAGE_SIZE,
    currentMembershipsPage * FINANCE_MEMBERSHIPS_PAGE_SIZE
  );
  const FINANCE_PAYMENTS_PAGE_SIZE = 10;
  const paymentsTotalPages = Math.max(1, Math.ceil(payments.length / FINANCE_PAYMENTS_PAGE_SIZE));
  const currentPaymentsPage = Math.min(paymentsPage, paymentsTotalPages);
  const visibleFinancePayments = payments.slice(
    (currentPaymentsPage - 1) * FINANCE_PAYMENTS_PAGE_SIZE,
    currentPaymentsPage * FINANCE_PAYMENTS_PAGE_SIZE
  );
  const PRODUCTS_PAGE_SIZE = 10;
  const productsTotalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PAGE_SIZE));
  const currentProductsPage = Math.min(productsPage, productsTotalPages);
  const visibleProducts = products.slice(
    (currentProductsPage - 1) * PRODUCTS_PAGE_SIZE,
    currentProductsPage * PRODUCTS_PAGE_SIZE
  );
  const PURCHASES_PAGE_SIZE = 15;
  const purchasesTotalPages = Math.max(1, Math.ceil(purchases.length / PURCHASES_PAGE_SIZE));
  const currentPurchasesPage = Math.min(purchasesPage, purchasesTotalPages);
  const visiblePurchases = purchases.slice(
    (currentPurchasesPage - 1) * PURCHASES_PAGE_SIZE,
    currentPurchasesPage * PURCHASES_PAGE_SIZE
  );
  const CONTACT_PAGE_SIZE = 10;
  const contactTotalPages = Math.max(1, Math.ceil(contactMessages.length / CONTACT_PAGE_SIZE));
  const currentContactPage = Math.min(contactPage, contactTotalPages);
  const visibleContactMessages = contactMessages.slice(
    (currentContactPage - 1) * CONTACT_PAGE_SIZE,
    currentContactPage * CONTACT_PAGE_SIZE
  );
  const FAVORITES_PAGE_SIZE = 10;
  const favoritesTotalPages = Math.max(1, Math.ceil(favorites.length / FAVORITES_PAGE_SIZE));
  const currentFavoritesPage = Math.min(favoritesPage, favoritesTotalPages);
  const visibleFavorites = favorites.slice(
    (currentFavoritesPage - 1) * FAVORITES_PAGE_SIZE,
    currentFavoritesPage * FAVORITES_PAGE_SIZE
  );
  const RATINGS_PAGE_SIZE = 10;
  const ratingsTotalPages = Math.max(1, Math.ceil(ratings.length / RATINGS_PAGE_SIZE));
  const currentRatingsPage = Math.min(ratingsPage, ratingsTotalPages);
  const visibleRatings = ratings.slice(
    (currentRatingsPage - 1) * RATINGS_PAGE_SIZE,
    currentRatingsPage * RATINGS_PAGE_SIZE
  );
  const CARDS_PAGE_SIZE = 10;
  const cardsTotalPages = Math.max(1, Math.ceil(paymentCards.length / CARDS_PAGE_SIZE));
  const currentCardsPage = Math.min(cardsPage, cardsTotalPages);
  const visiblePaymentCards = paymentCards.slice(
    (currentCardsPage - 1) * CARDS_PAGE_SIZE,
    currentCardsPage * CARDS_PAGE_SIZE
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
  const [adminNavOpen, setAdminNavOpen] = useState(false);
  const [cmsStep, setCmsStep] = useState<"locations" | "modalities" | "lessons" | "blocks" | "publish">("locations");
  const [adminProfile, setAdminProfile] = useState<AdminSelfProfile | null>(null);
  const [adminProfileEditing, setAdminProfileEditing] = useState(false);
  const [adminAvatarPreview, setAdminAvatarPreview] = useState<string | null>(null);
  const [adminProfileFormKey, setAdminProfileFormKey] = useState(0);
  const [adminProfileSaving, setAdminProfileSaving] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const syncCompactLayout = () => {
      if (media.matches) {
        setSidebarCollapsed(false);
      } else {
        setAdminNavOpen(false);
      }
    };
    syncCompactLayout();
    media.addEventListener("change", syncCompactLayout);
    return () => media.removeEventListener("change", syncCompactLayout);
  }, []);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const response = await apiGet<{ profile: AdminSelfProfile }>("/admin/me", token);
        setAdminProfile(response.profile);
      } catch {
        /* keep sidebar fallback from authUser */
      }
    })();
  }, [token]);

  function handleAdminAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setAdminAvatarPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAdminAvatarPreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCancelAdminProfileEdit() {
    setAdminProfileEditing(false);
    setAdminAvatarPreview(null);
    setAdminProfileFormKey((value) => value + 1);
  }

  async function saveAdminProfile(form: HTMLFormElement) {
    if (!token) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const document = String(data.get("document") ?? "").trim();
    const birthDate = String(data.get("birthDate") ?? "").trim();
    const gender = String(data.get("gender") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();
    const state = String(data.get("state") ?? "").trim();
    const password = String(data.get("password") ?? "").trim();
    const avatarFile = data.get("avatar");

    if (!name) {
      setFeedback("Informe o nome do administrador.");
      return;
    }
    if (!email) {
      setFeedback("Informe o e-mail do administrador.");
      return;
    }

    setAdminProfileSaving(true);
    setFeedback(null);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile instanceof File && avatarFile.size > 0) {
        const uploadData = new FormData();
        uploadData.append("file", avatarFile);
        const uploaded = await apiUpload<UploadResponse>("/admin/uploads?group=images", uploadData, token);
        uiSounds.screenshot();
        avatarUrl = uploaded.file.url;
      }

      const response = await apiPut<{ profile: AdminSelfProfile }>(
        "/admin/me",
        {
          name,
          email,
          phone: phone || "",
          document: document || "",
          birthDate: birthDate || "",
          gender: gender || "",
          city: city || "",
          state: state || "",
          password: password || undefined,
          avatarUrl
        },
        token
      );
      setAdminProfile(response.profile);
      useAuthStore.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              name: response.profile.name,
              email: response.profile.email,
              phone: response.profile.phone
            }
          : state.user
      }));
      setAdminProfileEditing(false);
      setAdminAvatarPreview(null);
      setAdminProfileFormKey((value) => value + 1);
      setSuccess("Perfil do administrador atualizado.");
      uiSounds.success();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o perfil."));
    } finally {
      setAdminProfileSaving(false);
    }
  }

  function handleUpdateAdminProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveAdminProfile(event.currentTarget);
  }

  function getApiErrorMessage(error: unknown, fallback: string) {
    return error instanceof ApiError ? error.message : fallback;
  }

  function optionalNumber(value: FormDataEntryValue | null) {
    const stringValue = String(value ?? "").trim();
    return stringValue ? Number(stringValue) : undefined;
  }

  async function fetchCmsWorkflowSummary() {
    const response = await apiGet<CmsWorkflowSummary>("/admin/cms/workflow-summary", token);
    setCmsWorkflowSummary(response);
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
    if (resources.some((resource) => ["modalities", "exercises", "workoutBlocks", "programs"].includes(resource))) {
      try {
        await fetchCmsWorkflowSummary();
      } catch {
        // Mantém o fluxo principal mesmo se o resumo do CMS falhar.
      }
    }
    setSuccess(successMessage);

    const scopes: Array<"training" | "locations" | "announcements" | "account"> = [];
    if (resources.some((resource) => ["modalities", "exercises", "workoutBlocks", "programs"].includes(resource))) {
      scopes.push("training");
    }
    if (resources.includes("locations")) {
      scopes.push("locations");
    }
    if (resources.includes("announcements") || resources.includes("events")) {
      scopes.push("announcements");
    }
    if (resources.some((resource) => ["users", "memberships", "payments", "plans"].includes(resource))) {
      scopes.push("account");
    }

    if (scopes.length > 0) {
      publishSystemEvent("CMS_ATUALIZADO", {
        scopes,
        resources,
        message: successMessage,
        source: "admin_save"
      });
    }
  }

  useEffect(() => {
    void loadAdminData();
    uiSounds.bootUp();
  }, [token]);

  useEffect(() => {
    if (!token || adminSection !== "training") return;
    void fetchCmsWorkflowSummary().catch(() => setCmsWorkflowSummary(null));
  }, [token, adminSection]);

  useEffect(() => {
    void loadAdminTrash();
  }, [token]);

  useEffect(() => {
    if (!success) return;
    uiSounds.success();
    const timeout = window.setTimeout(() => setSuccess(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  useEffect(() => {
    if (!feedback) return;
    if (/não foi|não possível|erro|falha/i.test(feedback)) uiSounds.error();
    else uiSounds.popupNotify();
  }, [feedback]);

  useEffect(() => {
    if (!cmsModalityImageJustSaved) return;

    const timeout = window.setTimeout(() => setCmsModalityImageJustSaved(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [cmsModalityImageJustSaved]);

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
      setSuccess(status === "ACTIVE" ? "Usuário ativado." : "Usuário desativado.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o status do usuário."));
    }
  }

  function openAdminStudentManager(studentId: string) {
    if (studentId !== selectedAdminStudentId) {
      setSelectedAdminStudent(null);
    }
    setSelectedAdminStudentId(studentId);
    setAdminStudentProfileFormKey((key) => key + 1);
    window.requestAnimationFrame(() => {
      document.getElementById("admin-user-manager")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleUpdateAdminStudentProfile(event: FormEvent<HTMLFormElement>, studentId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();

    if (name.length < 2) {
      setFeedback("Informe um nome válido (mínimo 2 caracteres).");
      return;
    }
    if (!email) {
      setFeedback("Informe um e-mail válido.");
      return;
    }

    setSavingStudentProfile(true);
    setFeedback(null);
    try {
      await apiPut(
        `/admin/users/${studentId}`,
        {
          name,
          email,
          phone: String(data.get("phone") ?? "").trim() || undefined,
          document: String(data.get("document") ?? "").trim() || undefined,
          gender: String(data.get("gender") ?? ""),
          objective: String(data.get("objective") ?? "").trim() || undefined,
          level: String(data.get("level") ?? "").trim() || undefined,
          city: String(data.get("city") ?? "").trim() || undefined,
          state: String(data.get("state") ?? "").trim() || undefined,
          status: String(data.get("status") ?? "ACTIVE"),
          locationId: String(data.get("locationId") ?? "").trim() || ""
        },
        token
      );
      await refreshAdminStudentOverview();
      setAdminStudentProfileFormKey((key) => key + 1);
      setSuccess("Perfil do aluno atualizado com sucesso.");
      uiSounds.success();
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o perfil do aluno."));
    } finally {
      setSavingStudentProfile(false);
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
    // Ignora querystring ao detectar extensão (.gif?resize=... continua imagem).
    const pathOnly = lower.split(/[?#]/)[0] ?? lower;
    if (/youtu\.?be/.test(lower)) return "youtube";
    if (lower.startsWith("data:image") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(pathOnly)) return "image";
    if (lower.startsWith("data:video") || /\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(pathOnly)) return "video";
    if (lower.startsWith("data:audio") || /\.(mp3|wav|oga|m4a|aac)$/.test(pathOnly)) return "audio";
    if (/\.pdf$/.test(pathOnly)) return "pdf";
    // URL http(s) sem extensão clara: tenta como imagem (GIFs/CDNs comuns).
    if (/^https?:\/\//.test(lower)) return "image";
    return "file";
  }

  function cmsYouTubeVideoId(url: string) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return match ? match[1] : "";
  }

  function cmsExerciseThumbSrc(videoUrl?: string | null) {
    const url = String(videoUrl ?? "").trim();
    if (!url) return "";

    const kind = cmsMediaKind(url);
    if (kind === "youtube") {
      const id = cmsYouTubeVideoId(url);
      return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
    }
    // Mantém qualquer URL cadastrada visível (externa, upload, assets).
    return url.startsWith("data:") ? url : mediaUrl(url);
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
        const response = await apiPut<{ modality: CmsModalityRow }>(
          `/admin/cms/modalities/${editingCmsModality.id}`,
          payload,
          token
        );
        setCmsModalityImagePreview(null);
        setCmsModalityImageRemove(false);
        if (cmsModalityImageRef.current) {
          cmsModalityImageRef.current.value = "";
        }
        if (uploadedImage || cmsModalityImageRemove) {
          setCmsModalityImageJustSaved(true);
        }
        setEditingCmsModality(response.modality);
        await applyAdminChange(["modalities"], "Modalidade atualizada com sucesso.");
        return;
      }

      const response = await apiPost<{ modality: CmsModalityRow }>(
        "/admin/cms/modalities",
        payload,
        token
      );
      form.reset();
      setCmsModalityImagePreview(null);
      setCmsModalityImageRemove(false);
      if (cmsModalityImageRef.current) {
        cmsModalityImageRef.current.value = "";
      }
      if (uploadedImage || cmsModalityImageRemove) {
        setCmsModalityImageJustSaved(true);
      }
      setEditingCmsModality(response.modality);
      await applyAdminChange(["modalities"], "Modalidade cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a modalidade."));
    }
  }

  function startEditCmsModality(item: CmsModalityRow) {
    setEditingCmsModality(item);
    setCmsModalityImagePreview(null);
    setCmsModalityImageRemove(false);
    setCmsModalityImageJustSaved(false);
    if (cmsModalityImageRef.current) {
      cmsModalityImageRef.current.value = "";
    }
  }

  function handleCancelCmsModalityEdit() {
    setEditingCmsModality(null);
    setCmsModalityImagePreview(null);
    setCmsModalityImageRemove(false);
    setCmsModalityImageJustSaved(false);
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
    setCmsModalityImageJustSaved(false);
    const reader = new FileReader();
    reader.onload = () => setCmsModalityImagePreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleCmsModalityImageClear() {
    setCmsModalityImagePreview(null);
    setCmsModalityImageJustSaved(false);
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
        await applyAdminChange(["locations"], "Unidade atualizada com sucesso.");
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
      await applyAdminChange(["locations"], "Unidade cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a unidade."));
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
      await applyAdminChange(["locations"], isActive ? "Unidade reativada." : "Unidade desativada.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a unidade."));
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

  function parseCmsWorkoutBlockExercisesFromDrafts(drafts: CmsBlockExerciseDraft[]) {
    const optionalNumber = (value: string) => {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : Number(trimmed);
    };

    return drafts
      .filter((draft) => draft.exerciseId.trim())
      .map((draft, index) => ({
        exerciseId: draft.exerciseId.trim(),
        sets: Number(draft.sets) || 3,
        repsRange: draft.repsRange.trim() || "10-12",
        prescriptionType: draft.prescriptionType,
        repsMin: optionalNumber(draft.repsMin),
        repsMax: optionalNumber(draft.repsMax),
        durationSeconds: optionalNumber(draft.durationSeconds),
        distanceMeters: optionalNumber(draft.distanceMeters),
        rounds: optionalNumber(draft.rounds),
        workSeconds: optionalNumber(draft.workSeconds),
        intensityType: draft.intensityType,
        intensityValue: draft.intensityValue.trim(),
        tempo: draft.tempo.trim(),
        side: draft.side.trim(),
        executionNotes: draft.executionNotes.trim(),
        initialLoad: draft.initialLoad.trim(),
        restSeconds: optionalNumber(draft.restSeconds),
        supportMaterialUrl: draft.supportMaterialUrl.trim(),
        order: index + 1
      }));
  }

  function updateCmsBlockExerciseDraft(
    clientKey: string,
    patch: Partial<CmsBlockExerciseDraft>
  ) {
    setCmsBlockExerciseDrafts((current) =>
      current.map((draft) => (draft.clientKey === clientKey ? { ...draft, ...patch } : draft))
    );
  }

  function addCmsBlockExerciseDraft() {
    setCmsBlockExerciseDrafts((current) => {
      if (current.length >= 20) return current;
      return [...current, createCmsBlockExerciseDraft()];
    });
  }

  function removeCmsBlockExerciseDraft(clientKey: string) {
    setCmsBlockExerciseDrafts((current) => {
      if (current.length <= 1) {
        return [createCmsBlockExerciseDraft()];
      }
      return current.filter((draft) => draft.clientKey !== clientKey);
    });
  }

  function resetCmsBlockExerciseDrafts() {
    setCmsBlockExerciseDrafts([createCmsBlockExerciseDraft()]);
  }

  function parseCmsProgramDays(data: FormData) {
    const cycleLengthDays = Math.max(1, Math.min(56, Number(data.get("cycleLengthDays") ?? cmsProgramCycleLengthDays) || 7));
    return Array.from({ length: cycleLengthDays })
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
        await applyAdminChange(["exercises", "workoutBlocks"], "Exercício atualizado com sucesso.");
        return;
      }

      await apiPost("/admin/cms/exercises", payload, token);
      form.reset();
      setCmsLessonFilePreview(null);
      setCmsLessonFileRemove(false);
      setCmsMaterialFilePreview(null);
      setCmsMaterialFileRemove(false);
      await applyAdminChange(["exercises", "workoutBlocks"], "Exercício cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar o exercício."));
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
      if (!selectedModalityId) {
        setFeedback("Selecione a modalidade da divisão antes de salvar.");
        return;
      }
      const exercises = parseCmsWorkoutBlockExercisesFromDrafts(cmsBlockExerciseDrafts);
      if (exercises.length === 0) {
        setFeedback("Cadastre ao menos um exercício na divisão.");
        return;
      }
      const payload = {
        title: String(data.get("title") ?? ""),
        identifier: String(data.get("identifier") || data.get("title") || ""),
        focus: String(data.get("focus") ?? ""),
        weeklyFrequency: Number(data.get("weeklyFrequency") ?? 1),
        structureType: String(data.get("structureType") ?? "NORMAL"),
        restTime: Number(data.get("restTime") ?? 60),
        protocolRounds: String(data.get("protocolRounds") ?? "").trim() === "" ? undefined : Number(data.get("protocolRounds")),
        workSeconds: String(data.get("workSeconds") ?? "").trim() === "" ? undefined : Number(data.get("workSeconds")),
        timeCapSeconds: String(data.get("timeCapSeconds") ?? "").trim() === "" ? undefined : Number(data.get("timeCapSeconds")),
        instructions: String(data.get("instructions") ?? "").trim(),
        modalityId: selectedModalityId,
        exercises
      };

      if (editingCmsWorkoutBlock) {
        await apiPut(`/admin/cms/workout-blocks/${editingCmsWorkoutBlock.id}`, payload, token);
        form.reset();
        setEditingCmsWorkoutBlock(null);
        setCmsBlockFormModality("");
        resetCmsBlockExerciseDrafts();
        await applyAdminChange(["workoutBlocks", "programs"], "Divisão atualizada com sucesso.");
        return;
      }

      await apiPost("/admin/cms/workout-blocks", payload, token);
      form.reset();
      setCmsBlockFormModality("");
      resetCmsBlockExerciseDrafts();
      await applyAdminChange(["workoutBlocks", "programs"], "Divisão cadastrada com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a divisão."));
    }
  }

  function startEditCmsWorkoutBlock(item: CmsWorkoutBlockRow) {
    setEditingCmsWorkoutBlock(item);
    setCmsBlockFormModality(item.modality?.id ?? "");
    setCmsBlockExerciseDrafts(
      item.exercises.length > 0 ? item.exercises.map(draftFromCmsExercise) : [createCmsBlockExerciseDraft()]
    );
  }

  function handleCancelCmsWorkoutBlockEdit() {
    setEditingCmsWorkoutBlock(null);
    setCmsBlockFormModality("");
    resetCmsBlockExerciseDrafts();
  }

  async function handlePublishCmsWorkoutBlock(
    item: CmsWorkoutBlockRow,
    targetGender: CmsProgramRow["targetGender"] = "ALL"
  ) {
    if (!item.modality?.id) {
      setFeedback("Vincule uma modalidade à divisão antes de publicar para os alunos.");
      return;
    }
    if (item.exercises.length === 0) {
      setFeedback("Cadastre ao menos um exercício na divisão antes de publicar.");
      return;
    }

    try {
      const response = await apiPost<{
        program: { id: string; title: string; audienceMode: CmsProgramRow["audienceMode"] };
        assignedCount: number;
      }>(`/admin/cms/workout-blocks/${item.id}/publish`, {
        targetGender,
        audienceMode: "ALL_ACTIVE",
        durationWeeks: 4
      }, token);
      publishSystemEvent("PROGRAMA_PUBLICADO", {
        programId: response.program.id,
        programTitle: response.program.title,
        audienceMode: response.program.audienceMode,
        eligibleStudentCount: response.assignedCount,
        source: "cms_publish"
      });
      await applyAdminChange(
        ["workoutBlocks", "programs"],
        `Divisão publicada: "${response.program.title}" (${response.assignedCount} aluno(s) elegível(eis)).`
      );
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível publicar a divisão para os alunos."));
    }
  }

  async function handleSaveCmsProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const status = String(data.get("status") ?? "DRAFT");
    const durationYears = Math.max(0, Number(data.get("durationYears") ?? cmsProgramDurationYears) || 0);
    const durationMonths = Math.max(0, Number(data.get("durationMonths") ?? cmsProgramDurationMonths) || 0);
    const durationWeeks = Math.max(0, Number(data.get("durationWeeks") ?? cmsProgramDurationWeeks) || 0);
    const durationExtraDays = Math.max(0, Number(data.get("durationExtraDays") ?? cmsProgramDurationExtraDays) || 0);
    const durationDays = estimateProgramCalendarDays(durationYears, durationMonths, durationWeeks, durationExtraDays);
    const plannedSessions = Math.max(1, Number(data.get("plannedSessions") ?? cmsProgramPlannedSessions) || 1);
    const payload = {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      modalityId: String(data.get("modalityId") ?? ""),
      durationYears,
      durationMonths,
      durationWeeks,
      durationExtraDays,
      durationDays,
      plannedSessions,
      completionMode: String(data.get("completionMode") ?? "BY_SESSIONS"),
      scheduleType: String(data.get("scheduleType") ?? "ROTATING_CYCLE"),
      audienceMode: String(data.get("audienceMode") ?? "ALL_ACTIVE"),
      cycleLengthDays: Math.max(1, Number(data.get("cycleLengthDays") ?? cmsProgramCycleLengthDays) || 7),
      targetGender: String(data.get("targetGender") ?? "ALL"),
      totalWorkouts: plannedSessions,
      status,
      isActive: status === "PUBLISHED",
      days: parseCmsProgramDays(data)
    };

    try {
      if (editingCmsProgram) {
        await apiPut(`/admin/cms/programs/${editingCmsProgram.id}`, payload, token);
        form.reset();
        setEditingCmsProgram(null);
        setCmsProgramFormOpen(false);
        setCmsProgramFormModality("");
        setCmsProgramDurationYears(0);
        setCmsProgramDurationMonths(0);
        setCmsProgramDurationWeeks(4);
        setCmsProgramDurationExtraDays(0);
        setCmsProgramPlannedSessions(12);
        setCmsProgramCycleLengthDays(7);
        await applyAdminChange(["programs"], "Treino atualizado com sucesso.");
        return;
      }

      await apiPost("/admin/cms/programs", payload, token);
      form.reset();
      setCmsProgramFormOpen(false);
      setCmsProgramFormModality("");
      setCmsProgramDurationYears(0);
      setCmsProgramDurationMonths(0);
      setCmsProgramDurationWeeks(4);
      setCmsProgramDurationExtraDays(0);
      setCmsProgramPlannedSessions(12);
      setCmsProgramCycleLengthDays(7);
      await applyAdminChange(["programs"], "Treino cadastrado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar o treino."));
    }
  }

  function startEditCmsProgram(item: CmsProgramRow) {
    setEditingCmsProgram(item);
    setCmsProgramFormOpen(true);
    setCmsProgramFormModality(item.modality?.id ?? "");
    setCmsProgramDurationYears(item.durationYears ?? 0);
    setCmsProgramDurationMonths(item.durationMonths ?? 0);
    setCmsProgramDurationWeeks(item.durationWeeks ?? 4);
    setCmsProgramDurationExtraDays(item.durationExtraDays ?? 0);
    setCmsProgramPlannedSessions(item.plannedSessions ?? item.totalWorkouts ?? 1);
    setCmsProgramCycleLengthDays(item.cycleLengthDays ?? 7);
    setExpandedCmsProgramId(item.id);
    window.setTimeout(() => {
      document.getElementById("cms-program-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleCancelCmsProgramEdit() {
    setEditingCmsProgram(null);
    setCmsProgramFormOpen(false);
    setCmsProgramFormModality("");
    setCmsProgramDurationYears(0);
    setCmsProgramDurationMonths(0);
    setCmsProgramDurationWeeks(4);
    setCmsProgramDurationExtraDays(0);
    setCmsProgramPlannedSessions(12);
    setCmsProgramCycleLengthDays(7);
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
      setFeedback("Ordem dos treinos atualizada para os alunos.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível salvar a nova ordem dos treinos."));
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
      const response = await apiGet<{ preview: CmsPublishPreview }>(
        `/admin/cms/programs/${programId}/publish-preview`,
        token
      );
      setCmsPublishPreview(response.preview);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível validar a publicação do treino."));
    }
  }

  async function confirmPublishCmsProgram() {
    if (!cmsPublishPreview) return;

    try {
      await apiPost(`/admin/cms/programs/${cmsPublishPreview.programId}/publish`, {}, token);
      publishSystemEvent("PROGRAMA_PUBLICADO", {
        programId: cmsPublishPreview.programId,
        programTitle: cmsPublishPreview.title,
        audienceMode: cmsPublishPreview.audienceMode,
        eligibleStudentCount: cmsPublishPreview.eligibleStudentCount,
        source: "cms_publish"
      });
      setCmsPublishPreview(null);
      await applyAdminChange(
        ["programs"],
        cmsPublishPreview.audienceMode === "ALL_ACTIVE"
          ? `Treino publicado para ${cmsPublishPreview.eligibleStudentCount} aluno(s) ativo(s) elegível(eis).`
          : "Treino publicado. Atribua os alunos selecionados para liberar o acesso."
      );
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível publicar o treino."));
    }
  }

  async function handleArchiveCmsProgram(programId: string) {
    try {
      await apiPost(`/admin/cms/programs/${programId}/archive`, {}, token);
      await applyAdminChange(["programs"], "Treino arquivado.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível arquivar o treino."));
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
      await applyAdminChange(["workoutBlocks"], "Divisão atualizada.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a divisão."));
    }
  }

  async function handleUpdateCmsProgramGender(programId: string, targetGender: CmsProgramRow["targetGender"]) {
    try {
      await apiPut(`/admin/cms/programs/${programId}`, { targetGender }, token);
      await applyAdminChange(
        ["programs"],
        targetGender === "ALL"
          ? "Público atualizado para todos os alunos."
          : targetGender === "MALE"
            ? "Público atualizado: apenas alunos masculinos receberão este treino."
            : "Público atualizado: apenas alunas femininas receberão este treino."
      );
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar o público do treino."));
    }
  }

  async function handleUpdateCmsProgramModality(programId: string, modalityId: string) {
    if (!modalityId) return;
    try {
      await apiPut(`/admin/cms/programs/${programId}`, { modalityId }, token);
      await applyAdminChange(["programs", "workoutBlocks"], "Modalidade do treino atualizada.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atualizar a modalidade do treino."));
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
      await applyAdminChange(["programs"], "Treino atribuído aos alunos.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível atribuir o treino aos alunos."));
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
    const priceInCents = parseBRLMoneyToCents(String(data.get("price") ?? ""));

    if (priceInCents == null || priceInCents < 1) {
      setFeedback("Informe um valor válido (ex.: 0,10 ou 29,90).");
      return;
    }

    try {
      await apiPost(
        "/admin/plans",
        {
          code: String(data.get("code") ?? ""),
          name: String(data.get("name") ?? ""),
          priceInCents,
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
    const amountInCents = parseBRLMoneyToCents(String(data.get("amount") ?? ""));

    if (amountInCents == null || amountInCents < 1) {
      setFeedback("Informe um valor válido (ex.: 0,10 ou 29,90).");
      return;
    }

    try {
      await apiPost(
        "/admin/payments",
        {
          membershipId: String(data.get("membershipId") ?? ""),
          amountInCents,
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
      if (status === "CONFIRMED") uiSounds.paymentApproved();
      else if (status === "CANCELED" || status === "OVERDUE" || status === "REFUNDED") uiSounds.paymentDisconnected();
      else uiSounds.itemSelect();
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
    if (file) uiSounds.screenshot();
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
                <button type="button" className={dangerButtonClass} aria-label={`Excluir em definitivo ${label}: ${item.name}`} onClick={() => setPendingCmsDelete({ kind, id: item.id, name: item.name, permanent: true })}>
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
    {
      key: "module_ratings",
      label: "Favoritos e avaliações",
      description: "Favoritos e notas de produtos/treinos (ativa os dois módulos juntos).",
      syncKeys: ["module_ratings", "module_favorites"]
    }
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
      title: trainingCopy.adminStepLocations,
      text: "Gerencie academias, unidades ou clubes.",
      metric: `${cmsLocations.filter((item) => item.isActive).length} ativa(s)`
    },
    {
      id: "modalities" as const,
      icon: Dumbbell,
      title: trainingCopy.adminStepModalities,
      text: "Crie categorias de treino para organizar o catálogo.",
      metric: `${cmsWorkflowSummary?.modalities.active ?? cmsModalities.filter((item) => item.isActive).length} ativa(s)`
    },
    {
      id: "lessons" as const,
      icon: UploadCloud,
      title: trainingCopy.adminStepExercises,
      text: "Crie, edite e exclua exercícios e materiais de apoio.",
      metric:
        cmsWorkflowSummary && cmsWorkflowSummary.exercises.withoutModality > 0
          ? `${cmsWorkflowSummary.exercises.total} exercício(s) • ${cmsWorkflowSummary.exercises.withoutModality} sem modalidade`
          : `${cmsWorkflowSummary?.exercises.total ?? cmsExercises.length} exercício(s)`
    },
    {
      id: "blocks" as const,
      icon: ClipboardList,
      title: trainingCopy.adminStepDivisions,
      text: "Monte a ficha, vincule a modalidade e publique direto para os alunos.",
      metric:
        cmsWorkflowSummary && (cmsWorkflowSummary.workoutBlocks.unpublished > 0 || cmsWorkflowSummary.workoutBlocks.withoutModality > 0)
          ? `${cmsWorkflowSummary.workoutBlocks.total} divisão(ões) • ${cmsWorkflowSummary.workoutBlocks.unpublished} sem publicar`
          : `${cmsWorkflowSummary?.workoutBlocks.total ?? cmsWorkoutBlocks.length} divisão(ões)`
    },
    {
      id: "publish" as const,
      icon: Check,
      title: trainingCopy.adminStepPublish,
      text: "Ciclos multi-dia (ABC) e rascunhos avançados com público e duração.",
      metric:
        cmsWorkflowSummary
          ? `${cmsWorkflowSummary.programs.published} publicado(s) • ${cmsWorkflowSummary.programs.draftsReady} pronto(s)`
          : `${cmsPublishedCount} publicado(s)`
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
    <main
      className={[
        "admin-workspace-shell grid min-h-screen bg-hero-grid text-sand max-[980px]:grid-cols-1",
        sidebarCollapsed
          ? "sidebar-collapsed grid-cols-[78px_minmax(0,1fr)]"
          : "grid-cols-[280px_minmax(0,1fr)]",
        adminNavOpen ? "admin-nav-open" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside
        className="workspace-sidebar sticky top-0 grid max-h-screen min-h-0 content-stretch gap-[22px] self-start overflow-y-auto border-r border-[color:var(--app-border)] bg-gradient-to-br from-ink-panel/90 to-ink px-[18px] py-[22px] shadow-[inset_-1px_0_rgba(240,180,90,0.08)] min-[981px]:min-h-screen min-[981px]:grid-rows-[auto_1fr_auto]"
        aria-label="Menu administrativo"
      >
        <div className="workspace-sidebar-brand flex min-w-0 items-center gap-3 border-b-0 pb-2">
          <button
            type="button"
            className="admin-brand-profile flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left text-sand transition hover:text-brand-gold"
            onClick={() => goAdminSection("profile")}
            aria-label="Abrir perfil do administrador"
            title="Meu perfil"
          >
            <span className="admin-brand-avatar grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[color:var(--app-border-strong)] bg-gradient-to-br from-brand-gold/20 to-[var(--app-fill)]">
              {adminProfile?.avatarUrl ? (
                <img src={mediaUrl(adminProfile.avatarUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={18} />
              )}
            </span>
            <div className="admin-brand-copy grid min-w-0 flex-1 gap-0.5">
              <strong className="truncate text-[15px] font-extrabold leading-tight text-sand normal-case">
                {adminProfile?.name ?? authUser?.name ?? "Admin"}
              </strong>
              <span className="truncate text-[11px] font-extrabold uppercase tracking-wide text-sand-muted">
                {adminProfile?.role === "ADMIN" || authUser?.role === "ADMIN"
                  ? "Administrador"
                  : "Operador"}
              </span>
            </div>
          </button>
          <button
            type="button"
            className="sidebar-toggle ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-sand-muted transition hover:bg-brand-gold/10 hover:text-brand-gold max-[980px]:hidden"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="admin-mobile-toolbar ml-auto shrink-0 items-center gap-[15px]">
            {adminSection !== "settings" && <ThemeModeSwitch compact />}
            <button
              type="button"
              className="admin-mobile-menu-toggle grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-fill)] text-sand transition hover:border-brand-gold/40 hover:text-brand-gold"
              aria-label={adminNavOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={adminNavOpen}
              onClick={() => setAdminNavOpen((value) => !value)}
            >
              {adminNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        <nav className="workspace-nav grid gap-2" id="admin-workspace-nav">
          <span className="admin-nav-group-label">Principal</span>
          <button className={adminSection === "overview" ? "active" : ""} onClick={() => goAdminSection("overview")}>
            <Home size={18} />
            <span className="sidebar-label">Dashboard</span>
          </button>

          <span className="admin-nav-group-label">Conteúdo e membros</span>
          <button
            className={adminSection === "training" ? "active" : ""}
            onClick={() => { goAdminSection("training"); setCmsStep("locations"); }}
          >
            <Dumbbell size={18} />
            <span className="sidebar-label">{trainingCopy.adminSidebar}</span>
          </button>
          <button
            className={adminSection === "users" ? "active" : ""}
            onClick={() => goAdminSection("users")}
          >
            <UsersRound size={18} />
            <span className="sidebar-label">Dados do usuário</span>
          </button>
          <button className={adminSection === "finance" ? "active" : ""} onClick={() => goAdminSection("finance")}>
            <CircleDollarSign size={18} />
            <span className="sidebar-label">Financeiro</span>
          </button>

          <span className="admin-nav-group-label">Comercial</span>
          <button className={adminSection === "products" ? "active" : ""} onClick={() => goAdminSection("products")}>
            <Package size={18} />
            <span className="sidebar-label">Produtos</span>
          </button>
          <button className={adminSection === "purchases" ? "active" : ""} onClick={() => goAdminSection("purchases")}>
            <ShoppingCart size={18} />
            <span className="sidebar-label">Compras</span>
          </button>
          <button className={adminSection === "qr" ? "active" : ""} onClick={() => goAdminSection("qr")}>
            <QrCode size={18} />
            <span className="sidebar-label">QR Code</span>
          </button>
          <button className={adminSection === "cards" ? "active" : ""} onClick={() => goAdminSection("cards")}>
            <CreditCard size={18} />
            <span className="sidebar-label">Meus Cartões</span>
          </button>

          <span className="admin-nav-group-label">Avaliação e eventos</span>
          <button className={adminSection === "assessments" ? "active" : ""} onClick={() => goAdminSection("assessments")}>
            <Ruler size={18} />
            <span className="sidebar-label">Avaliações físicas</span>
          </button>
          <button className={adminSection === "events" ? "active" : ""} onClick={() => goAdminSection("events")}>
            <CalendarPlus size={18} />
            <span className="sidebar-label">Eventos</span>
          </button>

          <span className="admin-nav-group-label">Relacionamento</span>
          <button className={adminSection === "contact" ? "active" : ""} onClick={() => goAdminSection("contact")}>
            <MessageCircle size={18} />
            <span className="sidebar-label">Contato</span>
            {unreadTicketsCount > 0 && <span className="admin-nav-badge">{unreadTicketsCount}</span>}
          </button>
          <button className={adminSection === "ratings" ? "active" : ""} onClick={() => goAdminSection("ratings")}>
            <Star size={18} />
            <span className="sidebar-label">Favoritos e avaliações</span>
          </button>

          <span className="admin-nav-group-label">Sistema</span>
          <button className={adminSection === "profile" ? "active" : ""} onClick={() => goAdminSection("profile")}>
            <UserRound size={18} />
            <span className="sidebar-label">Meu perfil</span>
          </button>
          <button className={adminSection === "trash" ? "active" : ""} onClick={() => goAdminSection("trash")}>
            <Trash2 size={18} />
            <span className="sidebar-label">Lixeira</span>
            {adminTrashTotal > 0 && <span className="admin-nav-badge">{adminTrashTotal}</span>}
          </button>
          <button className={adminSection === "settings" ? "active" : ""} onClick={() => goAdminSection("settings")}>
            <Settings size={18} />
            <span className="sidebar-label">Configurações</span>
          </button>
        </nav>
        <button
            className="workspace-logout mt-3 flex w-full min-h-[44px] items-center justify-start gap-2.5 rounded-lg border border-brand-ember/35 bg-brand-ember/10 px-3 text-left text-[13px] font-extrabold transition hover:border-brand-ember/55 hover:bg-brand-ember/15"
          onClick={() => {
            uiSounds.disconnect();
            onLogout();
          }}
        >
          <LogOut size={18} />
          <span className="sidebar-label">Sair</span>
        </button>
      </aside>
      <section className="workspace-content admin-workspace-content min-w-0 p-[clamp(28px,4vw,48px)]">
      <section
        className={`dashboard-heading mb-[22px] grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[18px]${adminSection === "profile" ? " hidden" : ""}`}
        id="admin-overview"
      >
        <div className="grid gap-3">
          <span className="eyebrow w-fit">Painel administrativo</span>
          <h1 className="font-display m-0 text-[clamp(28px,3vw,40px)] font-semibold uppercase leading-tight tracking-tight text-sand">
            Operação do App Treino
          </h1>
        </div>
        <div className="dashboard-actions flex flex-wrap justify-end gap-2.5">
          {adminSection !== "settings" && (
            <ThemeModeSwitch compact className="admin-desktop-theme-switch" />
          )}
          <button className="outline-button compact-button" onClick={() => void loadAdminData()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            Atualizar
          </button>
          <button
            className="primary-button compact-button admin-publish-shortcut"
            onClick={() => {
              goAdminSection("training");
              setCmsStep("publish");
            }}
            type="button"
          >
            <UploadCloud size={18} />
            {trainingCopy.adminStepPublish}
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
          <div className={panelTitleClass}>
            <div>
              <h2>Usuários</h2>
              <p>Cadastre novos usuários e use Editar para alterar os dados do aluno abaixo.</p>
            </div>
            <span>{filteredAdminUsers.length}/{users.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreateUser}>
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
                          <button type="button" onClick={() => openAdminStudentManager(item.id)}>
                            Editar
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
            <div className={panelTitleClass}>
              <div>
                <h2>Editar aluno</h2>
                <p>Selecione um aluno na lista acima (botão Editar) ou pelo seletor abaixo para alterar o cadastro.</p>
              </div>
              <span>{studentOverviewLoading ? "Carregando…" : selectedAdminStudent?.student.name ?? "Nenhum aluno selecionado"}</span>
            </div>
            <div className="admin-student-toolbar">
              <label className="admin-student-filter">
                Buscar aluno
                <input
                  value={managedUserSearch}
                  onChange={(event) => setManagedUserSearch(event.target.value)}
                  placeholder="Nome, e-mail, telefone ou documento"
                />
              </label>
              <select
                aria-label="Selecionar aluno"
                value={selectedAdminStudentId ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (!nextId) {
                    setSelectedAdminStudentId(null);
                    return;
                  }
                  openAdminStudentManager(nextId);
                }}
              >
                <option value="">Selecione um aluno</option>
                {managerUserOptions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {selectedAdminStudentId && (
                <button className="outline-button compact-button" type="button" onClick={() => setSelectedAdminStudentId(null)}>
                  <ChevronLeft size={18} />
                  Fechar edição
                </button>
              )}
            </div>
            {studentOverviewLoading && !selectedAdminStudent ? (
              <div className="settings-card">
                <Loader2 className="spin" size={20} />
                <span>
                  <strong>Carregando aluno…</strong>
                  Aguarde enquanto buscamos o cadastro completo.
                </span>
              </div>
            ) : selectedAdminStudent && selectedAdminStudent.student.id === selectedAdminStudentId ? (
              <>
            <div className="admin-student-summary-grid">
              <span><UserRound size={18} /><strong>{selectedAdminStudent.student.status === "ACTIVE" ? "Ativo" : "Inativo"}</strong><small>Status</small></span>
              <span><Dumbbell size={18} /><strong>{selectedAdminStudent.summary.completedWorkoutSessions}</strong><small>Treinos concluídos</small></span>
              <span><CalendarDays size={18} /><strong>{selectedAdminStudent.summary.attendanceThisMonth}</strong><small>Frequência no mês</small></span>
              <span><CreditCard size={18} /><strong>{selectedAdminStudent.summary.pendingPayments}</strong><small>Pagamentos pendentes</small></span>
              <span><Headphones size={18} /><strong>{selectedAdminStudent.summary.openTickets}</strong><small>Atendimentos abertos</small></span>
            </div>

            <section className="admin-student-section-grid">
              <article className="admin-student-module admin-student-module--profile">
                <div className="admin-student-module-title">
                  <UserRound size={18} />
                  <strong>Dados cadastrais</strong>
                </div>
                <form
                  key={`admin-student-profile-${selectedAdminStudent.student.id}-${adminStudentProfileFormKey}`}
                  className={`${crudFormClass} admin-student-profile-form`}
                  onSubmit={(event) => void handleUpdateAdminStudentProfile(event, selectedAdminStudent.student.id)}
                >
                  <label>
                    Nome
                    <input name="name" defaultValue={selectedAdminStudent.student.name} placeholder="Nome completo" required minLength={2} />
                  </label>
                  <label>
                    E-mail
                    <input name="email" type="email" defaultValue={selectedAdminStudent.student.email ?? ""} placeholder="E-mail" required />
                  </label>
                  <label>
                    Telefone
                    <input name="phone" defaultValue={selectedAdminStudent.student.phone ?? selectedAdminStudent.student.profile?.phone ?? ""} placeholder="Telefone" />
                  </label>
                  <label>
                    Documento
                    <input name="document" defaultValue={selectedAdminStudent.student.profile?.document ?? ""} placeholder="CPF / documento" />
                  </label>
                  <label>
                    Sexo
                    <select name="gender" defaultValue={selectedAdminStudent.student.profile?.gender ?? ""}>
                      <option value="">Não informado</option>
                      <option value="MALE">Masculino</option>
                      <option value="FEMALE">Feminino</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={selectedAdminStudent.student.status}>
                      <option value="ACTIVE">Ativo</option>
                      <option value="INACTIVE">Inativo</option>
                    </select>
                  </label>
                  <label>
                    Objetivo
                    <input name="objective" defaultValue={selectedAdminStudent.student.profile?.objective ?? ""} placeholder="Ex.: Hipertrofia" />
                  </label>
                  <label>
                    Nível
                    <input name="level" defaultValue={selectedAdminStudent.student.profile?.level ?? ""} placeholder="Ex.: Iniciante" />
                  </label>
                  <StateCityFields
                    withLabels
                    stateDefault={selectedAdminStudent.student.profile?.state ?? ""}
                    cityDefault={selectedAdminStudent.student.profile?.city ?? ""}
                  />
                  <label className={wideFieldClass}>
                    Unidade
                    <select name="locationId" defaultValue={selectedAdminStudent.student.profile?.locationId ?? ""}>
                      <option value="">Sem unidade</option>
                      {cmsLocations.filter((item) => item.isActive).map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-button" type="submit" disabled={savingStudentProfile || studentOverviewLoading}>
                    {savingStudentProfile ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                    {savingStudentProfile ? "Salvando…" : "Salvar alterações"}
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
                    <div className={dataRowClass} key={assignment.id}>
                      <span>
                        <strong>{assignment.program.title}</strong>
                        {assignment.completedWorkouts}/{assignment.totalWorkouts} treino(s) - dia {assignment.currentDay}
                      </span>
                      <small>{assignment.status}</small>
                    </div>
                  ))
                ) : (
                  <p>Nenhum treino atribuído.</p>
                )}
              </article>

              <article className="admin-student-module">
                <div className="admin-student-module-title">
                  <ShieldCheck size={18} />
                  <strong>Matrículas</strong>
                </div>
                {selectedAdminStudent.student.memberships?.slice(0, 4).map((membership) => (
                  <div className={dataRowClass} key={membership.id}>
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
                  <div className={dataRowClass} key={payment.id}>
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
                  <div className={dataRowClass} key={assessment.id}>
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
                  <div className={dataRowClass} key={session.id}>
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
                  <div className={dataRowClass} key={registration.id}>
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
                  <div className={`${dataRowClass} ticket-row`} key={ticket.id}>
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
              </>
            ) : (
              <div className="admin-student-picker-grid">
                {managerUserOptions.slice(0, 12).map((item) => (
                  <button type="button" key={item.id} onClick={() => openAdminStudentManager(item.id)}>
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
                      Ajuste a busca ou use o botão Editar na lista de usuários.
                    </span>
                  </div>
                )}
              </div>
            )}
          </article>
      </section>}

      {(adminSection === "training" || adminSection === "programs") && <section className="admin-grid">
        <article className="table-panel wide-panel cms-panel" id="admin-cms">
          <div className={panelTitleClass}>
            <h2>{trainingCopy.adminStudioTitle}</h2>
            <span>{trainingCopy.adminStudioSubtitle}</span>
          </div>
          <div className="cms-hero">
            <div>
              <span className="eyebrow">{trainingCopy.adminStudioTitle}</span>
              <h3>Monte exercícios, organize divisões e publique treinos para os alunos.</h3>
              <p>
                Fluxo: unidades → modalidades → exercícios → divisões → publicar treinos.
              </p>
            </div>
            <div className="cms-hero-metrics">
              <span><UploadCloud size={18} /><strong>{cmsExercises.length}</strong><small>{trainingCopy.exercises}</small></span>
              <span><UsersRound size={18} /><strong>{cmsModalities.length}</strong><small>{trainingCopy.modalities}</small></span>
              <span><Play size={18} /><strong>{cmsWorkoutBlocks.length}</strong><small>{trainingCopy.divisions}</small></span>
              <span><UserRound size={18} /><strong>{activeStudents.length}</strong><small>Alunos ativos</small></span>
            </div>
          </div>
          <div className="cms-workflow">
            {cmsStepCards.map((step, index) => (
              <button
                className={cmsStep === step.id ? "active" : ""}
                key={step.id}
                data-testid={`cms-step-${step.id}`}
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
          {cmsWorkflowSummary &&
            (cmsWorkflowSummary.exercises.withoutModality > 0 ||
              cmsWorkflowSummary.workoutBlocks.withoutExercises > 0 ||
              cmsWorkflowSummary.workoutBlocks.withoutModality > 0 ||
              cmsWorkflowSummary.workoutBlocks.unpublished > 0 ||
              cmsWorkflowSummary.programs.draftsReady > 0) && (
              <div className="cms-workflow-alerts">
                {cmsWorkflowSummary.exercises.withoutModality > 0 && (
                  <p>
                    <AlertCircle size={16} />
                    {cmsWorkflowSummary.exercises.withoutModality} exercício(s) sem modalidade vinculada.
                  </p>
                )}
                {cmsWorkflowSummary.workoutBlocks.withoutModality > 0 && (
                  <p>
                    <AlertCircle size={16} />
                    {cmsWorkflowSummary.workoutBlocks.withoutModality} divisão(ões) sem modalidade — o aluno não recebe sem vínculo.
                  </p>
                )}
                {cmsWorkflowSummary.workoutBlocks.withoutExercises > 0 && (
                  <p>
                    <AlertCircle size={16} />
                    {cmsWorkflowSummary.workoutBlocks.withoutExercises} divisão(ões) sem exercícios ativos.
                  </p>
                )}
                {cmsWorkflowSummary.workoutBlocks.unpublished > 0 && (
                  <p>
                    <Megaphone size={16} />
                    {cmsWorkflowSummary.workoutBlocks.unpublished} divisão(ões) pronta(s) para publicar aos alunos.
                  </p>
                )}
                {cmsWorkflowSummary.programs.draftsReady > 0 && (
                  <p>
                    <Check size={16} />
                    {cmsWorkflowSummary.programs.draftsReady} ciclo(s) pronto(s) para publicação.
                  </p>
                )}
              </div>
            )}
          <div className="cms-admin-grid cms-studio-grid">
            {!cmsTrashOpen && cmsStep === "locations" && <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.adminStepLocations}</h2>
                  <p>Gerencie academias, unidades ou clubes exibidos para os alunos.</p>
                </div>
                <span>{cmsLocations.length}</span>
              </div>
              <form key={editingCmsLocation?.id ?? "new-location"} className={`${crudFormClass} ${cmsFormClass}`} onSubmit={handleCreateCmsLocation}>
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
                <label className={wideFieldClass}>
                  Descrição
                  <input name="description" placeholder="Resumo da unidade" defaultValue={editingCmsLocation?.description ?? ""} />
                </label>
                <label className={wideFieldClass}>
                  Endereço
                  <input name="address" placeholder="Rua, número, bairro" defaultValue={editingCmsLocation?.address ?? ""} />
                </label>
                <StateCityFields
                  stateDefault={editingCmsLocation?.state ?? ""}
                  cityDefault={editingCmsLocation?.city ?? ""}
                  withLabels
                />
                <label className={wideFieldClass}>
                  Telefone
                  <input name="phone" placeholder="(11) 99999-9999" defaultValue={editingCmsLocation?.phone ?? ""} />
                </label>
                <label className={cmsUploadFieldClass}>
                  <ImageIcon size={24} />
                  <strong>Imagem da unidade</strong>
                  <small>Upload com preview. Envie uma imagem (PNG ou JPG).</small>
                  <input
                    name="locationImage"
                    type="file"
                    accept="image/*"
                    aria-label="Selecionar imagem da unidade"
                    ref={cmsLocationImageRef}
                    onChange={(event) => handleCmsLocationImageChange(event.target.files?.[0] ?? null)}
                  />
                </label>
                {cmsLocationImagePreview ? (
                  <div className={cmsImagePreviewClass}>
                    <img src={cmsLocationImagePreview} alt="Prévia da imagem da unidade" />
                    <button type="button" onClick={handleCmsLocationImageClear}>
                      <Trash2 size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsLocation?.imageUrl && !cmsLocationImageRemove ? (
                  <div className={cmsImagePreviewClass}>
                    <img src={mediaUrl(editingCmsLocation.imageUrl)} alt="Imagem atual da unidade" />
                    <small>Imagem atual (envie uma nova para substituir)</small>
                    <button type="button" onClick={() => setCmsLocationImageRemove(true)}>
                      <ImageOff size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsLocation?.imageUrl ? (
                  <div className={cmsImagePreviewClass}>
                    <small>Foto marcada para remoção — ela será apagada ao salvar.</small>
                    <button type="button" onClick={() => setCmsLocationImageRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsLocation ? "Salvar alterações" : "Salvar unidade"}
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
                    <img className={cmsDataRowThumbClass} src={mediaUrl(item.imageUrl)} alt={item.name} />
                  )}
                  <span>
                    <strong>{item.name}</strong>
                    {[item.city, item.state].filter(Boolean).join(" - ") || item.address || item.slug}
                  </span>
                  <select
                    aria-label="Status da unidade"
                    value={item.isActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(event) => handleUpdateCmsLocationStatus(item.id, event.target.value === "ACTIVE")}
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="INACTIVE">Inativa</option>
                  </select>
                  <small>ordem {item.sortOrder}</small>
                  <div className="cms-row-actions">
                    <button aria-label="Editar unidade" onClick={() => startEditCmsLocation(item)}>
                      <Pencil size={17} />
                    </button>
                    <button aria-label="Excluir unidade" onClick={() => setPendingCmsDelete({ kind: "locations", id: item.id, name: item.name })}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </section>}

            {!cmsTrashOpen && cmsStep === "modalities" && <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.adminStepModalities}</h2>
                  <p>Crie categorias simples para organizar o catálogo do aluno.</p>
                </div>
                <span>{cmsModalities.length}</span>
              </div>
              <form className={`${crudFormClass} ${cmsFormClass}`} key={editingCmsModality?.id ?? "new"} onSubmit={handleSaveCmsModality}>
                <label>
                  Nome
                  <input name="name" placeholder="Ex.: Musculação iniciante" required defaultValue={editingCmsModality?.name ?? ""} />
                </label>
                <label className={wideFieldClass}>
                  Descrição curta
                  <input name="description" placeholder="Resumo para identificar a categoria" defaultValue={editingCmsModality?.description ?? ""} />
                </label>
                <label>
                  Ícone
                  <input name="icon" placeholder="Ex.: força, mobilidade" defaultValue={editingCmsModality?.icon ?? ""} />
                </label>
                <label className={wideFieldClass}>
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
                  <div className={cmsImagePreviewClass}>
                    <img src={cmsModalityImagePreview} alt="Prévia da imagem da modalidade" />
                    <small>Prévia local — ainda não foi salva.</small>
                    <button type="button" onClick={handleCmsModalityImageClear}>
                      <Trash2 size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsModality?.imageUrl && !cmsModalityImageRemove ? (
                  <div className={cmsImagePreviewClass}>
                    <img
                      key={editingCmsModality.imageUrl}
                      src={mediaUrl(editingCmsModality.imageUrl)}
                      alt="Imagem atual da modalidade"
                    />
                    <div className={cmsImagePreviewMetaClass}>
                      <small>Imagem atual salva (envie uma nova para substituir)</small>
                      {cmsModalityImageJustSaved && (
                        <em className="cms-image-saved-badge">
                          <Check size={13} /> Salvo agora
                        </em>
                      )}
                    </div>
                    <button type="button" onClick={() => setCmsModalityImageRemove(true)}>
                      <ImageOff size={17} />
                      Remover imagem
                    </button>
                  </div>
                ) : editingCmsModality?.imageUrl ? (
                  <div className={cmsImagePreviewClass}>
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
                      <img className={cmsDataRowThumbClass} src={mediaUrl(item.imageUrl)} alt={item.name} />
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

            {!cmsTrashOpen && cmsStep === "lessons" && <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.adminStepExercises}</h2>
                  <p>Cadastre, edite e exclua exercícios e materiais de apoio disponíveis para alunos com assinatura ativa.</p>
                </div>
                <span>{cmsExercises.length}</span>
              </div>
              <form className={`${crudFormClass} ${cmsFormClass}`} key={editingCmsExercise?.id ?? "new"} onSubmit={handleSaveCmsExercise}>
                <label className={wideFieldClass}>
                  Título do exercício
                  <input name="title" placeholder="Ex.: Agachamento livre" required defaultValue={editingCmsExercise?.title ?? editingCmsExercise?.name ?? ""} />
                </label>
                <label className={cmsUploadFieldBase}>
                  <UploadCloud size={24} />
                  <strong>Upload do exercício</strong>
                  <small>Vídeo, imagem ou GIF. Se preferir, cole uma URL pública no campo abaixo.</small>
                  <input name="lessonFile" type="file" accept="video/*,image/*,.gif" aria-label="Selecionar mídia do exercício" ref={cmsLessonFileRef} onChange={(event) => handleCmsLessonFileChange(event.target.files?.[0] ?? null)} />
                </label>
                {cmsLessonFilePreview ? (
                  <div className={cmsImagePreviewClass}>
                    {cmsPreviewMedia(cmsLessonFilePreview, "Prévia do exercício enviada")}
                    <button type="button" onClick={handleCmsLessonFileClear}>
                      <Trash2 size={17} />
                      Remover arquivo
                    </button>
                  </div>
                ) : editingCmsExercise?.videoUrl && !cmsLessonFileRemove ? (
                  <div className={cmsImagePreviewClass}>
                    {cmsPreviewMedia(editingCmsExercise.videoUrl, "Mídia atual do exercício")}
                    <small>Mídia atual (envie um novo arquivo para substituir)</small>
                    <button type="button" onClick={() => setCmsLessonFileRemove(true)}>
                      <ImageOff size={17} />
                      Remover mídia
                    </button>
                  </div>
                ) : editingCmsExercise?.videoUrl ? (
                  <div className={cmsImagePreviewClass}>
                    <small>Mídia marcada para remoção — ela será apagada ao salvar.</small>
                    <button type="button" onClick={() => setCmsLessonFileRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <label className={cmsUploadFieldBase}>
                  <FileText size={24} />
                  <strong>Arquivo de apoio</strong>
                  <small>PDF, planilha ou guia complementar para anexar ao exercício.</small>
                  <input name="materialFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" aria-label="Selecionar material de apoio" ref={cmsMaterialFileRef} onChange={(event) => handleCmsMaterialFileChange(event.target.files?.[0] ?? null)} />
                </label>
                {cmsMaterialFilePreview ? (
                  <div className={cmsImagePreviewClass}>
                    {cmsPreviewMedia(cmsMaterialFilePreview, "Prévia do material enviado")}
                    <button type="button" onClick={handleCmsMaterialFileClear}>
                      <Trash2 size={17} />
                      Remover material
                    </button>
                  </div>
                ) : editingCmsExercise?.materialUrl && !cmsMaterialFileRemove ? (
                  <div className={cmsImagePreviewClass}>
                    {cmsPreviewMedia(editingCmsExercise.materialUrl, "Material atual")}
                    <small>Material atual (envie um novo arquivo para substituir)</small>
                    <button type="button" onClick={() => setCmsMaterialFileRemove(true)}>
                      <ImageOff size={17} />
                      Remover material
                    </button>
                  </div>
                ) : editingCmsExercise?.materialUrl ? (
                  <div className={cmsImagePreviewClass}>
                    <small>Material marcado para remoção — ele será apagado ao salvar.</small>
                    <button type="button" onClick={() => setCmsMaterialFileRemove(false)}>
                      <RefreshCw size={17} />
                      Desfazer remoção
                    </button>
                  </div>
                ) : null}
                <label>
                  URL do vídeo, imagem ou GIF
                  <input name="videoUrl" type="text" placeholder="https://.../exercicio.mp4" defaultValue={editingCmsExercise?.videoUrl ?? ""} />
                </label>
                <label>
                  URL do áudio
                  <input name="audioUrl" type="text" placeholder="https://.../orientacao.mp3" defaultValue={editingCmsExercise?.audioUrl ?? ""} />
                </label>
                {editingCmsExercise?.audioUrl && (
                  <div className={cmsImagePreviewClass}>
                    {cmsPreviewMedia(editingCmsExercise.audioUrl, "Áudio atual do exercício")}
                  </div>
                )}
                <label className={wideFieldClass}>
                  URL do material de apoio
                  <input name="materialUrl" type="text" placeholder="https://.../material.pdf" defaultValue={editingCmsExercise?.materialUrl ?? ""} />
                </label>
                <label className={wideFieldClass}>
                  Descrição e instruções do exercício
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
                <label className={wideFieldClass}>
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
                <label className={wideFieldClass}>
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
                  {editingCmsExercise ? "Salvar alterações" : "Salvar exercício"}
                </button>
                {editingCmsExercise && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsExerciseEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className={cmsFilterBarClass}>
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
                <span className="cms-filter-count">{filteredCmsExercises.length} exercício(s)</span>
              </div>
              {cmsLessonsPageItems.map((item) => {
                const thumbSrc = cmsExerciseThumbSrc(item.videoUrl);
                const thumbKind = item.videoUrl ? cmsMediaKind(item.videoUrl) : "file";
                return (
                  <div className={`data-row cms-data-row cms-lessons-row${thumbSrc ? " with-thumb" : ""}`} key={item.id}>
                    {thumbSrc && thumbKind === "video" ? (
                      <video className={cmsDataRowThumbClass} src={thumbSrc} muted preload="metadata" />
                    ) : thumbSrc ? (
                      <img
                        className={cmsDataRowThumbClass}
                        src={thumbSrc}
                        alt={cmsExerciseLabel(item)}
                        loading="lazy"
                        decoding="async"
                      />
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
                      <button aria-label="Excluir exercício" onClick={() => setPendingCmsDelete({ kind: "exercises", id: item.id, name: item.title ?? item.name ?? "Exercício" })}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredCmsExercises.length > CMS_LESSONS_PAGE_SIZE && (
                <div className="admin-users-pagination">
                  <span>
                    Página {cmsLessonsSafePage} de {cmsLessonsPageCount} • {filteredCmsExercises.length} exercício(s)
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

            {!cmsTrashOpen && cmsStep === "blocks" && <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.adminStepDivisions}</h2>
                  <p>
                    Monte a ficha vinculada à modalidade. Use <strong>Publicar para alunos</strong> para liberar a divisão
                    no catálogo; use Ciclos para montar ABC/multi-dia.
                  </p>
                </div>
                <span>{cmsWorkoutBlocks.length}</span>
              </div>
              <form className={`${crudFormClass} ${cmsFormClass}`} key={editingCmsWorkoutBlock?.id ?? "new"} onSubmit={handleSaveCmsWorkoutBlock}>
                <div className={cmsFormSectionTitleClass}>
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
                     <option value="CIRCUIT">Circuito</option>
                     <option value="AMRAP">AMRAP</option>
                     <option value="EMOM">EMOM</option>
                     <option value="FOR_TIME">For time</option>
                     <option value="TABATA">Tabata</option>
                     <option value="INTERVAL">Intervalado</option>
                     <option value="CLASS">Aula guiada</option>
                   </select>
                 </label>
                <label>
                  Descanso padrão
                   <input name="restTime" type="number" min="0" defaultValue={editingCmsWorkoutBlock?.restTime ?? 60} placeholder="Segundos" required />
                 </label>
                 <label>
                   Rounds do protocolo
                   <input name="protocolRounds" type="number" min="1" defaultValue={editingCmsWorkoutBlock?.protocolRounds ?? ""} placeholder="Opcional" />
                 </label>
                 <label>
                   Trabalho por ciclo (segundos)
                   <input name="workSeconds" type="number" min="1" defaultValue={editingCmsWorkoutBlock?.workSeconds ?? ""} placeholder="Opcional" />
                 </label>
                 <label>
                   Limite da sessão (segundos)
                   <input name="timeCapSeconds" type="number" min="1" defaultValue={editingCmsWorkoutBlock?.timeCapSeconds ?? ""} placeholder="Opcional" />
                 </label>
                 <label className={wideFieldClass}>
                   Orientações do protocolo
                   <textarea name="instructions" defaultValue={editingCmsWorkoutBlock?.instructions ?? ""} placeholder="Sequência, regras, transições e critérios de conclusão" />
                 </label>
                <label className={wideFieldClass}>
                  Modalidade da divisão
                  <div className="cms-chip-group">
                    {cmsBlockFormModalities.length === 0 ? (
                      <span className="cms-filter-count">Cadastre uma modalidade ativa antes de criar divisões.</span>
                    ) : (
                      cmsBlockFormModalities.map((modality) => (
                        <label className="cms-chip" key={modality.id}>
                          <input
                            type="radio"
                            name="modalityId"
                            value={modality.id}
                            required
                            checked={cmsBlockFormModality === modality.id}
                            onChange={(event) => setCmsBlockFormModality(event.target.value)}
                          />
                          <span>{modality.name}{modality.isActive ? "" : " (inativa)"}</span>
                        </label>
                      ))
                    )}
                  </div>
                </label>
                <div className={cmsFormSectionTitleClass}>
                  <span>Bloco 3</span>
                  <div>
                    <h3>Exercícios e execução</h3>
                    <p>Defina séries, repetições, carga inicial, descanso do cronômetro e material de apoio.</p>
                  </div>
                </div>
                <div className="cms-builder-list wide-field">
                  <div className="cms-execution-toolbar">
                    <div>
                      <strong>{cmsBlockExerciseDrafts.length} exercício(s) na divisão</strong>
                      <span>Adicione, edite ou remova linhas livremente nesta divisão.</span>
                    </div>
                    <div className="cms-execution-actions">
                      <button
                        type="button"
                        onClick={addCmsBlockExerciseDraft}
                        disabled={cmsBlockExerciseDrafts.length >= 20}
                      >
                        <Plus size={17} />
                        Adicionar exercício
                      </button>
                    </div>
                  </div>
                  <div className="cms-exercise-editor-list">
                    {cmsBlockExerciseDrafts.map((draft, index) => {
                      const row = index + 1;
                      const selectedExercise = cmsBlockModalityExercises.find((item) => item.id === draft.exerciseId)
                        ?? (editingCmsWorkoutBlock?.exercises.find((entry) => entry.exercise.id === draft.exerciseId)?.exercise ?? null);

                      return (
                        <div className="cms-exercise-editor" key={draft.clientKey}>
                          <div className="cms-exercise-editor-heading">
                            <span>{row}</span>
                            <div>
                              <strong>Exercício {row}</strong>
                              <small>{row === 1 ? "Obrigatório" : "Opcional"}</small>
                            </div>
                            <button
                              type="button"
                              className="outline-button"
                              aria-label={`Remover exercício ${row}`}
                              title="Remover este exercício"
                              onClick={() => removeCmsBlockExerciseDraft(draft.clientKey)}
                            >
                              <Trash2 size={16} />
                              Remover
                            </button>
                          </div>
                          <label className="cms-exercise-main-field">
                            Exercício
                            <select
                              value={draft.exerciseId}
                              required={row === 1}
                              onChange={(event) =>
                                updateCmsBlockExerciseDraft(draft.clientKey, { exerciseId: event.target.value })
                              }
                            >
                              <option value="">{row === 1 ? "Selecione o primeiro exercício" : "Selecione um exercício"}</option>
                              {cmsBlockModalityExercises.map((exercise) => (
                                <option value={exercise.id} key={exercise.id}>
                                  {cmsExerciseLabel(exercise)}
                                </option>
                              ))}
                              {selectedExercise &&
                                !cmsBlockModalityExercises.some((exercise) => exercise.id === selectedExercise.id) && (
                                  <option value={selectedExercise.id}>
                                    {cmsExerciseLabel(selectedExercise)}
                                  </option>
                                )}
                            </select>
                          </label>
                           <div className="cms-exercise-prescription-grid">
                             <label>
                               Tipo de prescrição
                               <select
                                 value={draft.prescriptionType}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     prescriptionType: event.target.value as WorkoutPrescriptionType
                                   })
                                 }
                               >
                                 <option value="REPETITIONS">Repetições</option>
                                 <option value="DURATION">Duração</option>
                                 <option value="DISTANCE">Distância</option>
                                 <option value="INTERVAL">Intervalos</option>
                                 <option value="ROUNDS">Rounds</option>
                                 <option value="HOLD">Permanência/isometria</option>
                                 <option value="FREE">Livre</option>
                               </select>
                             </label>
                             <label>
                               Séries/ciclos
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.sets}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     sets: Number(event.target.value) || 1
                                   })
                                 }
                               />
                             </label>
                             <label>
                               Alvo exibido ao aluno
                               <input
                                 placeholder="10-12, até a falha ou execução livre"
                                 value={draft.repsRange}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { repsRange: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Repetições mínimas
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.repsMin}
                                 placeholder="Opcional"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { repsMin: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Repetições máximas
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.repsMax}
                                 placeholder="Opcional"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { repsMax: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Duração/permanência (segundos)
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.durationSeconds}
                                 placeholder="Tempo-alvo"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     durationSeconds: event.target.value
                                   })
                                 }
                               />
                             </label>
                             <label>
                               Distância (metros)
                               <input
                                 type="number"
                                 min="0"
                                 step="0.01"
                                 value={draft.distanceMeters}
                                 placeholder="Distância-alvo"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     distanceMeters: event.target.value
                                   })
                                 }
                               />
                             </label>
                             <label>
                               Rounds
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.rounds}
                                 placeholder="Quantidade"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { rounds: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Trabalho do intervalo (segundos)
                               <input
                                 type="number"
                                 min="1"
                                 value={draft.workSeconds}
                                 placeholder="Tempo ativo"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { workSeconds: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Carga inicial (opcional)
                               <input
                                 placeholder="Ex.: 20kg"
                                 value={draft.initialLoad}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { initialLoad: event.target.value })
                                 }
                               />
                            </label>
                            <label>
                              Descanso (segundos)
                               <input
                                 type="number"
                                 min="0"
                                 placeholder="Ex.: 60"
                                 value={draft.restSeconds}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { restSeconds: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Controle de intensidade
                               <select
                                 value={draft.intensityType}
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     intensityType: event.target.value as WorkoutIntensityType
                                   })
                                 }
                               >
                                 <option value="NONE">Não informado</option>
                                 <option value="LOAD">Carga</option>
                                 <option value="RPE">RPE</option>
                                 <option value="RIR">RIR</option>
                                 <option value="PERCENT_1RM">% de 1RM</option>
                                 <option value="HEART_RATE_ZONE">Zona cardíaca</option>
                                 <option value="PACE">Ritmo</option>
                                 <option value="SPEED">Velocidade</option>
                               </select>
                             </label>
                             <label>
                               Intensidade-alvo
                               <input
                                 value={draft.intensityValue}
                                 placeholder="Ex.: RPE 8, Z2, 5:30/km"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, {
                                     intensityValue: event.target.value
                                   })
                                 }
                               />
                             </label>
                             <label>
                               Tempo do movimento
                               <input
                                 value={draft.tempo}
                                 placeholder="Ex.: 3-1-1-0"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { tempo: event.target.value })
                                 }
                               />
                             </label>
                             <label>
                               Lado
                               <input
                                 value={draft.side}
                                 placeholder="Ex.: bilateral ou cada lado"
                                 onChange={(event) =>
                                   updateCmsBlockExerciseDraft(draft.clientKey, { side: event.target.value })
                                 }
                               />
                             </label>
                           </div>
                           <label>
                             Orientação específica (opcional)
                             <textarea
                               value={draft.executionNotes}
                               placeholder="Técnica, respiração, progressão ou critério de interrupção"
                               onChange={(event) =>
                                 updateCmsBlockExerciseDraft(draft.clientKey, {
                                   executionNotes: event.target.value
                                 })
                               }
                             />
                           </label>
                          <label>
                            Material de apoio (opcional)
                            <input
                              type="text"
                              list="cms-support-materials"
                              placeholder={
                                selectedExercise?.materialUrl
                                  ? "Material do exercício ou outra URL"
                                  : "Selecione um material ou informe a URL"
                              }
                              value={draft.supportMaterialUrl}
                              onChange={(event) =>
                                updateCmsBlockExerciseDraft(draft.clientKey, {
                                  supportMaterialUrl: event.target.value
                                })
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
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
                  {editingCmsWorkoutBlock ? "Salvar alterações" : "Salvar divisão"}
                </button>
                {editingCmsWorkoutBlock && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsWorkoutBlockEdit}>
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className={cmsFilterBarClass}>
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
                <span className="cms-filter-count">{filteredCmsWorkoutBlocks.length} divisão(ões)</span>
              </div>
              {cmsBlocksPageItems.map((item) => {
                const linkedPublished = (item.programDays ?? []).filter(
                  (day) => !day.program.deletedAt && day.program.status === "PUBLISHED" && day.program.isActive
                );
                const publishedSingleDay = linkedPublished.some((day) => (day.program.cycleLengthDays ?? 1) === 1);
                const inPublishedCycle = linkedPublished.length > 0;
                const canPublish = Boolean(item.modality?.id) && item.exercises.length > 0;

                return (
                <div className={`${dataRowClass} cms-data-row`} key={item.id}>
                  <span>
                    <strong>{item.identifier ?? item.title}</strong>
                    <span className="cms-badge-group">
                      {item.modality ? (
                        <em className="cms-modality-badge">{item.modality.name}</em>
                      ) : (
                        <em className="cms-modality-badge muted">Sem modalidade</em>
                      )}
                      {publishedSingleDay ? (
                        <em className="cms-modality-badge">Publicada</em>
                      ) : inPublishedCycle ? (
                        <em className="cms-modality-badge">Em ciclo publicado</em>
                      ) : (
                        <em className="cms-modality-badge muted">Não publicada</em>
                      )}
                    </span>
                    {item.focus ? `${item.focus} - ` : ""}
                    {item.weeklyFrequency}x/semana -{" "}
                    {item.exercises.map((row) => row.exercise.title ?? row.exercise.name ?? "Exercício").join(", ") || "Sem exercícios"}
                  </span>
                  <select
                    aria-label="Descanso da divisão"
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
                    <select
                      aria-label="Público ao publicar divisão"
                      defaultValue="ALL"
                      disabled={!canPublish}
                      id={`cms-publish-gender-${item.id}`}
                      title="Público por sexo ao publicar"
                    >
                      <option value="ALL">Todos</option>
                      <option value="MALE">Masculino</option>
                      <option value="FEMALE">Feminino</option>
                    </select>
                    <button
                      type="button"
                      aria-label="Publicar divisão para alunos"
                      title={canPublish ? "Publicar para alunos" : "Vincule modalidade e exercícios para publicar"}
                      disabled={!canPublish}
                      data-testid={`cms-publish-block-${item.id}`}
                      onClick={() => {
                        const genderSelect = document.getElementById(
                          `cms-publish-gender-${item.id}`
                        ) as HTMLSelectElement | null;
                        const targetGender = (genderSelect?.value ?? "ALL") as CmsProgramRow["targetGender"];
                        void handlePublishCmsWorkoutBlock(item, targetGender);
                      }}
                    >
                      <Megaphone size={17} />
                    </button>
                    <button aria-label="Editar divisão" onClick={() => startEditCmsWorkoutBlock(item)}>
                      <Pencil size={17} />
                    </button>
                    <button aria-label="Excluir divisão" onClick={() => setPendingCmsDelete({ kind: "workoutBlocks", id: item.id, name: item.title })}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                );
              })}
              {filteredCmsWorkoutBlocks.length > CMS_BLOCKS_PAGE_SIZE && (
                <div className="admin-users-pagination">
                  <span>
                    Página {cmsBlocksSafePage} de {cmsBlocksPageCount} • {filteredCmsWorkoutBlocks.length} divisão(ões)
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

            {!cmsTrashOpen && cmsStep === "publish" && <section className={`cms-program-section ${cmsStudioCardClass}`}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>{trainingCopy.adminStepPublish}</h2>
                  <p>
                    Ciclos multi-dia (ex.: ABC) e rascunhos avançados. Divisões avulsas podem ser publicadas direto em Divisões.
                  </p>
                </div>
                <span>{cmsPrograms.length}</span>
              </div>

              <div className="cms-program-toolbar">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (editingCmsProgram) {
                      handleCancelCmsProgramEdit();
                    }
                    setCmsProgramFormOpen((open) => !open);
                  }}
                >
                  {cmsProgramFormOpen && !editingCmsProgram ? "Fechar formulário" : "Novo treino"}
                </button>
                {editingCmsProgram && (
                  <strong className="cms-editing-banner">Editando: {editingCmsProgram.title}</strong>
                )}
              </div>

              {(cmsProgramFormOpen || editingCmsProgram) && (
              <form id="cms-program-editor" className={`${crudFormClass} ${cmsFormClass}`} key={editingCmsProgram?.id ?? "new"} onSubmit={handleSaveCmsProgram}>
                <div className={cmsFormSectionTitleClass}>
                  <span>Bloco 1</span>
                  <div>
                    <h3>{editingCmsProgram ? "Editar treino" : "Cabeçalho e vigência"}</h3>
                    <p>Dê um nome claro ao treino e informe por quanto tempo o aluno deverá segui-lo.</p>
                  </div>
                </div>
                <label>
                  Nome do treino
                  <input name="title" placeholder="Ex.: Treino Iniciante ABC - Academia" required defaultValue={editingCmsProgram?.title ?? ""} />
                </label>
                <label>
                  Modalidade
                  <select
                    name="modalityId"
                    required
                    value={cmsProgramFormModality}
                    onChange={(event) => setCmsProgramFormModality(event.target.value)}
                  >
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
                    max="10"
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
                    max="11"
                    value={cmsProgramDurationMonths}
                    onChange={(event) => setCmsProgramDurationMonths(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
                <label>
                  Semanas
                  <input
                    name="durationWeeks"
                    type="number"
                    min="0"
                    value={cmsProgramDurationWeeks}
                    onChange={(event) => setCmsProgramDurationWeeks(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
                <label>
                  Dias adicionais
                  <input
                    name="durationExtraDays"
                    type="number"
                    min="0"
                    max="6"
                    value={cmsProgramDurationExtraDays}
                    onChange={(event) => setCmsProgramDurationExtraDays(Math.max(0, Math.min(6, Number(event.target.value) || 0)))}
                  />
                </label>
                <label>
                  Duração estimada
                  <div className="cms-readonly-duration">
                    <input name="durationDays" type="number" min="1" value={cmsProgramEstimatedDays} readOnly />
                    <span>{cmsProgramEstimatedDays} dias corridos</span>
                  </div>
                </label>
                <label>
                  Sessões planejadas
                  <input
                    name="plannedSessions"
                    type="number"
                    min="1"
                    required
                    value={cmsProgramPlannedSessions}
                    onChange={(event) => setCmsProgramPlannedSessions(Math.max(1, Number(event.target.value) || 1))}
                  />
                </label>
                <label>
                  Conclusão do treino
                  <select name="completionMode" defaultValue={editingCmsProgram?.completionMode ?? "BY_SESSIONS"}>
                    <option value="BY_SESSIONS">Ao concluir as sessões</option>
                    <option value="BY_DATE">Ao chegar à data final</option>
                    <option value="BOTH">Data final e sessões concluídas</option>
                    <option value="MANUAL">Encerramento pelo profissional</option>
                  </select>
                </label>
                <label>
                  Organização da agenda
                  <select name="scheduleType" defaultValue={editingCmsProgram?.scheduleType ?? "ROTATING_CYCLE"}>
                    <option value="ROTATING_CYCLE">Ciclo rotativo</option>
                    <option value="WEEKLY">Grade semanal</option>
                    <option value="ON_DEMAND">Sequência flexível</option>
                  </select>
                </label>
                <label>
                  Distribuição
                  <select name="audienceMode" defaultValue={editingCmsProgram?.audienceMode ?? "ALL_ACTIVE"}>
                    <option value="ALL_ACTIVE">Todos os alunos ativos</option>
                    <option value="SELECTED">Somente alunos atribuídos</option>
                  </select>
                </label>
                <label className={wideFieldClass}>
                  Descrição para o aluno
                  <textarea
                    name="description"
                    placeholder="Explique objetivo, frequência e como seguir o treino"
                    required
                    defaultValue={editingCmsProgram ? parseProgramMetadata(editingCmsProgram.description).description : ""}
                  />
                </label>
                <div className={cmsFormSectionTitleClass}>
                  <span>Montagem</span>
                  <div>
                    <h3>Sessões do treino</h3>
                    <p>Monte o ciclo na ordem em que as sessões deverão aparecer para o aluno.</p>
                  </div>
                </div>
                <label className={wideFieldClass}>
                  Tamanho do ciclo (dias/posições)
                  <input
                    name="cycleLengthDays"
                    type="number"
                    min="1"
                    max="56"
                    value={cmsProgramCycleLengthDays}
                    onChange={(event) => setCmsProgramCycleLengthDays(Math.max(1, Math.min(56, Number(event.target.value) || 1)))}
                  />
                </label>
                <div className="cms-builder-list wide-field">
                  {Array.from({ length: cmsProgramCycleLengthDays }).map((_, index) => {
                    const dayNumber = index + 1;
                    const editDay = editingCmsProgram?.days.find((day) => day.dayNumber === dayNumber);
                    const dayBlocks = cmsProgramFormWorkoutBlocks.filter((block) => {
                      if (!editDay) return true;
                      return block.id === editDay.workoutBlock.id || !block.modality || block.modality.id === cmsProgramFormModality;
                    });

                    return (
                      <div className="cms-builder-row program-day-row" key={`program-day-${dayNumber}`}>
                        <span>{dayNumber}</span>
                        <select name={`workoutBlockId${dayNumber}`} required={dayNumber === 1} defaultValue={editDay?.workoutBlock.id ?? ""}>
                          <option value="">{dayNumber === 1 ? "Selecione a primeira sessão" : "Sessão opcional"}</option>
                          {dayBlocks.map((block) => (
                            <option value={block.id} key={block.id}>
                              {block.identifier ?? block.title}{block.focus ? ` - ${block.focus}` : ""} ({block.weeklyFrequency ?? 1}x/semana)
                              {block.modality?.id !== cmsProgramFormModality && block.modality ? " • sem modalidade definida" : ""}
                            </option>
                          ))}
                        </select>
                        <input name={`dayOrder${dayNumber}`} type="number" min="1" defaultValue={editDay?.order ?? 1} aria-label={`Ordem da sessão ${dayNumber}`} />
                      </div>
                    );
                  })}
                </div>
                <button className="primary-button">
                  <Save size={18} />
                  {editingCmsProgram ? "Salvar alterações" : "Salvar treino"}
                </button>
                {editingCmsProgram && (
                  <button type="button" className="outline-button" onClick={handleCancelCmsProgramEdit}>
                    <X size={18} />
                    Cancelar edição
                  </button>
                )}
              </form>
              )}
              <div className="cms-program-list-title">
                <strong>Treinos publicados</strong>
                <small>Toque no card para ver sessões, editar, atribuir ou arquivar.</small>
              </div>
              <div className={cmsFilterBarClass}>
                <label className="cms-filter-label">
                  <span>Filtrar por modalidade</span>
                  <select
                    value={cmsProgramsModalityFilter}
                    onChange={(event) => setCmsProgramsModalityFilter(event.target.value)}
                  >
                    <option value="">Todas as modalidades</option>
                    {activeCmsModalities.map((modality) => (
                      <option value={modality.id} key={modality.id}>
                        {modality.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="cms-filter-count">{filteredCmsPrograms.length} treino(s)</span>
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
                          aria-label="Arrastar treino"
                          title="Arrastar treino"
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
                          <span className={`cms-status ${item.status.toLowerCase()}`}>{cmsProgramStatusLabel(item.status)}</span>
                          <span className="cms-program-title-group">
                            <strong>{item.title}</strong>
                            <small>
                              {item.modality?.name ?? programMetadata.modality} · {cmsTargetGenderLabel(item.targetGender)} ·{" "}
                              {item.days.length} sessão(ões) · {(item.assignedUsers ?? []).length} aluno(s)
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
                            <div className="cms-program-summary-grid">
                              <span>
                                <strong>Modalidade</strong>
                                {item.modality?.name ?? programMetadata.modality}
                              </span>
                              <span>
                                <strong>Público</strong>
                                {cmsTargetGenderLabel(item.targetGender)}
                              </span>
                              <span>
                                <strong>Meta</strong>
                                {item.plannedSessions ?? item.totalWorkouts} sessões
                              </span>
                              <span>
                                <strong>Alunos</strong>
                                {(item.assignedUsers ?? []).length} atribuído(s)
                              </span>
                            </div>
                            <p className="cms-program-description">
                              {programMetadata.description?.trim()
                                ? programMetadata.description
                                : "Sem descrição cadastrada para este treino."}
                            </p>
                            <div className="cms-program-sessions">
                              <strong>Sessões do ciclo</strong>
                              {item.days.length > 0 ? (
                                <ol>
                                  {item.days.map((day) => (
                                    <li key={`${item.id}-${day.dayNumber}`}>
                                      <em>Dia {day.dayNumber}</em>
                                      <span>
                                        {day.workoutBlock.identifier ?? day.workoutBlock.title}
                                        {day.workoutBlock.focus ? ` · ${day.workoutBlock.focus}` : ""}
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <span className="cms-empty-hint">Nenhuma sessão cadastrada neste treino.</span>
                              )}
                            </div>
                          </div>
                          <div className="cms-program-actions cms-program-actions-primary">
                            <button className="outline-button" type="button" onClick={() => startEditCmsProgram(item)}>
                              <Pencil size={17} />
                              Editar
                            </button>
                            <button
                              className="outline-button"
                              type="button"
                              onClick={() =>
                                setAssigningCmsProgramId((current) => (current === item.id ? null : item.id))
                              }
                            >
                              <UsersRound size={17} />
                              {assigningCmsProgramId === item.id ? "Fechar atribuição" : "Atribuir alunos"}
                            </button>
                            <button className="outline-button" type="button" onClick={() => handleArchiveCmsProgram(item.id)}>
                              <LockKeyhole size={17} />
                              Arquivar
                            </button>
                            <button
                              className={`outline-button ${dangerButtonClass}`}
                              type="button"
                              onClick={() => setPendingCmsDelete({ kind: "programs", id: item.id, name: item.title })}
                            >
                              <Trash2 size={17} />
                              Excluir
                            </button>
                          </div>
                          {assigningCmsProgramId === item.id && (
                            <div className="cms-assign-panel">
                              <div className="cms-program-actions cms-assign-quick">
                                <select
                                  aria-label="Modalidade do treino"
                                  value={item.modality?.id ?? ""}
                                  onChange={(event) => handleUpdateCmsProgramModality(item.id, event.target.value)}
                                >
                                  {!item.modality?.id && (
                                    <option value="" disabled>
                                      Selecione a modalidade
                                    </option>
                                  )}
                                  {cmsProgramFormModalities.map((modality) => (
                                    <option value={modality.id} key={modality.id}>
                                      {modality.name}
                                      {modality.isActive ? "" : " (inativa)"}
                                    </option>
                                  ))}
                                  {item.modality &&
                                    !cmsProgramFormModalities.some((modality) => modality.id === item.modality?.id) && (
                                      <option value={item.modality.id}>
                                        {item.modality.name}
                                        {item.modality.isActive ? "" : " (inativa)"}
                                      </option>
                                    )}
                                </select>
                                <select
                                  aria-label="Público do treino"
                                  value={item.targetGender}
                                  onChange={(event) =>
                                    handleUpdateCmsProgramGender(item.id, event.target.value as CmsProgramRow["targetGender"])
                                  }
                                >
                                  <option value="ALL">Todos</option>
                                  <option value="MALE">Masculino</option>
                                  <option value="FEMALE">Feminino</option>
                                </select>
                                <select
                                  aria-label="Meta de treinos"
                                  value={item.totalWorkouts}
                                  onChange={(event) => handleUpdateCmsProgramTotalWorkouts(item.id, Number(event.target.value))}
                                >
                                  <option value="12">12 treinos</option>
                                  <option value="18">18 treinos</option>
                                  <option value="24">24 treinos</option>
                                  <option value="30">30 treinos</option>
                                  <option value="36">36 treinos</option>
                                </select>
                              </div>
                              <form className="cms-assign-form" onSubmit={(event) => handleAssignCmsProgramSubmit(event, item.id)}>
                                <select name="userId">
                                  <option value="">
                                    {item.targetGender === "MALE"
                                      ? "Todos os alunos masculinos ativos"
                                      : item.targetGender === "FEMALE"
                                        ? "Todas as alunas femininas ativas"
                                        : "Todos os alunos ativos"}
                                  </option>
                                  {activeStudents
                                    .filter(
                                      (user) =>
                                        item.targetGender === "ALL" || user.profile?.gender === item.targetGender
                                    )
                                    .map((user) => (
                                      <option value={user.id} key={user.id}>
                                        {user.name}
                                        {user.profile?.gender === "MALE"
                                          ? " · Masculino"
                                          : user.profile?.gender === "FEMALE"
                                            ? " · Feminino"
                                            : " · Sem sexo"}
                                      </option>
                                    ))}
                                </select>
                                <input name="currentDay" type="number" min="1" defaultValue="1" aria-label="Dia atual" />
                                <input
                                  name="totalWorkouts"
                                  type="number"
                                  min="1"
                                  defaultValue={item.totalWorkouts ?? 30}
                                  aria-label="Meta de treinos da atribuição"
                                />
                                <button className="primary-button">
                                  <UsersRound size={17} />
                                  Atribuir
                                </button>
                              </form>
                              <div className="cms-assignment-list">
                                <strong>Alunos neste treino</strong>
                                {(item.assignedUsers ?? []).length > 0 ? (
                                  item.assignedUsers?.slice(0, 8).map((assignment) => (
                                    <span key={assignment.id}>
                                      {assignment.user.name} · {assignment.completedWorkouts}/{assignment.totalWorkouts} · dia{" "}
                                      {assignment.currentDay} · {assignment.status}
                                    </span>
                                  ))
                                ) : (
                                  <span>Nenhum aluno atribuído ainda.</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {publishedCmsPrograms.length === 0 && (
                  <div className="cms-empty-hint">Nenhum treino publicado. Crie um novo ou publique um rascunho.</div>
                )}
              </div>
              {draftCmsPrograms.length > 0 && (
                <>
                  <div className="cms-program-list-title secondary">
                    <strong>Rascunhos e arquivados</strong>
                    <small>Publique um treino pronto para liberar aos alunos.</small>
                  </div>
                  <div className="accordion cms-program-accordion" id="cmsDraftProgramsAccordion">
                    {draftCmsPrograms.map((item) => {
                      const programMetadata = parseProgramMetadata(item.description);
                      const readiness = getCmsProgramReadiness(item);
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
                              <span className={`cms-status ${item.status.toLowerCase()}`}>{cmsProgramStatusLabel(item.status)}</span>
                              <span className="cms-program-title-group">
                                <strong>{item.title}</strong>
                                <small>
                                  {item.modality?.name ?? programMetadata.modality} · {item.days.length} sessão(ões)
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
                                <p className="cms-program-description">
                                  {programMetadata.description?.trim()
                                    ? programMetadata.description
                                    : "Sem descrição cadastrada para este treino."}
                                </p>
                                <div className="cms-program-sessions">
                                  <strong>Sessões do ciclo</strong>
                                  {item.days.length > 0 ? (
                                    <ol>
                                      {item.days.map((day) => (
                                        <li key={`${item.id}-${day.dayNumber}`}>
                                          <em>Dia {day.dayNumber}</em>
                                          <span>
                                            {day.workoutBlock.identifier ?? day.workoutBlock.title}
                                            {day.workoutBlock.focus ? ` · ${day.workoutBlock.focus}` : ""}
                                          </span>
                                        </li>
                                      ))}
                                    </ol>
                                  ) : (
                                    <span className="cms-empty-hint">Nenhuma sessão cadastrada.</span>
                                  )}
                                </div>
                                <div className={`cms-readiness ${readiness.ready ? "ready" : "blocked"}`}>
                                  {readiness.ready ? (
                                    <span>Pronto para publicar.</span>
                                  ) : (
                                    <ul>
                                      {readiness.issues.map((issue) => (
                                        <li key={issue}>{issue}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                              <div className="cms-program-actions cms-program-actions-primary">
                                <button className="outline-button" type="button" onClick={() => startEditCmsProgram(item)}>
                                  <Pencil size={17} />
                                  Editar
                                </button>
                                <button
                                  className="outline-button"
                                  type="button"
                                  data-testid={`cms-publish-${item.id}`}
                                  onClick={() => handlePublishCmsProgram(item.id)}
                                  disabled={!readiness.ready}
                                >
                                  <Check size={17} />
                                  Publicar
                                </button>
                                <button
                                  className={`outline-button ${dangerButtonClass}`}
                                  type="button"
                                  onClick={() => setPendingCmsDelete({ kind: "programs", id: item.id, name: item.title })}
                                >
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

            {!cmsTrashOpen && cmsStep === "publish" && <section className={cmsStudioCardClass}>
              <div className={`${panelTitleClass} cms-subtitle`}>
                <div>
                  <h2>Avisos para alunos</h2>
                  <p>Publique avisos gerais que aparecem na central de notificações do aluno.</p>
                </div>
                <span>{cmsAnnouncements.length}</span>
              </div>
              <form className={`${crudFormClass} ${cmsFormClass}`} onSubmit={handleCreateCmsAnnouncement}>
                <label className={wideFieldClass}>
                  Título do aviso
                  <input name="title" placeholder="Ex.: Treino liberado no sábado" required />
                </label>
                <label className={wideFieldClass}>
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
                <div className={`${dataRowClass} cms-data-row`} key={item.id}>
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

            {cmsTrashOpen && <section className={`${cmsStudioCardClass} cms-trash-panel`}>
              <div className={`${panelTitleClass} cms-subtitle`}>
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
          <div className={panelTitleClass}>
            <h2>Planos</h2>
            <span>{plans.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreatePlan}>
            <input name="code" placeholder="Código" required />
            <input name="name" placeholder="Nome" required />
            <input
              name="price"
              type="text"
              inputMode="decimal"
              placeholder="Valor (ex.: 0,10)"
              title="Use vírgula para centavos, ex.: 0,10 ou 29,90"
              required
            />
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
            <div className={dataRowClass} key={item.id}>
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
          <div className={panelTitleClass}>
            <h2>Matrículas</h2>
            <span>{memberships.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreateMembership}>
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
          {visibleFinanceMemberships.map((item) => (
            <div className={dataRowClass} key={item.id}>
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
          <AdminPaginationBar
            page={currentMembershipsPage}
            pageCount={membershipsTotalPages}
            totalLabel={`${memberships.length} matrícula(s)`}
            onPageChange={setMembershipsPage}
          />
        </article>

        <article className="table-panel wide-panel" id="admin-payments">
          <div className={panelTitleClass}>
            <h2>Pagamentos</h2>
            <span>{payments.length}</span>
          </div>
          <form className={crudFormInlineClass} onSubmit={handleCreatePayment}>
            <select name="membershipId" required>
              <option value="">Matrícula</option>
              {memberships.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.user.name} - {item.plan.name}
                </option>
              ))}
            </select>
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              placeholder="Valor (ex.: 0,10)"
              title="Use vírgula para centavos, ex.: 0,10 ou 29,90"
              required
            />
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
          {visibleFinancePayments.map((item) => (
            <div className={dataRowClass} key={item.id}>
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
          <AdminPaginationBar
            page={currentPaymentsPage}
            pageCount={paymentsTotalPages}
            totalLabel={`${payments.length} pagamento(s)`}
            onPageChange={setPaymentsPage}
          />
        </article>
      </section>}

      {adminSection === "overview" && <section className="admin-grid phase-three-grid" id="admin-operations">
        <h2 className="admin-reports-operations-title">Operações e atendimento</h2>
        <div className="admin-reports-operations-grid">
        <article className="table-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Avaliações físicas</h2>
              <p>Registro de avaliações e acompanhamento de evolução.</p>
            </div>
            <span>{assessments.length}</span>
          </div>
          {assessments.slice(0, 4).map((item) => (
            <div className={dataRowClass} key={item.id}>
              <span>
                <strong>{item.user?.name ?? "Aluno"}</strong>
                {formatAssessmentDateTime(item.assessedAt)} - {item.weightKg ?? "-"} kg
              </span>
              <small>{item.bodyFatPct ? `${item.bodyFatPct}% gordura` : "Sem dobra"}</small>
            </div>
          ))}
          <button className="dash-link-button" type="button" onClick={() => goAdminSection("assessments")}>
            Abrir Avaliações físicas
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Eventos</h2>
              <p>Eventos, aulas abertas e agenda de inscrição.</p>
            </div>
            <span>{events.length}</span>
          </div>
          {events.slice(0, 4).map((item) => (
            <div className={dataRowClass} key={item.id}>
              <span>
                <strong>{item.title}</strong>
                {new Date(item.startsAt).toLocaleString("pt-BR")} - {item.location ?? "Sem local"}
              </span>
              <small>{item.registrations?.length ?? 0}/{item.capacity ?? "sem limite"}</small>
            </div>
          ))}
          <button className="dash-link-button" type="button" onClick={() => goAdminSection("events")}>
            Abrir Eventos
            <ArrowRight size={15} />
          </button>
        </article>

        <article className="table-panel">
          <div className={panelTitleClass}>
            <h2>Atendimento</h2>
            <span>{tickets.length}</span>
          </div>
          {tickets.slice(0, 10).map((item) => (
            <div className={`${dataRowClass} ticket-row`} key={item.id}>
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
          <div className={panelTitleClass}>
            <h2>Agente IA</h2>
            <span>{aiPlans.length}</span>
          </div>
          {aiPlans.slice(0, 8).map((item) => (
            <div className={dataRowClass} key={item.id}>
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
                  <div className={crudFormClass}>
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
          <div className={cmsFilterBarClass}>
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
                <div className={dataRowClass}>
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
          <div className={panelTitleClass}>
            <div>
              <h2>Eventos</h2>
              <p>Crie e gerencie eventos, aulas abertas e agendas para inscrição.</p>
            </div>
            <span>{events.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreateEvent}>
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
          <div className={panelTitleClass}>
            <div>
              <h2>Agenda de eventos</h2>
              <p>Confira os eventos cadastrados, inscrições e status.</p>
            </div>
            <span>{filteredEvents.length}</span>
          </div>
          <div className={cmsFilterBarClass}>
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
              <div className={dataRowClass} key={item.id}>
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
          <div className={panelTitleClass}>
            <div>
              <h2>Catálogo de produtos</h2>
              <p>Configure itens disponíveis para venda (planos, consultorias, suplementos).</p>
            </div>
            <span>{products.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreateProduct}>
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
            visibleProducts.map((product) => (
              <div className={dataRowClass} key={product.id}>
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
          {products.length > 0 && (
            <AdminPaginationBar
              page={currentProductsPage}
              pageCount={productsTotalPages}
              totalLabel={`${products.length} produto(s)`}
              onPageChange={setProductsPage}
            />
          )}
        </article>
      </section>}

      {adminSection === "purchases" && <section className="admin-grid phase-three-grid" id="admin-purchases">
        <article className="table-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Registrar compra</h2>
              <p>Associe um produto a um aluno de forma manual.</p>
            </div>
            <span>Manual</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreatePurchase}>
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
          <div className={panelTitleClass}>
            <div>
              <h2>Compras</h2>
              <p>Histórico de compras e status de pagamento.</p>
            </div>
            <span>{purchases.length}</span>
          </div>
          {purchases.length > 0 ? (
            visiblePurchases.map((purchase) => (
              <div className={dataRowClass} key={purchase.id}>
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
          {purchases.length > 0 && (
            <AdminPaginationBar
              page={currentPurchasesPage}
              pageCount={purchasesTotalPages}
              totalLabel={`${purchases.length} compra(s)`}
              onPageChange={setPurchasesPage}
            />
          )}
        </article>
      </section>}

      {adminSection === "qr" && <section className="admin-grid phase-three-grid" id="admin-qr">
        <article className="table-panel">
          <div className={panelTitleClass}>
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
              value={systemSettings["qr_checkin_url"] ?? "https://edersonprogramador.com/checkin"}
              onChange={(event) => setSystemSettingValue("qr_checkin_url", event.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className={dataRowClass}>
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
                qr_checkin_url: systemSettings["qr_checkin_url"] || "https://edersonprogramador.com/checkin",
                qr_checkin_enabled: systemSettings["qr_checkin_enabled"] || "true"
              })
            }
          >
            <Save size={18} />
            Salvar configuração
          </button>
        </article>
        <article className="table-panel dash-qr-preview-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Pré-visualização</h2>
              <p>QR gerado a partir da URL configurada.</p>
            </div>
          </div>
          <div className="dash-qr-box">
            {systemSettings["qr_checkin_enabled"] !== "false" ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  systemSettings["qr_checkin_url"] ?? "https://edersonprogramador.com/checkin"
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
          <div className={panelTitleClass}>
            <div>
              <h2>Cartões dos alunos</h2>
              <p>Cartões salvos para pagamentos recorrentes.</p>
            </div>
            <span>{paymentCards.length}</span>
          </div>
          <form className={crudFormClass} onSubmit={handleCreatePaymentCard}>
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
            visiblePaymentCards.map((card) => (
              <div className={dataRowClass} key={card.id}>
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
          {paymentCards.length > 0 && (
            <AdminPaginationBar
              page={currentCardsPage}
              pageCount={cardsTotalPages}
              totalLabel={`${paymentCards.length} cartão(ões)`}
              onPageChange={setCardsPage}
            />
          )}
        </article>
      </section>}

      {adminSection === "contact" && <section className="admin-grid phase-three-grid" id="admin-contact">
        <article className="table-panel admin-chat-panel">
          <div className={panelTitleClass}>
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
          <div className={panelTitleClass}>
            <div>
              <h2>Mensagens de contato</h2>
              <p>Dúvidas e solicitações enviadas pelos visitantes.</p>
            </div>
            <span>{contactMessages.filter((item) => item.status === "OPEN").length} abertas</span>
          </div>
          {contactMessages.length > 0 ? (
            visibleContactMessages.map((message) => (
              <div className={dataRowClass} key={message.id}>
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
          {contactMessages.length > 0 && (
            <AdminPaginationBar
              page={currentContactPage}
              pageCount={contactTotalPages}
              totalLabel={`${contactMessages.length} mensagem(ns)`}
              onPageChange={setContactPage}
            />
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

      {adminSection === "ratings" && <section className="admin-grid phase-three-grid" id="admin-ratings">
        <article className="table-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Favoritos</h2>
              <p>Favoritos e avaliações · produtos marcados pelos alunos.</p>
            </div>
            <span>{favorites.length}</span>
          </div>
          {favorites.length > 0 ? (
            visibleFavorites.map((favorite) => (
              <div className={dataRowClass} key={favorite.id}>
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
          {favorites.length > 0 && (
            <AdminPaginationBar
              page={currentFavoritesPage}
              pageCount={favoritesTotalPages}
              totalLabel={`${favorites.length} favorito(s)`}
              onPageChange={setFavoritesPage}
            />
          )}
        </article>
        <article className="table-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Avaliações</h2>
              <p>Notas e comentários sobre produtos e treinos.</p>
            </div>
            <span>{ratings.length}</span>
          </div>
          {ratings.length > 0 ? (
            visibleRatings.map((rating) => (
              <div className={dataRowClass} key={rating.id}>
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
          {ratings.length > 0 && (
            <AdminPaginationBar
              page={currentRatingsPage}
              pageCount={ratingsTotalPages}
              totalLabel={`${ratings.length} avaliação(ões)`}
              onPageChange={setRatingsPage}
            />
          )}
        </article>
      </section>}

      {adminSection === "profile" && (
        <section className="admin-profile-sheet" id="admin-profile">
          <div className="dashboard-heading mb-[18px] grid gap-2">
            <span className="eyebrow w-fit">Conta administrativa</span>
            <h1 className="font-display m-0 text-[clamp(26px,3vw,36px)] font-semibold uppercase leading-tight tracking-tight text-sand">
              Meu perfil
            </h1>
            <p className="m-0 max-w-xl text-sm text-sand-muted">
              Gerencie seus dados de acesso e atalhos das funções do administrador do sistema.
            </p>
          </div>

          <form
            key={`admin-profile-form-${adminProfileFormKey}`}
            id="admin-profile-form"
            className={`admin-profile-form${adminProfileEditing ? "" : " admin-profile-locked"}`}
            onSubmit={handleUpdateAdminProfile}
          >
            <div className="admin-profile-identity">
              <label className="admin-profile-avatar-field">
                <span className="admin-profile-avatar-preview">
                  {adminAvatarPreview ?? adminProfile?.avatarUrl ? (
                    <img
                      src={adminAvatarPreview ?? mediaUrl(adminProfile?.avatarUrl ?? "")}
                      alt=""
                    />
                  ) : (
                    <UserRound size={32} className="admin-profile-avatar-placeholder" />
                  )}
                </span>
                {adminProfileEditing && (
                  <>
                    <input
                      name="avatar"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleAdminAvatarChange}
                    />
                    <small>JPG, PNG, WEBP ou GIF</small>
                  </>
                )}
              </label>
              <div className="admin-profile-identity-copy">
                <strong>{adminProfile?.name ?? authUser?.name ?? "Administrador"}</strong>
                <span>{adminProfile?.email ?? authUser?.email ?? "—"}</span>
                <em>
                  {adminProfile?.gender === "MALE"
                    ? "Masculino"
                    : adminProfile?.gender === "FEMALE"
                      ? "Feminino"
                      : "Sexo não informado"}
                  {" · "}
                  {adminProfile?.role === "ADMIN" || authUser?.role === "ADMIN"
                    ? "Administrador"
                    : "Operador"}
                </em>
              </div>
            </div>

            <fieldset className="admin-profile-group">
              <legend>Identificação</legend>
              <label>
                Nome completo
                <input
                  name="name"
                  defaultValue={adminProfile?.name ?? authUser?.name ?? ""}
                  minLength={2}
                  required
                  disabled={!adminProfileEditing}
                  placeholder="Nome do administrador"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  defaultValue={adminProfile?.email ?? authUser?.email ?? ""}
                  required
                  disabled={!adminProfileEditing}
                  placeholder="admin@apptreino.com"
                />
              </label>
              <label>
                CPF
                <input
                  name="document"
                  defaultValue={adminProfile?.document ?? ""}
                  disabled={!adminProfileEditing}
                  placeholder="000.000.000-00"
                />
              </label>
              <label>
                Data de nascimento
                <input
                  name="birthDate"
                  type="date"
                  defaultValue={adminProfile?.birthDate ?? ""}
                  disabled={!adminProfileEditing}
                />
              </label>
              <label className="admin-profile-wide">
                Sexo
                <select
                  name="gender"
                  defaultValue={adminProfile?.gender ?? ""}
                  disabled={!adminProfileEditing}
                >
                  <option value="">Não informado</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Feminino</option>
                </select>
              </label>
            </fieldset>

            <fieldset className="admin-profile-group">
              <legend>Contato e localização</legend>
              <label>
                Telefone
                <input
                  name="phone"
                  type="tel"
                  defaultValue={adminProfile?.phone ?? authUser?.phone ?? ""}
                  disabled={!adminProfileEditing}
                  placeholder="+55 11 99999-9999"
                />
              </label>
              <StateCityFields
                key={`admin-profile-location-${adminProfileFormKey}`}
                stateDefault={adminProfile?.state}
                cityDefault={adminProfile?.city}
                disabled={!adminProfileEditing}
                withLabels
              />
            </fieldset>

            <fieldset className="admin-profile-group">
              <legend>Segurança</legend>
              <label className="admin-profile-wide">
                Nova senha
                <input
                  name="password"
                  type="password"
                  minLength={6}
                  disabled={!adminProfileEditing}
                  placeholder={adminProfileEditing ? "Deixe em branco para manter" : "••••••••"}
                  autoComplete="new-password"
                />
                <small>Mínimo 6 caracteres · só altera se preencher</small>
              </label>
            </fieldset>

            <article className="admin-profile-note">
              <ShieldCheck size={16} />
              <span>
                Este perfil controla o acesso ao painel. Alterações de e-mail e senha afetam o login imediato.
              </span>
            </article>
          </form>

          <div className="admin-profile-actions">
            {adminProfileEditing ? (
              <>
                <button
                  className="primary-button"
                  type="button"
                  disabled={adminProfileSaving}
                  onClick={() => {
                    const form = document.getElementById("admin-profile-form");
                    if (form instanceof HTMLFormElement) void saveAdminProfile(form);
                  }}
                >
                  {adminProfileSaving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  Salvar alterações
                </button>
                <button className="outline-button" type="button" onClick={handleCancelAdminProfileEdit} disabled={adminProfileSaving}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button className="primary-button" type="button" onClick={() => setAdminProfileEditing(true)}>
                  <Pencil size={18} />
                  Editar perfil
                </button>
                <button
                  className="outline-button"
                  type="button"
                  disabled={adminPreviewEntering}
                  onClick={() => {
                    void (async () => {
                      setAdminPreviewEntering(true);
                      setFeedback(null);
                      try {
                        await enterAdminPreview();
                      } catch (error) {
                        setFeedback(getApiErrorMessage(error, "Não foi possível abrir o modo preview do aluno."));
                        setAdminPreviewEntering(false);
                      }
                    })();
                  }}
                >
                  {adminPreviewEntering ? <Loader2 className="spin" size={18} /> : <Eye size={18} />}
                  Ver como aluno
                </button>
              </>
            )}
          </div>

          <div className="admin-profile-functions">
            <div className="admin-profile-functions-heading">
              <h2>Funções do administrador</h2>
              <p>Atalhos para as principais operações do sistema.</p>
            </div>
            <div className="admin-profile-function-grid">
              <button
                type="button"
                className="admin-profile-function-card"
                disabled={adminPreviewEntering}
                onClick={() => {
                  void (async () => {
                    setAdminPreviewEntering(true);
                    setFeedback(null);
                    try {
                      await enterAdminPreview();
                    } catch (error) {
                      setFeedback(getApiErrorMessage(error, "Não foi possível abrir o modo preview do aluno."));
                      setAdminPreviewEntering(false);
                    }
                  })();
                }}
              >
                <Eye size={20} />
                <strong>Ver como aluno</strong>
                <span>Abre o app do aluno com a sua conta (modo preview seguro)</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("training")}>
                <Dumbbell size={20} />
                <strong>CMS de treinos</strong>
                <span>Unidades, modalidades, blocos e publicação</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("users")}>
                <UsersRound size={20} />
                <strong>Dados do usuário</strong>
                <span>Cadastro, perfil e vínculo de alunos</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("finance")}>
                <CircleDollarSign size={20} />
                <strong>Financeiro</strong>
                <span>Planos, pagamentos e assinaturas</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("settings")}>
                <Settings size={20} />
                <strong>Configurações</strong>
                <span>Aparência, sons e módulos do app</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("contact")}>
                <MessageCircle size={20} />
                <strong>Atendimento</strong>
                <span>Tickets e mensagens dos alunos</span>
              </button>
              <button type="button" className="admin-profile-function-card" onClick={() => goAdminSection("trash")}>
                <Trash2 size={20} />
                <strong>Lixeira</strong>
                <span>Restaurar ou excluir itens removidos</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {adminSection === "settings" && <section className="admin-grid phase-three-grid" id="admin-settings">
        <article className="table-panel">
          <div className={panelTitleClass}>
            <h2>Aparência e sons</h2>
            <span>Interface</span>
          </div>
          <div className="grid gap-6 p-2">
            <ThemeModeSwitch />
            <AdminSoundToggle />
          </div>
        </article>
        <article className="table-panel">
          <div className={panelTitleClass}>
            <h2>Configurações do sistema</h2>
            <span>Operacional</span>
          </div>
          <div className="settings-grid">
            <div className="settings-card">
              <Settings size={20} />
              <span>
                <strong>Publicação automática</strong>
                Treinos publicados continuam disponíveis para alunos ativos e pagos.
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
          <div className={panelTitleClass}>
            <div>
              <h2>Módulos do sistema</h2>
              <p>Ative ou desative cada módulo para preparar sua evolução.</p>
            </div>
            <span>
              {moduleSettingRows.filter((item) => systemSettings[item.key] !== "false").length} ativos
            </span>
          </div>
          {moduleSettingRows.map((module) => (
            <div className={dataRowClass} key={module.key}>
              <span>
                <strong>{module.label}</strong>
                {module.description}
              </span>
              <select
                aria-label={`Módulo ${module.label}`}
                value={systemSettings[module.key] ?? "true"}
                onChange={(event) => {
                  const value = event.target.value;
                  const keys = "syncKeys" in module && module.syncKeys ? module.syncKeys : [module.key];
                  keys.forEach((key) => setSystemSettingValue(key, value));
                }}
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
          <div className={panelTitleClass}>
            <h2>Manutenção</h2>
            <span>Dados</span>
          </div>
          <div className={dataRowClass}>
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
          <div className={panelTitleClass}>
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

      {cmsPublishPreview && (
        <div className="cms-confirm-overlay" role="presentation" onMouseDown={() => setCmsPublishPreview(null)}>
          <section
            className="cms-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cms-publish-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="cms-confirm-icon">
              <Check size={26} />
            </div>
            <h2 id="cms-publish-title">Confirmar publicação</h2>
            {cmsPublishPreview.ready ? (
              <>
                <p>
                  O treino <strong>{cmsPublishPreview.title}</strong> será publicado para alunos ativos.
                </p>
                <div className="cms-confirm-target">
                  <small>{cmsPublishPreview.modalityName ?? "Sem modalidade"}</small>
                  <strong>{cmsPublishPreview.dayCount} dia(s) no ciclo</strong>
                  <small>{cmsPublishPreview.audienceLabel}</small>
                  <small>
                    Público:{" "}
                    {cmsPublishPreview.targetGender === "MALE"
                      ? "Masculino"
                      : cmsPublishPreview.targetGender === "FEMALE"
                        ? "Feminino"
                        : "Todos"}
                  </small>
                  {cmsPublishPreview.audienceMode === "ALL_ACTIVE" && (
                    <small>{cmsPublishPreview.eligibleStudentCount} aluno(s) ativo(s) elegível(eis) receberão o treino.</small>
                  )}
                  {cmsPublishPreview.audienceMode === "SELECTED" && (
                    <small>Após publicar, atribua manualmente os alunos que devem receber este treino.</small>
                  )}
                </div>
              </>
            ) : (
              <>
                <p>Este treino ainda não pode ser publicado.</p>
                <div className="cms-readiness blocked">
                  <ul>
                    {cmsPublishPreview.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            <div className="cms-confirm-actions">
              <button type="button" className="outline-button" onClick={() => setCmsPublishPreview(null)}>
                Cancelar
              </button>
              {cmsPublishPreview.ready && (
                <button type="button" className="primary-button" data-testid="cms-confirm-publish" onClick={() => void confirmPublishCmsProgram()} autoFocus>
                  Publicar agora
                </button>
              )}
            </div>
          </section>
        </div>
      )}

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
                className={dangerButtonClass}
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
