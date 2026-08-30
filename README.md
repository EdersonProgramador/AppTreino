# ATLLY — Human Performance System

Monorepo da **ATLLY** (web, API, mobile): plataforma de performance humana — treino, corrida, dados, evolução e comunidade de atletas.

## Estrutura

```txt
apps/
  web/      Landing, login, admin CMS e App Treino Social (Feed + treino…)
  api/      API Fastify/Prisma (social, outdoor, commerce, treinos)
  mobile/   App Expo nativo (mesmo modelo)
  social/   Apenas referência do zip rede-social (não é o produto)
packages/
  shared/
docs/
```

## Desenvolvimento local

```bash
npm install
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

Mobile: `npm start --workspace=apps/mobile`
