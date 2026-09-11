// SPDX-License-Identifier: SUL-1.0
/**
 * Dispatch preflight, unit level.
 *
 * DP1 is the actual 2026-08-06 briefing, shortened but with its real section headings. If
 * this check would not have refused that dispatch it is decoration, so that case comes
 * first and everything else is secondary.
 *
 * DP11/DP12 read the actual shipped templates rather than a hand-written stand-in. The
 * hand-written CLEAN_CRITIC/CLEAN_GOLDFISH fixtures above were what let a real adjacency bug
 * (F1, 2026-08-06 Critic round) ship green: they wrote `Model: claude-opus-5` in a shape
 * neither template uses, so a synthetic prompt passed while every real template-built
 * dispatch was refused. These two read `templates/prompts/` from disk, so a future edit to
 * either template's field wording is exactly what this suite exercises.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dispatchFindings } from "./dispatch-policy.mjs";
import {
  ROLE_DISPATCH_REQUEST_SCHEMA,
  preflightRoleDispatch,
  runRoleDispatchBatch,
} from "./role-dispatch-preflight.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The dispatchable body of a prompt template: everything below its copy marker, with
 * placeholders filled the way a real Elephant fill would -- a concrete model identifier for
 * the two model fields, a neutral stand-in for everything else. */
function filledTemplateBody(relativePath) {
  const raw = readFileSync(join(repoRoot, relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const markerIndex = raw.indexOf(marker);
  assert.ok(markerIndex >= 0, `${relativePath}: copy marker not found -- template shape changed`);
  let body = raw.slice(markerIndex + marker.length);
  body = body.replace(/\{\{MODEL_ID\}\}/g, "claude-opus-5");
  body = body.replace(/\{\{EFFORT\}\}/g, "max");
  body = body.replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5 / medium");
  body = body.replace(/\{\{[^{}]*\}\}/g, "FILLED");
  return body;
}

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

// DP11 -- the real critic-review.md template, filled the way an Elephant fills it, must pass.
check("DP11 the real critic-review.md template, filled, passes", () => {
  const prompt = filledTemplateBody("templates/prompts/critic-review.md");
  const result = dispatchFindings({ subagentType: "pipeline-core:critic", prompt });
  assert.deepEqual(codes(result), []);
});

// DP12 -- the real goldfish-task.md template, filled, must pass.
check("DP12 the real goldfish-task.md template, filled, passes", () => {
  const prompt = filledTemplateBody("templates/prompts/goldfish-task.md");
  const result = dispatchFindings({ subagentType: "pipeline-core:goldfish-implementor", prompt });
  assert.deepEqual(codes(result), []);
});

check("DP13 every shipped role refuses an empty prompt before launch", () => {
  const roles = [
    "afk-claude-worker", "consult-advisor", "critic", "goldfish-deep",
    "goldfish-implementor", "goldfish-mechanic", "plan-verifier", "readiness-reviewer",
  ];
  for (const role of roles) {
    const result = dispatchFindings({ subagentType: `pipeline-core:${role}`, prompt: "" });
    assert.ok(codes(result).includes("DISPATCH-PROMPT-REQUIRED"), role);
  }
});

check("DP14 an unknown pipeline role is refused before launch", () => {
  const result = dispatchFindings({ subagentType: "pipeline-core:goldfish-typo", prompt: CLEAN_GOLDFISH });
  assert.deepEqual(codes(result), ["DISPATCH-ROLE-UNKNOWN"]);
});

check("DP15 Workflow requires the plugin prefix for every shipped role", () => {
  const roles = [
    "afk-claude-worker", "consult-advisor", "critic", "goldfish-deep",
    "goldfish-implementor", "goldfish-mechanic", "plan-verifier", "readiness-reviewer",
  ];
  for (const role of roles) {
    const prompt = role.includes("goldfish") ? CLEAN_GOLDFISH : role === "critic" ? CLEAN_CRITIC : "Inspect the supplied paths.";
    const result = dispatchFindings({ subagentType: role, prompt, transport: "workflow" });
    assert.ok(codes(result).includes("DISPATCH-AGENT-TYPE-PREFIX"), role);
  }
});

check("DP16 an unrelated host role remains outside the pipeline registry", () => {
  const result = dispatchFindings({ subagentType: "general-purpose", prompt: "find where X is defined", transport: "workflow" });
  assert.deepEqual(codes(result), []);
});

const dispatchFixture = mkdtempSync(join(tmpdir(), "pipeline-role-dispatch-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: dispatchFixture });
  execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: dispatchFixture });
  execFileSync("git", ["config", "user.name", "Dispatch fixture"], { cwd: dispatchFixture });
  mkdirSync(join(dispatchFixture, "scratch"));
  writeFileSync(join(dispatchFixture, "input.txt"), "input\n");
  writeFileSync(join(dispatchFixture, "README.md"), "fixture\n");
  execFileSync("git", ["add", "input.txt", "README.md"], { cwd: dispatchFixture });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: dispatchFixture });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dispatchFixture, encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dispatchFixture, encoding: "utf8" }).trim();
  const roles = [
    "afk-claude-worker", "consult-advisor", "critic", "goldfish-deep",
    "goldfish-implementor", "goldfish-mechanic", "plan-verifier", "readiness-reviewer",
  ];
  const promptFor = (role) => role.includes("goldfish") ? CLEAN_GOLDFISH : role === "critic" ? CLEAN_CRITIC : "Inspect input.txt with model codex; Ruleset-SHA: 0f38b425.";
  const packetFor = (role, index, requiredPaths = ["input.txt"]) => ({
    schema: ROLE_DISPATCH_REQUEST_SCHEMA,
    dispatchId: `dispatch-${index}`,
    transport: "direct",
    role: `pipeline-core:${role}`,
    prompt: promptFor(role),
    candidate: { commit, tree },
    requiredPaths,
    resultPath: `scratch/result-${index}.json`,
  });

  check("DP17 the common envelope rejects a stale candidate tree before launch", () => {
    const packet = packetFor("consult-advisor", 17);
    packet.candidate.tree = "0".repeat(40);
    const result = preflightRoleDispatch({ root: dispatchFixture, packet });
    assert.equal(result.code, "RDP-CANDIDATE-TREE");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  });

  check("DP18 the common envelope rejects an unusable result destination", () => {
    const packet = packetFor("consult-advisor", 18);
    packet.resultPath = "missing-parent/result.json";
    assert.equal(preflightRoleDispatch({ root: dispatchFixture, packet }).code, "RDP-RESULT-DESTINATION");
  });

  check("DP18a required source names are literal paths, never Git pathspecs", () => {
    const packet = packetFor("consult-advisor", 181, [":README.md"]);
    const result = preflightRoleDispatch({ root: dispatchFixture, packet });
    assert.equal(result.code, "RDP-REQUIRED-PATH");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  });

  const invalidPackets = roles.map((role, index) => packetFor(role, 100 + index, ["missing.txt"]));
  let invalidLaunches = 0;
  const invalidStarted = Date.now();
  const invalidBatch = await runRoleDispatchBatch({
    root: dispatchFixture,
    packets: invalidPackets,
    launch: async () => { invalidLaunches += 1; },
  });
  check("DP19 every shipped role fails in PREPARE with zero launcher calls", () => {
    assert.equal(invalidBatch.status, "rejected");
    assert.equal(invalidBatch.code, "RDB-PREPARATION-FAILED");
    assert.equal(invalidBatch.preparations.length, roles.length);
    assert.ok(invalidBatch.preparations.every((row) => row.code === "RDP-REQUIRED-PATH"));
    assert.equal(invalidLaunches, 0);
    assert.equal(invalidBatch.modelCalls, 0);
    assert.ok(Date.now() - invalidStarted < 5_000);
  });

  const validPackets = roles.map((role, index) => packetFor(role, 200 + index));
  const launched = [];
  const validBatch = await runRoleDispatchBatch({
    root: dispatchFixture,
    packets: validPackets,
    launch: async (packet) => { launched.push(packet); return { role: packet.role }; },
  });
  check("DP20 all packets PREPARE before valid role envelopes reach the launcher unchanged", () => {
    assert.equal(validBatch.status, "completed");
    assert.equal(validBatch.launcherCalls, roles.length);
    assert.deepEqual(launched, validPackets);
    assert.deepEqual(validBatch.results, validPackets.map(({ role }) => ({ role })));
  });
} finally {
  rmSync(dispatchFixture, { recursive: true, force: true });
}

process.stdout.write(`\n${checks}/${checks} dispatch policy checks passed\n`);
