#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only route handoff for the Epic/Feature Advisor -> readiness -> one-approval course. */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const RUNNERS = new Set(["claude", "codex", "antigravity"]);
function fail(code) { throw Object.assign(new Error(code), { code }); }

export function inspectDesignCourse({ rootDir, runner = null, read = readFileSync, runGit = execFileSync } = {}) {
  const root = resolve(rootDir ?? "");
  if (!isAbsolute(rootDir ?? "") || root !== rootDir) fail("DESIGN-COURSE-ROOT-UNSAFE");
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || realpathSync(root) !== root) fail("DESIGN-COURSE-ROOT-UNSAFE");
  if (runner !== null && !RUNNERS.has(runner)) fail("DESIGN-COURSE-RUNNER-UNSUPPORTED");
  let state;
  try {
    const path = join(root, "project", "pipeline-state.json");
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path) fail("DESIGN-COURSE-STATE-UNSAFE");
    state = JSON.parse(read(path, "utf8"));
  } catch (error) {
    if (error?.code?.startsWith("DESIGN-COURSE-")) throw error;
    fail("DESIGN-COURSE-STATE-UNAVAILABLE");
  }
  const submission = state.planSubmission;
  if (!submission || !["epic", "feature"].includes(submission.profile)) {
    return { schema: "pipeline.design-course-coordinator.v1", status: "not-applicable", root, implementationAuthority: false, nextAction: null };
  }
  let candidate;
  try {
    const git = (args) => runGit("git", args, { cwd: root, encoding: "utf8", timeout: 10_000, shell: false, stdio: ["ignore", "pipe", "pipe"] }).trim();
    candidate = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
    if (!/^[a-f0-9]{40}$/u.test(candidate.commit) || !/^[a-f0-9]{40}$/u.test(candidate.tree)) fail("DESIGN-COURSE-CANDIDATE-UNAVAILABLE");
  } catch (error) {
    if (error?.code?.startsWith("DESIGN-COURSE-")) throw error;
    fail("DESIGN-COURSE-CANDIDATE-UNAVAILABLE");
  }
  const advisor = runner === "codex"
    ? { status: "route-available", script: "scripts/design-advisory-coordinator.mjs", runner }
    : runner === null
      ? { status: "runner-required", script: null, childStarted: false, inputSubmitted: false }
      : { status: "native-initial-answer-provenance-unavailable", script: "scripts/design-advisory-coordinator.mjs", runner, childStarted: false, inputSubmitted: false, implementationAuthority: false };
  const readiness = runner === "codex"
    ? { status: "route-available", script: "scripts/codex-design-readiness-host.mjs", runner }
    : runner === null
      ? { status: "runner-required", script: null }
      : { status: "route-available", script: "scripts/runner-design-readiness-bootstrap.mjs", runner };
  const inputs = runner === null ? ["runner"] : ["authoringDispatchId", "input", "prd", "spec", "design", "traceability"];
  return {
    schema: "pipeline.design-course-coordinator.v1",
    status: runner === null ? "runner-required" : "course-inputs-required",
    root, featureId: submission.featureId, profile: submission.profile, candidate,
    advisor, readiness, poSignaturesBeforeFinalPresentation: 0,
    finalApproval: "design-workflow-package-v2-only",
    implementationAuthority: false,
    nextAction: { kind: "collect-input", inputs, mutation: false, requiresConfirmation: false,
      guidance: "Bind every supplied source to the reported candidate. Preserve typed native Advisor unavailability without fabricating an answer. Run independent readiness through the selected runner route, then assemble the exact v2 package for one final PO presentation and approval." },
  };
}

export function main(argv = process.argv.slice(2), io = console) {
  let rootDir = null; let runner = null;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--root" && typeof argv[index + 1] === "string") rootDir = argv[++index];
    else if (argv[index] === "--runner" && typeof argv[index + 1] === "string") runner = argv[++index];
    else fail("DESIGN-COURSE-CLI-USAGE");
  }
  if (rootDir === null) fail("DESIGN-COURSE-CLI-USAGE");
  const result = inspectDesignCourse({ rootDir, runner });
  io.log(JSON.stringify(result));
  return result;
}

if (isDirectInvocation(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error.code ?? "DESIGN-COURSE-ERROR"}\n`); process.exitCode = 2; }
}
