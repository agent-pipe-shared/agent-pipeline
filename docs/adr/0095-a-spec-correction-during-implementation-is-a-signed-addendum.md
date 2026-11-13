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
4. **One PO approval per addendum, in the configured mode.** The approval is the PO's; the commands around it are agent work, like the acknowledgement of a caller-authored Critic. Its mode is the design approval's: `gates.human_approval` (kind `spec-addendum`, fail-closed to `signature`). The agent runs `pipeline-state.mjs approve-spec-addendum --by <label> --addendum <path>`, with `--by` only a label the PO gave for this command (EL-36).
   - Under `signature` the first run prints the signing command, `po-human-approval.mjs authorize-critical --kind spec-addendum --addendum <path>`, which the PO runs in an attended terminal, and the follow-up `recordCommand`, which the agent runs unchanged once the proof exists; it verifies the proof and refuses a replay.
   - Under `chat` the same command records the approval at once as an attributed record (`chat-attributed-unattested`) with the PO's label: an attribution, not a proof.

   The approved subject binds the feature, the Spec path and digest, the addendum path and digest, the Critic packet and its consumed receipt digest, the finding ids, and the approval commit: HEAD, with the addendum committed and unchanged in the working tree (the signing terminal also requires the candidate to be the clean HEAD). The private approval store keeps the approval; a committed record without it registers nothing.
5. **The approval is committed evidence; the addendum is content.** The recording step writes `specs/<feature>/evidence/spec-addendum-approval-<sha256>.json`, named by its own digest. `register-feature-package.mjs --add-spec-addendum <approval path>` then adds the addendum (class `design`, no authority, immutable, retained) and the record (`candidate-evidence`) to the package, after checking the record's digest name, its recomputed subject digest, the approval commit (its tree, and an ancestor of HEAD), the addendum bytes at that commit and in the working tree, and a matching private approval (subject digest, commit, label, time, proof). The addendum file itself is not in the administration path set: its commit is content, so the next Critic round reviews it as a delta round over the addendum, its registration and the code correction, and `criticCloseCommit` never admits a commit that adds or changes an addendum as close evidence.
6. **Order inside the course.** The addendum commit is a correction commit. The lineage of the round whose findings it corrects is registered and committed first (the commit-message guard refuses a correction while it is missing, `CRL-LINEAGE-UNREGISTERED`; a lineage cannot be registered once a correction follows its round). The sequence is: finalize the round, commit its lineage, commit the addendum alone, approve, register and commit the manifest with the record, correct the code, run the delta round.
7. **Every consumer reads the approved addenda with the Spec.** One reader (`lib/spec-addendum.mjs`, a leaf module) returns the approved addenda of a package in order, each verified against its approval record, the package and the base digest.
   - The Goldfish briefing names each applied addendum as a context line: path, digest, the findings it corrects, and that it wins where it and the Spec differ. A package whose addenda do not read back is a stop line.
   - The delta round needs no separate binding: the addendum lies in the reviewed range as a changed path, so the packet's diff, its path list and the delta request's path-invariant map carry it.
   - The close refuses (`CLOSE-SPEC-ADDENDUM-UNCOVERED`) while an addendum file at the candidate is not an approved, registered addendum of an active package, or while an applied addendum is not covered. Covered means the course's last registered Critic round reviewed a candidate that holds the addendum with its approved bytes. A superseded addendum does not block.
   - The audit bundle carries every manifest entry, so the addenda and their approval records are exported without further code.
8. **Stacking.** Addenda are numbered and read in order. A new addendum may be approved only when every earlier one is registered. An addendum whose base digest is no longer the approved Spec's (the PO reopened and re-approved the design) is history: it is neither applied nor refused, and the reader reports it as superseded; registering a record against such a Spec is refused (`FPR-SPEC-ADDENDUM-SUPERSEDED`).
9. **Distinct name.** The Critic's `critic-disposition-addendum` (a disposition of a dispatch record) is unrelated; this record is always called the Spec addendum.
10. **`reopen-design` is the PO's own step.** It voids the PO's design approval, so an agent never runs it. The lifecycle guard refuses `pipeline-state.mjs reopen-design --by <name>` from an agent on every runner (`PO-REOPEN-HUMAN-ONLY`, not liftable by a human guard override), and the closed catalogue sanctions only the preview `reopen-design --by <name> --dry-run`, which writes nothing. The Codex and Antigravity adapters skip the lifecycle guard for a sanctioned lifecycle command, so the catalogue itself no longer sanctions the void. Every text that points at the reopen (guard denials, inspect and onboarding actions, the plan runbook, where the step is `po-only`) says that the PO runs it in the PO's own terminal, names the preview, and names the Spec addendum for a correction during implementation (one wording, `lib/reopen-design-po-step.mjs`). The structured actions keep their argv: it is the command the PO runs.

## Consequences

A Critic finding against the Spec gets a route that keeps the phase, needs one PO approval over the delta, and leaves the design signature intact. The Critic reviews the correction in the next delta round, and the close and the audit bundle carry it.

Known limits:

- v1 refuses any change of the criterion set; a new criterion still needs `reopen-design`.
- The approval binds the addendum's commit; an addendum edited after approval no longer matches its record and is refused (`SPEC-ADDENDUM-DIGEST`, `FPR-SPEC-ADDENDUM-DIGEST`).
- The header is three fixed lines; a free-form header is refused, not guessed.
- "Covered" at the close proves that the last registered round's candidate held the addendum, as for any changed path; it does not prove the Critic's report discusses it.
- Under `chat` the approval is an attributed record, not a proof, exactly as for the other critical kinds in that mode.
- Not run on native Windows.

## Affected contracts

ADR-0014 (Critic contract: the addendum enters a delta round), ADR-0045 (topology: an addendum is a `design` entry under `specs/<feature>/`), ADR-0056/ADR-0061 (the approval mode and ceremony), ADR-0085 (the design approval stays one review and one signature; the addendum does not reopen it).
