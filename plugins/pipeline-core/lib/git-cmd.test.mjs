#!/usr/bin/env node
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
import { stripQuotedSegments, normalizeGlobalGitOptions, tokenizeArgv, refMatchesPattern } from "./git-cmd.mjs";

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

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
