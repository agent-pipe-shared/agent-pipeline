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
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dispatchFindings } from "./dispatch-policy.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
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
  body = body.replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "≤24 tool uses");
  body = body.replace(/\{\{[^{}]*\}\}/g, "FILLED");
  return body;
}

const cases = [];
const check = (label, run) => {
  cases.push({ id: `DPT${String(cases.length + 1).padStart(2, "0")}`, name: label, run });
};
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
Ruleset-SHA: 0f38b425; Model: claude-opus-5; effort high.
- **Tool budget (hard cap, first-class field):** ≤24 tool uses.`;

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
Model: claude-sonnet-5; effort medium; Ruleset-SHA: 0f38b425.
- **Tool budget (TB-09, hard cap, first-class field):** ≤40 tool uses.`;

// DP1 -- the case this exists for.
check("DP1 the real 2026-08-06 briefing is refused", () => {
  const result = dispatchFindings({ subagentType: "pipeline-core:critic", prompt: REAL_BRIEFING });
  assert.equal(result.role, "critic");
  assert.deepEqual(codes(result), [
    "DBB-BASE-CAP-MISSING",
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

check("DP8b every budget-bearing role binds its declared cap before launch", () => {
  const fixtures = [
    ["critic", CLEAN_CRITIC],
    ["goldfish-implementor", CLEAN_GOLDFISH],
    ["goldfish-mechanic", CLEAN_GOLDFISH],
    ["goldfish-deep", CLEAN_GOLDFISH.replace("≤40 tool uses", "≤45 tool uses")],
  ];
  for (const [role, prompt] of fixtures) {
    assert.equal(codes(dispatchFindings({ subagentType: `pipeline-core:${role}`, prompt })).some((code) => code.startsWith("DBB-")), false, role);
  }
});

check("DP8c budget-bearing roles reject missing, ambiguous and nonnumeric caps", () => {
  const noBudget = CLEAN_GOLDFISH.replace(/^- \*\*Tool budget.*\n?/mu, "");
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:goldfish-implementor", prompt: noBudget })).includes("DBB-BASE-CAP-MISSING"));
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n- Tool budget: 10 tool uses.` })).includes("DBB-BASE-CAP-AMBIGUOUS"));
  assert.ok(codes(dispatchFindings({ subagentType: "pipeline-core:goldfish-deep", prompt: CLEAN_GOLDFISH.replace("≤40 tool uses", "forty tool uses") })).includes("DBB-BASE-CAP-NONNUMERIC"));
});

check("DP8d a role without an adopted budget field receives no fabricated budget finding", () => {
  const result = dispatchFindings({ subagentType: "pipeline-core:consult-advisor", prompt: "Inspect the supplied paths." });
  assert.equal(codes(result).some((code) => code.startsWith("DBB-")), false);
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

let dispatchFixture;
let commit;
let tree;
function ensureDispatchFixture() {
  if (dispatchFixture !== undefined) return;
  dispatchFixture = mkdtempSync(join(tmpdir(), "pipeline-role-dispatch-"));
  execFileSync("git", ["init", "-q"], { cwd: dispatchFixture });
  execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: dispatchFixture });
  execFileSync("git", ["config", "user.name", "Dispatch fixture"], { cwd: dispatchFixture });
  mkdirSync(join(dispatchFixture, "scratch"));
  writeFileSync(join(dispatchFixture, "input.txt"), "input\n");
  writeFileSync(join(dispatchFixture, "README.md"), "fixture\n");
  execFileSync("git", ["add", "input.txt", "README.md"], { cwd: dispatchFixture });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: dispatchFixture });
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dispatchFixture, encoding: "utf8" }).trim();
  tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dispatchFixture, encoding: "utf8" }).trim();
}
process.once("exit", () => {
  if (dispatchFixture !== undefined) rmSync(dispatchFixture, { recursive: true, force: true });
});
const roles = [
  "afk-claude-worker", "consult-advisor", "critic", "goldfish-deep",
  "goldfish-implementor", "goldfish-mechanic", "plan-verifier", "readiness-reviewer",
];
const promptFor = (role) => role.includes("goldfish") ? CLEAN_GOLDFISH : role === "critic" ? CLEAN_CRITIC : "Inspect input.txt with model codex; Ruleset-SHA: 0f38b425.";
const packetFor = (role, index, requiredPaths = ["input.txt"]) => {
    const requiredPathSha256 = Object.fromEntries(requiredPaths.map((path) => [
      path,
      path === "input.txt" ? createHash("sha256").update("input\n").digest("hex") : "0".repeat(64),
    ]));
    return {
      schema: ROLE_DISPATCH_REQUEST_SCHEMA,
      dispatchId: `dispatch-${index}`,
      transport: "direct",
      role: `pipeline-core:${role}`,
      prompt: promptFor(role),
      candidate: { commit, tree },
      requiredPaths,
      requiredPathSha256,
      resultPath: `scratch/result-${index}.json`,
    };
};
const fixtureCheck = (label, run) => check(label, async () => {
  ensureDispatchFixture();
  await run();
});

  fixtureCheck("DP17 the common envelope rejects a stale candidate tree before launch", () => {
    const packet = packetFor("consult-advisor", 17);
    packet.candidate.tree = "0".repeat(40);
    const result = preflightRoleDispatch({ root: dispatchFixture, packet });
    assert.equal(result.code, "RDP-CANDIDATE-TREE");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  });

  fixtureCheck("DP18 the common envelope rejects an unusable result destination", () => {
    const packet = packetFor("consult-advisor", 18);
    packet.resultPath = "missing-parent/result.json";
    assert.equal(preflightRoleDispatch({ root: dispatchFixture, packet }).code, "RDP-RESULT-DESTINATION");
  });

  fixtureCheck("DP18b a coordinator-owned result root is validated separately from candidate inputs", () => {
    const resultRoot = mkdtempSync(join(tmpdir(), "pipeline-role-result-"));
    try {
      const packet = packetFor("consult-advisor", 182);
      packet.resultPath = "result.json";
      const prepared = preflightRoleDispatch({ root: dispatchFixture, resultRoot, packet });
      assert.equal(prepared.status, "prepared");
      writeFileSync(join(resultRoot, "occupied.json"), "occupied\n");
      packet.resultPath = "occupied.json";
      assert.equal(preflightRoleDispatch({ root: dispatchFixture, resultRoot, packet }).code, "RDP-RESULT-DESTINATION");
      assert.equal(preflightRoleDispatch({ root: dispatchFixture, resultRoot: join(resultRoot, "missing"), packet }).code, "RDP-RESULT-ROOT");
    } finally {
      rmSync(resultRoot, { recursive: true, force: true });
    }
  });

  fixtureCheck("DP18d explicit file destinations preserve the validated file contract", () => {
    const resultRoot = mkdtempSync(join(tmpdir(), "pipeline-role-explicit-result-"));
    try {
      const packet = packetFor("consult-advisor", 184);
      delete packet.resultPath;
      packet.resultDestination = { kind: "file", path: "result.json" };
      const prepared = preflightRoleDispatch({ root: dispatchFixture, resultRoot, packet });
      assert.equal(prepared.status, "prepared");
      assert.deepEqual(prepared.packet, packet);

      packet.resultDestination.path = "../result.json";
      const rejected = preflightRoleDispatch({ root: dispatchFixture, resultRoot, packet });
      assert.equal(rejected.code, "RDP-RESULT-PATH");
      assert.equal(rejected.field, "resultDestination.path");
      assert.equal(rejected.modelCalls, 0);
      assert.equal(rejected.launcherCalls, 0);
    } finally {
      rmSync(resultRoot, { recursive: true, force: true });
    }
  });

  fixtureCheck("DP18e return and stream destinations require no fabricated result path", () => {
    for (const [index, kind] of ["return", "stream"].entries()) {
      const packet = packetFor("consult-advisor", 185 + index);
      delete packet.resultPath;
      packet.resultDestination = { kind };
      const prepared = preflightRoleDispatch({
        root: dispatchFixture,
        resultRoot: join(dispatchFixture, "missing-result-root"),
        packet,
      });
      assert.equal(prepared.status, "prepared", kind);
      assert.deepEqual(prepared.packet.resultDestination, { kind });
      assert.equal("resultPath" in prepared.packet, false);
    }
  });

  fixtureCheck("DP18f malformed explicit destination forms fail closed through the batch runner", async () => {
    const malformedDestinations = [
      null,
      {},
      { kind: "file" },
      { kind: "return", path: "scratch/fake.json" },
      { kind: "stream", channel: "stdout" },
      { kind: "unknown" },
    ];
    let malformedLaunches = 0;
    const malformedResults = [];
    for (const [index, resultDestination] of malformedDestinations.entries()) {
      const packet = packetFor("consult-advisor", 190 + index);
      delete packet.resultPath;
      packet.resultDestination = resultDestination;
      malformedResults.push(await runRoleDispatchBatch({
        root: dispatchFixture,
        packets: [packet],
        launch: async () => { malformedLaunches += 1; },
      }));
    }
    for (const [index, rejectedBatch] of malformedResults.entries()) {
      const rejected = rejectedBatch.preparations[0];
      const resultDestination = malformedDestinations[index];
      assert.equal(rejectedBatch.code, "RDB-PREPARATION-FAILED", JSON.stringify(resultDestination));
      assert.equal(rejected.code, "RDP-RESULT-DESTINATION", JSON.stringify(resultDestination));
      assert.equal(rejected.field, "resultDestination");
      assert.equal(rejected.modelCalls, 0);
      assert.equal(rejected.launcherCalls, 0);
    }
    assert.equal(malformedLaunches, 0);
  });

  fixtureCheck("DP18a required source names are literal paths, never Git pathspecs", () => {
    const packet = packetFor("consult-advisor", 181, [":README.md"]);
    const result = preflightRoleDispatch({ root: dispatchFixture, packet });
    assert.equal(result.code, "RDP-REQUIRED-PATH");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  });

  fixtureCheck("DP18c a modified tracked source is rejected before launch", () => {
    writeFileSync(join(dispatchFixture, "input.txt"), "modified after candidate\n");
    try {
      const result = preflightRoleDispatch({ root: dispatchFixture, packet: packetFor("consult-advisor", 183) });
      assert.equal(result.code, "RDP-REQUIRED-PATH-DRIFT");
      assert.equal(result.modelCalls, 0);
      assert.equal(result.launcherCalls, 0);
    } finally {
      writeFileSync(join(dispatchFixture, "input.txt"), "input\n");
    }
  });

  fixtureCheck("DP19 every shipped role fails in PREPARE with zero launcher calls", async () => {
    const invalidPackets = roles.map((role, index) => packetFor(role, 100 + index, ["missing.txt"]));
    let invalidLaunches = 0;
    const invalidStarted = Date.now();
    const invalidBatch = await runRoleDispatchBatch({
      root: dispatchFixture,
      packets: invalidPackets,
      launch: async () => { invalidLaunches += 1; },
    });
    assert.equal(invalidBatch.status, "rejected");
    assert.equal(invalidBatch.code, "RDB-PREPARATION-FAILED");
    assert.equal(invalidBatch.preparations.length, roles.length);
    assert.ok(invalidBatch.preparations.every((row) => row.code === "RDP-REQUIRED-PATH"));
    assert.equal(invalidLaunches, 0);
    assert.equal(invalidBatch.modelCalls, 0);
    assert.ok(Date.now() - invalidStarted < 5_000);
  });

  fixtureCheck("DP20 all packets PREPARE before valid role envelopes reach the launcher unchanged", async () => {
    const validPackets = roles.map((role, index) => packetFor(role, 200 + index));
    const launched = [];
    const validBatch = await runRoleDispatchBatch({
      root: dispatchFixture,
      packets: validPackets,
      launch: async (packet) => { launched.push(packet); return { role: packet.role }; },
    });
    assert.equal(validBatch.status, "completed");
    assert.equal(validBatch.launcherCalls, roles.length);
    assert.deepEqual(launched, validPackets);
    assert.deepEqual(validBatch.results, validPackets.map(({ role }) => ({ role })));
  });

  fixtureCheck("DP21 batch execution propagates resultRoot and preserves mixed destinations", async () => {
    const batchResultRoot = mkdtempSync(join(tmpdir(), "pipeline-role-batch-result-"));
    try {
    const externalOnlyParent = `result-parent-${createHash("sha256").update(batchResultRoot).digest("hex").slice(0, 12)}`;
    mkdirSync(join(batchResultRoot, externalOnlyParent));
    const filePacket = packetFor("consult-advisor", 301);
    filePacket.resultPath = `${externalOnlyParent}/file-result.json`;
    assert.equal(
      preflightRoleDispatch({ root: dispatchFixture, packet: filePacket }).code,
      "RDP-RESULT-DESTINATION",
      "the fixture must fail if the batch forgets its coordinator-owned resultRoot",
    );
    const returnPacket = packetFor("critic", 302);
    delete returnPacket.resultPath;
    returnPacket.resultDestination = { kind: "return" };
    const streamPacket = packetFor("goldfish-implementor", 303);
    delete streamPacket.resultPath;
    streamPacket.resultDestination = { kind: "stream" };
    const packets = [filePacket, returnPacket, streamPacket];
    const received = [];
    const result = await runRoleDispatchBatch({
      root: dispatchFixture,
      resultRoot: batchResultRoot,
      packets,
      launch: async (packet) => { received.push(packet); return packet.dispatchId; },
    });
      assert.equal(result.status, "completed");
      assert.equal(result.launcherCalls, 3);
      assert.deepEqual(received, packets);
      assert.deepEqual(result.results, packets.map(({ dispatchId }) => dispatchId));
    } finally {
      rmSync(batchResultRoot, { recursive: true, force: true });
    }
  });

  fixtureCheck("DP22 legacy and explicit file destinations share one collision namespace", async () => {
    const duplicateLegacy = packetFor("consult-advisor", 304);
    duplicateLegacy.resultPath = "scratch/shared-result.json";
    const duplicateExplicit = packetFor("critic", 305);
    delete duplicateExplicit.resultPath;
    duplicateExplicit.resultDestination = { kind: "file", path: "scratch/shared-result.json" };
    let duplicateLaunches = 0;
    const duplicateBatch = await runRoleDispatchBatch({
      root: dispatchFixture,
      packets: [duplicateLegacy, duplicateExplicit],
      launch: async () => { duplicateLaunches += 1; },
    });
    assert.equal(duplicateBatch.code, "RDB-DUPLICATE-BINDING");
    assert.equal(duplicateLaunches, 0);
    assert.equal(duplicateBatch.launcherCalls, 0);
  });

  for (const mode of ["occupied", "symlink-parent"]) {
    fixtureCheck(`DP23 ${mode} replacement after PREPARE blocks the affected launcher`, async () => {
      const resultRoot = mkdtempSync(join(tmpdir(), `pipeline-role-stale-${mode}-`));
      const outsideRoot = mkdtempSync(join(tmpdir(), "pipeline-role-stale-outside-"));
      try {
      mkdirSync(join(resultRoot, "second-parent"));
      const first = packetFor("consult-advisor", mode === "occupied" ? 306 : 308);
      first.resultPath = "first.json";
      const second = packetFor("critic", mode === "occupied" ? 307 : 309);
      second.resultPath = "second-parent/result.json";
      const launchedIds = [];
      const result = await runRoleDispatchBatch({
        root: dispatchFixture,
        resultRoot,
        packets: [first, second],
        launch: async (packet) => {
          launchedIds.push(packet.dispatchId);
          if (mode === "occupied") writeFileSync(join(resultRoot, second.resultPath), "occupied\n");
          else {
            rmSync(join(resultRoot, "second-parent"), { recursive: true });
            symlinkSync(outsideRoot, join(resultRoot, "second-parent"));
          }
          return packet.dispatchId;
        },
      });
        assert.equal(result.code, "RDB-PREPARATION-STALE");
        assert.equal(result.failedPreparation.code, "RDP-RESULT-DESTINATION");
        assert.deepEqual(launchedIds, [first.dispatchId]);
        assert.equal(result.launcherCalls, 1);
      } finally {
        rmSync(resultRoot, { recursive: true, force: true });
        rmSync(outsideRoot, { recursive: true, force: true });
      }
    });
  }

  fixtureCheck("DP24 required-input drift after PREPARE blocks the affected launcher", async () => {
    const staleInputRoot = mkdtempSync(join(tmpdir(), "pipeline-role-stale-input-result-"));
    try {
    const first = packetFor("consult-advisor", 310);
    first.resultPath = "first.json";
    const second = packetFor("critic", 311);
    second.resultPath = "second.json";
    const launchedIds = [];
    const result = await runRoleDispatchBatch({
      root: dispatchFixture,
      resultRoot: staleInputRoot,
      packets: [first, second],
      launch: async (packet) => {
        launchedIds.push(packet.dispatchId);
        writeFileSync(join(dispatchFixture, "input.txt"), "mutated after PREPARE\n");
        return packet.dispatchId;
      },
    });
      assert.equal(result.code, "RDB-PREPARATION-STALE");
      assert.equal(result.failedPreparation.code, "RDP-REQUIRED-PATH-DRIFT");
      assert.deepEqual(launchedIds, [first.dispatchId]);
      assert.equal(result.launcherCalls, 1);
    } finally {
      writeFileSync(join(dispatchFixture, "input.txt"), "input\n");
      rmSync(staleInputRoot, { recursive: true, force: true });
    }
  });

assert.equal(cases.length, 34, "the complete dispatch-policy corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
