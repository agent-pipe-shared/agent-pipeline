// SPDX-License-Identifier: SUL-1.0
/** Durable local audit records for the intentionally lower-rigor checkpoint lane. */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
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

export function checkpointAuditRecord({ commit, tree, remote, destination, intent, stalenessDebt = [], at = new Date().toISOString() } = {}) {
  if (!OID_RE.test(commit ?? "") || !OID_RE.test(tree ?? "") || !REMOTE_RE.test(remote ?? "") || !REF_RE.test(destination ?? "")) return null;
  if (typeof intent !== "string" || intent.length < 3 || intent.length > 280 || !/^[\x20-\x7e]+$/u.test(intent)) return null;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  if (!Array.isArray(stalenessDebt) || stalenessDebt.some((entry) => entry?.type !== "architecture-map-stale" || !entry?.target || !entry?.contract)) return null;
  return { schema: CHECKPOINT_AUDIT_SCHEMA, kind: "attempted", at, commit, tree, remote, destination, intent, stalenessDebt };
}

/** Reads unresolved checkpoint map debts from the local Git common directory. */
export function readCheckpointArchitectureDebt({ projectDir, deps = {} } = {}) {
  const run = deps.run ?? spawnSync;
  const read = deps.readFile ?? readFileSync;
  const path = auditPath(projectDir, run);
  if (!path) return { ok: false, debt: [], reason: "checkpoint audit path is unavailable" };
  let raw;
  try { raw = read(path, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return { ok: true, debt: [], resolvedDebt: [], rawDebt: [] };
    return { ok: false, debt: [], reason: "checkpoint audit cannot be read" };
  }
  const head = run("git", ["-C", projectDir, "rev-parse", "--verify", "HEAD^{commit}"], { encoding: "utf8", timeout: 5000 });
  if (head?.status !== 0 || !OID_RE.test(head.stdout?.trim() ?? "")) return { ok: false, debt: [], reason: "current commit is unavailable" };
  const debt = [];
  const resolvedDebt = [];
  const rawDebt = [];
  for (const line of raw.split("\n").filter(Boolean)) {
    let record;
    try { record = JSON.parse(line); } catch { return { ok: false, debt: [], reason: "checkpoint audit is malformed" }; }
    if (record?.schema !== CHECKPOINT_AUDIT_SCHEMA || record?.kind !== "attempted") continue;
    if (!Array.isArray(record.stalenessDebt) || record.stalenessDebt.length === 0) continue;
    if (!OID_RE.test(record.commit ?? "") || !OID_RE.test(record.tree ?? "")) return { ok: false, debt: [], reason: "checkpoint debt binding is invalid" };
    const ancestry = run("git", ["-C", projectDir, "merge-base", "--is-ancestor", record.commit, head.stdout.trim()], { encoding: "utf8", timeout: 5000 });
    if (ancestry?.status === 1) continue;
    if (ancestry?.status !== 0) return { ok: false, debt: [], reason: "checkpoint debt ancestry cannot be checked" };
    rawDebt.push(record);
    const unresolved = [];
    const resolvedEntries = [];
    for (const entry of record.stalenessDebt) {
      if (entry?.type !== "architecture-map-stale" || typeof entry.target !== "string" || !/^architecture\/map\/[A-Za-z0-9._-]+\.md$/u.test(entry.target)
        || typeof entry.contract !== "string" || !/^[A-Za-z0-9._/-]+$/u.test(entry.contract) || entry.contract.includes("..")) return { ok: false, debt: [], reason: "checkpoint debt entry is invalid" };
      const updated = run("git", ["-C", projectDir, "log", "-1", "--format=%H", `${record.commit}..HEAD`, "--", entry.target, "architecture/map/index.md"], { encoding: "utf8", timeout: 5000 });
      const mapCommit = updated?.status === 0 ? updated.stdout?.trim() : null;
      if (!mapCommit) { unresolved.push(entry); continue; }
      if (!OID_RE.test(mapCommit)) return { ok: false, debt: [], reason: "checkpoint map history cannot be checked" };
      resolvedEntries.push(entry);
    }
    if (unresolved.length) debt.push({ ...record, stalenessDebt: unresolved });
    if (resolvedEntries.length) resolvedDebt.push({ ...record, stalenessDebt: resolvedEntries });
  }
  return { ok: true, debt, resolvedDebt, rawDebt };
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
