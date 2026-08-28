#!/usr/bin/env bash

# Read-only smoke check for the deployed Render API and Vercel applications.
# This is intentionally separate from integration-smoke.sh: Compose is for
# local dependency rehearsal, while this script checks the real host topology.

set -Eeuo pipefail

API_URL="${API_URL:-https://fanfolio-api.onrender.com}"
FAN_URL="${FAN_URL:-https://fanfolio-fan.vercel.app}"
ADMIN_URL="${ADMIN_URL:-https://fanfolio-admin-one.vercel.app}"
STUDIO_URL="${STUDIO_URL:-https://fanfolio-studio.vercel.app}"
# Render may cold-start the API for roughly a minute. Keep this check read-only
# but give the service enough time to wake up before treating it as unavailable.
CURL_MAX_TIME="${CURL_MAX_TIME:-90}"
CURL_RETRIES="${CURL_RETRIES:-1}"

trim_url() {
  local value="$1"
  printf '%s' "${value%/}"
}

API_URL="$(trim_url "$API_URL")"
FAN_URL="$(trim_url "$FAN_URL")"
ADMIN_URL="$(trim_url "$ADMIN_URL")"
STUDIO_URL="$(trim_url "$STUDIO_URL")"

check_url() {
  local label="$1"
  local url="$2"
  local status

  if ! status="$(curl --silent --show-error --location --max-time "$CURL_MAX_TIME" \
    --retry "$CURL_RETRIES" --retry-delay 2 --retry-all-errors \
    --output /dev/null --write-out '%{http_code}' "$url")"; then
    echo "FAIL $label: request failed ($url)" >&2
    return 1
  fi
  if [[ "$status" != "200" ]]; then
    echo "FAIL $label: HTTP $status ($url)" >&2
    return 1
  fi
  echo "PASS $label: HTTP 200"
}

check_api_health() {
  local label="$1"
  local url="$2"
  local response status body

  if ! response="$(curl --silent --show-error --location --max-time "$CURL_MAX_TIME" \
    --retry "$CURL_RETRIES" --retry-delay 2 --retry-all-errors \
    --write-out $'\n%{http_code}' "$url")"; then
    echo "FAIL $label: request failed ($url)" >&2
    return 1
  fi
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [[ "$status" != "200" ]]; then
    echo "FAIL $label: HTTP $status ($url)" >&2
    return 1
  fi
  if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body"; then
    echo "FAIL $label: response is not an ok health payload ($url)" >&2
    return 1
  fi
  echo "PASS $label: HTTP 200 + ok payload"
}

check_app() {
  local label="$1"
  local url="$2"
  local response status body

  if ! response="$(curl --silent --show-error --location --max-time "$CURL_MAX_TIME" \
    --retry "$CURL_RETRIES" --retry-delay 2 --retry-all-errors \
    --write-out $'\n%{http_code}' "$url")"; then
    echo "FAIL $label: request failed ($url)" >&2
    return 1
  fi
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [[ "$status" != "200" ]]; then
    echo "FAIL $label: HTTP $status ($url)" >&2
    return 1
  fi
  if ! grep -Eq 'id="(root|app)"' <<<"$body"; then
    echo "FAIL $label: HTML mount point is missing ($url)" >&2
    return 1
  fi
  echo "PASS $label: HTTP 200 + app mount"
}

echo "Checking hosted Fanfolio topology (read-only)"
check_api_health "Render health" "$API_URL/api/health"
check_api_health "Render readiness" "$API_URL/api/health/ready"
check_app "Fan app" "$FAN_URL/"
check_api_health "Fan app API proxy" "$FAN_URL/api/health"
check_app "Admin app" "$ADMIN_URL/"
check_api_health "Admin app API proxy" "$ADMIN_URL/api/health"
check_app "Studio app" "$STUDIO_URL/"
check_api_health "Studio app API proxy" "$STUDIO_URL/api/health"

echo "Hosted preflight passed"
