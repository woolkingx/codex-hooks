#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"
: "${CODEBERG_TOKEN:?missing CODEBERG_TOKEN}"

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

publish_git_wiki() {
  local remote_url="$1"
  local source_dir="$2"
  local label="$3"
  local work_dir
  local clone_log
  work_dir="$(make_temp_dir)"
  clone_log="$(make_temp_dir)/clone.log"
  if ! git clone "$remote_url" "$work_dir" 2>"$clone_log"; then
    if grep -Eqi "not found|wiki is disabled" "$clone_log" && [ "${PUBLIC_WIKI_REQUIRED:-0}" != "1" ]; then
      echo "wiki skipped: ${label} remote missing"
      return 0
    fi
    cat "$clone_log" >&2
    return 1
  fi
  find "$work_dir" -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
  cp -R "${source_dir}/." "$work_dir/"
  git -C "$work_dir" add -A
  if git -C "$work_dir" diff --cached --quiet; then
    echo "wiki unchanged: ${label}"
  else
    git -C "$work_dir" commit -m "docs: update handbook wiki projection"
    git -C "$work_dir" push origin HEAD:master
    echo "wiki updated: ${label}"
  fi
}

publish_git_wiki "https://x-access-token:${GITHUB_TOKEN}@github.com/woolkingx/codex-hooks.wiki.git" ".build/wiki/github" "github"
publish_git_wiki "https://woolkingx:${CODEBERG_TOKEN}@codeberg.org/woolkingx/codex-hooks.wiki.git" ".build/wiki/codeberg" "codeberg"
