#!/usr/bin/env bash
set -euo pipefail

# Vercel Ignore Build Step contract: exit 0 to skip a deployment, exit 1 to build.
# Git-connected projects should build only the production branch.
ref="${VERCEL_GIT_COMMIT_REF:-}"

if [[ "$ref" == "main" || "$ref" == "refs/heads/main" ]]; then
  exit 1
fi

exit 0

