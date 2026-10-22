// SPDX-License-Identifier: SUL-1.0
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

// ALF-C-C6A-CORR (Critic F1/C2): a redirect combined with ANY recognized global option still reaches the push word.
const REDIRECT_WITH_GLOBAL_OPTIONS = [
  "git -c k=v 2>&1 push origin main",
  "git 2>&1 -c k=v push origin main",
  "git --no-pager 2>&1 push origin main",
  "git 2>&1 --no-pager push origin main",
  "git -c k=v push origin main",
  "git --git-dir=x 2>&1 push origin main",
  "git 2>&1 --git-dir=x push origin main",
  "git -C dir -c k=v 2>&1 push origin main",
  "git -C dir 2>&1 -c k=v push origin main",
  "git -c k=v 2> /dev/null push origin main",
  "git --no-pager >out.txt push origin main",
  "git -c k=v >>out.txt push origin main",
  "git 2>&1 -c k=v 2>&1 push origin main",
  "git <<< x push origin main",
  "git >| out.txt push origin main",
  "git <> out.txt push origin main",
  "git -c k=v <<< x push origin main",
  "git -c k=v >| out.txt push origin main",
  "git --no-pager <> out.txt push origin main",
  "git 2>&1 -C repo --no-pager push origin main",
];
for (const cmd of REDIRECT_WITH_GLOBAL_OPTIONS) {
  test(`A2b redirect plus global option before the push word is a push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), true);
  });
}

for (const cmd of [
  "git -c k=v 2>&1 status",
  "git --no-pager 2>&1 log",
  "git -C dir 2>&1 -c k=v status",
  "git <<< x status",
]) {
  test(`A4b negative control with redirect and option stays not-a-push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), false);
  });
}

// ALF-C-C6A-CORR2 (Critic F1/F2): redirects before unlisted options, git.exe spellings, and the wider redirect alphabet.
const REDIRECT_CORR2 = [
  "git.exe 2>&1 -c k=v push origin main",
  "git.exe -c k=v push origin main",
  "git.exe --no-pager 2>&1 push origin main",
  "git.exe 2>&1 --no-pager push origin main",
  "git.exe --git-dir=x 2>&1 push origin main",
  "git.exe 2>&1 --git-dir=x push origin main",
  "git 2>&1 --config-env=core.sshCommand=VAR push origin HEAD",
  "git 2>&1 --exec-path=x push origin main",
  "git.exe 2>&1 --config-env=core.sshCommand=VAR push origin HEAD",
  "git -c k=v >&out push origin main",
  "git --no-pager >& out push origin main",
  "git >&out push origin main",
  "git >& out push origin main",
  "git>out push origin main",
  "git --no-pager>&2 push origin main",
  "git -c k=v>out push origin main",
  "git *> out push origin main",
  "git *>&1 push origin main",
  "git -c k=v *>&1 push origin main",
  "git.exe -c k=v >&out push origin main",
];
for (const cmd of REDIRECT_CORR2) {
  test(`A2c redirect shapes (git.exe, unlisted options, wide alphabet) classify as a push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), true);
  });
}

for (const cmd of [
  "git.exe 2>&1 -c k=v status",
  "git -c k=v >&out status",
  "git --no-pager >& out log",
  "git>out status",
  "git --no-pager>&2 log",
  "git *> out status",
  "git *>&1 log",
]) {
  test(`A4c negative control for the CORR2 shapes stays not-a-push: ${cmd}`, () => {
    assert.equal(commandIsGitPush(cmd), false);
  });
}
