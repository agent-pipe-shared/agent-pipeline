#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Regression pin for backlog item pipeline.unasked-advisor-export-consent-in-fresh-seed
 * (ALF-C-P1-03, AC-266). A fresh seed must never carry an unasked Advisor-export consent:
 * seed `declined`, ask approved|declined in the bundled first-answer round, bind the answer
 * to source + private receipt + replay checks, and let the lifecycle guard admit the exact
 * generated command while refusing it combined with trust-anchor flags. Every runner.
 * Real driver, real CLI, disposable temp roots and homes; nothing under test is mocked.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { applyInitialOnboardingAnswers, driveOnboardingInit } from "../../scripts/onboarding-init.mjs";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";
import { parseYaml } from "../yaml-lite.mjs";
import { readPhysicalCodexAdvisorConsent } from "../codex-advisor-admission.mjs";
import { createCodexAdvisorExecution } from "../codex-advisor-execution.mjs";

const RUNNERS = ["claude", "codex", "antigravity"];
const CLI = fileURLToPath(new URL("../../scripts/onboarding-init.mjs", import.meta.url));
// Fixtures live under the repository scratch/ (the guard read scope protects the OS temp root on native Windows).
const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
mkdirSync(SCRATCH, { recursive: true });
const made = [];
const tmp = (prefix) => { const path = realpathSync(mkdtempSync(join(SCRATCH, prefix))); made.push(path); return path; };
after(() => { for (const path of made) rmSync(path, { recursive: true, force: true }); });

const stubs = tmp("advisor-consent-pin-stubs-");
for (const runner of RUNNERS) {
  if (process.platform === "win32") writeFileSync(join(stubs, `${runner}.cmd`), "@echo off\r\nexit /b 0\r\n");
  else writeFileSync(join(stubs, runner), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

function envFor(home, runner) {
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home, PATH: [stubs, process.env.PATH].filter(Boolean).join(delimiter) };
  for (const key of ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"]) delete env[key];
  if (runner === "claude") env.CODEX_THREAD_ID = "ambient-codex-fixture"; else env.CLAUDECODE = "1";
  return env;
}
const inputNames = (ask) => (ask?.inputs ?? (ask?.input ? [ask.input] : [])).map((input) => input?.name);
const quote = (argv) => argv.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(" ");
const sourceOf = (root) => readFileSync(join(root, "pipeline.user.yaml"), "utf8");
const receiptPath = (root) => join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json");

for (const runner of RUNNERS) {
  test(`${runner}: fresh seed is declined, the first round asks approved|declined, and the answer is bound to source, receipt and replay`, () => {
    const root = tmp("advisor-consent-pin-root-");
    const home = tmp("advisor-consent-pin-home-");
    const env = envFor(home, runner);

    // 1. Seed: declined before any answer; nothing approved without being asked.
    const first = driveOnboardingInit({ rootDir: root, runner, env });
    assert.equal(first.pendingAsks.length, 1, "one bundled first-answer round");
    assert.equal(parseYaml(sourceOf(root)).advisor_export.consent, "declined");
    assert.doesNotMatch(sourceOf(root), /consent:\s*"?approved/u);
    assert.equal(existsSync(receiptPath(root)), false);

    // 2. The bundled ask carries the approved|declined question; the generated command requires it.
    const ask = first.pendingAsks[0];
    assert.deepEqual(inputNames(ask), ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"]);
    assert.ok(ask.applyAction.argv.includes("--advisor-export-consent"));
    assert.ok(ask.applyAction.argv.includes("<approved|declined>"));
    assert.equal(ask.applyAction.argv.some((value) => String(value).startsWith("--trust-anchor-")), false);

    // 3. Guard admits the exact generated command once answered; refuses it with trust-anchor flags.
    const answers = new Map([["<PO_GIT_AUTHOR_NAME>", "Pin PO"], ["<PO_GIT_AUTHOR_EMAIL>", "pin@example.invalid"],
      ["<signature|chat>", "chat"], ["<approved|declined>", "approved"], ["<de|en>", "en"]]);
    const argv = ask.applyAction.argv.map((value) => answers.get(value) ?? value);
    assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...argv]), root), true);
    const withAnchor = [...argv, "--trust-anchor-mode", "new", "--trust-anchor-directory", join(home, "anchor"),
      "--trust-anchor-human-name", "PO", "--trust-anchor-existing-key", "none"];
    assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...withAnchor]), root), false);

    // 4. The real CLI refuses a missing / invalid consent or a trust-anchor combination, writing nothing.
    const before = sourceOf(root);
    const base = ["--root", root, "--runner", runner, "--git-author-name", "Pin PO",
      "--git-author-email", "pin@example.invalid", "--human-approval", "chat", "--language", "en"];
    for (const extra of [[], ["--advisor-export-consent", "maybe"],
      ["--advisor-export-consent", "approved", "--trust-anchor-mode", "new", "--trust-anchor-directory", join(home, "anchor"),
        "--trust-anchor-human-name", "PO", "--trust-anchor-existing-key", "none"]]) {
      const call = spawnSync(process.execPath, [CLI, ...base, ...extra], { encoding: "utf8", shell: false, env });
      assert.equal(call.status, 2, `${JSON.stringify(extra)}: ${call.stderr || call.stdout}`);
      assert.equal(sourceOf(root), before);
      assert.equal(existsSync(receiptPath(root)), false);
    }
    const lonely = spawnSync(process.execPath, [CLI, "--root", root, "--runner", runner, "--advisor-export-consent", "approved"],
      { encoding: "utf8", shell: false, env });
    assert.equal(lonely.status, 2, "consent without the rest of the first round is refused");

    // 5. Approved answer lands atomically in source + receipt; replay is zero-write; changes conflict / drift.
    const apply = (consent) => applyInitialOnboardingAnswers({ rootDir: root, runner, env, pushApproval: "chat", language: "en",
      advisorExportConsent: consent, gitAuthorName: "Pin PO", gitAuthorEmail: "pin@example.invalid" });
    const applied = apply("approved");
    assert.equal(applied.code, "INITIAL-ANSWERS-APPLIED", JSON.stringify(applied));
    assert.equal(parseYaml(sourceOf(root)).advisor_export.consent, "approved");
    assert.equal(JSON.parse(readFileSync(receiptPath(root), "utf8")).advisorExportConsent, "approved");
    const sourceBytes = readFileSync(join(root, "pipeline.user.yaml"));
    const receiptBytes = readFileSync(receiptPath(root));
    assert.equal(apply("approved").code, "INITIAL-ANSWERS-APPLIED");
    assert.deepEqual(readFileSync(receiptPath(root)), receiptBytes);
    assert.equal(apply("declined").code, "INITIAL-ANSWERS-RECEIPT-CONFLICT");
    assert.deepEqual(readFileSync(join(root, "pipeline.user.yaml")), sourceBytes);
    writeFileSync(join(root, "pipeline.user.yaml"), sourceOf(root).replace(/(advisor_export:\r?\n[ ]+consent):\s*"approved"/u, '$1: "declined"'));
    assert.equal(apply("approved").code, "INITIAL-ANSWERS-SOURCE-DRIFT");
    writeFileSync(join(root, "pipeline.user.yaml"), sourceBytes);
  });
}

// Consumer: the Advisor export admission reads the physical source and exports only on `approved`.
const metadata = () => ({
  candidate: { commit: "a".repeat(40), tree: "b".repeat(40) },
  sources: { input: "i", prd: "p", spec: "s", design: "d", traceability: "t" },
  featureId: "F-1", profile: "feature", reason: "risk-review", dispatch: { dispatchId: "D-1" },
  route: { model: "m", effort: "low" },
});
async function admitWith(sourceText) {
  const root = tmp("advisor-consent-pin-consumer-");
  if (sourceText !== null) writeFileSync(join(root, "pipeline.user.yaml"), sourceText);
  let exportAsked = 0;
  const execution = createCodexAdvisorExecution({ repoRoot: root, admission: {
    requireReady: async () => ({ status: "ready" }),
    observeCurrentMetadata: async (snapshot) => structuredClone(snapshot),
    observeRegisteredRoute: async (snapshot) => structuredClone(snapshot.route),
    admitHostExport: async () => { exportAsked += 1; return { decision: "approved" }; },
  } });
  const result = await execution.admitSourceMetadata(metadata());
  return { result, exportAsked };
}

test("consumer: a declined seed refuses the Advisor export before the host export capability is asked", async () => {
  const root = tmp("advisor-consent-pin-seed-");
  driveOnboardingInit({ rootDir: root, runner: "codex", env: envFor(tmp("advisor-consent-pin-home-"), "codex") });
  assert.equal(readPhysicalCodexAdvisorConsent(root).consent, "declined");
  const { result, exportAsked } = await admitWith(sourceOf(root));
  assert.equal(result.status, "refused");
  assert.equal(result.code, "advisor-repository-export-declined");
  assert.equal(exportAsked, 0);
});

test("consumer: a missing advisor_export field is treated as disabled, never as approved", async () => {
  for (const text of ["schema: x\n", "advisor_export: {}\n", "advisor_export:\n  consent: \"maybe\"\n"]) {
    const { result, exportAsked } = await admitWith(text);
    assert.notEqual(result.status, "admitted", JSON.stringify(text));
    assert.equal(result.code, "advisor-host-admission-unavailable");
    assert.equal(exportAsked, 0);
  }
  const { result, exportAsked } = await admitWith(null);
  assert.notEqual(result.status, "admitted");
  assert.equal(exportAsked, 0);
});

test("consumer: only an explicit approved answer reaches the host export capability and is admitted", async () => {
  const { result, exportAsked } = await admitWith('advisor_export:\n  consent: "approved"\n');
  assert.equal(result.status, "admitted", JSON.stringify(result));
  assert.equal(exportAsked, 1);
});

test("omitted consent defaults to declined at the library seam and an explicit declined is bound too", () => {
  const root = tmp("advisor-consent-pin-root-");
  const home = tmp("advisor-consent-pin-home-");
  const env = envFor(home, "claude");
  assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
  const applied = applyInitialOnboardingAnswers({ rootDir: root, runner: "claude", env, pushApproval: "chat", language: "en",
    gitAuthorName: "Pin PO", gitAuthorEmail: "pin@example.invalid" });
  assert.equal(applied.code, "INITIAL-ANSWERS-APPLIED", JSON.stringify(applied));
  assert.equal(applied.advisorExportConsent, "declined");
  assert.equal(parseYaml(sourceOf(root)).advisor_export.consent, "declined");
  assert.equal(JSON.parse(readFileSync(receiptPath(root), "utf8")).advisorExportConsent, "declined");
});
