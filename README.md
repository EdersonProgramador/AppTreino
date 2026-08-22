# App Treino Social

Monorepo do **App Treino Social** (web, API, mobile): rede social de atletas focada em treino e corrida, no mesmo stack (Vite + Fastify + Expo). O shell do aluno virou produto social Feed-first (`student-app-header`, bottom nav Feed/Clube/Atividade/Treino/Menu) — sem segundo app.

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
