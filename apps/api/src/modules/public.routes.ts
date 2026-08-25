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

function parseMediaItems(raw: unknown): Array<{ url: string; type: "IMAGE" | "VIDEO" }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { url?: unknown; type?: unknown };
      if (typeof row.url !== "string" || !row.url) return null;
      return { url: row.url, type: row.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const) };
    })
    .filter((item): item is { url: string; type: "IMAGE" | "VIDEO" } => Boolean(item))
    .slice(0, 10);
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
  const items =
    mediaItems.length > 0
      ? mediaItems
      : post.mediaUrl
        ? [{ url: post.mediaUrl, type: (post.mediaType === "VIDEO" ? "VIDEO" : "IMAGE") as "IMAGE" | "VIDEO" }]
        : [];

  const resolvedItems = items
    .map((item) => {
      const url = absolutePublicMediaUrl(item.url);
      return url ? { url, type: item.type } : null;
    })
    .filter((item): item is { url: string; type: "IMAGE" | "VIDEO" } => Boolean(item));

  const cover =
    resolvedItems.find((item) => item.type === "IMAGE")?.url ??
    resolvedItems[0]?.url ??
    absolutePublicMediaUrl(post.author.profile?.avatarUrl) ??
    null;

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
      "module_contact"
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
    body{margin:0;font-family:Manrope,system-ui,sans-serif;background:#0b0d12;color:#f5f5f5;min-height:100dvh;display:grid;place-items:center;padding:20px}
    .card{width:min(420px,100%);background:#141821;border:1px solid #2a3140;border-radius:20px;overflow:hidden}
    .media{aspect-ratio:4/5;background:#000;display:grid;place-items:center}
    .media img,.media video{width:100%;height:100%;object-fit:cover;display:block}
    .fallback{padding:40px;opacity:.7}
    .body{padding:16px;display:grid;gap:10px}
    strong{font-size:15px}
    p{margin:0;font-size:14px;line-height:1.4;color:#d7dbe3}
    .actions{display:grid;gap:8px;margin-top:8px}
    a{display:block;text-align:center;text-decoration:none;border-radius:12px;padding:12px 14px;font-weight:700}
    .primary{background:#df663c;color:#fff}
    .ghost{background:transparent;color:#f5f5f5;border:1px solid #2a3140}
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
}
