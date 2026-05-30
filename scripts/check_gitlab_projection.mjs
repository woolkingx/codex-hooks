#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const project = process.env.GITLAB_PROJECT || "wx/codex-hooks";
const baseUrl = process.env.GITLAB_URL;
const token = process.env.GITLAB_TOKEN;
const checkPublicShas = process.argv.includes("--check-public-shas");

if (!baseUrl) {
  throw new Error("missing GITLAB_URL");
}
if (!token) {
  throw new Error("missing GITLAB_TOKEN");
}

function projectPath(value) {
  return /^\d+$/.test(value) ? value : encodeURIComponent(value);
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value.replace(/\/\/[^@/]+@/, "//");
  }
}

async function api(path) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": token },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitLab API ${path} failed: ${response.status} ${body}`);
  }
  return response.json();
}

function lsRemoteRelease(url) {
  const result = spawnSync("git", ["ls-remote", "--heads", url, "release"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() };
  }
  const line = result.stdout.trim();
  if (!line) {
    return { ok: false, error: "missing release branch" };
  }
  return { ok: true, sha: line.split(/\s+/)[0] };
}

const prefix = `/projects/${projectPath(project)}`;
const [info, releaseBranch, protectedBranches, mirrors] = await Promise.all([
  api(prefix),
  api(`${prefix}/repository/branches/release`),
  api(`${prefix}/protected_branches`),
  api(`${prefix}/remote_mirrors`),
]);

const releaseProtected = protectedBranches.some((branch) => branch.name === "release");
const enabledMirrors = mirrors.filter((mirror) => mirror.enabled);
const mirrorsOnlyProtected = enabledMirrors.every((mirror) => mirror.only_protected_branches === true);
const mirrorsDisabled = enabledMirrors.length === 0;
const mirrorReport = enabledMirrors.map((mirror) => ({
  id: mirror.id,
  url: sanitizeUrl(mirror.url),
  only_protected_branches: mirror.only_protected_branches,
  update_status: mirror.update_status,
  last_error: mirror.last_error,
}));

let publicBranchReadback = [];
if (checkPublicShas) {
  publicBranchReadback = mirrorReport.map((mirror) => {
    const readback = lsRemoteRelease(mirror.url);
    return {
      url: mirror.url,
      release_sha: readback.sha || null,
      matches_gitlab_release: readback.sha === releaseBranch.commit.id,
      error: readback.error || null,
    };
  });
}

const report = {
  project: info.path_with_namespace,
  project_id: info.id,
  gitlab_release_sha: releaseBranch.commit.id,
  release_protected: releaseProtected,
  mirrors_disabled: mirrorsDisabled,
  mirrors_only_protected: mirrorsOnlyProtected,
  mirrors: mirrorReport,
  public_branch_readback: publicBranchReadback,
};

console.log(JSON.stringify(report, null, 2));

const mirrorErrors = mirrorReport.filter((mirror) => mirror.last_error);
const publicMismatch = publicBranchReadback.filter((readback) => !readback.matches_gitlab_release);
if (!releaseProtected || !mirrorsDisabled || !mirrorsOnlyProtected || mirrorErrors.length > 0 || publicMismatch.length > 0) {
  process.exit(1);
}
