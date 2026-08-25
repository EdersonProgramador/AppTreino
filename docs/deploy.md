# Deploy — Neon + Render + Vercel + domínio HostGator

Stack de produção:

| Camada | Serviço | Domínio |
|--------|---------|---------|
| Banco | Neon (PostgreSQL) | — |
| API | Render | `https://apptreino-backend.onrender.com` (depois `api.edersonprogramador.com`) |
| Web | Vercel | `https://edersonprogramador.com` |
| DNS | HostGator | aponta os domínios acima |

## 1. Neon (banco)

1. Crie um projeto em [Neon](https://neon.tech).
2. Copie a connection string **com** `?sslmode=require`.
3. Guarde como `DATABASE_URL` (Render e local).

Local (opcional, apontando para Neon):

```bash
# .env na raiz
DATABASE_URL="postgresql://USER:PASSWORD@ep-....neon.tech/neondb?sslmode=require"
```

Rode as migrations uma vez (ou deixe o Render fazer no start):

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

## 2. Render (API)

1. Conecte o repositório GitHub no Render.
2. Use o blueprint `render.yaml` **ou** Web Service manual:
   - **Root Directory:** `/` (monorepo)
   - **Build:** `npm ci && npm run prisma:generate && npm run build --workspace @app-treino/shared && npm run build --workspace @app-treino/api`
   - **Start:** `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run start --workspace @app-treino/api`
   - **Health Check:** `/health`
3. Variáveis obrigatórias:

```txt
NODE_ENV=production
DATABASE_URL=<neon connection string sslmode=require>
JWT_SECRET=<segredo longo>
WEB_ORIGIN=https://edersonprogramador.com,https://www.edersonprogramador.com
PUBLIC_BASE_URL=https://api.edersonprogramador.com
GOOGLE_CLIENT_ID=<mesmo do Google Cloud / Vercel>
ASAAS_API_KEY=<produção>
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token do webhook>
```

4. Domínio customizado no Render: `api.edersonprogramador.com`.
5. Webhook Asaas: `https://api.edersonprogramador.com/webhooks/asaas`

Uploads ficam no disco do container (efêmeros no plano gratuito). Para produção estável de mídia, use **Cloudflare R2 + CDN** — veja [deploy-r2.md](./deploy-r2.md).

## 3. Vercel (frontend)

1. Importe o mesmo repositório na Vercel.
2. Framework: Vite; o `vercel.json` na raiz já define build/output.
3. Variáveis de ambiente (Production):

```txt
VITE_API_URL=https://api.edersonprogramador.com
VITE_GOOGLE_CLIENT_ID=<mesmo Client ID do Google>
```

4. Domínios: `edersonprogramador.com` e `www.edersonprogramador.com`.

## 4. DNS na HostGator

No cPanel → Zone Editor (ou DNS da HostGator):

### Front (Vercel)

Siga o que a Vercel mostrar (valores mudam por conta). Em geral:

- `edersonprogramador.com` → registros **A** indicados pela Vercel  
  **ou** CNAME flattening conforme painel
- `www` → **CNAME** para `cname.vercel-dns.com` (ou o alvo exibido na Vercel)

### API (Render)

- `api` → **CNAME** para o host do serviço Render  
  (ex.: `app-treino-api.onrender.com` — use o hostname exato do dashboard)

Aguarde a propagação DNS e valide SSL nos painéis Render/Vercel.

## 5. Google OAuth

No Google Cloud Console, Authorized JavaScript origins:

- `https://edersonprogramador.com`
- `https://www.edersonprogramador.com`
- `http://localhost:5173` (dev)

## 6. Checklist pós-deploy

- [ ] `https://api.edersonprogramador.com/health` → `database: ok`
- [ ] Abra `https://edersonprogramador.com` e faça login
- [ ] Confirme que não há erro de CORS no DevTools
- [ ] Teste upload e URL pública sob `https://api.edersonprogramador.com/uploads/...`
- [ ] Configure o webhook Asaas e confirme um pagamento de teste/produção
- [ ] `https://apptreino-backend.onrender.com/public/share/posts/POST_ID` → HTML com `og:image` (não JSON 404)
- [ ] Compartilhe um post no WhatsApp e confirme preview (pode levar alguns minutos por cache)

### Preview de compartilhamento (posts sociais)

1. **Redeploy da API** no Render após push com `public.routes.ts` (rotas `/public/share/posts/:id` e `/public/posts/:id`).
2. O link compartilhado usa o domínio do web: `https://seusite.com/public/share/posts/:id` (proxy Vercel → API).
3. Se o preview não atualizar, limpe o cache do WhatsApp (reenvie com `?v=2` ou use o [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)).
4. Posts só com vídeo precisam de **capa/frame** escolhida — o `og:image` não aceita `.mp4`.
