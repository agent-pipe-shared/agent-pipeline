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
`docs/adr/0063-fork-disposition-approval-proof.md` were themselves amended in this range —
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
