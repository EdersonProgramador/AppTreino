/** Sandbox confirm is for local/dev only — never show in production builds. */
export function isSandboxCheckoutEnabled() {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
  if (env.PROD === true || env.MODE === "production") return false;
  const flag = String(env.VITE_ENABLE_SANDBOX_CONFIRM ?? "").toLowerCase();
  if (flag === "0" || flag === "false") return false;
  // Dev builds: allow unless explicitly disabled; also honor explicit true.
  return env.DEV === true || flag === "1" || flag === "true";
}
