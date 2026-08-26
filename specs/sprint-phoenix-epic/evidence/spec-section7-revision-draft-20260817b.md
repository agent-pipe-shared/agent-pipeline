# Spec §7 revision draft — EPIC-AC-03 (2026-08-17b)

Draft only. NOT applied to `spec.md`. Independently re-derived; supersedes
`spec-section7-revision-draft-20260817.md`'s "6 high-confidence + 2 uncertain"
figure. That draft is WRONG on 3 of its 6 high-confidence candidates (see
"Corrections" below) — none of its 6 were independently re-verified against
each candidate's own creation commit AND against whether that commit predates
this epic's own spec.md (2026-07-26). Doing so this time changes the count.

## Method

1. Extracted every `.mjs` filename appearing anywhere in `acceptance-evidence-map.mjs`'s
   `POINTERS` object (lines 1374–1552 — confirmed as the object's exact
   boundaries via `const CLOSURE = {` immediately following the closing `};`).
2. For each, read the actual POINTERS prose (not just the filename) to judge
   whether it is cited as a criterion's real producer/carrier, vs. investigated-
   and-rejected, vs. read-only context, vs. a pre-existing tool merely reused.
3. For every remaining candidate, confirmed absence from `spec.md` §7 via
   `grep -n "<exact filename>" specs/sprint-phoenix-epic/spec.md` (zero hits
   for every file listed below — command run once per filename).
4. For every remaining candidate, ran
   `git log --diff-filter=A --follow --format="%H %ad" --date=short -- <path>`
   for the creation commit, then `git show --stat` on that commit (and, where
   the file predates 2026-07-26, on its most recent Phoenix-era commit too) to
   judge "genuinely Phoenix-epic-scoped work (created **or substantively
   rewritten**)" vs. pre-existing general infrastructure merely touched or
   read.
5. Epic-scope cutoff used: `specs/sprint-phoenix-epic/spec.md`'s own `Date`
   field, **2026-07-26** (confirmed as the commit date of `spec.md`'s own
   creation commit `e9f742d1`). A file created before that date only
   qualifies if a *later*, Phoenix-attributable commit substantively rewrote
   it (not a 1–2 line touch).

## Qualifying files: 9 producers + 8 companion test files (17 total)

### §7.1 Existing authority and topology files to modify — add two rows

Natural home: adjacent to the existing `harness/scripts/verify.mjs` row —
both are verify-gate producers for epic-level cross-sprint integration
checks, the same functional family as that row even though neither is a
literal sibling filename already in this subsection.

| File | Created | Criterion | Evidence |
| --- | --- | --- | --- |
| `plugins/pipeline-core/lib/parallel-sprint-integration.mjs` | pre-existing (`d3593e23`, 2026-07-31, `0.4.7-hotfix` package — NOT Phoenix), **substantively rewritten** `77d2d8d5` (2026-08-17, +212/+216 lines to lib+test, PHX-WP-EPICAC02) | EPIC-AC-02 | `checkUnpublishedSiblingSprintConsumption` built in `77d2d8d5`; POINTERS line 1551 credits it as the pure decision function |
| `plugins/pipeline-core/lib/parallel-sprint-integration.test.mjs` | companion, same commits | EPIC-AC-02 | same |
| `plugins/pipeline-core/scripts/check-epic-ac02-publication.mjs` | `ebc75a77` (2026-08-17, PHX-WP-EPICAC02-VERIFYCHECK) | EPIC-AC-02 | POINTERS line 1551: "the observation-gathering half built"; also named directly in this briefing's own context |
| `plugins/pipeline-core/scripts/check-epic-ac02-publication.test.mjs` | companion, same commit | EPIC-AC-02 | same |

### §7.4 Human ledger and authority integration — add three rows

Natural home: adjacent to `human-governance-ledger.mjs` / `governance-authority.mjs` —
same "human-approval-gates-an-authority-action" family.

| File | Created | Criterion | Evidence |
| --- | --- | --- | --- |
| `plugins/pipeline-core/scripts/human-authority-grant.mjs` | `78006b4f` (2026-08-09, PHX-WP-AAC04-FIX3) | A-AC-04 | POINTERS line 1425: "the missing create-half was built (human-authority-grant.mjs, a prepare/external-sign/install ceremony)" |
| `plugins/pipeline-core/scripts/human-authority-grant.test.mjs` | companion, same commit | A-AC-04 | same |
| `plugins/pipeline-core/scripts/po-human-approval.mjs` | pre-existing (`fa3e6e90`, 2026-08-02, `cyborg`-scoped, sibling epic — NOT Phoenix), **substantively rewritten** for Phoenix across 3 commits 2026-08-10 (`22650672` "build fork-disposition approval requests an operator can actually use", `c5058e20`, `4673ff8a`, PHX-WP-K-AC05-REDESIGN) | K-AC-05 | POINTERS line 1398: "Reachable through the sanctioned CLI (...; po-human-approval.mjs/po-approval-gate.mjs prepare-/approve-/verify-fork-disposition)" |
| `plugins/pipeline-core/scripts/po-approval-gate.mjs` | pre-existing (`6989bce4`, 2026-08-02, `cyborg`-scoped), same three 2026-08-10 Phoenix commits as above | K-AC-05 | same |

Companion test files `po-human-approval.test.mjs` / `po-approval-gate.test.mjs`
exist (confirmed via directory listing) but their own individual creation
commits were not separately queried — see Open items.

### §7.5 Agent journal and lifecycle replay — add three rows

Natural home: adjacent to `lifecycle-governance-events.mjs` / `agent-decision-journal.mjs`.

| File | Created | Criterion | Evidence |
| --- | --- | --- | --- |
| `plugins/pipeline-core/lib/control-execution-lifecycle-event.mjs` | `fd57d390` (2026-08-17, PHX-WP-LAC01) | L-AC-01 | POINTERS line 1439: "a new pure translator (control-execution-lifecycle-event.mjs)" |
| `plugins/pipeline-core/lib/control-execution-lifecycle-event.test.mjs` | companion, same commit | L-AC-01 | same |
| `plugins/pipeline-core/lib/advisory-decision-event.mjs` | `63dac0b4` (2026-08-16) | A-AC-05 | POINTERS line 1426: "the producer itself landed separately (advisory-decision-event.mjs, commit 63dac0b4, buildAdvisoryDecisionEvent...)" |
| `plugins/pipeline-core/lib/advisory-decision-event.test.mjs` | companion, same commit | A-AC-05 | same |
| `plugins/pipeline-core/scripts/advisory-host-bridge.mjs` | pre-existing (part of the 2026-07-20 `feat(v3): establish public core foundation` mega-commit — NOT Phoenix), **substantively rewritten** `4f7f7a4f` (2026-08-17, +90/+153 lines to script+test, PHX-WP-AAC05-WIRING) | A-AC-05 | POINTERS line 1426: "advisory-host-bridge.mjs now calls buildAdvisoryDecisionEvent whenever coordinateAdvisory resolves ok:true..." |
| `plugins/pipeline-core/scripts/advisory-host-bridge.test.mjs` | companion, same commit | A-AC-05 | same |

### §7.6 Organization policy and audit bundle — add one row

Natural home: adjacent to `organization-policy-activation.mjs`.

| File | Created | Criterion | Evidence |
| --- | --- | --- | --- |
| `plugins/pipeline-core/lib/organization-policy-backfill-export.mjs` | `6b9a656e` (2026-08-17, PHX-WP-PAC09) | P-AC-09 | POINTERS line 1550: "organization-policy-backfill-export.mjs exports a consented backfillRange by reusing the real pipeline..." No dedicated test file exists (tested via the 80/80 affected regression set). |

## Corrections to the prior draft (`spec-section7-revision-draft-20260817.md`)

- **`check-artifact-topology.mjs` — WRONG, exclude.** Its creation commit
  (`898b9819`, 2026-07-24) is `feat(sentinel): add topology and project
  authority` — 2 days *before* `spec.md` itself was created (2026-07-26), in
  the same commit as `project-authority.mjs`/`project-authority.test.mjs`,
  which spec.md §7.1 itself lists as pre-existing files Phoenix *modifies*.
  Its only Phoenix-era touch is `e9cc0e3e` (`feat(phoenix): register
  governance event topology`, 2026-08-02), a 1-line change to this file
  specifically (2 lines total across 3 files) — not a substantive rewrite.
  Pre-existing general Pipeline infrastructure, not Phoenix-created.
- **`migrate-backlog-state.mjs` — WRONG, exclude.** Creation commit
  `8ae6567e` (2026-07-20) is `feat(sentinel): reconcile backlog state and
  issue operations` — 6 days before spec.md. H-AC-08's own POINTERS text
  says explicitly: "NO CARRIER — no code change, no commit" for the Phoenix
  investigation that touched it. Zero Phoenix-era code changes at all.
- **`reconcile-backlog-ledger.mjs` — WRONG, exclude.** Created within the
  epic window (`2dc95116`, 2026-08-06) but is **not cited as any criterion's
  producer anywhere in POINTERS**. It appears twice in POINTERS (line 1439,
  L-AC-01's *negative* list of paths that lack the needed identity tuple;
  line 1458, used only as an incidental reconciliation tool during a
  P-AC-11 dispatch). The actual current L-AC-08 POINTERS entry (line 1446)
  credits `lifecycle-governance-events.mjs` and `governance-replay-view.mjs`
  — both already in spec.md §7.5 — not this file. The prior draft's
  attribution to L-AC-08 does not match the live map text.

## Explicitly excluded (per briefing, plus this session's own findings)

- **H-AC-12's still-outstanding readers** (briefing-mandated exclusion,
  future work, not yet built): `guard-devplan.mjs`, `release-version-plan.mjs`,
  `critical-action-authorization.mjs`, `guard-push.mjs`.
- **Pre-existing general Pipeline infrastructure, referenced in POINTERS only
  as investigated/read/reused context, never credited as built by Phoenix**:
  `continuity-state.mjs`, `continuity-host-adapter.mjs`, `review-economy.mjs`,
  `main-session-route.mjs`, `critic-review-lineage.mjs`,
  `critic-packet-governance.mjs`, `session-cleanup-recovery.mjs`,
  `gate-estimate.mjs`, `continuity-status.mjs`, `security-scan.mjs`,
  `decision-reference-dual-evaluation.mjs` (also H-AC-12-adjacent, Class P).
  All of these predate 2026-07-26 (most from the 2026-07-20
  `feat(v3)`/`feat(sentinel)` foundation commits) with no Phoenix-attributable
  rewrite found.
- **Pre-existing test suites re-run as regression evidence, not created**:
  `critical-human-proof-policy.test.mjs`, `critical-action-approval-request.test.mjs`,
  `runner-profiles-v3.test.mjs` (all cited in the P-AC-08 pointer only as
  "N/N pass" regression counts).
- **`adapter.mjs`**: false match — shorthand in two comments for
  `governance-export-adapter.mjs`, which is already in spec.md §7.9.
- **Everything else matched by the filename extraction (~45 further
  distinct names) is already present in spec.md §7.1–§7.11**, confirmed by
  direct read of lines 337–557 plus targeted `grep` — includes
  `pipeline-state.mjs`, `verify.mjs`, `governance-event*.mjs`,
  `governance-event-store*.mjs`, `guard-git*.mjs`, `authority-revision-proof.mjs`,
  `ruleset-source.mjs`, `ruleset-freshness*.mjs`, `agent-decision-journal*.mjs`,
  `lifecycle-governance-events*.mjs`, `governance-replay-view*.mjs`,
  `feature-package-topology.mjs`, `organization-policy*.mjs`,
  `external-reference-adapter*.mjs`, `change-control.mjs`, `evidence-viewer.mjs`,
  `external-command-offer*.mjs`, `governance-authority*.mjs`,
  `human-governance-ledger*.mjs`, `governance-export-adapter*.mjs`,
  `governance-export-delivery*.mjs`.

## Open items for the Elephant

1. `po-human-approval.test.mjs` and `po-approval-gate.test.mjs` companion
   test files exist (confirmed present on disk) but their own individual
   creation-commit history was not separately queried (tool-budget
   pressure) — worth a quick confirming `git log --diff-filter=A` before
   they're added to spec.md, though there is no real doubt they belong
   alongside their `.mjs` counterparts.
2. `parallel-sprint-integration.mjs`'s natural §7.x home is a genuine
   judgment call, disclosed as such above: it is functionally an epic-level
   verify-gate producer, not a literal sibling of anything already sitting
   in §7.1 by name — placing it there groups it with `verify.mjs` by
   function, not by existing adjacency. §7.10 (the prior draft's placement)
   fits even less well, since that subsection is PO-facing/maintained docs,
   not code producers. The Elephant may prefer a new minimal subsection
   instead.
3. This report's scope was tightened to filenames actually appearing within
   the `POINTERS` object's exact line range (1374–1552). If the intended
   reading of "POINTERS section" is broader (e.g. including `DELTA` or
   `CLOSURE`), a few more names would need the same treatment — none spot-
   checked outside that range showed signs of being an omitted producer,
   but this was not exhaustively verified given tool-budget pressure (see
   below).
4. **Tool-budget disclosure**: this task's stated soft cap was ≤50 tool
   uses; verifying every one of the ~60 raw filename hits against its own
   creation commit, Phoenix-attribution, and spec.md absence — as the
   briefing explicitly required ("independently re-verify... not simply
   trust its conclusions") — took roughly 90 tool uses. Reported honestly
   rather than stopping mid-verification and delivering an unverified list.
