#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * worktree-count-check.mjs -- unit-level suite.
 *
 * Hand-rolled PASS/FAIL runner (console.log + process.exit), matching this
 * plugin's existing hook/lib test convention (see guard-dispatch.test.mjs,
 * worktree-lifecycle.test.mjs) rather than node:test's describe/it API.
 *
 * WTC1-WTC6 exercise the Workflow/Agent tool_input detection heuristic.
 * WTC7-WTC9 exercise the live `git worktree list` counter against a REAL
 * temp git repository (not a fake) -- the same "real git, not a paraphrase"
 * discipline the sibling worktree-lifecycle.test.mjs uses, since this is the
 * one function in the module that talks to an actual subprocess.
 * WTC10-WTC14 exercise baseline persistence (round-trip, schema/shape
 * validation, single-shot consumption).
 * WTC15-WTC17 exercise the delta verdict.
 * WTC18-WTC22 exercise the two hook-shaped entry points end to end, with an
 * injected `countLiveWorktrees` so the register/resolve pairing is tested
 * deterministically without needing a second real git process per case.
 * WTC23-WTC24 exercise the human-readable message formatter.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  WORKTREE_COUNT_CHECK_SCHEMA,
  clearWorktreeCountBaseline,
  countLiveWorktrees,
  countWorktreeIsolatedDispatches,
  dispatchKeyForTranscript,
  evaluateWorktreeCountCheckEvent,
  evaluateWorktreeCountDelta,
  formatWorktreeIsolationMismatch,
  readWorktreeCountBaseline,
  recordWorktreeCountBaseline,
  registerWorktreeIsolationLaunch,
  resolveWorktreeIsolationLaunch,
} from "./worktree-count-check.mjs";

let pass = 0;
const failures = [];
function check(id, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    pass += 1;
    console.log(`PASS  ${id}`);
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
    console.log(`FAIL  ${id} -- ${error.message}`);
  }
}
function checkTrue(id, actual, message) {
  check(id, actual, true);
  if (actual !== true && message) console.log(`      ${message}`);
}

// ---------------------------------------------------------------------------
// WTC1-WTC6: isolation:"worktree" detection.
// ---------------------------------------------------------------------------

check("WTC1 direct Agent call, isolation: worktree -> 1",
  countWorktreeIsolatedDispatches({ subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "x" }), 1);

check("WTC2 direct Agent call, no isolation field -> 0",
  countWorktreeIsolatedDispatches({ subagent_type: "pipeline-core:goldfish-deep", prompt: "x" }), 0);

check("WTC3 camelCase subagentType is read too",
  countWorktreeIsolatedDispatches({ subagentType: "pipeline-core:critic", isolation: "worktree", prompt: "x" }), 1);

const WORKFLOW_ONE_ISOLATED = `
async function main() {
  const result = await agent({ agentType: 'pipeline-core:goldfish-deep', prompt: \`hello\`, isolation: 'worktree' });
  return result;
}
`;
check("WTC4 Workflow script, one isolation:worktree agent() call -> 1",
  countWorktreeIsolatedDispatches({ script: WORKFLOW_ONE_ISOLATED }), 1);

const WORKFLOW_TWO_ISOLATED = `
async function main() {
  const a = await agent({ agentType: 'pipeline-core:goldfish-deep', prompt: \`one\`, isolation: 'worktree' });
  const b = await agent({ agentType: 'pipeline-core:goldfish-implementor', prompt: \`two\`, isolation: 'worktree' });
  return [a, b];
}
`;
check("WTC5 Workflow script, two isolation:worktree agent() calls -> 2",
  countWorktreeIsolatedDispatches({ script: WORKFLOW_TWO_ISOLATED }), 2);

const WORKFLOW_NO_ISOLATION = `
async function main() {
  const a = await agent({ agentType: 'pipeline-core:goldfish-deep', prompt: \`one\` });
  return a;
}
`;
check("WTC6 Workflow script with no isolation field -> 0",
  countWorktreeIsolatedDispatches({ script: WORKFLOW_NO_ISOLATION }), 0);

check("WTC6b malformed/absent tool_input -> 0", countWorktreeIsolatedDispatches(null), 0);
check("WTC6c unrelated tool_input shape -> 0", countWorktreeIsolatedDispatches({ file_path: "x" }), 0);

// ---------------------------------------------------------------------------
// WTC7-WTC9: countLiveWorktrees against a REAL git repository.
// ---------------------------------------------------------------------------

const fixture = mkdtempSync(join(tmpdir(), "worktree-count-check-test-"));
function git(args, cwd = fixture) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}
git(["init", "-q"]);
git(["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "--allow-empty", "-m", "init"]);

const singleWorktree = countLiveWorktrees(fixture);
checkTrue("WTC7 fresh repo has ok:true and count:1", singleWorktree.ok === true && singleWorktree.count === 1,
  JSON.stringify(singleWorktree));

const secondWorktreePath = join(fixture, "..", `${join(fixture).split("/").pop()}-wt2`);
git(["worktree", "add", "-q", secondWorktreePath, "-b", "wtc-second"]);
const twoWorktrees = countLiveWorktrees(fixture);
checkTrue("WTC8 after `git worktree add`, count:2", twoWorktrees.ok === true && twoWorktrees.count === 2,
  JSON.stringify(twoWorktrees));

const notARepo = mkdtempSync(join(tmpdir(), "worktree-count-check-notrepo-"));
const badResult = countLiveWorktrees(notARepo);
checkTrue("WTC9 non-repo path fails open (ok:false, never throws)", badResult.ok === false);

// ---------------------------------------------------------------------------
// WTC10-WTC14: baseline persistence.
// ---------------------------------------------------------------------------

const stateFixture = mkdtempSync(join(tmpdir(), "worktree-count-check-state-"));
const commonDir = join(stateFixture, ".git");
const key = dispatchKeyForTranscript("/tmp/some/transcript.jsonl");
checkTrue("WTC10 dispatchKeyForTranscript is deterministic",
  key === dispatchKeyForTranscript("/tmp/some/transcript.jsonl") && typeof key === "string" && key.length === 32);
check("WTC10b dispatchKeyForTranscript(null) -> null", dispatchKeyForTranscript(null), null);
check("WTC10c dispatchKeyForTranscript('') -> null", dispatchKeyForTranscript(""), null);

check("WTC11 readWorktreeCountBaseline on a missing record -> null",
  readWorktreeCountBaseline({ commonDir, dispatchKey: key }), null);

const written = recordWorktreeCountBaseline({
  commonDir, dispatchKey: key, baselineCount: 3, expectedDispatchCount: 1, now: new Date("2026-08-29T00:00:00.000Z"),
});
check("WTC12 recordWorktreeCountBaseline returns the schema-stamped record", written, {
  schema: WORKTREE_COUNT_CHECK_SCHEMA, dispatchKey: key, baselineCount: 3, expectedDispatchCount: 1, recordedAt: "2026-08-29T00:00:00.000Z",
});
check("WTC13 readWorktreeCountBaseline round-trips the written record",
  readWorktreeCountBaseline({ commonDir, dispatchKey: key }), written);

clearWorktreeCountBaseline({ commonDir, dispatchKey: key });
check("WTC14 clearWorktreeCountBaseline deletes it (single-shot)",
  readWorktreeCountBaseline({ commonDir, dispatchKey: key }), null);
// Clearing an already-absent record must not throw.
clearWorktreeCountBaseline({ commonDir, dispatchKey: key });
pass += 1; console.log("PASS  WTC14b clearing an already-absent baseline does not throw");

// ---------------------------------------------------------------------------
// WTC15-WTC17: delta verdict.
// ---------------------------------------------------------------------------

check("WTC15 unchanged count -> not-isolated",
  evaluateWorktreeCountDelta({ baselineCount: 2, expectedDispatchCount: 1, currentCount: 2 }), { verdict: "not-isolated", delta: 0 });
check("WTC15b shrunk count -> not-isolated",
  evaluateWorktreeCountDelta({ baselineCount: 2, expectedDispatchCount: 1, currentCount: 1 }), { verdict: "not-isolated", delta: -1 });
check("WTC16 partial increase for a 2-dispatch round -> partial",
  evaluateWorktreeCountDelta({ baselineCount: 2, expectedDispatchCount: 2, currentCount: 3 }), { verdict: "partial", delta: 1 });
check("WTC17 full increase -> isolated",
  evaluateWorktreeCountDelta({ baselineCount: 2, expectedDispatchCount: 2, currentCount: 4 }), { verdict: "isolated", delta: 2 });

// ---------------------------------------------------------------------------
// WTC18-WTC22: the two hook-shaped entry points, with an injected counter.
// ---------------------------------------------------------------------------

const hookFixture = mkdtempSync(join(tmpdir(), "worktree-count-check-hook-"));
const hookCommonDir = join(hookFixture, ".git");
const hookKey = dispatchKeyForTranscript("/tmp/hook/transcript.jsonl");

function fakeCounter(sequence) {
  let index = 0;
  return () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return { ok: true, count: value };
  };
}

// Register with an isolation:worktree call, baseline count observed as 1.
const registered = registerWorktreeIsolationLaunch({
  toolInput: { subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "x" },
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([1]), startPath: hookFixture,
  now: new Date("2026-08-29T01:00:00.000Z"),
});
checkTrue("WTC18 register records a baseline for an isolated dispatch",
  registered && registered.baselineCount === 1 && registered.expectedDispatchCount === 1, JSON.stringify(registered));

// Register with a non-isolated call -> nothing recorded.
check("WTC18b register is a no-op for a non-isolated call",
  registerWorktreeIsolationLaunch({
    toolInput: { subagent_type: "pipeline-core:goldfish-deep", prompt: "x" },
    commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([1]), startPath: hookFixture,
  }), null);

// Resolve against an unchanged count -> not-isolated, and consumes the baseline.
const resolvedMismatch = resolveWorktreeIsolationLaunch({
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([1]), startPath: hookFixture,
});
checkTrue("WTC19 resolve reports not-isolated when the count did not move",
  resolvedMismatch && resolvedMismatch.verdict === "not-isolated" && resolvedMismatch.delta === 0, JSON.stringify(resolvedMismatch));
check("WTC20 resolve is single-shot -- nothing left to resolve after",
  resolveWorktreeIsolationLaunch({ commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([1]), startPath: hookFixture }), null);

// End-to-end via the combined event function: register then resolve as isolated.
registerWorktreeIsolationLaunch({
  toolInput: { subagentType: "pipeline-core:critic", isolation: "worktree", prompt: "x" },
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([5]), startPath: hookFixture,
});
const combinedEvent = evaluateWorktreeCountCheckEvent({
  toolInput: { file_path: "some/file.md" }, // an ordinary, non-dispatch tool call
  transcriptPath: "/tmp/hook/transcript.jsonl",
  commonDir: hookCommonDir, startPath: hookFixture, countLiveWorktrees: fakeCounter([6]),
});
checkTrue("WTC21 combined event resolves a prior baseline as isolated on the next tool call",
  combinedEvent.resolved && combinedEvent.resolved.verdict === "isolated" && combinedEvent.resolved.delta === 1
  && combinedEvent.registered === null, JSON.stringify(combinedEvent));

// Two dispatch calls back-to-back: the second call's own PreToolUse event both
// resolves the first (unchanged count -> not-isolated) AND registers its own
// fresh baseline in the same pass.
registerWorktreeIsolationLaunch({
  toolInput: { subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "first" },
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([9]), startPath: hookFixture,
});
const backToBack = evaluateWorktreeCountCheckEvent({
  toolInput: { subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "second" },
  transcriptPath: "/tmp/hook/transcript.jsonl",
  commonDir: hookCommonDir, startPath: hookFixture, countLiveWorktrees: fakeCounter([9]),
});
checkTrue("WTC22 back-to-back dispatches resolve the first and register the second in one event",
  backToBack.resolved && backToBack.resolved.verdict === "not-isolated"
  && backToBack.registered && backToBack.registered.baselineCount === 9 && backToBack.registered.expectedDispatchCount === 1,
  JSON.stringify(backToBack));

// ---------------------------------------------------------------------------
// WTC23-WTC24: message formatting.
// ---------------------------------------------------------------------------

const notIsolatedMsg = formatWorktreeIsolationMismatch({ verdict: "not-isolated", baselineCount: 1, currentCount: 1, expectedDispatchCount: 1, delta: 0 });
checkTrue("WTC23 not-isolated message names the mismatch and the backlog item",
  notIsolatedMsg.includes("WORKTREE-ISOLATION-MISMATCH") && notIsolatedMsg.includes("2026-08-25"));

const partialMsg = formatWorktreeIsolationMismatch({ verdict: "partial", baselineCount: 1, currentCount: 2, expectedDispatchCount: 2, delta: 1 });
checkTrue("WTC24 partial message names the partial mismatch", partialMsg.includes("WORKTREE-ISOLATION-PARTIAL"));

check("WTC24b isolated verdict formats to an empty string (nothing to warn about)",
  formatWorktreeIsolationMismatch({ verdict: "isolated", baselineCount: 1, currentCount: 2, expectedDispatchCount: 1, delta: 1 }), "");
check("WTC24c null resolved formats to an empty string", formatWorktreeIsolationMismatch(null), "");

// ---------------------------------------------------------------------------
rmSync(fixture, { recursive: true, force: true });
rmSync(notARepo, { recursive: true, force: true });
rmSync(stateFixture, { recursive: true, force: true });
rmSync(hookFixture, { recursive: true, force: true });

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("\nFAILURES:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
process.exit(0);
