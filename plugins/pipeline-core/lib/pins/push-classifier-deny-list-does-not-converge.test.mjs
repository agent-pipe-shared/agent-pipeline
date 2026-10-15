#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for backlog item pipeline.push-classifier-deny-list-does-not-converge (AC-235, slice ALF-C-P4-01).
 * Acceptance points (item Description/Proposal, PO decision Q12 option B):
 *   A1 marker allowlist: a git word plus `$`, backtick, backslash, `<<` to a shell receiver, parentheses/braces or a
 *      non-ASCII quote is a push candidate (routed to guard-push) instead of a shape-specific deny-list entry;
 *   A2 the Critic's traced GPGL-8 shapes (F1 escaped terminator/backtick, F2 bare expansion / `$"..."` / `("push")`,
 *      F3 substitution in an unquoted here-document body) are candidates;
 *   A3 the loosening branches stay narrow (F4/QG-11): plain commands, data here-documents, gitleaks, quoted prose are NOT candidates;
 *   A4 both consumers (guard-push, codex-pretool-guard) route through the one shared function.
 * Real module, no mocks. RED proof: a scratch mirror of the OLD shape-specific deny-list misses the same shapes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandIsGitPush } from "../git-cmd.mjs";

const libDir = dirname(dirname(fileURLToPath(import.meta.url)));
const hooksDir = join(dirname(libDir), "hooks");

// Mirror of a deny-list classifier (the pre-Q12 shape: look only for a literal push spelling). Never production code.
function denyListMirror(cmd) {
  return /\bgit(\.exe)?\s+push\b/i.test(cmd);
}

const MARKER_CANDIDATES = {
  "A1 dollar": "git commit -m \"$(date)\"",
  "A1 backtick": "git `echo status`",
  "A1 backslash": "git p\\ush origin main",
  "A1 open paren": "git status (x",
  "A1 close paren": "git status x)",
  "A1 brace expansion git word": "{git,push} origin main",
  "A1 non-ASCII quote": "git commit -m “x”",
  "A1 nested shell -c": "bash -c 'git status'",
  "A1 heredoc to shell": "cat <<EOF | sh\ngit status\nEOF",
  "A1 plain push": "git push origin main",
};

const CRITIC_SHAPES = {
  "A2 F1 escaped terminator": "git status\\; git push origin main",
  "A2 F1 escaped backtick": "git status \\`echo push\\` origin",
  "A2 F2 bare parameter expansion": "git $sub origin main",
  "A2 F2 bash locale quoting": "git $\"push\" origin main",
  "A2 F2 PowerShell grouping": "& git (\"push\") origin main",
  "A2 F3 substitution in unquoted heredoc body": "cat <<EOF | sh\n$(git push origin main)\nEOF",
};

const PLAIN_NOT_CANDIDATES = {
  "A3 status": "git status",
  "A3 log": "git log --oneline -5",
  "A3 unrelated command": "node --test lib/x.test.mjs",
  "A3 gitleaks no-git flag": "gitleaks detect --no-git --redact",
  "A3 data heredoc to git commit": "git commit -F - <<EOF\nmessage body\nEOF",
  "A3 quoted prose mentions push": "git commit -m 'mentions git push in prose'",
  "A3 empty": "",
};

for (const [name, cmd] of Object.entries(MARKER_CANDIDATES)) {
  test(`${name} is a push candidate`, () => assert.equal(commandIsGitPush(cmd), true, JSON.stringify(cmd)));
}
for (const [name, cmd] of Object.entries(CRITIC_SHAPES)) {
  test(`${name} is a push candidate`, () => assert.equal(commandIsGitPush(cmd), true, JSON.stringify(cmd)));
}
for (const [name, cmd] of Object.entries(PLAIN_NOT_CANDIDATES)) {
  test(`${name} is not a candidate`, () => assert.equal(commandIsGitPush(cmd), false, JSON.stringify(cmd)));
}

test("A1 non-string input is never a candidate", () => {
  assert.equal(commandIsGitPush(undefined), false);
  assert.equal(commandIsGitPush(42), false);
});

test("A1/A2 RED mirror: an old-style deny-list misses every Critic shape and marker the real classifier catches", () => {
  const missed = Object.entries({ ...CRITIC_SHAPES, ...MARKER_CANDIDATES }).filter(
    ([name, cmd]) => name !== "A1 plain push" && !denyListMirror(cmd) && commandIsGitPush(cmd),
  );
  // The mirror catches at most the literal spelling; all of these shapes evade it, so the cases above can fail.
  assert.ok(missed.length >= 10, `mirror missed only ${missed.length}`);
  assert.equal(denyListMirror("git push origin main"), true);
  assert.equal(denyListMirror(CRITIC_SHAPES["A2 F2 bash locale quoting"]), false);
  assert.equal(denyListMirror(CRITIC_SHAPES["A2 F1 escaped backtick"]), false);
});

test("A2 convergence: a fresh unlisted spelling carrying a marker is a candidate without any shape-specific entry", () => {
  for (const marker of ["$", "`", "\\", "(", ")", "{", "‘", "”"]) {
    assert.equal(commandIsGitPush(`git ${marker}zz origin main`), true, `marker ${JSON.stringify(marker)}`);
  }
});

test("A4 both consumers route through the shared classifier (source wiring)", () => {
  const guardPush = readFileSync(join(hooksDir, "guard-push.mjs"), "utf8");
  const codex = readFileSync(join(hooksDir, "codex-pretool-guard.mjs"), "utf8");
  assert.match(guardPush, /import \{[^}]*commandIsGitPush[^}]*\} from "\.\.\/lib\/git-cmd\.mjs"/u);
  assert.match(guardPush, /const isPush = commandIsGitPush\(cmd\)/u);
  assert.match(codex, /import \{ commandIsGitPush \} from "\.\.\/lib\/git-cmd\.mjs"/u);
  assert.match(codex, /commandIsGitPush\(command\)[^\n]*\["guard-push\.mjs"\]/u);
});
