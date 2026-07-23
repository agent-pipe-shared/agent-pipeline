#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Measure Phase-2.6's explicitly declared operational hot-head budgets. */
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_ROOT, loadLifecycleMetadata, CANONICAL_HUMAN_STATE_PATH, CANONICAL_MACHINE_STATE_PATH } from "./check-artifact-lifecycle.mjs";

export const MAX_NORMAL_BOOTSTRAP_BYTES = 15360;
export const MAX_OPERATIONAL_HEAD_BYTES = 8192;
export const CANONICAL_NORMAL_BOOTSTRAP_PATHS = Object.freeze([CANONICAL_HUMAN_STATE_PATH, CANONICAL_MACHINE_STATE_PATH]);

function safeRelativePath(root, value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("\\")) return null;
  const candidate = resolve(root, value);
  const rel = relative(root, candidate);
  return !rel.startsWith("..") && !rel.startsWith("/") ? rel : null;
}

function byteSize(root, path, findings, label) {
  const safe = safeRelativePath(root, path);
  if (!safe) {
    findings.push(`${label} must be a repository-relative path`);
    return null;
  }
  try {
    if (!statSync(join(root, safe)).isFile()) throw new Error("not-file");
    return { path: safe, bytes: Buffer.byteLength(readFileSync(join(root, safe), "utf8"), "utf8") };
  } catch {
    findings.push(`${label} is missing or unreadable`);
    return null;
  }
}

export function checkStateBudgets(root = DEFAULT_ROOT, resultPath) {
  const loaded = loadLifecycleMetadata(root, resultPath);
  const findings = [...loaded.findings];
  const metadata = loaded.metadata;
  if (!metadata) return { ok: false, findings, measurements: null };
  const status = metadata.status;
  const budgets = metadata.budgets;
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    findings.push("artifactLifecycle.budgets is required");
    return { ok: false, findings, measurements: null };
  }
  if (budgets.normalBootstrapMaxBytes !== MAX_NORMAL_BOOTSTRAP_BYTES) findings.push(`normalBootstrapMaxBytes must equal ${MAX_NORMAL_BOOTSTRAP_BYTES}`);
  if (budgets.operationalHeadMaxBytes !== MAX_OPERATIONAL_HEAD_BYTES) findings.push(`operationalHeadMaxBytes must equal ${MAX_OPERATIONAL_HEAD_BYTES}`);
  if (!Array.isArray(budgets.bootstrapPaths) || budgets.bootstrapPaths.length === 0) findings.push("budgets.bootstrapPaths must be a non-empty array");
  const bootstrapPaths = Array.isArray(budgets.bootstrapPaths) ? budgets.bootstrapPaths : [];
  const unique = new Set(bootstrapPaths);
  if (unique.size !== bootstrapPaths.length) findings.push("budgets.bootstrapPaths must not contain duplicates");
  if (!status || typeof status !== "object") findings.push("artifactLifecycle.status is required for budget measurement");
  if (bootstrapPaths.length !== CANONICAL_NORMAL_BOOTSTRAP_PATHS.length
    || !CANONICAL_NORMAL_BOOTSTRAP_PATHS.every((path, index) => bootstrapPaths[index] === path)) {
    findings.push("budgets.bootstrapPaths must equal the canonical normal bootstrap set");
  }
  if (status && (status.humanStatePath !== CANONICAL_HUMAN_STATE_PATH || status.machineStatePath !== CANONICAL_MACHINE_STATE_PATH)) {
    findings.push("status must name the canonical human and machine operational state heads");
  }

  const human = byteSize(root, CANONICAL_HUMAN_STATE_PATH, findings, "canonical human state head");
  const machine = byteSize(root, CANONICAL_MACHINE_STATE_PATH, findings, "canonical machine state head");
  const bootstrap = CANONICAL_NORMAL_BOOTSTRAP_PATHS.map((path, index) => byteSize(root, path, findings, `canonicalBootstrapPaths[${index}]`)).filter(Boolean);
  const bootstrapBytes = bootstrap.reduce((sum, entry) => sum + entry.bytes, 0);
  if (human && human.bytes > MAX_OPERATIONAL_HEAD_BYTES) findings.push(`human state head is ${human.bytes} bytes (max ${MAX_OPERATIONAL_HEAD_BYTES})`);
  if (machine && machine.bytes > MAX_OPERATIONAL_HEAD_BYTES) findings.push(`machine state head is ${machine.bytes} bytes (max ${MAX_OPERATIONAL_HEAD_BYTES})`);
  if (bootstrapBytes > MAX_NORMAL_BOOTSTRAP_BYTES) findings.push(`normal bootstrap is ${bootstrapBytes} bytes (max ${MAX_NORMAL_BOOTSTRAP_BYTES})`);

  const archives = Array.isArray(budgets.archivePaths) ? budgets.archivePaths : [];
  if (archives.length === 0) findings.push("budgets.archivePaths must preserve at least one non-canonical archive path");
  for (const [index, path] of archives.entries()) {
    const archive = byteSize(root, path, findings, `archivePaths[${index}]`);
    if (archive && unique.has(archive.path)) findings.push("an archive must not be loaded in the normal bootstrap set");
    if (archive && [human?.path, machine?.path].includes(archive.path)) findings.push("an archive must not replace a current operational state head");
  }
  const protectedPaths = Array.isArray(budgets.protectedPaths) ? budgets.protectedPaths : [];
  for (const required of ["harness/scripts/verify.mjs", "plugins/pipeline-core/hooks/guard-push.mjs"]) {
    if (!protectedPaths.includes(required)) findings.push(`budgets.protectedPaths must retain ${required}`);
  }
  for (const [index, path] of protectedPaths.entries()) byteSize(root, path, findings, `protectedPaths[${index}]`);
  return { ok: findings.length === 0, findings, measurements: { human, machine, bootstrap, bootstrapBytes } };
}

function resultArg(argv) {
  const index = argv.indexOf("--result");
  return index === -1 ? null : argv[index + 1] ?? null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const resultPath = resultArg(process.argv.slice(2));
  if (!resultPath) {
    console.log("SKIP state budgets: no --result metadata supplied (explicit rigor-1/2 opt-in only).");
    process.exit(0);
  }
  const checked = checkStateBudgets(DEFAULT_ROOT, resultPath);
  if (!checked.ok) {
    for (const finding of checked.findings) console.error(`FAIL state budgets: ${finding}`);
    process.exit(2);
  }
  const { human, machine, bootstrapBytes } = checked.measurements;
  console.log(`State budgets valid: human=${human.bytes}, machine=${machine.bytes}, bootstrap=${bootstrapBytes} bytes.`);
}
