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
  return `${origin}/?reset=${encodeURIComponent(token)}`;
}

export function isDeliverableEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return !email.endsWith("@app-treino.local");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, userName: string) {
  const subject = "Redefinição de senha - App Treino";
  const text = [
    `Olá, ${userName}.`,
    "",
    "Recebemos uma solicitação para redefinir sua senha no App Treino.",
    "Se foi você, acesse o link abaixo para criar uma nova senha:",
    resetUrl,
    "",
    "O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.",
    "",
    "Equipe App Treino"
  ].join("\n");
  const html = `
    <p>Olá, <strong>${userName}</strong>.</p>
    <p>Recebemos uma solicitação para redefinir sua senha no App Treino.</p>
    <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
    <p>O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.</p>
    <p>Equipe App Treino</p>
  `;

  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
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
