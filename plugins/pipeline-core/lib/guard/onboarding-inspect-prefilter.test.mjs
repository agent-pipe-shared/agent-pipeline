// SPDX-License-Identifier: SUL-1.0
// ALF-C-HK-01B regression: the shell lane must not run a complete onboarding
// inspection (on native Windows: one PowerShell DACL probe per private path)
// for a command that cannot possibly equal the observed next action. The
// precondition is a pure function of the parsed words; what is matched,
// admitted and refused must stay exactly what it was.
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isExactObservedOnboardingNextAction, observedOnboardingCommandMatch, sameNodeInterpreter, sameObservedArgvWord } from "./command-catalogue.mjs";
import { devPlanShellRefusalHit } from "./devplan-shell-lane.mjs";
import { simpleWords } from "./shell-grammar.mjs";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
// No fixture is materialized; this path only anchors injected observations.
const root = join(repository, "scratch/.onboarding-inspect-prefilter-fixture");
// Words stay in their native form (so the published argv[0] equals the repository
// script constant on every platform) and are single-quoted: the closed grammar
// refuses a backslash inside double quotes but takes it literally inside single
// quotes (same spelling as recoveryCommandFor in devplan-shell-sanctioned-recovery.test.mjs).
const rootWord = root;
const onboardingScript = fileURLToPath(new URL("../../scripts/project-onboarding-v3.mjs", import.meta.url));
const stateScript = fileURLToPath(new URL("../../scripts/pipeline-state.mjs", import.meta.url));
const GUARD_NODE = process.execPath;
const FOREIGN_NODE = "/opt/producer-node/bin/node";
const commandFor = (words) => words.map((word) => "'" + word.replaceAll("'", "'\\''") + "'").join(" ");
const observation = (action) => ({
  schema: "pipeline.project-onboarding.v4", status: "partial", root, intent: "session",
  diagnostics: [{ code: "po_authority_rebind_unavailable" }], nextAction: action,
});
function counting(action) {
  let reads = 0;
  return {
    inspectProjectOnboardingV3Fn(input) {
      assert.equal(input.rootDir, root);
      assert.equal(input.intent, "session");
      reads += 1;
      return observation(action);
    },
    devPlanGateVerdictFn: () => ({ verdict: "block", reason: "fixture draft lifecycle", lifecycleStatus: "draft" }),
    reads: () => reads,
  };
}
const planner = (executable) => Object.freeze({
  kind: "command", executable, argv: Object.freeze([stateScript, "po-authority-rebind-plan"]),
  mutation: false, requiresConfirmation: false,
});

// The body of observedOnboardingCommandMatch before the precondition existed,
// kept as an independent reference so equivalence is measured, not asserted.
function legacyMatch(command, dependencies) {
  const words = simpleWords(command, root);
  if (!words) return null;
  let observed;
  try {
    observed = dependencies.inspectProjectOnboardingV3Fn({ rootDir: root, intent: "session", runner: dependencies.runner });
  } catch {
    return null;
  }
  const action = observed?.nextAction;
  if (observed?.schema !== "pipeline.project-onboarding.v4"
    || observed?.status === "ready"
    || typeof observed?.status !== "string"
    || observed?.root !== root
    || observed?.intent !== "session"
    || action?.kind !== "command"
    || typeof action.executable !== "string"
    || !Array.isArray(action.argv)
    || !action.argv.every((value) => typeof value === "string")
    || typeof action.mutation !== "boolean"
    || typeof action.requiresConfirmation !== "boolean"
    || words.length !== action.argv.length + 1
    || words[0] !== action.executable
    || action.argv.some((value, index) => words[index + 1] !== value)) return null;
  return { observed, action };
}

for (const [label, executable] of [["literal node", "node"], ["guard Node", GUARD_NODE], ["producer Node", FOREIGN_NODE]]) {
  test(`an exact observed onboarding next action is still matched and admitted (${label})`, () => {
    const action = planner(executable);
    const deps = counting(action);
    const command = commandFor([action.executable, ...action.argv]);
    const match = observedOnboardingCommandMatch(command, root, deps);
    assert.ok(match, "the exact observed action must still match");
    assert.deepEqual(match.action, action);
    assert.equal(deps.reads(), 1);
    assert.equal(isExactObservedOnboardingNextAction(command, root, deps), true);
    assert.equal(devPlanShellRefusalHit(command, root, deps), null,
      "the exact read-only recovery action must still cross the draft shell lane");
  });
}

test("a mutating or onboarding-script action with an absolute script is still matched", () => {
  for (const action of [
    { kind: "command", executable: "node", argv: [onboardingScript, "inspect", "--root", rootWord, "--runner", "claude"], mutation: false, requiresConfirmation: false },
    { kind: "command", executable: FOREIGN_NODE, argv: [onboardingScript, "apply-repair", "--root", rootWord, "--plan-sha256", "a".repeat(64), "--activate"], mutation: true, requiresConfirmation: true },
  ]) {
    const deps = counting(action);
    const match = observedOnboardingCommandMatch(commandFor([action.executable, ...action.argv]), root, deps);
    assert.deepEqual(match?.action, action);
    assert.equal(deps.reads(), 1);
  }
});

for (const command of [
  "git commit -F scratch/commit-msg/X.txt -- a.txt",
  "node --test x.test.mjs",
  "node scratch/x.mjs",
  "node",
  "git status --short",
]) {
  test(`no onboarding inspection runs for ${command}`, () => {
    const deps = counting(planner("node"));
    assert.equal(observedOnboardingCommandMatch(command, root, deps), null);
    assert.equal(isExactObservedOnboardingNextAction(command, root, deps), false);
    assert.equal(deps.reads(), 0, "a command that cannot equal the observed action must not trigger an inspection");
    devPlanShellRefusalHit(command, root, deps);
    assert.equal(deps.reads(), 0, "the shell lane must not inspect for it either");
  });
}

test("matching is identical to the pre-precondition behaviour for every producer-shaped action", () => {
  const actions = [
    planner("node"), planner(GUARD_NODE), planner(FOREIGN_NODE),
    { kind: "command", executable: "node", argv: [onboardingScript, "inspect", "--root", rootWord], mutation: false, requiresConfirmation: false },
    { kind: "command", executable: GUARD_NODE, argv: [onboardingScript, "plan-repair", "--root", rootWord, "--runner", "codex"], mutation: false, requiresConfirmation: false },
    { kind: "command", executable: "node", argv: [onboardingScript, "apply-repair", "--root", rootWord, "--plan-sha256", "b".repeat(64), "--activate"], mutation: true, requiresConfirmation: true },
  ];
  const commands = (action) => {
    const words = [action.executable, ...action.argv];
    return [
      commandFor(words),
      commandFor([...words, "--unexpected"]),
      commandFor(words.slice(0, -1)),
      commandFor(["node", ...words.slice(1)]),
      commandFor(["/opt/other-node/bin/node", ...words.slice(1)]),
      commandFor([words[0], "scratch/x.mjs", ...words.slice(2)]),
      "git commit -F scratch/commit-msg/X.txt -- a.txt",
      "node --test x.test.mjs",
      "node scratch/x.mjs",
      `${commandFor(words)} | head -n 1`,
      `${commandFor(words)} && ${commandFor(words)}`,
    ];
  };
  // C20 w252 restatement (QG-04, same table, no case dropped): every legacy match is still returned identically; a command the
  // legacy body refused may match now ONLY when it differs from the observed action in the interpreter word alone and
  // sameNodeInterpreter admits that word for the observed Node executable (G20-1). Every other legacy refusal stays a refusal.
  let matched = 0;
  let widened = 0;
  for (const action of actions) {
    for (const command of commands(action)) {
      const deps = counting(action);
      const expected = legacyMatch(command, deps);
      const actual = observedOnboardingCommandMatch(command, root, counting(action));
      if (expected !== null) { assert.deepEqual(actual, expected, command); matched += 1; continue; }
      if (actual === null) continue;
      const words = simpleWords(command, root);
      assert.ok(words && words.length === action.argv.length + 1 && action.argv.every((value, index) => words[index + 1] === value), `only the interpreter may differ: ${command}`);
      assert.equal(sameNodeInterpreter(words[0], action.executable, root), true, `the interpreter must be an admitted Node: ${command}`);
      assert.notEqual(words[0], action.executable);
      widened += 1;
    }
  }
  assert.ok(matched >= actions.length, "the table must contain real matches, not only refusals");
  assert.ok(widened >= 1, "the table must exercise the Node-interpreter equivalence");
});

test("C20 w252 (G20-1): the repair the hook's inspection returns is admitted when the agent's shell names a different real Node", () => {
  const action = { kind: "command", executable: GUARD_NODE, argv: [onboardingScript, "intake-spec-marker-apply", "--root", rootWord, "--plan-sha256", "c".repeat(64), "--activate", "--runner", "codex"], mutation: true, requiresConfirmation: false };
  const realNodeElsewhere = process.execPath;
  // The guard's own Node differs from the agent's (simulated: the observed executable is a foreign node path, the agent names this Node).
  const observedForeign = { ...action, executable: "/opt/producer-node/bin/node" };
  assert.ok(observedOnboardingCommandMatch(commandFor([realNodeElsewhere, ...action.argv]), root, counting(observedForeign)), "a real Node outside the project is admitted");
  assert.ok(observedOnboardingCommandMatch(commandFor(["node", ...action.argv]), root, counting(observedForeign)), "node from PATH is admitted");
  // End to end through the admission (the fixture root admits the observed-only planner; the marker repair's argument check needs a real root).
  const foreignPlanner = planner("/opt/producer-node/bin/node");
  assert.equal(isExactObservedOnboardingNextAction(commandFor([realNodeElsewhere, ...foreignPlanner.argv]), root, counting(foreignPlanner)), true);
  // Still refused: a non-Node interpreter, a missing Node path, a Node-named file inside the project, a changed argv, and any
  // interpreter swap when the observed executable is not itself a Node.
  for (const word of ["/bin/sh", "/opt/missing/bin/node", join(repository, "scratch", "node"), join(repository, "package.json")]) {
    assert.equal(observedOnboardingCommandMatch(commandFor([word, ...action.argv]), root, counting(observedForeign)), null, word);
  }
  assert.equal(observedOnboardingCommandMatch(commandFor([realNodeElsewhere, ...action.argv, "--extra"]), root, counting(observedForeign)), null);
  const nonNode = { ...action, executable: "/usr/bin/python3" };
  assert.equal(observedOnboardingCommandMatch(commandFor([realNodeElsewhere, ...action.argv]), root, counting(nonNode)), null);
  assert.equal(sameNodeInterpreter(join(repository, "scratch", "node"), GUARD_NODE, repository, { realpathFn: (p) => p, lstatFn: () => ({ isFile: () => true, mode: 0o755 }) }), false, "a node inside the root is refused even when it is an executable file");
});

test("C20 separator sweep: on win32 node.exe and any spelling of the observed Node are that Node; absolute argv paths match in any native spelling", () => {
  const win = { platform: "win32" };
  const observedNode = "C:\\Program Files\\nodejs\\node.exe";
  const winRoot = "D:\\Dev\\App";
  for (const word of ["node", "node.exe", "NODE.EXE", "C:/Program Files/nodejs/node.exe", "c:\\program files\\nodejs\\node.exe", "/c/Program Files/nodejs/node.exe"]) {
    assert.equal(sameNodeInterpreter(word, observedNode, winRoot, win), true, word);
  }
  assert.equal(sameNodeInterpreter("node.exe", observedNode, winRoot, { platform: "linux" }), false, "node.exe is no interpreter word on Linux");
  assert.equal(sameNodeInterpreter("C:/Program Files/nodejs/python.exe", observedNode, winRoot, win), false);
  // argv: an absolute expected path in another native spelling matches; flags, digests and relative values stay exact
  assert.equal(sameObservedArgvWord("d:/dev/app", winRoot, win), true);
  assert.equal(sameObservedArgvWord("/d/Dev/App/scripts/x.mjs", "D:\\Dev\\App\\scripts\\x.mjs", win), true);
  assert.equal(sameObservedArgvWord("D:/Dev/AppOther", winRoot, win), false);
  assert.equal(sameObservedArgvWord("--ROOT", "--root", win), false);
  assert.equal(sameObservedArgvWord("ABCDEF", "abcdef", win), false, "a digest is never case-folded");
  assert.equal(sameObservedArgvWord("scratch\\x.json", "scratch/x.json", win), false, "a relative value stays byte-exact");
  assert.equal(sameObservedArgvWord("/home/u/app/", "/home/u/app", { platform: "linux" }), false, "Linux stays byte-exact");
});
