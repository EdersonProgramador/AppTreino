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
O deploy da API/backend para HostGator/cPanel fica em `.github/workflows/deploy-hostgator.yml`.

Para reproduzir localmente as principais checagens:

```bash
npm run prisma:generate
npm run typecheck
npm run build
```

### Deploy da API/backend na HostGator

O workflow `Deploy API to HostGator` faz:

- build da API e do pacote compartilhado no GitHub Actions;
- envio dos arquivos de produção por SSH/SCP para o cPanel;
- criação do `.env` remoto;
- instalação com `npm ci --omit=dev`;
- execução de `prisma migrate deploy`;
- restart por `touch tmp/restart.txt`, compatível com aplicações Node.js gerenciadas por Passenger/cPanel.

Configure estes secrets no GitHub:

```txt
HOSTGATOR_HOST
HOSTGATOR_USER
HOSTGATOR_SSH_KEY
HOSTGATOR_PORT
PRODUCTION_DATABASE_URL
PRODUCTION_JWT_SECRET
PRODUCTION_ASAAS_API_KEY
PRODUCTION_ASAAS_WEBHOOK_TOKEN
```

Configure estas variables no GitHub quando aplicável:

```txt
VITE_API_URL
HOSTGATOR_APP_DIR
PRODUCTION_WEB_ORIGIN
PRODUCTION_GOOGLE_CLIENT_ID
```

Para GitHub Pages, `VITE_API_URL` deve apontar para a API publica em HTTPS, por exemplo `https://api.seudominio.com`.
Para o CORS da API, `PRODUCTION_WEB_ORIGIN` deve incluir a origem do Pages: `https://edersonprogramador.github.io`.
Se precisar liberar mais de uma origem, separe por virgula, por exemplo `https://edersonprogramador.github.io,http://localhost:5173`.

No cPanel da HostGator, crie uma aplicacao Node.js apontando para a mesma pasta de `HOSTGATOR_APP_DIR`, com `app.js` como arquivo inicial.
Se `HOSTGATOR_APP_DIR` nao for configurado, o workflow usa `app-treino-api`.

## Ambiente

Copie `.env.example` para `.env` na raiz e ajuste as credenciais. Para a API, tambem crie `apps/api/.env` se preferir manter variaveis especificas no app.

## Proximos passos tecnicos

- Instalar dependencias com `npm install`.
- Configurar o PostgreSQL e atualizar `DATABASE_URL`.
- Rodar `npm run prisma:generate`.
- Rodar `npm run prisma:migrate` apos revisar o schema.
- Implementar persistencia real nas rotas que hoje estao estruturadas como base inicial.
