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
{
  const out = tokenizeArgv(String.raw`git commit -m "subject" -m $'body\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)'`);
  record(
    "TOKENIZE ANSI-C quote  Bash $'...' escapes become the argv bytes Git receives",
    JSON.stringify(out) === JSON.stringify([
      "git", "commit", "-m", "subject", "-m",
      "body\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)",
    ]),
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

// ---- commandIsGitPush: the `git` word only counts where an executable can stand (GPGL-2) ---
// Fail-closed check #2 used to read the `git` inside `--no-git` (and `.git`, `=git`, `xgit`)
// as an executable followed by an unknown option, and routed `gitleaks detect --no-git
// --redact` to the push gate. The boundary rule: the `git` word counts at the start of the
// command or after whitespace, a shell operator (`;` `&` `|` `(` backtick, `$(`), a quote,
// or a path separator (`/` `\`) -- never after `-`, `=`, `.` or a word character.
const GPGL2_NOT_AN_EXECUTABLE_TABLE = [
  ["gitleaks detect --no-git --redact", "the observed trigger: `git` inside --no-git is an option, not an executable"],
  ["tool --no-git -v --source .", "--no-git followed by a verbose flag and a source path"],
  ["tool --git-dir=x --redact", "--git-dir=x is an option of another tool, not a git invocation"],
  ["tool --exclude=git --flag", "a `git` after `=` is a value, not an executable"],
  ["echo origin.git --flag", "a `git` after `.` is a name suffix, not an executable"],
  ["xgit push origin main", "a `git` after a word character is part of a longer word"],
  ["xgit --unknown-opt status", "a longer word ending in git followed by an option is not git"],
];
for (const [cmd, why] of GPGL2_NOT_AN_EXECUTABLE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL2-NOT-GIT ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
}

const GPGL2_EXECUTABLE_POSITION_TABLE = [
  ["/usr/bin/git push origin main", "an absolute POSIX path ending in git"],
  ["C:\\Git\\bin\\git.exe push origin main", "a Windows path ending in git.exe"],
  ['"git" push origin main', "a quoted executable name"],
  ["a;git push origin main", "after a `;` operator"],
  ["$(git push origin main)", "inside a command substitution"],
  ["/usr/bin/git --unknown-opt status", "check #2 after a POSIX path separator (unknown option, no push word)"],
  ["C:\\Git\\bin\\git.exe --unknown-opt status", "check #2 after a Windows path separator and git.exe"],
  ["a;git --unknown-opt status", "check #2 after `;`"],
  ["a&&git --unknown-opt status", "check #2 after `&&`"],
  ["a|git --unknown-opt status", "check #2 after `|`"],
  ["$(git --unknown-opt status)", "check #2 inside `$(`"],
  ["(git --unknown-opt status)", "check #2 inside a subshell parenthesis"],
  ["echo `git --unknown-opt status`", "check #2 inside a backtick substitution"],
  ["a git --unknown-opt status", "check #2 after whitespace"],
  ["git --unknown-opt status", "check #2 at the start of the command"],
  ["FOO=bar git --unknown-opt status", "check #2 after a leading NAME=value assignment"],
  // fail-closed: literal git word stays refused (GPGL-2)
  ["gitleaks git --redact", "fail-closed: a whitespace-separated literal git argument is indistinguishable from the executable"],
  ['gitleaks git --redact --log-opts "origin/main..HEAD --not push"', "fail-closed: the same literal git word with a quoted argument"],
];
for (const [cmd, why] of GPGL2_EXECUTABLE_POSITION_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL2-GIT-WORD ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// ---- commandIsGitPush: backslash-escaped quotes and quoted executable names fail closed (GPGL-3) ---
// In a POSIX shell a backslash-escaped quote is a literal character, so text between two of
// them is EXECUTED, while `stripQuotedSegments` / `tokenizeArgv` read the pair as a quoted span
// and blank it: a real push placed there was classified "not a push" (fail-open; defect item
// pipeline.push-classifier-misreads-backslash-escaped-quotes). The rule: a backslash-escaped
// quote outside a plain single-quoted span AND a `git` word at an executable boundary anywhere
// in the raw command AND the word `push` as a separate token anywhere in the raw text (GPGL-4)
// classifies as a push. Second shape: a quoted executable name (`"git"`)
// hides from the whole-string branch, so a quoted git word followed later by a push word
// classifies as a push whatever sits between them.
const GPGL3_FAIL_CLOSED_TABLE = [
  [String.raw`echo \'; git push origin main; echo \'`, "the minimal shape: escaped single quotes fake a quoted span around a real push"],
  [String.raw`gitleaks detect --no-git --x \'; git push origin HEAD:refs/heads/feat/x; echo \'`, "the GL-B13 shape: the same fake span behind a gitleaks call"],
  [String.raw`echo \"; git push; echo \"`, "escaped double quotes fake the span just the same"],
  [String.raw`echo "a \" b" ; git push origin main ; echo "c \" d"`, "an escaped quote INSIDE a double-quoted span desynchronises the quote stripper the same way"],
  [String.raw`echo $'it\'s' ; git push origin main ; echo $'a\'b'`, "an escaped quote inside an ANSI-C $'...' string (the quote count stays even, so the unterminated-quote check cannot catch it)"],
  // GPGL-4: the push word keeps check #3 closed regardless of case or spacing around it.
  [String.raw`echo \'; git  PUSH origin main; echo \'`, "uppercase push word and a double space still classify as a push"],
  ['"git" --unknown-opt push origin main', "quoted executable name, unknown option, then push"],
  ["'git' -c core.sshCommand=x push origin main", "single-quoted executable name, a recognised -c option, then push"],
  ['"/usr/bin/git" -c a=b push origin main', "quoted POSIX path ending in git, then push"],
  [String.raw`"C:\Git Tools\cmd\git.exe" -c a=b push origin main`,"quoted Windows path ending in git.exe, then push"],
  ['"GIT.EXE" --unknown-opt push origin main', "the quoted executable name is matched case-insensitively"],
  ['echo x;"git" -c a=b push origin main', "quoted executable name glued to a preceding shell operator"],
  ['"git" -c a=b "push" origin main', "the push word itself quoted"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash before a quote is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git log --grep='a\'`, "decision S: a backslash before the closing quote of a single-quoted argument, with a git word: a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash before a quote is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git commit -m "say \"hi\""`, "decision S: an escaped quote in a double-quoted commit message, no push word: a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash before a quote is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git log --grep "a \"b\""`, "decision S: an escaped quote in a double-quoted grep pattern, no push word: a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash before a quote is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git tag -m "x \"y\""`, "decision S: an escaped quote in a double-quoted tag message, no push word: a push candidate"],
];
for (const [cmd, why] of GPGL3_FAIL_CLOSED_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL3-FAIL-CLOSED ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

const GPGL3_NEGATIVE_TABLE = [
  [String.raw`echo \'hello\'`, "escaped quotes with no git word anywhere"],
  ["gitleaks detect --no-git --redact", "no git executable (GPGL-2 stays closed)"],
  ["git log --format='%s'", "a single-quoted argument with no escape is not a push"],
  ["git status", "a plain read command"],
  [String.raw`echo \"hello\" gitleaks detect --no-banner`, "escaped quotes plus a word that merely STARTS with git: no executable boundary"],
  ['"git" status', "a quoted executable name with no push word"],
  ['"git" -c a=b status', "a quoted executable name, a recognised option, no push word"],
  ['"git" commit -m "push later"', "a push word that only occurs inside one quoted message token"],
  [String.raw`"C:\Git Tools\cmd\git.exe" log --oneline`,"a quoted Windows path ending in git.exe, no push word"],
  // GPGL-4: no push word, escaped quote alone is not a push
  [String.raw`git log -- "C:\repo\"`, "a Windows path ending in a backslash before the closing quote, no push word"],
];
for (const [cmd, why] of GPGL3_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL3-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
}

// ---- POSIX quoting in the quote stripper and the tokenizer (GPGL-5) ----------------------------
// Outside quotes a backslash escapes the next character; inside double quotes it escapes only
// `"`, `\`, `$`, a backtick and a newline; inside single quotes nothing is escaped; adjacent quoted
// and unquoted parts of one word concatenate. The helpers used to ignore backslashes, so an
// escaped quote desynchronised them and a real command was swallowed into a "quoted span".
{
  const out = stripQuotedSegments(String.raw`git commit -m "say \"hi\""`);
  record("GPGL5-STRIP escaped quotes inside a double-quoted span stay inside it", out === 'git commit -m ""', `out=${JSON.stringify(out)}`);
}
{
  const cmd = String.raw`echo \'; git push origin main; echo \'`;
  const out = stripQuotedSegments(cmd);
  record("GPGL5-STRIP an escaped quote outside quotes is a literal, never a delimiter (the text stays visible)", out === cmd, `out=${JSON.stringify(out)}`);
}
{
  const out = stripQuotedSegments(String.raw`echo $'it\'s' ; git status`);
  record("GPGL5-STRIP an escaped quote inside an ANSI-C string does not end it", out === "echo $'' ; git status", `out=${JSON.stringify(out)}`);
}
{
  const out = tokenizeArgv(String.raw`git commit -m "say \"hi\""`);
  record(
    "GPGL5-TOKENIZE escaped quotes inside double quotes become literal characters of one token",
    JSON.stringify(out) === JSON.stringify(["git", "commit", "-m", 'say "hi"']),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv(String.raw`echo \' x \'`);
  record(
    "GPGL5-TOKENIZE an escaped quote outside quotes is a literal character, not a span opener",
    JSON.stringify(out) === JSON.stringify(["echo", "'", "x", "'"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  // Re-specified by GPGL-6. GPGL-5 asserted the POSIX reading here (`p\ush` -> `push`), which made the exported
  // tokenizer mangle every unquoted native Windows path guard-push parses a target from. The exported tokenizer
  // now keeps an unquoted backslash before an ordinary character literally (a Windows path separator); quoted
  // parts still concatenate. The POSIX reading of `p\ush` lives on inside `commandIsGitPush` (GPGL5-FAIL-CLOSED).
  const out = tokenizeArgv(String.raw`git p\ush pu"sh" 'pu'sh`);
  record(
    "GPGL5-TOKENIZE (re-specified by GPGL-6) an unquoted backslash before an ordinary character stays literal while adjacent quoted parts still concatenate",
    JSON.stringify(out) === JSON.stringify(["git", String.raw`p\ush`, "push", "push"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv(String.raw`git -C C:\Users\x\repo push origin main`);
  record(
    "GPGL6-TOKENIZE an unquoted native Windows path after -C survives with every backslash intact",
    JSON.stringify(out) === JSON.stringify(["git", "-C", String.raw`C:\Users\x\repo`, "push", "origin", "main"]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv(String.raw`git -C C:\Users\x\repo commit -m "say \"hi\" at C:\tmp"`);
  record(
    "GPGL6-TOKENIZE a double-quoted span keeps POSIX rules: \\\" is a literal quote, a backslash before an ordinary character stays literal",
    JSON.stringify(out) ===
      JSON.stringify(["git", "-C", String.raw`C:\Users\x\repo`, "commit", "-m", String.raw`say "hi" at C:\tmp`]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv(String.raw`git push origin "a\"b" 'c\"d'`);
  record(
    "GPGL6-TOKENIZE POSIX quoting is unchanged: \\\" inside double quotes is one literal quote, inside single quotes both characters stay",
    JSON.stringify(out) === JSON.stringify(["git", "push", "origin", 'a"b', String.raw`c\"d`]),
    `out=${JSON.stringify(out)}`,
  );
}
{
  const out = tokenizeArgv(String.raw`echo "C:\repo" 'a\b'`);
  record(
    "GPGL5-TOKENIZE a backslash before an ordinary character stays literal inside double quotes and single quotes",
    JSON.stringify(out) === JSON.stringify(["echo", String.raw`C:\repo`, String.raw`a\b`]),
    `out=${JSON.stringify(out)}`,
  );
}

// ---- commandIsGitPush: classification runs on the dequoted words (GPGL-5, Critic finding F1) ------
// The GPGL-4 conjunct looked for a contiguous `push` in the RAW text, so a push word split by
// interior quotes (`pu"sh"`) behind an escaped-quote span was not classified while the shell still
// pushed. Detection now works on the dequoted words; the escaped-quote backstop needs no push word.
const GPGL5_FAIL_CLOSED_TABLE = [
  [String.raw`echo \'; git pu"sh" origin main; echo \'`, "F1 attack: escaped quotes outside quotes, push word split by interior quotes"],
  [String.raw`echo \'; "git" pu"sh" origin main; echo \'`, "F1 attack variant: the executable name is quoted as well"],
  ['git pu"sh" origin main', "push word split by interior double quotes"],
  ["git 'push' origin main", "push word wrapped in single quotes"],
  ['g"it" push origin main', "git word split by interior quotes"],
  [String.raw`git p\ush origin main`, "a backslash inside the push word"],
  ['echo hi; git pu"sh" origin main', "split push word behind another command"],
  ['echo hi; g"it" push origin main', "split git word behind another command"],
  ["git p''ush origin main", "an empty quote pair inside the push word"],
  ["echo hi; git p''ush origin main", "an empty quote pair inside the push word behind another command"],
  [String.raw`git $'pu\163h' origin main`, "an ANSI-C octal escape spells the push word"],
  ["git \\\npush origin main", "a backslash-newline continuation between git and push"],
  ["git pu\\\nsh origin main", "a backslash-newline continuation inside the push word"],
  [String.raw`echo \'; g"it" pu"sh" origin main; echo \'`, "both words split behind an escaped-quote span"],
  [String.raw`echo \'; git status; echo \'`, "backstop: an escaped quote outside quotes plus a git word needs no push word (GPGL-3 rule)"],
  [String.raw`echo "a \\" ; git push origin main ; echo "b \\"`, "an escaped backslash does not escape the closing quote, so the push after it is executed"],
  ["git status \\", "a trailing lone backslash cannot be parsed with certainty: fail closed"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash-escaped quote inside double quotes is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git commit -m "say \"hi\""`, "decision S: an escaped quote inside a double-quoted message is a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash-escaped quote inside double quotes is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git commit -m "say \"push\""`, "decision S: the same, with a push word inside the message: a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash-escaped quote inside double quotes is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git log --grep "a \"push\" word"`, "decision S: push inside an escaped-quote span of a non-push subcommand argument: a push candidate"],
];
for (const [cmd, why] of GPGL5_FAIL_CLOSED_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL5-FAIL-CLOSED ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

const GPGL5_NEGATIVE_TABLE = [
  ["gitleaks detect --no-git --redact", "the GPGL-2 trigger stays fixed"],
  ['echo "git push"', "quoted text that is not executed"],
  ["git commit -m 'say \"hi\" push'", "double quotes inside a single-quoted message"],
  ['git log --format="%h %s" -n 3', "an ordinary double-quoted argument"],
];
for (const [cmd, why] of GPGL5_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL5-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
}

// ---- the exported tokenizer and the classifier read an unquoted backslash differently on purpose (GPGL-6) ----
// `tokenizeArgv` (guard-push's target/refspec parser) keeps an unquoted backslash literal so a native Windows
// path survives; `commandIsGitPush` classifies under BOTH readings. Neither may drag the other along.
const GPGL6_CLASSIFIER_TABLE = [
  [String.raw`git -C C:\Users\x\repo push origin main`, true, "a native Windows -C path classifies as a push"],
  [String.raw`git -C C:\Users\x\repo status`, false, "the same path with a read-only subcommand is not a push"],
  [String.raw`git p\ush origin main`, true, "POSIX reading of an escaped push word still classifies, although tokenizeArgv keeps it literal"],
  [String.raw`git -C C:\Users\x\repo p\ush origin main`, true, "a Windows path and an escaped push word together"],
  [String.raw`echo \'; git pu"sh" origin main; echo \'`, true, "the Critic F1 attack stays closed"],
];
for (const [cmd, expected, why] of GPGL6_CLASSIFIER_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL6-CLASSIFIER ${JSON.stringify(cmd)}  ${why}`, out === expected, `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`);
}
{
  const cmd = String.raw`git p\ush origin main`;
  const tokens = tokenizeArgv(cmd);
  record(
    "GPGL6-SPLIT the exported tokenizer reads `p\\ush` literally while the classifier still fails closed on it",
    tokens[1] === String.raw`p\ush` && commandIsGitPush(cmd) === true,
    `tokens=${JSON.stringify(tokens)} push=${commandIsGitPush(cmd)}`,
  );
}

// ---- commandIsGitPush: text executed by PowerShell fails closed (GPGL-7, Critic finding F1) ------------
// In PowerShell a backslash is an ordinary character everywhere (inside double quotes the escape is the
// backtick), so `\<space>` ends a word and `\"` closes a double-quoted span. Both POSIX-based readings read the
// same text the other way (`\<space>` is one escaped space, `\"` an escaped quote): a drive path ending in a
// backslash swallowed `push` into the `-C` value, and a `"x\"; git push ...; echo \"y"` string became one
// blanked span, so a real PowerShell push was classified "not a push" (guard-push's fast path then exits).
// The classifier now adds a third reading with a literal backslash and fails closed when ANY reading pushes.
// A `<drive>` drive letter plus `repo` is a neutral fixture path.
const GPGL7_POWERSHELL_PUSH_TABLE = [
  [String.raw`git -C C:\repo\ push origin main`, "F1 (a): a drive path ending in a backslash and a space; PowerShell reads the space as a separator"],
  [String.raw`echo "x\"; git push origin main; echo \"y"`, 'F1 (b): `"x\\"` closes the span in PowerShell, so the push after it is executed'],
  [String.raw`git -C 'C:\repo\' push origin main`, "the drive path quoted in single quotes (backslash literal in every shell), then push"],
  [String.raw`echo "a\"; git push origin HEAD:refs/heads/feat/x; echo \"b"`, "the escaped-quote shape again, the middle segment a push with a remote and a refspec"],
  [String.raw`git -c a=b -C C:\repo\ push origin main`, "a recognised -c option before the drive path: the `\\<space>` token must not swallow the push word"],
  [String.raw`git -C C:\a\ -C C:\b\ push origin main`, "repeated -C drive paths, each ending in a backslash and a space"],
  [String.raw`& git -C C:\repo\ push origin main`, "PowerShell call operator in front of git, then a drive path ending in a backslash"],
  [String.raw`cd C:\repo\ ; git -C C:\repo\ push origin main`, "a drive path ending in a backslash on a preceding command, then the push"],
  [String.raw`echo "x\"; git -c a=b -C C:\repo\ push origin main; echo \"y"`, "the span-closing shape and the swallowing path together"],
  [String.raw`echo "x\"; git push --force origin main; echo \"y"`, "the span-closing shape around a force push with a flag"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash-escaped quote inside double quotes is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`echo "x\"; git status; echo \"y"`, "decision S: the span-closing shape around a read-only git command: a push candidate"],
  // PO decision S (po-decisions-2026-10-07.md row S, Q12 option B): a git word plus a backslash-escaped quote inside double quotes is a push candidate; accepted false-positive cost, fail closed.
  [String.raw`git log --grep "a \"push\" word"`, "decision S: the GPGL-5 escaped-quote grep shape is a push candidate under the third reading too"],
];
for (const [cmd, why] of GPGL7_POWERSHELL_PUSH_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL7-POWERSHELL-PUSH ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// The third reading must not turn ordinary read-only commands that carry the same backslash shapes into pushes.
const GPGL7_NEGATIVE_TABLE = [
  [String.raw`git -C C:\repo\ status`, "a drive path ending in a backslash and a space, read-only subcommand"],
  [String.raw`git -c a=b -C C:\repo\ status`, "a recognised -c option, a drive path ending in a backslash, read-only subcommand"],
  [String.raw`git -C 'C:\repo\' log --oneline`, "the single-quoted drive path with a read-only subcommand"],
  [String.raw`git commit -m "see C:\repo\ for details"`, "a drive path with a backslash and a space inside a double-quoted message"],
  [String.raw`echo "C:\repo\ push"`, "a drive path and the word push inside one double-quoted argument, no git word"],
];
for (const [cmd, why] of GPGL7_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL7-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
}

// ---- commandIsGitPush: shell expansion and typographic quotes fail closed (GPGL-8t, Critic F-1 / F-2) ----
// Test-only pin, RED by design: a separate later dispatch makes GPGL8_FAIL_CLOSED_TABLE green. The contract is
// the GPGL-7 fix-verification Critic record (specs/sprint-alfred-epic/evidence/critic-2026-10-05/
// gpgl-7-fix-verification.md, findings F-1 and F-2) and the backlog item's "Fail closed" proposal: where the
// classifier cannot tell what a shell will execute, "not a push" is the unsafe answer, because at every call site
// returning false means the push gate never runs.
//   F-2: `$`, `(`, `{` and the backtick are ordinary word characters, so a push word produced by an expansion in
//     command position never reads `push` (`git $(echo push) origin main`), and a real push inside a
//     double-quoted `$(...)` is blanked as quoted prose. Under Bash each of them runs a real push.
//   F-1: PowerShell takes typographic quotes (double U+201C-U+201E, single U+2018-U+201B) as string delimiters,
//     but the scanner closes a span only on the ASCII quote, so an ASCII-opened string closed by a typographic
//     quote hides the `git push` statement that follows it. The typographic quotes are \u escapes so this file
//     stays ASCII.
const GPGL8_FAIL_CLOSED_TABLE = [
  // (a) POSIX command substitution produces the push word after git
  ["git $(echo push) origin main", "(a) command substitution spells the push word"],
  ["git $(printf push) origin main", "(a) a different substituting command"],
  ["echo hi; git $(echo push) origin HEAD:refs/heads/feat/x", "(a) behind another command, with a remote and a refspec"],
  ["git -C repo $(echo push) origin main", "(a) after a recognised -C option"],
  // (b) backtick substitution produces the push word after git
  ["git `echo push` origin main", "(b) backtick substitution spells the push word"],
  ["git `printf push` --force origin main", "(b) a different substituting command, with a flag"],
  ["echo hi; git `echo push` origin main", "(b) behind another command"],
  // (c) parameter expansion produces the push word after git
  ["git ${X:-push} origin main", "(c) a default-value expansion spells the push word"],
  ["P=push; git ${P} origin main", "(c) a plain braced expansion of a variable assigned just before"],
  ["git ${PUSH_CMD:-push} --force origin main", "(c) a default-value expansion, with a flag"],
  // (d) a real git push inside a double-quoted $(...) argument of another command
  ['echo "$(git push origin main)"', "(d) the push is the whole double-quoted substitution"],
  ['git commit -m "$(git push origin main)"', "(d) a git command whose message argument executes a push"],
  ['echo "result: $(git push --force origin main) done"', "(d) the push sits between prose inside the double-quoted argument"],
  ['printf "%s" "$(git -C repo push origin main)"', "(d) a recognised -C option inside the double-quoted substitution"],
  // (e) an ASCII-opened double-quoted string closed by a typographic double quote
  ['echo "x”; git push origin main; echo “y"', "(e) closed by U+201D, then a push statement and a string reopened by U+201C"],
  ['echo "x“; git push origin main; echo ”y"', "(e) closed by U+201C, reopened by U+201D"],
  ['git log "x”; git push --force origin main; echo “y"', "(e) the same behind a git command, the middle statement a force push"],
  ['echo “x"; git push origin main; echo "y”', "(e) mirror: opened by a typographic quote, closed by the ASCII quote"],
  // (f) the single-quote analogue
  ["echo 'x’; git push origin main; echo ‘y'", "(f) closed by U+2019, then a push statement and a string reopened by U+2018"],
  ["echo 'x‘; git push origin main; echo ’y'", "(f) closed by U+2018, reopened by U+2019"],
  ["git log 'x’; git push --force origin main; echo ‘y'", "(f) the same behind a git command, the middle statement a force push"],
  ["echo ‘x'; git push origin main; echo 'y’", "(f) mirror: opened by a typographic quote, closed by the ASCII quote"],
];
for (const [cmd, why] of GPGL8_FAIL_CLOSED_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL8-FAIL-CLOSED ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// Ordinary commands that carry none of the shapes above stay out of the push gate.
const GPGL8_NEGATIVE_TABLE = [
  ["git status", "a read-only git command"],
  ["git log --oneline", "a read-only git command with a flag"],
  ['git commit -m "plain message"', "an ordinary double-quoted commit message"],
  ["echo “hello”", "a typographic-quoted word with no git word anywhere"],
  ["echo $(date)", "a non-git command using command substitution"],
  ["echo `date`", "a non-git command using backtick substitution"],
  ["echo ${HOME}", "a non-git command using parameter expansion"],
];
for (const [cmd, why] of GPGL8_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL8-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
}

// ---- commandIsGitPush: the remaining traced push-bypass shapes fail closed (GPGL-9t, Critic GPGL-8 F1 / F2 / F3) ----
// Test-only pin, RED by design: a separate later dispatch makes GPGL9_FAIL_CLOSED_TABLE green. The contract is the
// GPGL-8 Critic record (specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-8.md, findings F1, F2 and F3) and
// the backlog item's "Fail closed" proposal: where the classifier cannot tell what a shell will execute, "not a
// push" is the unsafe answer, because at every call site returning false means the push gate never runs. A case
// that already passes is "already caught" and stays as a pin. This table is positive-only on purpose: the negative
// side (ordinary commands that must stay out of the push gate) depends on a PO decision, question Q12.
// Every string below is an ordinary JS string. Where a shape needs a backslash, the source holds a doubled
// backslash so the RUNTIME string carries exactly one (the case names print it JSON-escaped, as two).
//   F1: the detection view writes a backslash-escaped structural character as a literal, so check #5 reads an
//     escaped `;`, `|`, `&` or `)` as a command terminator and cuts before the substitution that spells the push
//     word, and its backtick-parity rule counts an escaped backtick. In a POSIX shell the escaped character is
//     part of the word and the substitution runs.
//   F2: only `$(`, `${` and the backtick count as expansion syntax. Bare `$NAME` / `$1`, bash locale quoting
//     (a dollar sign before a double-quoted word), PowerShell `$name` and PowerShell grouping parentheses
//     around a string all spell the push word without any of them.
//   F3: here-document bodies are stripped as data, but bash substitutes inside a body whose delimiter is NOT
//     quoted, so a `$(git push ...)` body line runs a real push.
const GPGL9_FAIL_CLOSED_TABLE = [
  // F1 (a): an escaped command terminator inside a -c value, then a substitution that spells the push word
  ["git -c x.y=a\\;b $(echo push) origin main", "F1 (a): an escaped `;` in a -c value, then a command substitution spelling the push word"],
  ["git -c x.y=a\\|b $(echo push) origin main", "F1 (a): the same with an escaped `|`"],
  ["git -c x.y=a\\&b $(echo push) origin main", "F1 (a): the same with an escaped `&`"],
  ["git -c x.y=a\\)b $(echo push) origin main", "F1 (a): the same with an escaped `)`"],
  ["git -c x.y=a\\;b `echo push` origin main", "F1 (a): an escaped `;`, then a backtick substitution spelling the push word"],
  ["git -c x.y=a\\|b `echo push` origin main", "F1 (a): an escaped `|`, then a backtick substitution"],
  ["git -c x.y=a\\&b `echo push` origin main", "F1 (a): an escaped `&`, then a backtick substitution"],
  ["git -c x.y=a\\)b `echo push` origin main", "F1 (a): an escaped `)`, then a backtick substitution"],
  ["git -c x.y=a\\;b ${X:-push} origin main", "F1 (a): an escaped `;`, then a default-value expansion spelling the push word"],
  ["git -c x.y=a\\|b ${X:-push} origin main", "F1 (a): an escaped `|`, then a default-value expansion"],
  ["git -c x.y=a\\&b ${X:-push} origin main", "F1 (a): an escaped `&`, then a default-value expansion"],
  ["git -c x.y=a\\)b ${X:-push} origin main", "F1 (a): an escaped `)`, then a default-value expansion"],
  // F1 (b): an escaped backtick before git flips the parity the backtick rule counts
  ["echo \\`; git `echo push; true` origin main", "F1 (b): an escaped backtick before git makes the parity odd and the `;` inside the substitution leaves one backtick after git"],
  ["echo \\`; git `echo push; true` --force origin main", "F1 (b): the same parity shape with a flag after the substitution"],
  ["echo \\`; git `echo push` origin main", "F1 (b): an escaped backtick before git, then a plain backtick substitution spelling the push word"],
  // F2 (c): bare parameter expansion spells the push word
  ["P=push; git $P origin main", "F2 (c): a bare $NAME expansion of a variable assigned just before"],
  ["P=push; git $P --force origin main", "F2 (c): a bare $NAME expansion, with a flag"],
  ["P=push; git -C repo $P origin main", "F2 (c): a bare $NAME expansion after a recognised -C option"],
  ["set -- push; git $1 origin main", "F2 (c): a positional parameter set by `set --`"],
  ["set -- push origin main; git $@", "F2 (c): `$@` expands to the whole push argument list"],
  // F2 (d): the PowerShell variable form
  ["$p='push'; git $p origin main", "F2 (d): a PowerShell variable assigned just before spells the push word"],
  ["$p = 'push'; git $p origin main", "F2 (d): the same with spaces around the assignment"],
  ["$p='push'; git -C repo $p origin main", "F2 (d): a PowerShell variable after a recognised -C option"],
  ["$env:SUB='push'; git $env:SUB origin main", "F2 (d): a PowerShell environment-drive variable spells the push word"],
  // F2 (e): bash locale quoting, a dollar sign before a double-quoted word
  ['git $"push" origin main', "F2 (e): bash locale quoting spells the push word"],
  ['git $"push" --force origin main', "F2 (e): bash locale quoting, with a flag"],
  ['git -C repo $"push" origin main', "F2 (e): bash locale quoting after a recognised -C option"],
  // F2 (f): PowerShell grouping parentheses around a string
  ['git ("push") origin main', "F2 (f): PowerShell grouping around a double-quoted push word"],
  ["git ('push') origin main", "F2 (f): PowerShell grouping around a single-quoted push word"],
  ['git ("push") --force origin main', "F2 (f): PowerShell grouping, with a flag"],
  ['git -C repo ("push") origin main', "F2 (f): PowerShell grouping after a recognised -C option"],
  // F3 (g): a here-document with an UNQUOTED delimiter substitutes inside its body
  ["cat <<EOF\n$(git push origin main)\nEOF", "F3 (g): an unquoted-delimiter here-document whose body line is a command substitution running a push"],
  ["cat <<EOF\n$(git push origin main)\nEOF\n", "F3 (g): the same with a trailing newline after the delimiter"],
  ["cat <<EOF\nsome prose\n$(git push --force origin main)\nmore prose\nEOF", "F3 (g): the substitution line sits among prose lines, a force push"],
  ["cat <<EOF\n`git push origin main`\nEOF", "F3 (g): a backtick substitution in the unquoted body"],
  ["cat <<-EOF\n$(git push origin main)\nEOF", "F3 (g): the tab-stripping <<- form of the unquoted delimiter"],
  ["cat > notes.txt <<EOF\n$(git push origin main)\nEOF", "F3 (g): the here-document feeds a redirected cat"],
];
for (const [cmd, why] of GPGL9_FAIL_CLOSED_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL9-FAIL-CLOSED ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// ---- commandIsGitPush: unquoted bash brace expansion spells the push word (GPGL-9t2) ----
// Test-only pin, RED by design (a separate later dispatch makes the table green), positive-only like the table above:
// the negative side (ordinary commands that must stay out of the push gate) waits on the PO decision, question Q12.
// Contract: GIT-04 (the push classifier must match any `git push`); at every call site returning false means the push
// gate never runs. Bash performs brace expansion BEFORE every other expansion: an unquoted `{a,b}` list or `{x..y}`
// sequence becomes separate words, or pieces of one word, with no `$(`, `${` or backtick anywhere. The scanner reads
// `{`, `,`, `}` and `..` as ordinary word characters and check #5 fires only on `$(`, `${` and the backtick, so the
// push word never appears as a token: neither the whole-string `git push` regex, nor the positional branches (`git push`
// / `git -C <dir> push`, after `NAME=value` and `env`), nor the wrapper branch, nor checks #1 to #6 read it.
// Brace expansion exists in bash (also when bash is invoked as `sh`, which is what `sh` is on Git for Windows and macOS),
// in zsh and in ksh; only a strict POSIX sh such as dash lacks it. The wrapper row below uses `bash -c`; the table that
// follows it (GPGL9T3_BRACE_WRAPPER_TABLE) pins the other routed wrappers whose shell brace-expands: sh, zsh, ssh and
// the `.exe` and path-qualified spellings. The classifier cannot know which shell a runner applies, so it classifies
// under every reading (git-cmd.mjs, the fail-closed rule in `commandIsGitPush`): a wrapper that may brace-expand must
// route its inner command to the push gate.
// A `{x..x}` sequence with equal endpoints is a single element (`{s..s}` is `s`), which keeps the executed command
// exact where a comma list would duplicate a word. Each why-string names the shape and the command bash executes; those
// expansions are static (bash brace-expansion grammar), not run at authoring time: a bash probe was refused by a guard.
// One case is already caught today (the push word is literal and only a brace group trails it); it stays as a pin.
const GPGL9T2_BRACE_EXPANSION_TABLE = [
  // A: a brace list yields the push word as the first word after git
  ["git {push,origin} main", "brace list yields the push word and the remote; bash runs: git push origin main"],
  ["git {push,origin,main}", "one brace list yields push, remote and ref; bash runs: git push origin main"],
  ["git {push,--force} origin main", "brace list yields the push word and a flag; bash runs: git push --force origin main"],
  ["git {push,origin} {main,dev}", "two brace lists, the first yields push and the remote; bash runs: git push origin main dev"],
  ["git {push,-u,origin,main}", "one brace list yields push, a flag, remote and ref; bash runs: git push -u origin main"],
  // B: a brace group inside the push word
  ["git {p..p}ush origin main", "sequence group at the start of the push word; bash runs: git push origin main"],
  ["git pu{s..s}h origin main", "sequence group in the middle of the push word; bash runs: git push origin main"],
  ["git pus{h..h} origin main", "sequence group at the end of the push word; bash runs: git push origin main"],
  ["git pu{sh,sh} origin main", "comma list in the middle of the push word doubles the tail; bash runs: git push push origin main (the push subcommand, remote named push)"],
  ["git push{,} origin main", "ALREADY CAUGHT: the push word is literal, only a brace group trails it; bash runs: git push push origin main"],
  // C: a brace group produces git itself
  ["{git,push,origin,main}", "the whole command is one brace list, git included; bash runs: git push origin main"],
  ["{git,push} origin main", "a brace list yields git and the push word; bash runs: git push origin main"],
  ["g{i..i}t push origin main", "sequence group in the middle of the git word, push literal; bash runs: git push origin main"],
  ["{git,-C,repo,push} origin main", "brace list yields git, -C, its directory and the push word; bash runs: git -C repo push origin main"],
  // D: the same shape after a command separator
  ["echo ok; git {push,origin} main", "after a semicolon; bash runs: git push origin main"],
  ["cd repo && git {push,origin} main", "after an AND-list operator; bash runs: git push origin main"],
  ["false || git {push,origin} main", "after an OR-list operator; bash runs: git push origin main"],
  ["git status\ngit {push,origin} main", "on the line after a newline; bash runs: git push origin main"],
  ["(git {push,origin} main)", "inside a subshell group; bash runs: git push origin main"],
  ["true & git {push,origin} main", "after a lone background operator; bash runs: git push origin main"],
  // E: behind -C <dir> and the other recognised global options
  ["git -C repo {push,origin} main", "after a recognised -C option; bash runs: git -C repo push origin main"],
  ["git -C {repo,push} origin main", "brace list yields the -C directory and the push word; bash runs: git -C repo push origin main"],
  ["git {-C,repo,push,origin,main}", "one brace list yields -C, its directory, push, remote and ref; bash runs: git -C repo push origin main"],
  ["cd x; git -C repo {push,origin} main", "after a semicolon and behind -C; bash runs: git -C repo push origin main"],
  ["git --no-pager {push,origin} main", "after a recognised flag option; bash runs: git --no-pager push origin main"],
  ["git -c color.ui=never {push,origin} main", "after a recognised -c option; bash runs: git -c color.ui=never push origin main"],
  ["git {-C,repo} push origin main", "brace list yields -C and its directory, push word literal; bash runs: git -C repo push origin main"],
  // F: wrapper and prefix forms
  ["bash -c 'git {push,origin} main'", "inside a bash -c string, which the inner bash brace-expands; bash runs: git push origin main"],
  ["GIT_TERMINAL_PROMPT=0 git {push,origin} main", "behind a NAME=value assignment; bash runs: git push origin main"],
  ["env GIT_TERMINAL_PROMPT=0 git {push,origin} main", "behind env and a NAME=value assignment; env runs: git push origin main"],
  ["git.exe {push,origin} main", "git.exe as the executable name; bash runs: git.exe push origin main"],
];
for (const [cmd, why] of GPGL9T2_BRACE_EXPANSION_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL9T2-BRACE-EXPANSION ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// ---- commandIsGitPush: brace-expansion pushes behind every other shell wrapper the classifier routes (GPGL-9t3) ----
// Test-only pin, RED by design, positive-only, same contract and shape as the table above. The wrapper branch of
// `commandIsGitPush` (the `shellWrapperPush` regex in git-cmd.mjs) routes `bash`, `sh`, `zsh`, `dash`, `pwsh`,
// `powershell`, `cmd` and `ssh`, each with an optional `.exe`, and takes the executable name as the last path segment
// after a leading `NAME=value` run and `env`. It then looks only for the literal `git push` inside one wrapper word,
// so a brace list inside that word (`git {push,origin} main`) never reads as a push. Pinned here: the routed wrappers
// whose shell brace-expands (bash, sh, zsh, and ssh through the remote login shell or the local shell). NOT pinned:
// dash (a strict POSIX sh, no brace expansion), pwsh, powershell and cmd (no bash brace grammar); a row there would
// assert a push the shell does not run, which is the false-positive side and waits on the PO decision, question Q12.
// Every expansion below is static (shell grammar) and was not executed at authoring time: a shell probe is refused by
// a guard. Comma lists only: the one brace form every brace-expanding shell shares, with no sequence endpoint rules to
// get wrong. The why-string of each row names the wrapper and the command its shell executes.
const GPGL9T3_BRACE_WRAPPER_TABLE = [
  // A: zsh -c
  ["zsh -c 'git {push,origin} main'", "zsh -c brace-expands the single-quoted string; zsh runs: git push origin main"],
  ['zsh -c "git {push,origin,main}"', "zsh -c with a double-quoted string holding no substitution; zsh runs: git push origin main"],
  ["zsh -c 'git -C repo {push,origin} main'", "zsh -c, brace list behind -C <dir>; zsh runs: git -C repo push origin main"],
  ["zsh -c '{git,push,origin,main}'", "zsh -c, the whole inner command is one brace list, git included; zsh runs: git push origin main"],
  ["zsh -c 'echo ok; git {push,origin} main'", "zsh -c, brace list after an inner semicolon; zsh runs: git push origin main"],
  ["zsh.exe -c 'git {push,origin} main'", "zsh.exe spelling, the wrapper regex admits an optional .exe; zsh runs: git push origin main"],
  ["/bin/zsh -c 'git {push,origin} main'", "path-qualified zsh, the executable name is the last path segment; zsh runs: git push origin main"],
  ["zsh -c 'git push{,} origin main'", "ALREADY CAUGHT: the push word is literal inside the wrapper string, only a brace group trails it; zsh runs: git push push origin main"],
  // B: sh -c (sh is bash on Git for Windows and macOS, and brace-expands)
  ["sh -c 'git {push,origin} main'", "sh -c brace-expands where sh is bash; sh runs: git push origin main"],
  ['sh -c "git {push,--force} origin main"', "sh -c with a double-quoted string, brace list yields push and a flag; sh runs: git push --force origin main"],
  ["sh -c '{git,-C,repo,push} origin main'", "sh -c, brace list yields git, -C, its directory and the push word; sh runs: git -C repo push origin main"],
  ["sh -c 'cd repo && git {push,origin} main'", "sh -c, brace list after an inner AND-list operator; sh runs: git push origin main"],
  ["sh.exe -c 'git {push,origin} main'", "sh.exe spelling, the wrapper regex admits an optional .exe; sh runs: git push origin main"],
  ["/bin/sh -c 'git {push,origin} main'", "path-qualified sh, the executable name is the last path segment; sh runs: git push origin main"],
  // C: further bash spellings (the plain `bash -c 'git {push,origin} main'` row is in the table above)
  ["bash.exe -c 'git {push,origin} main'", "bash.exe spelling, the wrapper regex admits an optional .exe; bash runs: git push origin main"],
  ["/usr/bin/bash -c 'git {push,origin} main'", "path-qualified bash, the executable name is the last path segment; bash runs: git push origin main"],
  ["bash -lc 'git {push,origin} main'", "bash with the combined -lc flag word; bash runs: git push origin main"],
  ['bash -c "git {push,origin} main"', "bash -c with a double-quoted string holding no substitution; bash runs: git push origin main"],
  // D: ssh, where the REMOTE login shell (bash or zsh in practice) expands a quoted command
  ['ssh host "git {push,origin} main"', "ssh with a double-quoted remote command, expanded by the remote login shell; the remote shell runs: git push origin main"],
  ["ssh user@host 'git {push,origin} main'", "ssh user@host with a single-quoted remote command; the remote shell runs: git push origin main"],
  ["ssh host 'cd repo && git {push,origin} main'", "ssh with a remote AND-list; the remote shell runs: cd repo && git push origin main"],
  ['ssh -p 2222 host "git {push,origin} main"', "ssh with an option before the host; the remote shell runs: git push origin main"],
  ['ssh.exe host "git {push,origin} main"', "ssh.exe spelling, the wrapper regex admits an optional .exe; the remote shell runs: git push origin main"],
  ["ssh host git {push,origin} main", "ssh with an UNQUOTED remote command: the LOCAL shell brace-expands, ssh then sends: git push origin main"],
  ['ssh host "git push{,} origin main"', "ALREADY CAUGHT: the push word is literal inside the wrapper string, only a brace group trails it; the remote shell runs: git push push origin main"],
  // E: a NAME=value run or env before the wrapper (the detection skips both)
  ["env GIT_TERMINAL_PROMPT=0 zsh -c 'git {push,origin} main'", "behind env and a NAME=value assignment; env runs zsh, which runs: git push origin main"],
  ["GIT_TERMINAL_PROMPT=0 sh -c 'git {push,origin} main'", "behind a NAME=value assignment; sh runs: git push origin main"],
];
for (const [cmd, why] of GPGL9T3_BRACE_WRAPPER_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL9T3-BRACE-WRAPPER ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

// ---- commandIsGitPush: the decided push-classifier contract, both sides (Q12 option B + decision J, Q12-T) ----
// Test-only pin. Contract: PO decision Q12 option B, "fail-closed marker" (2026-10-06), narrowed by decision J
// (2026-10-07); both are recorded under specs/sprint-alfred-epic/plans/ (po-decisions-2026-10-06.md row Q12,
// po-decisions-2026-10-07.md row J). `commandIsGitPush` is an allowlist of plain commands: a command text with a git
// word at an executable boundary that also carries a dollar sign, a backtick, a backslash, a brace, a here-document or
// here-string marker, a parenthesis, a non-ASCII quote character or a nested shell invocation anywhere is a push
// CANDIDATE (true), routed to the push gate, which refuses every non-exact push. Decision J narrows exactly one
// marker: a backslash is NOT a marker when it occurs only inside a path token (a drive path such as X:\...
// or a relative path such as plugins\pipeline-core\x.mjs) where it has no quoting or escape function; every other
// backslash stays a marker. The positive side of Q12 (every traced push bypass is a candidate) is already pinned by
// the GPGL-9, GPGL-9t2 and GPGL-9t3 tables above; the tables below add the negative side that the PO decision
// unblocked, the decision-J narrowing and its escape-trick negatives, and the accepted cost of option B.
// Every string is an ordinary JS string. Where a shape needs a backslash, the source holds a doubled backslash so the
// RUNTIME string carries exactly one (the case names print it JSON-escaped, as two); a backslash-newline pair is the
// source spelling "\\\n". The drive letters and directories are synthetic fixtures, not real paths. Every case id in
// this block starts with Q12 so one search over a run's output lists the state of all of them.
// Each table is run through one helper; `expected` is the classification the decided contract demands.
function recordQ12Table(prefix, expected, table) {
  for (const [cmd, why] of table) {
    const out = commandIsGitPush(cmd);
    record(`${prefix} ${JSON.stringify(cmd)}  ${why}`, out === expected, `cmd=${JSON.stringify(cmd)} expected=${expected} out=${out}`);
  }
}

// Decision J positives: a backslash that only separates path segments is not a marker, so these are NOT candidates.
const Q12J_PATH_NOT_MARKER_TABLE = [
  ["git grep -n status -- D:\\Dev\\repo\\backlog\\items", "a drive path after a pathspec separator; the backslashes only separate segments"],
  ["git -C D:\\Dev\\repo status", "a drive path as the -C directory, read-only subcommand after it"],
  ["git log --oneline -- plugins\\pipeline-core\\lib\\git-cmd.mjs", "a relative path with backslash separators after a pathspec separator"],
  ["git show HEAD:plugins/x.mjs", "no backslash at all: a plain revision:path argument stays out of the gate"],
  ['git diff --stat -- "D:\\Dev\\repo\\a b\\c.mjs"', "a double-quoted drive path holding a space; the backslashes only separate segments"],
];
recordQ12Table("Q12J-PATH-NOT-MARKER", false, Q12J_PATH_NOT_MARKER_TABLE);

// Decision J negatives: every other backslash stays a marker (an escape that can spell or hide the push word), so these
// ARE candidates and go to the push gate.
const Q12J_BACKSLASH_MARKER_TABLE = [
  ["git pu\\sh origin main", "a backslash escaping a letter inside the push word spells push in a POSIX shell"],
  ["git push\\ origin", "a backslash-escaped space right after the push word"],
  ['git "pu"\\sh', "a quoted fragment followed by a backslash-escaped letter splices the push word"],
  ["git \\push", "a backslash escaping the first letter of the push word"],
  ['git \\"push\\" origin', "backslash-escaped quote characters around the push word"],
  ["git \\\npush", "a line continuation joins the push word to the git word"],
  ["git -C D:\\Dev\\repo pu\\sh", "a drive path is present, but a backslash elsewhere escapes a letter of the push word"],
];
recordQ12Table("Q12J-BACKSLASH-MARKER", true, Q12J_BACKSLASH_MARKER_TABLE);

// Plain allowlist positives: no marker anywhere, so these are NOT candidates.
const Q12_PLAIN_TABLE = [
  ["git status", "a plain read-only command"],
  ["git commit -m 'fix: x' -- a.mjs", "a plain commit with a single-quoted message and a pathspec"],
  ["git add -- a.mjs b.mjs", "a plain add with a pathspec separator and two paths"],
  ["git log --oneline -5", "a plain log with flags"],
];
recordQ12Table("Q12-PLAIN", false, Q12_PLAIN_TABLE);

// Option-B accepted false positives, pinned as candidates ON PURPOSE. Neither command is a push. Under the decided
// fail-closed marker rule a dollar sign in any position after a git word makes the command a push candidate, so both
// are routed to the push gate for nothing. This is the accepted Codex-route cost of Q12 option B (the alternative,
// classifying what an expansion produces, is the deny-list that never converged). A later change that "fixes" these
// by exempting expansions reopens the bypass class and must be a new PO decision, not a test edit.
const Q12_ACCEPTED_FALSE_POSITIVE_TABLE = [
  ['git commit -m "$(date)"', "ACCEPTED false positive: command substitution inside a double-quoted commit message"],
  ["git diff $(git merge-base HEAD main)", "ACCEPTED false positive: command substitution as a revision argument"],
];
recordQ12Table("Q12-ACCEPTED-FP", true, Q12_ACCEPTED_FALSE_POSITIVE_TABLE);

// ---- commandIsGitPush: the heredoc narrowing, both sides (PO decision X, Q12-T3) ----
// Test-only pin. Contract: PO decision X (2026-10-07), recorded in specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md
// row X. It narrows decisions B and S for here-documents only: `<<` (a here-document, `<<-`, or the here-string `<<<`) is a
// fail-closed marker ONLY when the command that receives it is a shell or interpreter (sh, bash, zsh, ksh, dash, ash, fish,
// csh, tcsh, node, python, perl, ruby, pwsh, powershell, cmd, eval, ssh, or any nested-shell form the classifier already
// recognises). A here-document fed to any other command (`git commit -F - <<EOF`, `cat <<EOF > notes.txt`) is data and does
// not by itself make the command a push candidate. Every other marker of decisions B, J and S applies unchanged, so a `$`, a
// backtick or any other marker on the command line (or in the body, which a shell expands when the delimiter is unquoted)
// still decides. The first table is the NOT-candidate side (it fails on a classifier that treats every `<<` as a marker);
// the receiver tables are the candidate side (they fail on a classifier that treats no `<<` as a marker, for instance one that
// removes every here-document body from the detection text); the last two tables hold the markers and the real pushes that the
// narrowing must keep deciding. Together they pin the decided contract from both directions. The consumer pin is PG-HD1 of
// plugins/pipeline-core/hooks/guard-push.test.mjs (allow); the first case below carries its command text byte for byte so the
// unit pin and the consumer pin cannot drift apart. A body line only mentions the push word; it is data, never run.
// Every case id in this block starts with Q12-X: so one search over a run's output lists the state of all of them.

// Data here-documents: the receiving command is not a shell or interpreter, so these are NOT candidates.
const Q12X_DATA_HEREDOC_TABLE = [
  ["git commit -q -F - <<EOF\nfix: a raw git push cannot consume it\nEOF", "the exact text of PG-HD1: a commit message here-document whose body mentions the push phrase"],
  ["git commit -q -F - <<EOF\nfix: explain why a push is refused\nEOF", "an unquoted delimiter, the body line mentions push"],
  ["git commit -q -F - <<'EOF'\nfix: explain why a push is refused\nEOF", "a single-quoted delimiter (no expansion in the body), the body line mentions push"],
  ["git commit -q -F - <<-EOF\n\tfix: explain why a push is refused\n\tEOF", "the tab-stripping <<- form with a tab-indented body and terminator"],
  ["cat <<EOF > notes.txt\ngit push origin main\nEOF", "cat is not a shell: the body, even a full push phrase, is written to a file and never run"],
  ['git commit -q -F - <<<"fix: push docs"', "a here-string feeding git commit: data, not a command"],
];
recordQ12Table("Q12-X: DATA-HEREDOC-NOT-CANDIDATE", false, Q12X_DATA_HEREDOC_TABLE);

// Shell and interpreter receivers: `<<` stays a fail-closed marker, because the body or string is a program the receiver
// runs. The body carries a git word and the push words and no other marker, so only the `<<` rule can make these candidates.
const Q12X_SHELL_RECEIVER_TABLE = [
  ["bash <<EOF\ngit push origin main\nEOF", "bash runs the here-document body"],
  ["sh <<'EOF'\ngit push origin main\nEOF", "sh with a single-quoted delimiter: the shell still runs the body"],
  ["node <<EOF\n// git push origin main\nEOF", "node runs the here-document body as a program"],
  ["pwsh <<EOF\ngit push origin main\nEOF", "pwsh runs the here-document body"],
  ['bash <<<"git push"', "a here-string fed to bash: the string is the command line it runs"],
  ["ssh host <<EOF\ngit push\nEOF", "ssh sends the here-document body to a remote shell"],
  ["cat <<EOF | sh\ngit push\nEOF", "cat only forwards the body; the shell after the pipe runs it"],
  ["python3 - <<EOF\n# git push origin main\nEOF", "python3 reads its program from the here-document"],
];
recordQ12Table("Q12-X: SHELL-RECEIVER-CANDIDATE", true, Q12X_SHELL_RECEIVER_TABLE);

// The remaining shells and interpreters named by decision X, each as the receiver of a here-document. Same shape as above: a
// git word and the push words in the body, no other marker.
const Q12X_NAMED_RECEIVER_TABLE = [
  ["zsh <<EOF\ngit push origin main\nEOF", "zsh"],
  ["ksh <<EOF\ngit push origin main\nEOF", "ksh"],
  ["dash <<EOF\ngit push origin main\nEOF", "dash"],
  ["ash <<EOF\ngit push origin main\nEOF", "ash"],
  ["fish <<EOF\ngit push origin main\nEOF", "fish"],
  ["csh <<EOF\ngit push origin main\nEOF", "csh"],
  ["tcsh <<EOF\ngit push origin main\nEOF", "tcsh"],
  ["powershell <<EOF\ngit push origin main\nEOF", "powershell"],
  ["cmd <<EOF\ngit push origin main\nEOF", "cmd"],
  ["eval <<EOF\ngit push origin main\nEOF", "eval"],
  ["perl <<EOF\n# git push origin main\nEOF", "perl"],
  ["ruby <<EOF\n# git push origin main\nEOF", "ruby"],
  ["python <<EOF\n# git push origin main\nEOF", "python (python3 is pinned above)"],
];
recordQ12Table("Q12-X: NAMED-RECEIVER-CANDIDATE", true, Q12X_NAMED_RECEIVER_TABLE);

// Other markers still decide: the receiving command is data, but the command line (or the text after the terminator) carries
// a marker of decisions B, J or S, so the command stays a push candidate.
const Q12X_OTHER_MARKER_TABLE = [
  ["git -C \"$(git rev-parse --show-toplevel)\" commit -q -F - <<EOF\nfix: docs\nEOF", "a data here-document whose command line carries a $( ) command substitution outside the body"],
  ["git -C `git rev-parse --show-toplevel` commit -q -F - <<EOF\nfix: docs\nEOF", "a data here-document whose command line carries a backtick substitution outside the body"],
  ["git commit -q -F - <<EOF\nfix: docs\nEOF\necho \"$(git rev-parse HEAD)\"", "a data here-document followed, after its terminator, by a command with a $( ) substitution"],
];
recordQ12Table("Q12-X: OTHER-MARKER-STAYS-CANDIDATE", true, Q12X_OTHER_MARKER_TABLE);

// The narrowing must not open the gate: a real push next to a data here-document is still a push candidate, because the
// body is removed from the detection text and what remains is read as before (the unit-level mirror of PG-HD5, PG-HD6 and PG-HD11).
const Q12X_PUSH_NEXT_TO_HEREDOC_TABLE = [
  ["git commit -q -F - <<EOF\nmsg\nEOF\ngit push origin main", "a real push on the line after the terminator"],
  ["git commit -q -F - <<EOF\nmsg\nEOF\n && git push origin main", "a real push chained after the terminator"],
  ["git push origin main <<EOF\nnote\nEOF", "the push itself carries a data here-document"],
];
recordQ12Table("Q12-X: PUSH-NEXT-TO-HEREDOC-CANDIDATE", true, Q12X_PUSH_NEXT_TO_HEREDOC_TABLE);

// ---- commandIsGitPush: the four bypasses the Q12 Critic found in round 1, both sides (Q12-T4) ----
// Test-only pin, written BEFORE the fix (QG-04): on the classifier as committed, the four candidate tables below are RED and the
// control table is GREEN. Contract: PO decisions J, S and X, specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md rows J,
// S and X; findings F1-F4 of specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-round1.md. The second column of every row
// states the bash semantics that make the command a push (or, in the control table, data). Every command text below is DATA: it
// is handed to `commandIsGitPush` and never executed. Where a shape needs a backslash it is built at runtime from
// String.fromCharCode(92), so the source carries no escaping that could be misread; the other strings are ordinary JS strings.
// Every case id in this block starts with Q12-C: so one search over a run's output lists the state of all of them.
const Q12C_BS = String.fromCharCode(92);

// F1 (regression of d9b4bf031; decisions B and S): a git word spelled with quote characters is still the git word once bash
// removes the quotes, and an expansion after it can still produce the push word, so these are candidates.
const Q12C_F1_QUOTED_GIT_WORD_EXPANSION_TABLE = [
  ['g"i"t $(echo push) origin main', "bash removes the quotes so the command word is git; the $( ) substitution then yields the word push"],
  ['g"i"t `echo push` origin main', "bash removes the quotes so the command word is git; the backtick substitution then yields the word push"],
  ['g"i"t ${X:-push} origin main', "bash removes the quotes so the command word is git; the parameter expansion falls back to the word push"],
  ["g''it $(echo push) origin main", "an empty quote pair inside the word is removed by bash, so the command word is git; the substitution yields push"],
];
recordQ12Table("Q12-C: F1-QUOTED-GIT-WORD-EXPANSION-CANDIDATE", true, Q12C_F1_QUOTED_GIT_WORD_EXPANSION_TABLE);

// F2 (decision S, "a git word formed by brace expansion counts as a git word"): bash performs brace expansion BEFORE quote
// removal, so an alternative that carries quoting or a backslash is spelled out as separate words and then unquoted. Each
// command below becomes `git push origin main`, so each is a candidate.
const Q12C_F2_BRACE_QUOTED_ALTERNATIVE_TABLE = [
  ['{g"i"t,push} origin main', "brace expansion yields the words g\"i\"t and push; quote removal turns the first into git"],
  ["{g''it,push} origin main", "brace expansion yields the words g''it and push; quote removal turns the first into git"],
  ['{"g"it,push} origin main', "brace expansion yields the words \"g\"it and push; quote removal turns the first into git"],
  ["{g" + Q12C_BS + "it,push} origin main", "brace expansion yields the words g<backslash>it and push; the backslash escapes a plain letter, so the first word is git"],
];
recordQ12Table("Q12-C: F2-BRACE-QUOTED-ALTERNATIVE-CANDIDATE", true, Q12C_F2_BRACE_QUOTED_ALTERNATIVE_TABLE);

// F3 (decision X, the shell-receiver side): a pipe at the end of a line continues the pipeline on the next command line, and a
// here-document body is read after the line that opened it. So the body below reaches the `sh` that follows the terminator, and
// the shell runs it. The units of the command are separated by line breaks, but the pipeline is one command: a candidate.
const Q12C_F3_PIPELINE_ACROSS_LINE_BREAK_TABLE = [
  ["cat <<EOF |\ngit push origin main\nEOF\nsh", "cat forwards the body through the line-continued pipe into sh, which runs the body as commands"],
];
recordQ12Table("Q12-C: F3-PIPELINE-ACROSS-LINE-BREAK-CANDIDATE", true, Q12C_F3_PIPELINE_ACROSS_LINE_BREAK_TABLE);

// F4 (decision X, the shell-receiver side): a receiver named by a quoted path is still the receiver; the quotes only keep a
// space inside one word. The here-document body is the program that bash (or sh) reads from its standard input and runs.
const Q12C_F4_QUOTED_PATH_RECEIVER_TABLE = [
  ['"/c/Program Files/git/bin/bash" <<EOF\ngit push origin main\nEOF', "the double-quoted word is one path naming bash, which runs the here-document body"],
  ["'/c/Program Files/Git/bin/sh' <<EOF\ngit push origin main\nEOF", "the single-quoted word is one path naming sh, which runs the here-document body"],
];
recordQ12Table("Q12-C: F4-QUOTED-PATH-RECEIVER-CANDIDATE", true, Q12C_F4_QUOTED_PATH_RECEIVER_TABLE);

// Controls (decision X, the data side): whatever the fix does for F1-F4, a here-document that no shell or interpreter receives
// stays data and stays NOT a candidate. These are GREEN before the fix and must stay GREEN after it.
const Q12C_CONTROL_DATA_HEREDOC_TABLE = [
  ["git commit -F - <<'EOF'\nfix: push docs\nEOF", "git commit reads its message from the here-document: the body is data, a single-quoted delimiter so nothing in it is expanded"],
  ["cat <<EOF |\ntr a-z A-Z\nEOF", "cat only forwards the here-document body as data; no shell or interpreter receives it, the only command named after the pipe is tr"],
];
recordQ12Table("Q12-C: CONTROL-DATA-HEREDOC-NOT-CANDIDATE", false, Q12C_CONTROL_DATA_HEREDOC_TABLE);

// ---- Summary------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
