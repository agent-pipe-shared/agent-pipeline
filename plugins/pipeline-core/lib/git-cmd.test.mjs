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
  [String.raw`git log --grep='a\'`, "a backslash inside a plain single-quoted span is literal, not an escape"],
  ['"git" status', "a quoted executable name with no push word"],
  ['"git" -c a=b status', "a quoted executable name, a recognised option, no push word"],
  ['"git" commit -m "push later"', "a push word that only occurs inside one quoted message token"],
  [String.raw`"C:\Git Tools\cmd\git.exe" log --oneline`,"a quoted Windows path ending in git.exe, no push word"],
  // GPGL-4: no push word, escaped quote alone is not a push
  [String.raw`git commit -m "say \"hi\""`, "an escaped quote in a double-quoted commit message, no push word"],
  // GPGL-4: no push word, escaped quote alone is not a push
  [String.raw`git log --grep "a \"b\""`, "an escaped quote in a double-quoted grep pattern, no push word"],
  // GPGL-4: no push word, escaped quote alone is not a push
  [String.raw`git tag -m "x \"y\""`, "an escaped quote in a double-quoted tag message, no push word"],
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
];
for (const [cmd, why] of GPGL5_FAIL_CLOSED_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL5-FAIL-CLOSED ${JSON.stringify(cmd)}  ${why}`, out === true, `cmd=${JSON.stringify(cmd)} expected=true out=${out}`);
}

const GPGL5_NEGATIVE_TABLE = [
  [String.raw`git commit -m "say \"hi\""`, "an escaped quote inside a double-quoted message is parsed, never a trigger"],
  [String.raw`git commit -m "say \"push\""`, "the same, even with a push word inside the message"],
  [String.raw`git log --grep "a \"push\" word"`, "push only inside a quoted argument of a non-push subcommand"],
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
  [String.raw`echo "x\"; git status; echo \"y"`, "the span-closing shape around a read-only git command"],
  [String.raw`git commit -m "see C:\repo\ for details"`, "a drive path with a backslash and a space inside a double-quoted message"],
  [String.raw`echo "C:\repo\ push"`, "a drive path and the word push inside one double-quoted argument, no git word"],
  [String.raw`git log --grep "a \"push\" word"`, "the GPGL-5 negative stays negative under the third reading"],
];
for (const [cmd, why] of GPGL7_NEGATIVE_TABLE) {
  const out = commandIsGitPush(cmd);
  record(`GPGL7-NEGATIVE ${JSON.stringify(cmd)}  ${why}`, out === false, `cmd=${JSON.stringify(cmd)} expected=false out=${out}`);
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
