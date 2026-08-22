import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type TestAccount = { user: string; pass: string };

let etherealAccount: TestAccount | null = null;
let cachedTransport: Transporter | null = null;

function appUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:3000").split(",")[0];
}

export function isLocalMail() {
  return !process.env.SMTP_HOST;
}

async function mailTransport() {
  if (cachedTransport) {
    return cachedTransport;
  }

  if (process.env.SMTP_HOST) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
    return cachedTransport;
  }

  etherealAccount = await nodemailer.createTestAccount();
  cachedTransport = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: etherealAccount.user,
      pass: etherealAccount.pass
    }
  });
  console.log(`[email] caixa local Ethereal: ${etherealAccount.user}`);
  return cachedTransport;
}

export async function sendAppEmail(to: string, subject: string, text: string, html?: string) {
  try {
    const transporter = await mailTransport();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "Rede Social <noreply@localhost>",
      to,
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, "<br/>")}</p>`
    });

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      console.log(`[email] preview: ${preview}`);
    } else {
      console.log(`[email] enviado: ${subject} -> ${to}`);
    }

    return typeof preview === "string" ? preview : undefined;
  } catch (error) {
    console.log(`[email] falha ao enviar; link no texto.\n${subject} -> ${to}\n${text}`);
    console.log(error);
    return undefined;
  }
}

export async function sendVerifyEmail(email: string, token: string) {
  const link = `${appUrl()}/auth/verify?token=${token}`;
  const previewUrl = await sendAppEmail(
    email,
    "Confirme seu e-mail",
    `Olá,\n\nConfirme sua conta neste link (válido por 24h):\n${link}\n`,
    `<p>Olá,</p><p>Confirme sua conta neste link (válido por 24h):</p><p><a href="${link}">${link}</a></p>`
  );
  return { link, previewUrl };
}

export async function sendResetEmail(email: string, token: string) {
  const link = `${appUrl()}/auth/reset?token=${token}`;
  const previewUrl = await sendAppEmail(
    email,
    "Redefinir senha",
    `Olá,\n\nRedefina sua senha neste link (válido por 1h):\n${link}\n`,
    `<p>Olá,</p><p>Redefina sua senha neste link (válido por 1h):</p><p><a href="${link}">${link}</a></p>`
  );
  return { link, previewUrl };
}
