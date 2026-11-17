# w30i1 — the three oversized shipped skills fit the Antigravity 24000-byte body limit (candidate 30i, slice C30I-S1A)

Criterion binding: AC-108 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.

Order: this patch is a delta on the 30h chain (it edits the same skill files and the same digest inventory). It does NOT apply to a checkout without that chain: apply the 30h chain first, then this patch (`apply --check` against the 30h clone: exit 0; against the real checkout it is expected to fail until 30h is applied).

## What it does

Measured fact (Antigravity runner 1.5.10, `agy plugin validate --strict`): a skill body is loaded only up to its first 24000 bytes, and `critic-review`, `close-block` and `close-feature` exceeded it, so the validation failed and everything past the limit never reached an Antigravity session. The change keeps the operative core in each `SKILL.md` and moves whole blocks, byte for byte, into on-demand `references/` files (the pattern of `pipeline-start`). No rule, id or sentence inside a moved block changed; every block carries a comment line naming its place in the parent commit, and every removed block leaves a one-line `**Reference:**` pointer at its original spot (naming the moved heading or step so a search for it still lands).

Body sizes (after the closing `---`, UTF-8 bytes), before -> after, limit 22500:

- critic-review 43870 -> 18419; close-block 43040 -> 21585; close-feature 40500 -> 20588 (measured on the final build in the clone, which starts from the 30h chain; the briefing quotes 43867 / 43038 / 39244 for the real checkout before 30h).

### critic-review

- `references/critic-protocol.md` (the dispatched Critic): sections 0 (with the Review-scope rule), 2, 3, 4, 5, 6. `SKILL.md` names it MANDATORY in its opening lines; `## 1. Stage gate` and the section-2 Operator note stay in `SKILL.md` (see the pins below).
- `references/coordinator-course.md` (the Coordinator): the prospective batch course and call site, the briefing hand-over, the finalization request shape, export / named-requirement / evidence shape / diagnostic route, PF-70, D199, the generic exact-range batch registration. The opening lines say when the Coordinator loads it.
- Reader per step: the Coordinator reads `SKILL.md` and, at each pointer's condition, `coordinator-course.md`; the dispatched Critic reads `SKILL.md` (arguments gate, Stage gate, verdict return, closed bootstrap role) and `critic-protocol.md` in full before any review step; it never needs `coordinator-course.md`.
- `$ARGUMENTS` is substituted only in `SKILL.md`: line 12 still carries it; the `Arguments received: $ARGUMENTS` line inside section 0 is a literal in the reference.

### close-block

`references/close-light-and-extensions.md`: the extension-point contract, steps 3b and 3c (`runtime-transfer` only), the session-block bullets of step 6c, step 6d, step 7 (Learn + measure), step 8 (telemetry), the strict feature-branch delivery extension and the close-light variant (eligibility gate, ritual, skips). Headings stay in `SKILL.md` with the pointer under them; steps 0 to 6b, the register-discipline bullet of 6c, 7b, 9, 10, 11 and the completion report stay.

### close-feature

`references/close-feature-detail.md`: the acceptance question / SBOM / four status facts / what the close touches (section A), the body of Step 3 (B), the push and release follow-up (C). The one command, Step 1, Step 2, the Continuity ordered route, the command signatures and the out-of-scope note stay in `SKILL.md`.

## Departures from the briefing's suggested placements (each caused by a pin outside the write list)

- Kept in `critic-review/SKILL.md`: the PF-94 course section (`critic-course-admission.test.mjs` reads its heading, the 46-line bound and the code table), the Operator note (`critic-diagnostic-evidence.test.mjs`, `opus-critic-only-batched...test.mjs`), the autonomy/dispatch-admission paragraphs and the admit/finalize commands (`codex-isolated-critic-contract.test.mjs`), and `## 1. Stage gate` (its canonical-wording line cites `harness/review-protocol.md`, which `check-consumer-safe-paths.mjs` allows only inside that file).
- Kept in `close-feature/SKILL.md`: the Continuity ordered route and the command signatures (`close-feature-names-reconcile-order...test.mjs`) and the two D217 sentences of Step 2 (`critic-round-cap...test.mjs`).
- Kept in `close-block/SKILL.md`: the hard entry gate, the error-register sentences, the `check-observation-governance.mjs` line and every line citing `harness/` (the consumer-safe-paths allowlist is keyed to this file).
- Therefore PF-70 and D199 moved to the Coordinator reference but PF-94 did not.

## Other changes

- Size guard: two cases appended to the existing `install-agy.test.mjs` (Antigravity installer suite): every `skills/*/SKILL.md` body is at most 22500 bytes (names file and size when over); the three split skills name every `references/` file they depend on, each exists, and `critic-review` names `references/critic-protocol.md` MANDATORY in its opening lines. RED run before any production edit: exactly the three files over, and no references; GREEN after (31 tests, 30 pass, 0 fail).
- Re-pointed to read the skill plus its references (assertions unchanged, only the read location): `critic-review-scope.test.mjs`, `close-block-fanout-report.test.mjs`, case D41 of `codex-isolated-critic-protected-preimage.test.mjs`. Added there a content assertion for the MANDATORY pointer, the Stage gate and the moved headings. The pinned raw sha256 of `critic-review/SKILL.md` in `codex-isolated-critic-protected-preimage.v1.json` is re-pinned in the same commit. New reference files are not pinned: no registry requires it.
- Split proof (throwaway script in scratch, not committed): the skill minus the pointer lines equals the parent body minus the moved ranges, and every reference block equals its parent line range byte for byte (blank lines ignored in the first comparison; 3 skills, 20 blocks): `SPLIT VERIFIED`.

## Checks run (each alone, via the clone helper)

- `install-agy.test.mjs` 31 tests, 30 pass, 0 fail (the 31st is not a pass or fail in the base run either); `codex-isolated-critic-protected-preimage.test.mjs` pass; `check-critic-fail-closed.test.mjs` pass; `check-critic-contract-citations.test.mjs` pass; `check-module-cluster-reachability.test.mjs` 15/15.
- Off-list readers run and green: `critic-course-admission.test.mjs` 101/101 (run on the build before the final blank-line padding of the pointers; the PF-94 block is untouched), `close-feature-names-reconcile-order...test.mjs` 5/5, `codex-isolated-critic-contract.test.mjs` 22/22, `opus-critic-only-batched...test.mjs` 17/17, `check-consumer-safe-paths.test.mjs` 9/9, `critic-review-scope.test.mjs` 2/2, `close-block-fanout-report.test.mjs` 2/2.
- `check-critic-contract-citations.mjs` was left unchanged: no citation coordinate, ladder or transfer-format phrase occurs in the moved Critic text, so the checks lose no coverage.

## Not changed / not proven

- Not run (off-list readers that should be run by the Coordinator): `critic-diagnostic-evidence.test.mjs` (the Operator note stays in the skill), `critic-round-cap-and-delta-scope...test.mjs`, `scratch-has-no-retention...test.mjs`, `approval-bound-design-package...test.mjs`, `pipeline-start-v3.test.mjs`, `check-error-register.test.mjs`, `check-observation-governance` and its test, `generate-elephant-role-prohibitions.test.mjs`, `check-product-capability-inventory.test.mjs`, and the full `check-consumer-safe-paths.mjs` scan on the tree (all quote text that stays in `SKILL.md`, but they were not executed). The full Verify was not run.
- Not touched, not needed: the Antigravity agent view transform (`agy-central-snapshot.mjs`, separate item), `host-skill-catalog.*`, `check-critic-fail-closed.mjs`, the capability inventory and its reader-inputs copy (they list `SKILL.md` surfaces only, and `pipeline-start` references are not listed either), `docs/operating-tools.md`, `antigravity-feature-close.md`.
- Pointers left as they are (files outside the write list): `workflow-dispatch.md` (quotes "Which record admits the first review (PF-70)" in `skills/critic-review/SKILL.md`: the skill keeps a pointer line naming that heading) and `templates/pipeline.json.example` ("Entry semantics (defined in close-block SKILL ...)": same).
- Not proven: the agy validator itself (not runnable in this route; the size guard is the proof), and that a forked read-only Critic session can read `references/critic-protocol.md` under every runner's read policy. No guard source treats `references/` specially and the pipeline-start references are read the same way, but no live Critic session was run: the Critic is suspended for candidates of this repository, so this change is verified by tests only; a consumer Critic course is the live proof.
- The clone commit messages lack the `AI-Assisted`/`Dispatch` trailers (the helper takes a one-line message); the host commit carries them.
