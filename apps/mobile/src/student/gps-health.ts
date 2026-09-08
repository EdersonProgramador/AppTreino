export type GpsHealthStatus = "idle" | "active" | "stale" | "background";

export const GPS_STALE_MS = 15_000;
export const GPS_HEALTH_POLL_MS = 3_000;
export const GPS_BACKGROUND_WARN_KEY = "apptreino.gpsNativeWarnDismissed";

/** Native: background still records when TaskManager + permissions are OK. */
export function computeMobileGpsHealth(
  running: boolean,
  lastFixAt: number | null,
  appActive: boolean,
  now = Date.now()
): GpsHealthStatus {
  if (!running) return "idle";
  if (!lastFixAt || now - lastFixAt > GPS_STALE_MS) return "stale";
  if (!appActive) return "background";
  return "active";
}

export function gpsHealthLabel(status: GpsHealthStatus): string {
  switch (status) {
    case "active":
      return "GPS ativo";
    case "stale":
      return "GPS pausado";
    case "background":
      return "GPS em background";
    default:
      return "";
  }
}

export function gpsHealthHint(status: GpsHealthStatus): string | null {
  switch (status) {
    case "stale":
      return "Sem sinal GPS há mais de 15 segundos. Verifique permissões de localização (sempre/em segundo plano).";
    case "background":
      return "Gravando em segundo plano. Toque na notificação ATLLY · GPS ativo para voltar ao app.";
    default:
      return null;
  }
}
