import type { PlanRow } from "./shared";
import type { WorkoutPlayerExercise, WorkoutStructureType } from "../components/student/WorkoutPlayer";

export interface WorkoutRow {
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

export interface StudentLocationRow {
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

export interface StudentMembershipRow {
  id: string;
  userId: string;
  planId: string;
  status: "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";
  startsAt: string;
  endsAt?: string | null;
  plan: PlanRow;
}

export interface StudentProfile {
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  birthDate?: string | null;
  objective?: string | null;
  level?: string | null;
  daysPerWeek?: number | null;
  equipmentTags?: string[];
  city?: string | null;
  state?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  coverColor?: string | null;
  coverUrl?: string | null;
  isPrivate?: boolean;
  createdAt?: string | null;
  locationId?: string | null;
  /** Liberação administrativa (sem membership Asaas) ou espelho pós-pagamento. */
  enrollmentStatus?: "PENDING" | "ACTIVE" | "CANCELED";
  achievements?: Array<{
    modalityId: string;
    modalityName: string;
    modalityImageUrl?: string | null;
    completionCount: number;
    lastCompletedAt: string;
  }>;
}

export interface NotificationRow {
  id: string;
  type: "WORKOUT_PROGRAM" | "EVENT" | "WORKOUT" | "ACHIEVEMENT" | "SUPPORT" | "ANNOUNCEMENT" | "LOCATION" | "PRODUCT" | string;
  title: string;
  message: string;
  publishedAt: string;
  readAt?: string | null;
  targetSection?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface StudentFavoriteRow {
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

export interface TodayWorkoutResponse {
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
    cycleCompleted?: boolean;
    completionCount?: number;
    teacherNames?: string[];
    unitName?: string;
    membershipStartsAt?: string | null;
    membershipEndsAt?: string | null;
    duration?: {
      years: number;
      months: number;
      weeks: number;
      days: number;
      estimatedCalendarDays: number;
      plannedSessions: number;
      completionMode: "BY_SESSIONS" | "BY_DATE" | "BOTH" | "MANUAL";
      scheduleType: "ROTATING_CYCLE" | "WEEKLY" | "ON_DEMAND";
      cycleLengthDays: number;
      startedAt: string;
      plannedEndsAt?: string | null;
    };
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
      cycleCompleted?: boolean;
      completionCount?: number;
      block: {
        title: string;
        identifier?: string | null;
        focus?: string | null;
        weeklyFrequency?: number;
        structureType: WorkoutStructureType;
        restTime: number;
        protocolRounds?: number | null;
        workSeconds?: number | null;
        timeCapSeconds?: number | null;
        instructions?: string | null;
        exercises: WorkoutPlayerExercise[];
      };
    }>;
    block: {
      title: string;
      identifier?: string | null;
      focus?: string | null;
      weeklyFrequency?: number;
      structureType: WorkoutStructureType;
      restTime: number;
      protocolRounds?: number | null;
      workSeconds?: number | null;
      timeCapSeconds?: number | null;
      instructions?: string | null;
      exercises: WorkoutPlayerExercise[];
    };
  };
}

export interface StudentWorkoutProgramsResponse {
  workouts: TodayWorkoutResponse["workout"][];
}

export interface WorkoutSessionResponse {
  session: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED" | "CANCELED";
    startedAt: string;
    finishedAt?: string | null;
    durationSeconds?: number | null;
  };
}

export interface WorkoutConsistencyResponse {
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

export type OutdoorSport = "RUN" | "WALK" | "RIDE";
export type SocialPostKind = "TEXT" | "PHOTO" | "VIDEO" | "ACTIVITY";

export interface SocialAuthor {
  id: string;
  name: string;
  avatarUrl?: string | null;
  following?: boolean;
}

export interface SocialComment {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  author: SocialAuthor;
  likesCount?: number;
  likedByMe?: boolean;
  repliesCount?: number;
  replies?: SocialComment[];
}

export interface OutdoorActivityRow {
  id: string;
  sport: OutdoorSport;
  sportLabel: string;
  title: string;
  status: "LIVE" | "PAUSED" | "COMPLETED" | "CANCELED" | string;
  startedAt: string;
  finishedAt?: string | null;
  pauseMs?: number;
  elapsedSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  avgPaceSecPerKm?: number | null;
  avgSpeedMps?: number | null;
  maxSpeedMps?: number | null;
  elevationGainMeters: number;
  calories: number;
  mapType: string;
  activityMap: string;
  layers?: {
    pois?: boolean;
    bikeLanes?: boolean;
    avalanche?: boolean;
    slope?: boolean;
    aspect?: boolean;
  } | null;
  is3d: boolean;
  targetDistanceMeters?: number | null;
  goals?: {
    distanceKm?: number;
    durationSeconds?: number;
    speedKmh?: number;
    lapRadiusMeters?: number;
    lapCounterOn?: boolean;
    lapMarker?: { lat: number; lng: number; radiusMeters?: number } | null;
    laps?: Array<{ index: number; lat: number; lng: number; t: number; distanceMeters: number }>;
  } | null;
  polyline: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>;
  summary?: Record<string, unknown> | null;
  splits?: Array<{
    km: number;
    distance: number;
    elapsedTime: number;
    paceSecPerKm: number;
    partial?: boolean;
  }>;
  splitsAnalysis?: {
    bestKm?: number | null;
    worstKm?: number | null;
    bestPaceSecPerKm?: number | null;
    worstPaceSecPerKm?: number | null;
  } | null;
  photoUrl?: string | null;
  videoUrl?: string | null;
  caption?: string | null;
}

export interface SocialPostRow {
  id: string;
  kind: SocialPostKind | string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: "IMAGE" | "VIDEO" | string | null;
  mediaItems?: Array<{ url: string; type: "IMAGE" | "VIDEO" | string }>;
  createdAt: string;
  author: SocialAuthor;
  likesCount: number;
  likedByMe: boolean;
  dislikesCount?: number;
  dislikedByMe?: boolean;
  commentsCount?: number;
  comments: SocialComment[];
  activity?: OutdoorActivityRow | null;
  isMine?: boolean;
}

export interface SocialStoryItem {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption?: string | null;
  mood: string;
  createdAt: string;
  seen: boolean;
}

export interface SocialStoryRail {
  userId: string;
  username: string;
  image_url?: string | null;
  isMine: boolean;
  unseen: boolean;
  items: SocialStoryItem[];
}

export interface ClubChallengeRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sport: OutdoorSport;
  sportLabel: string;
  goalMeters: number;
  period: "WEEK" | "MONTH" | "OPEN" | string;
  joined: boolean;
  progressMeters: number;
  percent: number;
}
