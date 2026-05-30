#!/usr/bin/env bash
set -euo pipefail

: "${GITLAB_TOKEN:?missing GITLAB_TOKEN}"
: "${CI_API_V4_URL:?missing CI_API_V4_URL}"
: "${CI_PROJECT_ID:?missing CI_PROJECT_ID}"

publish_gitlab_page() {
  local slug="$1"
  local title="$2"
  local file="$3"
  local encoded_slug
  local status
  encoded_slug="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$slug")"
  status="$(curl --silent --output /dev/null --write-out "%{http_code}" \
    --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis/${encoded_slug}")"
  if [ "$status" = "200" ]; then
    curl --fail --silent --show-error --request PUT \
      --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
      --form "content=<${file}" \
      "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis/${encoded_slug}" >/dev/null
  elif [ "$status" = "404" ]; then
    curl --fail --silent --show-error --request POST \
      --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
      --form "title=${title}" \
      --form "content=<${file}" \
      "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/wikis" >/dev/null
  else
    echo "gitlab wiki read failed: ${slug} HTTP ${status}" >&2
    return 1
  fi
}

for file in .build/wiki/gitlab/*.md; do
  base="$(basename "$file" .md)"
  title="$base"
  if [ "$base" = "_sidebar" ]; then
    title="_sidebar"
  fi
  publish_gitlab_page "$base" "$title" "$file"
  echo "gitlab wiki page updated: ${base}"
done
