import type {
  AdminUser,
  AiWorkoutPlanRow,
  AssessmentPerimeterKey,
  AssessmentPhotoKey,
  EventRow,
  MembershipRow,
  PaymentRow,
  PhysicalAssessmentForm,
  PhysicalAssessmentRow,
  SupportTicketRow
} from "./shared";
import type {
  WorkoutIntensityType,
  WorkoutPrescriptionType,
  WorkoutStructureType
} from "../components/student/WorkoutPlayer";

export interface CmsExerciseRow {
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

export interface CmsModalityRow {
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

export interface CmsLocationRow {
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

export interface CmsAnnouncementRow {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CmsWorkoutBlockRow {
  id: string;
  title: string;
  identifier?: string | null;
  focus?: string | null;
  weeklyFrequency: number;
  structureType: WorkoutStructureType;
  restTime: number;
  protocolRounds?: number | null;
  workSeconds?: number | null;
  timeCapSeconds?: number | null;
  instructions?: string | null;
  modality?: CmsModalityRow | null;
  programDays?: Array<{
    id: string;
    dayNumber: number;
    order: number;
    program: {
      id: string;
      title: string;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      isActive: boolean;
      deletedAt?: string | null;
      cycleLengthDays?: number;
    };
  }>;
  exercises: Array<{
    id: string;
    sets: number;
    repsRange: string;
    prescriptionType: WorkoutPrescriptionType;
    repsMin?: number | null;
    repsMax?: number | null;
    durationSeconds?: number | null;
    distanceMeters?: number | null;
    rounds?: number | null;
    workSeconds?: number | null;
    intensityType?: WorkoutIntensityType;
    intensityValue?: string | null;
    tempo?: string | null;
    side?: string | null;
    executionNotes?: string | null;
    initialLoad?: string | null;
    restSeconds?: number | null;
    supportMaterialUrl?: string | null;
    order: number;
    exercise: CmsExerciseRow;
  }>;
}

export interface CmsProgramRow {
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
  durationExtraDays: number;
  plannedSessions: number;
  completionMode: "BY_SESSIONS" | "BY_DATE" | "BOTH" | "MANUAL";
  scheduleType: "ROTATING_CYCLE" | "WEEKLY" | "ON_DEMAND";
  audienceMode: "ALL_ACTIVE" | "SELECTED";
  cycleLengthDays: number;
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

export interface CmsWorkflowSummary {
  modalities: { total: number; active: number };
  exercises: { total: number; withoutModality: number };
  workoutBlocks: {
    total: number;
    withoutExercises: number;
    withoutModality: number;
    unpublished: number;
  };
  programs: { total: number; published: number; draftsReady: number };
}

export interface CmsPublishPreview {
  programId: string;
  title: string;
  status: CmsProgramRow["status"];
  audienceMode: CmsProgramRow["audienceMode"];
  audienceLabel: string;
  targetGender: CmsProgramRow["targetGender"];
  ready: boolean;
  issues: string[];
  eligibleStudentCount: number;
  dayCount: number;
  modalityName: string | null;
}

export interface TrashDisplayItem {
  id: string;
  name: string;
  sub?: string | null;
}

export type AdminTrashKind =
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

export type AdminTrashData = Record<AdminTrashKind, TrashDisplayItem[]>;

export const CMS_TRASH_KINDS: AdminTrashKind[] = ["locations", "modalities", "exercises", "workoutBlocks", "programs"];

export const ALL_TRASH_KINDS: AdminTrashKind[] = [
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

export interface CmsDeleteTarget {
  kind: AdminTrashKind;
  id: string;
  name: string;
  permanent?: boolean;
}

export const assessmentPerimeterKeys = [
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

export const assessmentPhotoFields = [
  ["foto_frente", "Foto de frente"],
  ["foto_costas", "Foto de costas"],
  ["foto_perfil", "Foto de perfil"]
] as const satisfies readonly (readonly [AssessmentPhotoKey, string])[];

export interface AdminStudentOverview {
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

export type AdminResource =
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
  | "orders"
  | "coupons"
  | "paymentCards"
  | "favorites"
  | "ratings"
  | "contactMessages"
  | "settings";

export const ALL_ADMIN_RESOURCES: AdminResource[] = [
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
  "orders",
  "coupons",
  "paymentCards",
  "favorites",
  "ratings",
  "contactMessages",
  "settings"
];
