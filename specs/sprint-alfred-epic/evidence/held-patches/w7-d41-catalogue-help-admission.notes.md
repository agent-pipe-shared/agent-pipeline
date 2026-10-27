# Held patch notes: the command catalogue admits a sole --help for the feature package registrar (D41 follow-up)

Candidate: d81951a20329dffdf571703f842056d40ba7926d. Patch: `w7-d41-catalogue-help-admission.patch` (git diff --binary vs candidate, 2 files, 33 insertions).

## Cause
`sanctionedRegisterFeaturePackageArgs` (`plugins/pipeline-core/lib/guard/command-catalogue.mjs`, line 205) began with `exactRoot(args, root, 0)`, so a bare `register-feature-package.mjs --help` was not an admitted agent argv shape, and the help added by the separate D41 help patch (`w7-d41-evidence-route-help`) could not be read by an agent. The recon note's cited lines (205-212, caller at 400) were re-verified against the clone and match.

## Changed lines
- `command-catalogue.mjs`: +2 lines before the `exactRoot` check: a comment and `if (args.length === 1 && args[0] === "--help") return true;`. Nothing else admitted (no `-h`, no `help`, no `--help` with any other argument, no `--root` with `--help`).
- `catalogue-admit-prescribed-lifecycle-verbs.test.mjs`: +31 lines, three cases appended after the last existing case (ids start `D41 feature-package registrar:`); no existing case touched.

## Caller arity gate
Line 400 passes `args` to the function; `args` excludes the script path. A one-element `args` is reachable: line 392 (`PO_HUMAN_APPROVAL_SCRIPT`) admits `args.length === 1 && ["--help","-h"]`, and the existing D64 case admits a sole `--help` for the architecture baseline through the real guard. The new case checks catalogue and real guard both admit it. No caller change is needed.

## Tests
RED (clone, unchanged production, whole file): new case `D41 feature-package registrar: a sole --help is admitted by the catalogue and the real guard` fails (actual false, expected true). The other two new cases (`--help combined with anything else stays refused`, `the existing admitted shapes and path refusals are unchanged`) pin existing behaviour and pass before and after by design.
GREEN (clone, patched, whole file): `ℹ tests 22 / pass 21 / fail 1 / skipped 0`; the one failure is the pre-existing one below.
Baseline (clone2, unchanged candidate, whole file): `ℹ tests 19 / pass 18 / fail 1 / skipped 0`.
Failing-name sets: baseline = patched = {`D64 model-role bootstrap admits a host session and is a decision, not an admission: it stays refused here`} (pre-existing: catalogue admits bootstrap, case expects refusal; fails identically at the candidate, not caused or touched here). RED set = that one plus the new sole-`--help` case.
Apply check in clone2 at the candidate: `git apply --check` exit 0.
Logs: scratch/agent-out/w7ii/{red,green,base}.catalogue-admit-prescribed-lifecycle-verbs.test.mjs.log (scratch, untracked).

## NOT done
- The D41 help patch itself (separate held patch). Full Verify, whole-repo suites and PO acceptance pending.
- The pre-existing D64 bootstrap failure is not investigated or fixed.
- Independent Critic review stays a parent-owned batch gate.
- Minor test cosmetic: a no-op ternary `path === "--force" ? label : label` in the third new case; harmless.

## Proposed commit message
`feat(guard): admit a sole --help for the feature package registrar`

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/lib/guard/command-catalogue.mjs plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`, commit with `--no-verify`, then stamp and install per the held-patch ceremony.

## Protected-path classification observed
Neither patched file matches TP-1..TP-13 (`agent-obligations.md` section 2). No guard refusal was met editing them in the scratch clone. `command-catalogue.mjs` is a guard-side surface, so it travels as a held patch applied by the PO. One earlier compound shell command that merely mentioned the file was refused by the unparsed-command lane (conservative fallback, not a detected protected write).
