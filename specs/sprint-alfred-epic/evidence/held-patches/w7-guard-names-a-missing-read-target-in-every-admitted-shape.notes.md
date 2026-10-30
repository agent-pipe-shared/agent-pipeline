# Held patch: the guard names a missing read target in every admitted shape

Built by the Elephant under the PO exception for small items (2026-10-30), in a scratch clone at cf80f8243. Held; applied only by the PO.

## Defect

`isMissingSingleReadTarget` diagnosed a missing in-root path only for `cat|wc|stat|file|head|tail <path>` and
`rg|grep [-n] <pattern> <path>`. Every other admitted shape (`rg -l`, `rg -n -i`, several paths, `head -n 5`, a missing
subdirectory) fell through to GUARD-READ-COMMAND-UNSUPPORTED ("a flag ... it does not admit") without a rejected element,
so a consumer agent re-spelled flags that were fine (live in a consumer session).

## Change

`lib/guard/read-scope.mjs`, label selection only (nothing is admitted): the missing path is reported as
GUARD-READ-TARGET-MISSING when replacing every missing in-root operand with an existing in-root stand-in (its nearest
existing directory, else a file in it) makes the grammar itself (`isReadOnlyDiagnosticCommand`) admit the command. The
rg/grep pattern is never replaced; a value right after an option (`head -n 5`) is also tried unchanged. Outside-root and
credential operands keep their own codes (checked before, unchanged).

## Stale pin repaired in the same patch

`lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs` AP3 has been red since 6db0d31f8 (2026-10-24, G23),
which admitted repeated BOUNDED rg basename globs; the pin still demanded a refusal. It is registered in
`harness/verify-suites.json`, so Full Verify would have failed. QG-04 restatement: repeated bounded globs admitted at the
guard entry, the single-command predicate and the `| head` pipeline; a repeated glob carrying `.*`, `../*.md`, `**/*.md`
or `!*.md` is refused at all three (SEC-11 intent unchanged). Red on the unchanged baseline clone, green after.

## Evidence (clone)

- New pin P5b in `lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs`: seven shapes with a missing
  path give GUARD-READ-TARGET-MISSING; a real flag fault (`rg --pre=sh`) with a missing or existing path and a
  credential operand never do; a pattern that looks like a missing path keeps an existing-target command admitted.
  Suite 24/24 (1 typed host skip).
- Revert proof: with `read-scope.mjs` at the candidate, P5b fails; restored byte-equal.
- Green in the clone: `hooks/guard-lifecycle-ready.test.mjs` 411/414 (3 skipped), `g23-read-help` 3/3,
  `g23-quoted-pipeline-reads` 5/5, `g23-cross-runner-passive-matrix` 7/7, `po-only-discard-boundary` 8/8,
  `antigravity-pretool-guard` 67/67, `claude-windows-guard-refuses-every-in-repo-read` 15/16 (1 typed host skip).
- `git apply --check` on a fresh clone at the candidate: exit 0.

## Not covered

Windows-native run, Full Verify, Critic review and PO acceptance are open.
