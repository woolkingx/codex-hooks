#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"
: "${CODEBERG_TOKEN:?missing CODEBERG_TOKEN}"
: "${CI_COMMIT_SHA:?missing CI_COMMIT_SHA}"

publish_release_branch() {
  local remote_url="$1"
  local label="$2"
  git push "$remote_url" HEAD:release
  echo "repository release updated: ${label} ${CI_COMMIT_SHA}"
}

publish_release_branch "https://x-access-token:${GITHUB_TOKEN}@github.com/woolkingx/codex-hooks.git" "github"
publish_release_branch "https://woolkingx:${CODEBERG_TOKEN}@codeberg.org/woolkingx/codex-hooks.git" "codeberg"
