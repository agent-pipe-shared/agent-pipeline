# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-25 to 2026-08-26 | The 2026-08-25/26 chat-gate-ceremony standardization block: AGY-HGOFIX-2/3, the four chat-gate regressions and their closure, the Agent-tool worktree-isolation incident, the 17-agent AFK sweep and its reconciliation, and the 2026-08-26 sprint_agy push. Extraction pass performed first: every durable rule in it already lives in CLAUDE.md or its own backlog item; the single carry-forward with no home (GWM has no chat-mode activation path) was moved into the current handover before rotation. | [docs/state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md](state-archive/2026-09-01--chat-gate-standardization-and-afk-sweep.md) |
| 2026-08-23 | The Phoenix-line pointer block: a preamble stating that Nova became the authoritative line and that Phoenix's own checkpoints 61-71 are history. Its content was already archived separately and indexed; the block itself carried no live carry-forward. | [docs/state-archive/2026-09-01--phoenix-line-pointer-block.md](state-archive/2026-09-01--phoenix-line-pointer-block.md) |
| 2026-08-31 | The CI release blocker: diagnosis, the measured repair at ed491309, the PO decision to repair rather than bypass, and the inverted push-before-CI sequencing. Its live carry-forwards were extracted into the 2026-08-31 release handover before rotation. | [docs/state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md](state-archive/2026-08-31--ci-release-blocker-diagnosed-and-repaired.md) |
| 2026-08-31 | The 2026-08-30 block: the 6a93fec2 candidate stamp at 501/503, the six closed retrospective follow-up items, ADR-0076, and the unapproved emergency push of both branches. Its two live carry-forwards -- retro items 7 and 8 deferred to Nova B, and the unresolved Critic FAIL on the sandbox quickfix -- were extracted into the 2026-08-31 handover first. | [docs/state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md](state-archive/2026-08-31--prior-current-handover-nova-0-6-0-local-candidate-stamped-re.md) |
| 2026-08-31 | The 2026-08-28 three-runner greenfield block: rounds A-U2, the ready-gate blocker T, the 2+2 Critic round, and the candidate's state on the night of 2026-08-28/29. Its still-live carry-forward items were extracted into the 2026-08-31 handover before rotation. | [docs/state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md](state-archive/2026-08-31--prior-current-handover-the-three-runner-greenfield-findings-.md) |
| 2026-08-28 | Ledger merge across parallel sprints (ADR-0068), ADR renumbering at acceptance (ADR-0069), and the first handover rotation; its four live open items -- ADR collision 0063, the unregistered check-adr-consistency, BS25/BS26 durability, and the Nova A candidate list -- are carried forward to the current handover. | [docs/state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md](state-archive/2026-08-28--earlier-handover-ledger-merge-capability-adr-renumbering-han.md) |
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — 0.6.0 is an interim release; Nova B continues after it (2026-08-31)

**Sprint Nova is NOT closed.** The PO's explicit instruction this session:
0.6.0 ships as an interim state so Nova B can continue on top of it. No
`close-block`, no `close-feature`, no close coordinator — a release is a
handover event here, not a lifecycle close.

**The backlog release condition is satisfied, and the earlier plan to reach it
was wrong twice over.** Measured by cross-tabulating status against sprint (not
inherited): open = alfred 19 · batman 2 · nightwing 26 · nova-b 26, i.e. exactly
the four intended planning windows, with `check-backlog-sprint-assignment.mjs`
reporting `undeclared and open (failing): 0`. Sprint Phoenix is already at 0.

The pass the prior session planned — close four 2026-07-19 placeholders, move
six defects to `nova-b`, one to `alfred` — was **unnecessary** (all 11 items are
already `status: deferred`, never `open`, so they never counted against the
condition) and **impossible** (`FORWARD_TRANSITIONS`, `backlog-state.mjs:54`,
defines successors only for `open` and `in_progress`, so `deferred` and
`rejected` are terminal; and `open -> closed` is not a legal transition at all,
while `closed` requires a `closure_commit` OID plus a tracked `closure_evidence`
path that a never-implemented placeholder cannot honestly supply).

That has a consequence worth keeping: four defects re-verified as still present
in code sit in terminal `deferred` and are invisible to every mechanical check,
because the sprint gate only fails on `undeclared AND open`. Filed as
`backlog/items/2026-08-31-a-deferred-item-is-terminal-so-a-live-defect-can-be-parked-invisibly.md`.

**The exhaustive privacy sweep ran and returned FAIL; the PO disposed of it as
disclosed-unremediated.** Verdict persisted as a tracked artifact at
`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`.

- **F1 (major):** `privacy-review.md` §3 rule 11 requires restricted-store
  implementation to live only in files listed in Spec §§7.3-7.4 and states "No
  separate restricted-store implementation file is authorized by this design",
  yet `human-decision-attribution.mjs`, its test and its schema are absent from
  that inventory. Contract drift, not rogue implementation: the increment was
  authorized and closed, and the implementation itself is privacy-conservative.
- **F2 (major):** §5's sign-off is bound to commit `643c7d06` / tree `449465e5`,
  while the restricted-store surface has materially changed since.
  **No valid privacy sign-off covers the 0.6.0 candidate.** Anyone reading §5's
  Status line as satisfied is relying on a stale binding.

**PO decision, 2026-08-31: disclose, do not remediate.** Both are filed as open
`nova-b` items. Remediation would mean editing `specs/sprint-phoenix-epic/spec.md`
and `design/privacy-review.md`, both of which are sha256-bound in that epic's
`lifecycle.json` (the spec's recorded digest `5eeef75c…` matches its current
bytes exactly), i.e. retroactively rewriting a closed epic's authority record
plus its digest index. The release-preflight registers `critic` among its five
`FINAL_GATES` as `pending` and reads no verdict artifact, so this is
mechanically reachable — it is a recorded judgement, not a bypass.

**The recorded release sequence was wrong about the manifest stamp, and this
corrects it.** `release-preflight-cli.mjs:65` names three version surfaces —
`VERSION`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` — and
`observeVersion` requires every manifest to equal the literal contents of
`VERSION` exactly. The local-candidate `+claude.…`/`+codex.…` build stamps
therefore do NOT agree and would derive `version-decision-mismatch`. Stripping
them is correct and safe: `git show v0.5.4:…/.claude-plugin/plugin.json` carries
the bare `0.5.4`, and `codex-pretool-guard.test.mjs` only validates the stamp's
shape `if (buildMetadata !== null)` while asserting `baseVersion === VERSION`.

Both manifests are TRACKED, so stamping is a commit — and every commit voids
both the candidate-bound verify evidence and the Critic's candidate binding.
**The stamp belongs in the pre-verify batch, not after the Critic** as the
2026-08-30 handover recorded. The corrected order is: all commits → security
scan → full verify → Critic on the final candidate → signature ceremony → push
the feature branch → CI against the pushed ref → `main`, tag, release.

**The 2026-08-30 emergency push is disposed of as a documented waiver** (PO
decision, 2026-08-31). Both branches were pushed with `--no-verify`, no
`approve-push` and no Ed25519 proof. It left no trace in the hook's audit path
for a structural reason: there was no pre-push hook at all — preflight reported
`prePushHook: "absent"`, `unbackedGate: true` while the repository declared
`gates.push: blocking`. The hook is installed since 2026-08-31 on the PO's
explicit instruction, who also stated that `git push --no-verify` deliberately
remains available as git's own escape. No retroactive approval record is
created: an approval entry for an act that had none at execution time is exactly
the shape `approve-push` exists to prevent.

**A resume-hint trap, hit live and reversed.** A `--resume` restart PRESERVES the
session id, so a card captured before the restart and consumed after it records
capture and consumption under ONE session id — externally indistinguishable from
the false F12/F13 case the check exists to catch, regardless of whether
re-grounding genuinely happened. `consume` was recorded this session and then
reversed to `discard`; `resume-consumption-check` is green via
`RH-CHECK-NO-CARD`, which asserts nothing about any session having read
anything. Note `resume-hint.mjs` documents the receipt more narrowly than the
checker does: "A receipt below proves the card's bytes were READ; it never
proves they were understood or acted on." Filed as
`backlog/items/2026-08-31-a-captured-resume-hint-card-reds-the-verify-gate.md`.

**Three consecutive Goldfish dispatches hit the harness `maxTurns: 50` cliff**,
including one briefed with a deliberately reduced 30-call cap. In every case the
work was substantially done and only the closing handover was lost; each was
recovered by inspecting the tree directly and resuming with a
closing-allowance-only message. The briefed tool budget is not a mechanism —
`maxTurns` is. Treat a briefed cap as advisory and the cliff as real.

**0.6.0 is pushed to `nova` and the release stopped one step short of `main`.**
Candidate `56e91858` landed on `feat/sprint-nova-codex-v046` (`dfd26254..56e91858`)
with a signed approval bound to that exact commit and tree `dc84c401`, signed
with the pinned trust anchor `2de20a39`. Verify 505/505 `binding: "exact"`,
security CLEAN, an independent Critic review run, Layer 1b reconciled. What is
NOT done: `main`, `stable`, the `v0.6.0` tag and the release.

**Two gate defects were repaired to get that far, both structural rather than
incidental.** (1) `docs/adr/0076`'s `Governs:` line held prose where
`check-doc-reconciliation.mjs` parses a comma-separated glob list, producing an
`ORPHAN-GOVERNS-GLOB` that is a static corpus property — it blocked EVERY Layer 1b run in
this repository regardless of range, and no record could clear it. (2) `.git/agent-pipeline/po-key-directory.json` (2026-08-11) outranks
the machine plane in `parseHumanArgs`'s precedence, so `push-prepare` resolved a
stale, unpinned key directory instead of the OneDrive one the repository actually
pins. Removing the stale pointer made the trust-anchor check green. Both cost a
live ceremony's worth of confusion before being diagnosed.

**Push approvals occupy a SINGLE slot.** `pipeline-state.mjs` writes
`pushApproval: { lastApproved: … }`, so a second `approve-push` overwrites the
first. Signatures for `main` and `stable` cannot be taken in advance alongside
one for `nova`; each destination is its own sign -> approve -> push cycle. The
subject hash binds `{sourceCommit, remote, destination, threatModel}`, and
`push-prepare` additionally refuses whenever `evidence.commit !== HEAD`, so every
commit after a verify run forces a fresh ~10-minute verify before any signature.

**CI executed the suites for the first time since 2026-08-02.** Run
`33471808564` (`workflow_dispatch`, candidate `56e91858`) ran 6m37s and reached
suite index 439/505 before failing, where every run since 2026-08-02 had aborted
in 8-29s at `verify-journal` with zero suites started. `ed491309` is therefore
confirmed against the real CI environment, not only against a local clone.

**Exactly three suites failed there and pass locally**, and the cause is measured,
not assumed. Three controlled local runs reproducing the workflow step's
synthetic PATH establish: with only `node/git/bash/sh` all three fail; with a
fresh `HOME` and a full PATH all three pass, so an absent
`~/.agent-pipeline/machine.json` — the obvious first guess — is NOT the cause;
adding a single `openssl` symlink turns `trust-anchor-bootstrap-circularity-repro-tests`
and `onboarding-init-tests` green. Root cause: `po-human-approval.mjs` shells out
to `openssl` for the entire signature-mode key chain (`genpkey -algorithm ED25519
-aes-256-cbc`, `pkey -pubout`, `pkeyutl -sign -rawin`), while the step's own name
asserts the core needs no such tooling. Fixed in `705b7cf3` by admitting
`openssl` to that PATH, with the dependency stated in the workflow rather than
hidden.

**`project-onboarding-v3-tests` is NOT explained and must not be assumed fixed.**
It failed in CI in 74s (05:01:34→05:02:48Z) but passes locally under the
restricted PATH with a fresh HOME, with and without `openssl`. Its only local
failure is a ~150s hang that occurs solely with this machine's real HOME, whose
machine-plane `poKeyDirectory` sits on a slow `/mnt/c` Windows mount — a local
artifact, not the CI cause. Open in
`backlog/items/2026-09-01-three-onboarding-suites-pass-locally-and-fail-in-ci.md`.

**The remaining release path, in order, none of it guesswork:** run a full verify
at the final HEAD → one signature for `nova` and push (this carries the audit
commit, the CI-failure item and the workflow fix) → re-run CI against the pushed
ref and read what remains → resolve `project-onboarding-v3-tests` → then one
signature each for `main` and `stable`, then the `v0.6.0` tag and the release.
`protect-main` keeps `main` unreachable until that CI check is green for the
exact commit being pushed, and that enforcement is server-side.

### Carried forward, because none of these has another home

- **GWM has no chat-mode activation path.** Started, reverted, never resumed;
  not blocking anything in flight. Extracted from the 2026-08-25/26 block
  before its rotation on 2026-09-01: checked against `backlog/items/` that
  same day, and the only GWM item there
  (`2026-08-25-gwm-kernel-doc-enumeration-diverges-from-the-code-array.md`)
  is about doc/code enumeration drift, not this.
- **AK-6** is ready to re-dispatch against `pipeline-user-v3.schema.json` (the
  first attempt used the pre-v3 schema and would have flagged a correct
  calibration as drifted; withdrawn `1d6dec55`, scaffolding kept at `8316dbd8`).
- **A standing authorization the mechanism cannot honour.** Spec §8 grants a
  standing Nova authorization to lift TP-1/TP-3/TP-5 for an exact task, but
  `guard-testpath` reads `gates.push_approval`, this repository is on `signature`,
  and that mode has no in-session activation step. Whether §8 promises more than
  the guard delivers, or the guard should know about §8, is an open design
  question that read as a blocker to three sessions in one night.
- **BS25/BS26 durability** (ADR-0068 D6): three positional ledger lookups remain
  (`backlog-state.mjs:1326`, `:1504`, the test fixture); two can bind by
  `entryHash`, `amendsSequence` needs an additive `amendsEntryHash`, and the
  fixture must stay positional, so the prefix invariant becomes a named check.
- **The Antigravity hard-enforcement layer's two fail-open paths:** the layer is
  inert whenever the daemon cannot resolve `node`, and it fails silently, because
  the hook that would report it is the one that does not run.
- **Two of the four documented reasons for `security: off` are stale**
  (`c67397d7`). What actually blocks is the v2 verdict's three offending required
  capabilities plus a license allowlist resolving only inside this repository.
- **Codex restarts where a resume would do.** The barrier's contract requires "a
  ticket proving a fresh *Codex* process re-read those bytes" — a new process, not
  a new conversation — so by that contract a resume clears it and keeps context.
  The one empirical fact it turns on is unmeasured: whether `codex resume`
  re-reads `.codex/*`. Measure that before changing any instruction.
- **The sibling defect shape, still unfiled:** *a change to A creates an obligation
  at B, and only a later gate run reveals it.* Editing a doc staled its vendored
  copy; regenerating that copy tripped the consumer-path scanner; extending the
  Critic search surface invalidated a security baseline pinned to it; registering
  five suites silently invalidated the capability inventory. Each is a missing
  coupling, not carelessness. Its primary shape (*named but not admitted*,
  *admitted but not named*, *published but not consumed*) is filed as `a33ea0cc`;
  this sibling is not.
- **The PO's acceptance bar, verbatim, because it is what "done" means:**
  *"1. ich bestätige, dass die pipeline installiert werden soll 2. ich beantworte
  eine reihe anfragen fürs onboarding (modus, author, etc.) 3. ich gebe PRD frei
  4. ich verlange den push 5. ich signiere den push"*. Touch 3 carries an open
  quality question, not a defect: what the PO releases is a staging draft that is a
  verbatim intake transcript until an agent authors the product framing, and
  nothing forces that authoring step.
- **Retrospective follow-up items #7 and #8** stay deferred to Nova B per PO.
- **The Critic 1+1 run on the sandbox-quickfix delta returned FAIL, unresolved,
  with no Round 3 dispatched.** 1 major — `roles/elephant.md` stage-0 fast-path
  violated by a self-committed fix to `check-consumer-safe-paths.mjs`; 1 minor —
  `observeRunner()` untested, filed. Both were self-verified and documented, no
  functional defect found, but the FAIL itself is still unresolved.
- **`f7ab9b42` (NVA-DOC060) has had no independent Critic review.** Implementation
  complete (user-facing documentation aligned with the real 0.6.0 three-runner
  state); the diff has not been through an independent Critic pass.
- **Two unanswered NVA-CIVERIFY questions, carried to the Critic and still open:**
  (i) the change lets ANY session-less checkout self-provision a binding, a plain
  local clone included, where the previous behaviour was an outright refusal —
  intended, or to be narrowed? (ii) a `guard-lifecycle-ready.test.mjs` failure in
  its own reproduction log whose expected paths point into `scratch/ci-repro/…` —
  clone-nesting artifact, or real? The release review found no code defect in the
  change itself, so (i) is the question that remains genuinely open.
- **`guard-lifecycle-ready-tests` / `NOVA-LCR-HGO-1`:** the copy-safe renderer's
  wrap column is path-length sensitive, so at a long enough checkout path a
  denial no longer visibly names `guard-human-override.mjs` — possibly an
  ADR-0059 Decision 4 violation in real consumer projects rather than a test
  artifact. Two deep-path clones fail, three short-path runs pass. Filed as
  `backlog/items/2026-08-31-copy-safe-renderer-wrap-point-is-path-length-sensitive.md`;
  the outside-repository short-path data point is still missing.

## Operational head

- Project calibration: [`project/pipeline.json`](../project/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- No reusable full-bootstrap receipt is stored publicly; run the full
  bootstrap. Machine-local installation details and private receipts are not
  versioned here.
- Active Sentinel authority and retention are governed by
  `governance/spec-retention.json` and the linked recovery package; no
  completion or go-live claim is made by this handover.
- Nova B is the active line of work; 0.6.0 ships as an interim release.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

