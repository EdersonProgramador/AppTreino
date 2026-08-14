/**
 * Barramento Pub/Sub (Event-Driven) entre módulos do sistema e o Painel do Aluno.
 *
 * [ Módulos do Sistema ] ──( Dispara Evento )──> [ Event Bus ]
 *                                                      │
 *                                             ( Processa e Roteia )
 *                                                      │
 *                                                      ▼
 * [ Painel do Aluno ] <──( Atualiza Estado + Notifica )── [ Consumidores ]
 */

export type SystemEventType =
  | "COMPRA_CONCLUIDA"
  | "CHECKIN_REALIZADO"
  | "CARTAO_ATUALIZADO"
  | "MENSAGEM_ENVIADA"
  | "AVALIACAO_SUBMETIDA"
  | "PROGRAMA_PUBLICADO"
  | "PRODUTO_PUBLICADO"
  | "CMS_ATUALIZADO";

export type PanelDestination =
  | "payments"
  | "membership"
  | "status"
  | "locations"
  | "support"
  | "ratings"
  | "training"
  | "assessments"
  | "products"
  | "purchases";

/** Destinos no Painel do Aluno mapeados por evento de origem. */
export const EVENT_PANEL_TARGETS: Record<SystemEventType, PanelDestination[]> = {
  COMPRA_CONCLUIDA: ["products", "purchases"],
  CHECKIN_REALIZADO: ["status", "locations"],
  CARTAO_ATUALIZADO: ["payments"],
  MENSAGEM_ENVIADA: ["support"],
  AVALIACAO_SUBMETIDA: ["assessments", "training", "ratings"],
  PROGRAMA_PUBLICADO: ["training"],
  PRODUTO_PUBLICADO: ["products"],
  CMS_ATUALIZADO: ["training", "locations", "membership", "payments"]
};

export const PANEL_SECTION_LABEL: Record<PanelDestination, string> = {
  payments: "Pagamentos",
  membership: "Matrículas",
  status: "Frequência",
  locations: "Unidades",
  support: "Atendimento",
  ratings: "Favoritos e avaliações",
  training: "Treino",
  assessments: "Avaliação física",
  products: "Vitrine",
  purchases: "Minhas compras"
};

export const EVENT_FLOW_META: Record<
  SystemEventType,
  {
    origin: string;
    syncAction: string;
    notificationTitle: string;
  }
> = {
  COMPRA_CONCLUIDA: {
    origin: "Compras / Produtos",
    syncAction: "Registra o pedido no histórico da vitrine e atualiza o status comercial.",
    notificationTitle: "Pedido registrado"
  },
  CHECKIN_REALIZADO: {
    origin: "QR Code",
    syncAction: "Valida o acesso na unidade física especificada e contabiliza a presença do aluno.",
    notificationTitle: "Check-in sincronizado"
  },
  CARTAO_ATUALIZADO: {
    origin: "Meus Cartões",
    syncAction: "Atualiza a forma de cobrança para mensalidades e renovações automáticas.",
    notificationTitle: "Cartão sincronizado"
  },
  MENSAGEM_ENVIADA: {
    origin: "Contato",
    syncAction: "Cria ou atualiza um chamado no histórico de suporte do aluno.",
    notificationTitle: "Mensagem sincronizada"
  },
  AVALIACAO_SUBMETIDA: {
    origin: "Favoritos e avaliações",
    syncAction: "Envia feedback de instrutores, treinos ou infraestrutura e atualiza favoritos no painel do aluno.",
    notificationTitle: "Avaliação sincronizada"
  },
  PROGRAMA_PUBLICADO: {
    origin: "Estúdio de Treinos",
    syncAction: "Libera o programa publicado no catálogo de treinos do aluno elegível.",
    notificationTitle: "Novo treino publicado"
  },
  PRODUTO_PUBLICADO: {
    origin: "Catálogo / Vitrine",
    syncAction: "Disponibiliza o produto na vitrine online do aluno.",
    notificationTitle: "Novo produto na vitrine"
  },
  CMS_ATUALIZADO: {
    origin: "Painel Admin",
    syncAction: "Recarrega no aluno as informações alteradas no admin.",
    notificationTitle: "Catálogo atualizado"
  }
};

export type SystemEventPayloadMap = {
  COMPRA_CONCLUIDA: {
    productId: string;
    purchaseId?: string;
    productName?: string;
    source: "compras" | "produtos";
  };
  CHECKIN_REALIZADO: {
    locationId?: string;
    locationName?: string;
    checkInUrl?: string;
    source: "qr_code";
  };
  CARTAO_ATUALIZADO: {
    cardId?: string;
    action: "added" | "removed" | "updated";
    source: "meus_cartoes";
  };
  MENSAGEM_ENVIADA: {
    ticketId: string;
    action: "created" | "replied" | "closed";
    subject?: string;
    source: "contato";
  };
  AVALIACAO_SUBMETIDA: {
    programId: string;
    assignmentId: string;
    score: number;
    programTitle?: string;
    source: "avaliar";
  };
  PROGRAMA_PUBLICADO: {
    programId: string;
    programTitle: string;
    audienceMode: "ALL_ACTIVE" | "SELECTED";
    eligibleStudentCount?: number;
    source: "cms_publish";
  };
  PRODUTO_PUBLICADO: {
    productId: string;
    productName: string;
    kind?: "PHYSICAL" | "DIGITAL";
    source: "admin_catalog";
  };
  CMS_ATUALIZADO: {
    scopes: Array<"training" | "locations" | "announcements" | "account">;
    resources: string[];
    message?: string;
    source: "admin_save";
  };
};

export type SystemEvent<T extends SystemEventType = SystemEventType> = {
  type: T;
  payload: SystemEventPayloadMap[T];
  at: string;
};

export function buildSyncNotificationMessage<T extends SystemEventType>(
  type: T,
  payload: SystemEventPayloadMap[T]
): string {
  const targets = EVENT_PANEL_TARGETS[type].map((key) => PANEL_SECTION_LABEL[key]).join(" / ");
  const meta = EVENT_FLOW_META[type];

  switch (type) {
    case "COMPRA_CONCLUIDA": {
      const data = payload as SystemEventPayloadMap["COMPRA_CONCLUIDA"];
      const name = data.productName ? ` "${data.productName}"` : "";
      return `Compra${name} registrada. ${meta.syncAction} Destinos: ${targets}.`;
    }
    case "CHECKIN_REALIZADO": {
      const data = payload as SystemEventPayloadMap["CHECKIN_REALIZADO"];
      const unit = data.locationName ? ` em ${data.locationName}` : "";
      return `Presença confirmada${unit}. ${meta.syncAction} Destinos: ${targets}.`;
    }
    case "CARTAO_ATUALIZADO": {
      const data = payload as SystemEventPayloadMap["CARTAO_ATUALIZADO"];
      const actionLabel =
        data.action === "added" ? "adicionado" : data.action === "removed" ? "removido" : "atualizado";
      return `Cartão ${actionLabel}. ${meta.syncAction} Destino: ${targets}.`;
    }
    case "MENSAGEM_ENVIADA": {
      const data = payload as SystemEventPayloadMap["MENSAGEM_ENVIADA"];
      const subject = data.subject ? ` (${data.subject})` : "";
      return `Contato${subject} enviado ao suporte. ${meta.syncAction} Destino: ${targets}.`;
    }
    case "AVALIACAO_SUBMETIDA": {
      const data = payload as SystemEventPayloadMap["AVALIACAO_SUBMETIDA"];
      const program = data.programTitle ? ` "${data.programTitle}"` : "";
      return `Feedback${program} (${data.score}★) enviado. ${meta.syncAction} Destinos: ${targets}.`;
    }
    case "PROGRAMA_PUBLICADO": {
      const data = payload as SystemEventPayloadMap["PROGRAMA_PUBLICADO"];
      const count =
        typeof data.eligibleStudentCount === "number" ? ` para ${data.eligibleStudentCount} aluno(s)` : "";
      return `Treino "${data.programTitle}" publicado${count}. ${meta.syncAction} Destino: ${targets}.`;
    }
    case "PRODUTO_PUBLICADO": {
      const data = payload as SystemEventPayloadMap["PRODUTO_PUBLICADO"];
      const kindLabel = data.kind === "DIGITAL" ? "digital" : data.kind === "PHYSICAL" ? "físico" : "";
      const kindSuffix = kindLabel ? ` (${kindLabel})` : "";
      return `"${data.productName}"${kindSuffix} disponível na vitrine. ${meta.syncAction} Destino: ${targets}.`;
    }
    case "CMS_ATUALIZADO": {
      const data = payload as SystemEventPayloadMap["CMS_ATUALIZADO"];
      return data.message ?? `Alteração do admin sincronizada. ${meta.syncAction} Destinos: ${targets}.`;
    }
    default:
      return meta.syncAction;
  }
}

type Handler<T extends SystemEventType> = (event: SystemEvent<T>) => void;
type AnyHandler = (event: SystemEvent) => void;

const listeners = new Map<SystemEventType | "*", Set<AnyHandler>>();

function getBucket(type: SystemEventType | "*") {
  let bucket = listeners.get(type);
  if (!bucket) {
    bucket = new Set();
    listeners.set(type, bucket);
  }
  return bucket;
}

export function subscribe<T extends SystemEventType>(type: T, handler: Handler<T>): () => void;
export function subscribe(type: "*", handler: AnyHandler): () => void;
export function subscribe(type: SystemEventType | "*", handler: AnyHandler): () => void {
  const bucket = getBucket(type);
  bucket.add(handler);
  return () => {
    bucket.delete(handler);
  };
}

export function publish<T extends SystemEventType>(
  type: T,
  payload: SystemEventPayloadMap[T]
): SystemEvent<T> {
  const event: SystemEvent<T> = {
    type,
    payload,
    at: new Date().toISOString()
  };

  getBucket(type).forEach((handler) => {
    try {
      handler(event as SystemEvent);
    } catch {
      // Isola falhas de um consumidor para não derrubar o barramento.
    }
  });

  getBucket("*").forEach((handler) => {
    try {
      handler(event as SystemEvent);
    } catch {
      // Isola falhas de um consumidor para não derrubar o barramento.
    }
  });

  // Propaga entre abas (admin → aluno no mesmo navegador).
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("app-treino-events");
      channel.postMessage(event);
      channel.close();
    }
  } catch {
    // Ambiente sem BroadcastChannel.
  }

  return event;
}

let broadcastWired = false;

/** Escuta eventos publicados em outras abas do mesmo origem. */
export function wireEventBusBroadcast() {
  if (broadcastWired || typeof BroadcastChannel === "undefined") return;
  broadcastWired = true;

  const channel = new BroadcastChannel("app-treino-events");
  channel.addEventListener("message", (messageEvent) => {
    const event = messageEvent.data as SystemEvent | null;
    if (!event?.type || !event.payload) return;

    getBucket(event.type).forEach((handler) => {
      try {
        handler(event);
      } catch {
        // Isola falhas.
      }
    });
    getBucket("*").forEach((handler) => {
      try {
        handler(event);
      } catch {
        // Isola falhas.
      }
    });
  });
}

export function clearEventBus() {
  listeners.clear();
}
