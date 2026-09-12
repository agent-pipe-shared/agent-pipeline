#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Public CI attribution for a Verify run that is already red.
 *
 * This is a declassification boundary. It never publishes suite output,
 * receipt fields, run identifiers, exception messages, or filesystem paths.
 * Public records use a closed allow-list; a private log is referenced only by
 * the SHA-256 digest of its exact bytes.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifySuiteArtifactName } from "../../plugins/pipeline-core/scripts/verify-journal.mjs";

export { verifySuiteArtifactName };

export const PUBLIC_FAILURE_SCHEMA = "pipeline.verify-public-failure.v1";
export const PUBLIC_NOTICE_SCHEMA = "pipeline.verify-public-notice.v1";
export const REDACTION_MARKER = "[REDACTED-UNCLASSIFIED]";
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export const MAX_PRIVATE_LOG_BYTES = 64 * 1024 * 1024;
export const MAX_PUBLIC_FAILURES = 512;

const SUITE_NAME = /^[a-z0-9][a-z0-9._-]{0,159}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const line = (value) => JSON.stringify(value);

function notice(code, extra = {}) {
  return line({ schema: PUBLIC_NOTICE_SCHEMA, kind: "reporter-notice", code, ...extra });
}

function safeRegularFile(path, maxBytes = Number.MAX_SAFE_INTEGER) {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size >= 0 && stat.size <= maxBytes
      && realpathSync(path) === resolve(path);
  } catch { return false; }
}

function safeDirectory(path) {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === resolve(path);
  } catch { return false; }
}

function safeFailingSteps(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || evidence.schema !== "pipeline.verify-evidence.v0" || !Array.isArray(evidence.steps)) return null;
  const rows = [];
  for (const [index, step] of evidence.steps.entries()) {
    if (!step || typeof step !== "object" || Array.isArray(step)
      || typeof step.name !== "string" || !SUITE_NAME.test(step.name)
      || !Number.isSafeInteger(step.exitCode) || step.exitCode < 0 || step.exitCode > 255) return null;
    if (step.exitCode !== 0) rows.push({ index, name: step.name, exitCode: step.exitCode });
  }
  return rows;
}

function privateLogReference({ runsRoot, runId, suiteName }) {
  if (!RUN_ID.test(runId ?? "") || runId === "." || runId === ".." || !safeDirectory(runsRoot)) {
    return { availability: "unavailable" };
  }
  const runDir = join(runsRoot, runId);
  if (!safeDirectory(runDir)) return { availability: "unavailable" };
  const artifact = verifySuiteArtifactName(suiteName);
  if (!SHA256.test(artifact)) return { availability: "unavailable" };
  const receiptPath = join(runDir, "receipts", `${artifact}.json`);
  if (!safeRegularFile(receiptPath, 1024 * 1024)) return { availability: "unavailable" };

  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptPath, "utf8")); }
  catch { return { availability: "invalid" }; }
  const expectedLogPath = `logs/${artifact}.log`;
  if (receipt?.log?.path !== expectedLogPath) return { availability: "invalid" };
  const logPath = join(runDir, "logs", `${artifact}.log`);
  if (!safeRegularFile(logPath, MAX_PRIVATE_LOG_BYTES)) return { availability: "unavailable" };
  try {
    const bytes = readFileSync(logPath);
    return { availability: "available", referenceKind: "sha256", sha256: sha256(bytes) };
  } catch { return { availability: "unavailable" }; }
}

/** Build closed-schema public records. This function never emits private free text. */
export function buildFailureReport({ evidencePath, runsRoot }) {
  if (!safeRegularFile(evidencePath, MAX_EVIDENCE_BYTES)) {
    return { lines: [notice("PVF-EVIDENCE-UNAVAILABLE")], complete: false };
  }
  let evidence;
  try { evidence = JSON.parse(readFileSync(evidencePath, "utf8")); }
  catch { return { lines: [notice("PVF-EVIDENCE-INVALID")], complete: false }; }

  const failing = safeFailingSteps(evidence);
  if (failing === null) return { lines: [notice("PVF-EVIDENCE-SHAPE")], complete: false };
  if (failing.length === 0) {
    return { lines: [notice("PVF-NO-FAILURES", { status: "complete", failingSuites: 0 })], complete: true };
  }

  const runId = evidence.verifyRun && typeof evidence.verifyRun.runId === "string"
    ? evidence.verifyRun.runId
    : null;
  const selected = failing.slice(0, MAX_PUBLIC_FAILURES);
  const lines = selected.map((step) => line({
    schema: PUBLIC_FAILURE_SCHEMA,
    kind: "verify-suite",
    suite: step.name,
    status: "failed",
    exitCode: step.exitCode,
    attribution: { source: "verify-evidence", stepIndex: step.index },
    privateEvidence: privateLogReference({ runsRoot, runId, suiteName: step.name }),
    detail: REDACTION_MARKER,
  }));
  if (selected.length !== failing.length) {
    lines.push(notice("PVF-FAILURE-LIMIT", { status: "incomplete", reported: selected.length, withheld: failing.length - selected.length }));
  }
  return { lines, complete: selected.length === failing.length };
}

export function resolveGitPaths() {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], {
    encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "ignore"], timeout: 5_000,
  });
  if (result.error || result.status !== 0 || result.stdout.trim() === "") return null;
  const [repoRoot, gitCommonDir, ...extra] = result.stdout.trim().split(/\r?\n/u);
  if (!repoRoot || !gitCommonDir || extra.length !== 0) return null;
  return { gitCommonDir, repoRoot };
}

/** Reporter failures are disclosed by a fixed marker and never become a second gate. */
export function runFailureReporter({ resolvePaths = resolveGitPaths, build = buildFailureReport } = {}) {
  try {
    const paths = resolvePaths();
    if (paths === null) return { lines: [notice("PVF-GIT-UNAVAILABLE")], exitCode: 0, complete: false };
    const result = build({
      evidencePath: join(paths.repoRoot, "evidence", "verify-latest.json"),
      runsRoot: join(paths.gitCommonDir, "agent-pipeline", "verify", "runs"),
    });
    return { ...result, exitCode: 0 };
  } catch {
    return { lines: [notice("PVF-REPORTER-FAILED", { status: "incomplete", detail: REDACTION_MARKER })], exitCode: 0, complete: false };
  }
}

const isDirectInvocation = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  const result = runFailureReporter();
  process.stdout.write(`${result.lines.join("\n")}\n`);
  process.exit(0);
}
