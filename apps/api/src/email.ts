import { env } from "./env.js";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatBrl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDatePt(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

export function getWebAppOrigin() {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = origins.find(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );

  return production ?? origins[0] ?? "http://localhost:5173";
}

export function buildAppUrl(path: string) {
  const origin = getWebAppOrigin();
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildPasswordResetUrl(token: string) {
  return buildAppUrl(`/login?reset=${encodeURIComponent(token)}`);
}

export function buildActivatePaymentUrl() {
  return buildAppUrl("/ativar?step=payment");
}

export function buildStudentOrdersUrl() {
  return buildAppUrl("/aluno?section=orders");
}

export function buildStudentSupportUrl() {
  return buildAppUrl("/aluno?section=support");
}

export function buildStudentHomeUrl() {
  return buildAppUrl("/aluno");
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

type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function wrapEmailHtml(title: string, bodyHtml: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700;">ATLLY Command</p>
      <h1 style="margin: 0 0 16px; font-size: 20px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin-top: 24px; color: #555;">Equipe ATLLY</p>
    </div>
  `;
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
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
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text
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
    console.info(`[dev] Email to ${input.to}: ${input.subject}`);
    return;
  }

  throw new Error("Serviço de e-mail não configurado.");
}

export function queueEmail(task: () => Promise<void>, context?: string) {
  void task().catch((error) => {
    console.error(`[email] Falha${context ? ` (${context})` : ""}:`, error);
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, userName: string) {
  const safeName = escapeHtml(userName);
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
  const html = wrapEmailHtml(
    "Redefinição de senha",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Recebemos uma solicitação para redefinir sua senha no ATLLY Command.</p>
      <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
      <p>O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.</p>
    `
  );

  await sendTransactionalEmail({ to, subject, text, html });
}

export async function sendWelcomeEmail(to: string, userName: string) {
  const safeName = escapeHtml(userName);
  const homeUrl = buildStudentHomeUrl();
  const subject = "Bem-vindo(a) ao ATLLY Command";
  const text = [
    `Olá, ${userName}.`,
    "",
    "Sua conta foi criada com sucesso. Acesse o app para completar seu perfil e começar seus treinos:",
    homeUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Bem-vindo(a)!",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Sua conta foi criada com sucesso.</p>
      <p><a href="${homeUrl}">Acessar o ATLLY Command</a></p>
    `
  );

  await sendTransactionalEmail({ to, subject, text, html });
}

export async function sendSubscriptionActiveEmail(
  to: string,
  userName: string,
  planName: string,
  endsAt?: Date | null
) {
  const safeName = escapeHtml(userName);
  const safePlan = escapeHtml(planName);
  const homeUrl = buildStudentHomeUrl();
  const validityLine = endsAt ? ` Sua assinatura está válida até ${formatDatePt(endsAt)}.` : "";
  const subject = "Assinatura ativa — ATLLY Command";
  const text = [
    `Olá, ${userName}.`,
    "",
    `Confirmamos o pagamento do plano ${planName}.${validityLine}`,
    "",
    "Você já pode usar todos os recursos do seu plano:",
    homeUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Assinatura ativa",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Confirmamos o pagamento do plano <strong>${safePlan}</strong>.${validityLine ? `<br />${escapeHtml(validityLine.trim())}` : ""}</p>
      <p><a href="${homeUrl}">Acessar o ATLLY Command</a></p>
    `
  );

  await sendTransactionalEmail({ to, subject, text, html });
}

export async function sendPaymentPendingEmail(input: {
  to: string;
  userName: string;
  planName: string;
  amountInCents: number;
  dueDate: Date;
  paymentUrl?: string | null;
}) {
  const safeName = escapeHtml(input.userName);
  const safePlan = escapeHtml(input.planName);
  const amount = formatBrl(input.amountInCents);
  const dueDate = formatDatePt(input.dueDate);
  const payUrl = input.paymentUrl?.trim() || buildActivatePaymentUrl();
  const subject = "Pagamento pendente — ATLLY Command";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Seu pagamento Pix do plano ${input.planName} (${amount}) ainda está pendente.`,
    `Vencimento: ${dueDate}.`,
    "",
    "Finalize o pagamento para ativar sua assinatura:",
    payUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Pagamento pendente",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Seu pagamento Pix do plano <strong>${safePlan}</strong> (<strong>${escapeHtml(amount)}</strong>) ainda está pendente.</p>
      <p>Vencimento: ${escapeHtml(dueDate)}.</p>
      <p><a href="${payUrl}">Finalizar pagamento</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendPaymentOverdueEmail(input: {
  to: string;
  userName: string;
  planName: string;
  amountInCents: number;
  paymentUrl?: string | null;
}) {
  const safeName = escapeHtml(input.userName);
  const safePlan = escapeHtml(input.planName);
  const amount = formatBrl(input.amountInCents);
  const payUrl = input.paymentUrl?.trim() || buildActivatePaymentUrl();
  const subject = "Pagamento em atraso — ATLLY Command";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Não identificamos o pagamento do plano ${input.planName} (${amount}).`,
    "Gere um novo Pix ou conclua o pagamento para manter sua assinatura:",
    payUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Pagamento em atraso",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Não identificamos o pagamento do plano <strong>${safePlan}</strong> (<strong>${escapeHtml(amount)}</strong>).</p>
      <p><a href="${payUrl}">Concluir pagamento</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendOrderPlacedEmail(input: {
  to: string;
  userName: string;
  orderId: string;
  amountInCents: number;
  itemSummary: string;
  paymentUrl?: string | null;
}) {
  const safeName = escapeHtml(input.userName);
  const amount = formatBrl(input.amountInCents);
  const ordersUrl = buildStudentOrdersUrl();
  const payUrl = input.paymentUrl?.trim() || ordersUrl;
  const subject = "Pedido recebido — ATLLY Vitrine";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Recebemos seu pedido (${input.itemSummary}) no valor de ${amount}.`,
    "Aguardamos a confirmação do pagamento.",
    payUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Pedido recebido",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Recebemos seu pedido <strong>${escapeHtml(input.itemSummary)}</strong> no valor de <strong>${escapeHtml(amount)}</strong>.</p>
      <p>Aguardamos a confirmação do pagamento.</p>
      <p><a href="${payUrl}">Ver pedido / pagar</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendOrderConfirmedEmail(input: {
  to: string;
  userName: string;
  orderId: string;
  amountInCents: number;
  itemSummary: string;
}) {
  const safeName = escapeHtml(input.userName);
  const amount = formatBrl(input.amountInCents);
  const ordersUrl = buildStudentOrdersUrl();
  const subject = "Pagamento confirmado — ATLLY Vitrine";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Confirmamos o pagamento do pedido ${input.itemSummary} (${amount}).`,
    "Em breve você receberá novidades sobre preparo ou envio.",
    ordersUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Pagamento confirmado",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Confirmamos o pagamento do pedido <strong>${escapeHtml(input.itemSummary)}</strong> (<strong>${escapeHtml(amount)}</strong>).</p>
      <p>Em breve você receberá novidades sobre preparo ou envio.</p>
      <p><a href="${ordersUrl}">Acompanhar pedido</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendOrderShippingEmail(input: {
  to: string;
  userName: string;
  orderId: string;
  itemSummary: string;
  status: "READY" | "DELIVERED";
  shippingAddress?: string | null;
}) {
  const safeName = escapeHtml(input.userName);
  const ordersUrl = buildStudentOrdersUrl();
  const isDelivered = input.status === "DELIVERED";
  const title = isDelivered ? "Pedido entregue" : "Pedido pronto para envio/retirada";
  const subject = `${title} — ATLLY Vitrine`;
  const statusLine = isDelivered
    ? "Seu pedido foi marcado como entregue."
    : "Seu pedido está pronto para envio ou retirada.";
  const addressLine = input.shippingAddress?.trim()
    ? `\nEndereço: ${input.shippingAddress.trim()}`
    : "";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `${statusLine} Pedido: ${input.itemSummary}.${addressLine}`,
    ordersUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    title,
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>${escapeHtml(statusLine)} Pedido: <strong>${escapeHtml(input.itemSummary)}</strong>.</p>
      ${input.shippingAddress?.trim() ? `<p>Endereço: ${escapeHtml(input.shippingAddress.trim())}</p>` : ""}
      <p><a href="${ordersUrl}">Ver pedido</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendSupportReplyEmail(input: {
  to: string;
  userName: string;
  ticketSubject: string;
  messagePreview: string;
}) {
  const safeName = escapeHtml(input.userName);
  const safeSubject = escapeHtml(input.ticketSubject);
  const preview = escapeHtml(input.messagePreview.slice(0, 280));
  const supportUrl = buildStudentSupportUrl();
  const subject = "Nova resposta do suporte — ATLLY";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Há uma nova resposta no atendimento "${input.ticketSubject}":`,
    input.messagePreview.slice(0, 280),
    "",
    "Acesse o app para continuar a conversa:",
    supportUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Nova resposta do suporte",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Há uma nova resposta no atendimento <strong>${safeSubject}</strong>:</p>
      <blockquote style="margin: 16px 0; padding: 12px; border-left: 3px solid #ccc; color: #333;">${preview}</blockquote>
      <p><a href="${supportUrl}">Abrir atendimento</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendRefundOrCancellationEmail(input: {
  to: string;
  userName: string;
  subjectLine: string;
  detail: string;
}) {
  const safeName = escapeHtml(input.userName);
  const safeDetail = escapeHtml(input.detail);
  const subject = `${input.subjectLine} — ATLLY`;
  const text = [`Olá, ${input.userName}.`, "", input.detail, "", "Equipe ATLLY"].join("\n");
  const html = wrapEmailHtml(
    input.subjectLine,
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>${safeDetail}</p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}

export async function sendWeeklySummaryEmail(input: {
  to: string;
  userName: string;
  workoutsCompleted: number;
  attendanceDays: number;
}) {
  const safeName = escapeHtml(input.userName);
  const homeUrl = buildStudentHomeUrl();
  const subject = "Seu resumo semanal — ATLLY Command";
  const text = [
    `Olá, ${input.userName}.`,
    "",
    `Esta semana você registrou ${input.workoutsCompleted} treino(s) concluído(s) e ${input.attendanceDays} dia(s) de presença no app.`,
    "Continue evoluindo — abra o app para ver seu próximo treino:",
    homeUrl,
    "",
    "Equipe ATLLY"
  ].join("\n");
  const html = wrapEmailHtml(
    "Resumo semanal",
    `
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Esta semana você registrou <strong>${input.workoutsCompleted}</strong> treino(s) concluído(s) e <strong>${input.attendanceDays}</strong> dia(s) de presença no app.</p>
      <p><a href="${homeUrl}">Ver meus treinos</a></p>
    `
  );

  await sendTransactionalEmail({ to: input.to, subject, text, html });
}
