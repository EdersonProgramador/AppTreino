export type Biotype = "ectomorfo" | "mesomorfo" | "endomorfo";

export type CoachExercise = {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
};

export type CoachDay = {
  title: string;
  focus: string;
  modality: string;
  exercises: CoachExercise[];
};

export type DietMeal = {
  name: string;
  items: string[];
};

export type DietPlan = {
  biotype: Biotype;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  strategy: string;
  meals: DietMeal[];
  notes: string[];
};

export type CoachPlan = {
  summary: string;
  days: CoachDay[];
  recommendations: string[];
  diet?: DietPlan;
  modalities: string[];
};

export type CoachWeather = {
  tempC: number;
  label?: string;
  code?: number;
};

export type CoachMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CoachContext = {
  name: string;
  objective: string;
  level: string;
  daysPerWeek: number;
  focus?: string;
  gender?: string | null;
  city?: string | null;
  equipmentTags: string[];
  biotype: Biotype;
  biotypeReason: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  streakDays: number;
  sportTotals: {
    WORKOUT: number;
    RUN: number;
    WALK: number;
    RIDE: number;
  };
  weather?: CoachWeather | null;
};

export type CoachChatResult = {
  reply: string;
  source: "llm" | "local";
  plan?: CoachPlan;
  diet?: DietPlan;
};