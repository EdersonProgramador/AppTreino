import { signal } from "@preact/signals-react";

/**
 * Sinais leves de UI (@preact/signals-react).
 * Estado de domínio/app continua no Zustand (onboarding, sync de eventos).
 */
export const studentUiSignals = {
  qrPanelOpen: signal(false),
  notificationsOpen: signal(false)
};
