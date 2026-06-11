#!/usr/bin/env node
const DEFAULT_LABEL = "release-approval";
const DEFAULT_APPROVAL_JOB = "approve_public_projection";

function usage() {
  return [
    "usage: node scripts/public_approval_work_item.mjs <create|close> [--dry-run]",
    "",
    "Environment:",
    "  GITLAB_TOKEN",
    "  CI_API_V4_URL or GITLAB_URL",
    "  CI_PROJECT_ID",
    "  CI_PIPELINE_ID",
    "  CI_PIPELINE_URL",
    "  CI_COMMIT_SHA",
    "  CI_COMMIT_SHORT_SHA",
    "  GITLAB_USER_ID or APPROVAL_ASSIGNEE_ID",
    "",
    "Creates the visible approval work item through GitLab's issue API.",
  ].join("\n");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function apiBase() {
  const value = optionalEnv("CI_API_V4_URL") || `${requireEnv("GITLAB_URL").replace(/\/$/, "")}/api/v4`;
  return value.replace(/\/$/, "");
}

function headers() {
  return { "PRIVATE-TOKEN": requireEnv("GITLAB_TOKEN") };
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  if (!response.ok && response.status !== 304) {
    const body = await response.text();
    throw new Error(`GitLab API ${path} failed: ${response.status} ${body}`);
  }
  if (response.status === 204 || response.status === 304) {
    return { status: response.status, body: null };
  }
  return { status: response.status, body: await response.json() };
}

function projectId() {
  return encodeURIComponent(requireEnv("CI_PROJECT_ID"));
}

function releaseTitle() {
  return `Approve public projection for codex-hooks ${requireEnv("CI_COMMIT_SHORT_SHA")}`;
}

async function approvalJobUrl() {
  const explicit = optionalEnv("APPROVAL_JOB_URL");
  if (explicit) {
    return explicit;
  }
  const pipelineId = requireEnv("CI_PIPELINE_ID");
  const jobName = optionalEnv("APPROVAL_JOB_NAME", DEFAULT_APPROVAL_JOB);
  const { body } = await api(`/projects/${projectId()}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true`);
  const job = body.find((candidate) => candidate.name === jobName);
  return job?.web_url || requireEnv("CI_PIPELINE_URL");
}

function workItemDescription(jobUrl) {
  return [
    "Release approval is waiting for manual public projection.",
    "",
    `- GitLab release SHA: \`${requireEnv("CI_COMMIT_SHA")}\``,
    `- Pipeline: ${requireEnv("CI_PIPELINE_URL")}`,
    `- Approval job: ${jobUrl}`,
    "",
    "Approve the manual job only after the GitLab release checks are acceptable.",
    "Close this work item after GitHub and Codeberg release readback matches the GitLab release SHA.",
  ].join("\n");
}

async function findWorkItem(title) {
  const params = new URLSearchParams();
  params.set("state", "opened");
  params.set("search", title);
  const { body } = await api(`/projects/${projectId()}/issues?${params.toString()}`);
  return body.find((workItem) => workItem.title === title) || null;
}

async function createOrUpdateWorkItem({ dryRun }) {
  const title = releaseTitle();
  const jobUrl = dryRun ? optionalEnv("APPROVAL_JOB_URL", requireEnv("CI_PIPELINE_URL")) : await approvalJobUrl();
  const description = workItemDescription(jobUrl);
  const assignee = optionalEnv("APPROVAL_ASSIGNEE_ID") || optionalEnv("GITLAB_USER_ID");
  const payload = {
    title,
    description,
    labels: optionalEnv("APPROVAL_ISSUE_LABEL", DEFAULT_LABEL),
    assignee_id: assignee || null,
    approval_job_url: jobUrl,
  };
  if (dryRun) {
    console.log(JSON.stringify({ action: "create", dry_run: true, payload }, null, 2));
    return;
  }

  let workItem = await findWorkItem(title);
  if (workItem) {
    const params = new URLSearchParams();
    params.set("description", description);
    if (assignee) {
      params.set("assignee_ids[]", assignee);
    }
    const updated = await api(`/projects/${projectId()}/issues/${workItem.iid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    workItem = updated.body;
  } else {
    const params = new URLSearchParams();
    params.set("title", title);
    params.set("description", description);
    params.set("labels", payload.labels);
    if (assignee) {
      params.set("assignee_ids[]", assignee);
    }
    const created = await api(`/projects/${projectId()}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    workItem = created.body;
  }

  const todo = await api(`/projects/${projectId()}/issues/${workItem.iid}/todo`, { method: "POST" });
  console.log(JSON.stringify({
    action: "create",
    work_item_iid: workItem.iid,
    work_item_url: workItem.web_url,
    todo_status: todo.status,
  }, null, 2));
}

async function closeWorkItem({ dryRun }) {
  const title = releaseTitle();
  if (dryRun) {
    console.log(JSON.stringify({ action: "close", dry_run: true, title }, null, 2));
    return;
  }
  const workItem = await findWorkItem(title);
  if (!workItem) {
    console.log(JSON.stringify({ action: "close", state: "missing", title }, null, 2));
    return;
  }
  const params = new URLSearchParams();
  params.set("state_event", "close");
  const closed = await api(`/projects/${projectId()}/issues/${workItem.iid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  console.log(JSON.stringify({
    action: "close",
    work_item_iid: closed.body.iid,
    work_item_url: closed.body.web_url,
    state: closed.body.state,
  }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const action = args.find((arg) => !arg.startsWith("-"));
  const dryRun = args.includes("--dry-run");
  if (!["create", "close"].includes(action)) {
    console.error(usage());
    return 2;
  }
  if (action === "create") {
    await createOrUpdateWorkItem({ dryRun });
  } else {
    await closeWorkItem({ dryRun });
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
