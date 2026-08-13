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
  locationId?: string | null;
  /** Liberação administrativa (sem membership Asaas) ou espelho pós-pagamento. */
  enrollmentStatus?: "PENDING" | "ACTIVE" | "CANCELED";
}

export interface NotificationRow {
  id: string;
  type: "WORKOUT_PROGRAM" | "EVENT" | "WORKOUT" | "SUPPORT" | "ANNOUNCEMENT" | "LOCATION";
  title: string;
  message: string;
  publishedAt: string;
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
