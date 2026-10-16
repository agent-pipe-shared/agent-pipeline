#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pin: pipeline.greenfield-machine-output-and-skill-budget (AC-192).
 * Acceptance points: (1) each pending ask is emitted once by the CLI response;
 * (2) long override instructions sit behind a bounded, digest-keyed read-only
 * `plan` action with reason/scope/recovery kept inline; (3) the mandatory start
 * skill stays concise with runner detail in lazy references; (4) first-run and
 * denial output bytes are bounded for all three runners.
 * Real module/CLI is exercised; only the module's documented injection seams
 * (humanOverrideRoute dependencies) are used. Fixtures live under scratch/.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import { humanOverrideRoute } from "../guard/denial-route.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const scratch = join(repoRoot, "scratch", `greenfield-output-budget-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));

const RUNNERS = ["claude", "codex", "antigravity"];
const FIRST_RUN_MAX_BYTES = 45_000; // BOOTSTRAP_PAYLOAD_MAX_BYTES ceiling
const DENIAL_MAX_BYTES = 2_048;
const SKILL_MAX_BYTES = 24 * 1024;

function firstRun(runner) {
  const root = join(scratch, `root-${runner}`);
  const home = join(scratch, `home-${runner}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
  const run = spawnSync(process.execPath, [join(pluginRoot, "scripts", "onboarding-init.mjs"), "--root", root, "--runner", runner], {
    encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `${runner}: ${run.stderr}`);
  return { stdout: run.stdout, parsed: JSON.parse(run.stdout) };
}

// AC point 1 + 4 (first-run): pending asks are printed exactly once and bounded.
for (const runner of RUNNERS) {
  test(`first-run output for ${runner}: asks appear once and stay within budget`, () => {
    const { stdout, parsed } = firstRun(runner);
    assert.ok(Buffer.byteLength(stdout, "utf8") <= FIRST_RUN_MAX_BYTES, `${runner}: first-run output over budget`);
    if (parsed.outcome === "pending-asks") {
      assert.ok(parsed.pendingAsks.length > 0);
      assert.equal(parsed.final?.nextAction?.pendingAsks, undefined, "ask repeated inside final.nextAction");
      const firstAskMarker = JSON.stringify(parsed.pendingAsks[0].applyAction ?? parsed.pendingAsks[0].input);
      assert.equal(stdout.split(firstAskMarker).length - 1, 1, `${runner}: first ask serialized more than once`);
    } else {
      assert.ok(["collect-input", "ready", "external-operator"].includes(parsed.outcome), `${runner}: unexpected ${parsed.outcome}`);
    }
  });
}

// RED proof: a mirror of the printer WITHOUT the dedupe fails the same predicate.
test("dedupe predicate is meaningful: an un-deduplicated mirror is detected (RED mirror)", () => {
  const ask = { kind: "collect-input", applyAction: { argv: ["x"] } };
  const result = { outcome: "pending-asks", pendingAsks: [ask], final: { nextAction: { pendingAsks: [ask] } } };
  const mirrorPrinted = JSON.stringify(result);
  const marker = JSON.stringify(ask.applyAction);
  assert.equal(mirrorPrinted.split(marker).length - 1, 2, "mirror emits twice, so the real assertion can fail");
});

// AC point 2 + 4 (denial): inline text bounded, digest-keyed plan action, reason/scope/recovery kept.
const DIGEST = "ab".repeat(32);
for (const [runner, toolName] of [["claude", "Bash"], ["codex", "shell"], ["antigravity", "PowerShell"]]) {
  for (const mode of ["signature", "chat"]) {
    test(`denial guidance for ${runner}/${mode}: bounded, digest-keyed, scope and recovery inline`, () => {
      const route = humanOverrideRoute("GUARD-TEST", "reason", "command", scratch, toolName, { command: "x" }, {
        consumeHumanGuardOverrideFn: () => ({ status: "absent" }),
        recordHumanGuardDenialFn: () => ({ status: "planned", requestSha256: DIGEST }),
        readHumanApprovalModeFn: () => ({ mode }),
      });
      assert.equal(route.admitted, null);
      const text = route.overrideGuidance;
      assert.ok(Buffer.byteLength(text, "utf8") <= DENIAL_MAX_BYTES, `${runner}/${mode}: ${Buffer.byteLength(text, "utf8")} B`);
      // The copy-safe renderer wraps long arguments across `CMD=${CMD}'...` (POSIX) or
      // `$CMD += '...` (PowerShell) continuation lines; rejoin them to read the real argument.
      const unwrapped = text.replace(/'\r?\n(?:CMD=\$\{CMD\}'|\$CMD \+= ')/gu, "");
      assert.ok(unwrapped.includes(`--request-sha256`), "plan action must pass the request digest flag");
      assert.ok(unwrapped.includes(DIGEST), "plan action must be keyed by the exact request digest");
      assert.match(text, /plan/u);
      assert.match(text, /this exact command/u, "explicit scope inline");
      assert.match(text, /one use; audited/u, "recovery action and bounds inline");
      assert.match(text, mode === "chat" ? /chat is attribution, not proof/u : /Ed25519/u);
      assert.ok(Buffer.byteLength(route.repeatOverrideGuidance, "utf8") < Buffer.byteLength(text, "utf8") + 64);
      assert.ok(Buffer.byteLength(route.repeatOverrideGuidance, "utf8") <= DENIAL_MAX_BYTES);
    });
  }
}

// AC point 3: concise common skill, runner detail lazy.
test("mandatory start skill is concise and defers runner detail to lazy references", () => {
  const skillDir = join(pluginRoot, "skills", "pipeline-start");
  const core = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  assert.ok(Buffer.byteLength(core, "utf8") <= SKILL_MAX_BYTES, "start skill over 24 KiB");
  for (const name of ["model-role-codex-claude.md", "model-role-antigravity.md"]) {
    assert.ok(existsSync(join(skillDir, "references", name)), `${name} missing`);
    assert.ok(core.includes(`references/${name}`), `core must point lazily at ${name}`);
  }
  assert.doesNotMatch(core, /host-session-id/u, "Antigravity-only detail leaked into the common path");
  assert.match(core, /approval/iu, "PO boundary must stay in the common path");
});
