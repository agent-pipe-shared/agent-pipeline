// SPDX-License-Identifier: SUL-1.0
// Candidate 28c (PO tile 2026-11-11, context baseline): the complete admitted shell grammar is printed once per
// context window. GUARD-READ-COMMAND-UNSUPPORTED printed it in full on every refusal (about 3.5 KB each, four
// times in one measured window); it now trims on repeat like the three grammar codes, and the post-compact
// re-ground hook forgets the session's seen classes so the first refusal of a new window is full again.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { resetDenialClassesForSession } from "../guard/denial-telemetry.mjs";
import { mkdtempTestScratch } from "../test-tmpdir.mjs";

const FULL = /The complete admitted grammar, with bounds and exact spellings:/u;
const SHORT = /already printed on the earlier denial of this kind this session/u;
const READ_SPELLING = "head -c 700 probe.txt";

function governedRoot() {
  const path = mkdtempTestScratch("grammar-once-root-");
  mkdirSync(join(path, ".claude"), { recursive: true });
  mkdirSync(join(path, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(path, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
  return path;
}

const bash = (command, session_id) => ({ tool_name: "Bash", tool_input: { command }, session_id });

test("a repeated read-spelling refusal in one window drops the full grammar listing and stays actionable", () => {
  const path = governedRoot();
  const commonDir = mkdtempTestScratch("grammar-once-common-");
  const deps = { projectDir: path, resolveGitCommonDirFn: () => commonDir };
  try {
    const first = evaluateLifecycleReadyGuard(bash(READ_SPELLING, "grammar-once-1"), deps);
    assert.equal(first.exitCode, 2);
    assert.match(first.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
    assert.match(first.stderr, FULL);
    const second = evaluateLifecycleReadyGuard(bash(READ_SPELLING, "grammar-once-1"), deps);
    assert.equal(second.exitCode, 2, "the trim never weakens the decision");
    assert.match(second.stderr, /GUARD-READ-COMMAND-UNSUPPORTED/u);
    assert.doesNotMatch(second.stderr, FULL);
    assert.match(second.stderr, SHORT);
    assert.match(second.stderr, /Re-spell it with the admitted grammar/u, "the read-spelling note still says what to do");
    assert.ok(second.stderr.length + 2000 < first.stderr.length, `${second.stderr.length} vs ${first.stderr.length}`);
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
  }
});

test("after the window reset the next refusal prints the full grammar once again", () => {
  const path = governedRoot();
  const commonDir = mkdtempTestScratch("grammar-once-common-");
  const deps = { projectDir: path, resolveGitCommonDirFn: () => commonDir };
  try {
    evaluateLifecycleReadyGuard(bash(READ_SPELLING, "grammar-once-2"), deps);
    assert.doesNotMatch(evaluateLifecycleReadyGuard(bash(READ_SPELLING, "grammar-once-2"), deps).stderr, FULL);
    assert.equal(resetDenialClassesForSession("grammar-once-2", path, deps), "reset");
    assert.match(evaluateLifecycleReadyGuard(bash(READ_SPELLING, "grammar-once-2"), deps).stderr, FULL);
    assert.equal(resetDenialClassesForSession("grammar-once-unknown", path, deps), "absent");
  } finally {
    rmSync(path, { recursive: true, force: true });
    rmSync(commonDir, { recursive: true, force: true });
  }
});

test("the reset touches only a plain session key and never a subagent's own file or a climbing name", () => {
  const commonDir = mkdtempTestScratch("grammar-once-common-");
  const dir = join(commonDir, "agent-pipeline", "guard-denial-classes");
  mkdirSync(dir, { recursive: true });
  const agentFile = join(dir, "agent-x.json");
  writeFileSync(agentFile, "{}\n");
  const deps = { resolveGitCommonDirFn: () => commonDir };
  try {
    assert.equal(resetDenialClassesForSession("agent-x", "/unused", deps), "skipped");
    assert.equal(resetDenialClassesForSession("../agent-x", "/unused", deps), "skipped");
    assert.equal(resetDenialClassesForSession(null, "/unused", deps), "skipped");
    assert.equal(resetDenialClassesForSession("s1", "/unused", { resolveGitCommonDirFn: () => null }), "skipped");
    assert.ok(existsSync(agentFile));
  } finally {
    rmSync(commonDir, { recursive: true, force: true });
  }
});

test("the post-compact re-ground hook resets the session's trim state on every compaction it handles", () => {
  const source = readFileSync(fileURLToPath(new URL("../../hooks/post-compact-reground.mjs", import.meta.url)), "utf8");
  const run = source.slice(source.indexOf("export function run()"));
  const gate = run.indexOf("if (!shouldActivate(input)) process.exit(0);");
  const reset = run.indexOf("resetDenialClassesForSession(input?.session_id, rootDir);");
  assert.ok(gate > 0 && reset > gate, "the reset runs right after the compact gate, inside run()");
});
