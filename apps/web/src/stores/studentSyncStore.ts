import { create } from "zustand";
import {
  buildSyncNotificationMessage,
  EVENT_FLOW_META,
  EVENT_PANEL_TARGETS,
  publish,
  subscribe,
  type PanelDestination,
  type SystemEvent,
  type SystemEventPayloadMap,
  type SystemEventType
} from "../lib/event-bus";

export type StudentPanelSection =
  | "home"
  | "payments"
  | "training"
  | "products"
  | "menu"
  | "subscription"
  | "locked"
  | "player"
  | "status"
  | "assessments"
  | "events"
  | "support"
  | "ai"
  | "history"
  | "profile"
  | "settings"
  | "membership"
  | "purchases"
  | "favorites"
  | "ratings"
  | "locations";

export type SyncNotification = {
  id: string;
  eventType: SystemEventType;
  title: string;
  message: string;
  publishedAt: string;
  targets: PanelDestination[];
  origin: string;
  read: boolean;
};

type StudentSyncState = {
  lastEvent: SystemEvent | null;
  pendingRefresh: SystemEventType[];
  navigateTo: StudentPanelSection | null;
  syncNotifications: SyncNotification[];
  highlightedSections: PanelDestination[];
  /** Dispara no Event Bus; consumidores sincronizam e notificam o painel. */
  emit: <T extends SystemEventType>(
    type: T,
    payload: SystemEventPayloadMap[T],
    options?: { navigateTo?: StudentPanelSection | null }
  ) => void;
  consumeNavigate: () => StudentPanelSection | null;
  consumeRefresh: () => SystemEventType[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearSectionHighlight: (section: PanelDestination) => void;
  clearLastEvent: () => void;
};

function createSyncNotification(event: SystemEvent): SyncNotification {
  const meta = EVENT_FLOW_META[event.type];
  return {
    id: `sync-${event.type}-${event.at}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: event.type,
    title: meta.notificationTitle,
    message: buildSyncNotificationMessage(event.type, event.payload),
    publishedAt: event.at,
    targets: EVENT_PANEL_TARGETS[event.type],
    origin: meta.origin,
    read: false
  };
}

/**
 * Consumidor Zustand do Event Bus.
 *
 * | Origem              | Evento               | Destino Painel                 |
 * |---------------------|----------------------|--------------------------------|
 * | Compras / Produtos  | COMPRA_CONCLUIDA     | Pagamentos / Matrículas        |
 * | QR Code             | CHECKIN_REALIZADO    | Frequência / Localidades       |
 * | Meus Cartões        | CARTAO_ATUALIZADO    | Pagamentos                     |
 * | Contato             | MENSAGEM_ENVIADA     | Atendimento                    |
 * | Avaliar             | AVALIACAO_SUBMETIDA  | Avaliações / Treino            |
 * | Estúdio de Treinos  | PROGRAMA_PUBLICADO   | Treino                         |
 * | Painel Admin        | CMS_ATUALIZADO       | Treino / Unidades / Conta      |
 */
export const useStudentSyncStore = create<StudentSyncState>((set, get) => ({
  lastEvent: null,
  pendingRefresh: [],
  navigateTo: null,
  syncNotifications: [],
  highlightedSections: [],

  emit(type, payload, options) {
    publish(type, payload);
    if (options?.navigateTo) {
      set({ navigateTo: options.navigateTo });
    }
  },

  consumeNavigate() {
    const next = get().navigateTo;
    if (next) set({ navigateTo: null });
    return next;
  },

  consumeRefresh() {
    const pending = get().pendingRefresh;
    if (pending.length) set({ pendingRefresh: [] });
    return pending;
  },

  markNotificationRead(id) {
    set((state) => ({
      syncNotifications: state.syncNotifications.map((item) =>
        item.id === id ? { ...item, read: true } : item
      )
    }));
  },

  markAllNotificationsRead() {
    set((state) => ({
      syncNotifications: state.syncNotifications.map((item) => ({ ...item, read: true }))
    }));
  },

  clearSectionHighlight(section) {
    set((state) => ({
      highlightedSections: state.highlightedSections.filter((item) => item !== section)
    }));
  },

  clearLastEvent() {
    set({ lastEvent: null });
  }
}));

let busWired = false;

export function wireStudentSyncBus() {
  if (busWired) return;
  busWired = true;

  subscribe("*", (event) => {
    const targets = EVENT_PANEL_TARGETS[event.type];
    const silent = event.type === "CMS_ATUALIZADO";
    const notification = createSyncNotification(event);

    useStudentSyncStore.setState((state) => ({
      lastEvent: event,
      pendingRefresh: [...new Set([...state.pendingRefresh, event.type])],
      syncNotifications: silent
        ? state.syncNotifications
        : [notification, ...state.syncNotifications].slice(0, 40),
      highlightedSections: silent
        ? state.highlightedSections
        : [...new Set([...state.highlightedSections, ...targets])]
    }));
  });
}
