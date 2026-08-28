# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

## Archived history

| Date range | Summary | Archive |
|---|---|---|
| 2026-08-28 | Verify green 471/471 in one run at candidate 5fd963fc; EP07 tree-dirtying cause named and fixed; +build stamp convention restored; AK-5 closed, AK-6 ready to re-dispatch; the open 0.6.0 combined-release decision carried forward to the current handover. | [docs/state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md](state-archive/2026-08-28--prior-handover-verify-is-green-in-one-run-candidate-0-6-0-lo.md) |
| 2026-08-27 | sprint_agy fetch, fast-forward, and the 2026-08-26 clean local candidate | [docs/state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md](state-archive/2026-08-27--prior-handover-sprint-agy-fetch-fast-forward-and-clean-local.md) |
| 2026-08-19 through 2026-08-23 | Phoenix-line checkpoints 61-71 (2026-08-19 through 2026-08-23), preserved verbatim as history after the Nova merge made the Nova line authoritative. | [docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md](state-archive/2026-08-27--phoenix-checkpoints-61-71.md) |
| through 2026-08-19 | First real rotation: everything from the 2026-08-08 restart checkpoint through the inherited Nova/Cyborg-release history and every older era down to the open-items tail — extraction pass completed first (original pre-rotation line range 4977–19155; see the archive file's own provenance section and the ADR-0064 addendum dated 2026-08-19) | [state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md](state-archive/2026-08-19--pre-restart-and-nova-inherited-history.md) |
| 2026-08-11 to 2026-08-19 | Checkpoints 1-60 (2026-08-11 through 2026-08-19 checkpoint 60): superseded session narrative; durable decisions already live in ADRs/backlog/guardrails per this repo's own standing convention, not uniquely in this prose. | [docs/state-archive/2026-08-19--checkpoints-1-through-60.md](state-archive/2026-08-19--checkpoints-1-through-60.md) |
| 2026-08-26 | 2026-08-25 Antigravity chat-gate-ceremony standardization, verify-tuner stage 2 acceptance, sprint-agy-runner delta4 Critic fix and candidate status | [docs/state-archive/2026-08-26--agy-runner-2026-08-25-handover.md](state-archive/2026-08-26--agy-runner-2026-08-25-handover.md) |

## Current handover — the three-runner greenfield findings are being worked, happy path first (2026-08-28)

**READ THIS FIRST.** The greenfield test ran candidate 0.6.0 across Claude/Windows,
Agy/WSL and Codex/WSL against one design document. Eighteen backlog items came out
of it (`9e4a59d6`, `f51f8f4e`), and the PO set the priority explicitly: the happy
path ends at the push, so everything on that chain is NOW, not Nova B. Security is
default ON with its prerequisites made ready during init.

**The PO's own framing of the goal, kept verbatim because it is the acceptance
bar:** *"das onboarding muss guided viel einfacher für die agenten werden"*. Onboarding
today exposes ~31 subcommands with plan/apply digest pairs that an agent must
sequence by hand; all three runs independently named this their largest friction.
The decision (AskUserQuestion, 2026-08-28) is **"Flow neu, Kern behalten"** — rebuild
the orchestration, leave the binding/crypto core untouched. Nothing in this work
weakens a digest, a binding or a signature.

**Work is running in rounds of parallel worktree-isolated Goldfish dispatches.**

*Round A — landed and independently verified, not taken on report:*
`53693c3d`/`3e6bfce4` scratch-during-intake admission (161/161) · `fffb0001`/`cb673ab1`
absent pre-push hook reported as an unbacked gate (7/7) · `131a9901` twin-manifest
drift detection (34/34) · `89f30758` shared copy-safe renderer (5/5, incl. a real
`bash eval` round-trip). Merged guard suite: 162/162.

*Rounds B through L — landed, each collected by worktree inspection rather than
from its report.* The guided init driver exists and reaches a terminal `ready`
in five driver invocations and four human rounds, with no repair subcommand
(rounds F/H). Preflight resolves the active runner from three positive signals
(G) and a not-ready project's bootstrap `nextAction` now names the driver, so
an agent can learn it exists (K). The closed shell grammar admits bounded `&&`
chains under a union rule and states the admitted grammar when it refuses (I).
gitleaks resolves a plugin-shipped default config and downgrades a missing one
to SKIPPED; `push-prepare` respects `gates.security` (J). The Critic contract
gained **reachability and effect** as a seventh mandatory search dimension, and
that addition is carried into the vendored plugin copies (L, `1f51ddc4`/`fa6309b5`).

*Rounds M through U2 — landed, every one collected by worktree inspection
rather than from its report.* M/P fixed the PO profile receipt at the apply
BOTH promotion callers share (suite 247). N made a refused signature push name
its typed predicate and made the two trust-anchor-policy readers agree. O put
the "walk the signature, never offer alternatives" rule where an agent is bound
by it. Q2 made the `draft` gate derive `--by`/`--profile` from what onboarding
already persisted — the design→implementation walk went from two human stops to
one. U/U2 reconciled twelve of the 27 NOW-tracked items against the code, each
closing note naming the file and lines read; **thirteen of the nineteen still
open have NOT been re-measured** and may be stale in either direction (Round O
already partly satisfies `agents-talk-the-po-out-of-the-signature`, which does
not know it).

**The ready-gate blocker (T, `b317f139`) — the session's most consequential
finding.** `lib/project-onboarding-ready-gate.mjs` validated every observation
against a hand-maintained eleven-name `RESULT_KEYS`, while
`project-onboarding-v3.mjs` attaches `pushApprovalMode` and
`trustAnchorAvailability` to a `ready` result and to no other status. `exactKeys()`
therefore failed **exactly when a project is ready** — the only case the gate can
otherwise pass — refusing every governed write in every ready project. Invisible
because the installed marketplace copy was an older build; it surfaced the moment
the PO rsynced the candidate. The accepted shape is now status-specific and still
exact in both directions, with three pinning tests, measured against the real
producer through the real gate (13 keys, all three intents accepted) rather than a
stub. The **pattern** stays open: three hand-maintained mirrors of a shape this
module does not own, a suite green because it never asks the real producer, and
T's own tests are a fourth copy — its item requires the enumeration to be derived.

**Carried forward from the rotated 2026-08-27 handover, because neither has
another home.** (1) The **open release decision**: the PO corrected on 2026-08-26
that 0.6.0 is a combined Nova+Phoenix number, not Nova-only. Undecided — intake
Phoenix now and release combined, or release Nova alone under a different number.
`0.5.7` is not a candidate; `VERSION` and every stamp already say 0.6.0. This does
NOT block a local candidate stamped `0.6.0+…`; it blocks calling a *published*
artifact 0.6.0. (2) **AK-6** is ready to re-dispatch against
`pipeline-user-v3.schema.json` (the first attempt used the pre-v3 schema and would
have flagged a correct calibration as drifted; withdrawn `1d6dec55`, scaffolding
kept at `8316dbd8`).

### What still blocks a stamped candidate, in order

1. **The PO rsyncs again.** The installed copy still carries the PO's local `sed`
   provisional at line 150; only the rsync replaces it with T's real fix.
2. **Collect R2's pinning tests, then R (`55caf20f`).** R exempts a provably
   unauthored staging draft from the acknowledgement marker — the PO's *"die
   initiale PRD ist wertlos"* fix. It is an untested relaxation of a PO gate until
   R2 lands and must not be collected before.
3. **Full Verify on a quiesced tree** — after the last dispatch returns.
4. **1+1 Critic** (opus/max, `routing.duties.critic_high_risk.claude`), with
   `55caf20f` explicitly in scope because it relaxes a PO gate.
5. **Manifest version bump, then stamp both runner manifests.**
6. **rsync.**

Shipping knowingly open, all measured and filed: the trust-anchor bootstrap (B8)
still seeds a bare v1 document when no machine key exists, so the signature route
is functionless there until the PO adds an anchor; the push gate is unsatisfiable
in an installed-plugin deployment; `onboarding-init.mjs` never reads
`nextAction.pendingAsks`, so the guided run never asks the push-approval question;
`pipeline-start` SKILL.md still names the raw `inspect` action instead of the
driver; reachability is a review-time Critic prompt with no mechanical check.

**The receipt defect, measured rather than inferred.** A fresh local project
driven to `ready` has no `.git/agent-pipeline/po-gate/profile-receipt.json` at
all, so every `submit-plan` is refused `PO-PROFILE-RECEIPT-INVALID` with no
route out. The check is correct and fail-closed; nothing publishes. The receipt
is initialized only by `applyProjectOnboardingKickoffV4`, and the measured apply
sequence never reaches it — it ends at `bootstrap-bind-apply`, whose
`applyOnboardingBootstrapBind()` calls the promotion **directly**, bypassing the
one wrapper that carries receipt responsibility. Two sibling callers, one
repaired; the same shape as the trust-anchor finding below.

**What a genuinely blind session can do, measured.** Walking the feature/push
path with no pipeline knowledge, following only a structural `nextAction`, a
fresh session chains **zero** commands where onboarding chains fifteen. That is
the gap the `nextAction` protocol was built to close and does not yet close on
this path.

**A defect in the dispatch mechanism itself, found and filed mid-round**
(`cb984294`, `8d403723`): `guard-git.mjs:542` resolves a `git commit -F` message
file against `CLAUDE_PROJECT_DIR` rather than the invoking cwd, so inside a
worktree the file is looked for in the main checkout and the commit is refused as
`GIT-03-UNREADABLE-MESSAGE-FILE`. Two sibling dispatches hit it; one guessed the
absolute-path workaround and landed its commits, the other returned an empty result
with finished work stranded. Combined with the closed grammar's refusal of a newline
in `-m`, a correct multi-line commit is unreachable from a worktree. Fix dispatched
as `NVA-B-GUARDF`; until it lands, every worktree briefing must state the
absolute-path rule. A second contradiction of the same kind is recorded in that
item: `templates/prompts/goldfish-task.md` instructs `git add … && git commit …` as
one call, which the grammar refuses.

**Two of the four documented reasons for `security: off` are stale** (`c67397d7`).
Onboarding now writes the `.gitignore` whose absence reason 1 describes, and missing
scanners were measured rather than assumed: with none reachable the run reports
`SKIPPED [binary_missing]` ×3, `license-check: OK`, **CLEAN, exit 0**. What actually
blocks is the v2 verdict's three offending required capabilities plus a license
allowlist that resolves only inside this repository.

**The PO's acceptance bar for the happy path, stated 2026-08-28 and kept verbatim
because it is what "done" means for this candidate.** Five human touches, and no
others, when nothing needs asking back:

> *"1. ich bestätige, dass die pipeline installiert werden soll 2. ich beantworte
> eine reihe anfragen fürs onboarding (modus, author, etc.) 3. ich gebe PRD frei
> 4. ich verlange den push 5. ich signiere den push"*

Measured against a live blind walk at `60ab3d46`, touches 1+2 are already one
bundled ask and 4+5 are already right. Two gaps remain, both confirmed by
measurement rather than reading:

- **The PRD is signalled twice.** Onboarding has the PO acknowledge the staging
  PRD by writing a marker into it; `approve-plan` then asks the PO to read and
  approve *the same file* — verified identical path in one run. One judgement,
  two acts.
- **`submit-plan` stops for values the project already holds.** The `draft` gate
  asks for `--by` and `--profile`. Its own comment defends this as "cannot derive
  from `project/pipeline-state.json`", which is true of that file and beside the
  point: onboarding asked the PO for both and persisted them — `values.profile`
  in the intake checkpoint, the git author in this repository's local Git config
  (both read back live in a freshly onboarded project). Being fixed as
  NVA-Q2-DRAFTDERIVE.

The transition itself is otherwise clean: after approval, `set-phase` chains
automatically and implementation is reached with no further human involvement.

**Codex restarts where a resume would do.** The restart barrier's own contract
requires "a ticket proving a fresh *Codex* process re-read those bytes"
(`lib/codex-onboarding-runtime.mjs`) — a new process that re-read `.codex/*`,
not a new conversation. By that contract a resume clears it exactly as a cold
start does, and keeps the session's context; the code already contemplates the
word ("a Claude-native restart/resume launcher still needs to be built"). What is
NOT yet established is the one empirical fact it turns on: whether `codex resume`
re-reads `.codex/*`. Measure that before changing any instruction.

**One defect class runs through all of this, and it is the reason for Round L.**
Three capabilities shipped in one session passing their own tests while being
unusable: the driver (refused by the readiness guard, named by nothing), the
security gate's satisfying path (measured only inside this checkout, where alone
its scanner config resolves), and the `nextAction` protocol (published by five
builders, consumed by nothing on the path that needed it). One fault with three
faces — **the mechanism was measured, the path to the mechanism was not.** None
was caught by a test, by Verify or by review; two were caught by the PO asking.
Filed as `a33ea0cc`, with a mechanical check specified there and the
complementary Critic dimension landed in Round L. The consumer's B8 finding is
the same family seen from the other side: the identical trust-anchor defect was
found and closed in `human-guard-override.mjs` (NVA-HGOFIX-1, two pinning tests)
and left standing in its sibling reader.

**Still true and unchanged:** the push gate is `approval: required` with
`gates.push_approval: signature`. Nothing here unblocks a push, and no
outstanding item may be reported as done while its Critic round is pending.

## Earlier handover — ledger-merge capability, ADR renumbering, handover rotation (2026-08-27)

**READ THIS FIRST.** Three connected pieces of work, all committed, all on
`feat/sprint-nova-codex-v046`.

**1. The backlog ledger can now be merged across parallel sprints** — the
capability the Phoenix merge proved missing. [ADR-0068](adr/0068-backlog-ledger-merge-semantics.md)
records the decision; the defect it fixes was a contradiction sitting unnoticed
in one module, because it is invisible while nothing moves: chain validation
demanded an amendment's `from`/`to` equal the item's CURRENT status, while
supersession recognition and the planners demanded the status frozen in a
registry. Both readings coincide until a second line advances the item, and then
they are mutually unsatisfiable. An amendment is now status-neutral and binds
its target by `entryHash` rather than physical position. All 38 Phoenix
reachability amendments migrated; the measurement that matters is that the same
append took `check-backlog-state.mjs` from 13 findings to 73 before the change
and leaves it unchanged after. `backlog-state.test.mjs` 55/55 including BS26,
which can finally exercise what it was written for. Commits `87203a08`,
`e8e65eb4`, `14f028bb`, `72c1c48d`, `086c3430`.

**2. The six duplicate ADR numbers the merge produced are being resolved.**
[ADR-0069](adr/0069-adr-numbers-are-allocated-at-acceptance.md): numbers are
allocated at ACCEPTANCE, never at drafting, and carry no sprint prefix. Five of
six done — 0062→0071, 0064→0073, 0065→0074, 0066→0075, 0061→0070. **0063 is
still open** and is the largest (97 files, ~185 ambiguous bare references);
expect `repository-directory-contract` to keep the number on reference load.

**3. `docs/state.md` is editable again** — it was 48,825 bytes against its own
30,000-byte cap, which blocked every session that follows the bootstrap
protocol. Checkpoints 61–71 rotated to `docs/state-archive/2026-08-27--phoenix-checkpoints-61-71.md` (`da70d0df`).

### Still open, in order

1. **Collision 0063 → 0072.** The only remaining `DUPLICATE-NUMBER` finding.
2. **Register `check-adr-consistency.mjs` in `verify.mjs`** (ADR-0069 D3). The
   checker already existed and already worked; `verify.mjs` simply never ran it,
   which is why six collisions could land unreported. Do this AFTER 0063, or
   Verify goes red by design.
3. **BS25/BS26 durability** (ADR-0068 D6, not yet written): three positional
   lookups remain (`backlog-state.mjs:1326`, `:1504`, and the test's fixture).
   Two can bind by `entryHash`; `amendsSequence` has no hash in its event shape
   and needs an additive `amendsEntryHash`. The test fixture must stay
   positional — it needs a contiguous valid chain — so the prefix invariant
   becomes a NAMED check instead of a silent assumption.
4. **Full `verify.mjs` run** once the above land.

### Recommended for this candidate (Nova A), everything else Nova B

- `handover-file-exceeds-its-own-size-cap` — **done above**, close it.
- `long-dispatches-truncate-before-emitting-their-report` — hit **five times**
  in the 2026-08-27 session alone; two dispatches lost their report entirely and
  one nearly lost its work. The closing-allowance fix is already designed.
- `existing-repos-drift-on-agy-pipeline-user-yaml-update` — adoption blocker for
  every existing repo once 0.6.0 ships.
- `gitleaks-content-fingerprint-breaks-on-any-line-insertion` — presents as an
  unexplained blocking secret scan.
- `antigravity-hard-enforcement-layer-has-two-fail-open-paths` — **PO
  instruction 2026-08-27: the agy security items belong in the candidate.** The
  residual path is not small: the entire Antigravity hard-enforcement layer
  (PreToolUse guards, mandatory-bootstrap hard block) is inert whenever the
  daemon cannot resolve `node`, and it fails SILENTLY because the hook that
  would report it is the one that does not run. Its own QG-06 review horizon
  (`due: 2026-08-30`) is three days out.

Five further items are finished but not closed (ledger-merge, BS26,
claude-start-time, tp-guard-restore, intake-generate-coordinator — the last is a
status/Triage contradiction). Closing them is bookkeeping, but until it happens
every backlog overview is wrong.

### Ledger discipline — extracted 2026-08-27, applies to the closures above

Both rules existed ONLY in the rotated checkpoints and are now filed
(`f5a77841`): a `reconcile-backlog-ledger.mjs --activate` result is committed
ALONE, because GG-22 inspects the whole staged index rather than the commit's
pathspec; and `check-backlog-state.mjs` runs BEFORE committing a ledger change,
since an uncommitted bad reconciliation is undone with `git checkout --` on the
three projection files while a committed one needs the heavy evidence-amendment
machinery. `closure_commit` needs a FULL lowercase OID.

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
- For this task, Nova B is explicitly out of scope.

**Last updated:** 2026-08-25 — chat-gate-ceremony standardization
(`enforce-kickoff-po-questions`, PO decision: standardize push/kickoff/
PRD-Spec approval onto ONE mechanism, `plugins/pipeline-core/lib/
chat-gate-ceremony.mjs`). Landed and independently reverified this session:
(A) push self-approval fix (closed), (B) kickoff `--language`/`--profile`
gate (closed), (C) PRD/Spec acknowledgement gate (`po-authority-
acknowledge-apply` now requires the ceremony, commits `01b10848`
cherry-picked + `550b21d7`), push-approval preference now confirmed
per-repository pre-filled from the machine default instead of asked once
and never applied (closed, commit `cefd5dcb`). GWM kernel-closure gap for
`chat-gate-ceremony.mjs` fixed (`f6c9800a`). **HGO's `authorize --activate`
chat-mode path now DONE** (`AGY-HGOFIX-2`, commit `69d608fe`,
independently reverified 76/76): `authorizeHumanGuardOverride()` requires
the attended-chat-gate confirmation in chat mode, unchanged in signature
mode. Its own collateral regression (3 dependent test files calling the
now-gated function in chat mode without the seam) was chased down:
`guard-lifecycle-ready.test.mjs` fixed (`AGY-HGOFIX-3`, commit `60805fab`,
127/127). **Still open:** `guard-gate-strength.test.mjs` (4 tests,
GST21/25/26/27) and `guard-testpath-override.test.mjs` (4 tests,
OT10/11/12/13) stay regressed — both are empirically confirmed TP-6/TP-7
guard-protected test paths with no in-session override route
(`status=author-repair-required`); fixing them needs a human-run
author-repair ceremony or a follow-up dispatch scoped with that authority.
GWM itself has no chat-mode activation path yet (barely started, reverted,
not picked back up — not blocking anything currently in flight).
**Live incident this session, recovered, filed:**
`isolation: "worktree"` (Agent tool) never actually created a separate
worktree — three parallel dispatches raced on the shared checkout, causing
three zero-commit truncations and a detached-HEAD incident (a self-heal
step ran `git checkout --detach` against the shared tree). No work lost;
recovered by hand (cherry-pick + selective revert). See backlog:
`2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md`.
**Until that's resolved, dispatch serially in this repo, not via
`isolation: "worktree"`.** Also filed this session: a confirmed, reproduced
`guard-dispatch.mjs` fail-open on the Antigravity `Subagents`/`TypeName`/
`Prompt` payload shape (live defect, not theoretical); a GWM
kernel-doc/code enumeration drift (13 undocumented entries); a general
"guards are tool-level, not OS-level sandboxing" idea (Nova B, deferred).
**Correction/narrower finding after further testing:** the broken mechanism
was specifically the Agent tool's own `isolation: "worktree"` parameter —
the **Workflow tool**'s `agent()` `opts.isolation: 'worktree'` DOES create
real separate worktrees (confirmed live via `git worktree list` showing
distinct `.claude/worktrees/wf_*` entries), matching
`workflow-dispatch.md`'s own documented live-tested behavior. Prefer the
Workflow tool for any future worktree-isolated parallel dispatch in this
repo; the Agent-tool-direct path stays suspect until separately verified.

**AFK backlog sweep — COMPLETE and reconciled (PO directive, chat,
2026-08-25).** `codex-runner-has-no-real-support-on-native-windows` closed
separately first (won't-fix, PO: no Windows daemon exists, existing
mitigation suffices). The 17-item Workflow-tool sweep (Run ID
`wf_3ec6e465-da5`) landed; 8 of 17 agents failed to call `StructuredOutput`
(harness-level truncation) but several still committed real work in their
worktree — every one of the 17 worktrees was individually checked via
`git worktree list`/diff, not just the returned JSON, per
`workflow-dispatch.md`'s "never trust a returned result alone" rule.
Reconciled onto `sprint_agy`: **6 fixes cherry-picked and independently
re-verified** (own test suite run directly, not the dispatch's self-report)
— a real Antigravity `Subagents`-payload dispatch-guard bypass fix (15/15,
matches the live-reproduced finding from earlier this session), the GWM
kernel-doc/code enumeration drift (13 missing entries, 3/3 incl. new
GMWKC03 regression guard), a `backlog-strip-for-dispatch` section-dropping
bug fix (12/12), a `verify.mjs` Tier-B promotion for two more suites
(35/35), a goldfish/critic template hardening against silent turn-end
abandonment (the exact `long-dispatches-truncate` failure mode this same
sweep run itself hit for 8/17 agents — 4/4+36/36), and the missing
`intake-generate`/`bootstrap-bind` coordinator skill-reference doc. Plus 6
Triage-only re-triage/correction notes (stale-claim corrections, evidence
re-checks) and one doc-only workflow-dispatch policy addition. Closed with
fresh evidence: `orchestrator-authored-production-commits-have-no-
deterministic-control` (GIT-01/GG-22 confirmed live, 230/230; its
undelivered Part B split into its own item,
`2026-08-25-verify-range-mode-registration-for-orchestrator-commit-
control.md`), `guard-dispatch-fails-open-on-the-antigravity-subagents-
payload-shape`, `gwm-kernel-doc-enumeration-diverges-from-the-code-array`.
**One post-merge regression caught and fixed on the integrated tree**
(not present in any individual worktree): the new
`docs/human-authorization-inventory.md` doc was unclassified in
`governance/observation-doc-governance.json`'s inventory, tripping
`check-doc-contracts.test.mjs`'s observation-governance pass
(`OG-DOC-UNCLASSIFIED`) — fixed, 36/36 green (`02014041`). **Confirmed
still blocked, re-verified live rather than trusted from inheritance:**
`mp22-orchestrator-self-implementation-has-no-enforcement` (Sprint Alfred),
`regulated-document-hooks` (Sprint Phoenix HAW-E batch),
`session-keep-awake` + `afk-assumption-mode` (both bound to the Nova A
candidate freeze), `kickoff-promotion-cleanup-readback` (needs a dedicated
authorized pass touching `human-guard-override.mjs`/
`codex-pretool-guard.mjs`), `scratch-cleanup-mechanism` (points 1 and 3
remain genuinely open). Backlog ledger reconciled (`6d62f964`); security
scan and `check-backlog-state.mjs` both clean on the final tree; all 17
sweep worktrees removed. 25 commits landed this reconciliation pass.

**Pushed, 2026-08-26.** The two remaining chat-gate regressions from
`AGY-HGOFIX-2` are now closed. TP-6 (`guard-gate-strength.test.mjs`) and
TP-7 (`guard-testpath-override.test.mjs`) are Pipeline plugin source with
NO in-session override route at all — `pipeline-author-repair` mode is
structurally unreachable in this repo's self-application topology
(`plugins/pipeline-core` has no independent git toplevel of its own,
confirmed live); `repair-map.mjs` itself reports `command: (none)` for
`HGO-AUTHOR-ROOT-REQUIRED`. The PO applied the same `dependencies` seam
directly in their own terminal, outside this session, via a script this
session prepared with pre/post verification (`6f073ecf`); independently
re-verified here (36/36, 19/19, plus 76/76 and 127/127 no-regression
checks). A full `verify.mjs` run ahead of the push then caught a FOURTH,
previously-unflagged chat-gate regression the two prior dispatches never
covered: `codex-pretool-guard.test.mjs` (2 failures) arms its capability
via a real detached subprocess spawn of `guard-human-override.mjs`, which
can never satisfy an attended-terminal check by design — fixed by calling
the CLI's exported `main()` in-process instead, injecting the identical
test-only seam (`1a2dbb0a`). Also found and fixed: the machine-scoped
`poKeyDirectory` (`~/.agent-pipeline/machine.json`, outside repo scope)
still pointed at a stale key directory from 2026-08-10 that no longer
matches the pinned trust anchor — the code deliberately refuses to
auto-overwrite this once set (by design, prevents silent key-directory
swaps), so it needed explicit PO confirmation, given, then corrected by
hand. Full `verify.mjs` 385/385 green, security scan clean, push-prepare
fully green, PO signed via `authorize-critical` in their own terminal.
Pushed `origin/sprint_agy`: `2887e774..1a2dbb0a` (214 commits,
fast-forward). `pipeline-state.mjs approve-push` recorded the approval
before the push ran.

### Sentinel Links

Retained per `backlog/items/2026-07-20-spec-retention-on-close.md`,
enforced by `governance/spec-retention.json` + `check-spec-retention.mjs` —
keep linking all seven; do not prune (note carried over from the Phoenix
line's own checkpoint 71, see the history section below).

- specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md
- specs/2026-07-19-sprint-sentinel-epic/spec.md
- specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md
- specs/2026-07-19-sprint-sentinel-epic/public-private-reconciliation-design.md
- specs/2026-07-19-sprint-sentinel-epic/RECOVERY.md
- specs/2026-07-19-sprint-sentinel-epic/platform-support-contract.md
- specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md

---

## Phoenix-line history (superseded by the Nova line above — preserved in full, not deleted)

> **Nova is the active state.** Below is `sprint_phoenix`'s own handover
> exactly as it stood at that branch's last checkpoint (71, 2026-08-23)
> before this merge — kept in full per PO instruction, as HISTORY. Any
> "(READ THIS FIRST)"/"Next step" text inside it was live only on the
> Phoenix line; the "Current handover" section above is the live one now.
> Phoenix's own "Archived history" table and Sentinel-links list are
> already folded into the sections above, not repeated here.

**Last updated (Phoenix line):** 2026-08-23 (checkpoint 71)

---

