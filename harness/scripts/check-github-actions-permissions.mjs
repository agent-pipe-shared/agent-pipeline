#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";

export const SCHEMA = "pipeline.github-actions-permissions.v1";
const SCOPES = new Set(["actions", "attestations", "checks", "contents", "deployments", "id-token", "issues", "discussions", "models", "packages", "pages", "pull-requests", "repository-projects", "security-events", "statuses"]);
const ID = /^[A-Za-z_][A-Za-z0-9_-]*$/u;
const PATH = /^\.github\/workflows\/[^/]+\.(?:yml|yaml)$/u;
const err = (code, detail) => detail ? { code, detail } : { code };

function dateValid(value, today) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value && value >= today;
}
function exactKeys(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }

export function validatePolicy(policy, today) {
  const errors = [];
  if (!exactKeys(policy, ["schema", "jobWriteExceptions", "checkoutCredentialExceptions"]) || policy.schema !== SCHEMA || !Array.isArray(policy.jobWriteExceptions) || !Array.isArray(policy.checkoutCredentialExceptions)) return [err("POLICY_SCHEMA_INVALID")];
  const seen = new Set();
  for (const [kind, entries, keys] of [["JOB", policy.jobWriteExceptions, ["workflow", "job", "permissions", "justification", "owner", "expires"]], ["CHECKOUT", policy.checkoutCredentialExceptions, ["workflow", "job", "justification", "owner", "expires"]]]) {
    for (const entry of entries) {
      if (!exactKeys(entry, keys)) { errors.push(err(`${kind}_ENTRY_KEYS_INVALID`)); continue; }
      if (!PATH.test(entry.workflow) || !ID.test(entry.job) || typeof entry.justification !== "string" || entry.justification.length === 0 || typeof entry.owner !== "string" || entry.owner.length === 0 || !dateValid(entry.expires, today)) errors.push(err(`${kind}_ENTRY_FIELDS_INVALID`, `${entry.workflow ?? ""}/${entry.job ?? ""}`));
      if (kind === "JOB" && (!Array.isArray(entry.permissions) || entry.permissions.length === 0 || [...entry.permissions].sort().join("\0") !== entry.permissions.join("\0") || new Set(entry.permissions).size !== entry.permissions.length || entry.permissions.some((p) => !SCOPES.has(p)))) errors.push(err("JOB_ENTRY_PERMISSIONS_INVALID", `${entry.workflow ?? ""}/${entry.job ?? ""}`));
      const key = `${kind}\0${entry.workflow}\0${entry.job}`;
      if (seen.has(key)) errors.push(err("POLICY_DUPLICATE_ENTRY", key));
      seen.add(key);
    }
  }
  return errors;
}

function permissionFindings(workflow, path, policy, hasPullRequest) {
  const findings = [];
  const rootPerm = workflow.permissions;
  const jobs = workflow.jobs && typeof workflow.jobs === "object" && !Array.isArray(workflow.jobs) ? workflow.jobs : null;
  if (!jobs) findings.push(err("JOBS_MISSING", path));
  if (rootPerm === "write-all" || rootPerm === "read-all") findings.push(err("ROOT_PERMISSION_BROAD", path));
  if (rootPerm === undefined && jobs && Object.values(jobs).some((job) => job?.permissions === undefined)) findings.push(err("PERMISSIONS_MISSING", path));
  if (rootPerm && typeof rootPerm === "object") for (const [scope, value] of Object.entries(rootPerm)) {
    if (!SCOPES.has(scope) || !["read", "write", "none"].includes(value)) findings.push(err("ROOT_PERMISSION_INVALID", `${path}:${scope}`));
    if (value === "write") findings.push(err("ROOT_PERMISSION_WRITE", `${path}:${scope}`));
  }
  const jobExceptions = new Map(policy.jobWriteExceptions.map((e) => [`${e.workflow}\0${e.job}`, e]));
  const checkoutExceptions = new Map(policy.checkoutCredentialExceptions.map((e) => [`${e.workflow}\0${e.job}`, e]));
  for (const [jobId, job] of Object.entries(jobs ?? {})) {
    if (!ID.test(jobId)) findings.push(err("JOB_ID_INVALID", `${path}:${jobId}`));
    const perms = job?.permissions;
    const jobException = jobExceptions.get(`${path}\0${jobId}`);
    if (perms === "write-all" || perms === "read-all") findings.push(err("JOB_PERMISSION_BROAD", `${path}:${jobId}`));
    if (perms && typeof perms === "object") for (const [scope, value] of Object.entries(perms)) {
      if (!SCOPES.has(scope) || !["read", "write", "none"].includes(value)) findings.push(err("JOB_PERMISSION_INVALID", `${path}:${jobId}:${scope}`));
      if (value === "write") {
        const ex = jobException;
        if (!ex || hasPullRequest || ex.permissions.length !== Object.entries(perms).filter(([, v]) => v === "write").length || ex.permissions.some((p) => perms[p] !== "write")) findings.push(err(hasPullRequest ? "PR_JOB_WRITE_FORBIDDEN" : "JOB_WRITE_UNEXPLAINED", `${path}:${jobId}`));
      }
    }
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    let checkoutSeen = false;
    let checkoutExceptionUsed = false;
    for (const step of steps) if (typeof step?.uses === "string" && /^actions\/checkout@/u.test(step.uses)) {
      checkoutSeen = true;
      const persisted = step.with?.["persist-credentials"];
      const ex = checkoutExceptions.get(`${path}\0${jobId}`);
      if (ex && persisted !== false) checkoutExceptionUsed = true;
      if (persisted !== false && (!ex || hasPullRequest)) findings.push(err(hasPullRequest ? "PR_CHECKOUT_CREDENTIALS_FORBIDDEN" : "CHECKOUT_CREDENTIALS_UNEXPLAINED", `${path}:${jobId}`));
    }
    if (jobException && !(perms && typeof perms === "object" && Object.values(perms).includes("write"))) findings.push(err("UNUSED_POLICY_ENTRY", `JOB\0${path}\0${jobId}`));
    const checkoutException = checkoutExceptions.get(`${path}\0${jobId}`);
    if (checkoutException && (!checkoutSeen || !checkoutExceptionUsed)) findings.push(err("UNUSED_POLICY_ENTRY", `CHECKOUT\0${path}\0${jobId}`));
  }
  for (const [key] of jobExceptions) if (key.startsWith(`${path}\0`) && (!jobs || !Object.hasOwn(jobs, key.slice(path.length + 1))) ) findings.push(err("UNUSED_POLICY_ENTRY", `JOB\0${key}`));
  for (const [key] of checkoutExceptions) if (key.startsWith(`${path}\0`) && (!jobs || !Object.hasOwn(jobs, key.slice(path.length + 1))) ) findings.push(err("UNUSED_POLICY_ENTRY", `CHECKOUT\0${key}`));
  return findings;
}

function parseWorkflow(text) {
  // yaml-lite intentionally rejects block scalars; workflow commands are irrelevant to
  // this gate, so replace their body with a harmless scalar while retaining structure.
  const lines = text.split(/\r?\n/u);
  const out = [];
  let skipIndent = null;
  for (const line of lines) {
    const indent = (line.match(/^ */u) ?? [""])[0].length;
    if (skipIndent !== null) {
      if (line.trim() === "" || indent > skipIndent) continue;
      skipIndent = null;
    }
    const m = line.match(/^( *)([^:#]+:\s*)>[>-]?\s*(?:#.*)?$/u);
    if (m) { out.push(`${m[1]}${m[2]}"__BLOCK_SCALAR__"`); skipIndent = m[1].length; continue; }
    out.push(line);
  }
  return parseYaml(out.join("\n"));
}

export function checkRepository(root, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const policyPath = join(root, "governance/github-actions-permissions.json");
  let policy;
  try { policy = JSON.parse(readFileSync(policyPath, "utf8")); } catch { return [err("POLICY_MISSING_OR_INVALID")]; }
  errors.push(...validatePolicy(policy, today));
  const dir = join(root, ".github/workflows");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(?:yml|yaml)$/u.test(f)).sort() : [];
  for (const file of files) {
    const path = `.github/workflows/${file}`;
    try {
      const workflow = parseWorkflow(readFileSync(join(dir, file), "utf8"));
      errors.push(...permissionFindings(workflow, path, policy, workflow?.on?.pull_request !== undefined));
    } catch (e) { errors.push(err("WORKFLOW_YAML_INVALID", `${path}:${e.message}`)); }
  }
  for (const e of policy.jobWriteExceptions) if (!files.includes(basename(e.workflow))) { errors.push(err("UNUSED_POLICY_ENTRY", `JOB\0${e.workflow}\0${e.job}`)); }
  for (const e of policy.checkoutCredentialExceptions) if (!files.includes(basename(e.workflow))) { errors.push(err("UNUSED_POLICY_ENTRY", `CHECKOUT\0${e.workflow}\0${e.job}`)); }
  return errors.sort((a, b) => `${a.code}:${a.detail ?? ""}`.localeCompare(`${b.code}:${b.detail ?? ""}`));
}

export function runCli(argv = process.argv.slice(2), io = {}) {
  const rootIndex = argv.indexOf("--root"); const dateIndex = argv.indexOf("--date");
  if ((rootIndex >= 0 && (!argv[rootIndex + 1] || rootIndex !== argv.lastIndexOf("--root"))) || (dateIndex >= 0 && (!argv[dateIndex + 1] || dateIndex !== argv.lastIndexOf("--date")))) return 2;
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  const today = dateIndex >= 0 ? argv[dateIndex + 1] : new Date().toISOString().slice(0, 10);
  const findings = checkRepository(resolve(root), today);
  (io.stdout ?? process.stdout).write(`${JSON.stringify({ schema: SCHEMA, ok: findings.length === 0, findings }, null, 2)}\n`);
  return findings.length === 0 ? 0 : 1;
}
if (process.argv[1] && process.argv[1].endsWith("check-github-actions-permissions.mjs")) process.exitCode = runCli();
