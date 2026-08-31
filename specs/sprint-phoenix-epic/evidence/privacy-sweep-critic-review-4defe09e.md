# Independent Critic review — exhaustive privacy sweep — VERDICT: FAIL

Persisted by the Elephant because the Critic could not persist it itself: it has
no Write tool and the enforced shell grammar admits no redirects, so CR-06-D file
persistence was unavailable and it emitted the report inline. Recorded here
verbatim in substance.

- Candidate: `4defe09ece85721747f039036356ef80aed1b084` (tip of `nova`), resolved
  by the Critic's own `git rev-parse HEAD`. Review object is a **tree, not a diff**.
- Ruleset: `0.6.0+claude.20260830155116.b3cf9aa`
- Contract: `specs/sprint-phoenix-epic/design/privacy-review.md` §§1-5
- Assurance lane: `functional-equivalent-read-only; OS isolation not asserted`.
  Effective identity observed by the Critic in its own runtime prompt:
  `claude-opus-5[1m]`. The dispatch asserted no model identity, so this is the
  disclosure case, not a route conflict. Host is write-capable; it invoked no
  write tool, no mutating command, and did not delegate.
- Commissioned because the 2026-08-17 privacy dispatch was deliberately
  time-boxed and disclosed itself non-exhaustive; its trigger ("before this
  branch is next pushed to origin") is reached.

## VERDICT: FAIL

Two `major` findings, each independently sufficient.

### F1 — major — §3 rule 11 (Spec-inventory-only ownership) is violated

`design/privacy-review.md:117` requires restricted storage, schema
discrimination, policy, operations, tests and operator guidance to be implemented
ONLY inside files already listed in bound Spec §§7.3-7.4, and closes with "No
separate restricted-store implementation file is authorized by this design."

Three restricted-store files at the candidate are absent from that inventory:

- `plugins/pipeline-core/lib/human-decision-attribution.mjs`
- `plugins/pipeline-core/lib/human-decision-attribution.test.mjs`
- `governance/schemas/human-decision-attribution.schema.json`

Evidence: `spec.md:390-438` enumerates §§7.3-7.4 in full; `rg` for
`human-decision-attribution` across `spec.md`, `spec-revision-20260802.md` and
`design/architecture.md` returns ZERO hits. The module self-identifies as
restricted storage at `human-decision-attribution.mjs:3-15`.

Risk: this is the recurrence of the exact defect §3.11 was written to close — the
first correction re-review FAILed partly because "five new restricted-store files
exceeded the Spec inventory". A blocking privacy contract asserting a false
inventory claim cannot be relied on by the next reviewer or auditor.

NOT a blocker, because the implementation itself is privacy-conservative: closed
nine-key shape, no correlator fields, day-bucketed time, `restricted-machine-local`
profile enforced in-kernel at `governance-event.mjs:180`.

Mitigating context the Critic verified rather than inherited: the build was an
authorized, tracked increment —
`backlog/items/2026-08-18-h-ac-11-restricted-profile-intake-record-is-design-increment-2.md`
is `status: closed`, `closed_at: 2026-08-19`, sourced to a PO amendment of
2026-08-17. So this is **contract drift, not rogue implementation** — but §3.11 is
factually violated at the candidate and was never amended.

Owner: Elephant. Expiry: before this branch is next pushed to origin.

### F2 — major — the §5 privacy sign-off is bound to a superseded candidate

`privacy-review.md` §5 records its pass as bound to commit
`643c7d0623a43333b4597013ba96fa7c5990bdba`, tree
`449465e59ef250d2739140b60e95f0d774474c83`. The candidate is `4defe09`, whose
restricted-store surface has materially changed since that binding: a new
restricted payload schema (`pipeline.human-decision-attribution.v1`), a new
validator, a new kernel discrimination rule (`governance-event.mjs:180`), and a
new free-text field (`MAX_RATIONALE_LENGTH = 4096`,
`human-decision-attribution.mjs:42`).

The document's own gate language requires "a fresh bounded re-review before the
design can reach the Product Owner gate". **No valid privacy pass covers this
candidate.** Anyone reading the Status line as satisfied for `4defe09` is relying
on a stale binding.

Owner: Elephant. Expiry: before this branch is next pushed to origin.

### F3 — minor — §4 bullet 2 variant coverage incomplete

§4 bullet 2 requires nested, encoded, Unicode-confusable, multiline, oversized,
malformed, external-content and error-path variants.
`human-decision-attribution.test.mjs` has 11 tests covering closed shape, closed
value sets, oversized/non-scalar rationale, key-reference pattern, digest form,
bucket alignment and the R-2 no-correlator proof. Absent: Unicode-confusable,
encoded, nested, multiline and external-content variants against the 4096-char
free-text `rationale`. Risk limited — the field is restricted-profile-only by
kernel enforcement and `isUnicodeScalarString` (`human-decision-attribution.mjs:49-62`)
rejects lone surrogates. Owner: Elephant. Expiry: next Phoenix restricted-store
work package.

## Examined and deliberately NOT flagged

- §3 rule 7 / §4 bullet 7 erase and key destruction: real, executable, correctly
  located inside Spec-listed files (`governance-event-store.mjs:1674`, `:1694`,
  closed operation set at `:241`/`:1624`, CLI at `governance-event.mjs:94,112,115,116`).
  **The prior review's accepted blocker is discharged.**
- §3 rule 8 honest backup/clone limitation: `governance-event-store.mjs:1733`
  emits `backupDisclosure: "unknown"` rather than claiming deletion. Correct.
- §1 restricted row / §4 bullet 3: no portable counterpart or join handle —
  structurally enforced, not merely documented
  (`human-decision-attribution.test.mjs:81`, `governance-event-store.test.mjs:234`).
- §2 boundary 3 / §3 rule 6: no surviving per-stream ACL claim. The sole hit
  (`spec.md:664`) is a per-stream *lock* for Git concurrency, not an access claim.
  The prior FAIL's confidentiality misreading has not regressed.
- SEC-01/SEC-08: `governance-event-store.test.mjs:635` asserts a detached
  signature is not copied into `repository-public-safe` storage.
- ADR renumbering (`0071` vs `spec.md:407`'s `0062`): no privacy consequence.
- `governance-event-projection.*` / `docs/governance-event-export.md`: withdrawn
  as §3.11 candidates — authorized at `spec.md:532,533,540`.

## Trajectory check — NOT VERIFIABLE, with reasons

(a) the dispatch correctly excluded `evidence/dispatch-record-*.json` per CR-01,
removing the usual per-phase execution record; (b) candidate `4defe09` carries
only `AI-Assisted: true`, no session or `Co-Authored-By` trailer, so EL-01/EL-16
authorship cannot be established from trailers; (c) the review object is a tree,
not a diff, so no per-file authorship attribution is structurally available. The
Critic makes NO claim either way about whether production diffs originated from
dispatched fresh-context sessions. Limitation of the review object, not an
observed violation.

## Briefing violations observed — NONE

Three items disclosed rather than charged: the dispatch's paragraph about the
prior review being time-boxed was judged scope-and-trigger information, not
contamination (the Critic did not read the prior review, and built its gap
enumeration from the contract text alone); the "no model identity asserted" line
versus its own runtime prompt was resolved as disclosure; the dispatch-record
exclusion was judged CR-01-consistent and correct.

## Coverage disclosure — the reason this review was commissioned

Contract totals: **8 §1 rows · 11 §2 boundaries · 11 §3 rules · 12 §4 fixture bullets**.

- §1 reached: Restricted human decision (deep); Portable human decision and
  Lifecycle correlation (partial). NOT reached: Agent declaration · External
  reference or ITSM observation · Export delivery state · Recovery evidence ·
  External command offer.
- §2 reached: portable→readers (partial) · restricted→authorized query (deep) ·
  policy→canonical writer (partial). NOT reached: capture request→policy ·
  portable→query/viewer · canonical→bundle · inbound external/ITSM→Pipeline ·
  projection→outbox · outbox→destination · recovery→stream/projection ·
  command offer→user terminal.
- §3 reached: 2, 6, 7, 8, 11 (→F1). Partial: 1, 3, 5, 9. NOT reached: 4
  (context-personal denial proof) · 10 (backfill preview/consent).
- §4 reached: 3, 7 (deep); 2 (→F3). Partial: 1, 11. NOT reached: 4 · 5 (no
  dedicated direct-clone-exposure fixture; `governance-event-store.test.mjs:776`
  is a clone-at-different-path *binding* test, not an exposure proof) · 6 · 8 ·
  9 · 10 · 12.

No test suite was executed; all §4 conclusions are from fixture inspection, and
the Critic states that rather than implying execution. Where an implementation
was absent it classified the bullet as not-yet-closed rather than as a finding.

**The Critic's own words on this:** the coverage gaps do not weaken the FAIL,
which rests on findings that exist — but they "would have been disqualifying for
a PASS" and are named individually for that reason.

## Elephant's disposition — NOT YET DECIDED

F2 is the release-relevant one: there is no valid privacy pass for this
candidate, and the design's own gate language demands a fresh bounded re-review
before the PO gate. F1 is a documentation/contract correction (amend Spec
§§7.3-7.4 to list the three files, or move them). Both carry the same expiry:
before this branch is next pushed to origin. Neither has been actioned.

## PO disposition — 2026-08-31

F1 and F2 are DISCLOSED AND ACCEPTED UNREMEDIATED for the 0.6.0 release, because
remediation would require retroactively rewriting a closed epic's digest-bound
authority record. Tracked as `backlog/items/2026-08-31-restricted-store-files-exceed-the-spec-inventory-the-privacy-contract-asserts.md`
(F1) and `backlog/items/2026-08-31-the-privacy-sign-off-is-bound-to-a-superseded-candidate.md`
(F2), both `sprint: nova-b`.
