#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"
: "${CODEBERG_TOKEN:?missing CODEBERG_TOKEN}"
: "${CI_COMMIT_SHA:?missing CI_COMMIT_SHA}"

publish_release_branch() {
  local remote_url="$1"
  local label="$2"
  local work_dir
  work_dir="$(mktemp -d)"
  git clone --branch release --depth 1 "$remote_url" "$work_dir"
  git -C "$work_dir" fetch origin "${CI_COMMIT_SHA}"
  git -C "$work_dir" update-ref refs/heads/release "${CI_COMMIT_SHA}"
  git -C "$work_dir" push origin release:release
  echo "repository release updated: ${label} ${CI_COMMIT_SHA}"
}

publish_release_branch "https://x-access-token:${GITHUB_TOKEN}@github.com/woolkingx/codex-hooks.git" "github"
publish_release_branch "https://woolkingx:${CODEBERG_TOKEN}@codeberg.org/woolkingx/codex-hooks.git" "codeberg"
