// Pin for backlog 2026-10-08-git-push-classifier-misses-env-s-and-editor-bang (AC-180).
// Acceptance: `commandIsGitPush` refuses (classifies as a push) both
//   - `env -S 'git push origin main'`
//   - `vim -c '!git push origin main'`
// The real module is exercised; no behavior is mocked. The RED mirror below is a
// deliberately naive classifier that proves the cases can fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandIsGitPush } from "../git-cmd.mjs";

// Acceptance point 1: env -S forms are pushes.
const ENV_S_PUSH = [
  "env -S 'git push origin main'",
  'env -S "git push origin main"',
  "env -S'git push origin main'",
  "env --split-string='git push origin main'",
];
// Acceptance point 2: editor ex-bang forms are pushes.
const EDITOR_BANG_PUSH = [
  "vim -c '!git push origin main'",
  "vi -c '!git push origin main'",
  "nvim -c ':!git push origin main'",
  "vim +'!git push origin main'",
];
// Guard against over-blocking: non-push wrapper uses stay non-push.
const NEGATIVE = [
  "env -S 'git status'",
  "vim -c ':wq' notes.txt",
  "vim -c '!git status'",
];

for (const cmd of ENV_S_PUSH) {
  test(`env -S is a push: ${cmd}`, () => assert.equal(commandIsGitPush(cmd), true));
}
for (const cmd of EDITOR_BANG_PUSH) {
  test(`editor bang is a push: ${cmd}`, () => assert.equal(commandIsGitPush(cmd), true));
}
for (const cmd of NEGATIVE) {
  test(`non-push wrapper stays non-push: ${cmd}`, () => assert.equal(commandIsGitPush(cmd), false));
}
test("plain git push still a push (baseline)", () => {
  assert.equal(commandIsGitPush("git push origin main"), true);
});

// RED mirror: a naive classifier that only sees a leading `git push` (the pre-fix gap).
function naiveIsGitPush(cmd) {
  return /^\s*git\s+push\b/.test(cmd);
}
test("RED mirror: naive classifier misses every wrapper form, so the cases are meaningful", () => {
  for (const cmd of [...ENV_S_PUSH, ...EDITOR_BANG_PUSH]) {
    assert.equal(naiveIsGitPush(cmd), false, cmd);
  }
  assert.equal(naiveIsGitPush("git push origin main"), true);
});
