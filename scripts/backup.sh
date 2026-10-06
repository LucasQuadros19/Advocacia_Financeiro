#!/bin/sh
set -eu

: "${PGHOST:=db}"
: "${PGUSER:=financeiro}"
: "${PGDATABASE:=financeiro}"
: "${BACKUP_DIR:=/backups}"
: "${RETENTION_DAYS:=30}"

mkdir -p "$BACKUP_DIR"

ARQUIVO="$BACKUP_DIR/financeiro-$(date +%Y%m%d-%H%M%S).sql.gz"

if pg_dump --no-owner --no-privileges | gzip > "$ARQUIVO.tmp"; then
  mv "$ARQUIVO.tmp" "$ARQUIVO"
  echo "[$(date +%H:%M:%S)] backup ok: $(basename "$ARQUIVO") ($(du -h "$ARQUIVO" | cut -f1))"
else
  rm -f "$ARQUIVO.tmp"
  echo "[$(date +%H:%M:%S)] FALHA no backup" >&2
  exit 1
fi

REMOVIDOS=$(find "$BACKUP_DIR" -name 'financeiro-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
[ "$REMOVIDOS" = "0" ] || echo "  removidos $REMOVIDOS backup(s) com mais de $RETENTION_DAYS dias"
echo "  total guardado: $(find "$BACKUP_DIR" -name 'financeiro-*.sql.gz' | wc -l | tr -d ' ') arquivo(s)"
