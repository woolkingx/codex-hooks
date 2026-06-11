#!/usr/bin/env bash
set -euo pipefail

: "${CI_COMMIT_SHA:?missing CI_COMMIT_SHA}"

PUBLIC_EXCLUDE_PATHS=(
  ".gitlab-ci.yml"
  "scripts/public_approval_work_item.mjs"
  "scripts/publish_gitlab_wiki.sh"
  "scripts/publish_public_repos.sh"
  "scripts/publish_wikis.sh"
)

TEMP_DIRS=()
cleanup() {
  for dir in "${TEMP_DIRS[@]}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

make_temp_dir() {
  local dir
  dir="$(mktemp -d)"
  TEMP_DIRS+=("$dir")
  echo "$dir"
}

prepare_public_snapshot() {
  local source_dir
  source_dir="$(make_temp_dir)"
  git archive HEAD | tar -x -C "$source_dir"
  for path in "${PUBLIC_EXCLUDE_PATHS[@]}"; do
    rm -rf "${source_dir:?}/${path}"
  done
  echo "$source_dir"
}

assert_public_snapshot() {
  local source_dir="$1"
  local missing=0
  for path in "${PUBLIC_EXCLUDE_PATHS[@]}"; do
    if [ -e "${source_dir}/${path}" ]; then
      echo "public projection still contains excluded path: ${path}" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    return 1
  fi
}

publish_release_branch() {
  local remote_url="$1"
  local label="$2"
  local source_dir="$3"
  local work_dir
  work_dir="$(make_temp_dir)"

  git clone --branch release --single-branch "$remote_url" "$work_dir"
  find "$work_dir" -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
  cp -R "${source_dir}/." "$work_dir/"
  git -C "$work_dir" add -A
  if git -C "$work_dir" diff --cached --quiet; then
    echo "repository release unchanged: ${label} ${CI_COMMIT_SHA}"
  else
    git -C "$work_dir" commit -m "release: publish filtered public projection"
    git -C "$work_dir" push origin HEAD:release
    echo "repository release updated: ${label} ${CI_COMMIT_SHA}"
  fi
}

PUBLIC_SOURCE="$(prepare_public_snapshot)"
assert_public_snapshot "$PUBLIC_SOURCE"

if [ "${PUBLIC_PROJECTION_DRY_RUN:-0}" = "1" ]; then
  echo "public projection dry-run ok: ${CI_COMMIT_SHA}"
  for path in "${PUBLIC_EXCLUDE_PATHS[@]}"; do
    echo "excluded: ${path}"
  done
  exit 0
fi

: "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"
: "${CODEBERG_TOKEN:?missing CODEBERG_TOKEN}"

publish_release_branch "https://x-access-token:${GITHUB_TOKEN}@github.com/woolkingx/codex-hooks.git" "github" "$PUBLIC_SOURCE"
publish_release_branch "https://woolkingx:${CODEBERG_TOKEN}@codeberg.org/woolkingx/codex-hooks.git" "codeberg" "$PUBLIC_SOURCE"
