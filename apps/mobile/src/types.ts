export type WorkoutStructureType =
  | "NORMAL"
  | "BI_SET"
  | "DROP_SET"
  | "REST_PAUSE"
  | "CIRCUIT"
  | "AMRAP"
  | "EMOM"
  | "FOR_TIME"
  | "TABATA"
  | "INTERVAL"
  | "CLASS";

export type WorkoutPrescriptionType = "REPETITIONS" | "DURATION" | "DISTANCE" | "INTERVAL" | "ROUNDS" | "HOLD" | "FREE";
export type WorkoutIntensityType = "NONE" | "LOAD" | "RPE" | "RIR" | "PERCENT_1RM" | "HEART_RATE_ZONE" | "PACE" | "SPEED";

export type WorkoutExercise = {
  prescriptionId: string;
  id: string;
  title: string;
  videoUrl?: string;
  audioUrl?: string;
  materialUrl?: string;
  description?: string;
  targetMuscles?: string[];
  equipmentTags?: string[];
  sets: number;
  repsRange: string;
  prescriptionType?: WorkoutPrescriptionType;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rounds?: number | null;
  workSeconds?: number | null;
  intensityType?: WorkoutIntensityType;
  intensityValue?: string;
  tempo?: string;
  side?: string;
  executionNotes?: string;
  initialLoad?: string;
  restSeconds?: number;
  latestWeightUsed?: number;
  order: number;
  alternatives?: Array<{
    id: string;
    title: string;
    videoUrl: string;
    audioUrl?: string;
    materialUrl?: string;
  }>;
};

export type WorkoutBlock = {
  title: string;
  identifier?: string | null;
  focus?: string | null;
  weeklyFrequency?: number;
  restTime: number;
  structureType?: WorkoutStructureType;
  protocolRounds?: number | null;
  workSeconds?: number | null;
  timeCapSeconds?: number | null;
  instructions?: string | null;
  exercises: WorkoutExercise[];
};

export type WorkoutProgram = {
  programId: string;
  programTitle: string;
  assignmentId: string;
  dayNumber: number;
  totalDays: number;
  totalWorkouts: number;
  modality?: string;
  modalityImageUrl?: string | null;
  completedWorkouts?: number;
  cycleCompleted?: boolean;
  completionCount?: number;
  favoritedByMe?: boolean;
  ratedByMe?: boolean;
  teacherNames?: string[];
  unitName?: string;
  membershipStartsAt?: string | null;
  membershipEndsAt?: string | null;
  duration?: {
    years?: number | null;
    months?: number | null;
    weeks?: number | null;
    days?: number | null;
    estimatedCalendarDays?: number | null;
    plannedEndsAt?: string | null;
  } | null;
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
    block: WorkoutBlock;
  }>;
  block: WorkoutBlock;
};

export type StudentProfile = {
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
  enrollmentStatus?: "PENDING" | "ACTIVE" | "CANCELED";
  achievements?: Array<{
    modalityId: string;
    modalityName: string;
    modalityImageUrl?: string | null;
    completionCount: number;
    lastCompletedAt: string;
  }>;
};

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  publishedAt: string;
  readAt?: string | null;
  targetSection?: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  description?: string | null;
  priceInCents: number;
  imageUrl?: string | null;
  outOfStock?: boolean;
  category?: string | null;
  kind?: "PHYSICAL" | "DIGITAL" | string;
  shippingMethod?: "PICKUP" | "DELIVERY" | "DIGITAL" | string | null;
  stock?: number | null;
  purchasedByMe?: boolean;
};

export type CartRow = {
  id?: string;
  items: Array<{
    id?: string;
    productId: string;
    quantity: number;
    lineTotalInCents?: number;
    product: {
      name: string;
      priceInCents: number;
      imageUrl?: string | null;
      stock?: number | null;
      shippingMethod?: string | null;
      kind?: string | null;
    };
  }>;
  amountInCents: number;
  itemCount: number;
  couponCode?: string | null;
  subtotalInCents?: number;
  discountInCents?: number;
  shippingInCents?: number;
  shippingMethod?: string | null;
};

export type PurchaseRow = {
  id: string;
  status: string;
  amountInCents: number;
  createdAt: string;
  paymentUrl?: string | null;
  product?: { name?: string; kind?: string | null };
};

export type MembershipRow = {
  id?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string | null;
  plan?: {
    name?: string;
    priceInCents?: number;
    billingCycle?: string;
  };
} | null;

export type PaymentRow = {
  id: string;
  status: string;
  amountInCents?: number;
  dueDate?: string;
  paidAt?: string | null;
  paymentUrl?: string | null;
};

export type PaymentCardRow = {
  id: string;
  brand?: string | null;
  lastFour: string;
  holderName?: string | null;
  isDefault?: boolean;
};

export type LocationRow = {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
};

export type EventRow = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  capacity?: number | null;
  registered?: boolean;
  registrationCount?: number;
};

export type TicketMessage = {
  id: string;
  senderType: "STUDENT" | "ADMIN" | string;
  body: string;
  createdAt: string;
};

export type TicketRow = {
  id: string;
  subject: string;
  message?: string;
  category?: string;
  status: string;
  createdAt: string;
  messages?: TicketMessage[];
};

export type AttendanceRow = { id: string; date: string };

export type WorkoutFavorite = {
  id: string;
  createdAt?: string;
  program: {
    id: string;
    title: string;
    description?: string | null;
    modality?: string | null;
    modalityImageUrl?: string | null;
    totalWorkouts?: number;
  };
};

export type OrderRow = {
  id: string;
  status: string;
  amountInCents: number;
  createdAt: string;
  paymentUrl?: string | null;
  shippingMethod?: string | null;
  items?: Array<{ productName: string; quantity: number }>;
};

export type AssessmentPhotoKey = "foto_frente" | "foto_costas" | "foto_perfil";

export type PhysicalAssessmentForm = {
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
};

export type AssessmentRow = {
  id: string;
  assessedAt: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipCm?: number | null;
  notes?: string | null;
  source?: "STUDENT" | "ADMIN" | string;
  details?: PhysicalAssessmentForm | null;
};

export type MusicTrack = {
  id: string;
  title: string;
  artist?: string | null;
  coverUrl?: string | null;
  audioUrl?: string | null;
  url?: string | null;
  durationSec?: number | null;
  albumId?: string | null;
};

export type MusicAlbum = {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  tracks: MusicTrack[];
};

export type AiWorkoutPlan = {
  id: string;
  objective: string;
  level: string;
  daysPerWeek: number;
  focus?: string | null;
  plan?: {
    summary?: string;
    recommendations?: string[];
    days?: Array<{
      title: string;
      focus: string;
      modality?: string;
      exercises: Array<{ name: string; sets: number; reps: string; restSeconds?: number }>;
    }>;
    diet?: {
      biotype: string;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      strategy: string;
      meals: Array<{ name: string; items: string[] }>;
    };
  };
};

export type OutdoorSport = "RUN" | "WALK" | "RIDE";

export type SocialAuthor = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  following?: boolean;
};

export type SocialComment = {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  author: SocialAuthor;
  likesCount?: number;
  likedByMe?: boolean;
  repliesCount?: number;
  replies?: SocialComment[];
};

export type OutdoorActivityRow = {
  id: string;
  sport: OutdoorSport;
  sportLabel: string;
  title: string;
  status: string;
  startedAt: string;
  pausedAt?: string | null;
  finishedAt?: string | null;
  pauseMs?: number;
  elapsedSeconds: number;
  movingSeconds?: number;
  distanceMeters: number;
  avgPaceSecPerKm?: number | null;
  avgSpeedMps?: number | null;
  maxSpeedMps?: number | null;
  calories: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  estimatedPowerWatts?: number | null;
  stepsCount?: number;
  avgCadenceSpm?: number | null;
  avgHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  bestEfforts?: Array<{ label: string; elapsedSeconds: number; paceSecPerKm: number; distanceMeters?: number }>;
  mapType: string;
  activityMap: string;
  layers?: Record<string, boolean> | null;
  is3d: boolean;
  polyline: Array<{ lat: number; lng: number; t?: number; ele?: number | null }>;
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
};

export type WorkoutShareRow = {
  programTitle: string;
  blockTitle: string;
  dayNumber: number;
  exerciseCount: number;
  durationSeconds: number;
  structureType?: string | null;
};

export type SocialPostRow = {
  id: string;
  kind: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaItems?: Array<{ url: string; type: string; coverUrl?: string | null }>;
  createdAt: string;
  author: SocialAuthor;
  likesCount: number;
  likedByMe: boolean;
  dislikesCount?: number;
  dislikedByMe?: boolean;
  commentsCount?: number;
  comments: SocialComment[];
  activity?: OutdoorActivityRow | null;
  workout?: WorkoutShareRow | null;
  isMine?: boolean;
};

export type SocialStoryItem = {
  id: string;
  mediaUrl: string;
  mediaType: string;
  coverUrl?: string | null;
  caption?: string | null;
  mood: string;
  createdAt: string;
  expiresAt?: string;
  seen: boolean;
};

export type SocialStoryRail = {
  userId: string;
  username: string;
  image_url?: string | null;
  isMine: boolean;
  unseen: boolean;
  items: SocialStoryItem[];
};

export type SocialStoryGalleryItem = {
  id: string;
  storyId?: string | null;
  mediaUrl: string;
  mediaType: string;
  coverUrl?: string | null;
  caption?: string | null;
  mood?: string | null;
  savedAt: string;
};

export type ClubChallengeRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sport: OutdoorSport;
  sportLabel: string;
  goalMeters: number;
  period: string;
  cellH3?: string | null;
  scopedLocal?: boolean;
  joined: boolean;
  progressMeters: number;
  percent: number;
};
