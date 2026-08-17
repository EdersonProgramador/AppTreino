import type { UserRole } from "@app-treino/shared";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
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

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  priceInCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
}

export interface MembershipRow {
  id: string;
  userId: string;
  planId: string;
  status: "ACTIVE" | "PENDING" | "OVERDUE" | "CANCELED";
  startsAt: string;
  endsAt?: string | null;
  user: AdminUser;
  plan: PlanRow;
}

export interface PaymentRow {
  id: string;
  membershipId: string;
  amountInCents: number;
  status: "PENDING" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "CANCELED";
  dueDate: string;
  paidAt?: string | null;
  paymentUrl?: string | null;
  membership?: MembershipRow;
}

export interface PhysicalAssessmentRow {
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

export interface PhysicalAssessmentForm {
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

export type AssessmentPhotoKey = "foto_frente" | "foto_costas" | "foto_perfil";
export type AssessmentPerimeterKey = keyof Omit<PhysicalAssessmentForm["formulario_avaliacao_fisica"]["perimetros_corporais_cm"], "instrucao">;

export interface EventRow {
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

export interface TicketMessageRow {
  id: string;
  ticketId: string;
  senderId?: string | null;
  senderType: "STUDENT" | "ADMIN";
  body: string;
  createdAt: string;
}

export interface SupportTicketRow {
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

export interface AiWorkoutPlanRow {
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

export interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  priceInCents: number;
  imageUrl?: string | null;
  category?: string | null;
  kind?: "PHYSICAL" | "DIGITAL";
  shippingMethod?: "PICKUP" | "DELIVERY" | "DIGITAL";
  stock?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { purchases: number; favorites: number; ratings: number };
  purchasedByMe?: boolean;
  favoritedByMe?: boolean;
  ratedByMe?: boolean;
  outOfStock?: boolean;
}

export type PurchaseStatus =
  | "PENDING"
  | "CONFIRMED"
  | "READY"
  | "DELIVERED"
  | "CANCELED"
  | "REFUNDED";

export interface PurchaseRow {
  id: string;
  userId: string;
  productId: string;
  amountInCents: number;
  quantity?: number;
  status: PurchaseStatus;
  paymentMethod?: string | null;
  notes?: string | null;
  asaasPaymentId?: string | null;
  paymentUrl?: string | null;
  createdAt: string;
  paidAt?: string | null;
  fulfilledAt?: string | null;
  user: AdminUser;
  product: ProductRow;
}

export type OrderStatus = PurchaseStatus;
export type ShippingMethod = "PICKUP" | "DELIVERY" | "DIGITAL";

export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceInCents: number;
  amountInCents: number;
}

export interface OrderRow {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  amountInCents: number;
  shippingMethod: ShippingMethod;
  shippingAddress?: string | null;
  couponId?: string | null;
  couponCode?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  asaasPaymentId?: string | null;
  paymentUrl?: string | null;
  createdAt: string;
  paidAt?: string | null;
  fulfilledAt?: string | null;
  items: OrderItemRow[];
  user?: AdminUser;
}

export interface CouponRow {
  id: string;
  code: string;
  description?: string | null;
  percentOff?: number | null;
  amountOffCents?: number | null;
  minOrderCents: number;
  maxUses?: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
}

export interface CartItemRow {
  id: string;
  productId: string;
  quantity: number;
  lineTotalInCents: number;
  product: ProductRow;
}

export interface CartRow {
  id: string;
  couponCode?: string | null;
  items: CartItemRow[];
  subtotalInCents: number;
  discountInCents: number;
  shippingInCents: number;
  shippingMethod: ShippingMethod;
  amountInCents: number;
  itemCount: number;
}


export interface PaymentCardRow {
  id: string;
  userId: string;
  brand?: string | null;
  lastFour: string;
  holderName?: string | null;
  isDefault: boolean;
  createdAt: string;
  user: AdminUser;
}

export interface FavoriteRow {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  user: AdminUser;
  product: ProductRow;
}

export interface RatingRow {
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

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  status: "OPEN" | "RESOLVED" | "CLOSED";
  createdAt: string;
  repliedAt?: string | null;
}

import type { StudentMembershipRow } from "./student";

export interface CheckoutSessionResponse {
  membership: StudentMembershipRow;
  payment: PaymentRow | null;
  alreadyActive: boolean;
}

export interface UploadResponse {
  file: {
    url: string;
    originalName: string;
    mimeType: string;
    path: string;
  };
}
