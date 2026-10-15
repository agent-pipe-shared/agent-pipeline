// Pin: pipeline.push-classifier-misses-nested-quotes-and-redirect-before-push (ALF-C-P4-04, AC-238).
// Exercises the real `commandIsGitPush` (the shared classifier behind guard-push and the Codex pretool route).
// Acceptance points (backlog item Description/Proposal):
//   A1 quotes nested inside a double-quoted command substitution holding `git push` are classified as a push;
//   A2 a redirect between `git` and `push` (`git 2>&1 push origin main`) is classified as a push;
//   A3 the two documented accepted false positives (substituted merge-base diff; heredoc commit message inside a
//      quoted substitution with a boundary git word) are routed to the push gate (true);
//   A4 negative controls: ordinary non-push shapes stay not-a-push (the pin is not trivially "always true").
// Host-limitation skips: none needed (no directory modes or symlinks involved).
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandIsGitPush } from "../git-cmd.mjs";

const NESTED = [
  'echo "$(echo "x" ; git push origin main)"',
  'echo "$(echo "a" "b"; git push origin main)"',
  'echo "$(echo "a" && echo "b" && git push origin main)"',
  'echo "$(git push origin main)"',
];
for (const cmd of NESTED) {
  test(`A1 nested quotes in quoted substitution is a push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), true);
  });
}

const REDIRECT_BEFORE_PUSH = [
  "git 2>&1 push origin main",
  "git 2> /dev/null push origin main",
  "git >out.txt push origin main",
  "git 2>&1 -C repo push origin main",
];
for (const cmd of REDIRECT_BEFORE_PUSH) {
  test(`A2 redirect before the push word is a push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), true);
  });
}

test("A3 accepted false positive: git diff with substituted merge-base routes to the push gate", () => {
  assert.equal(commandIsGitPush("git diff $(git merge-base HEAD main)"), true);
});

test("A3 accepted false positive: heredoc commit message in quoted substitution with a git word", () => {
  assert.equal(commandIsGitPush('git commit -m "$(cat <<EOF\ngit push in prose\nEOF\n)"'), true);
});

for (const cmd of [
  "git 2>&1 status",
  "git status",
  'echo "$(echo "x")"',
  'echo "git push"',
  'git commit -m "push later"',
  "git log --grep=push",
]) {
  test(`A4 negative control stays not-a-push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), false);
  });
}
