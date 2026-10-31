# Held patch w8-cib-d213-full-fallback-bindings-and-finding-records (Elephant-built, PO exception for small items)

Two consumer blockers of candidate 13 (item `2026-10-31-critic-full-fallback-round-bindings-and-finding-disposition-role`), built in scratch clones at candidate commit 57d171279; the patch applies on it (`git apply --check` exit 0).

1. **Effective FULL round: the bindings were checked over the wrong range.** `critic-dispatch-preflight.mjs` checked the
   correction-input bindings over `--base .. candidate` before the course admission was read. A delta request that moves a
   trust boundary (D204) is admitted as an effective full round that reviews the course genesis base .. candidate, so the
   file the preflight accepted covered 20 of 248 commits and the Critic stopped. Now the check is deferred (only for a request
   that carries a delta request, and only the STALE and REQUIRED refusals) until the admission is known; for
   `RE-DELTA-FALLBACK-FULL` the bindings are judged over genesis base .. candidate and the refusal names that base in the derive
   command and says why. Every other path keeps its order and its text. Callers: `preflightCriticDispatch` only
   (admit and finalize re-run the same preflight with the same request, so they follow). Pin: CDPF068 (fails on the old
   production code: reverted run red, restored byte-equal).
2. **D213: the role finding-disposition record had no producer.** The canon (protocol 2.2, template, ADR-0014) names the role; the
   derivation produced only two. The project calibration (`project/pipeline.json`) now lists, positively, the files that quote
   earlier Critic findings in `criticFindingRecordPaths` (exact file paths or directory prefixes ending in `/`, no globs, at
   most 64). A malformed list is refused `CCI-FINDING-RECORDS` (also with `projectStateOptional`), an absent field means none, a
   file never declares itself, a rename across the class border is `CCI-MIXED`. `bindingsRoleCounts` counts the new role. Canon:
   protocol, both template copies (byte-identical), the Critic role (both copies), the critic-review skill note.
   Pins: CCI 2c, 2d, 2e and the canon pin in `opus-critic-only-batched-for-architecture-and-security.test.mjs`.

Restated existing cases (intent named, none weakened): the two D204 anchor cases CCA063 and CCA064 in `critic-course-admission.test.mjs`
encoded the old behavior (the effective full round carrying correction-range bindings); `d204Round` now takes a `bindingsBase`, and the
effective full round passes the course genesis base, which is what the preflight now demands.

VCR01: `critic-dispatch-preflight-tests` 314 -> 331 (+9 and +8 assertion sites of the two parts); `harness/scripts/check-verify-case-completion.test.mjs` green (32/32) in the clone.

Suites green in the clone: critic-dispatch-preflight (78), critic-course-admission (82), the canon pins, the finalizer and the other focused suites named in the slice.

Not covered, named: whether a project-listed file really carries no operative contract is the project's responsibility (the
canon says so); a project that has not yet listed its files still gets a Critic stop, now with a route (list them, commit the
calibration, derive again). This patch fixes the bindings step only; the whole consumer chain (round, registration, close, push) is walked by
the separate chain-walk slice, because fixing one step at a time was the repeated failure.
