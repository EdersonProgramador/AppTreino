# App Treino

Monorepo com web (React/Vite), API (Fastify/Prisma) e pacotes compartilhados.

## Estrutura

```txt
apps/
  web/      Landing, login, painel admin e área do aluno
  api/      API Node.js, auth, pagamentos e webhooks
  mobile/   App Expo (WebView) — login + portais aluno/admin
packages/
  shared/   Tipos e contratos compartilhados
docs/       Documentação (inclui deploy)
```

O **app mobile** abre em `/login` (produto de uso diário). A **landing de vendas** fica só no site web.

## Produção

| Camada | Serviço | Domínio |
|--------|---------|---------|
| Banco | Neon | PostgreSQL gerenciado |
| API | Render | https://api.edersonprogramador.com |
| Web | Vercel | https://edersonprogramador.com |
| DNS | HostGator | aponta os nomes acima |

Guia completo: [docs/deploy.md](docs/deploy.md).

Arquivos de infra:

- `render.yaml` — blueprint da API no Render
- `vercel.json` — build/output do frontend na Vercel

## Desenvolvimento local

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev:api
npm run dev:web
npm run dev:mobile   # Expo Go — ver apps/mobile/README.md
```

## GitHub Actions

- `.github/workflows/ci.yml` — typecheck, testes e build em pushes/PRs na `main`
- Workflows antigos de HostGator/GitHub Pages foram desativados (deploy agora é Render + Vercel)

## Ambiente

Copie `.env.example` para `.env` na raiz.

Produção (resumo):

```txt
DATABASE_URL=postgresql://...@...neon.tech/...?sslmode=require
WEB_ORIGIN=https://edersonprogramador.com,https://www.edersonprogramador.com
PUBLIC_BASE_URL=https://api.edersonprogramador.com
VITE_API_URL=https://api.edersonprogramador.com
```
