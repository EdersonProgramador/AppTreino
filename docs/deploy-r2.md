# Cloudflare R2 + CDN — App Treino

Armazenamento de mídia (imagens, vídeos, áudio, PDFs) fora do disco efêmero do Render.

## 1. Criar bucket R2

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2 Object Storage**
2. **Create bucket** → nome sugerido: `apptreino-media`
3. Anote o nome do bucket

## 2. API token (S3)

1. R2 → **Manage R2 API Tokens** → **Create API token**
2. Permissão: **Object Read & Write** no bucket
3. Copie:
   - Access Key ID
   - Secret Access Key
   - Account ID (no overview do R2)

## 3. URL pública (CDN)

### Opção A — domínio customizado (recomendado)

1. R2 → bucket → **Settings** → **Public access** / **Custom Domains**
2. Adicione: `media.edersonprogramador.com` (ou subdomínio desejado)
3. Cloudflare cria o DNS automaticamente se o domínio estiver na mesma conta

### Opção B — r2.dev (rápido para teste)

1. R2 → bucket → **Settings** → habilitar **Public Development URL**
2. URL tipo: `https://pub-xxxxx.r2.dev`

## 4. Variáveis de ambiente

### Render (API)

```txt
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=apptreino-media
R2_PUBLIC_URL=https://media.edersonprogramador.com
```

### Vercel (web)

```txt
VITE_MEDIA_URL=https://media.edersonprogramador.com
```

### Mobile (opcional)

```txt
EXPO_PUBLIC_MEDIA_URL=https://media.edersonprogramador.com
```

## 5. Migrar arquivos existentes

Com as variáveis R2 no `.env` local:

```bash
npm run migrate-uploads-to-r2
```

Isso envia tudo de `apps/api/uploads/` para o bucket, preservando paths (`images/...`, `lessons/...`, etc.).

## 6. Redeploy

1. Render → redeploy após salvar env vars
2. Vercel → redeploy após `VITE_MEDIA_URL`

## Comportamento

| Ambiente | Upload vai para | URL pública |
|----------|-----------------|-------------|
| Dev (sem R2) | Disco local | `/uploads/...` via proxy Vite |
| Dev (com R2) | R2 + disco local | CDN |
| Produção (com R2) | R2 | CDN (`R2_PUBLIC_URL`) |

Novos uploads passam automaticamente pelo R2 quando todas as variáveis estão configuradas.

Thumbnails (`GET /media?path=...`) continuam na API; a origem é lida do R2 quando o arquivo não está no disco local.

## CORS (obrigatório para capa de vídeo)

O seletor de capa captura frames via `<canvas>`. Vídeos servidos do R2/CDN precisam de CORS habilitado.

No bucket R2 → **Settings** → **CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://edersonprogramador.com", "https://www.edersonprogramador.com", "http://localhost:5174"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

A API também envia `Access-Control-Allow-Origin: *` em `/uploads/*` (imagens e vídeos locais).

Com domínio customizado na Cloudflare, configure CORS no bucket mesmo usando CDN — `<video crossOrigin="anonymous">` exige isso para gerar capas.
