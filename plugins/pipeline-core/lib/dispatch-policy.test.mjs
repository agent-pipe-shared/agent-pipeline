// SPDX-License-Identifier: SUL-1.0
/**
 * Dispatch preflight, unit level.
 *
 * DP1 is the actual 2026-08-06 briefing, shortened but with its real section headings. If
 * this check would not have refused that dispatch it is decoration, so that case comes
 * first and everything else is secondary.
 */
import assert from "node:assert/strict";

import { dispatchFindings } from "./dispatch-policy.mjs";

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; process.stdout.write(`ok ${label}\n`); };
const codes = (result) => result.findings.map((f) => f.code).sort();

const REAL_BRIEFING = `Independent Critic review. Construct your own input from the refs and paths below.

CANDIDATE DIFF: git diff 754b32b..1568fe3

WHAT THE CHANGE CLAIMS (verify each against the code; treat every claim as unproven):
  1. A raw git push is authorized only by a detached Ed25519 signature.
  2. The signed subject binds candidate commit, tree, remote, destination ref.

ADVERSARIAL FOCUS (hunt first, report second):
  - Any route by which a state-file write alone yields an authorized push.
  - The relaxed main boundary, including cross-repo git -C.

EVIDENCE (reproduce, do not take on trust):
  node plugins/pipeline-core/hooks/guard-push.test.mjs

DISPATCH METADATA: model claude-opus-5, effort high.`;

const CLEAN_CRITIC = `Independent Critic review. Build your own input from the references below.

DIFF RANGE: 754b32b..1568fe3
SPEC: specs/sprint-nova-epic/spec.md
GUARDRAILS: guardrails/global.md guardrails/git.md
EVIDENCE ARTIFACTS: evidence/verify-latest.json evidence/security-latest.json
DECISION AUTHORITY: docs/adr/0056-push-approval-mode.md

TASK FRAME: project agent-pipeline; risk class high; rigor T2;
Ruleset-SHA: 0f38b425; Model: claude-opus-5; effort high.`;

const CLEAN_GOLDFISH = `## Briefing NVA-1: close the thing

### 1. Goal
The endpoint streams without OOM; AC-1..AC-3 pass.

### 2. Context files
- specs/x/spec.md

### 3. DoD checks
- Verify command: node harness/scripts/verify.mjs

### 4. Forbidden
- Do not touch unrelated files.

### 5. Stop conditions
- Tool budget reached.

### 6. Dispatch-Metadaten
Model: claude-sonnet-5; effort medium; Ruleset-SHA: 0f38b425.`;

// DP1 -- the case this exists for.
check("DP1 the real 2026-08-06 briefing is refused", () => {
  const result = dispatchFindings({ subagentType: "pipeline-core:critic", prompt: REAL_BRIEFING });
  assert.equal(result.role, "critic");
  assert.deepEqual(codes(result), [
    "DISPATCH-CONTAMINATION-CLAIMS-LIST",
    "DISPATCH-CONTAMINATION-HUNT-LIST",
    "DISPATCH-CONTAMINATION-RERUN-COMMANDS",
    "DISPATCH-NO-RULESET-SHA",
  ]);
});

check("DP2 a references-only Critic dispatch passes", () => {
  assert.deepEqual(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt: CLEAN_CRITIC })), []);
});

check("DP3 an expectation-conclusion is refused", () => {
  const prompt = `${CLEAN_CRITIC}\n\nNothing is expected here; it should pass.`;
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt })).includes("DISPATCH-CONTAMINATION-EXPECTATION"));
});

check("DP4 an implementor characterization is refused", () => {
  const prompt = `${CLEAN_CRITIC}\n\nThe deviation was flagged by the implementor already.`;
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt })).includes("DISPATCH-CONTAMINATION-IMPLEMENTOR-CHARACTERIZATION"));
});

check("DP5 a missing ruleset SHA is a finding on its own", () => {
  const prompt = CLEAN_CRITIC.replace(/Ruleset-SHA: \S+;\s*/, "");
  assert.deepEqual(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt })), ["DISPATCH-NO-RULESET-SHA"]);
});

check("DP6 a complete Goldfish briefing passes", () => {
  assert.deepEqual(codes(dispatchFindings({ subagentType: "pipeline-core:goldfish-implementor", prompt: CLEAN_GOLDFISH })), []);
});

check("DP7 an incomplete Goldfish briefing names what is missing", () => {
  const prompt = CLEAN_GOLDFISH.replace(/### 4\. Forbidden[\s\S]*?### 5\./, "### 5.");
  const result = dispatchFindings({ subagentType: "pipeline-core:goldfish-deep", prompt });
  assert.deepEqual(codes(result), ["DISPATCH-INCOMPLETE-BRIEFING"]);
  assert.match(result.findings[0].why, /FORBIDDEN/);
});

check("DP8 a Goldfish dispatch that names no model is refused", () => {
  const prompt = CLEAN_GOLDFISH.replace(/Model: \S+;\s*/, "");
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:goldfish-mechanic", prompt })).includes("DISPATCH-NO-MODEL"));
});

// DP9 -- roles with no template contract carry no requirement. Inventing one would refuse
// ordinary work in the name of a rule nobody wrote.
check("DP9 an unrelated subagent type is untouched", () => {
  const result = dispatchFindings({ subagentType: "general-purpose", prompt: "find where X is defined" });
  assert.equal(result.role, "other");
  assert.deepEqual(result.findings, []);
});

// DP10 -- the honest limit, asserted so the check is not read as semantic. The same steer
// in fresh prose passes. This raises the cost of the accident, not of a determined evasion.
check("DP10 a reworded steer passes -- the check is structural, not semantic", () => {
  const prompt = `${CLEAN_CRITIC}\n\nWhile reading, the boundary between repositories may repay a careful look.`;
  assert.deepEqual(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt })), []);
});

process.stdout.write(`\n${checks}/${checks} dispatch policy checks passed\n`);
