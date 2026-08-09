# 🐳 Guia Docker - App Treino

Este guia explica como configurar e rodar o projeto usando Docker.

## 📋 Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) (versão 20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (versão 2.0+)

## 🚀 Configuração Rápida

### 1. Copiar arquivo de ambiente

```bash
cp .env.docker .env
```

### 2. Editar variáveis de ambiente

Edite o arquivo `.env` e configure:

- **DB_PASSWORD**: Senha do banco de dados (mude em produção!)
- **JWT_SECRET**: Segredo para JWT (use um valor aleatório forte)
- **ASAAS_API_KEY**: Sua chave de API do Asaas (opcional para testes)
- **ASAAS_WEBHOOK_TOKEN**: Token do webhook do Asaas (opcional)

## 🔧 Comandos Disponíveis

### Subir todos os serviços (API + Banco)

```bash
docker compose up -d
```

### Subir com frontend web também

```bash
docker compose --profile with-frontend up -d
```

### Ver logs em tempo real

```bash
docker compose logs -f
```

### Ver logs apenas da API

```bash
docker compose logs -f api
```

### Parar todos os serviços

```bash
docker compose down
```

### Parar e remover volumes (cuidado: apaga dados do banco!)

```bash
docker compose down -v
```

### Rodar migrações manualmente

```bash
docker compose exec api npx prisma migrate deploy
```

### Popular banco com dados iniciais (seed)

```bash
docker compose exec api npx prisma db seed
```

### Acessar terminal do container da API

```bash
docker compose exec api sh
```

### Acessar banco de dados via psql

```bash
docker compose exec db psql -U app_treino -d app_treino
```

## 🌐 Serviços Disponíveis

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **API** | `http://localhost:3000` | Backend Fastify |
| **Health Check** | `http://localhost:3000/health` | Status da API |
| **Web (opcional)** | `http://localhost:5173` | Frontend React |
| **PostgreSQL** | `localhost:5432` | Banco de dados |

## 📁 Volumes Persistentes

- `postgres_data`: Dados do PostgreSQL (persiste entre reinicializações)
- `api_uploads`: Arquivos de upload da API (avatars, imagens, etc.)

## 🔍 Troubleshooting

### API não inicia

Verifique se o banco está saudável:

```bash
docker compose ps
docker compose logs db
```

### Erro de migração do Prisma

Rode as migrações manualmente:

```bash
docker compose exec api npx prisma migrate deploy
```

### Reset completo do ambiente

```bash
docker compose down -v
docker compose up -d
```

## 🏗️ Arquitetura Docker

```
┌─────────────────┐     ┌─────────────────┐
│   API (Fastify) │────▶│  PostgreSQL DB  │
│   Port: 3000    │     │   Port: 5432    │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Uploads Volume │
└─────────────────┘
```

## 🔐 Segurança em Produção

Antes de deploy em produção:

1. ✅ Mude todas as senhas padrão
2. ✅ Use um JWT_SECRET forte (gerar com `openssl rand -hex 32`)
3. ✅ Configure ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN
4. ✅ Remova portas expostas desnecessárias
5. ✅ Use redes privadas para comunicação interna
6. ✅ Configure backups automáticos do volume `postgres_data`

## 📝 Exemplo de JWT_SECRET forte

```bash
# Gerar segredo forte
openssl rand -hex 32
```

Resultado exemplo: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

## 🎯 Próximos Passos

Após rodar com Docker:

1. Acesse `http://localhost:3000/health` para verificar a API
2. Rode o seed para popular dados iniciais
3. Acesse o frontend (se estiver rodando com profile)
4. Comece a desenvolver!

---

**Dica**: Para desenvolvimento local sem Docker, consulte o `README.md` principal.
