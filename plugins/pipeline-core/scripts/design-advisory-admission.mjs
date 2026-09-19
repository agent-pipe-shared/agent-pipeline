#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Runner-neutral writer for the durable initial-design Advisor admission.
 *
 * The runner transport must first persist its sanitized receipt at the exact
 * private receipt location returned by its dispatch setup.  This command then
 * performs the only public projection write and immediately proves it against
 * the matching private transaction.  Editing the public JSON is never a
 * substitute for this command.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { DESIGN_ADVISORY_RECORD_PATH } from "../lib/design-advisory-enforcement.mjs";
import { DESIGN_ADVISORY_RECEIPT_DIRECTORY, readDesignAdvisoryTransaction, writeDesignAdvisoryTransaction } from "../lib/design-advisory-transaction.mjs";
import { hasExactDesignAdvisorFinalApproval } from "../lib/design-advisory-final-approval.mjs";
import { resolveProjectAuthorityPaths, LEGACY_STATE, NEUTRAL_STATE } from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]+$/u;
const USAGE = "usage: design-advisory-admission.mjs <plan|apply|inspect> --repo-root <path> --feature <id> --plan <repo-path> --spec <repo-path> [--receipt-id <id> --native-available <true|false> --decision <accept|decline> --rationale-file <repo-path> --expected-public-sha256 <absent|sha256>]";

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function safePath(value, label) { if (typeof value !== "string" || !PATH.test(value)) fail("DAA-CLI-PATH", `${label} is not a normalized repository path`); return value; }
function rootPath(root, path, label) { const base = resolve(root); const rel = safePath(path, label); const target = resolve(base, rel); if (!target.startsWith(`${base}/`)) fail("DAA-CLI-PATH", `${label} escapes repository root`); return target; }
function gitCommonDir(root) {
  const result = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8", timeout: 5000, shell: false });
  const relative = result.status === 0 ? String(result.stdout).trim() : "";
  if (!relative) fail("DAA-CLI-GIT", "repository git common directory is unavailable");
  return resolve(root, relative);
}
function readState(root) {
  let path = null;
  try { const authority = resolveProjectAuthorityPaths({ rootDir: root }); if (authority.status === "ready") path = authority.state; } catch { /* fall through */ }
  for (const candidate of [path, existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : null, LEGACY_STATE]) {
    if (typeof candidate !== "string") continue;
    try { return JSON.parse(readFileSync(rootPath(root, candidate, "state"), "utf8")); } catch { /* next authority tier */ }
  }
  return null;
}
function receiptForException(common, receiptId) {
  const target = join(common, DESIGN_ADVISORY_RECEIPT_DIRECTORY, `${receiptId}.json`);
  try { return JSON.parse(readFileSync(target, "utf8")); } catch { return null; }
}
function currentPublicSha(root) {
  const target = join(root, DESIGN_ADVISORY_RECORD_PATH);
  try { return sha(readFileSync(target)); } catch { return null; }
}
function parsed(argv) {
  const [command, ...rest] = argv;
  if (!["plan", "apply", "inspect"].includes(command)) fail("DAA-CLI-USAGE", USAGE);
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]; const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || Object.hasOwn(values, key)) fail("DAA-CLI-USAGE", USAGE);
    values[key] = value;
  }
  const base = ["--repo-root", "--feature", "--plan", "--spec"];
  if (base.some((key) => !values[key])) fail("DAA-CLI-USAGE", USAGE);
  if (command === "apply" && ["--receipt-id", "--native-available", "--expected-public-sha256"].some((key) => !Object.hasOwn(values, key))) fail("DAA-CLI-USAGE", USAGE);
  return { command, values };
}
function finalApproval(root, common, values) {
  const receipt = receiptForException(common, values["--receipt-id"]);
  if (receipt?.observed?.status === "answered") return false;
  const plan = rootPath(root, values["--plan"], "plan");
  const spec = rootPath(root, values["--spec"], "spec");
  const state = readState(root);
  try {
    return hasExactDesignAdvisorFinalApproval({
      state, projectDir: root, featureId: values["--feature"], planPath: values["--plan"], specPath: values["--spec"],
      planSha256: sha(readFileSync(plan)), specSha256: sha(readFileSync(spec)),
      candidateCommit: receipt?.dispatch?.candidateCommit, candidateTree: receipt?.dispatch?.candidateTree,
    });
  } catch { return false; }
}
function disposition(root, values) {
  const decision = values["--decision"];
  const rationaleFile = values["--rationale-file"];
  if (decision === undefined && rationaleFile === undefined) return null;
  if (!["accept", "decline"].includes(decision) || !rationaleFile) fail("DAA-CLI-DISPOSITION", "answered Advisor admission needs --decision and --rationale-file");
  const rationale = readFileSync(rootPath(root, rationaleFile, "rationale-file"), "utf8");
  if (rationale.trim() === "" || rationale.length > 16 * 1024) fail("DAA-CLI-DISPOSITION", "rationale file is empty or oversized");
  return { decision, rationale };
}

export function runDesignAdvisoryAdmission(argv = process.argv.slice(2)) {
  const { command, values } = parsed(argv);
  const root = resolve(values["--repo-root"]);
  safePath(values["--plan"], "plan"); safePath(values["--spec"], "spec");
  if (!ID.test(values["--feature"] ?? "")) fail("DAA-CLI-FEATURE", "feature id is invalid");
  const common = gitCommonDir(root);
  if (command === "plan") {
    return { schema: "pipeline.design-advisory-admission-plan.v1", target: DESIGN_ADVISORY_RECORD_PATH, currentPublicSha256: currentPublicSha(root), receiptDirectory: join(common, DESIGN_ADVISORY_RECEIPT_DIRECTORY), apply: "supply an observed private receipt id, native capability, and exact public preimage" };
  }
  if (command === "inspect") {
    const finalApprovalValid = false;
    const result = readDesignAdvisoryTransaction({ repoRoot: root, gitCommonDir: common, featureId: values["--feature"], planPath: values["--plan"], specPath: values["--spec"], finalApprovalValid });
    return { schema: "pipeline.design-advisory-admission-inspect.v1", status: "valid", id: result.id, mode: result.mode, target: DESIGN_ADVISORY_RECORD_PATH };
  }
  if (!ID.test(values["--receipt-id"] ?? "")) fail("DAA-CLI-RECEIPT", "receipt id is invalid");
  if (!["true", "false"].includes(values["--native-available"])) fail("DAA-CLI-NATIVE", "native capability must be true or false");
  const expected = values["--expected-public-sha256"] === "absent" ? null : values["--expected-public-sha256"];
  if (expected !== null && !SHA256.test(expected)) fail("DAA-CLI-CAS", "expected public digest must be absent or sha256");
  const finalApprovalValid = finalApproval(root, common, values);
  const result = writeDesignAdvisoryTransaction({
    repoRoot: root, gitCommonDir: common, featureId: values["--feature"], planPath: values["--plan"], specPath: values["--spec"],
    receiptId: values["--receipt-id"], nativeAvailable: values["--native-available"] === "true", disposition: disposition(root, values), finalApprovalValid, expectedPublicSha256: expected,
  });
  const check = readDesignAdvisoryTransaction({ repoRoot: root, gitCommonDir: common, featureId: values["--feature"], planPath: values["--plan"], specPath: values["--spec"], finalApprovalValid });
  return { ...result, readback: { id: check.id, mode: check.mode } };
}

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runDesignAdvisoryAdmission())}\n`); }
  catch (error) { process.stderr.write(`DESIGN-ADVISORY-ADMISSION-FAILED: ${error.code ?? "error"}: ${error.message}\n`); process.exitCode = 2; }
}
