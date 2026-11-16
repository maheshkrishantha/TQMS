#!/bin/sh
set -eu

backup_dir=${1:-./backups}
retention_days=${2:-30}
env_file=${3:-.env.production}

case "$backup_dir" in
  ""|"/"|"."|"..")
    echo "Choose a dedicated backup directory." >&2
    exit 2
    ;;
esac
case "$retention_days" in
  ""|*[!0-9]*)
    echo "Retention days must be a positive whole number." >&2
    exit 2
    ;;
esac
if [ "$retention_days" -lt 1 ]; then
  echo "Retention days must be at least 1." >&2
  exit 2
fi
if [ ! -f "$env_file" ]; then
  echo "Compose environment file not found: $env_file" >&2
  exit 2
fi

mkdir -p "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/tqms-$timestamp.dump"
temporary_file="$backup_file.tmp"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

docker compose --env-file "$env_file" -f docker-compose.production.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$temporary_file"
test -s "$temporary_file"
mv "$temporary_file" "$backup_file"
find "$backup_dir" -type f -name 'tqms-*.dump' -mtime "+$retention_days" -exec rm -- {} \;
echo "Database backup created: $backup_file"
