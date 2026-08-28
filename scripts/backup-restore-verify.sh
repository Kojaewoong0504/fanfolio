#!/usr/bin/env bash

# Validate a PostgreSQL custom/tar/directory backup and, when explicitly
# requested, rehearse a schema-only restore into a caller-provided isolated DB.
# This script never creates, drops, or resets a database.

set -Eeuo pipefail

BACKUP_FILE="${BACKUP_FILE:-}"
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:-}"
BACKUP_RESTORE_CONFIRM="${BACKUP_RESTORE_CONFIRM:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "DEFERRED backup verification: set BACKUP_FILE to a PostgreSQL custom/tar/directory backup"
  exit 2
fi
if [[ ! -f "$BACKUP_FILE" && ! -d "$BACKUP_FILE" ]]; then
  echo "FAIL backup verification: BACKUP_FILE does not exist" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "DEFERRED backup verification: pg_restore is not installed"
  exit 2
fi

echo "Checking PostgreSQL backup archive"
if ! pg_restore --list "$BACKUP_FILE" >/dev/null; then
  echo "FAIL backup verification: pg_restore could not read the archive" >&2
  exit 1
fi
echo "PASS backup archive is readable"

if [[ -z "$RESTORE_DATABASE_URL" ]]; then
  echo "DEFERRED restore rehearsal: set RESTORE_DATABASE_URL to an isolated database"
  exit 2
fi
if [[ "$BACKUP_RESTORE_CONFIRM" != "I_UNDERSTAND_THIS_IS_ISOLATED" ]]; then
  echo "DEFERRED restore rehearsal: set BACKUP_RESTORE_CONFIRM for an isolated target"
  exit 2
fi

# Schema-only keeps this verification non-destructive to data in the supplied
# target, while still proving that the archive can be applied by PostgreSQL.
pg_restore --exit-on-error --no-owner --no-privileges --schema-only \
  --dbname "$RESTORE_DATABASE_URL" "$BACKUP_FILE"
echo "PASS schema-only restore rehearsal"
