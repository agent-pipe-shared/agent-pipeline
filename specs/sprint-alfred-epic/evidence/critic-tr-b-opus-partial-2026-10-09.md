# Critic report: TR-B (`2e8f28979`, `3ca198f4e`), Opus, PARTIAL, 2026-10-09

Persisted by the Elephant from the Critic's returned report (the Critic has no Write tool). Findings, rubric, trajectory
and not-reached list are kept in substance; disclosures are shortened.

- Verdict: pass/fail withheld (partial review; budget checkpoint at counted call 20 of 25).
- Requested route `claude-opus-5-5` at max; effective identity `claude-opus-5-5`, effort tag `max`, from the runtime
  prompt. Route pre-check passed. Lane: functional-equivalent-read-only; OS isolation not asserted.
- Review object: `2e8f289796a895fc31af7ab1e465d46b61b9de32`, `3ca198f4e543d92ba81418a06664219f7c2aa542`, each by `git show`;
  the three post-image blobs diffed against their live counterparts at `3ca198f4e`.
- Persistence: unavailable (no Write tool); `scratch/dispatch/critic-tr-b-a1/` created and left empty.

## F1 (minor): an unpinned production branch and unpinned new admissions, deferred with no owner or expiry

The fix post-image refuses `--max-columns 0`
(`specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-command-grammar.mjs:365-366`), and no test exercises
that branch: the only `--max-columns` case in the TR-B block uses `200`, and no test file under `plugins/pipeline-core`
contains `max-columns`. The fix manifest also says the shared validators now admit the new spellings as pipeline sources
(`rg -o … | head`, `grep -o … | head`) and defers pinning them and the `0` refusal ("probe-only facts. A follow-up test
dispatch may pin them", `TR-B-F-MANIFEST.md:118-121`, `:133-134`) with no owner and no expiry. The `value === "0"` branch
could be deleted with no test failing, and nothing pins key-operand refusal for the new spellings in the pipeline-source
lanes (the I1-P class slice row 5 exists to close). No live key-read hole was demonstrated; the operand check is shared.
Spec-ref: T74, slice row 5 (`toil-resolution-2026-10-08.md:182`, `:408`), QG-06.

## F2 (minor): T77's "which lane refused `rg -g`" is not reproduced, and the decision is dropped

T77 gives TR-B-T the duty to reproduce and pin which lane refused `rg -g`. Assumption 4 of the test block says the log
row lost the spelling, pins only today's `validateRg` filename-filter lane, and hands the decision to the fix dispatch.
The fix scopes itself to T74 only (`TR-B-F-MANIFEST.md:4-6`). Neither commit records a T77 decision or marks it open.
Spec-ref: T77 (`toil-resolution-2026-10-08.md:185`).

## Deliberately not flagged

- Production delta: `SEARCH_BOOLEAN` has one consumer, `validateRg` in search mode (`:340`), so no git grep lane widens;
  `--files` mode keeps its own tables; the `--max-columns` value is checked four ways (no leading `-`, canonical integer
  ≤ 500, explicit `0` refusal, `seen` against repeats), and guard and rg agree on the operand; `-o` changes output only;
  the grep `flags` set is local to `isSafeExactGrepArgs` and the operand loop is byte-unchanged.
- T74 fidelity: five spellings, each with an admit pin and a coupled key-operand pin, RED → GREEN; directory Grep stays
  refused.
- Oracle soundness: the three-step differential oracle is non-vacuous; `vault/id_rsa` exists (`qp4Fixture`).
- Test integrity, scope (five files under `tranche-2/`, records match `--stat`, post-images equal live plus stated edits),
  authorship (trailers only, no orchestrator diff), dependencies, language.

## Trajectory: inconsistent on one claim

- **Inconsistent:** `TR-B-MANIFEST.md:34` says no baseline capture of the unmodified live file exists for TR-B. One does:
  `evidence/TR-B-T-20261009/baseline.txt:1-6` (label `TR-B-T-baseline`, head `328fc5d8f`, exit 0, 370 tests, 367 pass,
  3 skipped). Its count implies 391 expected tests against the 389 that ran; the manifest calls that gap unexplained
  (`:99-102`).
- **Consistent:** `red.txt` (389/374/12/3) and `green.txt` (389/384/2/3) match both manifests; the two remaining reds are
  QP3-2b and QP3-2c; `green.txt:400-401` carry `TRBF-REDIRECT-FIRED`; exit codes as claimed; heads predate the commits.
- **Not verifiable:** nothing binds the bytes `green.txt` ran to the committed post-image blobs (no served-file digest;
  entry and hook sha256 not recorded; all captures `dirty: true`). QP3-2b, QP3-2c and two unregistered tests never ran
  against the post-images; no run at the install path exists.

## Briefing violations

None. The manifests are committed parts of the review object and contain narrative beyond the claims record; read as
deliverable text, every security-relevant claim checked against code.

## Not reached (bare enumeration, from the Critic)

1. `guardrails/security.md:191-207` (SEC-11)
2. `guardrails/quality-gates.md`
3. `guardrails/git.md`
4. `templates/prompts/agent-obligations.md` §1
5. `templates/prompts/agent-obligations.md` §6
6. `specs/sprint-alfred-epic/signed-package/tranche-2/lib/guard/shell-grammar.mjs`: call sites of `isSafeExactGrepArgs`
7. Test files under `harness/` and `plugins/` for the literals `"-o"`, `"--only-matching"`, `"--max-columns"`
8. `git show -s 9d2c4b27f` (the `red.txt` head)
- Base cap of at least 12 tool uses for the remainder.
