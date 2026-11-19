# Epic/feature design approval

Load this before the first `submit-plan` for an `epic` or `feature`. The
Coordinator owns the sequence; routine preparation is agent work. ADR-0085
governs the receipt-based flow: one independent design review, delta follow-ups
until it passes, and one final PO decision. Do not assemble a design-workflow package
or register an authoring dispatch as an approval input.

Normal architecture/design choices use Chat tiles with concrete options,
tradeoffs and a recommendation. Preserve the PO's actual selections, affected
contracts and digest-bound decision lineage in this same fixed design submission.
The configured final design approval covers those selected decisions together
with the design; when a signature is required, obtain one bundled design
signature. No separate normal ADR terminal, activation or adoption signature is
added. After genuine aggregate approval, the sanctioned source consumer verifies
the binding and materializes the approved records internally. Chat selections
alone do not grant implementation authority or let an agent self-approve records.
Exceptional recovery and higher-layer exceptions retain their applicable checks.

Advisor capability preflight is model-free for these profiles. Consultation is
on demand for one concrete question, reason and digest-bound evidence, under
the existing Advisor-consult contract. Bootstrap, resume, Compact, a configured
route or export consent does not by itself trigger consultation. There is no
mandatory initial Advisor course or exception rationale when no consultation
was needed; capability evidence is not an Advisor answer.

1. Complete the material input, PRD, Spec and bound companions in draft. Finish
   relevant document corrections before binding the final source hashes.
   Run deterministic checks for paths, hashes, references and configured
   verification. A project check script runs in draft from `tools/checks/`
   (`node tools/checks/<name>.mjs [args]`) when it is committed and unchanged
   against HEAD (ADR-0098); in draft you cannot write there yourself, so a new
   check is added during implementation or by a human, and a one-off probe
   stays `node scratch/<name>.mjs` with no argument. Check explicit machine-checkable rules; do not invent
   arithmetic from prose. Preserve the separately adopted Reader-review course
   and evidence; it is not the independent technical design review.
   Spec acceptance criteria (shape of `templates/spec.md` §5; `submit-plan`
   refuses otherwise with `PLR-HANDOFF-NO-CRITERION` / `PLR-HANDOFF-CRITERION-UNSUPPORTED` /
   `PLR-HANDOFF-NO-JOURNEY`):
   a normative table with a header row and rows like
   `| AC-1 | WHEN <trigger>, THE system <behaviour> | <test file> |` (or numbered
   `1` / `R-2` rows under an acceptance-criteria heading). Each user-facing
   criterion carries `Journeys:` and `Asserts:` in its own text (a table cell or
   an indented continuation line), e.g. `... Journeys: entry by link and by
   form; reload mid-save; second submit after an error. Asserts: the stored
   record holds the new title.` A criterion no user sees is tagged
   `[not user-facing: <reason>]`; `[user-facing]` forces the duty.
2. Obtain one independent review of the final design sources. Resolve its
   findings; while a round leaves findings open, run a delta follow-up (fresh
   reviewer, only the open findings and what changed) until a round passes, and
   bind the final receipt to the current sources. Do not add a separate readiness child
   that repeats the content review. Preserve the report and canonical review
   receipt, including the receipt chain when a delta is used. Produce each
   receipt with `node <plugin-root>/scripts/design-review-receipt.mjs create`
   (`--repo`, `--feature`, `--report`, `--prd`, `--spec`, `--out`; `--companion`,
   `--previous` for the delta and `--open-finding` as needed; an `--open-finding`
   id is upper-case letters and digits starting with a letter, in 2 to 8
   hyphen-joined parts such as `AC-155` or `DESIGN-REVIEW-3`, so `F1` is refused
   as `DRR-FINDING-IDS` and the refusal names the id). It reads the
   sources and the report from disk and stamps the review time, runner and
   reviewer model itself. Never write or edit a receipt by hand: a hand-written
   receipt is not admissible evidence. Never pass `--requested-route` or
   `--observed-identity`: a self-asserted value is refused with
   `DRC-OBSERVATION-UNATTESTED` (only the typed fallback record,
   `--fallback-reason-code`, may carry a route). On Claude the plugin hooks
   record the end of each `readiness-reviewer` dispatch with the host's model;
   write the report with `node <plugin-root>/scripts/design-review-receipt.mjs
   export-report --repo <root> --out <report path>` (it writes the returned
   text as returned and prints one line; a sanitized publication goes in
   `--report`, the exported text in `--original-report`; the unpublished
   original lives under `evidence/` (for example
   `evidence/design-review-original-<round>.md`): onboarding git-ignores
   `/evidence/`, so it stays local and is never committed, while `create` binds
   its digest; `scratch/` is not admitted for it), and `create` stamps
   the observed model into the receipt itself. A Claude round without that
   observation (a report written by hand, a session started before the hooks
   were loaded) says `unobserved`, and `present-plan` refuses it
   (`PLAN-DESIGN-REVIEW-UNOBSERVED`): dispatch the review again and start a new
   initial receipt. On Codex and Antigravity there is no observation route yet;
   their receipts say `unobserved` visibly and are presented.
   **Before `create`:** run `export-report` (above) so the report exists on disk
   and its observation is bound; a `create` without the exported report has
   nothing to bind. Order per round: review returns, `export-report`, `create`, commit.
   The step between the returned review and `create`, per runner (`design-review-receipt.mjs` has the
   subcommands `create` and `export-report` only; there is no `finalize` step for a design review):

   | Runner | Step before `create` |
   |---|---|
   | Claude | `design-review-receipt.mjs export-report --repo <root> --out <report path>` |
   | Codex | no `export-report` (it needs a Claude observation); write the returned text to the report file as returned, then `create --report` (receipt says `unobserved`) |
   | Antigravity | no `export-report` (it needs a Claude observation); write the returned text to the report file as returned, then `create --report` (receipt says `unobserved`) |
   Dispatching the design review: the `critic-review` skill is for implementation
   batches (diff range, batch preflight) and does not fit uncommitted design
   sources. Dispatch the agent type `pipeline-core:readiness-reviewer` instead.
   Its briefing needs a line `Ruleset SHA: <sha>` (`ruleset-sha` or `=` also
   read; without it `DISPATCH-NO-RULESET-SHA`) and a `Requested route:` line
   naming a model of the runner you are on, as your model-role readback gives
   it (a `claude-` name on Claude, a `gpt-` or `codex-` name on Codex, a
   `gemini-` name on Antigravity; without one `DISPATCH-NO-MODEL`), and
   none of the contamination phrases (claims-to-verify, hunt list, expected
   verdict). Naming Opus additionally needs `Batch scope (MP-07):` and a
   rationale line (`DISPATCH-OPUS-NO-BATCH-RATIONALE`). Then create the receipt.
   Every finding the report leaves open goes into the receipt as one
   `--open-finding <id>`: a report that says ready while it still lists findings
   is `open-findings`, not `pass`, and the PO sees that when signing.
   After a delta round that still reports open findings: correct the sources
   and run the next delta round (`--previous` the last receipt), while one is left.
   **The review is one full round and at most two delta rounds (C30-6, PO
   2026-11-16).** Round 1 is the one full review. Rounds 2 and 3 are delta rounds
   (`--previous` the last receipt; a fresh reviewer that reads only the open
   blocking findings and what the correction changed). There is no round 4:
   `create` refuses it (`DRR-ROUND-CAP`). **Order matters:** after every review
   round, BEFORE you correct anything, write the report (`export-report`), create
   the receipt over the unchanged sources (a receipt binds the bytes the review
   read) and commit it; only then correct the sources and dispatch the next
   delta. A fresh full review after round 1 is never the route: the dispatch of
   the next `readiness-reviewer` is refused while an observed round has no receipt
   (`DISPATCH-DESIGN-REVIEW-NO-RECEIPT`, Claude's host observation; a round
   older than 48 hours counts as abandoned). The reviewer separates
   **blocking findings** from **questions** (`agents/readiness-reviewer.md`); the
   receipt's `--open-finding` ids are exactly the report's `Blocking findings:`
   ids, checked against the bound report text (`DRC-FINDINGS-SPLIT`), and a
   question never holds the design. A report with only questions is ready.
   Before `submit-plan` a correction
   is an ordinary edit and commit; `reopen-design` exists only for a package
   that was already submitted. A delta over unchanged documents may only withdraw findings of the round before.
   `present-plan` refuses while the last receipt is `open-findings` and a delta
   round is left (`PLAN-DESIGN-REVIEW-OPEN`, it names the next delta round); after
   round 3 it no longer refuses: the findings still open are carried in the
   design binding, stated in the signing text, and the PO signs them knowingly or
   sends the design back. Pass every receipt of the chain, initial first. A source
   change after a passing delta round is carried as `unreviewedSourceDelta`, which
   the PO signs knowingly. The `Ruleset SHA:` value of the briefing is the
   `rulesetSha` that `node <plugin-root>/scripts/dispatch-briefing.mjs binding ...`
   prints (the preflight's loaded content identity, else the installed identity,
   else a hash of the plugin root); the dispatch guard only checks its format.
3. Use the sanctioned source-binding and document-integration routes. Update
   digests once, after the last edit: `create-adr.mjs --root <root> --refresh`
   without `--slug` recomputes every ADR draft, and the PRD's
   `technical-spec-sha256` line takes the digest of the final `spec.md`. Commit
   the finalized sources, bound companions,
   review reports and receipts. Before presentation every bound path must be
   a tracked, unmodified regular file. If bound or submitted sources require
   material edits, use the current inspector's sanctioned draft recovery;
   never edit authority markers manually or invent a rebind command.
4. Author the architecture design package in the draft PRD (physical map,
   fitness model, baseline and the declared implementation surface, committed
   in draft) before `submit-plan`; without it `submit-plan` refuses with
   `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED`. Source files stay out of the draft
   commit until `set-phase implementation`.
5. Establish an exact current submission with `submit-plan` when needed. This
   is mechanical agent work, not another PO permission. Inspect the resulting
   state. For `epic`/`feature`, use `present-plan --by <presenter>
   --review-receipt <repo-relative-json-path>`, repeating `--review-receipt`
   once per delta follow-up of the current review chain.
   `--by` is an actor attribution, not a substitute for approval.
   Supply every distinct tracked receipt of the chain in chain order. The retired
   `--design-workflow-package` flag is rejected with `DWP-PRESENT-RETIRED`;
   it is not a recovery route.
6. The lifecycle writer checks the current source/receipt binding mechanically:
   PRD/Spec hashes and technical marker, register/traceability consistency,
   tracked unchanged paths, receipt/report provenance and committed candidate.
   Resolve typed inconsistencies through the returned sanctioned actions; this
   check does not judge content or replace the independent review. Present the
   final design, then follow the inspector's exact action for the configured
   single PO approval ceremony. Only that final recorded decision opens
   implementation. No separate package or Advisor-exception approval is added.

`pipeline-state inspect` is the current action authority. Its receipt request
does not dispatch reviewers or waive ordinary authoring/provenance obligations.
The approval binding must be rebuilt after material source or review drift;
an older receipt or approval request is not current evidence. Keep historical
approval evidence intact and use typed migration hints for retired machinery.
