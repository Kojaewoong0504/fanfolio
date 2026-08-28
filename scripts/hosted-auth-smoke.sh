#!/usr/bin/env bash

# Credential-gated, read-only smoke check for the deployed application stack.
# Credentials must be supplied by the caller (for example Render/Vercel secrets).
# This script deliberately uses curl only; it is an API contract smoke check.

set -Eeuo pipefail

API_URL="${API_URL:-https://fanfolio-api.onrender.com}"
CURL_MAX_TIME="${CURL_MAX_TIME:-90}"
HOSTED_SMOKE_REQUIRED="${HOSTED_SMOKE_REQUIRED:-0}"

trim_url() {
  local value="$1"
  printf '%s' "${value%/}"
}

API_URL="$(trim_url "$API_URL")"

missing=()
for variable in FAN_EMAIL FAN_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD ARTIST_USERNAME ARTIST_PASSWORD; do
  if [[ -z "${!variable:-}" ]]; then
    missing+=("$variable")
  fi
done

if ((${#missing[@]} > 0)); then
  if [[ "$HOSTED_SMOKE_REQUIRED" == "1" ]]; then
    echo "FAIL hosted auth smoke: missing credential variables: ${missing[*]}" >&2
    exit 1
  fi
  echo "DEFERRED hosted auth smoke: provide ${missing[*]} through the environment"
  exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/fanfolio-hosted-auth.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT

login() {
  local label="$1"
  local endpoint="$2"
  local client="$3"
  local payload="$4"
  local token_file="$5"
  local response_file="$temp_dir/${label}.json"
  local status

  if ! status="$(printf '%s' "$payload" | curl --silent --show-error --location \
    --max-time "$CURL_MAX_TIME" \
    --header 'Content-Type: application/json' \
    --header "X-Fanfolio-Client: $client" \
    --data-binary @- --output "$response_file" --write-out '%{http_code}' \
    "$API_URL$endpoint")"; then
    echo "FAIL $label login: request failed" >&2
    return 1
  fi
  if [[ "$status" != "200" ]]; then
    echo "FAIL $label login: HTTP $status" >&2
    return 1
  fi

  if ! python3 - "$response_file" "$token_file" <<'PY'
import json
import pathlib
import sys

response_path = pathlib.Path(sys.argv[1])
token_path = pathlib.Path(sys.argv[2])
try:
    payload = json.loads(response_path.read_text())
    token = payload["data"]["accessToken"]
except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
    print(f"invalid login response: {error}", file=sys.stderr)
    raise SystemExit(1)
if not isinstance(token, str) or not token:
    print("invalid login response: access token is empty", file=sys.stderr)
    raise SystemExit(1)
token_path.write_text(token)
PY
  then
    echo "FAIL $label login: response did not contain an access token" >&2
    return 1
  fi
  echo "PASS $label login"
}

authenticated_get() {
  local label="$1"
  local endpoint="$2"
  local client="$3"
  local token_file="$4"
  local status

  if ! status="$(curl --silent --show-error --location --max-time "$CURL_MAX_TIME" \
    --header "X-Fanfolio-Client: $client" \
    --header "Authorization: Bearer $(<"$token_file")" \
    --output /dev/null --write-out '%{http_code}' \
    "$API_URL$endpoint")"; then
    echo "FAIL $label: request failed" >&2
    return 1
  fi
  if [[ "$status" != "200" ]]; then
    echo "FAIL $label: HTTP $status" >&2
    return 1
  fi
  echo "PASS $label"
}

echo "Checking hosted authenticated contracts (read-only)"
login "fan" \
  "/api/auth/fan/login" "fan" \
  "$(python3 - <<'PY'
import json
import os
print(json.dumps({"email": os.environ["FAN_EMAIL"], "password": os.environ["FAN_PASSWORD"]}))
PY
)" "$temp_dir/fan.token"
authenticated_get "fan profile" "/api/me" "fan" "$temp_dir/fan.token"
authenticated_get "fan progression" "/api/me/progression" "fan" "$temp_dir/fan.token"

login "admin" \
  "/api/auth/admin/login" "admin" \
  "$(python3 - <<'PY'
import json
import os
print(json.dumps({"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}))
PY
)" "$temp_dir/admin.token"
authenticated_get "admin context" "/api/admin/me" "admin" "$temp_dir/admin.token"

login "artist" \
  "/api/auth/artist/login" "artist" \
  "$(python3 - <<'PY'
import json
import os
print(json.dumps({"username": os.environ["ARTIST_USERNAME"], "password": os.environ["ARTIST_PASSWORD"]}))
PY
)" "$temp_dir/artist.token"
authenticated_get "artist profile" "/api/artist/profile" "artist" "$temp_dir/artist.token"

echo "Hosted authenticated smoke passed"
