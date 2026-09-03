import { env } from "./env.js";

function getWebAppOrigin() {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = origins.find(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );

  return production ?? origins[0] ?? "http://localhost:5173";
}

export function buildPasswordResetUrl(token: string) {
  const origin = getWebAppOrigin();
  return `${origin}/login?reset=${encodeURIComponent(token)}`;
}

export function isDeliverableEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return !email.endsWith("@app-treino.local");
}

export function normalizeEmailFrom(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const wrappedOnly = trimmed.match(/^<([^>]+)>$/);
  if (wrappedOnly) {
    return `ATLLY <${wrappedOnly[1]}>`;
  }

  if (!trimmed.includes("<") && trimmed.includes("@")) {
    return `ATLLY <${trimmed}>`;
  }

  return trimmed;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, userName: string) {
  const subject = "Redefinição de senha — ATLLY Command";
  const text = [
    `Olá, ${userName}.`,
    "",
    "Recebemos uma solicitação para redefinir sua senha no ATLLY Command.",
    "Se foi você, acesse o link abaixo para criar uma nova senha:",
    resetUrl,
    "",
    "O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.",
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = `
    <p>Olá, <strong>${userName}</strong>.</p>
    <p>Recebemos uma solicitação para redefinir sua senha no <strong>ATLLY Command</strong>.</p>
    <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
    <p>O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.</p>
    <p>Equipe ATLLY</p>
  `;

  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const from = normalizeEmailFrom(env.EMAIL_FROM);
    if (!from) {
      throw new Error("EMAIL_FROM inválido.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao enviar e-mail: ${response.status} ${body}`);
    }

    return;
  }

  if (env.NODE_ENV === "development") {
    console.info(`[dev] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  throw new Error("Serviço de e-mail não configurado.");
}
