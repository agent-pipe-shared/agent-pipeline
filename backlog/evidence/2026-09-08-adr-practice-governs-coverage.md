# Retrospective, repository scope, executor dispatch, and context bundle coverage

The machine proof is produced by
`scratch/NVA-B-ADR-GOVERNS-PRACTICE-8/check.mjs` at
`scratch/NVA-B-ADR-GOVERNS-PRACTICE-8/check-output.json`. It parses the four
headers with the reconciliation parser, checks the fixed baseline
`9f8d13d2f56ef84288dc50a5dc2d6d6336606112` after removing only the header,
requires every named target to be tracked and nonempty, binds current source
hashes, and reuses the established canonical status classifier against the
80-row historical capture. Its global accepted/governed count is observational
while parallel packages are in flight; its asserted local increment is 4/4.
`scratch/NVA-B-ADR-GOVERNS-PRACTICE-8/check-capture.md` is the redacted
machine capture of the final zero-exit invocation.
The superseded pre-correction output and capture are retained byte-for-byte at
`scratch/NVA-B-ADR-GOVERNS-PRACTICE-8/check-output-before-correction.json` and
`scratch/NVA-B-ADR-GOVERNS-PRACTICE-8/check-capture-before-correction.md`.

## ADR-0018 — Elephant-authored close retrospective

`docs/operating-model.md` supplies the close boundary; `roles/elephant.md`
assigns lessons aggregation to the orchestrator; the close checklist makes the
explicit improvement-or-nothing result observable; and `close-block/SKILL.md`
executes the close ritual, including the workflow-improvement handoff or
transfer note. No separate test is named because the obligation is a
cross-artifact close practice, not a standalone runtime parser.

## ADR-0019 — one active repository write target

`roles/elephant.md` is the present canonical owner: EL-18 names one repository
and one Elephant, makes monitoring read-only, and requires cross-repository
needs to become a new target-repository transfer item or a handback. The ADR
itself expressly records that repository/path write-root enforcement is
deferred until automated cross-repository writers are enabled; no current
runtime guard or direct test is named as an implementation owner, because that
would overstate the process control as technical enforcement.

## ADR-0020 — bounded executor dispatches

`docs/operating-model.md`, `roles/elephant.md`, `roles/goldfish.md`, and the
Goldfish briefing template own the role boundary and fixed six-field bounded
brief. The close checklist and `close-block/SKILL.md` require the production
diff authorship question. `dispatch-authorship-verify.mjs` and its direct test
bind a Goldfish trailer to the task-specific record and declared changed paths.
The historical Codex/Fable concrete-model sentence has no current Fable carrier
or Codex mapping in these sources; it is therefore not represented as a live
runtime implementation owner. The declared sources cover the still-live
provider-neutral delegation and evidence duties without claiming that missing
mapping is implemented.

## ADR-0023 — context and latency measure bundle

`roles/elephant.md` owns capped report consumption, parallel-first scheduling,
the dispatch ledger, communication economy, and the current phase-boundary
context and package-size checks (EL-21 through EL-25a). Its every-handover
context check and package-size split rule are the current successor surfaces
for the ADR's phase-cut concern; they do not, by themselves, establish that the
historical approximate `10 dispatches / two hours / 50% growth` thresholds are
machine-enforced. `roles/goldfish.md` and the Goldfish template own the report
cap, durable machine evidence, and dispatch fields. The operating model,
token-budget guardrail, and session-bootstrap template publish the portable
briefing and bounded-execution rules.

The generic configured-effort obligation has current V3 owners:
`config/runner-profiles-v3.json` supplies the frozen profile/duty routing;
`runner-profiles-v3.mjs` validates that core-owned routing exactly; and
`runtime-projection-v3.mjs` projects the requested selector and effort while
explicitly recording effective model status as unknown. Their direct tests
cover those registry and projection contracts. This is a requested-route
mapping only, never an effective-model attestation. The current readiness
owner is the hard-read-only `readiness-reviewer` agent, invoked through
`spec-readiness-host.mjs`; its direct test covers the host path. `pipeline-start/SKILL.md`,
`ruleset-freshness.mjs`, and its direct test own the advisory freshness path.

No scoped source explicitly supersedes the ADR's historical numeric phase-cut
trigger. The header therefore names its current role-level successor rather
than pretending there is a technical threshold implementation. The historical
Codex/Fable labels likewise have no current direct carrier; the generic V3
requested effort route above is the applicable present owner.

The four ADRs are not entries in `UNIVERSAL_ADRS` in
`harness/scripts/generate-vendored-canon.mjs`; they are repository-root-only.
Several declared role/template/operating-model origins do have generated
consumer destinations, but this package changes neither those origins nor
their generated copies. Parent-owned serial integration remains responsible
for any whole-manifest generation/check.
