// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.agy-el01-write-authorization-gap (AC-109).
// The Antigravity Edit/Write route must run the same EL-01 write-time tripwire
// (guard-el01-tripwire.mjs) the Claude route runs. Drives the real adapter.
// The authenticated Antigravity role carrier is NOT available; the role source
// is the same one the Claude route uses (an open dispatch record), never a
// prompt-asserted role.
//
// WHAT THIS PIN COVERS, AND WHAT IT DOES NOT (AC-109 is reported PARTIAL).
// Covered: parity only. The Antigravity Edit/Write route runs the same EL-01
// tripwire as the Claude route and refuses a write when the tripwire's own
// conditions hold and no dispatch record is open (cases below).
// NOT delivered, and deliberately NOT claimed by any case in this file: the
// carrier, worker-scope and fail-closed clauses of AC-109 as reconstructed in
// specs/sprint-alfred-epic/plans/acceptance-reconstruction/R2.md line 11 --
// authorization only from authenticated per-call carrier evidence that the
// caller is an admitted, owned worker AND that the target path lies inside that
// worker's scope, refused (fail closed) when that evidence is missing or
// unauthenticated. guard-el01-tripwire.mjs has no carrier input and no
// worker-scope input, so none of those three clauses can be exercised here.
// DISPOSITION (the question of R2.md line 14 is decided): Elephant decision E6
// (plans/elephant-decisions-2026-10-19.md) accepts the criterion on a documented
// "carrier unavailable" disposition, and PO decision D63 (plans/po-decisions-2026-10-18.md,
// 2026-10-20) closes AC-109 as not reconstructable. Antigravity provides no authenticated
// per-call carrier today, so no carrier or worker-scope behaviour is pinned here and none is
// owed. MEASURED AGAINST E6's rationale ("the fail-closed refusal is already the safe
// state"): that holds for the three cases below only; the tripwire still exits 0 in the
// fail-open conditions listed next, so authorization is NOT never-inferred on this head.
// That gap is recorded here, not pinned as a refusal.
//
// FAIL-OPEN CONDITIONS of hooks/guard-el01-tripwire.mjs (the tripwire exits 0
// and therefore allows the write; none of these is pinned as a refusal). This
// list is the set of conditions found by reading the file at this commit; it is
// NOT a proof of completeness:
//   0a. the tool input cannot be parsed as JSON (lines 253-258), and an empty
//       write target (line 259) both exit 0;
//   0b. an absolute target outside the project root exits 0 (line 273), and a
//       target whose basename matches dispatch-record*.json is exempt (line 281),
//       as is any path under an EXEMPT_PREFIXES entry (line 282);
//   1. the repository is not governed (requiresEnforcement is false; line 158);
//   2. there is no pipeline state file at all (line 296), and an unparsable
//      state file only warns (line 302-307);
//   3. there is no active feature (line 311);
//   4. the spec path cannot be resolved (line 316) or the spec cannot be read
//      (line 322);
//   5. the spec's risk class is anything but "high" (line 325);
//   6. ANY open dispatch-record exists anywhere under the project (lines
//      328-329), whoever the writer is: the record is not bound to the calling
//      session, to a role, or to a target path. Any valid in-progress record
//      suffices, so the writer can create its own authorizing record (the
//      dispatch-record*.json basename is itself write-exempt, line 281) and
//      then write the guarded path.
// The third case below touches only condition 6, and only to show that the
// tripwire itself stops refusing: it is not evidence that the caller is an
// authorized worker.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adapter = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "hooks", "antigravity-pretool-guard.mjs");

function riskFixture({ openDispatch }) {
  const root = mkdtempSync(join(tmpdir(), "agy-el01-pin-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".agent-pipeline"), { recursive: true });
  mkdirSync(join(root, "specs", "feat-1"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), JSON.stringify({ project: "test", verify: "node verify.mjs" }));
  writeFileSync(join(root, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-10-02T00:00:00.000Z",
  }));
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    planApproved: true,
    activeFeature: { id: "feat-1", phase: "implementation", planPath: "specs/feat-1/prd.md" },
  }));
  writeFileSync(join(root, "specs", "feat-1", "spec.md"), "| Risk class | high |\n| Rigor level | 2 |\n");
  if (openDispatch) {
    writeFileSync(join(root, "dispatch-record.json"), JSON.stringify({
      taskId: "T-1", model: "m", rulesetSha: "a".repeat(64), dispatcher: "elephant", outcome: "in-progress", log: [],
    }));
  }
  return root;
}

function runAgy(root, toolCall) {
  const result = spawnSync(process.execPath, [adapter], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: JSON.stringify({ workspacePaths: [root], toolCall }),
    encoding: "utf8",
    timeout: 20_000,
  });
  if (result.status === 2) return { decision: "deny", reason: String(result.stderr) };
  assert.equal(result.status, 0, `adapter failed: ${result.stderr}`);
  return JSON.parse(String(result.stdout).trim());
}

const writeCall = (root) => ({ name: "write_to_file", args: { TargetFile: join(root, "src", "code.js"), CodeContent: "const a = 1;" } });
const editCall = (root) => ({ name: "replace_file_content", args: { TargetFile: join(root, "src", "code.js"), TargetContent: "a", ReplacementContent: "b" } });

test("Antigravity Write without an open dispatch record is refused by guard-el01-tripwire", () => {
  const root = riskFixture({ openDispatch: false });
  try {
    const res = runAgy(root, writeCall(root));
    assert.equal(res.decision, "deny");
    assert.match(res.reason, /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Antigravity Edit without an open dispatch record is refused by guard-el01-tripwire", () => {
  const root = riskFixture({ openDispatch: false });
  try {
    const res = runAgy(root, editCall(root));
    assert.equal(res.decision, "deny");
    assert.match(res.reason, /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Antigravity Write with an open dispatch record is not refused by the EL-01 tripwire", () => {
  const root = riskFixture({ openDispatch: true });
  try {
    const res = runAgy(root, writeCall(root));
    // This lightweight fixture is not a completed lifecycle, so the separate
    // lifecycle-readiness guard still denies; the discriminating fact is that
    // the EL-01 tripwire itself no longer refuses once a dispatch is open.
    assert.doesNotMatch(String(res.reason ?? ""), /guard-el01-tripwire/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
