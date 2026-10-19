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
 *   P4 answers land while the intake checkpoint is still absent and do not manufacture intake consent;
 *   P5 every published pendingAsks[].applyAction, in every phase this fixture walks (fresh,
 *      signature-answered, chat-answered), is admitted by the guard once filled, or is withheld;
 *   P6 the historical sequence (PO selects signature while pipeline.user.yaml still says chat; the
 *      returned policy action refused; a later driver call reporting no-progress/exit 1 despite a
 *      signature readback) is replayed on the current product through the real publisher's first
 *      pendingAsks[].applyAction: it does not reproduce. The fresh seed already says signature, so
 *      the chat precondition is written into the fixture before the answer (the matrix above never
 *      flips chat -> signature). The one reproducible refusal cause is an action without its
 *      `--language` pair, which the guard and the CLI both reject.
 * Residue not replayable here: a `ready` lifecycle readback that still publishes a command whose
 * execution changes nothing would make the driver stop as `no-progress` (exit 1) with a matching
 * signature readback. Reaching `ready` needs intake consent and a signing trust anchor, which this
 * pin deliberately never grants (P4), so that variant is classified, not claimed.
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

// P6: controlled replay of the historical fresh-intake sequence on the Codex runner: signature is selected while
// pipeline.user.yaml still says chat, through the real publisher's first action, the real guard and the real CLI.
test("codex: P6 replay - signature selected while pipeline.user.yaml says chat is admitted, exits 0 with a matching readback, and later driver calls never stall", () => {
  const { root, home, env, first } = fresh("codex");
  // Precondition of the historical sequence: the user file still says chat (the fresh seed says signature).
  writeFileSync(sourcePath(root), sourceOf(root).replace(/(human_approval|push_approval):\s*"?signature"?/gu, '$1: "chat"'));
  assert.equal(parseYaml(sourceOf(root)).gates.human_approval, "chat", "fixture precondition: human_approval says chat");
  assert.equal(parseYaml(sourceOf(root)).gates.push_approval, "chat", "fixture precondition: push_approval says chat");
  assert.throws(() => assertAnswerRecorded(root, "signature"), /ENOENT|carries the answered mode/u, "before the answer, signature is not recorded");
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "local" }).status, "absent");

  // The returned policy action is executable in the intake phase that returns it (guard admits it filled).
  const ask = firstAction(first);
  assert.ok(ask, `first round published an action: ${first.outcome}`);
  const argv = fillFirst(ask, "signature");
  const flagValue = (flag) => argv[argv.indexOf(flag) + 1];
  assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...argv]), root), true);
  // The one refusal cause that does reproduce: the same action without its language pair is no executable action.
  const languageAt = argv.indexOf("--language");
  assert.ok(languageAt > 0, "the published first-round action carries --language");
  const withoutLanguage = argv.filter((_, index) => index !== languageAt && index !== languageAt + 1);
  assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...withoutLanguage]), root), false);
  let refusedOut = ""; let refusedErr = "";
  assert.equal(main(withoutLanguage.slice(1), { env, write: (text) => { refusedOut += text; }, writeError: (text) => { refusedErr += text; }, drive: () => assert.fail("a refused answer must not drive") }), 2);
  assert.match(refusedErr, /initial answers require --language/u);
  assert.equal(refusedOut, "");
  assert.equal(parseYaml(sourceOf(root)).gates.push_approval, "chat", "the refused answer wrote nothing");
  assert.equal(existsSync(receiptPath(root)), false, "the refused answer left no receipt");

  // The admitted answer exits 0 with a matching readback (chat -> signature) and is never classified no-progress.
  const answered = runCli(argv, env);
  assert.equal(answered.exit, 0, answered.out);
  assert.equal(answered.json.initialAnswers.ok, true);
  assert.equal(answered.json.initialAnswers.code, "INITIAL-ANSWERS-APPLIED");
  assert.equal(answered.json.initialAnswers.pushApprovalPreference, "signature");
  assert.notEqual(answered.json.outcome, "no-progress");
  assertAnswerRecorded(root, "signature");
  assertNoSecondAsk(answered.json);
  assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "local" }).status, "absent");

  // Later bare driver calls (the historical ready-but-exit-1 position): each exits 0, none stalls, readback unchanged,
  // and the separate trust-anchor ask they publish is admitted by the guard once filled.
  const laterArgv = [argv[0], "--root", flagValue("--root"), "--runner", flagValue("--runner")];
  assert.equal(isSanctionedLifecycleCommand(quote([ask.applyAction.executable, ...laterArgv]), root), true);
  const sourceBytes = readFileSync(sourcePath(root));
  const receiptBytes = readFileSync(receiptPath(root));
  let anchorAsks = 0;
  for (const call of [1, 2]) {
    const later = runCli(laterArgv, env);
    assert.equal(later.exit, 0, `later driver call ${call}: ${later.out}`);
    assert.notEqual(later.json.outcome, "no-progress", `later driver call ${call} stalled`);
    assert.equal(later.json.initialAnswers, undefined, "a bare driver call applies no answers");
    assert.deepEqual(readFileSync(sourcePath(root)), sourceBytes, `later driver call ${call} rewrote the user file`);
    assert.deepEqual(readFileSync(receiptPath(root)), receiptBytes, `later driver call ${call} rewrote the receipt`);
    assertAnswerRecorded(root, "signature");
    assertNoSecondAsk(later.json);
    for (const action of publishedActions(later.json).filter((entry) => entry.applyAction.argv.includes("--trust-anchor-mode"))) {
      anchorAsks += 1;
      for (const [anchorMode, directory, name, key] of ANCHOR_SHAPES(home)) {
        const answers = new Map([["<existing|new>", anchorMode], ["<absolute external key directory>", directory],
          ["<human attribution>", name], ["<absolute existing key path|none>", key]]);
        const filled = action.applyAction.argv.map((value) => answers.get(value) ?? value);
        assert.equal(filled.some((value) => /^<.*>$/u.test(value)), false, `unfilled placeholder in ${JSON.stringify(action.applyAction.argv)}`);
        assert.equal(isSanctionedLifecycleCommand(quote([action.applyAction.executable, ...filled]), root), true,
          `later driver call ${call}/${anchorMode}: published anchor action refused by the guard`);
      }
    }
  }
  assert.ok(anchorAsks >= 2, "each later driver call publishes the separate trust-anchor ask (or it must be withheld with a typed recovery)");
  assert.equal(existsSync(join(root, "specs")), false, "no plan/spec artifact exists before the intake decision");
});

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
