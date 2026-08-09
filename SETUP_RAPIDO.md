# 🚀 Setup Rápido - App Treino

Guia rápido para configurar e fazer deploy do projeto.

## 1. Configurar Banco de Dados (Neon Tech)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta
2. Crie um novo projeto chamado `app-treino`
3. Copie a **Connection String** (formato: `postgresql://...`)

## 2. Configurar API no Render

1. Acesse [render.com](https://render.com) e crie uma conta
2. Clique em **New +** → **Web Service**
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: `app-treino-api`
   - **Region**: `São Paulo`
   - **Branch**: `main`
   - **Build Command**: 
     ```
     npm ci && npm run prisma:generate && npm run build --workspace @app-treino/shared && npm run build --workspace @app-treino/api
     ```
   - **Start Command**: 
     ```
     npm run start --workspace @app-treino/api
     ```
5. Em **Environment**, adicione:
   - `DATABASE_URL`: sua connection string do Neon
   - `JWT_SECRET`: uma senha forte aleatória
   - `WEB_ORIGIN`: `https://seu-app.vercel.app`
   - `ASAAS_API_KEY`: sua chave da Asaas
   - `ASAAS_WEBHOOK_TOKEN`: token do webhook
   - `GOOGLE_CLIENT_ID`: client ID do Google OAuth

## 3. Configurar Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e crie uma conta
2. Clique em **Add New...** → **Project**
3. Importe seu repositório GitHub
4. Configure:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: 
     ```
     cd ../.. && npm ci && npm run build --workspace @app-treino/shared && npm run build --workspace @app-treino/web
     ```
   - **Output Directory**: `apps/web/dist`
5. Em **Environment Variables**, adicione:
   - `VITE_API_URL`: `https://app-treino-api.onrender.com`
   - `VITE_GOOGLE_CLIENT_ID`: seu client ID do Google

## 4. Configurar GitHub Actions (Deploy Automático)

No GitHub, vá em **Settings** → **Secrets and variables** → **Actions**

### Secrets (RENDER):
```
RENDER_API_KEY=<sua-api-key-do-render>
RENDER_SERVICE_ID=<id-do-servico-no-render>
PRODUCTION_DATABASE_URL=postgresql://... (Neon)
PRODUCTION_JWT_SECRET=<sua-jwt-secret>
PRODUCTION_ASAAS_API_KEY=<chave-asaas-producao>
PRODUCTION_ASAAS_WEBHOOK_TOKEN=<token-webhook>
```

### Secrets (VERCEL):
```
VERCEL_TOKEN=<seu-token-vercel>
VERCEL_ORG_ID=<id-da-organizacao>
VERCEL_PROJECT_ID=<id-do-projeto>
```

### Repository Variables:
```
VITE_API_URL=https://app-treino-api.onrender.com
```

## 5. Testar Deploy

1. Faça push para a branch `main`:
   ```bash
   git add .
   git commit -m "Setup inicial"
   git push origin main
   ```

2. Os workflows do GitHub Actions vão rodar automaticamente

3. Verifique os deploys:
   - API: `https://app-treino-api.onrender.com/health`
   - Frontend: `https://seu-app.vercel.app`

## ✅ Validação

Teste a API:
```bash
curl https://app-treino-api.onrender.com/health
# Deve retornar: {"status":"ok","service":"app-treino-api"}
```

Acesse o frontend e verifique se:
- A landing page carrega
- O login funciona
- Os dados são carregados da API

## 📞 Problemas Comuns

- **Erro de CORS**: Adicione o domínio da Vercel no `WEB_ORIGIN` no Render
- **Banco não conecta**: Verifique se a string do Neon tem `?sslmode=require`
- **Build falha**: Confira se as variáveis de ambiente estão configuradas

---

Para mais detalhes, veja [DEPLOY.md](./DEPLOY.md).
