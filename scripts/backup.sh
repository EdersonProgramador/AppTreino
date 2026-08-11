#!/usr/bin/env bash
set -euo pipefail

# Backup do banco PostgreSQL do App Treino.
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/backup.sh
# ou com um arquivo .env (ex.: o .env da raiz do app):
#   ./scripts/backup.sh
#
# Gera um dump gzip em BACKUP_DIR (padrão: ./backups) com retenção configurável.
# Para agendar diariamente no cPanel (Cron Jobs):
#   cd ~/app-treino-api && DATABASE_URL=... /usr/bin/bash scripts/backup.sh >> logs/backup.log 2>&1

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não definida (exporte-a ou preencha $ENV_FILE)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERRO: pg_dump não encontrado no PATH." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="$BACKUP_DIR/app-treino_${STAMP}.sql.gz"

echo "[backup] Iniciando dump -> $OUTPUT"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUTPUT"
echo "[backup] Dump concluído ($(du -h "$OUTPUT" | cut -f1))."

DELETED=$(find "$BACKUP_DIR" -name 'app-treino_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete)
if [ -n "$DELETED" ]; then
  echo "[backup] Backup antigos removidos:"
  echo "$DELETED"
fi

echo "[backup] Backup OK: $OUTPUT"
