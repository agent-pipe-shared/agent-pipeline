// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.agy-el01-write-authorization-gap (AC-109).
// The Antigravity Edit/Write route must run the same EL-01 write-time tripwire
// (guard-el01-tripwire.mjs) the Claude route runs. Drives the real adapter.
// The authenticated Antigravity role carrier is NOT available; the role source
// is the same one the Claude route uses (an open dispatch record), never a
// prompt-asserted role.
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
