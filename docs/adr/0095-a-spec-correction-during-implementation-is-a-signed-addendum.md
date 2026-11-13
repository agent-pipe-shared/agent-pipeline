# ADR-0095: A Spec correction during implementation is a signed addendum

> Agent-Pipeline · Sprint Alfred · 2026-11-13

**Status:** accepted (2026-11-13, PO tiles, register D245). Built in candidate 28e. Not yet run on a real consumer repository.

**Context source (PO tiles, 2026-11-13):** after the test round of candidates 28b-28d the PO chose "one 28e with everything", the Spec addendum "as its own file (recommended)" and, for the Critic review unit, "re-render on an id change (recommended)".

## Context

A Critic round during implementation can show that the approved Spec itself is wrong in a detail: an assertion that cannot hold, a wording that contradicts an acceptance criterion, a missing edge case inside an existing criterion. The only route so far was `reopen-design`: it voids the PO's design approval, starts a new design round, and needs a new design signature over the whole package. In the Claude test run the agent took that route for a one-line correction and could not get back to a happy path; the Codex run asked for a second design signature for the same reason. A guard now reserves `reopen-design` for the PO (PO-REOPEN-HUMAN-ONLY), which leaves the agent without any route for a small correction.

## Decision

1. **The Spec stays byte-identical.** A correction is a separate Markdown file in the feature's package directory, `specs/<feature>/spec-addendum-<NN>.md` (`NN` = `01`..`99`, consecutive). It never lives next to a Spec that sits in another `specs/` folder (ADR-0045 amendment 2026-11-13): every artifact other than the PRD and the Spec belongs to `specs/<feature>/`.
2. **Its header binds what it corrects.** The file opens with three lines the reader parses strictly: `Base Spec: <path> sha256:<digest>`, `Critic packet: <32-hex id>`, `Findings: <id>[, <id>]...`. The base digest must equal the Spec digest of the approved package; the packet must be a consumed Critic packet of this feature; every finding id must be a finding of that packet. The body states the correction.
3. **The acceptance criteria do not change in v1.** The criterion ids the addendum names (the extractor of the review unit) must all be ids of the base Spec. Adding or dropping a criterion changes the contract the Critic course is bound to (ADR-0014, the review unit, `CRL-V2-CARRY-COVERAGE`); that stays the PO's `reopen-design`, and the refusal (`SPEC-ADDENDUM-CRITERIA`) names it. The review unit therefore never goes stale on this route.
4. **One PO approval per addendum, in the configured mode.** `pipeline-state.mjs approve-spec-addendum --by <label> --addendum <path>` is run by the PO. Its mode is the design approval's: `gates.human_approval` (kind `spec-addendum`, fail-closed to `signature`). Under `signature` it takes the detached proof of `po-human-approval.mjs authorize-critical --kind spec-addendum --addendum <path>`; under `chat` it asks for an attended-terminal confirmation code. The approved subject binds the feature, the Spec path and digest, the addendum path and digest, the Critic packet and its consumed receipt digest, the finding ids, and the commit that holds the addendum (it must be committed and the tree clean). The agent cannot run it (the guard's human-only verbs, like `reopen-design`).
5. **The approval is committed evidence.** The command writes `specs/<feature>/evidence/spec-addendum-approval-<sha256>.json`. `register-feature-package.mjs --add-spec-addendum <approval path>` adds the addendum (class `design`, no authority, immutable, retained) and the approval record (`candidate-evidence`) to the package. That commit changes the package's core entries, so the Critic course counts it as a correction: the next round is a delta round over it, and no carry-forward treats it as evidence. `criticCloseCommit` refuses any commit that touches an addendum path.
6. **Every consumer reads the approved addenda with the Spec.** One reader (`lib/spec-addendum.mjs`) returns the approved addenda of a package in order, each verified against its approval record, the package and the base digest. The Goldfish briefing lists them as context files after the Spec; the delta request binds their paths and digests and the Critic packet carries them as references (paths only, never prose); the close refuses while a registered addendum is not covered by a consumed Critic round; the audit bundle exports them with their approval records.
7. **Stacking.** Addenda are numbered and read in order. A new addendum may be approved only when every earlier one is registered. An addendum whose base digest is no longer the approved Spec's (the PO reopened and re-approved the design) is history: it is neither applied nor refused, and the reader reports it as superseded.
8. **Distinct name.** The Critic's `critic-disposition-addendum` (a disposition of a dispatch record) is unrelated; this record is always called the Spec addendum.

## Consequences

A Critic finding against the Spec gets a route that keeps the phase, needs one PO approval over the delta, and leaves the design signature intact. The Critic reviews the correction in the next delta round, and the close and the audit bundle carry it.

Known limits:

- v1 refuses any change of the criterion set; a new criterion still needs `reopen-design`.
- The approval binds the addendum's commit; an addendum edited after approval no longer matches its record and is refused (`SPEC-ADDENDUM-DIGEST`).
- The header is three fixed lines; a free-form header is refused, not guessed.
- Not run on native Windows.

## Affected contracts

ADR-0014 (Critic contract: the addendum enters a delta round), ADR-0045 (topology: an addendum is a `design` entry under `specs/<feature>/`), ADR-0056/ADR-0061 (the approval mode and ceremony), ADR-0085 (the design approval stays one review and one signature; the addendum does not reopen it).
