# App Treino

Base inicial do projeto criada a partir do `pdr.md`.

## Estrutura

```txt
apps/
  web/      Landing page, login, painel administrativo e area do usuario
  api/      API Node.js, banco, autenticacao, pagamentos e webhooks
packages/
  shared/   Tipos e contratos compartilhados
docs/       Documentacao de apoio
```

## Primeiros comandos

```bash
npm install
npm run dev:web
npm run dev:api
```

## GitHub Actions

O projeto possui CI em `.github/workflows/ci.yml` para pushes e pull requests na branch `main`.
O deploy da web para GitHub Pages fica em `.github/workflows/deploy-pages.yml`.
O deploy da API/backend fica em `.github/workflows/deploy-api.yml`.
O deploy gratuito da API/backend para Koyeb fica em `.github/workflows/deploy-koyeb.yml`.

Para reproduzir localmente as principais checagens:

```bash
npm run prisma:generate
npm run typecheck
npm run build
```

### Deploy da API/backend

O workflow `Deploy API` faz:

- build da imagem Docker da API;
- publish no GitHub Container Registry (`ghcr.io`);
- deploy opcional por SSH em um servidor de produção;
- execução de `prisma migrate deploy` antes de iniciar o container.

Configure estes secrets no GitHub para ativar o deploy por SSH:

```txt
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_SSH_KEY
PRODUCTION_DATABASE_URL
PRODUCTION_JWT_SECRET
PRODUCTION_ASAAS_API_KEY
PRODUCTION_ASAAS_WEBHOOK_TOKEN
```

Se a imagem no GHCR ficar privada, configure tambem:

```txt
GHCR_USERNAME
GHCR_TOKEN
```

Configure estas variables no GitHub quando aplicável:

```txt
VITE_API_URL
PRODUCTION_WEB_ORIGIN
PRODUCTION_GOOGLE_CLIENT_ID
```

Para GitHub Pages, `VITE_API_URL` deve apontar para a API publica em HTTPS, por exemplo `https://api.seudominio.com`.
Para o CORS da API, `PRODUCTION_WEB_ORIGIN` deve incluir a origem do Pages: `https://edersonprogramador.github.io`.
Se precisar liberar mais de uma origem, separe por virgula, por exemplo `https://edersonprogramador.github.io,http://localhost:5173`.

Se os secrets de produção não estiverem completos, o workflow publica a imagem no GHCR e pula o deploy no servidor.

### Deploy gratuito da API no Koyeb

O workflow `Deploy API to Koyeb` usa o Dockerfile da API e publica o backend em uma Free Instance do Koyeb.

Configure estes secrets no GitHub:

```txt
KOYEB_API_TOKEN
PRODUCTION_DATABASE_URL
PRODUCTION_JWT_SECRET
```

Use um PostgreSQL externo no `PRODUCTION_DATABASE_URL`, como Supabase ou Neon no plano gratuito.
Depois que o Koyeb gerar a URL publica da API, configure `VITE_API_URL` no GitHub Pages com essa URL HTTPS.

## Ambiente

Copie `.env.example` para `.env` na raiz e ajuste as credenciais. Para a API, tambem crie `apps/api/.env` se preferir manter variaveis especificas no app.

## Proximos passos tecnicos

- Instalar dependencias com `npm install`.
- Configurar o PostgreSQL e atualizar `DATABASE_URL`.
- Rodar `npm run prisma:generate`.
- Rodar `npm run prisma:migrate` apos revisar o schema.
- Implementar persistencia real nas rotas que hoje estao estruturadas como base inicial.
