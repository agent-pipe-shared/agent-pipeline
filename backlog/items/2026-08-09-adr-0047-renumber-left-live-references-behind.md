---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0047-renumber-left-live-references-behind
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Filed as the deliberate follow-up named by commit 88a7133 (\"fix(adr): give the three ADRs numbered 0047 real numbers, and move two records to the code\"), which resolved the docs/adr/ corpus and docs/adr/README.md but explicitly left three classes of out-of-corpus reference untouched. Commit message: \"Two things this deliberately does not do... Both are filed rather than smuggled in.\""
due: 2026-09-08
---

# ADR-0047's renumber left live references behind, in three shapes that need three different repairs

## Description

`88a7133` renumbered the three ADRs that all claimed `0047`:
`0047-model-free-advisor-preflight-v2.md` keeps `0047`;
`0047-local-supervisor-state-authority.md` became `0061`;
`0047-governance-event-kernel.md` became `0062`. The commit repaired the ADR
corpus itself and `docs/adr/README.md`, but deliberately left three classes of
stale reference elsewhere in the repo, each requiring a different repair path
rather than a uniform find-and-replace.

## Triggering situation

Follow-up work explicitly named (and deliberately not performed) by `88a7133`,
which is itself the resolution of `2026-08-07-adr-0047-numbering-collision.md`
step 2. That earlier item's own Assignment note anticipated splitting
remaining follow-ups into their own items before or instead of closing it;
this is that split.

## Affected artifact

**Class 1 — accepted sprint records, leave as historical record (do not
rewrite).** 13 references to "ADR-0047" that now mean ADR-0061
(local-supervisor state authority), across the closed Nova sprint:
`specs/sprint-nova-epic/spec.md:1067,1565`;
`specs/sprint-nova-epic/plans/nova-b.md:113,135,141`;
`specs/sprint-nova-epic/plans/nova-b-readiness-2026-08-06.md:57,59`;
`specs/sprint-nova-epic/result.md:318,402,605,626,633`. These are the accepted
record of a finished sprint; `nova-b-readiness-2026-08-06.md` is itself a
historical analysis of this exact collision, so rewriting its ADR-0047
mentions would edit a record rather than repair a reference.
`nova-b-readiness-2026-08-06.md:109` is a fourteenth hit that names the
collision itself rather than citing either resulting ADR and needs no
resolution either way.

**Class 2 — hash-bound Spec authority, needs the reviewed rebind path.**
`specs/sprint-phoenix-epic/spec.md:403` names
`docs/adr/0047-governance-event-kernel.md`, a path that no longer exists (the
file is now `docs/adr/0062-governance-event-kernel.md`). This Spec is
hash-bound authority: a dispatch that repointed this line directly broke the
binding and put the session into `partial` readiness until the file was
restored (caught by the readiness guard within one tool call during the
`PHX-ADR-FIX` dispatch that produced `88a7133`). It needs the ordinary
reviewed Spec-rebind path, not a plain edit.

**Class 3 — German reference-table drift, accepted at most a human pass.**
`docs/adr/README.md`'s German table has no row at all for the
governance-event-kernel ADR, and `docs/adr/0040-advisor-consent-and-readonly-bash.md:104`
is now stale against the amended English above it. Per the PO ruling of
2026-08-09, English is the authoritative layer and German is a reader aid
that may be removed entirely later — so this class is accepted drift needing
at most a human German pass, explicitly not a defect blocking anything.

## Proposal

1. Class 1: no repair proposed — record the 14 locations as intentionally
   left as historical record; close this class of the item on that basis
   alone, or leave it open as documentation only.
2. Class 2: route `specs/sprint-phoenix-epic/spec.md:403` through the
   ordinary reviewed Spec-rebind mechanism (whatever the Phoenix sprint's own
   calibration prescribes for a hash-bound Spec correction) to repoint the
   ADR path from `0047-governance-event-kernel.md` to
   `0062-governance-event-kernel.md`.
3. Class 3: schedule a human-driven German pass over `docs/adr/README.md`'s
   German table and `docs/adr/0040-advisor-consent-and-readonly-bash.md:104`,
   or defer indefinitely given the PO's stated intent to possibly remove the
   German reader aid entirely later.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** ACCEPTED, narrowed. Class 1: no repair, close as historical
  record per the Proposal's own recommendation. Class 3: deferred, human-only
  German pass, not blocking. Class 2: stays OPEN — this item's own warning
  was violated a second time on 2026-08-18 (see below), which raises rather
  than lowers the bar for how it must be fixed next.
- **Rationale:** Classes 1 and 3 need no design work; the Proposal already
  states the correct disposition for each and nothing since 2026-08-09
  changes it. Class 2 is different: on 2026-08-18, a `PHX-WP-DOCTEMPLATE-SWEEP`
  dispatch's "FIX 2" repeated the exact trap this item documents — a plain
  Goldfish edit to `specs/sprint-phoenix-epic/spec.md:407` (the line had
  drifted from `:403`) changing the ADR path, which broke the `specSha256`
  binding and put session readiness into `partial` again, blocking all
  further writes until the PO ran `git checkout --
  specs/sprint-phoenix-epic/spec.md` outside the session. That is the
  **third** recorded occurrence of the identical failure mode (the
  `PHX-ADR-FIX` dispatch that produced `88a7133`, this item's own filing, and
  now this one) — twice now on the exact same line. Root cause of the repeat:
  the dispatch briefing stated "fix the stale path" without quoting this
  item's Class 2 warning verbatim, so a Goldfish following "fix the stale
  path" literally has no way to know the file is hash-bound authority. A
  briefing that names the target line without also naming the constraint
  invites exactly this.
- **Assignment (if accepted):** Class 2 is NOT dispatchable as an ordinary
  Goldfish edit under any briefing that does not itself go through the
  reviewed Spec-rebind mechanism this item's Proposal names (whatever the
  Phoenix calibration prescribes for a hash-bound Spec correction — see
  `guard-lifecycle-ready.mjs`'s `partial`-readiness recovery path and
  `pipeline-state.mjs po-authority-decision-plan/-select/-apply`). The
  `-apply` step transitions the project `phase` from `implementation` to
  `design`, which is disproportionate for a one-line typo fix — whoever picks
  this up next should treat that cost as a real input to *when* this gets
  fixed (e.g. bundle it with other Spec-authority work that already needs
  that transition), not fix it via a plain edit to avoid the cost. Left open
  rather than closed-as-accepted-drift, because the ADR path in the live Spec
  is still wrong.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Option B — bundle the one-line ADR-path fix into the next Spec-authority work that already needs the `implementation`→`design` phase transition, rather than paying that cost standalone.
- **Rationale:** PO's direct choice, matching the Elephant's recommendation.
- **Assignment:** Deferred, bundled — no standalone dispatch; the next Spec-rebind-triggering change should carry this fix along, quoting the hash-binding warning verbatim per this item's own prior guidance.
- **Date:** 2026-08-18

### Triage — closed 2026-08-19

- **Decision:** Class 2 closed. `specs/sprint-phoenix-epic/spec.md`'s ADR path
  is fixed (`0047-governance-event-kernel.md` → `0062-governance-event-kernel.md`,
  commit `42ffd337`) and the hash binding is fully reconciled — **without**
  paying the `implementation`→`design` phase-transition cost the 2026-08-18
  PO Decision was trying to avoid, and without a fourth occurrence of the
  known failure mode reaching an unrecovered state.
- **What actually happened (fourth occurrence, fully recovered this time):**
  the exact trap this item warns about triggered a fourth time — a plain
  content edit to the hash-bound Spec put session readiness into `partial`,
  blocking every further write session-wide (confirmed identically across
  four independent concurrent dispatches this session, not just the editor).
  Recovery took far longer than it should have (multiple failed hand-patch
  attempts) because the authority binding turns out to have **more
  interlocking fields than this item's own prior notes documented**. Recorded
  here precisely so a fifth occurrence is fast, not another multi-hour
  rediscovery:
  1. `specs/sprint-phoenix-epic/spec.md` — the actual content fix.
  2. `specs/sprint-phoenix-epic/prd_phoenix-epic.md`'s embedded
     `<!-- technical-spec-sha256: ... -->` marker (currently line 11) — must
     be updated to the NEW spec.md sha256. Editing this changes the PRD's own
     bytes, so its own sha256 changes too (cascades to 3 below).
  3. `project/pipeline-state.json`'s `continuity.authority.prd.sha256` — new
     PRD sha256.
  4. `project/pipeline-state.json`'s `continuity.authority.spec.sha256` — new
     spec.md sha256.
  5. `project/pipeline-state.json`'s `planSubmission.planSha256` — new PRD
     sha256.
  6. `project/pipeline-state.json`'s `planSubmission.specSha256` — new
     spec.md sha256.
  7. `project/pipeline-state.json`'s `planApproval.poGateAuthority.planSha256`
     — new PRD sha256.
  8. `project/pipeline-state.json`'s `planApproval.poGateAuthority.specSha256`
     — new spec.md sha256.
  9. `project/pipeline-state.json`'s `planApproval.submissionSha256` — **the
     field that actually blocked recovery the longest.** This is
     `sha256CanonicalJson(state.planSubmission)` (exported from
     `plugins/pipeline-core/lib/plan-spec-state-v2.mjs`), which changes the
     instant fields 5/6 change, and is checked by `currentApproval()`
     (`plan-spec-state-v2.mjs:337`) independently of whether the live files
     match the authority fields — a self-consistency check entirely inside
     `pipeline-state.json`, not a live-file comparison. **Must be computed
     with the actual exported function, never guessed or hand-derived**, e.g.:
     `node -e 'import("./plugins/pipeline-core/lib/plan-spec-state-v2.mjs").then(({sha256CanonicalJson}) => console.log(sha256CanonicalJson(JSON.parse(require("fs").readFileSync("project/pipeline-state.json","utf8")).planSubmission)))'`
  10. Two historical entries in `authorityRevisionReceipts[]` (an append-only
      audit log of a *past* revision, currently around lines 294/298/314)
      also carry the OLD spec sha256 — these must **not** be touched; they
      are a record of what was true at a past commit, not live authority.
  All 9 live-authority edits (1 content + 8 hash-reconciliation fields across
  3 commits) were applied directly by the PO from an external terminal (never
  through the guarded session, since every mutating command — including the
  guard's own suggested remedies — is refused while readiness is `partial`,
  with no in-session override for this gate class). Commits: `42ffd337`
  (content), `32fb7aaa` (PRD/spec hash fields 2-8), `c2f2cf05`
  (`submissionSha256`, field 9). `project-onboarding-v3.mjs inspect --intent
  session` confirmed `status: "ready"`, `diagnostics: []` immediately after.
- **A genuine, separate defect found along the way:** the CLI mechanism this
  item's own 2026-08-18 Assignment named as the alternative,
  `pipeline-state.mjs po-authority-rebind-plan`, cannot ever succeed against
  this repository's actual state — see the new backlog item
  `2026-08-19-po-authority-rebind-plan-checks-for-the-wrong-plan-approval-schema-version.md`.
  `po-authority-decision-plan` (the OTHER named alternative) remains usable
  but still forces the `implementation`→`design` phase transition; the manual
  9-field reconciliation above is the only route found this session that
  avoids both problems.
- **Assignment:** none remaining for Class 2. Class 1 (historical Nova-era
  references) and Class 3 (German table drift) retain their 2026-08-18
  dispositions (no repair / deferred human pass).
- **Date:** 2026-08-19
