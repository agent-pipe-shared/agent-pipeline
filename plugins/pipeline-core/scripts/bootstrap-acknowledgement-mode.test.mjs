// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { main } from "./project-onboarding-v3.mjs";
import { planOnboardingBootstrapAcknowledgementChat, resolveIntakeCheckpointPaths } from "../lib/onboarding-continuity.mjs";
import { readHumanApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { readMachinePlane } from "../lib/machine-plane.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

// Static finished inputs: no onboarding, acknowledgement or approval is applied.
// Only disposable fixture Git history records the policy needed by its real reader.
function finishedFixture(mode) {
  const scratch = join(repo, "scratch");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "bootstrap-mode-"));
  function git(args) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    assert.equal(result.status, 0, result.stderr);
  }
  git(["init", "-q"]);
  writeFileSync(join(root, "pipeline.user.yaml"), `schema: pipeline.user.v0\nlanguage:\n  human_facing: en\ngates:\n  human_approval: ${mode}\n`);
  git(["add", "--", "pipeline.user.yaml"]);
  git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Disposable Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "fixture policy", "--", "pipeline.user.yaml"]);
  const at = "2026-10-09T00:00:00.000Z";
  const featureId = `onboarding-${digest(at).slice(0, 12)}`;
  const directory = join(root, "specs", featureId);
  mkdirSync(directory, { recursive: true });
  const spec = "# Specification\n\nAC-01: WHEN the planner reads committed chat mode, the system SHALL offer chat acknowledgement.\n\n## Architecture\nThe CLI reads the committed policy and delegates to the shared acknowledgement planner. The generated checkpoint owns package paths. Planning preserves package bytes.\n";
  const prd = `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${digest(spec)} -->\n# Bootstrap acknowledgement\n\nOffer the configured acknowledgement ceremony for this completed design.\n\n## Scope\nSelect chat or signature from committed project policy. Preserve activation and trust requirements.\n\n## Architecture\nThe command delegates to the shared planner; the checkpoint binds this PRD and specification. No new architectural decision is needed.\n`;
  const designInput = "# Design input\nSelect the configured human acknowledgement ceremony.\n";
  writeFileSync(join(directory, "spec.md"), spec);
  writeFileSync(join(directory, `prd_${featureId}.md`), prd);
  writeFileSync(join(directory, "design-input.md"), designInput);
  const checkpoint = {
    schema: "pipeline.onboarding-intake-checkpoint.v1", root, revision: 4,
    createdAt: at, updatedAt: at, consent: { granted: true, at },
    values: { gitAuthor: null, language: "en", profile: "mini" },
    materialInput: [], designQuestions: [{ question: "What should planning offer?", answer: "The configured ceremony.", answeredAt: at }],
    transactionState: "generated",
    generated: { designInputSha256: digest(designInput), prdSha256: digest(prd), specSha256: digest(spec), generatedAt: at },
  };
  const paths = resolveIntakeCheckpointPaths({ rootDir: root });
  mkdirSync(dirname(paths.checkpoint), { recursive: true, mode: 0o700 });
  writeFileSync(paths.checkpoint, JSON.stringify({ ...checkpoint, contentSha256: digest(canonical(checkpoint)) }) + "\n", { mode: 0o600 });
  const isolatedHome = join(root, "isolated-machine");
  mkdirSync(isolatedHome);
  const deps = { readMachinePlane: () => readMachinePlane({ homedirFn: () => isolatedHome }) };
  assert.equal(readHumanApprovalMode(root).mode, mode, "real policy reader must see committed fixture mode");
  assert.equal(deps.readMachinePlane().status, "absent");
  return { root, deps, prdPath: join(directory, `prd_${featureId}.md`), specPath: join(directory, "spec.md") };
}

function invoke(fixture, activate = true) {
  let output = "", error = "";
  const args = ["bootstrap-acknowledge-plan", "--root", fixture.root, "--runner", "codex"];
  if (activate) args.push("--activate");
  const code = main(args, { deps: fixture.deps, write: (chunk) => { output += chunk; }, writeError: (chunk) => { error += chunk; } });
  return { code, result: output ? JSON.parse(output) : null, error };
}

registerTestCaseCompletion({ fd: 3, maxBytes: 16384, cases: [
  { id: "BAM001", name: "finished chat fixture reaches the real chat planner without a trust anchor", run() {
    const fixture = finishedFixture("chat");
    try {
      const plan = planOnboardingBootstrapAcknowledgementChat({ rootDir: fixture.root });
      assert.equal(plan.status, "confirmation-required");
      assert.equal(plan.nextAction.argv[1], "bootstrap-acknowledge-chat-apply");
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  } },
  { id: "BAM002", name: "CLI chat configuration returns exactly the chat plan on the same finished fixture", run() {
    const fixture = finishedFixture("chat");
    try {
      const expected = planOnboardingBootstrapAcknowledgementChat({ rootDir: fixture.root });
      const before = [readFileSync(fixture.prdPath), readFileSync(fixture.specPath)];
      const actual = invoke(fixture);
      assert.deepEqual([readFileSync(fixture.prdPath), readFileSync(fixture.specPath)], before);
      assert.equal(actual.code, 0, actual.error);
      assert.deepEqual(actual.result, expected);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  } },
  { id: "BAM003", name: "signature configuration with no anchor refuses instead of downgrading to chat", run() {
    const fixture = finishedFixture("signature");
    try {
      assert.equal(planOnboardingBootstrapAcknowledgementChat({ rootDir: fixture.root }).status, "confirmation-required");
      const actual = invoke(fixture);
      assert.notEqual(actual.code, 0);
      assert.match(actual.error, /BOOTSTRAP-ACK-TRUST-ANCHOR-UNAVAILABLE/u);
      assert.equal(actual.result, null);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  } },
  { id: "BAM004", name: "both configured modes preserve explicit activation", run() {
    for (const mode of ["chat", "signature"]) {
      const fixture = finishedFixture(mode);
      try {
        const actual = invoke(fixture, false);
        assert.notEqual(actual.code, 0);
        assert.match(actual.error, /BOOTSTRAP-ACK-ACTIVATION-REQUIRED/u);
        assert.equal(actual.result, null);
      } finally { rmSync(fixture.root, { recursive: true, force: true }); }
    }
  } },
] });
