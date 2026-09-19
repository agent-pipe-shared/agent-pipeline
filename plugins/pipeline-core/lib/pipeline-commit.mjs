// SPDX-License-Identifier: SUL-1.0
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { commitTypeFindings, finishedCommitMessageFindings } from "./commit-message-policy.mjs";
import { validateDispatchRecord } from "./dispatch-record.mjs";

const TYPE = /^[a-z][a-z0-9-]{0,31}$/u; const SCOPE = /^[a-z0-9][a-z0-9._/-]{0,63}$/u;
function git(root, args, timeoutMs) { return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: timeoutMs }); }
function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
function dispatch(task, role) { if (typeof task !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(task) || !["elephant", "goldfish", "critic"].includes(role)) fail("PC-DISPATCH", "validated dispatch identity is required"); return `Dispatch: ${task} (${role})`; }
export function commitPipeline({ root = process.cwd(), type, scope, message, dispatchRecord = null, dispatchTask = null, dispatchRole = null, execute = false, timeoutMs = 30_000 } = {}) {
  root = resolve(root); if (!TYPE.test(type ?? "") || !SCOPE.test(scope ?? "") || typeof message !== "string" || message.trim() === "" || message.includes("\0")) fail("PC-INPUT", "type, scope and message are invalid");
  const status = git(root, ["status", "--porcelain=v1"], timeoutMs); if (status.status !== 0) fail("PC-GIT", "could not inspect staged snapshot"); const staged = status.stdout.split("\n").filter((line) => line.startsWith("A ") || line.startsWith("M ") || line.startsWith("D ") || line.startsWith("R ")); if (staged.length === 0) fail("PC-EMPTY-STAGE", "no staged changes");
  const head = git(root, ["diff", "--cached", "--raw"], timeoutMs).stdout; const trailer = dispatchRecord ? (() => { let record; try { record = JSON.parse(readFileSync(resolve(dispatchRecord), "utf8")); } catch { fail("PC-DISPATCH", "dispatch record is unreadable"); } try { validateDispatchRecord(record); } catch { fail("PC-DISPATCH", "dispatch record is invalid"); } return dispatch(record.taskId, record.agentType === "goldfish-implementor" ? "goldfish" : record.agentType === "critic" ? "critic" : "elephant"); })() : dispatch(dispatchTask, dispatchRole);
  const full = `${type}(${scope}): ${message.trim()}\n\n${trailer}\nAI-Assisted: true\n`; const findings = [...commitTypeFindings(`${type}(${scope}): ${message.trim()}`).findings, ...finishedCommitMessageFindings(full, { requireMarker: true, requireDispatch: true }).findings]; if (findings.length) fail("PC-MESSAGE", findings.map((finding) => finding.code).join("; "));
  const preview = { schema: "pipeline.commit-preview.v1", root, stagedSnapshotSha256: Buffer.from(head).toString("base64url"), paths: staged, message: full, status: "preview" }; if (!execute) return preview;
  const before = head; const dir = mkdtempSync(join(tmpdir(), "pipeline-commit-")); const file = join(dir, "message.txt"); try { if (git(root, ["diff", "--cached", "--raw"], timeoutMs).stdout !== before) fail("PC-STAGED-CHANGED", "staged snapshot changed before commit"); writeFileSync(file, full, { flag: "wx", mode: 0o600 }); const result = git(root, ["commit", "--file", file], timeoutMs); if (result.status !== 0) fail("PC-COMMIT", (result.stderr || "git commit failed").slice(0, 512)); return { ...preview, status: "committed", commit: git(root, ["rev-parse", "HEAD"], timeoutMs).stdout.trim() }; } finally { rmSync(dir, { recursive: true, force: true }); }
}
