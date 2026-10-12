import test from "node:test";
import assert from "node:assert/strict";
import { commandIsGitPush } from "../wave-b-git_grep/postimages/plugins/pipeline-core/lib/git-cmd.mjs";

// Private qualification against the exact selected V7 consumer preimage:
// git-cmd.mjs SHA 95edfe98f6bf305eb45f50a206291a2478b765a51516c1a82adf875cc1131268.
// Every command below is inert string data passed to commandIsGitPush. No
// editor, shell, git command, or heredoc payload is executed.
const candidates = [
  ["Q12-VB-1", "vim -es <<EOF\n!git push origin main\nEOF"],
  ["Q12-VB-2", "vi -e <<EOF\n!git push origin main\nEOF"],
  ["Q12-VB-3", "ex -s <<EOF\n!git push origin main\nEOF"],
  ["Q12-VB-4", "vim -E -s <<EOF\n!git push origin main\nEOF"],
  ["Q12-VB-5", "busybox sh <<EOF\ngit push origin main\nEOF"],
  ["Q12-VB-6", "busybox ash <<'EOF'\ngit push origin main\nEOF"],
  ["Q12-VB-7", "vim -E <<EOF\n!git push origin main\nEOF"],
  ["Q12-VB-8", "vi -Es <<EOF\n!git push origin main\nEOF"],
];

const controls = [
  ["Q12-VB-C1", "vim -es <<EOF\n:wq\nEOF"],
  ["Q12-VB-C2", "busybox ls <<EOF\ngit push origin main\nEOF"],
  ["Q12-VB-C3", "vim <<EOF\n:q\nEOF"],
];

for (const [id, sourceText] of candidates) {
  test(`${id}: heredoc receiver can run a push`, () => {
    assert.equal(commandIsGitPush(sourceText), true);
  });
}

for (const [id, sourceText] of controls) {
  test(`${id}: inert heredoc remains data`, () => {
    assert.equal(commandIsGitPush(sourceText), false);
  });
}
