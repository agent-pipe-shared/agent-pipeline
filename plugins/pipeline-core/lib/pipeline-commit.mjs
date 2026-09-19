// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { normalizeDispatchRecordPath, validateDispatchRecord } from "./dispatch-record.mjs";

const TYPE = /^[a-z][a-z0-9-]{0,31}$/u; const SCOPE = /^[a-z0-9][a-z0-9._/-]{0,63}$/u;
function git(root, args, timeoutMs) { return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: timeoutMs }); }
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
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
  const stagedResult = git(root, ["diff", "--cached", "--name-only", "-z"], timeoutMs); if (stagedResult.status !== 0) fail("PC-GIT", "could not inspect staged snapshot"); const staged = stagedResult.stdout.split("\0").filter(Boolean); if (staged.length === 0) fail("PC-EMPTY-STAGE", "no staged changes");
  const headResult = git(root, ["rev-parse", "--verify", "HEAD^{commit}"], timeoutMs); if (headResult.status !== 0) fail("PC-GIT", "could not resolve repository HEAD"); const baseCommit = headResult.stdout.trim();
  const head = git(root, ["diff", "--cached", "--raw"], timeoutMs).stdout; const snapshotSha256 = createHash("sha256").update(head).digest("hex"); const record = loadDispatchRecord(root, dispatchRecord);
  if (record.record.candidateCommit !== baseCommit) fail("PC-DISPATCH-STALE", "dispatch record does not bind the current repository HEAD");
  const trailer = dispatch(record.record.taskId, recordRole(record.record.agentType));
  const full = `${type}(${scope}): ${message.trim()}\n\n${trailer}\nAI-Assisted: true\n`; const findings = [...commitTypeFindings(`${type}(${scope}): ${message.trim()}`).findings, ...finishedCommitMessageFindings(full, { requireMarker: true, requireDispatch: true }).findings]; if (findings.length) fail("PC-MESSAGE", findings.map((finding) => finding.code).join("; "));
  const preview = { schema: "pipeline.commit-preview.v1", root, stagedSnapshotSha256: snapshotSha256, paths: staged, dispatch: { taskId: record.record.taskId, role: recordRole(record.record.agentType), recordPath: record.path, recordSha256: record.sha256, candidateCommit: baseCommit }, message: full, status: "preview" }; if (!execute) return preview;
  const before = head; const dir = mkdtempSync(join(tmpdir(), "pipeline-commit-")); const file = join(dir, "message.txt"); try { if (git(root, ["rev-parse", "--verify", "HEAD^{commit}"], timeoutMs).stdout.trim() !== baseCommit) fail("PC-HEAD-CHANGED", "repository HEAD changed before commit"); if (git(root, ["diff", "--cached", "--raw"], timeoutMs).stdout !== before) fail("PC-STAGED-CHANGED", "staged snapshot changed before commit"); writeFileSync(file, full, { flag: "wx", mode: 0o600 }); const result = git(root, ["commit", "--file", file], timeoutMs); if (result.status !== 0) fail("PC-COMMIT", (result.stderr || "git commit failed").slice(0, 512)); return { ...preview, status: "committed", commit: git(root, ["rev-parse", "HEAD"], timeoutMs).stdout.trim() }; } finally { rmSync(dir, { recursive: true, force: true }); }
}
