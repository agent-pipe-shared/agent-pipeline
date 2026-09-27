// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { normalizeDispatchRecordPath, validateDispatchRecord } from "./dispatch-record.mjs";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";

const TYPE = /^[a-z][a-z0-9-]{0,31}$/u; const SCOPE = /^[a-z0-9][a-z0-9._/-]{0,63}$/u;
function git(root, args, timeoutMs) {
  // A caller's GIT_INDEX_FILE/GIT_DIR/work-tree overrides must not redirect
  // the staged snapshot or commit away from the pinned repository root.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: timeoutMs, env });
}
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function checkedGit(root, args, timeoutMs) {
  const result = git(root, args, timeoutMs);
  if (!isSuccessfulSpawn(result) || typeof result.stdout !== "string") fail("PC-GIT", "could not inspect the repository snapshot");
  return result.stdout;
}
function dispatch(task, role) { return `Dispatch: ${task} (${role})`; }
function physicalRoot(root) {
  const absolute = resolve(root); let info;
  try { info = lstatSync(absolute); } catch { fail("PC-GIT", "repository root is unreadable"); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("PC-GIT", "repository root must be a physical directory");
  try { return realpathSync(absolute); } catch { fail("PC-GIT", "repository root is unreadable"); }
}
function inside(root, target) { const path = relative(root, target); return path !== "" && path !== ".." && !path.startsWith(`..${"/"}`) && !path.startsWith("..\\"); }
function recordRole(agentType) {
  if (agentType === "goldfish-implementor") return "goldfish";
  if (agentType === "critic") return "critic";
  if (agentType === "elephant") return "elephant";
  fail("PC-DISPATCH", "dispatch record agent type cannot author a pipeline commit");
}
function loadDispatchRecord(root, recordPath) {
  let normalized;
  try { normalized = normalizeDispatchRecordPath(recordPath, "dispatch record path"); } catch { fail("PC-DISPATCH", "dispatch record path must be repository-relative and normalized"); }
  const absolute = resolve(root, normalized); const parent = dirname(absolute);
  let parentReal; let parentInfo; let info;
  try { parentInfo = lstatSync(parent); parentReal = realpathSync(parent); info = lstatSync(absolute); } catch { fail("PC-DISPATCH", "dispatch record is unreadable"); }
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || !inside(root, parentReal) || !info.isFile() || info.isSymbolicLink()) fail("PC-DISPATCH", "dispatch record must be a physical repository-local file");
  let bytes; let record;
  try { bytes = readFileSync(absolute); record = JSON.parse(bytes.toString("utf8")); } catch { fail("PC-DISPATCH", "dispatch record is unreadable"); }
  try { record = validateDispatchRecord(record); } catch { fail("PC-DISPATCH", "dispatch record is invalid"); }
  const expected = `evidence/dispatch-record-${record.taskId}.json`;
  if (normalized !== expected) fail("PC-DISPATCH", "dispatch record is not at its canonical evidence path");
  return { record, path: normalized, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function commitPipeline({ root = process.cwd(), type, scope, message, dispatchRecord = null, execute = false, timeoutMs = 30_000, ...legacyAttribution } = {}) {
  root = physicalRoot(root); if (!TYPE.test(type ?? "") || !SCOPE.test(scope ?? "") || typeof message !== "string" || message.trim() === "" || message.includes("\0")) fail("PC-INPUT", "type, scope and message are invalid");
  if (Object.hasOwn(legacyAttribution, "dispatchTask") || Object.hasOwn(legacyAttribution, "dispatchRole")) fail("PC-DISPATCH", "caller-supplied dispatch attribution is forbidden");
  if (typeof dispatchRecord !== "string") fail("PC-DISPATCH", "a canonical validated dispatch record is required");
  // A canonical opening record proves neither that this is the current live
  // dispatch nor that its exclusive terminal path can later be published.
  // The productive Agy flow commits from host-held admission after Final Return.
  // A standalone CLI must never convert a caller-selected record to Git truth.
  if (execute) fail("PC-HOST-CONTEXT", "standalone commit execution has no live host dispatch binding");
  const staged = checkedGit(root, ["diff", "--cached", "--name-only", "-z"], timeoutMs).split("\0").filter(Boolean); if (staged.length === 0) fail("PC-EMPTY-STAGE", "no staged changes");
  const baseCommit = checkedGit(root, ["rev-parse", "--verify", "HEAD^{commit}"], timeoutMs).trim();
  const head = checkedGit(root, ["diff", "--cached", "--raw"], timeoutMs); const snapshotSha256 = createHash("sha256").update(head).digest("hex"); const record = loadDispatchRecord(root, dispatchRecord);
  if (record.record.candidateCommit !== baseCommit) fail("PC-DISPATCH-STALE", "dispatch record does not bind the current repository HEAD");
  const trailer = dispatch(record.record.taskId, recordRole(record.record.agentType));
  const full = `${type}(${scope}): ${message.trim()}\n\n${trailer}\nAI-Assisted: true\n`; const findings = [...commitTypeFindings(`${type}(${scope}): ${message.trim()}`).findings, ...finishedCommitMessageFindings(full, { requireMarker: true, requireDispatch: true }).findings]; if (findings.length) fail("PC-MESSAGE", findings.map((finding) => finding.code).join("; "));
  return { schema: "pipeline.commit-preview.v1", root, stagedSnapshotSha256: snapshotSha256, paths: staged, dispatch: { taskId: record.record.taskId, role: recordRole(record.record.agentType), recordPath: record.path, recordSha256: record.sha256, candidateCommit: baseCommit }, message: full, status: "preview" };
}
