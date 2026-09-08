export type GpsHealthStatus = "idle" | "active" | "stale" | "background";

export const GPS_STALE_MS = 15_000;
export const GPS_HEALTH_POLL_MS = 3_000;
export const GPS_BACKGROUND_WARN_KEY = "apptreino.gpsBackgroundWarnDismissed";

export function computeGpsHealth(
  running: boolean,
  lastFixAt: number | null,
  hidden: boolean,
  now = Date.now()
): GpsHealthStatus {
  if (!running) return "idle";
  if (hidden) return "background";
  if (!lastFixAt || now - lastFixAt > GPS_STALE_MS) return "stale";
  return "active";
}

export function gpsHealthLabel(status: GpsHealthStatus): string {
  switch (status) {
    case "active":
      return "GPS ativo";
    case "stale":
      return "GPS pausado";
    case "background":
      return "GPS limitado";
    default:
      return "";
  }
}

export function gpsHealthHint(status: GpsHealthStatus): string | null {
  switch (status) {
    case "background":
      return "Com a tela apagada ou o site em segundo plano, o GPS pode parar. Mantenha a tela ligada e o navegador aberto.";
    case "stale":
      return "Sem sinal GPS há mais de 15 segundos. Verifique permissões e mantenha o site em primeiro plano.";
    default:
      return null;
  }
}
