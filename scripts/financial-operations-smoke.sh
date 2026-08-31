#!/usr/bin/env bash

# Authenticated, read-only financial operations smoke check.
# Required: ADMIN_BASE_URL and ADMIN_SESSION_COOKIE from the operator's secret store.

set -Eeuo pipefail

: "${ADMIN_BASE_URL:?Set ADMIN_BASE_URL to the hosted API base URL}"
: "${ADMIN_SESSION_COOKIE:?Set ADMIN_SESSION_COOKIE to a short-lived admin session cookie}"

base="${ADMIN_BASE_URL%/}"
cookie="fanfolio_session=${ADMIN_SESSION_COOKIE}"

check_json() {
  local label="$1"
  local path="$2"
  local body
  body="$(curl --fail --silent --show-error --location --max-time "${CURL_MAX_TIME:-90}" \
    -H "Cookie: ${cookie}" "${base}${path}")"
  if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body"; then
    echo "FAIL ${label}: response is not an ok payload" >&2
    return 1
  fi
  echo "PASS ${label}"
}

check_json "point balance integrity" "/api/admin/integrity/points"
check_json "operations overview" "/api/admin/operations/overview"
check_json "ownership integrity" "/api/admin/integrity/ownership"
echo "Financial operations smoke passed"
