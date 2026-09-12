#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA } from "../../plugins/pipeline-core/lib/governance-verification-action.mjs";
import { planVerifySelection } from "../../plugins/pipeline-core/lib/verify-selection.mjs";

const MODES = new Set(["work", "critic", "push", "candidate", "release"]);

export function parseVerifyInvocation(argv = [], environment = {}) {
  let mode = environment.PIPELINE_VERIFY_MODE ?? "work";
  let base = environment.PIPELINE_VERIFY_BASE || null;
  let eventOutPath = environment.PIPELINE_VERIFY_EVENT_OUT || null;
  let reuseReceipts = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") mode = argv[++index];
    else if (argument?.startsWith("--mode=")) mode = argument.slice(7);
    else if (argument === "--base") base = argv[++index];
    else if (argument?.startsWith("--base=")) base = argument.slice(7);
    else if (argument === "--event-out") eventOutPath = argv[++index];
    else if (argument?.startsWith("--event-out=")) eventOutPath = argument.slice(12);
    else if (argument === "--no-reuse") reuseReceipts = false;
    else throw new Error(`VERIFY-ARGUMENT: unsupported argument ${JSON.stringify(argument)}`);
  }
  if (!MODES.has(mode)
    || (base !== null && (typeof base !== "string" || base === ""))
    || (eventOutPath !== null && (typeof eventOutPath !== "string" || eventOutPath === ""))) throw new Error("VERIFY-ARGUMENT");
  return Object.freeze({ mode, base, eventOutPath, reuseReceipts });
}

export function renderVerifyCommand(invocation) {
  return `node harness/scripts/verify.mjs --mode ${invocation.mode}${invocation.base === null ? "" : ` --base ${invocation.base}`}${invocation.eventOutPath == null ? "" : ` --event-out ${invocation.eventOutPath}`}${invocation.reuseReceipts === false ? " --no-reuse" : ""}`;
}

export function buildSelfVerifyGovernanceSource({ evidence, startedCandidate, finishedCandidate, overallExitCode }) {
  const stableExactCandidate = new Set(["clean", "approval-pending"]).has(startedCandidate?.status)
    && finishedCandidate?.status === startedCandidate.status
    && typeof startedCandidate.commit === "string" && typeof startedCandidate.tree === "string"
    && finishedCandidate.commit === startedCandidate.commit && finishedCandidate.tree === startedCandidate.tree;
  if (!stableExactCandidate || !Number.isSafeInteger(overallExitCode)) return null;
  const terminalBytes = `${JSON.stringify(evidence, null, 2)}\n`;
  return Object.freeze({
    schema: GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA,
    terminalEvidenceSha256: createHash("sha256").update(terminalBytes).digest("hex"),
    outcome: overallExitCode === 0 ? "passed" : "failed",
    candidate: Object.freeze({ commit: startedCandidate.commit, tree: startedCandidate.tree }),
    featureId: Object.freeze({ state: "not-applicable" }),
    sessionId: Object.freeze({ state: "not-applicable" }),
  });
}

function gitText(repoRoot, args, spawn) {
  const result = spawn("git", args, { encoding: "utf8", cwd: repoRoot, shell: false });
  return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : null;
}

export function resolveSelfVerifySelection({ repoRoot, candidateCommit, registeredSuites, invocation, spawn = spawnSync }) {
  const ids = registeredSuites.map((suite) => suite.name);
  let baseCommit = invocation.base === null ? null : gitText(repoRoot, ["rev-parse", "--verify", `${invocation.base}^{commit}`], spawn);
  if (baseCommit === null && invocation.mode === "work") baseCommit = gitText(repoRoot, ["rev-parse", "--verify", "HEAD^1"], spawn);
  let changedPaths = null;
  let forceFullReason = null;
  if (baseCommit !== null && candidateCommit !== null) {
    const ancestor = baseCommit !== candidateCommit
      && spawn("git", ["merge-base", "--is-ancestor", baseCommit, candidateCommit], { encoding: "utf8", cwd: repoRoot, shell: false }).status === 0;
    if (!ancestor) forceFullReason = "invalid-base";
    else {
      const diff = spawn("git", ["diff", "--name-only", "-z", baseCommit, candidateCommit, "--"], { encoding: "utf8", cwd: repoRoot, shell: false });
      if (diff.status === 0) changedPaths = diff.stdout.split("\0").filter(Boolean);
    }
  }
  const baseline = ids.filter((id) => /(?:verify-selection|verify-suite-registration|doc-contract|artifact-lifecycle|backlog-state|validate-manifest|security-scan)/u.test(id));
  const documentation = ids.filter((id) => /(?:doc|adr|backlog|artifact|spec|reader|markdown|link|inventory|state|handover|release|verify-selection|verify-suite-registration|validate-manifest|security-scan)/u.test(id));
  const selection = planVerifySelection({
    mode: invocation.mode, baseCommit, candidateCommit, changedPaths, registeredSuiteIds: ids, forceFullReason,
    policy: {
      schema: "pipeline.verify-selection.v1",
      baseline,
      areas: [
        { id: "documentation", paths: ["README.md", "PIPELINE_FLOW.md", "SETUP.md", "docs/**", "specs/**", "backlog/**"], suites: documentation },
        { id: "implementation", paths: [".claude/**", ".github/**", "guardrails/**", "harness/**", "plugins/**", "project/**", "templates/**", "package.json", "setup.mjs", "setup.test.mjs"], suites: ids },
      ],
    },
  });
  const selected = new Set(selection.selectedSuiteIds);
  return Object.freeze({ selection, suites: Object.freeze(registeredSuites.filter((suite) => selected.has(suite.name))) });
}
