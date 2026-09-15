// SPDX-License-Identifier: SUL-1.0
/** Durable local audit records for the intentionally lower-rigor checkpoint lane. */
import { appendFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

export const CHECKPOINT_AUDIT_SCHEMA = "pipeline.feature-checkpoint-audit.v1";
const OID_RE = /^[0-9a-f]{40,64}$/iu;
const REF_RE = /^refs\/heads\/[A-Za-z0-9._/-]+$/u;
const REMOTE_RE = /^[A-Za-z0-9._-]{1,80}$/u;

function auditPath(projectDir, run) {
  const result = run("git", ["-C", projectDir, "rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 5000 });
  if (result?.status !== 0 || typeof result.stdout !== "string" || result.stdout.trim() === "") return null;
  const common = result.stdout.trim();
  const commonDir = resolve(projectDir, common);
  return join(commonDir, "agent-pipeline", "feature-checkpoint-audit.jsonl");
}

export function checkpointAuditRecord({ commit, tree, remote, destination, intent, at = new Date().toISOString() } = {}) {
  if (!OID_RE.test(commit ?? "") || !OID_RE.test(tree ?? "") || !REMOTE_RE.test(remote ?? "") || !REF_RE.test(destination ?? "")) return null;
  if (typeof intent !== "string" || intent.length < 3 || intent.length > 280 || !/^[\x20-\x7e]+$/u.test(intent)) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { schema: CHECKPOINT_AUDIT_SCHEMA, kind: "attempted", at, commit, tree, remote, destination, intent };
}

/** Appends before the network action; unavailable local audit storage fails closed. */
export function recordCheckpointPushAttempt({ projectDir, record, deps = {} } = {}) {
  const run = deps.run ?? spawnSync;
  const append = deps.appendFile ?? appendFileSync;
  const makeDir = deps.mkdir ?? mkdirSync;
  const path = auditPath(projectDir, run);
  if (!path || !record || record.schema !== CHECKPOINT_AUDIT_SCHEMA) return { ok: false, reason: "checkpoint audit path or record is invalid" };
  try {
    makeDir(dirname(path), { recursive: true, mode: 0o700 });
    append(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
    return { ok: true, path };
  } catch {
    return { ok: false, reason: "checkpoint audit record could not be persisted" };
  }
}
