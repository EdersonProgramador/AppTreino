export async function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  try {
    // Optional dependency — install @sentry/node only when you want reporting.
    // @ts-ignore
    const Sentry = require("@sentry/node") as { init: (opts: { dsn: string; tracesSampleRate: number }) => void };
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  } catch {
    console.log("[sentry] @sentry/node não instalado; DSN ignorado.");
  }
}
