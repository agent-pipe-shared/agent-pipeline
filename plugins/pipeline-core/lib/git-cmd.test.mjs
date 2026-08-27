#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * git-cmd.test.mjs -- test suite for the shared git-command normalization helpers
 * (git-cmd.mjs), extracted from plugins/pipeline-core/hooks/guard-git.mjs.
 * guard-git.test.mjs (untouched) is the end-to-end regression proof that
 * the extraction is behavior-identical; this file unit-tests the two extracted
 * functions directly and standalone.
 *
 * Run:   node plugins/pipeline-core/lib/git-cmd.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv, refMatchesPattern, commandIsGitPush } from "./git-cmd.mjs";

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

// ---- stripQuotedSegments ----------------------------------------------------------------
{
  const out = stripQuotedSegments('git commit -m "mentions git push --force in prose"');
  record(
    "STRIP double-quote  a double-quoted commit message is emptied out",
    out === 'git commit -m ""',
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = stripQuotedSegments("git commit -m 'mentions git push --force in prose'");
  record(
    "STRIP single-quote  a single-quoted commit message is emptied out",
    out === "git commit -m ''",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = stripQuotedSegments("git push --force origin main");
  record(
    "STRIP no-quotes  an unquoted destructive command passes through unchanged",
    out === "git push --force origin main",
    `out=${JSON.stringify(out)}`,
  );
}
{
  // quoted-evasion variant: a destructive flag hidden as prose inside quotes must be blanked,
  // leaving only the actually-dangerous unquoted portion (if any) visible to rule matching.
  const out = stripQuotedSegments('echo "not really: git reset --hard" && git status');
  record(
    "STRIP quoted-evasion  quoted destructive-looking prose is blanked, trailing unquoted command intact",
    out === 'echo "" && git status',
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = stripQuotedSegments('git add ".env"');
  record("STRIP quoted-target  a quoted protected target is blanked (matches guard-git's accepted trade-off)", out === 'git add ""', `out=${JSON.stringify(out)}`);
}

// ---- normalizeGlobalGitOptions ------------------------------------------------------------
{
  const out = normalizeGlobalGitOptions("git -c core.autocrlf=false push --force origin main".toLowerCase());
  record(
    "NORM -c  a -c key=value global option between git and push collapses away",
    out === "git push --force origin main",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = normalizeGlobalGitOptions("git -C /some/repo push --force origin main".toLowerCase());
  record(
    "NORM -C push-variant  -C <path> before a push --force collapses away (git push variant)",
    out === "git push --force origin main",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = normalizeGlobalGitOptions("git --git-dir=/x/.git reset --hard".toLowerCase());
  record(
    "NORM --git-dir=  an =-form global option collapses away",
    out === "git reset --hard",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = normalizeGlobalGitOptions("git -c core.autocrlf=false -C sub push --force".toLowerCase());
  record(
    "NORM multi-option  a whole run of recognized global options collapses in one pass",
    out === "git push --force",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = normalizeGlobalGitOptions("git --bogus-unknown-opt push --force".toLowerCase());
  record(
    "NORM unknown  an unrecognized global option stops the repetition and is left in place (tripwire honesty)",
    out === "git --bogus-unknown-opt push --force",
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = normalizeGlobalGitOptions("git reset --hard".toLowerCase());
  record("NORM no-options  a plain command without global options is unchanged", out === "git reset --hard", `out=${JSON.stringify(out)}`);
}

// ---- combined: quoted-evasion variant through BOTH helpers in guard-git's own pipeline order ----
{
  // Mirrors guard-git.mjs's own composition: strip quotes -> lowercase -> normalize global opts.
  const raw = 'git -C sub add ".env" && echo "reset --hard mentioned in prose"';
  const stripped = stripQuotedSegments(raw);
  const c = stripped.toLowerCase();
  const normalized = normalizeGlobalGitOptions(c);
  record(
    "COMBINED pipeline  strip -> lowercase -> normalize matches guard-git.mjs's own composition order",
    normalized === 'git add "" && echo ""',
    `stripped=${JSON.stringify(stripped)} normalized=${JSON.stringify(normalized)}`,
  );
}

// ---- tokenizeArgv ---------------------------------------------------------------------
{
  const out = tokenizeArgv('git push origin "v1.2.3"');
  record(
    "TOKENIZE double-quote  a double-quoted ref is preserved verbatim, not destroyed",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", "v1.2.3"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv("git push origin 'refs/tags/v*'");
  record(
    "TOKENIZE single-quote  a single-quoted ref is preserved verbatim, not destroyed",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", "refs/tags/v*"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv("git push origin v1.2.3");
  record(
    "TOKENIZE bare-ref  an unquoted ref is unchanged",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", "v1.2.3"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv("git -C sub push --force origin v1.2.3");
  record(
    "TOKENIZE option-tokens  option tokens (-C, sub, --force) are present in the returned list unchanged",
    JSON.stringify(out) === JSON.stringify(["git", "-C", "sub", "push", "--force", "origin", "v1.2.3"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv("git   push\torigin   v1.2.3");
  record(
    "TOKENIZE mixed-whitespace  multiple spaces/tabs between tokens collapse to one split each",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", "v1.2.3"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv('git push origin a"b"c');
  record(
    "TOKENIZE interior-quote  a quote pair inside one token collapses to its content (a\"b\"c -> abc)",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", "abc"]),
    `out=${JSON.stringify(out)}`,
  );
}

// ---- refMatchesPattern -----------------------------------------------------------------
{
  record(
    "GLOB star-crosses-slash  refs/tags/v* matches refs/tags/v1.0.0",
    refMatchesPattern("refs/tags/v1.0.0", "refs/tags/v*") === true,
  );
}
{
  record(
    "GLOB star-crosses-slash-2  refs/tags/v* matches refs/tags/v1/beta (* crosses /)",
    refMatchesPattern("refs/tags/v1/beta", "refs/tags/v*") === true,
  );
}
{
  record(
    "GLOB no-cross-type  refs/tags/v* does NOT match refs/heads/v1",
    refMatchesPattern("refs/heads/v1", "refs/tags/v*") === false,
  );
}
{
  record(
    "GLOB case-sensitive  refs/tags/V* does NOT match refs/tags/v1.0.0 (git refs are case-sensitive)",
    refMatchesPattern("refs/tags/v1.0.0", "refs/tags/V*") === false,
  );
}
{
  record(
    "GLOB literal-question-mark  a `?` in a pattern is a literal character, not a wildcard",
    refMatchesPattern("refs/tags/v1", "refs/tags/v?") === false &&
      refMatchesPattern("refs/tags/v?", "refs/tags/v?") === true,
  );
}
{
  record(
    "GLOB exact-match-only  a wildcard-free pattern matches only itself",
    refMatchesPattern("refs/tags/v1.0.0", "refs/tags/v1.0.0") === true &&
      refMatchesPattern("refs/tags/v1.0.01", "refs/tags/v1.0.0") === false,
  );
}

// ---- commandIsGitPush -------------------------------------------------------------------
// NVA-A7FIX-2: the exact six-case evidence table from the round-1 Critic report
// (evidence/critic-report-a7fix1-round1.json, F-1) -- every shape the OLD
// codex-pretool-guard.mjs partial reimplementation silently lost, now proven detected by
// the single shared function both guard-push.mjs and codex-pretool-guard.mjs call.
const PUSH_EVIDENCE_TABLE = [
  ["git --git-dir=.git --work-tree=. push origin main", true, "whole-string branch: --git-dir=/--work-tree= global options"],
  ["git -C repo -C nested push origin main", true, "whole-string branch: repeated -C overrides"],
  ["git.exe -C repo push origin main", true, "directPush branch: git.exe -C <dir> push"],
  ['sh -c "git push origin main"', true, "shellWrapperPush branch: sh -c \"git push ...\""],
  ["bash -c 'git push'", true, "shellWrapperPush branch: bash -c 'git push'"],
  ['ssh host "git push"', true, "shellWrapperPush branch: ssh host \"git push\""],
];
for (const [cmd, expected, why] of PUSH_EVIDENCE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(
    `PUSH-EVIDENCE ${JSON.stringify(cmd)}  ${why}`,
    out === expected,
    `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`,
  );
}
// Known negative cases (already covered in codex-pretool-guard.test.mjs) -- must NOT
// trigger, proving the shared function does not over-detect.
const PUSH_NEGATIVE_TABLE = [
  ['git commit -m "push later"', "a commit message merely mentioning \"push\" must not trigger"],
  ["git log --grep=push", "a --grep=push search must not trigger"],
];
for (const [cmd, why] of PUSH_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(
    `PUSH-NEGATIVE ${JSON.stringify(cmd)}  ${why}`,
    out === false,
    `cmd=${JSON.stringify(cmd)} out=${out}`,
  );
}
{
  record(
    "PUSH-EMPTY  an empty command string is not a push (defensive, matches guard-push.mjs's own early exit)",
    commandIsGitPush("") === false,
  );
}

// ---- commandIsGitPush fail-closed / escaping fixes (NVA-PUSHCLASS-1) -----------------
// Reproduction: scratch/probe-git-push-classifier.mjs -- a command form that reached a
// remote past a blocking signature gate in a real session. Two forms escaped
// classification entirely (backslash-escaped whitespace inside a `-c` value;
// `--config-env=key=VAR`, an unrecognized global option) and, independently, a git
// invocation whose subcommand position cannot be resolved with certainty must now fail
// closed to "push" rather than silently being treated as "not a push" (see
// commandIsGitPush's own header, "Fail-closed on uncertainty").

// The reproduction's own lines, verbatim, as explicit cases -- every one except
// "git status" must classify PUSH.
const PUSHCLASS_REPRODUCTION_TABLE = [
  ["git push -u origin Rune_Test1_Codex_060_58", true],
  ["git -c core.sshCommand=ssh\\ -i\\ /home/u/.ssh/id\\ -o\\ IdentitiesOnly=yes push -u origin branch", true],
  ["git -c core.sshCommand='ssh -i /home/u/.ssh/id' push -u origin branch", true],
  ["git -C /some/repo push origin HEAD", true],
  ["git --git-dir=/some/.git push origin HEAD", true],
  ["git --no-pager push origin HEAD", true],
  ["git.exe push origin HEAD", true],
  ["git -c a=b -c c=d push origin HEAD", true],
  ["git --config-env=core.sshCommand=VAR push origin HEAD", true],
  ["git status", false],
];
for (const [cmd, expected] of PUSHCLASS_REPRODUCTION_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`PUSHCLASS-REPRO ${JSON.stringify(cmd)}`, out === expected, `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`);
}

const PUSHCLASS_EVIDENCE_TABLE = [
  [
    "git -c core.sshCommand=ssh\\ -i\\ /home/u/.ssh/id\\ -o\\ IdentitiesOnly=yes push -u origin branch",
    true,
    "backslash-escaped whitespace inside a -c value is consumed as one shell word, not several",
  ],
  [
    "git --config-env=core.sshCommand=VAR push origin HEAD",
    true,
    "--config-env is an unrecognized global option before the subcommand: fail-closed",
  ],
  [
    "git -c a=b -c 'c=d' -c \"e=f\" push origin main",
    true,
    "repeated -c options with mixed quoting styles (bare/single/double) all collapse away",
  ],
  [
    "git --totally-unknown-flag status",
    true,
    "an unknown option before the subcommand fails closed even though the real subcommand (status) is not a push -- the intended over-approximation",
  ],
  [
    'git -c core.sshCommand="unterminated status',
    true,
    "an unterminated double quote is an unparseable quoting state: fail-closed",
  ],
  [
    "git -c core.sshCommand='unterminated status",
    true,
    "an unterminated single quote is an unparseable quoting state: fail-closed",
  ],
];
for (const [cmd, expected, why] of PUSHCLASS_EVIDENCE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`PUSHCLASS ${JSON.stringify(cmd)}  ${why}`, out === expected, `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`);
}

// Negative cases (DoD (c)): plain read commands and non-git commands must stay
// unaffected -- an over-approximation that swallows every command would make the
// adapter run the push guard constantly.
const PUSHCLASS_NEGATIVE_TABLE = [
  ["git status", "a plain read command with no pre-subcommand option stays not-a-push"],
  ["git log", "a plain read command with no pre-subcommand option stays not-a-push"],
  ["git diff", "a plain read command with no pre-subcommand option stays not-a-push"],
  ["npm run build", "a non-git command stays not-a-push"],
  ["echo hello", "a non-git command stays not-a-push"],
  ["echo \"it's fine\"", "a non-git command with a legitimately nested quote stays not-a-push (no false unterminated-quote trip)"],
];
for (const [cmd, why] of PUSHCLASS_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`PUSHCLASS-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} out=${out}`);
}

{
  // Regression guard for hasUnterminatedQuote's own nested-quote handling: a single
  // quote legitimately nested inside a balanced double-quoted commit message must not
  // be mistaken for an unterminated quote (matches the existing STRIP double-quote case
  // above, now exercised through the fail-closed path too).
  const out = commandIsGitPush('git commit -m "it\'s fine, not a push"');
  record(
    "PUSHCLASS-NEGATIVE nested-quote  a single quote nested inside a balanced double-quoted message is not an unterminated quote",
    out === false,
    `out=${out}`,
  );
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
