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

## Ambiente

Copie `.env.example` para `.env` na raiz e ajuste as credenciais. Para a API, tambem crie `apps/api/.env` se preferir manter variaveis especificas no app.

## Proximos passos tecnicos

- Instalar dependencias com `npm install`.
- Configurar o MySQL e atualizar `DATABASE_URL`.
- Rodar `npm run prisma:generate`.
- Rodar `npm run prisma:migrate` apos revisar o schema.
- Implementar persistencia real nas rotas que hoje estao estruturadas como base inicial.
