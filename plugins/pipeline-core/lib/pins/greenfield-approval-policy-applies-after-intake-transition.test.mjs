#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Regression pin for backlog item pipeline.greenfield-approval-policy-applies-after-intake-transition
 * (ALF-C-P20-02, AC-189). Acceptance points, each exercised through the real driver / real CLI
 * entry (`onboarding-init.mjs` `driveOnboardingInit` + `main`) with the real lifecycle guard:
 *   P1 a fresh project records the answered approval modes in the first answer round, before any
 *      plan signing or export decision, and no second ask for them follows;
 *   P2 the returned action is executable in the phase that returns it (guard admits it filled);
 *   P3 a replay of the answered action exits 0 with a matching readback, never `no-progress`
 *      and never a ready-but-exit-1; a conflicting replay is a typed refusal that writes nothing;
 *   P4 the historical sequence cannot be replayed from here (item Triage: unconfirmed); the pin
 *      verifies the CURRENT sequence instead: answers land while the intake checkpoint is still
 *      absent and do not manufacture intake consent;
 *   P5 every published pendingAsks[].applyAction, in every phase this fixture walks (fresh,
 *      signature-answered, chat-answered), is admitted by the guard once filled, or is withheld.
 * Negative controls prove the assertion helpers can fail. Nothing under test is mocked; the only
 * seams are `main`'s documented `drive` injection (control case) and a fixture homedir override.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { driveOnboardingInit, main } from "../../scripts/onboarding-init.mjs";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";
import { readOnboardingIntakeCheckpoint } from "../onboarding-continuity.mjs";
import { parseYaml } from "../yaml-lite.mjs";

const RUNNERS = ["claude", "codex", "antigravity"];
// Fixtures live under the repository scratch/ (the guard read scope protects the OS temp root on native Windows).
const SCRATCH = fileURLToPath(new URL("../../../../scratch/", import.meta.url));
mkdirSync(SCRATCH, { recursive: true });
const made = [];
const tmp = (prefix) => { const path = realpathSync(mkdtempSync(join(SCRATCH, prefix))); made.push(path); return path; };
after(() => { for (const path of made) rmSync(path, { recursive: true, force: true }); });

const stubs = tmp("approval-policy-pin-stubs-");
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
const quote = (argv) => argv.map((value) => `'${String(value).replaceAll("'", "'\\''")}'`).join(" ");
const sourcePath = (root) => join(root, "pipeline.user.yaml");
const sourceOf = (root) => readFileSync(sourcePath(root), "utf8");
const receiptPath = (root) => join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json");
const inputNames = (action) => (action?.inputs ?? (action?.input ? [action.input] : [])).map((input) => input?.name);
const FIRST_ROUND = ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"];
// The later intake ask legitimately carries its own `language` input (already-confirmed value), so the
// "no second ask" check covers the approval-policy round only: identity, approval mode and export consent.
const NOT_REASKED = FIRST_ROUND.filter((name) => name !== "language");
// A loaded Windows host can exceed the driver's 90 s default budget; the documented `drive` seam widens it only.
const WIDE_BUDGET_MS = 600_000;
const wideDrive = (options) => driveOnboardingInit({ ...options, runBudgetMs: WIDE_BUDGET_MS });

function fresh(runner) {
  const root = tmp("approval-policy-pin-root-");
  const home = tmp("approval-policy-pin-home-");
  const env = envFor(home, runner);
  const first = driveOnboardingInit({ rootDir: root, runner, env, runBudgetMs: WIDE_BUDGET_MS });
  return { root, home, env, runner, first };
}
// The first-round action is published either as a pending ask or as the collect-input itself.
const firstAction = (first) => first.pendingAsks?.[0] ?? first.collectInput;
const fillFirst = (action, mode) => {
  const answers = new Map([["<PO_GIT_AUTHOR_NAME>", "Pin PO"], ["<PO_GIT_AUTHOR_EMAIL>", "pin@example.invalid"],
    ["<signature|chat>", mode], ["<approved|declined>", "declined"], ["<de|en>", "en"]]);
  return action.applyAction.argv.map((value) => answers.get(value) ?? value);
};
function runCli(argv, env, drive) {
  let out = ""; let err = "";
  const exit = main(argv.slice(1), { env, write: (text) => { out += text; }, writeError: (text) => { err += text; }, drive: drive ?? wideDrive });
  return { exit, out, err, json: JSON.parse(out) };
}
// Every published action in a driver result (pending asks and the collect-input action).
const publishedActions = (result) => [...(result.pendingAsks ?? []), ...(result.collectInput ? [result.collectInput] : [])]
  .filter((action) => Array.isArray(action?.applyAction?.argv));

// Shared assertion: the answered mode is recorded in source (both gates), the private receipt and nothing else moved.
function assertAnswerRecorded(root, mode) {
  const source = parseYaml(sourceOf(root));
  assert.equal(source.gates.human_approval, mode, "gates.human_approval carries the answered mode");
  assert.equal(source.gates.push_approval, mode, "gates.push_approval carries the answered mode");
  assert.equal(JSON.parse(readFileSync(receiptPath(root), "utf8")).pushApprovalPreference, mode, "the repository receipt carries the answered mode");
}
// Shared assertion: no second ask for any first-round answer is published after the answers.
function assertNoSecondAsk(result) {
  for (const action of publishedActions(result)) {
    const names = inputNames(action);
    for (const name of NOT_REASKED) assert.equal(names.includes(name), false, `second ask for ${name}`);
    assert.equal(action.applyAction.argv.includes("--human-approval"), false, "no second approval-mode action");
  }
}

// Runtime cut: every runner and both modes are exercised, but each runner path only once
// (claude covers both modes; codex signature; antigravity chat). P4 is merged into these cases.
const MATRIX = [["claude", "signature"], ["claude", "chat"], ["codex", "signature"], ["antigravity", "chat"]];
{
  for (const [runner, mode] of MATRIX) {
    test(`${runner}/${mode}: P1+P2+P3+P4 first round is guard-admitted, exits 0, records both gates, asks nothing twice, replays to exit 0, leaves intake absent`, () => {
      const { root, env, first } = fresh(runner);
      // P4: the answer lands while the intake checkpoint is absent (checked again after the answer).
      assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "local" }).status, "absent");
      assert.ok(["signature", "chat"].includes(parseYaml(sourceOf(root)).gates.push_approval));
      // P2: the first round carries the approval question and its published action is admitted when answered.
      const ask = firstAction(first);
      assert.ok(ask, `first round published an action: ${first.outcome}`);
      assert.deepEqual(inputNames(ask), FIRST_ROUND);
      assert.ok(ask.applyAction.argv.includes("--human-approval"));
      const argv = fillFirst(ask, mode);
      assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...argv]), root), true);

      // P1: before the answer, nothing is recorded for this mode on a non-existent receipt.
      assert.equal(existsSync(receiptPath(root)), false);
      const before = runCli(argv, env);
      // P3: success exits 0 with a matching readback and is never classified no-progress.
      assert.equal(before.exit, 0, before.out);
      assert.equal(before.json.initialAnswers.ok, true);
      assert.equal(before.json.initialAnswers.code, "INITIAL-ANSWERS-APPLIED");
      assert.equal(before.json.initialAnswers.pushApprovalPreference, mode);
      assert.notEqual(before.json.outcome, "no-progress");
      assertAnswerRecorded(root, mode);
      assertNoSecondAsk(before.json);

      // P3: the exact replay is zero-write, exits 0 and carries the same readback (the ready-but-exit-1 shape).
      const sourceBytes = readFileSync(sourcePath(root));
      const receiptBytes = readFileSync(receiptPath(root));
      const replay = runCli(argv, env);
      assert.equal(replay.exit, 0, replay.out);
      assert.equal(replay.json.initialAnswers.code, "INITIAL-ANSWERS-APPLIED");
      assert.notEqual(replay.json.outcome, "no-progress");
      assert.deepEqual(readFileSync(sourcePath(root)), sourceBytes);
      assert.deepEqual(readFileSync(receiptPath(root)), receiptBytes);
      assertNoSecondAsk(replay.json);

      // P3: a conflicting second answer is a typed refusal (exit 1) that writes nothing.
      const other = mode === "signature" ? "chat" : "signature";
      const conflict = runCli(fillFirst(ask, other), env);
      assert.equal(conflict.exit, 1);
      assert.equal(conflict.json.initialAnswers.code, "INITIAL-ANSWERS-RECEIPT-CONFLICT");
      assert.deepEqual(readFileSync(sourcePath(root)), sourceBytes);
      assert.deepEqual(readFileSync(receiptPath(root)), receiptBytes);
      assertAnswerRecorded(root, mode);
      // P4: no intake consent or plan artifact was manufactured by the answers.
      assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "local" }).status, "absent");
      assert.equal(existsSync(join(root, "specs")), false, "no plan/spec artifact exists before the intake decision");
    });
  }
}

// P5: every published applyAction is admitted in the phase that publishes it (fresh, signature-answered, chat-answered).
const ANCHOR_SHAPES = (home) => [
  ["new", join(home, "anchor-new"), "PO", "none"],
  ["existing", join(home, "anchor-existing"), "PO", join(home, "anchor-existing", "po-key")],
];
for (const runner of ["claude"]) {
  test(`${runner}: P5 every published pendingAsks applyAction is guard-admitted once filled, in every phase it is published`, () => {
    const phases = [];
    const sig = fresh(runner);
    phases.push({ label: "fresh", result: sig.first, root: sig.root, mode: null });
    const sigRun = runCli(fillFirst(firstAction(sig.first), "signature"), sig.env);
    phases.push({ label: "signature-answered", result: sigRun.json, root: sig.root, mode: "signature" });
    const chat = fresh(runner);
    const chatRun = runCli(fillFirst(firstAction(chat.first), "chat"), chat.env);
    phases.push({ label: "chat-answered", result: chatRun.json, root: chat.root, mode: "chat" });

    let anchorAsks = 0;
    for (const { label, result, root, mode } of phases) {
      const home = label === "chat-answered" ? chat.home : sig.home;
      for (const action of publishedActions(result)) {
        const argv = action.applyAction.argv;
        if (argv.includes("--trust-anchor-mode")) {
          anchorAsks += 1;
          assert.equal(mode, "signature", `${label}: a chat route must never publish the trust-anchor ask`);
          assert.equal(argv.includes("--human-approval"), false, `${label}: anchor ask is separate from the first round`);
          for (const [anchorMode, directory, name, key] of ANCHOR_SHAPES(home)) {
            const answers = new Map([["<existing|new>", anchorMode], ["<absolute external key directory>", directory],
              ["<human attribution>", name], ["<absolute existing key path|none>", key]]);
            const filled = argv.map((value) => answers.get(value) ?? value);
            assert.equal(filled.some((value) => /^<.*>$/u.test(value)), false, `${label}: unfilled placeholder in ${JSON.stringify(argv)}`);
            assert.equal(isSanctionedLifecycleCommand(quote([action.applyAction.executable, ...filled]), root), true,
              `${label}/${anchorMode}: published anchor action refused by the guard`);
          }
        } else if (argv.includes("--human-approval")) {
          assert.equal(label, "fresh", "the approval round is published only in the fresh phase");
          const filled = fillFirst(action, "signature");
          assert.equal(isSanctionedLifecycleCommand(quote([action.applyAction.executable, ...filled]), root), true, `${label}: first-round action refused`);
        }
      }
    }
    assert.ok(anchorAsks >= 1, "the signature route publishes the separate trust-anchor ask (otherwise it must be withheld with a typed recovery, which this case does not accept silently)");
  });
}

// Negative controls: each acceptance assertion can fail.
test("control: assertAnswerRecorded fails on a fresh seed and on a source whose approval was left unanswered", () => {
  const { root } = fresh("claude");
  assert.throws(() => assertAnswerRecorded(root, "signature"), /ENOENT|carries the answered mode/u, "no answer -> no receipt -> red");
  const tampered = tmp("approval-policy-pin-tampered-");
  mkdirSync(join(tampered, ".git", "agent-pipeline"), { recursive: true });
  writeFileSync(receiptPath(tampered), JSON.stringify({ pushApprovalPreference: "signature" }));
  writeFileSync(sourcePath(tampered), 'gates:\n  human_approval: "chat"\n  push_approval: "signature"\n');
  assert.throws(() => assertAnswerRecorded(tampered, "signature"), /human_approval carries the answered mode/u);
});

test("control: assertNoSecondAsk fails when the first-round ask is republished; guard refuses an unfilled action", () => {
  const { root, first } = fresh("claude");
  assert.throws(() => assertNoSecondAsk(first), /second ask|second approval/u);
  const ask = firstAction(first);
  assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...ask.applyAction.argv]), root), false,
    "placeholders left in place are not an executable action");
});

test("control: the driver result is sensitive to no-progress - a drive that reports it makes main exit 1, so the exit-0 assertions above can fail", () => {
  const { root, env, first } = fresh("claude");
  const argv = fillFirst(firstAction(first), "signature");
  const stalled = runCli(argv, env, () => ({ outcome: "no-progress" }));
  assert.equal(stalled.exit, 1);
  assert.equal(stalled.json.initialAnswers.code, "INITIAL-ANSWERS-APPLIED", "the mutation itself had succeeded - only the stalled drive flips the exit");
  assertAnswerRecorded(root, "signature");
});
