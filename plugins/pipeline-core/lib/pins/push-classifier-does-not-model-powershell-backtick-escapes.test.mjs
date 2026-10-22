// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.push-classifier-does-not-model-powershell-backtick-escapes (AC-236, ALF-C-P4-02).
//
// Acceptance (item Proposal): on the PowerShell lane a backtick escapes the next character, a here-string is one span
// and `$(...)` inside double quotes is a nested command; the shapes are pinned as push cases; any reading that sees a
// push makes the command a push candidate (fail closed). Alternatively: fail closed whenever a backtick, here-string
// marker or `$(` co-occurs with a git word at an executable boundary.
//
// Cases run through the real exported `commandIsGitPush`; nothing is mocked. Cases tagged GAP are the acceptance points
// the current source does NOT satisfy; they are real assertions and are RED on purpose (blocked evidence, not skipped).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandIsGitPush } from "../git-cmd.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");

// --- A. backtick escape (outside single quotes) -----------------------------------------------------------------
const BACKTICK_PUSH = {
  "double-quoted string closed early by a backtick-escaped quote, then a push": 'Write-Output "a`" ; git push origin main',
  "same, statement separator glued": 'echo "x`"; git push origin HEAD',
  "backtick-escaped single quote, then a push": "echo `'; git push",
  "backtick-escaped dollar in double quotes, then a push": 'echo "`$(x)"; git push origin main',
  "backtick inside the push word": "git pu`sh origin main",
  "backtick line continuation between git and push": "git `\npush origin main",
};
for (const [name, cmd] of Object.entries(BACKTICK_PUSH)) {
  test(`A backtick: ${name} is a push candidate`, () => assert.equal(commandIsGitPush(cmd), true));
}

// --- B. `$(...)` inside double quotes ---------------------------------------------------------------------------
const SUBEXPR_PUSH = {
  "subexpression running git push in double quotes": 'echo "$(git push origin main)"',
  "subexpression in Write-Output": 'Write-Output "$(git push)"',
  "subexpression in a commit message fails closed": 'git commit -m "$(Get-Date)"',
};
for (const [name, cmd] of Object.entries(SUBEXPR_PUSH)) {
  test(`B subexpression: ${name} is a push candidate`, () => assert.equal(commandIsGitPush(cmd), true));
}

// --- C. here-strings --------------------------------------------------------------------------------------------
test("C here-string: a push after a here-string statement is a candidate (double-quoted form)", () =>
  assert.equal(commandIsGitPush('@"\nx\n"@; git push origin main'), true));
test("C here-string: a push after a here-string statement is a candidate (single-quoted form)", () =>
  assert.equal(commandIsGitPush("@'\nx\n'@ | Out-Null; git push origin main"), true));
test("C here-string: a here-string used as data stays plain (no over-detection)", () => {
  assert.equal(commandIsGitPush('@"\nhello\n"@ | Set-Content a.txt'), false);
  assert.equal(commandIsGitPush('@"\ngit push origin main\n"@ | Set-Content a.txt'), false);
});
// GAP: the here-string BODY is executed (Invoke-Expression) and holds the push. The item's fail-closed alternative
// requires a candidate whenever a here-string marker co-occurs with a git word at an executable boundary.
test("C GAP here-string piped to iex that holds `git push` is a push candidate", () =>
  assert.equal(commandIsGitPush('@"\ngit push origin main\n"@ | iex'), true));
test("C GAP here-string (single-quoted) piped to Invoke-Expression that holds `git push` is a push candidate", () =>
  assert.equal(commandIsGitPush("@'\ngit push origin main\n'@ | Invoke-Expression"), true));

// --- D. fail-closed boundary and controls -----------------------------------------------------------------------
test("D controls: plain pushes are candidates, plain reads are not", () => {
  assert.equal(commandIsGitPush("git push origin main"), true);
  assert.equal(commandIsGitPush("git status"), false);
  assert.equal(commandIsGitPush("Write-Output hello"), false);
});
test("D nested powershell -c fail closed", () => assert.equal(commandIsGitPush('pwsh -c "git push origin main"'), true));
test("D backtick without a git word is not a candidate (marker needs a git word)", () =>
  assert.equal(commandIsGitPush('Write-Output "a`" ; Get-Date'), false));
// GAP: the git word itself spelled with a backtick escape (`g`it` is `git` to PowerShell). The raw text holds no git
// word, so the marker rule never engages. POSIX `g\it` is covered (F1); the backtick spelling is not.
test("D GAP backtick inside the git word (g`it push) is a push candidate", () =>
  assert.equal(commandIsGitPush("g`it push origin main"), true));

// --- E. meaningfulness: a scratch mirror without the backtick/dollar/paren markers flips the marker-only cases ---
test("E RED mirror: removing the backtick, dollar and parenthesis markers turns marker-only cases plain", async () => {
  const source = readFileSync(join(here, "..", "git-cmd.mjs"), "utf8");
  const needle = "const FAIL_CLOSED_MARKER_RE = /[$`{()]|[\\u2018-\\u201F]/u;";
  assert.ok(source.includes(needle), "marker regex line not found; mirror cannot be built");
  const dir = join(repoRoot, "scratch", "alf-c-p4-02-mirror");
  mkdirSync(dir, { recursive: true });
  try {
    const mirrorPath = join(dir, "git-cmd-mirror.mjs");
    writeFileSync(mirrorPath, source.replace(needle, "const FAIL_CLOSED_MARKER_RE = /[{]|[\\u2018-\\u201F]/u;"));
    const mirror = await import(pathToFileURL(mirrorPath).href);
    const markerOnly = ["git pu`sh origin main", 'Write-Output "$(git push)"', 'git commit -m "$(Get-Date)"'];
    const flipped = markerOnly.filter((cmd) => commandIsGitPush(cmd) === true && mirror.commandIsGitPush(cmd) === false);
    assert.ok(flipped.length >= 1, "the mirror without markers must classify at least one marker-only case as plain");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- F. host limitation ----------------------------------------------------------------------------------------
// No acceptance point of this item needs directory mode bits or directory symlinks; nothing is skipped for the
// Windows host (owner Coordinator, Linux/WSL run due 2026-10-19 would be named here if a case were skipped).
