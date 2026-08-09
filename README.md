# App Treino

Base inicial do projeto criada a partir do `pdr.md`.

## Estrutura

```txt
apps/
  web/      Landing page, login, painel administrativo e area do usuario
  api/      API Node.js, banco, autenticacao, pagamentos e webhooks
  mobile/   App React Native (em desenvolvimento)
packages/
  shared/   Tipos e contratos compartilhados
docs/       Documentacao de apoio
```

## Primeiros comandos

### Opção 1: Com Docker (Recomendado)

```bash
# Copiar arquivo de ambiente
cp .env.docker .env

# Subir todos os serviços (API + Banco de Dados)
npm run docker:up

# Ver logs
npm run docker:logs

# Acessar API em http://localhost:3000
```

Para mais detalhes, consulte [DOCKER.md](./DOCKER.md).

### Opção 2: Local (Sem Docker)

```bash
npm install
npm run dev:web
npm run dev:api
```

## Deploy

O projeto está configurado para deploy automático na seguinte infraestrutura:

- **Banco de Dados**: Neon Tech (PostgreSQL serverless)
- **Backend API**: Render (Node.js/Fastify)
- **Frontend Web**: Vercel (React + Vite)
- **Pagamentos**: Asaas (assinaturas e webhooks)

Consulte o guia completo em [DEPLOY.md](./DEPLOY.md).

## GitHub Actions

O projeto possui CI em `.github/workflows/ci.yml` para pushes e pull requests na branch `main`.
O deploy do frontend para Vercel fica em `.github/workflows/deploy-vercel.yml`.
O deploy da API/backend para Render fica em `.github/workflows/deploy-render.yml`.

Para reproduzir localmente as principais checagens:

```bash
npm run prisma:generate
npm run typecheck
npm run build
```

## Ambiente

Copie `.env.example` para `.env` na raiz e ajuste as credenciais. Para a API, tambem crie `apps/api/.env` se preferir manter variaveis especificas no app.

## Proximos passos tecnicos

- **Com Docker**: Configure `.env` e rode `npm run docker:up`
- **Local**: Instalar dependencias com `npm install`.
- Configurar o PostgreSQL (Neon Tech ou Docker) e atualizar `DATABASE_URL`.
- Rodar `npm run prisma:generate`.
- Rodar `npm run prisma:migrate` apos revisar o schema.
- Implementar persistencia real nas rotas que hoje estao estruturadas como base inicial.

---

## 🐳 Docker

O projeto agora suporta Docker Compose para desenvolvimento local rápido!

```bash
# Subir API + Banco de Dados
npm run docker:up

# Subir com frontend também
docker compose --profile with-frontend up -d

# Parar serviços
npm run docker:down

# Ver logs
npm run docker:logs

# Reset completo (remove volumes)
npm run docker:clean
```

📖 Consulte o guia completo em [DOCKER.md](./DOCKER.md).
