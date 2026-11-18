# w30j16 — the commit-time lineage guard names its feature from the course binding (candidate 30j, C30J-J16)

Apply order: the integrated 30i tree, then the held patch of C30J-J13, then this patch. It is the delta `62b077d1…..HEAD` on that chain, so `git apply --check` against the plain repository HEAD is expected to fail and against the chain base (the clone `base9j13`) to pass (printed `exit 0`).
Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.

## Defect (verified in code, reproduced RED first)

`decideCriticLineageCommit` (behind `checkCriticLineageBeforeCommit`, the commit-msg lineage guard) counted every feature with a manifest and a Critic review unit and, with more than one (for example a retained discarded predecessor), ALLOWED the commit as `not-decidable`. The guard therefore stopped enforcing "register the lineage before the correction commit" in exactly the consumer state that J13 repaired for the registration verbs.
RED: J16-1 and J16-2 failed with `allow ... not-decidable` instead of the `CRL-LINEAGE-UNREGISTERED` refusal; J16-4 failed because the allow named neither the packet nor a command (J16-3, the single-feature parity case, was green before and after).

## What it changes (`lib/feature-package-registration.mjs` only, plus cases)

- The guard no longer picks (or counts) the feature itself. Its per-packet probe is the registration verb's own dry run (`addCriticReviewLineage({ dryRun: true })`, which since J13 derives the feature from the consumed course claim): one source for the rule, no second copy. The feature of the refusal is read from the manifest path the probe returns; with ONE feature it is the same value as before, and every refusal and allow of the single-feature case is unchanged (same code, same fields, same repair text).
- "Registered" (committed at HEAD or staged) is looked up in every feature that holds a review unit instead of the one chosen feature.
- Fail-open only where the derivation itself cannot decide: more than one feature at HEAD and the verb answers `FPR-LINEAGE-FEATURE-AMBIGUOUS` (the claim binds none of them or more than one). The allow stays `not-decidable` and now carries a `detail` that says so by name and prints one runnable command per feature: `node <plugin-root>/scripts/register-feature-package.mjs --root <root> --add-review-lineage --packet <id> --feature <id>`. A refusal found for another packet always wins over this allow.
- Never looser: before, several features allowed every time; now a refusal is possible and an allow remains only for the undecidable case. The hook script needs no change: it prints a refusal's own `detail` and `repair` and never prints an allow.

## Tests (plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs, cases J16-1 .. J16-4)

Real fixture of J13 (consumer repository with a retained discarded predecessor and the active successor; round 1 through the real preflight CLI, admission and finalizer; the model call is the only seam).
- J16-1: lineage not registered, correction staged: refused, naming the successor and the printed register command; the guard writes nothing; after the registration is staged: `registration-commit`; after it is committed: `lineage-registered`.
- J16-2: lineage written but not committed or staged: refused with `written: true` and the two paths; staged: allowed.
- J16-3: single-feature parity (no predecessor): same refusal, same allow reason.
- J16-4: no feature at HEAD is bound by the claim: allow `not-decidable` whose detail names the packet and a command per feature; nothing written.
- J16-5 (written after the production code, a second construction route for the "two features still qualify" case): the lineage record of the round is mirrored under the predecessor (manifest row plus the same bytes) so the verb's replay rule matches both features; the verb itself answers `FPR-LINEAGE-FEATURE-AMBIGUOUS`, and the guard allows `not-decidable` with the named commands and writes nothing.
- A registered reason keeps precedence over the named undecidable one (`registration-commit` / `lineage-registered` win when any other consumed round is registered); this one line was added after J16-5 and has no case of its own (it only matters with several features).
Journey coverage: commit before registration, registration commit, later commit, written-but-unstaged, undecidable: covered. A repeated hook run on the real installed hook with a predecessor, a concurrent import and a reload mid-transition: not covered (the existing W9 real-hook pin covers the single-feature hook path and is unchanged).

## Not changed

- No digest, key, record shape, stored status, gate, signature, approval, Critic evidence or audit bundle semantics; nothing is written or deleted by the guard.
- `commit-msg-hook-install.mjs` and its test: no change needed (see above).
- No existing pin or test restated (QG-04: none turned red). Suites run alone: `register-feature-package-readback.test.mjs` 38/38, `commit-msg-hook-install.test.mjs` 24/24, the pin `critic-course-consumer-chain-walk.test.mjs` 30/30 (that last run was on the commit before the one-line precedence refinement, which only acts with several features; the chain-walk pins are single-feature).

## Not proven / follow-up

- A STALE round in a repository with several features (a round of the predecessor whose lineage can no longer be registered) also comes back from the verb as `FPR-LINEAGE-FEATURE-AMBIGUOUS`; the guard then answers `not-decidable` (not `not-registrable`) and the named `--feature` command for that round may itself refuse. The decision is still allow, and a refusal for another packet still wins. The two cases cannot be told apart without changing J13's helper, which this slice does not do.
- OPEN, a file outside the write list (carried from J13): the guard command catalogue (`plugins/pipeline-core/lib/guard/command-catalogue.mjs`, `sanctionedRegisterFeaturePackageArgs`) admits the lineage form only without `--feature`, so an AGENT cannot run the `--feature <id>` command the undecidable text names until that function admits one trailing `--feature <id>`. A human can run it; the derived choice needs no selector.
- Not run: the full Verify, the Critic, and any suite beyond the ones named in the report.
