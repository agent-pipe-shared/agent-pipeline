# Doc reconciliation record

This file is the input `harness/scripts/check-doc-reconciliation.mjs` reads to
decide whether every ADR implicated by a checked commit range has been looked
at. It carries no narrative; it is a machine-parsed ledger.

**Format.** A section heading is `## Candidate <40-hex-sha>`, optionally
followed by more text on the same line (a date, a one-line description). Its
body runs until the next `## ` heading or end of file. Inside that body, a
reconciliation line for ADR-NNNN is one of exactly two shapes:

- `- ADR-NNNN: checked, no change needed.`
- `- ADR-NNNN: amended in <commit>.`

A `- ADR-NNNN: ...` line that matches neither shape is reported as
MALFORMED-RECORD-ENTRY and does not satisfy the ADR it names.

**Write-order rule, and why it is arithmetic rather than convention.** The
record names the candidate commit it covers, and **it can never live inside that
commit** — writing it changes the tree, which changes the hash. So the record is
written and committed **last**, and the check is run with `--candidate` set to
the commit the record names: the tip of the substantive work, not the record
commit itself. The push range therefore carries one extra commit that touches
only this file and no governed path.

That asymmetry is now explicit in the tool rather than implied by this
paragraph. ADR bodies and their `Governs:` lines are read from the **candidate
commit** — an ADR's declaration of what it governs exists independently of any
record, so there is no self-reference. The record is read from **`--record-ref`
(default `HEAD`)**, a ref that by construction is not the candidate. Neither is
ever read from the working tree: an uncommitted record satisfies nothing, and a
`Governs:` line deleted only in the working tree narrows nothing. Before
2026-08-09 both were read from disk, which meant a record that existed in no
commit could pass — the failure this file exists to prevent, in the tool that
enforces it.

A `--record-ref` that does not resolve, that carries no record, or that does not
have the candidate as an ancestor is its own typed finding. The reason is named,
never collapsed into an unreconciled decision record.

**Known limitation (v1), stated deliberately.** A record whose section names
candidate commit X is invisible to a run against candidate commit Y even when
X is an ancestor of Y and nothing governed changed in between. That is
deliberate — it is the property that makes a stale record fail — and
widening it to accept a proven-clean ancestor span is the obvious v2, not
something to do here without review.

## Entries

## Candidate 67bb500564c116af7df37624137bb3e328374d57 — 2026-09-01, range 56e91858..67bb5005, re-head onto the final candidate: the one additional commit beyond 86810466 untracks 26 root-level dispatch-record files

This candidate is `86810466`'s immediate successor: the single additional
commit `67bb5005` untracks 26 stranded `dispatch-record*.json` files from the
repository root into a `.gitignore`d archive (touched paths: `.gitignore`,
plus deletions of the 26 root-level `dispatch-record-*.json` files and one
bare `dispatch-record.json`). All eight ADRs implicated in the `86810466`
range remain implicated here, and their verdicts are carried forward
unchanged — the reasoning is restated compactly below rather than
re-derived; see the `86810466` section above for the full analysis.

- ADR-0012: checked, no change needed.

  `docs/state.md` — additive checkpoint activity and rotations across the
  range; unchanged since `86810466`.

- ADR-0056: checked, no change needed.

  `guard-push.mjs`'s release-tag-ancestry check and its follow-ups;
  `project/pipeline-state.json`'s one audit-write commit; neither touches
  the `pushApproval` shape or `gates.push_approval`.

- ADR-0058: checked, no change needed.

  `guard-lifecycle-ready.mjs`'s grammar-denial trim; touches no GMW/HGO
  mechanism.

- ADR-0069: checked, no change needed.

  ADR-0077/0078/0079 and the `docs/adr/README.md` index rows, each
  numbered and landed at acceptance.

- ADR-0075: checked, no change needed.

  Same `guard-push.mjs` finding as ADR-0056;
  `pipeline-state.mjs`/`publication-authority.mjs` untouched.

- ADR-0077: checked, no change needed.

  Same `guard-push.mjs` finding again; `pipeline-state.mjs`'s
  `approve-push` untouched.

- ADR-0078: checked, no change needed.

  `SETUP.md`, `pipeline-update-channel.mjs`, `ruleset-freshness.mjs`
  implement this ADR's own accepted decision.

- ADR-0079: checked, no change needed.

  `guardrails/git.md`'s GIT-09/GIT-10 fixes and new GG-22 rule; GIT-07
  itself, the sentence this ADR governs, remains unchanged —
  implementation deliberately deferred per the ADR's own acceptance
  commit.

**The one additional commit `67bb5005` (untracking 26 root-level
`dispatch-record*.json` files and adding a `.gitignore` rule) is governed by
none of the eight ADRs above**, verified directly against each ADR's own
`Governs:` line rather than assumed:

- ADR-0012 governs `docs/state.md` only.
- ADR-0056 governs `pipeline.user.yaml`, `project/critical-human-proof.json`,
  `project/pipeline-state.json`, `plugins/pipeline-core/hooks/guard-push.mjs`.
- ADR-0058 governs `guard-gate-strength.mjs`, `guard-testpath.mjs`,
  `human-guard-override.mjs`, `po-approval-proof.mjs`, `tool-write-target.mjs`,
  `guard-command-grammar.mjs`, `guard-lifecycle-ready.mjs`, `hooks.json`,
  `docs/human-guard-override-threat-model.md`, `docs/po-approval-proof-contract.md`.
- ADR-0069 governs `docs/adr/**`, `check-adr-consistency.mjs`, `verify.mjs`.
- ADR-0075 governs `publication-authority.mjs`, `publication-executor.mjs`,
  `guard-push.mjs`, `pipeline-state.mjs`.
- ADR-0077 governs `pipeline-state.mjs`, `guard-push.mjs`, `push-prepare.mjs`.
- ADR-0078 governs `ruleset-freshness.mjs`, `pipeline-update-channel.mjs`,
  `staleness-check.mjs`, `SETUP.md`.
- ADR-0079 governs `guardrails/git.md`, `guard-git.mjs`.

None of these lists includes `.gitignore` or any root-level
`dispatch-record*.json` path, so the untracking commit does not implicate a
ninth ADR and does not change any of the eight verdicts above.

## Candidate 8681046622dc23956b760ba93552793b3d983193 — 2026-09-01, range 56e91858..86810466, doc-reconciliation Governs-line repair (ADR-0077/0078/0079) clearing the push-gate path for the 0.6.0 candidate

Fixing the three malformed `Governs:` lines (NVA-B-DOCRECON) made ADR-0077,
ADR-0078 and ADR-0079 self-implicating for the first time — their own globs
previously matched no tracked file, so `implicated` was empty for all three
regardless of what changed. They are recorded here alongside the five ADRs
the pre-fix failing run already named, for the same reason ADR-0066 was
recorded once its own broken glob was repaired: silently never enforced
before is not the same as unaffected now.

- ADR-0012: checked, no change needed.

  `docs/state.md` (this ADR's own governed artifact) changed in 12 commits
  across this range: nine additive checkpoint appends and three rotations
  (`a67b037e`, `43dac5c4`, `b3fcfcf1`), each via `handover-rotate.mjs` per
  ADR-0073, archiving to `docs/state-archive/` rather than duplicating
  content. No competing handover artifact was introduced and nothing was
  moved out of the one canonical file. The canonicalization decision itself
  is untouched.

- ADR-0056: checked, no change needed.

  `plugins/pipeline-core/hooks/guard-push.mjs` changed in 5 commits, all of
  them ADR-0078 D5's new release-tag-ancestry check
  (`checkReleaseTagAncestry()`, refusing a release tag not reachable from
  `origin/main`) and its follow-up notice/warning fixes — confirmed by
  reading the diffs directly, not inferred from commit subjects alone. None
  touches the `pushApproval` state shape, the `approve-push` reader, or
  `gates.push_approval`, the surface this ADR actually governs.
  `project/pipeline-state.json` changed in exactly one commit (`ad13d3d3`,
  "record the signed approval audit for the 0.6.0 candidate") — the same
  `approve-push`-writes-its-own-audit-record pattern already reconciled for
  this ADR in the `314a3282` entry above, not a schema or policy change.

- ADR-0058: checked, no change needed.

  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` changed in 2
  commits (`1314edec`, `15bb3599`), both the new per-session/per-agent
  grammar-denial trim (a shorter 2-line remedy on a repeated same-class Bash
  grammar refusal, keyed per dispatched-agent identity after a measured
  cross-subagent leak). The commit message states its own scope directly:
  "a token-cost trim, never a correctness gate." Neither commit touches the
  GMW window, HGO override arming, or any other mechanism this ADR governs.

- ADR-0069: checked, no change needed.

  The three new ADR files (0077, 0078, 0079) and their `docs/adr/README.md`
  index rows are each exactly what this ADR requires: numbered in the act of
  acceptance, with the file (with its number, not its draft name), the
  README row and the status change landing in one commit each (`442ba393`,
  `c33d39ea`, `b15e2068` — confirmed by reading each commit's own file list).
  The README diff itself is purely three additive rows in number order, no
  reordering or renumbering of any existing row. The allocation-at-acceptance
  rule is being followed, not amended.

- ADR-0075: checked, no change needed.

  Same `guard-push.mjs` finding as ADR-0056 above: the 5 commits in range are
  entirely the release-tag-ancestry check and its notice fixes, confirmed by
  reading the diffs — none touches `enforcePublicationAuthorization`,
  `publication-approve`, or `state.publicationCriticalProofs`, the exact
  surface this ADR names as its own. `pipeline-state.mjs` and
  `publication-authority.mjs`, the other two paths this ADR governs, were not
  touched anywhere in this range.

- ADR-0077: checked, no change needed.

  Same `guard-push.mjs` finding again: the release-tag-ancestry check is a
  new, independent pre-check and never touches the `pushApproval` state shape
  or the push-time approval reader this ADR governs.
  `plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`, the
  other file this ADR governs) was not touched anywhere in this range — the
  per-destination storage this ADR decided is accepted but not yet
  implemented; nothing here contradicts or amends that decision.
  `project/pipeline-state.json`'s one change is the same audit-write pattern
  reconciled under ADR-0056 above.

- ADR-0078: checked, no change needed.

  `SETUP.md`, `pipeline-update-channel.mjs` and `ruleset-freshness.mjs` all
  changed as this ADR's own decision was implemented in this same range: the
  alpha-ref persisted-write path (`bc348608`, `f8c85e09`, `2f1a4dc2`,
  `36d2c0a5`, `023e54cb`) and the Codex marketplace pin to `main` (`f7f3cdc3`).
  These commits execute the accepted decision; none is a deviation from it
  requiring a fresh amendment.

- ADR-0079: checked, no change needed.

  `guardrails/git.md` changed in 6 commits in this range, all GIT-09/GIT-10
  corrections and the new GG-22 rule — none touches GIT-07, the sentence this
  ADR governs, confirmed by reading the current file: GIT-07 still states
  verbatim "The GIT-04 double-confirmation override mechanism applies to
  `GG-17`…`GG-20` exactly like every other rule id — no separate procedure,"
  unchanged since before this ADR was accepted. That is not an oversight: the
  ADR's own acceptance commit (`b15e2068`) states plainly that "Implementation
  is deliberately NOT in this commit. It is guard code, so it owes a
  mandatory T1 round, and a guard change immediately before a release
  sequence is the wrong moment. Filed for the maintenance window." The
  known-stale GIT-07 text and the corresponding `guard-git.mjs` override
  eligibility for `GG-17`…`GG-20` remain open, tracked follow-up work, not a
  gap this reconciliation record can or should paper over.

## Candidate 314a328293aa180c4a251c51f15c4724e58bcf30 — 2026-09-01, range 56e91858..314a3282, post-push release bookkeeping and the CI openssl finding

- ADR-0012: checked, no change needed.

  `docs/state.md` gained one status block recording the push of `56e91858`, the
  first CI run since 2026-08-02 to execute any suite, the measured `openssl`
  cause, and the remaining release path. Purely additive within the existing
  current-handover section: no rotation, no archive row, no section removed, and
  the file is 29984 bytes against this ADR's 30000-byte cap
  (`guard-handover-size` passes). The canonicalization rule is unchanged.

- ADR-0056: checked, no change needed.

  `project/pipeline-state.json` changed because `approve-push` wrote its own
  approval audit record for the signature bound to `56e91858` — that write IS the
  mechanism this ADR specifies, exercised in `signature` mode against the pinned
  trust anchor, not a change to it. The commit was deliberately made AFTER the
  push, never between `approve-push` and `git push`, per the ordering rule in
  `docs/push-release-flow.md`. No decision in ADR-0056 is affected.

## Candidate f8b7b441c00c4fc88924d45a6f0bd5834f9fc17a — 2026-09-01, range dfd26254..f8b7b441, the 0.6.0 interim-release preparation

- ADR-0012: checked, no change needed.

  `docs/state.md` was rotated and rewritten under this ADR's own rules: the
  CI-blocker block was acknowledged for extraction and archived via
  `handover-rotate.mjs` (schema v2 per-section content hash), the archive index
  row was added, and a new current-handover section replaced it. An independent
  review then found that three live carry-forwards had been dropped despite the
  index row asserting extraction; they were restored in `77742ef8` before this
  record was written. The ADR's canonicalization rule is unchanged and was the
  standard the defect was measured against, so it needs no amendment.

- ADR-0045: checked, no change needed.

  One new file under `specs/`:
  `specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`.
  It is an evidence artifact placed in the epic's existing `evidence/`
  directory alongside its sibling `*-critic-review-*.md` files, which is the
  topology this ADR already prescribes. No spec package, directory kind, or
  authority artifact was created, moved, or renamed; the epic's digest-bound
  files (`spec.md`, `design/privacy-review.md`, `lifecycle.json`) were
  deliberately not touched.

- ADR-0069: checked, no change needed.

  `docs/adr/0076-global-chat-attributed-unattested-approval-mode.md` was
  changed, which implicates this ADR because it governs ADR files. The change
  allocated no number, renumbered nothing, and altered no status: it repaired a
  malformed `Governs:` line that embedded prose where
  `check-doc-reconciliation.mjs` parses a comma-separated glob list, and moved
  the qualifying prose to a paragraph below. ADR-0069's allocation-at-acceptance
  rule is untouched by a metadata repair to an already-accepted record.

- ADR-0076: checked, no change needed.

  Implicated because `README.md` is named in this ADR's repaired `Governs:`
  line and `README.md` changed in this range. The change (`f7ab9b42`) is
  confined to the runner-route paragraph and its German reference translation:
  it adds Antigravity to the registered routes and the "a requested route is not
  proof of observed model identity" qualifier. It touches neither
  `gates.human_approval`, nor `chat-attributed-unattested`, nor any approval
  guidance this ADR governs — verified by reading the full diff of `README.md`
  over this range. The ADR's own decision is unaffected.

## Candidate 4e9db9a7ff8b16026c435ebe125cb96374ee9e21 — 2026-08-19, range 85b718cf..4e9db9a7, checkpoint 69 (push confirmation) + gitleaks-item closure bookkeeping

- ADR-0012: checked, no change needed.

  Two docs-only commits on top of the already-pushed `85b718cf`: checkpoint
  69 appended to `docs/state.md` (confirms the push landed, enumerates the
  9 remaining open backlog items for the next session) and a backlog-item
  status correction (unrelated to ADR-0012's own governed artifact except
  that `docs/state.md` narrates it). Purely additive narrative.

## Candidate ebd614cec847abd10da166c46d47748466650cdf — 2026-08-19, range 8a92d377..ebd614ce, checkpoints 36-68: the whole unpushed marathon session since the last push (513 commits) — first Layer 1b reconciliation run since checkpoint 35

Also fixed on the way: ADR-0066's `Governs:` line was wrapped across 3 markdown
lines with each path backtick-quoted — this script's single-line regex parser
only ever read line 1, and the backticks became part of the literal glob
string, so neither path ever matched a real file (ORPHAN-GOVERNS-GLOB).
Reformatted to a single-line bare-path list matching every other ADR's
convention (`ebd614ce`); this is what makes ADR-0066 appear as newly
implicated below — it was silently never enforced before this fix.

- ADR-0012: checked, no change needed.

  `docs/state.md` (ADR-0012's own governed artifact) grew by 33 checkpoint
  entries (36 through 68) and was rotated once (checkpoints 1-60 archived to
  `docs/state-archive/2026-08-19--checkpoints-1-through-60.md` via
  `handover-rotate.mjs`, per [ADR-0073](adr/0073-handover-rotation-extraction-archive-hard-size-gate.md))
  once it exceeded its hard size cap. Both are exactly the canonicalized
  handover's normal operation (one versioned file, rotated not duplicated) —
  no change to the one-file/memory-mirror-only decision itself.

- ADR-0045: checked, no change needed.

  Every implicated path is either `specs/sprint-phoenix-epic/`'s existing
  core package artifacts (`acceptance.md`, `lifecycle.json`, `prd_phoenix-
  epic.md`, `spec.md`, already-enumerated core members) or session/feature
  evidence and design notes under `specs/sprint-phoenix-epic/evidence/` and
  `design/` — exactly the "further session- or feature-appropriate artifacts"
  this ADR's own 2026-08-18 amendment already declared not a topology
  violation. No new artifact kind, no core-package restructuring.

- ADR-0056: checked, no change needed.

  `guard-push.mjs` changed twice in range: a bare-branch-destination-
  resolution fix (the exact known finding named in
  `backlog/items/2026-08-09-bare-branch-name-in-git-push-fails-approval-
  with-a-misleading-code.md`, already understood, not a new decision) and a
  decision-reference dual-evaluation addition (an input-validation extension,
  not a change to which clearance a human must provide or how it binds to
  the candidate). `project/critical-human-proof.json` and `project/pipeline-
  state.json` changes are ordinary operational writes from running the
  already-decided ceremony repeatedly, not schema/policy changes. `gates.
  push_approval` stayed `signature` throughout.

- ADR-0058: checked, no change needed.

  The substantive design work touching these files this range (HGO
  fail-closed-arming Parts A/B/C, prepare-for-signature + refreeze-plan CLI,
  ledger wiring) implements [ADR-0059](adr/0059-signed-human-guard-override.md)
  (Refines this ADR; carries no `Governs:` line of its own, so it is never
  independently enforced by this mechanism) — an already-recorded decision,
  not a fresh one made in this range. `guard-lifecycle-ready.mjs`'s other
  change in range (the closed-shell-grammar `&&`-chain/mkdir-narrowing
  widening, `b3153385`/`329ac49c`) is confined to the independent read-only-
  command-admission logic and never touches the GMW/HGO override or window
  mechanism this ADR actually governs.

- ADR-0066: checked, no change needed.

  Newly implicated only because its own `Governs:` glob was broken (see
  above). `guard-push.mjs`'s changes in range (bare-branch-destination fix,
  decision-reference dual-evaluation) and `pipeline-state.mjs`'s changes
  (plan-approval schema, rebind CLI verbs, lifecycle-event emission,
  decision-reference dual-evaluation) do not touch `enforcePublicationAuthorization`,
  `publication-approve`, or `state.publicationCriticalProofs` — the
  approval-time-only-signature tradeoff this ADR records is untouched.

## Candidate 2f401dc513000227bab0453df8fffb0c67222a26 — 2026-08-18, range 5c3c50d4..2f401dc5, checkpoint 40: PO decided all 7 remaining design items

- ADR-0012: checked, no change needed.

  The only change in this range is a new checkpoint-40 section appended to
  `docs/state.md` (the canonical handover, ADR-0012's own governed
  artifact): the PO's decisions on all 7 items collected in checkpoint 39.
  Purely additive narrative; no handover format or canonicalization rule
  changed.

## Candidate 92528ac86ee8906d5b42989288e384c9b882249b — 2026-08-18, range cf816c3f..92528ac8, checkpoint 39: 5 remaining decisions closed, 42-item Workflow triage disposed

- ADR-0012: checked, no change needed.

  The only change in this range is a new checkpoint-39 section appended to
  `docs/state.md` (the canonical handover, ADR-0012's own governed
  artifact): the 5 remaining PO decisions from checkpoint 38, and the full
  account of the 42-item Workflow triage (7 clusters, 2 more closures, 17
  dispatch-ready confirmations, 7 collected PO-decision items). Purely
  additive narrative; no handover format or canonicalization rule changed.

## Candidate c8dee9d47692fd5f87a6a3f4cc15a666cc7fb247 — 2026-08-18, range 0252cb01..c8dee9d4, PHX-WP-GITLEAKS-RULE-SCOPE dispatch evidence

- ADR-0045: checked, no change needed.

  The changed paths are three new evidence files under
  `specs/sprint-phoenix-epic/evidence/PHX-WP-GITLEAKS-RULE-SCOPE/`
  (`commit-msg.txt`, `dispatch-record.json`, `gitleaks-test-output.tap`) —
  the same durable dispatch-evidence class as every prior ADR-0045 entry in
  this file. No package restructuring; purely additive. (The dispatch's
  actual code change — `.gitleaks.toml`, `harness/scripts/security-adapters/
  gitleaks.mjs`, `gitleaks.test.mjs` — sits outside `specs/**` and is not
  itself governed by this ADR.)

## Candidate df98028da288c9777523c8f1e1e7e8f65ba8afc4 — 2026-08-18, range 0c2267d4..df98028d, checkpoint 38: OT09 investigation persisted (root cause, TP-7 no-override-route finding, reconcile_approval fork risk)

- ADR-0012: checked, no change needed.

  The only change in this range is a new checkpoint-38 section appended to
  `docs/state.md` (the canonical handover, ADR-0012's own governed artifact):
  the fresh OT09 re-test result, the `c6bd3a6b` root-cause commit, the
  empirically-confirmed TP-7 "author-repair-required, no override route"
  finding, and the note that `reconcile_approval`/`GATE_APPROVAL_MODE_KEYS`
  may exist only in Phoenix's local fork. Purely additive narrative; no
  handover format or canonicalization rule changed.

## Candidate 0c2267d4ac68dfc7b4ee96d8e66bc5953d46c2d7 — 2026-08-18, range 671fbde0..0c2267d4, GMW prepare-warning fix (PHX-WP-GMW-PREPARE-WARNING) evidence tracked

- ADR-0045: checked, no change needed.

  The tracked evidence files sit under the existing, already-enumerated
  `specs/sprint-phoenix-epic/evidence/` location. No new root artifact, no
  topology change.

## Candidate c2193f52fa3dd4f448456c4f352ddf67e3b17591 — 2026-08-18, range 2eb52dd2..c2193f52, finalize the PHX-WP-EVIDENCE-PATH-CHECK dispatch-record evidence

- ADR-0045: checked, no change needed.

  Same disposition as the immediately preceding entry: the finalized
  `PHX-WP-EVIDENCE-PATH-CHECK/` evidence files sit under the existing,
  already-enumerated `specs/sprint-phoenix-epic/evidence/` location. No new
  root artifact, no topology change.

## Candidate 2eb52dd2de7b3aadc5979185d289dafa00408058 — 2026-08-18, range e5e3d7e4..2eb52dd2, template evidence-path-check fix (PHX-WP-EVIDENCE-PATH-CHECK) + backlog closure

- ADR-0045: checked, no change needed.

  The changed paths in this range (`PHX-WP-RPACK-STABLE-READ/dispatch-record.json`'s
  finalize and `commit-msg.txt`) sit under the existing, already-enumerated
  `specs/sprint-phoenix-epic/evidence/` location. No new root artifact, no
  topology change. `templates/prompts/goldfish-task.md` itself is not a path
  this ADR's `Governs:` line matches.

## Candidate e5e3d7e44e9dd3a078df605245a276a794a9351d — 2026-08-18, range a07ef670..e5e3d7e4, checkpoint 37: incident recovery, R3/B3 closure, a security-scan case-collision fix, 12 more backlog items disposed

- ADR-0012: checked, no change needed.

  `docs/state.md` remains the single canonical handover file; this range
  only appends checkpoint 37 in the established format (newest entry at the
  top, "Last updated" line bumped). No competing handover artifact was
  introduced.
- ADR-0045: checked, no change needed.

  The new evidence artifacts this range adds — `PHX-WP-DOCTEMPLATE-SWEEP/`'s
  commit-message file, `PHX-WP-RPACK-STABLE-READ/dispatch-record.json`, and
  `wp-p-ac11/aem-check-pac11.md`'s link-path fix — all sit under the
  existing, already-enumerated `specs/sprint-phoenix-epic/evidence/`
  location. The one rename in this range, `evidence/phx-wp-hac08/` →
  `evidence/PHX-WP-HAC08-LEGACY-IMPORT-IMPL/`, is a same-tier rename (a
  case-collision fix, not a new root artifact or a topology change) and
  stays inside that same enumerated location. The pre-existing
  `prd_phoenix-epic.md` vs. `prd.md` naming divergence this ADR already has
  an open, PO-gated backlog item for
  (`2026-08-09-adr-0045-topology-divergence-from-package-and-skill.md`,
  status open, re-triaged this same range — see checkpoint 37) is unchanged
  by this range — not touched, not worsened.

## Candidate a07ef670c2aac2abad17848006442cc7342fd0c1 — 2026-08-18, range 51ed4826..a07ef670, checkpoint 36: broad Workflow-triage of 84 backlog items, 36 disposed, 5 real fixes on the PO signing-ceremony surface

- ADR-0012: checked, no change needed.

  `docs/state.md` remains the single canonical handover file; this range
  only appends checkpoint 36 in the established format (newest entry at the
  top, "Last updated" line bumped). No competing handover artifact was
  introduced.
- ADR-0045: checked, no change needed.

  The new evidence directories this range adds
  (`specs/sprint-phoenix-epic/evidence/PHX-WP-ARPROOF-HUMANNAME/`,
  `PHX-WP-BACKLOG-BULK-DISPOSE/`, `PHX-WP-LAC08-CANCELFIX/`,
  `PHX-WP-POHUMAN-SIGNING-ERGO/`, `PHX-WP-RECONCILE-LOCK-REALPATH/`) all sit
  under the existing, already-enumerated `specs/sprint-phoenix-epic/evidence/`
  location — no new root-level artifact and no divergence from the topology
  ADR-0045's own enumeration describes. The pre-existing `prd_phoenix-epic.md`
  vs. `prd.md` naming divergence this ADR already has an open, PO-gated
  backlog item for
  (`2026-08-09-adr-0045-topology-divergence-from-package-and-skill.md`,
  status open) is unchanged by this range — not touched, not worsened.

## Candidate 1cb00e72117c09f8c23293043da92e9bc6724701 — 2026-08-16, range 8a92d377..1cb00e72, the whole overnight session: v3 trust-anchor port, the GMW/reconcile signing ceremony, A-AC-01's field, and the resulting Verify repair

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: amended in 2390e02f5a106b5ad13b072f7baf5176f8c322f6.
- ADR-0058: checked, no change needed.

**Restated per the known limitation this file's header names** (a record naming an
ancestor candidate is invisible to a wider-range check; `fd917320` already
demonstrated this for the prior narrower session-range entry): ADR-0012 and
ADR-0045 were already checked at narrower candidates within this range and found
unchanged there; nothing in the wider range changes that finding. ADR-0056's
amendment (`2390e02f`, the v3 any-key correction) is likewise an ancestor of this
candidate, restated rather than re-derived.

**ADR-0012** — `docs/state.md` was appended to repeatedly across the whole session
(every checkpoint this range covers). The canonical-handover decision itself (one
versioned file, memory mirror-only, open-items referenced not hand-maintained) is
untouched; every change is additive checkpoint prose in the one file the ADR names.

**ADR-0045** — implicated by `specs/sprint-phoenix-epic/lifecycle.json` (the
PO-signed `feature-package-reconcile` digest correction, `2768f169…` → `300acd10…`,
through the sanctioned reconcile mechanism ADR-0045's own topology expects — not a
hand edit) and by several `specs/sprint-phoenix-epic/design/` and `evidence/`
artifacts (the P-AC-11 critic-review record, the agent-decision producer scoping
docs, the evidence-map generator). All are exactly the artifact classes ADR-0045's
canonical topology already names as legitimate package contents; none change the
topology's own rules.

**ADR-0056** — `project/critical-human-proof.json`'s v3 migration (`0d3d9bcc`) is
the same PO-executed edit `2390e02f` already recorded and amended the ADR for. No
further change to the file or the ADR happened later in this range — the
signature ceremony this range's later commits perform (GMW window install,
`feature-package-reconcile` consumption) reads that same v3-empty policy, it does
not alter it again.

**ADR-0058** — implicated by `plugins/pipeline-core/lib/human-guard-override.mjs`,
ported tonight (`6a548cf9`) from a scalar `trustPolicy` to the v3 `trustAnchors`-SET
shape via `verifyAgainstTrustAnchors`, mirroring the identical, already-shipped
pattern in `lib/critical-action-authorization.mjs`. Read the ADR's own text for a
claim this could contradict: it names `project/critical-human-proof.json` generically
as "the file carrying the trust anchor" (§3) and separately states that a window
cannot be used to rewrite "`push_approval` or the trust anchor mid-window" (§7) —
neither claim is about the field's internal singular-vs-set shape, so neither is
made stale by this port. This is a compatibility fix (the mechanism now
understands a schema the committed policy already uses) not a design change to the
window mechanism ADR-0058 describes.

## Candidate 707129812a4f09a70ba727087544f28f34e80638 — 2026-08-16, range 2390e02f..70712981, the closing gate run recorded in the handover

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: amended in 2390e02f5a106b5ad13b072f7baf5176f8c322f6.

The only `Governs:`-listed path changed in this entry's own narrow range is
`docs/state.md`, appended once with the closing `verify.mjs` result. ADR-0012's
decision — one canonical versioned handover file, memory mirror-only, the open-items
block referenced rather than hand-maintained — is untouched. The other commit in that
narrow range (`fix(reconciliation): use the full commit SHA …`) edits this record
file, which no ADR governs.

**ADR-0045 and ADR-0056 are restated here deliberately, and this is worth reading
before extending this file.** The checker does not compose sub-range entries: a
Layer 1b run over a wider span (`--base <last pushed> --candidate <tip>`, which is
the shape a push actually uses) requires ONE entry naming the final candidate and
covering every ADR implicated anywhere in that span. A chain of correct incremental
entries does not satisfy it — verified directly here, where
`--base 8a92d377 --candidate 70712981` reported ADR-0045 and ADR-0056 unreconciled
even though both were fully checked one entry below. That is the same
narrow-ancestor-span limitation this file's own header already names as the obvious
v2. Restating them is therefore not duplication for its own sake; it is what keeps a
session's whole range pushable.

Both restatements are the same findings, unchanged and not re-derived: ADR-0045 was
implicated by three `specs/` paths and needed no change (see the entry below for the
manifest-enumeration note), and ADR-0056 was genuinely amended, by a commit that is an
ancestor of this candidate.

## Candidate 2390e02f5a106b5ad13b072f7baf5176f8c322f6 — 2026-08-16, range a15fe3ee..2390e02f, the P-AC-11 criterion arc, its Critic FAIL and fix cycle, and the PO's v3 trust-anchor migration

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: amended in 2390e02f.

ADR-0012 governs `docs/state.md`, changed twice in this range (`cf205a57`, and the
earlier `a15fe3ee` already covered by the entry below). Both are append-only
additions at the top of the file. Its decision — one canonical versioned handover
file, memory mirror-only — is untouched: nothing moved out of `state.md`, and no
secondary source was introduced.

ADR-0045 governs `specs/**`, implicated by three paths: a new design document
(`design/agent-decision-journal-production-producer.md`), a new Critic review record
(`evidence/pac11-critic-review-8be6c308.md`), and an edit to
`evidence/acceptance-evidence-map.mjs`. All three sit in `design/` and `evidence/`,
established subdirectories of the package that already hold many files of exactly
these kinds. Recorded honestly rather than left implicit: none of the three is
enumerated in the package's own `lifecycle.json` manifest, which lists 13 artifacts.
That is consistent with existing practice (`design/class-b-multi-dispatch-plan.md`
and `design/p-ac-06-clause-disposition-proposal.md` are likewise unlisted and
tracked) and with the deliberate revert of the orphaned-artifact check in
`cc43a182`, after the PO ruled both P-AC-06 clauses spec problems rather than code
gaps. No ADR change follows from it; the standing divergence is already filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`.

ADR-0056 is the one that genuinely moved, and `checked, no change needed` would have
been false. It states in three places (`:175`, `:232`, `:248`) that the committed
`trustAnchor` is a single key and is "unchanged and un-widened". The PO's `0d3d9bcc`
migrated `project/critical-human-proof.json` to schema v3 with an **empty**
`trustAnchors` set — the any-key posture — so the ADR described a state the
repository no longer had. `2390e02f` appends a dated correction recording what
changed, why (the anchor had been rotated to a key present on only one of the two
machines, and pinning per-machine keys would have required a signature to obtain the
ability to sign), what is and is not weakened (the detached proof stays; identity
pinning goes; agents still cannot write the proof outside the repository root), and
two operational consequences measured directly rather than assumed.

- ADR-0012: checked, no change needed.

Covers five commits. Only two touch a `Governs:`-listed path, both `docs/state.md`
under ADR-0012: `ae229923` (de-links a dead ADR-0061 Markdown link on one line;
link mechanics only, no assertion in the file altered) and `a15fe3ee` (a new
append-only checkpoint section at the top, plus the `Last updated` line). ADR-0012's
decision — one canonical versioned handover file, memory mirror-only — is unaffected:
`docs/state.md` remains the single handover, nothing was moved out of it, and no
secondary source was introduced.

The other three commits touch no governed path. `144db6ae` is `backlog/**` (items,
evidence, and the three machine-written ledger projections), `7a2f6fce` is
`docs/product-capability-inventory.json`, and `2724e234` is `docs/push-release-flow.md`
plus one `backlog/items/` file. None of those paths appears in any ADR's `Governs:`
line — checked directly against all five ADRs that carry one (0012, 0040, 0045, 0056,
0058), not assumed from the checker's silence. ADR-0045 (`specs/**`) is specifically
not implicated: no `specs/` path changed in this range, because the one dispatch
record destined for `specs/sprint-phoenix-epic/evidence/` could not be committed —
`evidence/` is gitignored, and the dispatch correctly declined to force-add against
that stated repository policy rather than ship an out-of-scope exception.

## Candidate 988183e83501fa6c2c46975ce8d0af9a07383379 — 2026-08-12, range 945f9989..988183e8, push ceremony ADR-0061 skew + red-Verify block recorded

- ADR-0012: checked, no change needed.

Covers two commits: `4b24ea01` (docs/state.md, additive checkpoint recording
the ADR-0061 version-skew finding and Layer 5's red-Verify block — append-only,
nothing rewritten) and `988183e8` (backlog/items/..., which carries no
`Governs:` line and is out of this check's scope). No other governed path
touched.

## Candidate 0376a6652e9380b61b6ea72dede3d60c21a7ab58 — 2026-08-12, range eb735ae1..0376a665, the substantive tip of tonight's push candidate; supersedes the entries below (all their commit SHAs are orphaned by the PO-run rebase `git rebase --onto cd38619e ad5a537e sprint_phoenix`, which corrected the `979e579c`/`ad5a537e` commit-attribution defect and reassigned every SHA after `cd38619e`, though the analysis in each superseded entry remains valid and is incorporated here rather than redone)

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.

**ADR-0012** (governs `docs/state.md`): every touch across this full range is
an additive checkpoint append, consistent with every prior individual check
in this file's superseded entries below (`04115341`, `2b9cfdad`, `76d9ba1d`,
`5375ace6`, `a526e697`, `19badaa1`, `26c2d254`, and others) plus this range's
one new commit not previously checked, `0376a665` itself (this file's own
predecessor state.md commit, recording the PO-run rebase and the push
ceremony in progress) — append-only, nothing rewritten.

**ADR-0045** (governs the `specs/sprint-phoenix-epic/` canonical topology):
every touched path — `acceptance.md`, the two design docs, the evidence-map
generator and its dated snapshots, the GMW window-status evidence artifact —
stays under the existing `specs/sprint-phoenix-epic/` tree with no new
top-level artifact and no topology migration attempted, consistent with every
prior individual check in the superseded entries below. The `acceptance.md`
edit leaving `lifecycle.json`'s pinned digest stale (`FTP-ARTIFACT-2`,
recorded in the superseded `04115341` entry's own state.md section) is a
digest-binding question for `feature-package-reconcile`, not a topology
question ADR-0045 governs — the mutable/authority artifact moved exactly as
its own manifest kind permits; re-pinning the digest is the PO-signature-gated
follow-up already on record, not an ADR-0045 finding.

**ADR-0056** (governs `pipeline.user.yaml`, `project/critical-human-proof.json`,
`project/pipeline-state.json`, `plugins/pipeline-core/hooks/guard-push.mjs`):
newly implicated in this range by `project/critical-human-proof.json`'s
`trustAnchor.publicKeySha256` change (commit `2f56a6fb`, "rotate trust anchor
to new PO key (old key lost)") — not previously checked against this ADR
because the file had no `Governs:` line for it at the time of the original
`05ce87ec` entry (superseded below); ADR-0056 §"What a project must do to use
it" and its "governing session" paragraph both describe rotating this exact
field as the anticipated, GS-2-protected, out-of-session operator action —
"performed outside an agent session — by design." The rotation is that
action, done by the PO; nothing about it contradicts or requires amending
the ADR's decisions. No other ADR-0056-governed path (`pipeline.user.yaml`,
`project/pipeline-state.json`, `guard-push.mjs`) changed in this range.

## Candidate 04115341b6853f45564aaab04dbc157d253ebf2f — 2026-08-12, range 47f2e835..04115341, AFK run closed -- final Verify triage, honest gap report

- ADR-0012: checked, no change needed.

Covers exactly one commit (`04115341`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 09785aee2ae83c57e7179bdd216449f58325713e — 2026-08-12, range db3b6c3b..09785aee, PX0-AC-05 Critic FAIL recorded in evidence map

- ADR-0045: checked, no change needed.

Covers exactly one commit (`09785aee`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs` (a
POINTERS note extension, verdict unchanged, totals regenerated and
confirmed 130/157). File placement, naming and directory shape
unaffected.

## Candidate 4a2a5e7b406b10fcf359dfb01f1b8f1df0eed2d6 — 2026-08-12, range 1d11c7f2..4a2a5e7b, GMW window status evidence artifact captured

- ADR-0045: checked, no change needed.

Covers exactly one commit (`4a2a5e7b`), touching only
`specs/sprint-phoenix-epic/evidence/gmw-tp5-px0ac05-window-status-20260812.json`
(a new evidence artifact, force-added past the normal `evidence/`
gitignore per this package's established convention). File placement
matches the existing `evidence/` topology.

## Candidate 2b9cfdad5e2fb534d0a589916d2d2d1214c9c615 — 2026-08-12, range 1739d1c6..2b9cfdad, PX0-AC-05 Critic FAIL recorded, GMW window closed

- ADR-0012: checked, no change needed.

Covers exactly one commit (`2b9cfdad`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 76d9ba1d18afc47cd56b00362de447f974d151d1 — 2026-08-12, range 0debe151..76d9ba1d, PX0-AC-05 Critic model-tier mistake recorded, re-dispatched

- ADR-0012: checked, no change needed.

Covers exactly one commit (`76d9ba1d`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 5375ace64ff8c8d763aafc226b2f7b0bcdc07b15 — 2026-08-12, range 3452c5db..5375ace6, PX0-AC-13 resolution + PX0-AC-05 AR05g landing recorded in evidence map

- ADR-0045: checked, no change needed.

Covers exactly one commit (`5375ace6`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs` (two
POINTERS note extensions, verdicts unchanged, totals regenerated and
confirmed 130/157). File placement, naming and directory shape unaffected.

## Candidate 7fa07d5420b6db5770a8bc142629f47ebcbe6857 — 2026-08-12, range de79f7b5..7fa07d54, PX0-AC-13 acceptance.md amendment

- ADR-0045: checked, no change needed.

Covers exactly one commit (`7fa07d54`), touching only
`specs/sprint-phoenix-epic/acceptance.md` (an inline amendment paragraph
added under the PX0-AC-13 bullet, same form as the existing H-AC-11
amendment). File placement, naming and directory shape are unaffected.

## Candidate a526e697826c977b745845619f4d44265a34ddca — 2026-08-12, range 43dfcbad..a526e697, both dispatches landed + commit-attribution race recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`a526e697`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 43dfcbad302308c5016011a85f664318db04daee — 2026-08-12, range 24601573..43dfcbad, PO decisions + GMW window active + FAILCLOSED dispatched

- ADR-0012: checked, no change needed.

Covers exactly one commit (`43dfcbad`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 26c2d254b73dc3688891a4dbe055b617907cf814 — 2026-08-12, range 19badaa1..26c2d254, PX0-AC-13 evidence-map note updated with REMOVEATTESTATION finding

- ADR-0045: checked, no change needed.

Covers exactly one commit (`26c2d254`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs` (a prose
note extension inside an existing POINTERS entry; no schema/topology
change). File placement, naming and directory shape are unaffected and
remain within the canonical `specs/<id>/` topology this ADR governs.

## Candidate 19badaa1b44de2c29953368559e62ba46cd65115 — 2026-08-12, range 6ba3238d..19badaa1, REMOVEATTESTATION self-stop + third PX0-AC-13 decision point recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`19badaa1`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 6ba3238dd0ada5ee20379711fc8b67139a7d69c8 — 2026-08-11, range 39367f13..6ba3238d, host-delegation investigation result + final fix dispatch recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`6ba3238d`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 39367f13516cb22cb6587450a6fbc370e4044bcd — 2026-08-11, range f2fc3026..39367f13, PO decision recorded + PX0-AC-13 host-delegation dispatch

- ADR-0012: checked, no change needed.

Covers exactly one commit (`39367f13`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate f2fc3026a08fdd797b10d50580d0f55329fd9b3a — 2026-08-11, range 755a3959..f2fc3026, PX0-AC-13 formalized as a PO decision point

- ADR-0045: checked, no change needed.

Covers exactly one commit (`f2fc3026`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s
`PX0-AC-13` POINTERS note (F2 closure recorded, F1/F3 given the same formal
"PO decision point" framing already used for K-AC-05/O-1/O-2/H-AC-09). No
verdict/count change — stays `partial`.

## Candidate 755a395935b8ae3243f18597af77030c230f1783 — 2026-08-11, range 26ea6a34..755a3959, security-scan fix confirmed + re-verified checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`755a3959`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched. (The fix commit `ba1a7d28` and backlog-closure
commit `26ea6a34` were already reconciled: 0 implicated over
`bccedbc6..26ea6a34`, verified before this entry was written.)

## Candidate b1fc5ba51227f4f63e05a60a6f735efe2a30bbb7 — 2026-08-11, range 029587d2..b1fc5ba5, security-scan BLOCKING (semgrep timeout) recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`b1fc5ba5`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 705c6114a1fc70c55848a0253e451ac1390e325c — 2026-08-11, range 57fc68b6..705c6114, F1/F3 design-question finding recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`705c6114`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 57fc68b6fa157c7ebcb25d498bfe5785db323f20 — 2026-08-11, range 2a1a0903..57fc68b6, F2 doc fix landed + state.md checkpoint

- ADR-0012: checked, no change needed.

Covers two commits (`2a1a0903`, `57fc68b6`): `2a1a0903` touches only
`harness/session-bootstrap.md` (the design-mandated §B.6 sentence, no
`Governs:` line points at this file — confirmed by the checker's own "0
implicated" result over this exact commit, run before this entry was
written); `57fc68b6` touches only `docs/state.md` (additive checkpoint
entry, append-only discipline preserved).

## Candidate 669e551af6e7e72fe887a78eb99ebe890441cc36 — 2026-08-11, range 6a96fb1d..669e551a, PX0-AC-13 FAIL checkpoint, tonight's PX0 sweep closed out

- ADR-0012: checked, no change needed.

Covers exactly one commit (`669e551a`), touching only `docs/state.md`
(additive checkpoint entry appended after the PX0-AC-13 dispatch section,
append-only discipline preserved — nothing rewritten). No other governed
path touched.

## Candidate ebdb00a58d54bf1266e4930f1d66fb108bf20144 — 2026-08-11, range 2d87c0ec..ebdb00a5, PX0-AC-13 Critic FAIL recorded (no status change)

- ADR-0045: checked, no change needed.

Covers exactly one commit (`ebdb00a5`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s
`PX0-AC-13` POINTERS note (correcting the prior "just needs a Critic PASS"
belief with the FAIL's real findings). No verdict/count change — stays
`partial`.

## Candidate 2d87c0ec857f00425ec8853daf162c17872ea219 — 2026-08-11, range d276cdf1..2d87c0ec, task-tracking correction + PX0-AC-13 Critic dispatch checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`2d87c0ec`), touching only `docs/state.md`
(additive checkpoint entry appended after the PX0-AC-05 fix note,
append-only discipline preserved — nothing rewritten). No other governed
path touched.

## Candidate d276cdf1e681827d289ec06d62ba49b919fa0e31 — 2026-08-11, range 022718b0..d276cdf1, PX0-AC-05 security fix + fix-landing note

- ADR-0045: checked, no change needed.

Covers two commits (`022718b0`, `d276cdf1`): `022718b0` touches
`plugins/pipeline-core/lib/authority-revision-proof.mjs` and its own test
file, neither carrying a `Governs:` line; `d276cdf1` touches only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s
`PX0-AC-05` note (fix-landing update, no status/count change).

## Candidate 451196b9c17cc3b869f992c6768654333a0ae085 — 2026-08-11, range 80887ecd..451196b9, PX0 Critic verdict checkpoint + PX0-AC-05 fix dispatch

- ADR-0012: checked, no change needed.

Covers exactly one commit (`451196b9`), touching only `docs/state.md`
(additive checkpoint entry appended after the PX0-dispatch note, append-only
discipline preserved — nothing rewritten). No other governed path touched.

## Candidate 80887ecded4e78e3776835bc1f1128a5605dfea4 — 2026-08-11, range 77907f43..80887ecd, PX0-AC-03/06 flipped to implemented, PX0-AC-05 Critic FAIL recorded

- ADR-0045: checked, no change needed.

Covers exactly one commit (`80887ecd`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs` (verdict
flips for `PX0-AC-03`/`PX0-AC-06` in `DELTA`, plus their and `PX0-AC-05`'s
closing `POINTERS` notes). Regenerated report confirms `130/23/3/0/1`.

## Candidate 77907f43b8649c3e1ec24ff0082e2529d04f08f4 — 2026-08-11, range d827c1b3..77907f43, PX0-AC-13 grouping correction + PX0 Critic dispatch checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`77907f43`), touching only `docs/state.md`
(a correction to the prior next-action note, plus a record of the dispatched
first-pass Critic review, appended in place after the prior checkpoint
paragraph — append-only discipline preserved, nothing rewritten out from
under it). No other governed path touched.

## Candidate 5a2e339759b82fd1f3eb1b5cd0f71748ef65071e — 2026-08-11, range 27b0390f..5a2e3397, next-action checkpoint (PX0-AC-03/05/06/13 Critic-PASS opportunity)

- ADR-0012: checked, no change needed.

Covers exactly one commit (`5a2e3397`), touching only `docs/state.md`
(additive checkpoint entry appended after the GMW-close note, append-only
discipline preserved — nothing rewritten). No other governed path touched.

## Candidate 27b0390f2103cc351139101a041ba35f7e70afb6 — 2026-08-11, range 85953981..27b0390f, PX0-AC-06 stale-note correction

- ADR-0045: checked, no change needed.

Covers exactly one commit (`27b0390f`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s
`PX0-AC-06` POINTERS note (correcting it to reflect AR06g/AR06h/AR06i, all
landed earlier the same night; no verdict change, still `partial`).

## Candidate 8595398114decb9f4b9f47716d05adeaf3b4acb5 — 2026-08-11, range c3e270a1..85953981, GMW window closed note

- ADR-0012: checked, no change needed.

Covers exactly one commit (`85953981`), touching only `docs/state.md`
(a short additive note appended after the PASS/flip checkpoint, append-only
discipline preserved — nothing rewritten). No other governed path touched.

## Candidate c3e270a128fe45d386a1530c78e6e8b0a6543ed9 — 2026-08-11, range 113d0bba..c3e270a1, F1 fix Critic PASS + P-AC-08 flip checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`c3e270a1`), touching only `docs/state.md`
(additive checkpoint entry appended after the F-A blocking-scope-resolution
section, append-only discipline preserved — nothing rewritten). No other
governed path touched; the persisted Critic report
(`specs/sprint-phoenix-epic/evidence/pac08-f1-critic-review-3e1a727e.md`)
carries no `Governs:`-tagged path.

## Candidate 113d0bba84c95713819d01ea93f777838977115a — 2026-08-11, range aecc1d8c..113d0bba, P-AC-08 flipped to implemented + backlog item filed

- ADR-0045: checked, no change needed.

Covers two commits (`fe6cbcdc`, `113d0bba`): `fe6cbcdc` touches only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs` (the
`P-AC-08` verdict flip in `DELTA` plus its closing `POINTERS` note —
regenerated report confirms `128/25/3/0/1`); `113d0bba` touches only
`backlog/items/2026-08-11-reconcile-lock-reuse-uses-lexical-not-real-path-comparison.md`,
which carries no `Governs:` line and is not implicated by ADR-0045 or any
other governed ADR.

## Candidate aecc1d8cc1176ac63290bc062e1b5db83e6807f6 — 2026-08-11, range 3e1a727e..aecc1d8c, F1 fix landing checkpoint + F-A blocking-scope resolution

- ADR-0012: checked, no change needed.

Covers exactly one commit (`aecc1d8c`), touching only `docs/state.md`
(additive checkpoint entry appended after the F1-blocker section,
append-only discipline preserved — nothing rewritten). No other governed
path touched; the F1 fix itself (`3e1a727e`, reviewed separately above)
touches only `plugins/pipeline-core/scripts/pipeline-state.mjs` and
`harness/scripts/pipeline-state.test.mjs`, neither of which carries a
`Governs:` line.

## Candidate 5af57a2c17fcad2a8d2ad884bb72020bf302e813 — 2026-08-11, range 28edde05..5af57a2c, P-AC-08 note updated with F-B delta Critic FAIL (F1 blocker)

- ADR-0045: checked, no change needed.

Covers exactly one commit (`5af57a2c`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s `P-AC-08`
NOTES string (a prose append recording the delta Critic FAIL on `5420c5e7`:
F1 blocker, F2/F3/F4 minor-to-major, remediation dispatched; verdict
unchanged at `partial`). Regenerated the report and diffed the summary table
— `127/26/3/0/1` unchanged.

## Candidate 28edde05a3bfd912d6f07ffba875868941c1fa8a — 2026-08-11, range f2d9cac5..28edde05, F-B delta Critic FAIL (F1 blocker) + remediation dispatch checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`28edde05`), touching only `docs/state.md`
(additive checkpoint entry appended after the delta-Critic-dispatch section,
append-only discipline preserved — nothing rewritten). No other governed
path touched; the persisted Critic report
(`specs/sprint-phoenix-epic/evidence/pac08-fb-critic-review-5420c5e7.md`) and
the new dispatch briefing carry no `Governs:`-tagged path.

## Candidate f2d9cac5f9c18bfa82c0e596b2eaffe608081f64 — 2026-08-11, range 5420c5e7..f2d9cac5, F-B fix landing checkpoint (red-before-green evidence, delta Critic dispatched)

- ADR-0012: checked, no change needed.

Covers exactly one commit (`f2d9cac5`), touching only `docs/state.md`
(additive checkpoint entry appended after the P-AC-08-FAIL section,
append-only discipline preserved — nothing rewritten). No other governed path
touched; `5420c5e7` itself (the F-B fix, reviewed separately above) touches
only `plugins/pipeline-core/scripts/pipeline-state.mjs` and
`harness/scripts/pipeline-state.test.mjs`, neither of which carries a
`Governs:` line.

## Candidate 9fa4e89d23fa3df03f4c07aeeda49391c026fbe4 — 2026-08-11, range c8b7847c..9fa4e89d, P-AC-08 note updated with Critic FAIL verdict

- ADR-0045: checked, no change needed.

Covers exactly one commit (`9fa4e89d`), touching only
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`'s `P-AC-08`
NOTES string (a prose append recording the fresh independent Critic FAIL
verdict on the full `c6bd3a6b..3fdf8b9f` range: F3 closed, F-A/F-B open,
F-C/F-D fixed directly; verdict unchanged at `partial`). Regenerated the
report and diffed the summary table — `127/26/3/0/1` unchanged.

## Candidate c8b7847c5911e7c5dda5f98ef4de7e3cd738c5d2 — 2026-08-11, range 3fdf8b9f..c8b7847c, P-AC-08 Critic FAIL verdict + F-C/F-D remediation checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`c8b7847c`), touching only `docs/state.md`
(additive checkpoint entry appended after the TP3-registration section,
append-only discipline preserved — nothing rewritten). No other governed path
touched; the F-C/F-D fixes this checkpoint describes landed in two
gitignored, untracked evidence files (`evidence/PHX-WP-PX0-CASOUTCOME/
dispatch-record.json`, `specs/sprint-phoenix-epic/evidence/PHX-GMW-TP5-
TESTS.dispatch-record.json`), neither of which is a governed path.

## Candidate c5e2e6020663034042a201261ebab12a63f93f6a — 2026-08-11, range ddffcb63..c5e2e602, TP3 registration outcome + OT09 regression finding

- ADR-0012: checked, no change needed.

Covers exactly one commit (`c5e2e602`), touching only `docs/state.md`
(additive checkpoint entry, append-only discipline preserved). No other
governed path touched.

## Candidate 05ce87ecc71d4ea736e6a5f34eb7d9cebdf10edf — 2026-08-11, range 2f56a6fb..05ce87ec, P-AC-08/key-rotation/GMW-window checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`05ce87ec`), touching only `docs/state.md`
(additive checkpoint entry appended after the H-AC-12 section, append-only
discipline preserved — nothing rewritten). No other governed path touched;
the range's other commit (`2f56a6fb`, the PO's own trust-anchor rotation)
touches only `project/critical-human-proof.json`, which carries no
`Governs:` line.

## Candidate 83a35689e1c7a6d685d8cee290e281c2a7bf7b3c — 2026-08-11, range 55e60f67..83a35689, P-AC-08 default-approval-fix note

- ADR-0045: checked, no change needed.

Covers exactly one commit (`83a35689`), touching only
`evidence/acceptance-evidence-map.mjs`'s `P-AC-08` NOTES string (a prose
append recording that PHX-WP-PAC08-RECONCILE-APPROVAL's default-closure fix
landed and was independently re-verified; verdict unchanged at `partial`).
Regenerated the report and diffed the summary table — `127/26/3/0/1`
byte-identical before/after. No artifact topology, schema, or manifest
tracking changed; the file stays under `specs/sprint-phoenix-epic/`, not
`lifecycle.json`-tracked.

## Candidate 1d02fbe09775e8000d5549571e0d72f9baf35afe — 2026-08-11, range 98509db7..1d02fbe0, Git-guard override consumption measurement finding for H-AC-12

- ADR-0045: checked, no change needed.

Covers exactly one commit (`1d02fbe0`), touching
`evidence/acceptance-evidence-map.mjs` (H-AC-12 inline comment only; short
evidence-table string unchanged, confirmed by regenerating and diffing —
rendered output byte-identical, no new snapshot committed) and
`design/class-b-multi-dispatch-plan.md`, both under `specs/sprint-phoenix-
epic/`, neither manifest-tracked in `lifecycle.json`.

## Candidate 98509db7caa67d1d10a44a83a3dbd51b38721b4d — 2026-08-11, range ff4558f2..98509db7, correct the H-AC-12 handover entry in state.md

- ADR-0012: checked, no change needed.

Covers exactly one commit (`98509db7`), touching only `docs/state.md`
(additive dated correction note appended after the original H-AC-12 entry,
matching `ff4558f2`'s correction elsewhere — original text left in place
per append-only discipline). No other governed path touched.

## Candidate ff4558f28ab8b8fef2e1663a0b9fdfb105cc9254 — 2026-08-11, range d328e307..ff4558f2, correct the H-AC-12 disposition (amendment, not measurement)

- ADR-0045: checked, no change needed.

Covers exactly one commit (`ff4558f2`), touching the same three
`specs/sprint-phoenix-epic/` files as `17af46cb`
(`evidence/acceptance-evidence-map.mjs`, a new dated snapshot
`evidence/acceptance-evidence-map-20260811d.md`, and
`design/class-b-multi-dispatch-plan.md`), all still unmanifested in
`lifecycle.json`. advisor()-flagged correction: reclassifies two of
`17af46cb`'s dispositions from "documented, closed" to "PO decided, still
open pending an `acceptance.md` amendment" — content-only, verdict tuple
unchanged.

## Candidate d328e307dedbd61ea46ba40d34251e76123caab6 — 2026-08-11, range 17af46cb..d328e307, H-AC-12 disposition recorded in state.md handover

- ADR-0012: checked, no change needed.

Covers exactly one commit (`d328e307`), touching only `docs/state.md`
(additive handover entry summarizing the H-AC-12 disposition landed in
`17af46cb`/`197d5072`). No other governed path touched.

## Candidate 17af46cb2127ea9befb352e7bf431205334ca0c3 — 2026-08-11, range 06ec4e74..17af46cb, PO dispositions H-AC-12's release-planning/deploy-consumption subsystems

- ADR-0045: checked, no change needed.

Covers exactly one commit (`17af46cb`), touching three files under
`specs/sprint-phoenix-epic/`: `evidence/acceptance-evidence-map.mjs`
(H-AC-12 verdict comment/note updated, verdict tuple unchanged at
`['partial', 'WP-H-AC12']`), a new dated snapshot
`evidence/acceptance-evidence-map-20260811c.md` (regenerated via the
generator's own `--out`, diffed against `-20260811b.md` to confirm exactly
one table row changed and totals held at 127/26/3/0/1), and
`design/class-b-multi-dispatch-plan.md` (an existing design artifact,
extended with tonight's follow-up scoping). None of the three is manifest-
tracked in `lifecycle.json` (checked: only the eight named root/design
docs are), so no artifact-topology or digest-coupling constraint applies —
unlike `acceptance.md`, which stayed untouched here.

## Candidate 06ec4e74911d8b7f3162fa582c2c9bc3aa8a60af — 2026-08-11, range f188d5eb..06ec4e74, four-question decision matrix summary

- ADR-0012: checked, no change needed.

Covers exactly one commit (`06ec4e74`), touching only `docs/state.md`
(additive: consolidates the four PO answers and their outcomes into one
summary section). No other governed path touched.

## Candidate f188d5ebe517022ea7c33afb1c1aaf75a78d8645 — 2026-08-11, range bf46008e..f188d5eb, PO decides P-AC-06 (strike, blocked on digest coupling) + Journal-Gap backlog filing

- ADR-0045: checked, no change needed.

Covers two commits: `b545be4d`
(`specs/sprint-phoenix-epic/design/p-ac-06-clause-disposition-proposal.md`,
records the PO's strike decision, the drafted-then-reverted amendment text,
and the newly-found digest-coupling blocker — an existing design artifact
under `specs/**`, not a manifest or `lifecycle.json` change) and `f188d5eb`
(`backlog/items/2026-08-11-agent-decision-journal-has-no-production-
producer.md`, a new file; `backlog/**` carries no `Governs:` line in any
ADR). `acceptance.md` itself is untouched in this range — the amendment
was reverted before committing, exactly per the digest-coupling finding —
so no artifact-topology or authority-binding change occurred despite the
decision being made.

## Candidate bf46008eb4bc34e5e585e6d12e8006f644eeabec — 2026-08-11, range c5b13eae..bf46008e, PO resolves the guard-testpath.mjs kernel-membership question (rejected, exposure stays)

- ADR-0058: amended in bf46008e.

Covers exactly one commit (`bf46008e`), touching `docs/adr/0058-guard-
maintenance-window.md` (resolves the Follow-up bullet the previous entry
recorded, with the PO's own rationale) and `backlog/items/2026-08-10-guard-
testpath-not-kernel-protected-like-its-sibling.md` (status: open →
rejected, cross-referencing the ADR as canonical). The backlog item path
carries no `Governs:` line — only the ADR body itself is reconciliation-
relevant here.

## Candidate c5b13eae85086aa1a32ab8446c45bc1b116dfc97 — 2026-08-11, range 1a359938..c5b13eae, ADR-0058 Follow-up bullet (guard-testpath.mjs kernel membership, undecided) + state.md note

- ADR-0012: checked, no change needed.
- ADR-0058: amended in 5d81e857.

Covers two commits: `5d81e857` (adds a third Follow-up bullet to
`docs/adr/0058-guard-maintenance-window.md`, recording — not deciding —
`guard-testpath.mjs`'s open `NEVER_LIFTABLE_KERNEL_PATHS` membership
question, after `PIPE-WP-GTP-KERNEL` correctly stopped short of shipping
that addition without it) and `c5b13eae` (`docs/state.md`, additive: records
the dispatch outcome and the advisor consult that redirected away from
self-authoring an endorsement). First `amended` entry this session — every
prior touched ADR was `checked, no change needed`; this is the first commit
that actually edits a `Governs:`-listed ADR body. `docs/adr/0058-guard-
maintenance-window.md`'s own `Governs:` line lists `guard-testpath.mjs`
among its files, confirming the amendment sits inside this ADR's declared
authority.

## Candidate 1a359938fb7227266fedc99711736422ad68c130 — 2026-08-11, range 8ba9d410..1a359938, R-AC-08 scoping run, unifying root cause named across four criteria

- ADR-0045: checked, no change needed.

Covers exactly one commit (`1a359938`), editing
`specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md` in place.
Same reasoning as the two immediately preceding entries: an existing design
artifact under `specs/**`, not a tracked package artifact or `lifecycle.json`
change. `docs/state.md` not touched — ADR-0012 not implicated.

## Candidate 8ba9d41001845bf2286ca2d85e72bedf3b4a5111 — 2026-08-11, range 1a0a1186..8ba9d410, L-AC-01 and A-AC-01 scoping steps run, shared root cause connected

- ADR-0045: checked, no change needed.

Covers exactly one commit (`8ba9d410`), editing
`specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md` in place.
Same reasoning as the immediately preceding entry: an existing design
artifact under `specs/**`, not a tracked package artifact or `lifecycle.json`
change. `docs/state.md` not touched — ADR-0012 not implicated.

## Candidate 1a0a118698dcd6d58598d92b52f8fe2be96cfd30 — 2026-08-11, range 79f36939..1a0a1186, V-AC-02 scoping correction (not the smallest Class B candidate)

- ADR-0045: checked, no change needed.

Covers exactly one commit (`1a0a1186`), editing
`specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md` in place
(an existing design artifact under ADR-0045's `specs/**` scope; still not a
tracked package artifact or `lifecycle.json` change). `docs/state.md` not
touched in this range — ADR-0012 not implicated.

## Candidate 79f369394a17fcf40710b7681af47ab6fd0a04e3 — 2026-08-11, range 2c1f4cee..79f36939, clean security-scan against the committed candidate recorded

- ADR-0012: checked, no change needed.

Covers exactly one commit (`79f36939`), touching only `docs/state.md`
(additive: records the security-scan verdict against `2c1f4cee`, run with
the one known GMW-blocked file stashed and restored). No other governed
path touched.

## Candidate 6dfd32f574b5273dca475eddc7a3bd73f9a15508 — 2026-08-11, range 1022df71..6dfd32f5, Class B multi-dispatch plan + H-AC-12/Class A checked empty

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Covers exactly one commit (`6dfd32f5`), touching `docs/state.md`
(additive, ADR-0012's subject) and adding
`specs/sprint-phoenix-epic/design/class-b-multi-dispatch-plan.md`
(ADR-0045's subject: `specs/**`). The new file is a design/planning
artifact, not a tracked package artifact or a `lifecycle.json` change — no
amendment needed. No other governed path touched.

## Candidate 1324c266302674c6064c0082a0f1c98b9167a840 — 2026-08-11, range 5dabc566..1324c266, P-AC-06 clause disposition proposal (design doc, not an acceptance.md edit)

- ADR-0045: checked, no change needed.

Covers exactly one commit (`1324c266`), adding
`specs/sprint-phoenix-epic/design/p-ac-06-clause-disposition-proposal.md`.
ADR-0045 governs `specs/**`; the new file is a design artifact, not a
tracked artifact-manifest entry for any package, and doesn't declare or
imply a `lifecycle.json` change — no amendment needed. `acceptance.md`
itself is untouched: the proposal is explicitly not authorized to amend
the frozen acceptance text pending a PO decision, so ADR-0045's authority
concern is satisfied by leaving that file alone, not by editing it.
`docs/state.md` not touched in this range — ADR-0012 not implicated.

## Candidate 5dabc5669da64baa30cdca7d69db15f98b78c763 — 2026-08-11, range 5f533257..5dabc566, P-AC-06 both clauses resolved as spec problems

- ADR-0012: checked, no change needed.

Covers exactly one commit (`5dabc566`), touching only `docs/state.md`.
Purely additive: records that both remaining P-AC-06 clauses ("legacy",
"orphaned") were investigated to a definitive negative answer against
live repository data after PO approval of the Elephant's framing — one
is a structurally dead branch, one has no discoverable predicate — and
that this closes the session's seven-criteria Class B survey. No other
governed path touched.

## Candidate 5f53325731d21a8278d37bc5b1cc8fd268973e05 — 2026-08-11, range 75b75f9b..5f533257, P-AC-06 orphan-check attempt and revert

- ADR-0012: checked, no change needed.

Covers `6d92c613` (`docs/state.md`, additive: the tractability-pattern
finding and the PAC06-ORPHAN dispatch record), `fad0aa95` (the orphan-check
fix, touching `plugins/pipeline-core/lib/feature-package-topology.mjs` and
`plugins/pipeline-core/lib/audit-bundle.test.mjs` — neither an
ADR-`Governs:`-listed path), `cc43a182` (its clean revert, same two files,
same non-governed paths), and `5f533257` itself (`docs/state.md`,
additive: records the regression found and reverted). No other governed
path touched; ADR-0045 not implicated (no `specs/<id>/` topology change —
the touched files live under `plugins/pipeline-core/lib/`).

## Candidate 75b75f9b9e1ae0a990f671a68536c9d433a00d2b — 2026-08-11, range 18acfb52..75b75f9b, L-AC-01 scoping findings + session close

- ADR-0012: checked, no change needed.

Covers exactly one commit (`75b75f9b`), touching only `docs/state.md`.
Purely additive: records the `PHX-WP-LAC01-SCOPE` dispatch's findings
(gap confirmed real, correlation-identity blocker found, TP-5 pattern
confirmed unprotected for the sibling revocation test file), corrects the
dependency-vs-tractability conflation in the ranking that picked L-AC-01,
and states why the session closes here (three consecutive dispatch
truncations on the same investigation shape). No other governed path
touched.

## Candidate 18acfb525c6db0c2b611e79f96c7896120a95e86 — 2026-08-11, range 97c069c9..18acfb52, correct the terminal-state overclaim

- ADR-0012: checked, no change needed.

Covers exactly one commit (`18acfb52`), touching only `docs/state.md`.
Purely additive: a dated correction to the immediately preceding
terminal-state section, distinguishing the four gate-blocked criteria
measured today from the ~22 Class A/B/D `partial` criteria that remain
genuinely open and agent-executable. No other governed path touched.

## Candidate 97c069c91febe14e0dc505bc2a4eb24315769d8c — 2026-08-11, range 680d971f..97c069c9, session terminal-state summary

- ADR-0012: checked, no change needed.

Covers exactly one commit (`97c069c9`), touching only `docs/state.md`.
Purely additive: one consolidated close-out section stating that every
remaining path to Phoenix completion runs through the single
`--scope TP-3,TP-5` GMW window, so a later session does not have to
reconstruct "what's left" from the checkpoint's scattered sections. No
other governed path touched.

## Candidate 680d971fbe34c904a85d321cabdfa4341c1fd295 — 2026-08-11, range 9ae13b10..680d971f, second stale-negative audit (A-AC-03/09, P-AC-09, EPIC-AC-02)

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Covers `4c41a483` (the stale-4 audit's data edit plus its new dated
`acceptance-evidence-map-20260811b.md` deliverable and the `CLOSURE`-map
`build`→`po` fix for PX0-AC-05/13, dispatch `PHX-WP-DELTA-STALE4`),
`0b180d16` (a trailing dispatch-record.json commit-hash fill-in, same
task), and `680d971f` itself (`docs/state.md`, purely additive: records
the 127/26/3/0/1 result). Same reading as the immediately preceding entry:
no code in this range touches the canonical artifact topology ADR-0045
governs beyond ordinary content evolution inside files it already lists —
the new dated `.md` follows the existing naming convention, and the
`CLOSURE` map edit is a data-value change inside a file ADR-0045 already
covers, not a topology change. `docs/state.md` stays ADR-0012, purely
additive as always.

## Candidate 9ae13b104d79ed76819b292b1a471b2582e5e2b0 — 2026-08-11, range e1265678..9ae13b10, targeted delta re-measurement of PX0-AC-03/05/06/13

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Covers `8f297633` (the delta-measurement data edit and its new dated
`acceptance-evidence-map-20260811.md` deliverable, dispatch
`PHX-WP-DELTA-PX0-0305-06-13`), `587f562a` (a trailing dispatch-record.json
enrichment, same task), and `9ae13b10` itself (`docs/state.md`, purely
additive: records the 127/24/4/1/1 result and the PX0-AC-05/06 CONFIRMED-
ABSENT retraction). No code in this range touches the canonical artifact
topology ADR-0045 governs beyond ordinary content evolution inside files it
already lists — the new dated `.md` follows the exact pre-existing
`acceptance-evidence-map-<date>.md` naming convention (see e.g. the
`-20260809` sibling), and the generated evidence-map/closure-plan/design-doc
set stays ADR-0045 as in every prior occurrence in this chain. `docs/state.md`
stays ADR-0012, purely additive as always.

## Candidate e1265678fe0b85008c4b76016c5f0c94e4a3d3b5 — 2026-08-11, range 60b324ad..e1265678, docs-only follow-up (Critic re-review parking + persistence-gap note)

- ADR-0012: checked, no change needed.

Covers exactly one commit (`e1265678`), touching only `docs/state.md`.
Purely additive: records the decision to park the Critic re-review pending
a complete GMW-landed candidate, the second-round report persistence gap
and its going-forward rule, the `AR06g` naming collision between the two
blocked test dispatches, and the `scratch/casoutcome-fix-backup.diff`
backup location. No other governed path touched.

## Candidate 60b324ad8173ae3bc612ac637bb2bee86ab49cf5 — 2026-08-11, range 5b0278d7..60b324ad, second Critic round + fix-dispatch checkpoint

- ADR-0012: checked, no change needed.

Covers `5d1705d6` (doc-reconciliation entry for the prior candidate, touches
only this file), `61203fdb` (threat-model fix + new backlog item, neither
path ADR-`Governs:`-listed), `d002fd8e` (backlog ledger reconciliation,
not ADR-governed), `7dffa72e` (new test coverage, not ADR-governed), and
`60b324ad` itself (`docs/state.md`, purely additive: Critic re-review
findings F1-F6, the four fix-dispatch outcomes, and the collapsed
`--scope TP-3,TP-5` signature punch list). No other governed path touched;
ADR-0045/0040/0056/0058 not implicated (no `specs/<id>/`, `pipeline.user.yaml`,
`setup.mjs`, or guard-hook path changed in this range).

## Candidate 5b0278d76bb8ac914b80b003ca4073d4cfc03015 — 2026-08-11, range 89570dfc..5b0278d7, docs-only handover checkpoint

- ADR-0012: checked, no change needed.

Covers exactly one commit (`5b0278d7`, "docs(phoenix): checkpoint -- bootstrap
repaired, Verify 6 red to 1 parked"), touching only `docs/state.md`. Purely
additive: a new dated checkpoint section recording the continuity-damaged
bootstrap repair (stash+pull to `eb735ae1` plus a session-cleanup bind-orphan
recovery) and three Goldfish dispatches (`89570dfc`, `fd8fae52`, `ecbb9df2`)
that closed five of six pre-existing Verify failures. No other governed path
touched; ADR-0045 not implicated (no `specs/<id>/` topology change).

## Candidate 43d42a23eb5f99798eb1e40a2a464d957103969d — 2026-08-10, range 3387065..43d42a23, the substantive tip of an interim checkpoint push (not a release); supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `57a970db` entry below with the same one-entry-per-unpushed-range shape, now also
covering `685f594c` through `43d42a23`: GMW install for TP-5, the WP-PX0-AC0305-06 and WP-PX0-AC13
production builds and their Critic round-1 dispatches, both round-1 FAILs with real defects
(a genuine race condition, a backward-incompatible journal schema bump, a missing typed outcome
field, and a wrong implementation target for PX0-AC-13), the PX0-AC-13 revert, a separate,
more serious trust incident (a subagent's false PO-authorization claim on an out-of-scope
bootstrap-doc commit, itself reverted), the two corrected production-only remediation dispatches
(WP-PX0-AC0305-06-FIX2, WP-PX0-AC13-REDO) landing as `43d42a23` and `ee8a38f0`, and the
checkpoints recording all of it. Critic review for both corrected packages is explicitly deferred
past this push (PO time-constraint decision) — neither is booked `implemented` in the evidence
map; this push carries them as independently Elephant-verified (diff read, full test suites
re-run: 468/468 and 49/49) but not yet Critic-reviewed. No code in this range touches the
canonical artifact topology ADR-0045 governs beyond ordinary content evolution inside files it
already lists. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/design-doc set stays ADR-0045. `harness/scripts/pipeline-state.test.mjs`
(TP-5 protected, opened under a signed GMW for this range, additive-only per the read-only sanity
run — no test file was edited by either FIX2 or REDO dispatch) and the other touched
`plugins/pipeline-core/{lib,scripts}/*.mjs`/`*.test.mjs`/`governance/*` files touch no path any
`Governs:` line in the corpus names. `docs/adr/0058-guard-maintenance-window.md` and
`docs/adr/0072-fork-disposition-approval-proof.md` were themselves amended in this range —
unreconciled by this layer for the same already-filed reason as every prior range:
`pipeline.doc-reconciliation-blind-to-adr-corpus-changes`. The two new `backlog/items/*.md` files
confirm `backlog/`'s own dedicated class again, same as every prior occurrence in this chain.

## Candidate 57a970dbe6e080941e0a4b94cb70f202c538e988 — 2026-08-10, range 3387065..57a970db, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `ea2ef4d7` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2c01bf47` through `57a970db`: WP-V-AC06's dispatch, closure, evidence-map booking, and
the checkpoint recording category 5's full exhaustion. No code in this range touches the canonical
artifact topology ADR-0045 governs beyond ordinary content evolution inside files it already lists.
Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/
closure-plan/design-doc set stays ADR-0045.

## Candidate ea2ef4d730922992a3bb17548f4269f9c5850566 — 2026-08-10, range 3387065..ea2ef4d7, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `b1190dac` entry below with the same one-entry-per-unpushed-range shape, now also
covering `ca0a9167` through `ea2ef4d7`: WP-E-AC20's dispatch, closure, evidence-map booking, and
checkpoint. No code in this range touches the canonical artifact topology ADR-0045 governs beyond
ordinary content evolution inside files it already lists. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate b1190dacd1eda26fa93a4af846f7ab2d6522d5dc — 2026-08-10, range 3387065..b1190dac, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `16cfe3a0` entry below with the same one-entry-per-unpushed-range shape, now also
covering `c4baa447` through `b1190dac`: the category-3 reclassification checkpoint. Pure
documentation, no code. No code in this range touches the canonical artifact topology ADR-0045
governs beyond ordinary content evolution inside files it already lists. Same reading as the whole
chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate 16cfe3a0f8eaeadac84660c9e7e68cff250fb34a — 2026-08-10, range 3387065..16cfe3a0, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e4b96528` entry below with the same one-entry-per-unpushed-range shape, now also
covering `1c7280a5` through `16cfe3a0`: the five-category synthesis of the remaining evidence-map
pool. Pure documentation, no code. No code in this range touches the canonical artifact topology
ADR-0045 governs beyond ordinary content evolution inside files it already lists. Same reading as
the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc
set stays ADR-0045.

## Candidate e4b96528077c3eaff9ef6abcb9f2921629935035 — 2026-08-10, range 3387065..e4b96528, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `991af0e2` entry below with the same one-entry-per-unpushed-range shape, now also
covering `ef346fbe` through `e4b96528`: WP-R-AC11's dispatch, closure (both clauses), evidence-map
booking, and checkpoint. No code in this range touches the canonical artifact topology ADR-0045
governs beyond ordinary content evolution inside files it already lists. Same reading as the whole
chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate 991af0e23ae385a66530c7dc4bc4948636d0f6ff — 2026-08-10, range 3387065..991af0e2, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `7a531558` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d1493dd7` through `991af0e2`: EPIC-AC-01's Class-P classification check, the WP-PX0-AC06
dispatch, its genuine block on a real guard, and the resulting stash-and-park (no code change
committed for PX0-AC-06 — the stashed diff carries no ADR implication of its own since it never
landed). No code in this range touches the canonical artifact topology ADR-0045 governs beyond
ordinary content evolution inside files it already lists. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate 7a53155843493ab67dc4e0235038179e7c0a595f — 2026-08-10, range 3387065..7a531558, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `ae99527b` entry below with the same one-entry-per-unpushed-range shape, now also
covering `15160121` through `7a531558`: WP-R-AC09's dispatch, closure, evidence-map narrowing, and
checkpoint. No code in this range touches the canonical artifact topology ADR-0045 governs beyond
ordinary content evolution inside files it already lists. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate ae99527b55836af285cebb6d1659d5b4708593f6 — 2026-08-10, range 3387065..ae99527b, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `2ae41f81` entry below with the same one-entry-per-unpushed-range shape, now also
covering `c8526036` through `ae99527b`: the completion of the repo-wide capture-policy/lifecycle-
correlation regression sweep (`WP-CP-FIX`, `WP-GE-FIX`, both independently verified) and their
checkpoints, including a self-caught-and-fixed anchor-header integrity error in one of them. No
code in this range touches the canonical artifact topology ADR-0045 governs beyond ordinary content
evolution inside files it already lists. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate 2ae41f81932abb690d3039c42c9461db147ab253 — 2026-08-10, range 3387065..2ae41f81, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `1b2200c8` entry below with the same one-entry-per-unpushed-range shape, now also
covering `13a16af3` through `2ae41f81`: WP-H-AC12's narrowed closure, the discovery and fix of a
regression in an earlier-booked closure (WP-GA-FIX), and a proactive repo-wide audit that found six
more instances of the same regression (WP-CP-FIX dispatched, not yet landed). No code in this range
touches the canonical artifact topology ADR-0045 governs beyond ordinary content evolution inside
files it already lists. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate 1b2200c85e9bb127211344dc4eee26b9382fa634 — 2026-08-10, range 3387065..1b2200c8, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `01469a1c` entry below with the same one-entry-per-unpushed-range shape, now also
covering `18fb588b` through `1b2200c8`: WP-R-AC04's dispatch, its closure (verified against the
broader `governance-event-store.mjs` consumer suite too), its evidence-map booking, and the
session-standing checkpoint. No code in this range touches the canonical artifact topology
ADR-0045 governs beyond ordinary content evolution inside files it already lists. Same reading as
the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/
design-doc set stays ADR-0045.

## Candidate 01469a1c9018e1d5eea0d3553c5f9d3eeecfc0d7 — 2026-08-10, range 3387065..01469a1c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `2d295c18` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d862fbd4` through `01469a1c`: WP-P-AC06's dispatch, the regression it introduced in
`pipeline-state.test.mjs` (caught by running that suite independently, not just the two files the
dispatch itself verified), its revert, and the checkpoint documenting both. No code in this range
touches the canonical artifact topology ADR-0045 governs beyond ordinary content evolution inside
files it already lists. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate 2d295c18db2861737e9a5fb5c811834af6d94f07 — 2026-08-10, range 3387065..2d295c18, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `fc89a5f6` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d6615c3b` through `2d295c18`: three dispatches (C-AC-02, A-AC-07, P-AC-01/P-AC-03), their
independent verification, evidence-map bookings, and checkpoint. `governance/events/capture-
policy.json` and `governance/schemas/*` were touched by A-AC-07 but confirmed not ADR-governed (not
implicated by this check). No code in this range touches the canonical artifact topology ADR-0045
governs beyond ordinary content evolution inside files it already lists. Same reading as the whole
chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate fc89a5f6cc8c4ca4aab81df1e9142119c8c94c96 — 2026-08-09, range 3387065..fc89a5f6, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `17b07da7` entry below with the same one-entry-per-unpushed-range shape, now also
covering `cc85b435` through `fc89a5f6`: V-AC-02's narrowing (WP-V-AC02) and the WP-A-AC07 dispatch
checkpoint. No code in this range touches the canonical artifact topology ADR-0045 governs beyond
ordinary content evolution inside files it already lists. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate 17b07da726401e2b713ca891ed62c41ed8867553 — 2026-08-09, range 3387065..17b07da7, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `6590aeba` entry below with the same one-entry-per-unpushed-range shape, now also
covering `1647e1cc` through `17b07da7`: the O-1/O-2 design doc's round-5 (the PO's authorized
extension) Critic FAIL, independently verified and parked alongside K-AC-05. No code touched in
this range — the design doc's own optimistic O-2 claims were not booked against H-AC-02/H-AC-11
in the evidence map (checked, neither entry references this design doc's work). Same reading as
the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/
design-doc set stays ADR-0045.

## Candidate 6590aebad70e8938d1918259f56e8fb8c23617ba — 2026-08-09, range 3387065..6590aeba, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `506a0543` entry below with the same one-entry-per-unpushed-range shape, now also
covering `fe1faf1f` through `6590aeba`: E-AC-04's closure (`governance-export-adapter.mjs`) and
A-AC-08's closure (a new standalone checker, `harness/scripts/check-dispatch-provenance.mjs` —
confirmed by this same check it carries no `Governs:` line and isn't itself an ADR-governed path),
plus their evidence-map bookings and checkpoint. No code in this range touches the canonical
artifact topology ADR-0045 governs beyond ordinary content evolution inside files it already
lists. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate 506a05434b964754873931c2b42137750b58dc87 — 2026-08-09, range 3387065..506a0543, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `cbf656f3` entry below with the same one-entry-per-unpushed-range shape, now also
covering `3902d3c5` through `506a0543`: the O-1/O-2 design doc's fifth rework (all six round-4
Critic findings fixed and independently verified), E-AC-10's closure (`evaluateGovernanceExport
BoundaryGate`), and the checkpoints recording both plus WP-A-AC08's stop-then-redispatch. No code
in this range touches the canonical artifact topology ADR-0045 governs beyond ordinary content
evolution inside files it already lists. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate cbf656f324827c5ad8ac53b17bb7606f3e338a3b — 2026-08-09, range 3387065..cbf656f3, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `d0ce4887` entry below with the same one-entry-per-unpushed-range shape, now also
covering `aa1b950e` through `cbf656f3`: K-AC-05's third rework and its round-4 (final, Opus-routed)
Critic FAIL (parked, not reworked further — a blocker plus six majors revealing the disposition
mechanism needs redesign, not another surgical fix), two new closures (C-AC-09's
`resolveChangeControlProfile`, R-AC-02's `recordCommandRecoveryDisposition`), their evidence-map
DELTA bookings, a POINTERS sync for K-AC-05, and the checkpoint recording the PO's AFK/standing-
autonomy instruction plus the O-1/O-2 5th-round authorization. No code in this range touches the
canonical artifact topology ADR-0045 governs beyond ordinary content evolution inside files it
already lists. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/design-doc set stays ADR-0045.

## Candidate d0ce48871592c17b74583b1750d11c9a1c0c4b25 — 2026-08-09, range 3387065..d0ce4887, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `c23dc80` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d1f272e` through `d0ce4887`: the prior doc-rec entry, WP-P-AC11's closure
(`6de4f444`) and its POINTERS sync (`edecba17`), the O-1/O-2-design round-2 Critic FAIL and its
rework (`d7bf77b5`), the K-AC-05 round-2 Critic FAIL and its rework
(`aae69026`), and four `docs/state.md` checkpoints recording those verifications plus the
O-1/O-2-design round-3 Critic FAIL and its rework (`d0ce4887`). No code in this range touches
the canonical artifact topology ADR-0045 governs beyond ordinary content evolution inside the
files it already lists (the design doc's own §15 content, the evidence-map DELTA/POINTERS
blocks); no change narrows or widens what either ADR requires. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/design-doc set stays
ADR-0045.

## Candidate c23dc80a217ce98c81b9434b790bd8c055454e8c — 2026-08-09, range 3387065..c23dc80, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `1d288f0` entry below with the same one-entry-per-unpushed-range shape, now also
covering `dee3958`, `c23dc80`: the prior doc-rec entry and a checkpoint recording WP-P-AC11's
dispatch (a deliberately narrow-scoped two-of-seven-subconcept closure attempt) while both
round-2 Critic reviews run. No code changed in this range. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan trio stays ADR-0045.

## Candidate 1d288f0aa1456632651c6d938f600cd6de0eb8f8 — 2026-08-09, range 3387065..1d288f0, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `4eba3cb` entry below with the same one-entry-per-unpushed-range shape, now also
covering `24959bd`, `b2a5534`, `3440e5f`, `1d288f0`: the prior doc-rec entry, the K-AC-05 and
O-1/O-2-design reworks fixing their respective Critic round-1 findings, and a checkpoint recording
independent verification of both plus the two round-2 Critic dispatches. Same reading as the whole
chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan trio stays
ADR-0045; neither reworked file (`governance-event-store.mjs`, the design doc) touches an
ADR-governed path.

## Candidate 4eba3cb32e3471fdc677c900a29eea2a42ed066b — 2026-08-09, range 3387065..4eba3cb, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `c806e49` entry below with the same one-entry-per-unpushed-range shape, now also
covering `641c869`, `6388de4`, `4eba3cb`: the prior doc-rec entry, WP-E-AC09 (closed, advisory-
destination classification), and a checkpoint recording both E-AC-09's closure and the
O-1/O-2-design Critic's own FAIL verdict. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan trio stays ADR-0045; the governance-export
commit touches no ADR-governed path.

## Candidate c806e49d72e3edb1e49e580d5e56acb234178f7a — 2026-08-09, range 3387065..c806e49, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `d48f3ce` entry below with the same one-entry-per-unpushed-range shape, now also
covering `241a478`, `dedd2ef`, `92d1e44`, `c806e49`: the prior doc-rec entry, WP-C-AC07 (closed,
retrospective-evidence gate for emergency change completion), a checkpoint recording the K-AC-05
Critic round-1 FAIL and the rework dispatch it produced, and a checkpoint recording C-AC-07's
independent verification/closure. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan trio stays ADR-0045; `change-control.mjs`
touches no ADR-governed path.

## Candidate d48f3ce8837c760b94579ce45be4ad3c2bad4932 — 2026-08-09, range 3387065..d48f3ce, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `4a25e1c` entry below with the same one-entry-per-unpushed-range shape, now also
covering `843c392`, `d48f3ce`: the doc-reconciliation entry for the four-dispatch checkpoint,
and a checkpoint recording two more dispatches (WP-E-AC09, WP-C-AC07) started while the two
Critic reviews run. No code changed in this range beyond the two commits already covered by the
prior entry. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan trio stays ADR-0045.

## Candidate 4a25e1ccfcd5c6be25ff974cf7f49d979287fe2e — 2026-08-09, range 3387065..4a25e1c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `06a4db4` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d2ad02a`, `01bafdf`, `cb0c26d`, `8d91106`, `4a25e1c`: WP-K-AC05 (fork-disposition
recording, pending Critic), WP-O1O2-DESIGN (the O-1/O-2 design amendment, pending Critic),
WP-C-AC12 (closed, advisory ITSM policy), WP-R-AC10 (closed, non-material journaling
exception), and a checkpoint documenting a shared-working-tree evidence-map race between the
last two. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan trio stays ADR-0045; the four code/design commits in this range touch
no ADR-governed path.

## Candidate 06a4db4a904c07904fbdd629e41624cceefbf373 — 2026-08-09, range 3387065..06a4db4, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `63e819a` entry below with the same one-entry-per-unpushed-range shape, now also
covering `06a4db4`: a checkpoint recording that the 2-slot parallel-dispatch cap was a
self-imposed limit, not a written rule (`guardrails/git.md` already permits ungated parallel
Goldfish dispatch within one open block), and the two additional dispatches (WP-R-AC10,
WP-C-AC12) started as a result, plus E-AC-04 considered and declined as a fifth. No code
changed in this commit. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan trio stays ADR-0045.

## Candidate 63e819a2aaeb2082751557d93e5585d789b015ab — 2026-08-09, range 3387065..63e819a, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `ce03fbb` entry below with the same one-entry-per-unpushed-range shape, now also
covering `46f56eb`, `63e819a`: a doc-reconciliation entry and a checkpoint recording the PO's
"no time pressure" correction plus the O-1/O-2/O-4 GMW/HGO ledger-intake decisions (no code
changed). Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan trio stays ADR-0045.

## Candidate ce03fbbeb872716b6131535ef5f05f4abf254935 — 2026-08-09, range 3387065..ce03fbb, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e6ded9e` entry below with the same one-entry-per-unpushed-range shape, now also
covering `6400f3b`, `ce03fbb`: a doc-reconciliation entry and a research-only checkpoint (no code
changed, no evidence-map delta -- six candidates checked and held for a future design pass). Same
reading as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan
trio stays ADR-0045.

## Candidate e6ded9e24b6605bc7028280be376b8ce0b78747e — 2026-08-09, range 3387065..e6ded9e, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `6b96d75` entry below with the same one-entry-per-unpushed-range shape, now also
covering `002144a`, `bd386e3`, `f1f5e24`, `15c9079`, `0523d7e`, `5bb4269`, `6c33824`, `afe3ff0`,
`554a173`, `1b266e2`, `2b8ad9a`, `f3db193`, `e6ded9e`: C-AC-02's standard-template field, K-AC-10's
multi-stream query, E-AC-11's projection digest, E-AC-08's three more typed outbox failures,
L-AC-02's two missing #10 exchange identities (dispatched to goldfish-deep for its two-validator
blast radius), A-AC-14's tampering scenario, four evidence-map deltas, and two checkpoints. Same
reading as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan
trio stays ADR-0045. None of the eleven touched `plugins/pipeline-core/lib/*.mjs` production/test
files implicate either ADR.

## Candidate 6b96d75c2632557381eedab77a977b1e780a708b — 2026-08-09, range 3387065..6b96d75, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `1d5298c` entry below with the same one-entry-per-unpushed-range shape, now also
covering `1def755`, `9816a92`, `8caaa61`, `3d2ef2b`, `6b96d75`: L-AC-04's renderer/CSS fix (a
missing visual-class distinction, not a missing test), E-AC-02's export-adapter loss-declaration
fix (a real correctness bug), both evidence-map deltas, and this leg's checkpoint, which also
records four researched-but-deliberately-not-dispatched candidates (K-AC-05, P-AC-06, V-AC-02,
C-AC-02) and why. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/class-s-scoping trio stays ADR-0045.
`plugins/pipeline-core/lib/governance-replay-view-renderer.mjs`,
`plugins/pipeline-core/assets/evidence-viewer.css`,
`plugins/pipeline-core/lib/governance-replay-view.test.mjs`,
`plugins/pipeline-core/lib/governance-export-adapter.mjs`, and
`plugins/pipeline-core/lib/governance-export-adapter.test.mjs` (the two dispatch commits' only
changed paths) implicate neither ADR.

## Candidate 1d5298c72d4d84244bbb5cfde9a0bd282dd6f2fb — 2026-08-09, range 3387065..1d5298c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `78b7fb5` entry below with the same one-entry-per-unpushed-range shape, now also
covering `5897862`, `2005bb6`, `1d5298c`: R-AC-12's fixture build (the motivating Phoenix
bootstrap trajectory, encoded as a test rather than a production caller — the criterion asked for
nothing else), its evidence-map delta, and this leg's checkpoint. Same reading as the whole chain:
`docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan/class-s-scoping trio stays
ADR-0045. `plugins/pipeline-core/lib/external-command-offer.test.mjs` (the R-AC-12 commit's only
changed path) implicates neither ADR — a test file is not `docs/state.md` and not one of the
generated evidence/design artifacts.

## Candidate 78b7fb58a19531c7bdd8f05d96b6bba4b350f423 — 2026-08-09, range 3387065..78b7fb5, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `cae20a3` entry below with the same one-entry-per-unpushed-range shape, now also
covering `0d01845`, `a657e14`, `be825df`, `d0401a2`, `78b7fb5`: X-AC-14's filed backlog fix
(external-reference-adapter.mjs typed unreachable-response), H-AC-08's legacy-import-observation
carrier, both evidence-map deltas, and this leg's checkpoint recording the PO's grounding-method
correction. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated
evidence-map/closure-plan/class-s-scoping trio stays ADR-0045. The one closed backlog item
(`backlog/items/2026-08-09-external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system.md`)
confirms `backlog/`'s own dedicated class again, same as every prior occurrence in this chain.

## Candidate cae20a35134b05a69f56a913253fe7ae6e7142b0 — 2026-08-09, range 3387065..cae20a3, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `f7062ac` entry below with the same one-entry-per-unpushed-range shape, now also
covering `8244ab3`, `0022d13`, `73501cf`, `cae20a3`: A-AC-05's identity-provenance/assurance
carrier (built, stays partial, no production caller), round-3 Critic PASS remediation on the
A-AC-04 CLI (three minor findings closed), the resulting evidence-map delta closing A-AC-04, and
this leg's checkpoint. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan/class-s-scoping trio stays ADR-0045. Nothing in this range
touches `backlog/` or any other governed path.

## Candidate f7062acc3d95069c350f7318e01e11bea1b5d168 — 2026-08-09, range 3387065..f7062ac, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e9d13c8` entry below with the same one-entry-per-unpushed-range shape, now also
covering `e7688d4`, `836242e`, `6c6514b`, `a67faf9`, `aa36239`, `f3eeb3e`, `f7062ac`: E-AC-14's
failure-injection fixture and its evidence-map delta, round-2 remediation of the A-AC-04 CLI (5
Critic findings closed), PX0-AC-08's bootstrap wiring and its evidence-map delta, round-2's own
residual major finding (N1) plus F3/N2 closed by a follow-up fix, and this leg's H-AC-09
Class-S-to-Class-P reclassification checkpoint. Same reading as the whole chain: `docs/state.md`
stays ADR-0012, the generated evidence-map/closure-plan/class-s-scoping trio stays ADR-0045.
Nothing in this range touches `backlog/` or any other governed path.

## Candidate e9d13c8ffaf34ce178af1d6086af575c2949255e — 2026-08-09, range 3387065..e9d13c8, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `3371a0d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `25f48cd`, `78006b4`, `8c7efa3`, `e9d13c8`: the A-AC-04 measurement correction (a second
real carrier found), the human-authority-grant.mjs build, the backlog item for a second
evidence-citation defect, and this leg's checkpoint recording the Critic FAIL that build received.
Same reading as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/
closure-plan/class-s-scoping trio stays ADR-0045. The new backlog item confirms `backlog/`'s own
dedicated class again, same as every prior occurrence in this chain.

## Candidate 3371a0d9327d5430cd876ce2be0d0baad51b5754 — 2026-08-09, range 3387065..3371a0d, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `7eee663` entry below with the same one-entry-per-unpushed-range shape, now also
covering `b78fae1`, `a5b1a69`, `00b275e`, `71abec7`, `3371a0d`: X-AC-11's design-followed build,
its evidence-map delta, the second signed-window PX0 registration, its evidence-map delta, and
this leg's checkpoint. Same reading as the whole chain: `docs/state.md` stays ADR-0012, the
generated evidence-map/closure-plan pair stays ADR-0045. Nothing else in this range touches a
governed path.

## Candidate 7eee663a05daa11cfa5888552d05085c7992b39f — 2026-08-09, range 3387065..7eee663, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `f7d9c0d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2ca38fc`, `305ca2f`, `7eee663`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012 (one new checkpoint entry recording an independent Critic FAIL and its remediation), the
generated evidence-map/closure-plan pair stays ADR-0045. Two new `backlog/items/*.md` files in
this range confirm the same reading the `c004d16` entry already established: `backlog/` is its
own dedicated class under ADR-0045, not implicated by its `specs/**` glob — the check's own
output above names only the four `specs/sprint-phoenix-epic/` files, not either backlog item.

## Candidate 13bebf6a5d15fb0c425d9599c34e82bbc510c12c — 2026-08-09, range 3387065..13bebf6, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `63de074` entry below with the same one-entry-per-unpushed-range shape, now also
covering `8a98057`, `aa7432d`, `13bebf6`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012, the generated evidence-map/closure-plan pair stays ADR-0045 -- extended this range to a
new file under the same covered root, `specs/sprint-phoenix-epic/design/class-s-scoping.md`,
which the check's own output confirms falls under the same `specs/**` glob as every other
evidence/design artifact in this chain. Nothing else in this range touches a governed path.

## Candidate 09f853a9e585a5db133d441be5c19390acbd3623 — 2026-08-09, range 3387065..09f853a, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `68338ef` entry below with the same one-entry-per-unpushed-range shape, now also
covering `7376c2c`, `7a2caa6`, `09f853a`. Same reading as the whole chain: `docs/state.md` stays
ADR-0012 (one new closing-checkpoint entry), the generated evidence-map/closure-plan pair stays
ADR-0045. The one documentation commit (`docs/agent-decision-journal.md`,
`docs/governance-events.md`, `docs/governance-replay.md`) touches no path any `Governs:` line in
the corpus names, confirmed by this run.

## Candidate 8db7e3cf7d6095743ee72a405ad88d928752958a — 2026-08-09, range 3387065..8db7e3c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `62f2f7d` entry below with the same one-entry-per-unpushed-range shape, now also
covering `338f9cb`, `9f5e680`, `ccd0b13`, `4eea837`, `8db7e3c`. Same reading as the whole chain:
`docs/state.md` stays ADR-0012 (three new entries: a dispatch note, a header-restoration fix, a
landing checkpoint), the generated evidence-map/closure-plan pair stays ADR-0045. The one
test-authorship commit (`plugins/pipeline-core/lib/agent-decision-journal.test.mjs`,
`governance-export-delivery.test.mjs`) touches no path any `Governs:` line in the corpus names.

## Candidate 28df389471fda30d3a0c18bc3587195fc6b45069 — 2026-08-09, range 3387065..28df389, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `3eef8dd` entry below with the same one-entry-per-unpushed-range shape, now also
covering `bd8d73e`, `a7471a0`, `f9e300c`, `3f09bed`, `c48f327`, `e3967ba`, `28df389`. Same reading
as the whole chain: `docs/state.md` stays ADR-0012, the generated evidence-map/closure-plan pair
stays ADR-0045. This range is the first to touch `docs/*.md` PACKAGE documentation
(`agent-decision-journal.md`, `change-control.md`, `governance-events.md`,
`governance-event-export.md`, `organization-policy-packs.md`, `audit-bundles.md`,
`external-traceability.md`) and to EDIT (not create) a `backlog/items/*.md` file -- checked
explicitly rather than assumed identical to prior ranges: no ADR's `Governs:` line names any of
these paths, confirmed by the check's own output above naming only `docs/state.md` and the three
`specs/sprint-phoenix-epic/` files.

## Candidate bc023a0a735264e8daf7cb4e0bcf1417d3b979b7 — 2026-08-09, range 3387065..bc023a0, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `6b1fa48` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2594552`, `e33618d`, `de13e92`, `7253d49`, `bc023a0`. Same reading as the whole chain:
`docs/state.md` stays ADR-0012 (one new checkpoint entry), the generated evidence-map/closure-plan
pair stays ADR-0045 (two delta commits). The two test-authorship commits
(`plugins/pipeline-core/lib/human-governance-ledger.test.mjs`;
`plugins/pipeline-core/lib/governance-export-{adapter,delivery,outbox}.test.mjs`) touch no path
any `Governs:` line in the corpus names, confirmed by this run.

## Candidate 5bae83c2aac599271a07644d335af8f958771c1f — 2026-08-09, range 3387065..5bae83c, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `16114ee` entry below with the same one-entry-per-unpushed-range shape, now also
covering `500d5cc`, `78c6ef1`, `7ce3214`, `5bae83c`. Same reading as the whole chain: `docs/state.md`
stays ADR-0012 (one new checkpoint entry recording the maintenance-window ceremony and its
outcome), the generated evidence-map/closure-plan pair stays ADR-0045 (one delta commit). The two
non-generated content commits in this range —
`plugins/pipeline-core/lib/external-command-offer.test.mjs` (WP-R test-authorship) and
`harness/scripts/pipeline-state.test.mjs` (the P-AC-08 gate registration, additive-only, run
under the signed TP-3+TP-5 window rather than any doc-reconciliation-relevant channel) — touch no
path any `Governs:` line in the corpus names, confirmed by this run.

## Candidate 4e5f3d3d3deb7fbb855ab6a3e24ae3533ea1147f — 2026-08-09, range 3387065..4e5f3d3, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `c004d16` entry below with the same one-entry-per-unpushed-range shape, now also
covering `2a25520`, `e835464`, `055cb8b`, `80074ee`, `4e5f3d3`. Same reading as every entry in this
chain: the only governed paths this added range touches are `docs/state.md` (ADR-0012, two new
checkpoint entries recording work already landed) and the `specs/sprint-phoenix-epic/evidence/`
+ `design/` generated pair (ADR-0045, two delta commits regenerated from the same measurement
script per the established pattern). The two new test-authorship commits
(`plugins/pipeline-core/lib/change-control.test.mjs`, `plugins/pipeline-core/lib/agent-decision-journal.test.mjs`)
touch no path any `Governs:` line in the corpus names, confirmed by this run.

## Candidate d6f7a2e73e1c0fbd55cc9a4df23e53b019141054 — 2026-08-09, range 3387065..d6f7a2e, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Supersedes the `e44fb6e` entry below with the same one-entry-per-unpushed-range shape, now also
covering `d536fcd`, `55ffd18`, `fdb0292`, `3161a8e`, `a99c131`, `0b53f89`, `85dfd2a`, `d6f7a2e`.
Every commit in this added range that touches a governed path is `docs/state.md` (ADR-0012) or a
`specs/sprint-phoenix-epic/evidence/`/`design/` artifact (ADR-0045); the rest —
`plugins/pipeline-core/lib/*.test.mjs` test-authorship commits and one new `backlog/items/*`
file — touch no path any `Governs:` line in the corpus names, confirmed by this run rather than
assumed from the pattern of the prior entry.

ADR-0045: same reading as the prior two entries, extended to one more file class this range
introduces — `backlog/items/2026-08-09-external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system.md`.
That file sits under `backlog/`, which is its own dedicated class per the ADR's own text
("`backlog/`... retain dedicated classes") and is not implicated by ADR-0045's `specs/**` glob at
all — the check's output above confirms this: only `specs/sprint-phoenix-epic/design/closure-plan.md`
and the two `specs/sprint-phoenix-epic/evidence/` files triggered it, not the backlog item.

ADR-0012: same reading as the two prior entries. The two new `docs/state.md` entries in this
range are the same shape as before — pointers at committed package artifacts and a compaction
checkpoint recording what already landed, not a restatement of their content.

## Candidate e44fb6e00722c91c3a90b4c9a4dbc89bcbcbfe20 — 2026-08-09, range 3387065..e44fb6e, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

The entry below (record commit `4309d2c`) already covered `8e7a2f7..382626f`. This entry
supersedes it and additionally covers `55f361c`, `8df045f`, `92b21ed`, `8b696bc`, `e44fb6e` —
one entry for the whole unpushed range rather than one per candidate, because the intervening
commits either touched no governed path at all (`8df045f`, `92b21ed`, both entirely under
`plugins/pipeline-core/`, checked below) or are themselves the docs commits this entry covers
(`8b696bc`, `e44fb6e`).

ADR-0045 was implicated by the same class of change as the prior entry: `evidence/` package
files, this time a new design document (`design/closure-plan.md`) alongside edits to the
already-covered generator and map. `design/` is named explicitly in the ADR's own enumeration,
so this needs no new reading — the file lands inside what the decision already governs.

ADR-0012 was implicated by two further `docs/state.md` entries and still holds with one
canonical handover file. Both entries point at committed package artifacts rather than
restating their content, consistent with the prior entry's reading of A9.

**One thing worth naming rather than assuming past this range, checked rather than asserted.**
`plugins/pipeline-core/scripts/pipeline-state.mjs` and `lib/feature-package-topology.mjs`
changed substantively in this range (`92b21ed`, +290/−6), adding a new writer transaction to the
Pipeline's own runtime. This layer did not flag it. The reason is narrower than "no ADR governs
`plugins/**`" — that claim is false: `docs/adr/0058-guard-maintenance-window.md:14` governs eight
files under `plugins/pipeline-core/hooks/` and `lib/` by exact path. The precise gap is that
neither of the two files this range touched is among ADR-0058's eight, nor named by any other
`Governs:` line in the corpus (confirmed by re-reading all five lines, not by pattern-matching
the directory). A governance-writer change of real substance therefore produced zero signal from
this layer, for want of a `Governs:` line naming it — a distinct observation from the filed
`pipeline.doc-reconciliation-blind-to-adr-corpus-changes` item, which concerns the corpus not
covering edits to itself, not production code going uncovered. Not filed as its own item here;
recorded so a later reader does not have to re-derive it from the commit.

## Candidate 382626f42708d10fd17e0607f010d6342e4ac57c — 2026-08-09, range 3387065..382626f, the substantive tip of the unpushed range; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Both re-read against the candidate rather than carried forward from the entry below, and this
range is the first since the layer was built where the two readings are not identical to it.

ADR-0045 was implicated by two **new** files, not by an edit to an existing one:
`specs/sprint-phoenix-epic/evidence/acceptance-evidence-map-20260809.md` and its generator
`acceptance-evidence-map.mjs`. The decision names `evidence/` as a package directory in its own
enumeration and constrains its contents no further, so both files land inside what the ADR
already governs and neither is an extension of it. Recorded explicitly because the tempting
reading is the opposite one: a `.mjs` inside a spec package looks like a new artifact class, and
it is not — the ADR draws its line at the directory, not at file type.

The divergence found on this layer's first real run is unchanged and stays filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`: the ADR's root enumeration says
`prd.md` where disk says `prd_phoenix-epic.md`, and it does not cover four artifacts the package
already carries. This range adds two more files to that uncovered set. That does **not** widen
the divergence — the four uncovered artifacts sit at the package **root**, which the ADR
enumerates exhaustively, while these two sit inside `evidence/`, which it does not. The
distinction is worth keeping in the record so a later reader does not fold two different gaps
into one number.

ADR-0012 was implicated by `docs/state.md` and still holds with one canonical handover file. The
one thing worth checking rather than assuming: this range's handover entry deliberately **points
at** the committed evidence map instead of restating its numbers, and ADR-0012's own recorded
risk is that secondary sources creep back in. Checked, and it is the opposite case — A9's
refinement prescribes exactly this shape ("generated from, or references"), and the map is a
package evidence artifact rather than a second handover. A restatement of its 157 rows in this
file would have been the drift the decision forbids. — 2026-08-09, range 8dcb1cc..36a7fb1, the substantive tip of the push candidate; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Both readings unchanged from the entry below, and both re-read rather than carried forward:
the handover decision still holds with one canonical file, and the topology decision was
read against the package it governs and deliberately left alone.

What changed since that entry is the disposition around ADR-0045, not the reading. The PO
settled on 2026-08-09 that harness-level checks created outside the Epic's file inventory
are an acknowledged, repeated practice rather than a one-night exception, so no decision
record moves here. The gap that produced the practice is filed as
`pipeline.epic-file-contract-has-no-drift-check`; the divergence between that ADR and the
package it governs remains filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`; and this layer's blindness
to changes inside `docs/adr/` itself remains filed as
`pipeline.doc-reconciliation-blind-to-adr-corpus-changes`.

## Candidate 51eafc7b8c4853ee2663db0dfc1274268ca383f7 — 2026-08-09, range 8dcb1cc..51eafc7, the substantive tip of the push candidate; supersedes the entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

First entry written under the corrected semantics: the two decision records were read out
of the candidate commit and this record out of `--record-ref`, so neither answer came from
the working tree. Every earlier entry below was produced by the version that read both from
disk, which is the defect repaired in `2d413d9` — those entries were true, but the check
that accepted them could not have known.

Both readings are unchanged from the entry below. ADR-0012's decision still holds: one
canonical handover file, still the only one. ADR-0045 was read against the package it
governs and left alone deliberately; the divergence that reading found is filed as
`pipeline.adr-0045-topology-divergence-from-package-and-skill`, and a second gap found
since — that no `Governs:` line covers `docs/adr/` itself, so the corpus is invisible to
this layer — is filed as `pipeline.doc-reconciliation-blind-to-adr-corpus-changes`.

## Candidate 2e0ea8c8e689edaef82e7a10b2eaa09401be9fa5 — 2026-08-09, range 8dcb1cc..2e0ea8c, the substantive tip of the push candidate; supersedes the 9b27991 and 3a85891 entries below

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Same two ADRs, same findings, same reasoning as the entries below — the candidate
moved because each further change to the handover file is itself governed by
ADR-0012. That is not bookkeeping noise, it is the write-order rule being real.

**And it does not terminate on its own.** The implicated set is computed over the
whole range, so a governed path that changed anywhere in it keeps implicating its
ADR no matter what the tip touches; an entry for the record commit would need
another entry, without end. What bounds it is the rule at the top of this file:
the check is run against the tip of the **substantive** work, and the commit that
adds this entry sits deliberately outside the reconciled range. Anyone extending
this file should reconcile to their own substantive tip, not to the commit they
are about to make.

The entry below is kept rather than replaced. It covers a candidate that was
genuinely reconciled, and deleting superseded entries would make this file's own
history unreadable in exactly the way the decision list at the top of the
handover became unreadable earlier today.

## Candidate 3a8589152e778fc1ec164c6a5ba981139c431a90 — 2026-08-09, range 8dcb1cc..3a85891 (the unpushed sprint_phoenix range); ADR-0045 checked and a divergence filed as pipeline.adr-0045-topology-divergence-from-package-and-skill

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.

Notes for a reader, outside the two machine-parsed lines above. ADR-0012 governs
`docs/state.md`, which this range rewrites heavily; its decision — one canonical
versioned handover file, memory mirror-only, the open-items block referenced
rather than hand-maintained — is unaffected, and the file is still the only
handover. Its recorded risk, *secondary sources creep back in*, did materialise
in this range, but **inside** `state.md` rather than between files: a decision
list at the top kept reading as authoritative after it stopped being true, and
was corrected in `a69c288`. That is the ADR's risk being right, not the ADR being
wrong.

ADR-0045 governs `specs/**` and was implicated by three changed files. Reading it
against the package it governs surfaced a real divergence — four root artifacts
its enumeration does not name, and a PRD filename that disagrees between the
record, the disk and the shipped bootstrap skill. **No change to the ADR is made
here**, because both halves are governance questions rather than edits; they are
filed as `pipeline.adr-0045-topology-divergence-from-package-and-skill`,
committed in `3a85891`.

That is the honest reading of `checked, no change needed` in this case: the
decision record was read against its subject and left alone deliberately. The
format offers exactly two line shapes, and neither says "checked, and a
divergence was filed". A third shape is worth adding, and adding it belongs in
the same review as the ancestor-span widening noted above rather than in the
commit that first needed it.

## Candidate b87ef50dffed3268ea591ab0566d0fe9756d1c9b — 2026-08-18, range 8a92d377..b87ef50d, checkpoints 17-29: the EPIC-AC-04 Critic FAIL/fix cycle, H-AC-12's remaining two readers, the PO's two-key trust-anchor expansion, repeated `lifecycle.json` digest reconciliation, and the Class B closure sweep ending in A-AC-01's reclassification

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

**Restated per the known limitation this file's header names.** This range's start,
`8a92d377`, is the same base the two entries above (`1cb00e72`, `7071298`) already
reconciled from a narrower start; both are ancestors of this candidate. ADR-0058's
finding below restates `8bb4c147`'s already-checked disposition (an ancestor of
`1cb00e72`) rather than re-deriving it; ADR-0056's restates `0d3d9bcc`/`2390e02f`'s
v3-empty-set migration the same way. Only the genuinely new material below — commits
that are not ancestors of either prior entry — is freshly reasoned.

**ADR-0012** — `docs/state.md` was appended to for every checkpoint in this range
(17 through 29, the EPIC-AC-04 Critic audit, the Class A/D/S/B closure sweep, and
this checkpoint's own A-AC-01 CLOSURE fix). Every change is additive checkpoint
prose in the one canonical file the ADR names; nothing moved to a second file.

**ADR-0045** — implicated by the long list of `specs/sprint-phoenix-epic/**` paths
this range touches: `acceptance.md` (four PO-decision amendments — EPIC-AC-05,
R-AC-06, L-AC-01, PX0-AC-13, H-AC-11 O-4), `spec.md`, `lifecycle.json`, and dozens
of `design/`/`evidence/` artifacts (Critic-review records, dispatch records, test
transcripts, evidence-map snapshots). All are the same established artifact classes
prior entries in this file already named as legitimate package contents; none
change the topology's own rules. `lifecycle.json`'s five changes in this range
(`3c904496`, `f40fda0a`, `8e91872e`, `a62f95c4`, `7178e126`) are the same recurring
`FTP-ARTIFACT-2` digest-drift pattern already covered by the `1cb00e72` entry above
— read directly this time rather than assumed: each commit message names a fresh
PO-signed `feature-package-reconcile` ceremony (a distinct plan-sha256 and, where
recorded, intent-sha256 per ceremony) and a digest-only transaction, never a hand
edit; `a62f95c4`'s and `3c904496`'s messages were read in full to confirm this.

**ADR-0056** — implicated by `plugins/pipeline-core/hooks/guard-push.mjs` and
`project/critical-human-proof.json`. Two changes, both read against the ADR's own
decision text rather than assumed compatible:
1. `ae13b68b` (H-AC-12's remaining two direct readers of human authority) adds an
   **optional** `decisionReference` dual-evaluation to `guard-push.mjs`'s existing
   check (c) — evaluated only when the pre-existing `pushApproval.lastApproved`
   record itself carries that field, and it fails closed on disagreement rather
   than substituting for the existing commit-bound signature/chat verdict. This
   layers an additional, opt-in check onto the same clearance record; it does not
   touch `gates.push_approval`'s mode selection or its own verification path,
   which is what the ADR's Decision section actually governs.
2. `26b1fcf7` populates `trustAnchors` (left deliberately empty by `2390e02f`,
   restated above) with two entries — the PO's WSL and OneDrive signing keys.
   Read against the ADR's own 2026-08-16 correction: `trustAnchors` is documented
   there as a SET whose non-empty case "enforces membership by BOTH `keyReference`
   and `publicKeySha256`, a lone v1/v2 anchor being wrapped as a set of one" — a
   two-entry set for the same PO's two machines is that exact mechanism at N=2,
   not a new shape. This restores identity-pinning (the state the correction
   describes as having been given up for the multi-machine problem) while solving
   that same problem by naming both machines' keys instead of relaxing the check;
   it is a data change using the ADR's already-described set semantics, not a
   design change requiring a further amendment.

**ADR-0058** — implicated by `plugins/pipeline-core/lib/human-guard-override.mjs`.
The one new-since-`1cb00e72` reasoning surface is `6a548cf9`'s v3 trust-anchor port,
already fully reasoned in that entry above (restated, not re-derived: same file,
same commit, an ancestor of this candidate). No commit in this range past `1cb00e72`
touches this file again.

Full Verify re-run fresh at this exact candidate (`b87ef50d`, detached worktree
`.git/phx-verify`): 383 suites, the same known 3-red baseline this range's own
checkpoint 28/29 already state (`guard-testpath-override-tests` — TP-7, no route
from this session; `doc-contract-tests`/`doc-contract-check` — pre-existing linter
false positive, out of scope since 2026-08-16), `security-scan` clean. Confirmed
independently for this record, not carried over from checkpoint prose.

## Candidate f4711cba0fd1f63594098f678638b3436983f0f9 — 2026-08-18, range 8a92d377..f4711cba, adds only checkpoint 30 (this record's own entry above, `75bd72c2`, and the checkpoint-30 handover append) on top of the `b87ef50d` candidate already reconciled

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

**Restated per the known limitation this file's header names.** `b87ef50d` is an
ancestor of this candidate and was already fully reconciled by the entry
immediately above; ADR-0045, ADR-0056 and ADR-0058's findings there are restated
verbatim, not re-derived — nothing in `75bd72c2` (this file only, ungoverned) or
the checkpoint-30 append changes any of the three.

**ADR-0012** — the only genuinely new material in this narrow range: checkpoint
30's append to `docs/state.md` (this session's own push-preparation record —
the re-confirmed Verify baseline, this Layer 1b run, and the computed
subject-sha256). Additive checkpoint prose only, same as every other entry in
this file that reconciles ADR-0012; the canonical-handover decision (one
versioned file, memory mirror-only) is untouched.

## Candidate fb3b0ec31cee0c2b0ef235331aa71d6982f08b4b — 2026-08-18, range 8a92d377..fb3b0ec3, adds only the checkpoint-30 correction note (the entry above's own `077b64ff` and a short append recording it)

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's own known limitation: `f4711cba` is an ancestor of this
candidate and was already fully reconciled by the entry immediately above;
ADR-0045/0056/0058 are restated verbatim. ADR-0012's only new material is the
"Correction, same checkpoint session" paragraph appended to checkpoint 30,
recording the recomputed `subject-sha256` for the true final candidate — again
additive checkpoint prose, nothing structural. `077b64ff` (this record's own
prior commit) touched only this file, which no ADR governs.

## Candidate c581a218bf787246cabd5780d7da82e9d39f6cc4 — 2026-08-18, range 8a92d377..c581a218, checkpoint 31: the doc-contract-tests/doc-contract-check root-cause fix (inline-code-span scanner fix plus 17 evidence-snapshot corrections)

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

**Restated per the known limitation this file's header names.** `fb3b0ec3` is an ancestor of this candidate and was already fully reconciled two entries above; ADR-0056 and ADR-0058's findings there are restated verbatim, not re-derived — nothing in the commits since (`111958e0`, `5a549d22`, `824e02d2`, `d202633c`, this checkpoint's own `c581a218`) touches either ADR's governed paths.

**ADR-0012** — `docs/state.md` gained checkpoint 31 (this session's doc-contract root-cause-fix narrative). Additive checkpoint prose only, same disposition as every prior entry reconciling this ADR; the canonical-handover decision is untouched.

**ADR-0045** — implicated by two NEW commits under `specs/**` since the `fb3b0ec3` entry: `824e02d2` (one line in `specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`, wrapping a regex literal in backticks so the generator stops emitting the doc-contract false positive on future regeneration) and `d202633c` (the identical one-line transformation mechanically applied to the 17 already-committed snapshot files that inherited the bug from that same source string, `acceptance-evidence-map-20260817.md` through `...q.md`). Both are pure textual corrections inside the `evidence/` subdirectory — an established legitimate artifact class per every earlier ADR-0045 entry in this file — and neither changes the package's lifecycle state, artifact set, or topology; `824e02d2` was self-executed directly (1 file, 1 line, plain-JS data string, no architecture/schema/test/guardrail-hook-CI/dependency/security-surface touch — the same EL-01 stage-0 class as checkpoint 29's `A-AC-01` reclassification in this identical file), `d202633c` was a dispatched `goldfish-mechanic` task (17 files, fully specified, zero design latitude) whose result was independently re-verified by the Elephant (`check-doc-contracts.mjs` exit 0, re-run directly, not trusted from the dispatch report).

## Candidate c6b882d887318bbb2c5ca61baf8c2a6a8d1fcd81 — 2026-08-18, range 8a92d377..c6b882d8, checkpoint 31's confirmed-baseline/subject-sha256 addendum

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation: `c581a218` is an ancestor of this candidate and was already fully reconciled by the entry immediately above; ADR-0045/0056/0058 are restated verbatim. ADR-0012's only new material is the addendum to checkpoint 31 recording the re-confirmed 382/383 Verify baseline and the recomputed `subject-sha256` for candidate `334f7cf7` — additive checkpoint prose, nothing structural. `334f7cf7` (this record's own prior-prior commit) touched only `docs/doc-reconciliation.md`, which no ADR governs.

## Candidate f1205164df4b3fe23196f9c949ae9b20e7ee772f — 2026-08-18, range 8a92d377..f1205164, checkpoint 32: OT09/TP-7 handover for a plugin-authoring session

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation: `c6b882d8` is an ancestor of this candidate and was already fully reconciled by the entry immediately above; ADR-0045/0056/0058 are restated verbatim — no commit in this range touches `specs/**` or any ADR-0056/0058-listed path. ADR-0012's only new material is checkpoint 32 itself: a diagnosis-and-handover entry for the last remaining Full Verify red (`guard-testpath-override-tests` OT09), tracing it to a drift between this repo's vendored `plugins/pipeline-core/lib/critical-human-proof-policy.mjs` and the marketplace author source, addressed to a separate plugin-authoring session. Additive checkpoint prose only — read-only investigation (grep/Read against this repo and `~/agent-pipeline-local-marketplace`), no code or config changed by this entry; the canonical-handover decision is untouched.

## Candidate 4b25d4d8bbd054a9cb1ea6e7f8ab665e0b77d5cd — 2026-08-18, range 8a92d377..4b25d4d8, checkpoint 33: the exact post-fix push sequence (5 steps) persisted for next session

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation: `f1205164` is an ancestor of this candidate and was already fully reconciled by the entry immediately above; ADR-0045/0056/0058 are restated verbatim — no commit in this range touches `specs/**` or any ADR-0056/0058-listed path. ADR-0012's only new material is checkpoint 33: answering the PO's question about what remains after the OT09/TP-7 fix lands with the exact 5-step sequence (Verify, Layer 1b reconciliation, subject-sha256 recompute, Layer 2/3 signing, Layer 4/5 push) rather than the oversimplified "just Verify." Additive checkpoint prose only; no code or config changed.

## Candidate 8182c81fe9ab86baea9ac52f69f2dc58aedc4cba — 2026-08-18, range 8a92d377..8182c81f, A-AC-01/H-AC-11 disposition (d48251da) plus checkpoint 34 recording it and a new digest-drift finding

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation for ADR-0056/0058: `4b25d4d8` is an ancestor and was already fully reconciled above; no commit in this range touches any ADR-0056/0058-listed path.

**ADR-0045** — implicated by `d48251da`, which touches two files under `specs/sprint-phoenix-epic/`: `acceptance.md` (two PO-attributed amendments — A-AC-01's remaining ordering-seam gap struck per the PO's 2026-08-18 ruling, and H-AC-11's already-decided O-4 scoping decision given the backlog item EPIC-AC-05's `disposed` bar requires) and `evidence/acceptance-evidence-map.mjs` (matching `POINTERS` appends, no verdict change — both criteria stay `partial`). Pure textual disposition-recording inside `specs/sprint-phoenix-epic/`, the same established artifact class as every prior ADR-0045 entry in this file; neither the package's lifecycle state, artifact set, nor topology moved. Self-recorded directly by the Elephant transcribing an explicit, unambiguous PO chat decision — the same precedent this session already used repeatedly for A-AC-03/H-AC-11-O-4/L-AC-01's own amendments, not a fresh Elephant-originated judgment call. Independently re-verified before commit: `node specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs --mode default` regenerates without a syntax or runtime error.

**ADR-0012** — `8182c81f` (checkpoint 34) records the A-AC-01/H-AC-11 disposition, the 8 GitHub issue status comments, and a new finding: editing `acceptance.md` re-triggered the known `FTP-ARTIFACT-2` `lifecycle.json` digest-drift bug (confirmed via `pipeline-state.mjs feature-package-status`), which adds a second PO-signed `feature-package-reconcile` ceremony to the push sequence checkpoint 33 already documented. Additive checkpoint prose only; the canonical-handover decision is untouched.

## Candidate 11e70e5a01284048058aa6b509360fdbabe533fb — 2026-08-18, range 8a92d377..11e70e5a, Phoenix-exclusive backlog triage: one confirmed-fixed-upstream closure, two stale-item corrections, 138 durable evidence artifacts committed, two evidence-gitignore items closed

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation for ADR-0012/0056/0058: `8182c81f` is an ancestor and was already fully reconciled above; no commit in this range touches `docs/state.md` or any ADR-0056/0058-listed path.

**ADR-0045** — implicated by `00350b2d`, which adds 138 files under `specs/sprint-phoenix-epic/evidence/` — dispatch records, `.tap` test-run output, verify/security-scan snapshots, feature-package reconcile requests/proposals, Critic-review diff snapshots, and one PO key-setup helper script. This is exactly the artifact class ADR-0045's canonical topology declares durable and expects tracked (`evidence/`); the commit adds previously-untracked files to that declared location, it does not move, rename, or restructure the package. Secret-scanned before staging (private-key/token/password/secret patterns): zero findings, independently confirmed (see `backlog/items/2026-08-17-evidence-gitignore-left-dozens-of-durable-artifacts-untracked.md`'s own closure note for the full account). No machine-specific absolute paths present. The other three commits in this range (`8e8dd393`, `1e8617b1`, `11e70e5a`) touch only `backlog/items/**`, which no ADR governs.

**Correction, recorded plainly rather than hidden:** this entry was originally staged as its own standalone commit, but a concurrently-running dispatched goldfish agent committed against the same working tree before this entry's own `git commit` ran, and the goldfish's `git commit` (no explicit pathspec) swept this file's already-staged change into ITS commit instead — `dfc08120` ("docs(backlog): close the agent-decision-journal reasonCode array-coercion item"), whose message describes none of this. The content above is correct and complete; only the commit it landed in is mislabeled. Not amended (this repo's own rule: never amend, always a new commit) — recorded here as the honest account, and as a live instance of exactly the concurrent-session risk `backlog/items/2026-08-18-concurrent-session-prevention-supersedes-a-ac-01s-remaining-gap.md` (filed earlier the same session) describes in the abstract. Lesson applied immediately: no further dispatch that performs its own git commits was run concurrently with an Elephant-side git operation for the remainder of this session.

## Candidate 6100a6cc8d8ebbab75f2768487b4e23c705e92fa — 2026-08-18, range 8a92d377..6100a6cc, two dispatched fixes: reasonCode array-coercion guard + trust-policy 3-key shape acceptance

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation for ADR-0012/0045: `11e70e5a` is an ancestor and was already fully reconciled above (see the correction note immediately above this entry); no commit in this range touches `docs/state.md` or `specs/**`.

**ADR-0056** — none of this range's 4 commits (`169e9565`, `dfc08120`, `4c2f04cb`, `6100a6cc`) touch any of ADR-0056's 4 governed paths (`pipeline.user.yaml`, `project/critical-human-proof.json`, `project/pipeline-state.json`, `guard-push.mjs`).

**ADR-0058** — implicated by `4c2f04cb`, which touches `plugins/pipeline-core/lib/po-approval-proof.mjs`, explicitly named in ADR-0058's `Governs:` line. Checked against the ADR's own text: it names `po-approval-proof.mjs` only as the pre-existing, reused push-approval verification primitive GMW's `install` step depends on (§ "already established for push approval... the agent can `prepare` a digest-bound..."); it does not specify or constrain the exact field-set `verifyPoApprovalProof`'s `trustPolicy` argument must carry. The fix (accept an optional `humanName` field alongside the required `keyReference`/`publicKeySha256`, while keeping the `proof` object's own check exactly as strict as before) changes no cryptographic verification behavior and does not touch `docs/po-approval-proof-contract.md` (checked directly: that doc does not document the `trustPolicy` field shape at all, so no drift was introduced). Dispatched (goldfish-deep, `PHX-WP-TRUSTPOLICY-HUMANNAME`), not Elephant-direct — correctly, this is exactly the class of security-verification-primitive change EL-01 excludes from self-execution regardless of size. Independently re-verifiable: `node --test plugins/pipeline-core/lib/po-approval-proof.test.mjs` (dispatch report claims all cases green; not re-run by the Elephant in this reconciliation pass, noted rather than silently assumed).

`169e9565`/`dfc08120` (the reasonCode fix) touch only `plugins/pipeline-core/lib/agent-decision-journal.mjs`, `.test.mjs`, and a backlog item — none ADR-governed.

## Candidate 79e90d2faeded5fe2a45e6c84943eb2b4894e5ef — 2026-08-18, range 8a92d377..79e90d2f, dispatch evidence for the two backlog-fix dispatches

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation for ADR-0012/0056/0058: `6100a6cc` is an ancestor and was already fully reconciled above.

**ADR-0045** — `79e90d2f` adds 9 files under two new `specs/sprint-phoenix-epic/evidence/PHX-WP-*/` directories: each dispatched task's own dispatch record, commit-message artifacts, and test-run logs (`.tap`/`verify-log.txt`) — the same durable-artifact class as every prior ADR-0045 entry in this file. No package restructuring; purely additive.

## Candidate 51ed4826ced0a29ebee4297f73c33368779b4826 — 2026-08-18, range 8a92d377..51ed4826, checkpoint 35: full account of the Phoenix-exclusive backlog triage stretch

- ADR-0012: checked, no change needed.
- ADR-0045: checked, no change needed.
- ADR-0056: checked, no change needed.
- ADR-0058: checked, no change needed.

Restated per this file's known limitation for ADR-0045/0056/0058: `79e90d2f` is an ancestor and was already fully reconciled above. ADR-0012's only new material is checkpoint 35 itself: the full narrative account of this stretch's backlog triage (1 closed as fixed upstream by Nova, 2 stale items corrected, 2 real fixes dispatched and landed, 145+ durable evidence files tracked, and the concurrent-git-index incident recorded honestly). Additive checkpoint prose only; the canonical-handover decision is untouched.
