# Deploy — ATLLY (Neon + Render + Vercel + HostGator)

Stack de produção:

| Camada | Serviço | Domínio |
|--------|---------|---------|
| Banco | Neon (PostgreSQL) | — |
| API | Render | `https://api.atlly.com.br` |
| Web | Vercel | `https://atlly.com.br` e `https://www.atlly.com.br` |
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
WEB_ORIGIN=https://atlly.com.br,https://www.atlly.com.br
PUBLIC_BASE_URL=https://api.atlly.com.br
GOOGLE_CLIENT_ID=<mesmo do Google Cloud / Vercel>
ASAAS_API_KEY=<produção>
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token do webhook>
REVENUECAT_SECRET_KEY=<secret API v1 do RevenueCat — validação IAP iOS>
REVENUECAT_WEBHOOK_AUTH=<token Bearer do webhook RevenueCat>
```

4. Domínio customizado no Render: `api.atlly.com.br`.
5. Webhook Asaas: `https://api.atlly.com.br/webhooks/asaas`

Uploads ficam no disco do container (efêmeros no plano gratuito). Para produção estável de mídia, use **Cloudflare R2 + CDN** — veja [deploy-r2.md](./deploy-r2.md).

## 3. Vercel (frontend)

1. Importe o mesmo repositório na Vercel.
2. Framework: Vite; o `vercel.json` na raiz já define build/output.
3. Variáveis de ambiente (Production):

```txt
VITE_API_URL=https://api.atlly.com.br
VITE_GOOGLE_CLIENT_ID=<mesmo Client ID do Google>
VITE_GTM_ID=GTM-XXXXXXX
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_GOOGLE_ADS_CUSTOMER_ID=244-230-6941
VITE_GOOGLE_ADS_ID=AW-XXXXXXXXXX
VITE_GOOGLE_ADS_CONVERSION_PURCHASE=xxxxxxxxxxxxxxxx
VITE_GOOGLE_ADS_CONVERSION_SIGNUP=yyyyyyyyyyyyyyyy
VITE_GOOGLE_ADS_CONVERSION_BEGIN_CHECKOUT=zzzzzzzzzzzzzzzz
```

O `VITE_GTM_ID` carrega o Google Tag Manager e o `dataLayer` (eventos `page_view`, `complete_registration`, `begin_checkout`, `purchase`). Use o GTM para Meta Pixel e tags extras.

**Google Ads (gtag nativo no front):** com `VITE_GOOGLE_ADS_ID` + rótulos de conversão, o site dispara `gtag('event', 'conversion', { send_to: 'AW-…/rótulo', value, currency, transaction_id })` em cadastro, início de checkout e compra. Opcional: `VITE_GA4_MEASUREMENT_ID` para pageviews SPA e eventos `sign_up`, `begin_checkout`, `purchase` (vincule GA4 ao Google Ads em **Admin → Property → Product links**).

Alternativa: em vez de ID + rótulo separados, use `VITE_GOOGLE_ADS_SEND_TO_PURCHASE=AW-xxx/rótulo` (e o equivalente para signup / begin_checkout).

No Google Ads: **Objetivos → Conversões → Nova ação de conversão → Site** — copie o ID `AW-…` e o **rótulo de conversão** de cada ação. Evite duplicar a mesma conversão no GTM e no gtag (escolha um caminho ou desative a tag duplicada no GTM).

Detalhes da conta ATLLY (`244-230-6941`) e playbook manual: [google-ads-atlly.md](./google-ads-atlly.md) · [google-ads-manual-playbook.md](./google-ads-manual-playbook.md).

Exemplo de URL de campanha (UTMs persistem 90 dias até o cadastro):

`https://atlly.com.br/ativar?plan=PRO&coupon=META10&utm_source=meta&utm_medium=paid_social&utm_campaign=pro_corredores`

4. Domínios: `atlly.com.br` e `www.atlly.com.br`.
5. Quando o app estiver nas lojas, adicione (Production):

```txt
VITE_APP_STORE_ANDROID_URL=https://play.google.com/store/apps/details?id=com.edersonprogramador.apptreino
VITE_APP_STORE_IOS_URL=https://apps.apple.com/app/idXXXXXXXXX
```

A página `/baixar-app` passa a exibir botões clicáveis assim que pelo menos uma URL estiver definida.

## 4. DNS na HostGator

No cPanel → Zone Editor (ou DNS da HostGator):

### Front (Vercel)

Siga o que a Vercel mostrar (valores mudam por conta). Em geral:

- `atlly.com.br` → registros **A** indicados pela Vercel  
  **ou** CNAME flattening conforme painel
- `www` → **CNAME** para `cname.vercel-dns.com` (ou o alvo exibido na Vercel)

### API (Render)

- `api` → **CNAME** para o host do serviço Render  
  (ex.: `apptreino-backend.onrender.com` — use o hostname exato do dashboard)

Aguarde a propagação DNS e valide SSL nos painéis Render/Vercel.

## 5. Google OAuth

No Google Cloud Console, Authorized JavaScript origins:

- `https://atlly.com.br`
- `https://www.atlly.com.br`
- `http://localhost:5173` (dev)

## 6. Checklist pós-deploy

- [ ] `https://api.atlly.com.br/health` → `database: ok`
- [ ] Abra `https://atlly.com.br` e faça login
- [ ] Confirme que não há erro de CORS no DevTools
- [ ] Teste upload e URL pública de mídia (R2 / `R2_PUBLIC_URL`)
- [ ] Configure o webhook Asaas e confirme um pagamento de teste/produção
- [ ] `https://api.atlly.com.br/public/share/posts/POST_ID` → HTML com `og:image` (não JSON 404)
- [ ] Compartilhe um post no WhatsApp e confirme preview (pode levar alguns minutos por cache)

### Preview de compartilhamento (posts sociais)

1. **Redeploy da API** no Render após push com `public.routes.ts` (rotas `/public/share/posts/:id` e `/public/posts/:id`).
2. O link compartilhado usa o domínio do web: `https://seusite.com/public/share/posts/:id` (proxy Vercel → API).
3. Se o preview não atualizar, limpe o cache do WhatsApp (reenvie com `?v=2` ou use o [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)).
4. Posts só com vídeo precisam de **capa/frame** escolhida — o `og:image` não aceita `.mp4`.

## 7. Mobile — EAS (App Store / Google Play)

Diretório: `apps/mobile`. Perfil de build: `production` (`eas.json`).

### Secrets no EAS (projeto Expo)

Crie no dashboard ou via CLI (`eas secret:create --scope project`):

| Secret | Obrigatório | Uso |
|--------|-------------|-----|
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | iOS com assinatura | SDK RevenueCat no app |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Android + iOS | Mapas nativos (`app.config.js`) |
| `EXPO_PUBLIC_MEDIA_URL` | Recomendado | CDN de mídia (fallback no código se vazio) |

URLs de API/web já vão no `eas.json` → `build.production.env`.

Referência local: `apps/mobile/eas.secrets.example.env`.

### Build e submit

```bash
cd apps/mobile
npm install
eas login
eas build --platform all --profile production
# Após revisar o binário:
eas submit --platform ios --profile production   # preencha appleId/ascAppId/teamId no eas.json
eas submit --platform android --profile production  # credencial Google Play no EAS (1ª vez interativo)
```

Android: primeiro submit usa `track: internal` + `releaseStatus: draft` — promova para produção no Play Console quando validar.

### App Store Connect (iOS)

- Bundle ID: `com.edersonprogramador.apptreino`
- Produtos de assinatura alinhados a `com.edersonprogramador.apptreino.{planCode}` ou `apple_product_id` no banco
- RevenueCat: entitlement + webhook → `https://api.atlly.com.br/...` (rota configurada no backend)
- Conta sandbox e notas de review (GPS em background, login de teste)

### Google Play

- Package: `com.edersonprogramador.apptreino`
- Formulário de segurança de dados + declaração de localização em background
- **Política de pagamentos:** assinatura digital no app hoje usa Asaas (Android); avalie Play Billing antes da publicação em produção na loja
