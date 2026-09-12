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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  WORKTREE_COUNT_CHECK_SCHEMA,
  WORKTREE_COUNT_VERDICT_SCHEMA,
  clearWorktreeCountBaseline,
  countLiveWorktrees,
  countWorktreeIsolatedDispatches,
  dispatchKeyForTranscript,
  evaluateWorktreeCountCheckEvent,
  evaluateWorktreeCountDelta,
  formatWorktreeIsolationMismatch,
  readWorktreeCountVerdict,
  readWorktreeCountBaseline,
  recordWorktreeCountBaseline,
  recordWorktreeCountVerdict,
  registerWorktreeIsolationLaunch,
  resolveWorktreeIsolationLaunch,
  validateWorktreeCountVerdict,
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
// Prevent Git from discovering an ancestor checkout when TMPDIR itself is repo-local.
const badResult = countLiveWorktrees(notARepo, {
  spawn: (command, args, options) => spawnSync(command, args, {
    ...options,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(notARepo) },
  }),
});
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
  now: new Date("2026-08-29T01:01:00.000Z"),
});
checkTrue("WTC19 resolve reports not-isolated when the count did not move",
  resolvedMismatch && resolvedMismatch.verdict === "not-isolated" && resolvedMismatch.delta === 0, JSON.stringify(resolvedMismatch));
checkTrue("WTC19b mismatch resolution atomically publishes a sanitized terminal receipt",
  resolvedMismatch?.receipt?.schema === WORKTREE_COUNT_VERDICT_SCHEMA
  && resolvedMismatch.receipt.status === "terminal"
  && resolvedMismatch.receipt.verdict === "not-isolated"
  && readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: hookKey })?.receiptSha256 === resolvedMismatch.receipt.receiptSha256
  && !JSON.stringify(resolvedMismatch.receipt).includes(hookFixture)
  && !JSON.stringify(resolvedMismatch.receipt).includes("transcript.jsonl"),
  JSON.stringify(resolvedMismatch));
check("WTC20 resolve is single-shot -- nothing left to resolve after",
  resolveWorktreeIsolationLaunch({ commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([1]), startPath: hookFixture }), null);

// End-to-end via the combined event function: register then resolve as isolated.
registerWorktreeIsolationLaunch({
  toolInput: { subagentType: "pipeline-core:critic", isolation: "worktree", prompt: "x" },
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([5]), startPath: hookFixture,
  now: new Date("2026-08-29T01:01:30.000Z"),
});
const combinedEvent = evaluateWorktreeCountCheckEvent({
  toolInput: { file_path: "some/file.md" }, // an ordinary, non-dispatch tool call
  transcriptPath: "/tmp/hook/transcript.jsonl",
  commonDir: hookCommonDir, startPath: hookFixture, countLiveWorktrees: fakeCounter([6]),
  now: new Date("2026-08-29T01:02:00.000Z"),
});
checkTrue("WTC21 combined event resolves a prior baseline as isolated on the next tool call",
  combinedEvent.resolved && combinedEvent.resolved.verdict === "isolated" && combinedEvent.resolved.delta === 1
  && combinedEvent.resolved.receipt?.verdict === "isolated"
  && combinedEvent.registered === null
  && readWorktreeCountBaseline({ commonDir: hookCommonDir, dispatchKey: hookKey }) === null,
  JSON.stringify(combinedEvent));
checkTrue("WTC21b a durable isolated receipt distinguishes success from a hook that never resolved",
  readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: hookKey })?.verdict === "isolated");

// Two dispatch calls back-to-back: the second call's own PreToolUse event both
// resolves the first (unchanged count -> not-isolated) AND registers its own
// fresh baseline in the same pass.
registerWorktreeIsolationLaunch({
  toolInput: { subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "first" },
  commonDir: hookCommonDir, dispatchKey: hookKey, countLiveWorktrees: fakeCounter([9]), startPath: hookFixture,
});
const hookVerdictPath = join(hookCommonDir, "agent-pipeline", "worktree-count-checks", `${hookKey}.verdict.json`);
checkTrue("WTC21c fresh registration durably creates its baseline before removing old success",
  readWorktreeCountBaseline({ commonDir: hookCommonDir, dispatchKey: hookKey }) !== null
  && readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: hookKey }) === null
  && !existsSync(hookVerdictPath));
const backToBack = evaluateWorktreeCountCheckEvent({
  toolInput: { subagent_type: "pipeline-core:goldfish-deep", isolation: "worktree", prompt: "second" },
  transcriptPath: "/tmp/hook/transcript.jsonl",
  commonDir: hookCommonDir, startPath: hookFixture, countLiveWorktrees: fakeCounter([9]),
});
checkTrue("WTC22 back-to-back dispatches resolve the first and register the second in one event",
  backToBack.resolved && backToBack.resolved.verdict === "not-isolated"
  && backToBack.registered && backToBack.registered.baselineCount === 9 && backToBack.registered.expectedDispatchCount === 1,
  JSON.stringify(backToBack));

// A two-dispatch launch that gains only one worktree is durably partial.
const partialKey = dispatchKeyForTranscript("/tmp/hook/partial.jsonl");
registerWorktreeIsolationLaunch({
  toolInput: { script: WORKFLOW_TWO_ISOLATED },
  commonDir: hookCommonDir, dispatchKey: partialKey, countLiveWorktrees: fakeCounter([4]), startPath: hookFixture,
  now: new Date("2026-08-29T02:00:00.000Z"),
});
const partial = resolveWorktreeIsolationLaunch({
  commonDir: hookCommonDir, dispatchKey: partialKey, countLiveWorktrees: fakeCounter([5]), startPath: hookFixture,
  now: new Date("2026-08-29T02:01:00.000Z"),
});
checkTrue("WTC22b partial resolution is terminal, durable and relation-bound",
  partial?.verdict === "partial" && partial.receipt?.verdict === "partial"
  && validateWorktreeCountVerdict(partial.receipt, partialKey));

// Persistence failure cannot manufacture success. Mismatch and partial remain
// fail-closed warning verdicts even when their durable receipt cannot be stored.
for (const [id, expectedDispatchCount, baselineCount, currentCount, expectedVerdict] of [
  ["WTC22c", 1, 7, 8, "unobservable"],
  ["WTC22d", 1, 7, 7, "not-isolated"],
  ["WTC22e", 2, 7, 8, "partial"],
]) {
  const failureKey = dispatchKeyForTranscript(`/tmp/hook/${id}.jsonl`);
  recordWorktreeCountBaseline({
    commonDir: hookCommonDir, dispatchKey: failureKey, baselineCount, expectedDispatchCount,
    now: new Date("2026-08-29T03:00:00.000Z"),
  });
  const result = resolveWorktreeIsolationLaunch({
    commonDir: hookCommonDir, dispatchKey: failureKey, countLiveWorktrees: fakeCounter([currentCount]),
    recordWorktreeCountVerdict: () => null, startPath: hookFixture,
    now: new Date("2026-08-29T03:01:00.000Z"),
  });
  checkTrue(`${id} receipt persistence failure remains fail closed as ${expectedVerdict}`,
    result?.verdict === expectedVerdict && result.receipt === null
    && readWorktreeCountBaseline({ commonDir: hookCommonDir, dispatchKey: failureKey }) !== null
    && readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: failureKey }) === null,
    JSON.stringify(result));
}

const corruptKey = dispatchKeyForTranscript("/tmp/hook/corrupt.jsonl");
const corruptPath = join(hookCommonDir, "agent-pipeline", "worktree-count-checks", `${corruptKey}.verdict.json`);
const validReceipt = recordWorktreeCountVerdict({
  commonDir: hookCommonDir, dispatchKey: corruptKey, baselineCount: 1, expectedDispatchCount: 1,
  currentCount: 2, delta: 1, verdict: "isolated",
  recordedAt: "2026-08-29T04:00:00.000Z", resolvedAt: new Date("2026-08-29T04:01:00.000Z"),
});
checkTrue("WTC22f terminal receipt creation is digest-bound and read back byte-for-byte",
  validReceipt !== null
  && JSON.parse(readFileSync(corruptPath, "utf8")).receiptSha256 === validReceipt.receiptSha256);
writeFileSync(corruptPath, `${JSON.stringify({ ...validReceipt, verdict: "partial" })}\n`, "utf8");
check("WTC22g a tampered or relationally invalid receipt cannot be read as success",
  readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: corruptKey }), null);
check("WTC22h malformed receipt inputs fail closed before selecting a host path",
  recordWorktreeCountVerdict({
    commonDir: hookCommonDir, dispatchKey: "../../escape", baselineCount: 1, expectedDispatchCount: 1,
    currentCount: 2, delta: 1, verdict: "isolated",
    recordedAt: "2026-08-29T04:00:00.000Z", resolvedAt: "not-a-date",
  }), null);
check("WTC22i a raw path cannot be used as a verdict lookup key",
  readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: "/tmp/private/transcript.jsonl" }), null);

const malformedPendingKey = dispatchKeyForTranscript("/tmp/hook/malformed-pending.jsonl");
const malformedPendingVerdict = recordWorktreeCountVerdict({
  commonDir: hookCommonDir, dispatchKey: malformedPendingKey, baselineCount: 2, expectedDispatchCount: 1,
  currentCount: 3, delta: 1, verdict: "isolated",
  recordedAt: "2026-08-29T05:00:00.000Z", resolvedAt: new Date("2026-08-29T05:01:00.000Z"),
});
const malformedPendingPath = join(hookCommonDir, "agent-pipeline", "worktree-count-checks", `${malformedPendingKey}.json`);
writeFileSync(malformedPendingPath, "{malformed pending baseline", "utf8");
checkTrue("WTC22j malformed pending state masks an older isolated receipt",
  malformedPendingVerdict?.verdict === "isolated"
  && readWorktreeCountBaseline({ commonDir: hookCommonDir, dispatchKey: malformedPendingKey }) === null
  && readWorktreeCountVerdict({ commonDir: hookCommonDir, dispatchKey: malformedPendingKey }) === null);

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
