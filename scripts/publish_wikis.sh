#!/usr/bin/env bash
set -euo pipefail

: "${GITLAB_TOKEN:?missing GITLAB_TOKEN}"
: "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"
: "${CODEBERG_TOKEN:?missing CODEBERG_TOKEN}"
: "${CI_API_V4_URL:?missing CI_API_V4_URL}"
: "${CI_PROJECT_ID:?missing CI_PROJECT_ID}"

publish_gitlab_page() {
  local slug="$1"
  local title="$2"
  local file="$3"
  local encoded_slug
  encoded_slug="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$slug")"
  if curl --fail --silent --show-error \
    --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis/${encoded_slug}" >/dev/null; then
    curl --fail --silent --show-error --request PUT \
      --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
      --form "content=<${file}" \
      "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis/${encoded_slug}" >/dev/null
  else
    curl --fail --silent --show-error --request POST \
      --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
      --form "title=${title}" \
      --form "content=<${file}" \
      "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis" >/dev/null
  fi
}

publish_git_wiki() {
  local remote_url="$1"
  local source_dir="$2"
  local label="$3"
  local work_dir
  work_dir="$(mktemp -d)"
  git clone "$remote_url" "$work_dir"
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

publish_gitlab_page "home" "home" ".build/wiki/gitlab/home.md"
publish_gitlab_page "_sidebar" "_sidebar" ".build/wiki/gitlab/_sidebar.md"
publish_git_wiki "https://x-access-token:${GITHUB_TOKEN}@github.com/woolkingx/codex-hooks.wiki.git" ".build/wiki/github" "github"
publish_git_wiki "https://woolkingx:${CODEBERG_TOKEN}@codeberg.org/woolkingx/codex-hooks.wiki.git" ".build/wiki/codeberg" "codeberg"
