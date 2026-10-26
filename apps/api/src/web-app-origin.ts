import { env } from "./env.js";

/** Origem do front para links em e-mail / convite (prefere Vite local em dev). */
export function webAppOrigin() {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (env.NODE_ENV !== "production") {
    const viteDev = origins.find((origin) => /localhost:5174|127\.0\.0\.1:5174/.test(origin));
    if (viteDev) return viteDev;
    const anyLocal = origins.find((origin) => /localhost|127\.0\.0\.1/.test(origin));
    if (anyLocal) return anyLocal;
  }

  const production = origins.find(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );
  return production ?? origins[0] ?? "https://www.atlly.com.br";
}
