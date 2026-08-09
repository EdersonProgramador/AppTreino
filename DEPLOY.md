# 🚀 Guia de Deploy - App Treino

Este guia descreve como configurar o deploy do projeto para a nova infraestrutura:

## 📋 Nova Infraestrutura

| Componente | Serviço | Descrição |
|------------|---------|-----------|
| **Banco de Dados** | Neon Tech | PostgreSQL serverless com branch e pooling |
| **Backend API** | Render | Node.js/Express (Fastify) com deploy automático |
| **Frontend Web** | Vercel | React + Vite com otimizações automáticas |
| **Gateway de Pagamento** | Asaas | Assinaturas e webhooks |

---

## 🔧 Configuração do Banco de Dados (Neon Tech)

1. **Crie uma conta no [Neon Tech](https://neon.tech)**

2. **Crie um novo projeto:**
   - Nome: `app-treino`
   - Região: Mais próxima dos seus usuários
   - Branch principal: `main`

3. **Obtenha a connection string:**
   - Vá em **Connection Details**
   - Copie a string no formato:
     ```
     postgresql://user:password@ep-xxx.region.aws.neon.tech/app_treino?sslmode=require
     ```

4. **Configure o Prisma:**
   - A migration será executada automaticamente no deploy do Render
   - Para desenvolvimento local, use a mesma string no `.env`

---

## 🖥️ Configuração da API no Render

1. **Crie uma conta no [Render](https://render.com)**

2. **Crie um novo Web Service:**
   - **Name**: `app-treino-api`
   - **Region**: Escolha a mais próxima
   - **Branch**: `main`
   - **Root Directory**: Deixe em branco (monorepo na raiz)
   - **Runtime**: `Node`
   - **Build Command**: 
     ```bash
     npm ci && npm run prisma:generate && npm run build --workspace @app-treino/shared && npm run build --workspace @app-treino/api
     ```
   - **Start Command**: 
     ```bash
     npm run start --workspace @app-treino/api
     ```

3. **Configure as Variáveis de Ambiente no Render:**
   ```
   NODE_ENV=production
   DATABASE_URL=<sua-connection-string-neon>
   JWT_SECRET=<sua-jwt-secret-forte>
   WEB_ORIGIN=https://seu-dominio.vercel.app
   ASAAS_API_KEY=<sua-chave-asaas-producao>
   ASAAS_WEBHOOK_TOKEN=<seu-token-webhook>
   GOOGLE_CLIENT_ID=<seu-client-id-google>
   PORT=3333
   ```

4. **Configure o Deploy Automático:**
   - O Render detectará pushes na branch `main`
   - Ou use o webhook do GitHub para triggers automáticos

---

## 🌐 Configuração do Frontend na Vercel

1. **Crie uma conta na [Vercel](https://vercel.com)**

2. **Importe o repositório do GitHub:**
   - Conecte sua conta do GitHub
   - Selecione o repositório `AppTreino`

3. **Configure o Projeto:**
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: 
     ```bash
     cd ../.. && npm ci && npm run build --workspace @app-treino/shared && npm run build --workspace @app-treino/web
     ```
   - **Output Directory**: `apps/web/dist`

4. **Configure as Variáveis de Ambiente na Vercel:**
   - Vá em **Settings > Environment Variables**
   - Adicione:
     ```
     VITE_API_URL=https://app-treino-api.onrender.com
     VITE_GOOGLE_CLIENT_ID=<seu-client-id-google>
     ```

5. **Domínio Personalizado (Opcional):**
   - Vá em **Settings > Domains**
   - Adicione seu domínio (ex: `www.seudominio.com`)

---

## 🔐 Configuração dos Segredos do GitHub Actions

Para que os deploys automáticos funcionem, configure os seguintes **Secrets** no seu repositório GitHub:

### Acesse: `Settings > Secrets and variables > Actions`

### Secrets para Deploy da API (Render):
```
RENDER_API_KEY=<sua-api-key-do-render>
RENDER_SERVICE_ID=<id-do-seu-servico-no-render>
PRODUCTION_DATABASE_URL=postgresql://... (Neon)
PRODUCTION_JWT_SECRET=<sua-jwt-secret>
PRODUCTION_ASAAS_API_KEY=<chave-asaas-producao>
PRODUCTION_ASAAS_WEBHOOK_TOKEN=<token-webhook>
```

### Secrets para Deploy do Frontend (Vercel):
```
VERCEL_TOKEN=<seu-token-vercel>
VERCEL_ORG_ID=<id-da-sua-organizacao>
VERCEL_PROJECT_ID=<id-do-projeto>
```

### Repository Variables:
```
VITE_API_URL=https://app-treino-api.onrender.com
```

---

## 💳 Configuração do Asaas

1. **Conta Sandbox (Desenvolvimento):**
   - Crie conta em [Asaas Sandbox](https://sandbox.asaas.com)
   - Gere API Key em **Integração > API**
   - Configure webhook: `https://seu-app-treino-api.onrender.com/asaas/webhook`

2. **Conta Produção:**
   - Use a plataforma oficial [Asaas](https://asaas.com)
   - Repita o processo acima em produção

3. **Webhook no Render:**
   - No painel do Render, adicione a URL do webhook do Asaas
   - Endpoint: `/asaas/webhook`

---

## 🔄 Fluxo de Deploy Automático

### API (Render):
- Trigger: Push na branch `main` com mudanças em `apps/api/**` ou `packages/shared/**`
- Workflow: `.github/workflows/deploy-render.yml`
- Ação: Build → Deploy via API do Render

### Frontend (Vercel):
- Trigger: Push na branch `main` com mudanças em `apps/web/**` ou `packages/shared/**`
- Workflow: `.github/workflows/deploy-vercel.yml`
- Ação: Build → Deploy via Vercel API

---

## ✅ Validação do Deploy

1. **API:**
   ```bash
   curl https://app-treino-api.onrender.com/health
   # Deve retornar: {"status":"ok","service":"app-treino-api"}
   ```

2. **Frontend:**
   - Acesse `https://seu-dominio.vercel.app`
   - Verifique se o login e carregamento de dados funcionam

3. **Banco de Dados:**
   - No Neon Dashboard, verifique se as tabelas foram criadas
   - Execute: `npx prisma migrate deploy` se necessário

---

## 🛠️ Comandos Úteis

### Local Development:
```bash
# Instalar dependências
npm install

# Gerar Prisma Client
npm run prisma:generate

# Rodar migrations
npm run prisma:migrate

# Desenvolver frontend
npm run dev:web

# Desenvolver API
npm run dev:api

# Build completo
npm run build
```

### Production:
```bash
# Deploy manual da API (via SSH no Render)
cd /opt/render/project/src
git pull origin main
npm ci
npm run prisma:generate
npm run build --workspace @app-treino/shared
npm run build --workspace @app-treino/api
touch /opt/render/project/tmp/restart.txt

# Deploy manual do Frontend (Vercel CLI)
vercel --prod
```

---

## 📝 Checklist de Deploy

- [ ] Conta Neon criada e connection string obtida
- [ ] Migrations do Prisma executadas no Neon
- [ ] Serviço criado no Render com variáveis de ambiente
- [ ] Projeto criado na Vercel com variáveis de ambiente
- [ ] Secrets configurados no GitHub Actions
- [ ] API do Asaas configurada (sandbox e produção)
- [ ] Webhook do Asaas registrado
- [ ] Domínios personalizados configurados (opcional)
- [ ] Testes de integração realizados
- [ ] SSL/HTTPS verificado em todos os endpoints

---

## 🆘 Troubleshooting

### Erro: "DATABASE_URL is not defined"
- Verifique se a variável está configurada no Render
- Certifique-se de incluir `?sslmode=require` na string do Neon

### Erro: "CORS blocked"
- Adicione o domínio da Vercel no `WEB_ORIGIN` no Render
- Formato: `https://seu-dominio.vercel.app`

### Erro: "Build failed no Vercel"
- Verifique se o `VITE_API_URL` está definido
- Confirme que o caminho do build está correto (`apps/web`)

### Erro: "Prisma generate failed"
- Execute `npm run prisma:generate` manualmente
- Verifique permissões de arquivo

---

## 📞 Suporte

Em caso de dúvidas, consulte:
- [Docs Render](https://render.com/docs)
- [Docs Vercel](https://vercel.com/docs)
- [Docs Neon](https://neon.tech/docs)
- [Docs Prisma](https://prisma.io/docs)
