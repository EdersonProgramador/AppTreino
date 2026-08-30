import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { initialPlans } from "@app-treino/shared";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { buildPublicUploadUrl } from "../upload-security.js";
import { DEFAULT_SYSTEM_SETTINGS, ensureDefaultSystemSettings } from "./commerce.utils.js";

function getWebAppOrigin() {
  const origins = env.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const production = origins.find(
    (origin) => !origin.includes("localhost") && !origin.includes("127.0.0.1")
  );
  return production ?? origins[0] ?? "http://localhost:5173";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absolutePublicMediaUrl(path?: string | null) {
  if (!path) return null;
  const raw = path.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return buildPublicUploadUrl(cleaned);
}

type ParsedMediaItem = { url: string; type: "IMAGE" | "VIDEO"; coverUrl: string | null };

function parseMediaItems(raw: unknown): ParsedMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { url?: unknown; type?: unknown; coverUrl?: unknown };
      if (typeof row.url !== "string" || !row.url) return null;
      const coverUrl = typeof row.coverUrl === "string" && row.coverUrl.trim() ? row.coverUrl.trim() : null;
      return { url: row.url, type: row.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const), coverUrl };
    })
    .filter((item): item is ParsedMediaItem => item !== null)
    .slice(0, 10);
}

function isLikelyImageUrl(url: string) {
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
}

function pickShareImage(
  items: Array<{ url: string; type: "IMAGE" | "VIDEO"; coverUrl?: string | null }>,
  avatarUrl: string | null,
  webFallback: string
) {
  const imageItem = items.find((item) => item.type === "IMAGE");
  if (imageItem?.url && isLikelyImageUrl(imageItem.url)) {
    return imageItem.url;
  }

  for (const item of items) {
    if (item.coverUrl && isLikelyImageUrl(item.coverUrl)) {
      return item.coverUrl;
    }
  }

  if (avatarUrl && isLikelyImageUrl(avatarUrl)) {
    return avatarUrl;
  }

  return webFallback;
}

async function loadPublicPost(id: string) {
  const post = await prisma.socialPost.findFirst({
    where: { id, hidden: false },
    include: {
      author: { select: { id: true, name: true, profile: { select: { avatarUrl: true, isPrivate: true } } } },
      _count: { select: { likes: true, comments: true } }
    }
  });
  if (!post) return null;
  if (post.author.profile?.isPrivate) return null;

  const mediaItems = parseMediaItems(post.mediaItems);
  const items: ParsedMediaItem[] =
    mediaItems.length > 0
      ? mediaItems
      : post.mediaUrl
        ? [
            {
              url: post.mediaUrl,
              type: (post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO",
              coverUrl: null
            }
          ]
        : [];

  const resolvedItems = items
    .map((item) => {
      const url = absolutePublicMediaUrl(item.url);
      if (!url) return null;
      const coverUrl = absolutePublicMediaUrl(item.coverUrl);
      return { url, type: item.type, coverUrl };
    })
    .filter((item): item is { url: string; type: "IMAGE" | "VIDEO"; coverUrl: string | null } => Boolean(item));

  const avatarUrl = absolutePublicMediaUrl(post.author.profile?.avatarUrl);
  const web = getWebAppOrigin().replace(/\/+$/, "");
  const logoFallback = `${web}/assets/app-treino-logo.svg`;
  const cover = pickShareImage(resolvedItems, avatarUrl, logoFallback);

  const body = (post.body ?? "").replace(/\n?\[\[LIVE:[^\]]+\]\]/g, "").trim();

  return {
    id: post.id,
    body,
    kind: post.kind,
    createdAt: post.createdAt.toISOString(),
    likesCount: post._count.likes,
    commentsCount: post._count.comments,
    mediaItems: resolvedItems,
    coverUrl: cover,
    author: {
      id: post.author.id,
      name: post.author.name,
      avatarUrl: absolutePublicMediaUrl(post.author.profile?.avatarUrl)
    }
  };
}

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get("/plans", async () => {
    if (!env.DATABASE_URL) {
      return {
        plans: initialPlans
      };
    }

    const plans = await prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: {
        priceInCents: "asc"
      }
    });

    return {
      plans: plans.length > 0 ? plans : initialPlans
    };
  });

  app.get("/public/config", async () => {
    if (!env.DATABASE_URL) {
      return { config: { ...DEFAULT_SYSTEM_SETTINGS } };
    }

    await ensureDefaultSystemSettings();

    const publicKeys = [
      "qr_checkin_url",
      "qr_checkin_enabled",
      "module_products",
      "module_purchases",
      "module_qr",
      "module_cards",
      "module_favorites",
      "module_ratings",
      "module_contact",
      "module_ai",
      "module_social_publicar",
      "module_social_momentos",
      "module_social_clipes",
      "module_social_live",
      "module_social_nota",
      "commerce_delivery_fee_cents",
      "commerce_origin_postal_code",
      "commerce_shipping_provider"
    ];

    const records = await prisma.systemSetting.findMany({
      where: { key: { in: publicKeys } }
    });

    const config = { ...DEFAULT_SYSTEM_SETTINGS };
    for (const record of records) {
      config[record.key] = record.value;
    }

    return { config };
  });

  app.get("/public/posts/:id", async (request, reply) => {
    if (!env.DATABASE_URL) {
      return reply.code(503).send({ message: "Publicação indisponível." });
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await loadPublicPost(id);
    if (!post) {
      return reply.code(404).send({ message: "Publicação não encontrada." });
    }
    return { post };
  });

  app.get("/public/share/posts/:id", async (request, reply) => {
    if (!env.DATABASE_URL) {
      return reply.code(503).type("text/html; charset=utf-8").send("<h1>Indisponível</h1>");
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const post = await loadPublicPost(id);
    const web = getWebAppOrigin().replace(/\/+$/, "");
    const sharePage = `${web}/p/${encodeURIComponent(id)}`;
    const registerUrl = `${web}/login?mode=register&post=${encodeURIComponent(id)}`;
    const loginUrl = `${web}/login?post=${encodeURIComponent(id)}`;

    if (!post) {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(
          `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Publicação não encontrada</title></head><body style="font-family:system-ui;padding:24px;text-align:center"><h1>Publicação não encontrada</h1><p><a href="${escapeHtml(registerUrl)}">Criar conta no App Treino Social</a></p></body></html>`
        );
    }

    const title = `${post.author.name} no App Treino Social`;
    const description = post.body
      ? post.body.slice(0, 160)
      : `Veja a publicação de ${post.author.name} no App Treino Social.`;
    const image = post.coverUrl || `${web}/assets/app-treino-logo.svg`;
    const mediaHtml = post.mediaItems[0]
      ? post.mediaItems[0].type === "VIDEO"
        ? `<video src="${escapeHtml(post.mediaItems[0].url)}" controls playsinline poster="${escapeHtml(image)}"></video>`
        : `<img src="${escapeHtml(post.mediaItems[0].url)}" alt=""/>`
      : post.coverUrl
        ? `<img src="${escapeHtml(post.coverUrl)}" alt=""/>`
        : `<div class="fallback">App Treino Social</div>`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:site_name" content="App Treino Social"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(description)}"/>
  <meta property="og:image" content="${escapeHtml(image)}"/>
  <meta property="og:url" content="${escapeHtml(sharePage)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(title)}"/>
  <meta name="twitter:description" content="${escapeHtml(description)}"/>
  <meta name="twitter:image" content="${escapeHtml(image)}"/>
  <link rel="canonical" href="${escapeHtml(sharePage)}"/>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    html{-webkit-text-size-adjust:100%}
    body{
      margin:0;
      font-family:Manrope,system-ui,sans-serif;
      background:#0b0d12;
      color:#f5f5f5;
      min-height:100dvh;
      min-height:100svh;
      height:100dvh;
      height:100svh;
      display:grid;
      grid-template-rows:1fr;
      padding:
        max(0px, env(safe-area-inset-top, 0px))
        max(0px, env(safe-area-inset-right, 0px))
        max(0px, env(safe-area-inset-bottom, 0px))
        max(0px, env(safe-area-inset-left, 0px));
      overflow:hidden;
    }
    .card{
      width:min(420px,100%);
      height:100%;
      max-height:100%;
      margin:0 auto;
      background:#141821;
      border:1px solid #2a3140;
      border-radius:20px;
      overflow:hidden;
      display:flex;
      flex-direction:column;
    }
    .media{
      flex:1 1 auto;
      min-height:min(42dvh,320px);
      max-height:min(62dvh,calc(100dvh - 240px));
      background:#000;
      display:grid;
      place-items:center;
      overflow:hidden;
    }
    .media img,.media video{
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
      background:#000;
    }
    .fallback{padding:40px;opacity:.7}
    .body{
      flex:0 0 auto;
      padding:14px 16px;
      display:grid;
      gap:10px;
    }
    strong{font-size:15px}
    p{
      margin:0;
      font-size:14px;
      line-height:1.4;
      color:#d7dbe3;
      overflow-wrap:anywhere;
      max-height:28dvh;
      overflow-y:auto;
      -webkit-overflow-scrolling:touch;
    }
    .actions{display:grid;gap:8px;margin-top:4px}
    a{display:block;text-align:center;text-decoration:none;border-radius:12px;padding:12px 14px;font-weight:700}
    .primary{background:#df663c;color:#fff}
    .ghost{background:transparent;color:#f5f5f5;border:1px solid #2a3140}
    @media (max-width:719px){
      body{padding:0}
      .card{
        width:100%;
        border-radius:16px 16px 0 0;
        border-left:0;
        border-right:0;
        border-bottom:0;
      }
      .media{
        min-height:min(38dvh,280px);
        max-height:min(58dvh,calc(100dvh - 220px));
      }
      .body{
        padding:
          12px 14px
          calc(12px + env(safe-area-inset-bottom, 0px));
      }
    }
    @media (max-width:719px) and (max-height:640px){
      .media{
        min-height:min(32dvh,200px);
        max-height:min(46dvh,calc(100dvh - 190px));
      }
      .actions a{padding:10px 12px;font-size:14px}
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="media">${mediaHtml}</div>
    <div class="body">
      <strong>${escapeHtml(post.author.name)}</strong>
      ${post.body ? `<p>${escapeHtml(post.body)}</p>` : ""}
      <div class="actions">
        <a class="primary" href="${escapeHtml(registerUrl)}">Criar conta</a>
        <a class="ghost" href="${escapeHtml(loginUrl)}">Já tenho conta</a>
      </div>
    </div>
  </main>
</body>
</html>`;

    return reply
      .header("Cache-Control", "public, max-age=120")
      .type("text/html; charset=utf-8")
      .send(html);
  });

  app.get("/public/melhor-envio/callback", async (request, reply) => {
    const query = z
      .object({
        code: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
        scope: z.string().optional()
      })
      .parse(request.query ?? {});

    const apiBase = env.PUBLIC_BASE_URL.replace(/\/$/, "");
    const sandbox = env.MELHOR_ENVIO_SANDBOX !== false;
    const tokenUrl = sandbox
      ? "https://sandbox.melhorenvio.com.br/oauth/token"
      : "https://melhorenvio.com.br/oauth/token";

    if (query.error) {
      const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><title>Melhor Envio — erro</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
  <h1>Autorização não concluída</h1>
  <p><strong>Erro:</strong> ${escapeHtml(query.error)}</p>
  ${query.error_description ? `<p>${escapeHtml(query.error_description)}</p>` : ""}
  <p>Tente autorizar de novo pelo painel Melhor Envio.</p>
</body></html>`;
      return reply.type("text/html; charset=utf-8").send(html);
    }

    if (!query.code?.trim()) {
      const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><title>Melhor Envio — sem código</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
  <h1>Código não recebido</h1>
  <p>A URL chegou sem o parâmetro <code>code</code>. Isso costuma acontecer quando o redirect cadastrado no Melhor Envio não aponta para esta rota.</p>
  <p>Cadastre no app Melhor Envio esta URL exata de redirect:</p>
  <pre style="background:#f4f4f4;padding:12px;border-radius:8px;overflow:auto">${escapeHtml(`${apiBase}/public/melhor-envio/callback`)}</pre>
  <p>Depois abra novamente o link de autorização OAuth com o mesmo <code>redirect_uri</code>.</p>
</body></html>`;
      return reply.type("text/html; charset=utf-8").send(html);
    }

    const code = query.code.trim();
    const redirectUri = `${apiBase}/public/melhor-envio/callback`;
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Melhor Envio — código recebido</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5;color:#111}
    code,pre{background:#f4f4f4;border-radius:8px}
    pre{padding:12px;overflow:auto;word-break:break-all}
    .ok{color:#0a7a2f;font-weight:700}
    ol{padding-left:20px}
  </style>
</head>
<body>
  <h1 class="ok">Código recebido com sucesso</h1>
  <p>Copie o código abaixo e troque pelo <strong>access_token</strong> (não use o Client Secret no .env).</p>
  <pre id="melhor-code">${escapeHtml(code)}</pre>
  <p><strong>redirect_uri</strong> usado neste fluxo:</p>
  <pre>${escapeHtml(redirectUri)}</pre>
  <h2>PowerShell</h2>
  <pre>Invoke-RestMethod \`
  -Uri "${escapeHtml(tokenUrl)}" \`
  -Method POST \`
  -ContentType "application/json" \`
  -Headers @{
    Accept = "application/json"
    "User-Agent" = "App Treino (seu-email@exemplo.com)"
  } \`
  -Body (@{
    grant_type = "authorization_code"
    client_id = "SEU_CLIENT_ID"
    client_secret = "SEU_CLIENT_SECRET"
    redirect_uri = "${escapeHtml(redirectUri)}"
    code = "${escapeHtml(code)}"
  } | ConvertTo-Json)</pre>
  <h2>No .env da API</h2>
  <ol>
    <li>Cole o <code>access_token</code> (JWT longo, começa com <code>eyJ</code>) em <code>MELHOR_ENVIO_TOKEN</code></li>
    <li>Mantenha <code>MELHOR_ENVIO_SANDBOX="${sandbox ? "true" : "false"}"</code></li>
    <li>Reinicie a API</li>
  </ol>
  ${query.scope ? `<p><small>Escopos: ${escapeHtml(query.scope)}</small></p>` : ""}
</body>
</html>`;

    return reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(html);
  });
}
