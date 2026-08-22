const productKindLabel: Record<string, string> = {
  PHYSICAL: "Físico",
  DIGITAL: "Digital"
};

const purchaseStatusLabel: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  CONFIRMED: "Pago",
  READY: "Pronto para retirada",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado"
};

const shippingMethodLabel: Record<string, string> = {
  PICKUP: "Retirada na unidade",
  DELIVERY: "Entrega",
  DIGITAL: "Digital / online"
};

export function labelProductKind(kind?: string | null) {
  if (!kind) return productKindLabel.PHYSICAL;
  return productKindLabel[kind] ?? kind;
}

export function labelPurchaseStatus(status: string) {
  return purchaseStatusLabel[status] ?? status;
}

export function labelShippingMethod(method?: string | null) {
  if (!method) return shippingMethodLabel.PICKUP;
  return shippingMethodLabel[method] ?? method;
}

export function labelOrderStatus(status: string) {
  return labelPurchaseStatus(status);
}

const membershipStatusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  PENDING: "Pendente",
  OVERDUE: "Em atraso",
  CANCELED: "Cancelada"
};

const paymentStatusLabel: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  OVERDUE: "Em atraso",
  REFUNDED: "Reembolsado",
  CANCELED: "Cancelado"
};

const billingCycleLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  YEARLY: "Anual"
};

const locationTypeLabel: Record<string, string> = {
  ACADEMY: "Academia",
  UNIT: "Box",
  CLUB: "Studio",
  BOX: "Box",
  STUDIO: "Studio"
};

const ticketStatusLabel: Record<string, string> = {
  OPEN: "Aguardando resposta",
  IN_PROGRESS: "Em andamento",
  WAITING_STUDENT: "Aguardando sua resposta",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado"
};

const ticketCategoryLabel: Record<string, string> = {
  GENERAL: "Geral",
  WORKOUT: "Treino",
  PAYMENT: "Pagamento",
  TECHNICAL: "Técnico"
};

export function labelMembershipStatus(status?: string | null) {
  if (!status) return "Pendente";
  return membershipStatusLabel[status] ?? status;
}

export function labelPaymentStatus(status: string) {
  return paymentStatusLabel[status] ?? status;
}

export function labelBillingCycle(cycle?: string | null) {
  if (!cycle) return "Mensal";
  return billingCycleLabel[cycle] ?? cycle;
}

export function labelLocationType(type?: string | null) {
  if (!type) return locationTypeLabel.ACADEMY;
  return locationTypeLabel[type] ?? type;
}

export function studentLocationLabel(profile?: { city?: string | null; state?: string | null } | null) {
  return [profile?.city, profile?.state].filter(Boolean).join(" - ") || "Sem município/UF";
}

export function labelTicketStatus(status: string) {
  return ticketStatusLabel[status] ?? status;
}

export function labelTicketCategory(category?: string | null) {
  if (!category) return ticketCategoryLabel.GENERAL;
  return ticketCategoryLabel[category] ?? category;
}

export function genderLabel(gender?: string | null) {
  if (gender === "MALE") return "Masculino";
  if (gender === "FEMALE") return "Feminino";
  return "Sexo não informado";
}

export const BRAZILIAN_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" }
] as const;
