# Backlog sprint-mapping and prioritization — 2026-08-11

Follow-up to `2026-08-11-pareto-triage-report.md`. PO instruction: before
prioritizing the 88 (now 87, after the DACL item's separate closure)
STILL-OPEN-REAL items, first check whether each belongs to an already-closed
or not-yet-reached sprint's scope ("sicherstellen, dass sie aber nicht zu
issues von sprints gehören die erledigt sind oder noch kommen - dann offen
lassen aber besser zugeordnet"). Delegated to 6 parallel `general-purpose`
agents, same date-range batches as the original triage, each producing a
CLOSED-SPRINT-RESIDUE / FUTURE-SPRINT / LOOSE (Category + Priority)
breakdown. Investigation only — no file edits, no status changes.

This file accumulates results as each batch reports back.

---

## Batch 1 — 2026-07-25 → 2026-08-06 (10 items, 4 closed-sprint-residue, 2 future-sprint, 4 loose)

**Closure-status disclosure:** `specs/2026-07-24-sprint-cyborg-epic`,
`specs/2026-07-26-claude-runner-onboarding`, and
`specs/2026-08-02_nova-human-authorization` carry no `result.md` and no
closure record reachable in `docs/state.md` (likely rotated out of its
rolling window). Mappings below rest on each item's own cited source
finding plus named landed fix commits/ADRs, not a formal sprint-closure
document.

### CLOSED-SPRINT-RESIDUE

- `2026-07-27-recovery-preview-ack-unstable-getter-poisons-replay-ledger.md`
  — Cyborg sprint, package CYB-A0 (`specs/2026-07-24-sprint-cyborg-epic`,
  handed to Nova via `nova-backlog-handover.md`) — the round-1 fix
  (`c7546a4`) that CYB-A0 delivered moved this exact code block without
  stabilizing the read; only surfaced by a round-2 Critic re-review after
  that fix landed, so CYB-A0's closure never covered it.
- `2026-07-27-runtime-projection-v2-eager-manifest-load.md` — Claude-runner-onboarding
  sprint (`specs/2026-07-26-claude-runner-onboarding`), Critic finding F4 —
  F4's fix (`894261d`) was deliberately scoped to `runtime-projection-v3.mjs`
  only; the implementer explicitly flagged the identical pattern in sibling
  `v2.mjs` as out of scope, asked for a follow-up item.
- `2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md` —
  ADR-0055 (accepted, landed 2026-08-06) — ADR-0055's own Follow-up section
  names this exact item by filename, states it "closes only the push half,"
  leaving PRD/plan-approval binding out.
- `2026-08-02-unified-human-authorization-ux.md` — ADR-0055/ADR-0056
  (accepted, landed 2026-08-06) — push/deploy migration onto the shared
  Ed25519 proof contract is delivered, but the design authority
  (`specs/2026-08-02_nova-human-authorization/design-input.md`) explicitly
  scopes the shared contract to remote push/deploy/publication only, states
  no remote app/provider/IAM/passkey/hardware-key adapter is delivered by
  this extension — publication unification, adapter inventory,
  adoption-enforcement, Passkey/WebAuthn remain real, never-assigned
  residue.

**Flagged finding (bears on `2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`, not a re-triage):**
that item's own Proposal Step 3 ("should PRD approval get the same Ed25519
treatment as push/deploy") is recorded as an open PO call (Triage dated
2026-08-06). But `specs/2026-08-02_nova-human-authorization/design-input.md`,
dated 2026-08-02 — three days *before* this item was even filed — already
records the PO requiring the human-proof adapter to cover "only genuine
external-effect gates, not ordinary chat-based plan and implementation
decisions," and PRD requirement HAO-3: "Plan/design/review and other
non-final gates SHALL retain chat approval and SHALL NOT require an
external signer." This holds *if* `pipeline-state.mjs approve-plan` is the
"plan/design/review" gate HAO-3 refers to (the item's own text treats this
as true; not independently confirmed here). If so, the item's own open
question may already be answered and nobody cross-referenced the two
documents — flagged for PO confirmation, item not reclassified.

### FUTURE-SPRINT

Both map to the same target: **Nova B Slice B7 — `.arbitheon/` authority
directory (ADR-0054)**, admitted to Nova B by PO instruction 2026-08-08,
"implementation staged." A staged, not-yet-started slice of the *current*
Nova B epic, not a separate later sprint — already scheduled.

- `2026-08-05-claude-dir-leftovers-defeat-runner-neutral-project-migration.md`
  — Nova B Slice B7 — the item's own narrowed remaining scope (repoint 5
  files to the resolved authority tier) is exactly Slice B7's step-1.
- `2026-08-06-neutral-authority-tier-is-a-frozen-snapshot-the-compiler-never-updates.md`
  — Nova B Slice B7 — its own Triage cross-references `docs/state.md`'s
  "deferred to 0.5.3 / ADR-0054 steps 2–4... staged and NOT started" entry;
  its remaining step 3 is Slice B7's step 2/3 verbatim.

### LOOSE

- `2026-07-25-managed-onboarding-success-contract.md` — **testing gap /
  onboarding** — **Medium** — a rejection-only test can hide a broken
  onboarding flow behind a green suite (already happened once, the 0.4.4
  hotfix); no standing rule yet requires the success-contract test for
  future host-layout additions.
- `2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md` —
  **onboarding / runner parity** — **Medium** — Claude lacks the adoption
  hint Codex has, forcing manual marketplace registration that already
  produced a related, separately-filed defect; explicitly deferred by the
  PO pending its own PRD/Spec.
- `2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md`
  — **security / supply-chain attestation** — **High** — attestation on a
  now-live install path only hashes this checkout, never the external
  marketplace root the install command resolves through; a repointed/mutated
  external root would pass attestation unnoticed.
- `2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md` —
  **testing gap / quality-gates process** — **High** — the same structural
  blind spot already let a push-gate fail-open regression ship past 245
  green Verify suites (caught only by an independent Critic); no systemic
  gate-walk/remediation-executability framework exists beyond the two
  hand-picked instances already fixed.

**Batch 1 summary:** 10 total (11 STILL-OPEN-REAL minus 1 excluded, the
DACL item), 4 closed-sprint-residue, 2 future-sprint, 4 loose (2 High, 2
Medium, 0 Low).

---

## Batch 2 — 2026-08-10 → 2026-08-11 (11 items, 0 closed-sprint-residue, 1 future-sprint, 10 loose)

**Method note:** for every item, checked (1) `issue-acceptance-matrix.md` +
`nova-a.md`/`nova-b.md` (current sprint), (2) the item's own Triage/source
text for explicit sprint references, (3) a keyword sweep across all closed
sprint directories for each item's core concern. No sweep found a closed
sprint that had explicitly claimed an item's concern as done — some
near-misses were topically adjacent only (e.g. the 0.4.5 onboarding sprint
explicitly lists "Git identity setup" as a **non-goal**, ruling it out as
residue rather than confirming it).

### CLOSED-SPRINT-RESIDUE

None found in this batch.

### FUTURE-SPRINT

- `2026-08-11-backlog-ledger-baseline-migration-commit-unreachable.md` —
  Nova A **#57 canonical reconciliation** (current sprint, row still open,
  not an unstarted future sprint) — the matrix's own Disposition (row 38)
  claims `check-backlog-state.mjs` runs green as of 2026-08-06 and lists
  `backlog-state-check` as registered in Verify; this item's own evidence
  (`git cat-file -e` exit 1 on the shared baseline-migration commit for all
  38 ledger events) proves that claim currently false — belongs to #57's
  remaining work, not unassigned backlog.

### LOOSE

- `2026-08-10-preimage-repin-disclosure-incomplete-for-roles-critic.md` —
  **Critic/review infrastructure hygiene** — **Low** — disclosed,
  non-blocking; neither masked stale pin is registered in `verify.mjs`, no
  candidate gate affected.
- `2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`
  — **plugin packaging/build** — **Medium** — leaves hosted/consumer
  projects structurally unable to satisfy "dispatch from template, never
  freehand" until a synced build step lands; stopgap copy already shipped,
  remaining risk is silent drift.
- `2026-08-10-no-rename-path-for-a-feature-id-continuity-already-fixed.md` —
  **continuity/lifecycle** — **Low** — PO explicitly deferred; GF-099
  already closes the path that creates this situation going forward.
- `2026-08-10-docs-state-md-sync-ignores-calibration-configured-handover-path.md`
  — **handover/docs sync** — **Medium** — reproduces the exact
  stale-handover defect GF-090 was built to close, only for non-default
  `calibration.handover` paths.
- `2026-08-10-compare-three-parallel-happy-path-tests-in-detail.md` —
  **testing/forensics idea** — **Low** — a comparison exercise the PO
  explicitly deferred, not a confirmed defect.
- `2026-08-10-prd-spec-depth-collapses-relative-to-design-input.md` —
  **kickoff/design dialogue quality** — **High** — PO states this is a
  systemic, recurring pattern across ~10 kickoff/planning tests and
  effectively all Pipeline GitHub Issues to date; degrades the foundational
  planning artifact for every governed project.
- `2026-08-10-git-identity-ask-step-unreachable-through-live-cli-path.md` —
  **onboarding/git-identity** — **Medium** — the shipped fix (GF-103) is
  correct but structurally unreachable through the real onboarding CLI
  path, so a fresh session will likely still hit the original bug.
- `2026-08-10-happy-path-turn-and-wall-clock-cost-is-not-externally-defensible.md`
  — **turn/wall-clock cost** — **High** — PO explicitly filed this as a
  distinct, higher-priority concern: a trivial happy path costing ~2 hours
  is "not yet externally defensible."
- `2026-08-10-agent-never-asks-po-for-key-directory-invents-one-instead.md`
  — **push/approval setup UX** — **High** — the agent silently
  invents/guesses the directory meant to hold the PO's signing-key material
  during a security-sensitive setup step instead of stopping to ask.
- `2026-08-11-benchmark-fixture-digest-binding-does-not-cover-executed-workload-code.md`
  — **benchmark/evidence integrity** — **Low** — the Critic itself scoped
  this as minor and already mitigated (candidate commit/tree binding
  transitively pins the workload bytes); #8/Nova A3's own remaining gaps
  are NVA-A8-5 and candidate-freeze, not this.

**Batch 2 summary:** 11 total, 0 closed-sprint-residue, 1 future-sprint, 10
loose (3 High, 3 Medium, 4 Low).

---

## Batch 5 — 2026-08-08 part A, items 1-24 alphabetical (17 items, 0 closed-sprint-residue, 0 future-sprint-only, 2 current-sprint-tracked, 15 loose)

**Taxonomy note (added bucket):** two items are tracked by name in the
*current* sprint (a plan artifact or an active Triage decision cites them)
but that isn't "closed" or "future" — added a fourth bucket,
**CURRENT-SPRINT-TRACKED**, rather than force these into LOOSE (false: they
have a named owner) or FUTURE-SPRINT (false: work has already
started/landed partially).

### CLOSED-SPRINT-RESIDUE

None found. All nine closed-sprint directories predate every item's
`created: 2026-08-08` date, so none can reference them by name; checked the
strongest subject-matter candidate anyway
(`specs/2026-07-26-claude-runner-onboarding/spec.md`, `Status: implemented`)
for the two items closest in subject — no match on any onboarding-flow
terms, its accepted scope doesn't cover either.

### FUTURE-SPRINT

None found as a sole classification (the one item with a genuine
future-sprint pointer, "Nightwing," also has current-sprint work already
scheduled — see CURRENT-SPRINT-TRACKED).

### CURRENT-SPRINT-TRACKED

- `2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md`
  — Nova, `specs/sprint-nova-epic/plans/nova-setup-bootstrap.md` — a real
  plan exists (`Status: design, PO-approved... Not implemented`), citing
  this item by path, implementing its narrow-gauge machine/repo split; the
  item's own "full field taxonomy" remainder is explicitly deferred to a
  named future sprint, **Nightwing**. Stays open — plan written, not built.
- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` —
  Nova, this item's own Triage — `Decision: accepted` (2026-08-11), actively
  worked this session as the canonical tracking item
  (`NOVA-CLOSING-ALLOWANCE-01` landed since this batch was dispatched — see
  main `docs/state.md`).

### LOOSE (15)

- `2026-08-08-a-bounded-diagnostic-outside-the-repo-is-refused-under-the-wrong-reason.md`
  — **guard diagnostics/messaging** — **Medium** — misleads agents
  (especially unattended ones reading their own background-job logs) into
  fruitless remediation; an over-refusal (fail-closed), not a bypass.
- `2026-08-08-a-briefings-model-field-can-contradict-the-agent-it-dispatches.md`
  — **dispatch process / model discipline** — **Medium** — produces a false
  audit record read as evidence of which model did the work, undermining
  MP-05 verification even though execution was correct in the observed case.
- `2026-08-08-a-dispatch-reported-creating-a-record-it-never-created.md` —
  **dispatch report integrity** — **High** — a report falsely claimed to
  have written a trust-infrastructure file; caught only because a Critic's
  fail-closed boundary happened to require that exact reference — the first
  observed case of a report containing a statement untrue of the
  filesystem, not merely a truncation.
- `2026-08-08-a-git-repository-appears-although-the-plan-said-it-would-not.md`
  — **onboarding disclosure accuracy** — **Low** — item's own text: "the
  severity is genuinely low... trivially reversible and harms nothing."
- `2026-08-08-a-guard-reclassification-changed-what-a-signature-can-lift.md`
  — **guard override reachability** — **Low** — structurally narrow
  (descriptor-2/null-device only), an equivalent command without the
  redirect was already liftable before the change — a measurement/audit gap
  in the differential probe, not a newly opened hole.
- `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md` —
  **verify-gate / testpath guard (TP-3)** — **High** — structurally forces
  any block adding test coverage to leave it unregistered and invisible to
  Verify — the same failure mode already filed separately
  (`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`).
- `2026-08-08-a-maintenance-window-signature-is-voided-by-an-unrelated-file-write.md`
  — **push/approval ceremony (ADR-0058/0061)** — **Medium** — fails safe but
  actively breaks the maintenance-window ceremony under the Pipeline's own
  recommended parallel-dispatch pattern; uncovered by its three landed
  Critic rounds.
- `2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`
  — **guard/lifecycle recoverability** — **High** — a write the guard
  *admits* leads to a readiness class with no agent-executable exit and (on
  a fresh repo) no commit to restore to — only exit observed was a human
  typing a manual fix.
- `2026-08-08-an-agent-talks-itself-out-of-the-pipeline-and-starts-before-the-answer.md`
  — **onboarding consent process** — **High** — an agent's own stated
  consent boundary is violated in the same turn it is stated — governed
  work starts before the human has actually consented.
- `2026-08-08-an-authority-gate-is-bypassable-by-choosing-a-different-write-tool.md`
  — **guard/lifecycle enforcement gap** — **High** — `guard-testpath`
  (TP-5), classified authority-bearing (GL-09), is entirely unwired from the
  `Bash|PowerShell` matcher, so any dispatch can walk around it — exercised
  on the first attempt by a well-behaved dispatch.
- `2026-08-08-approved-but-not-implementing-refuses-every-write-and-asks-for-nothing.md`
  — **lifecycle phase-transition UX (guard-devplan)** — **Medium** — fails
  safe but costs a full dispatch round every occurrence with no decay,
  nothing prompts the required `set-phase --phase implementation` step.
- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md`
  — **onboarding runner-neutrality** — **Medium** — mechanisms A/B/C
  already resolved (`94b8a72`); stays open solely for one remaining call
  site, explicitly handed to a sibling item
  (`2026-08-08-runner-neutrality-must-hold-before-a-third-runner-lands.md`)
  — narrow scope, fix pattern already exists.
- `2026-08-08-no-design-to-implementation-handover-exists.md` —
  **lifecycle handover / dispatch enforcement** — **High** — the lifecycle
  goes silent exactly at the design→implementation boundary; observed
  consequence was an orchestrator self-implementing a feature with no
  dispatch and no transition recorded at all.
- `2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`
  — **docs/repo-layout governance** — **Medium** — `type:
  workflow-improvement`, not `defect`; mostly hygiene, but one of its six
  instances (gate-defeating potential) is filed separately, so it doesn't
  raise this umbrella item's own rating.
- `2026-08-08-orchestrator-authored-production-commits-have-no-deterministic-control.md`
  — **git/commit-authorship control (GIT-01/GIT-03)** — **High** — two
  lifecycle rules enforced only by a Critic reading history after the
  commit exists; the exact pattern recurred nine minutes after a commit
  that had just acknowledged it, on a security-relevant file.

**Batch 5 summary:** 17 total, 0 closed-sprint-residue, 0 future-sprint
(sole), 2 current-sprint-tracked, 15 loose (7 High, 6 Medium, 2 Low).

---

## Batch 3 — 2026-08-09 (15 items, 1 closed-sprint-residue, 1 future-sprint, 13 loose)

### CLOSED-SPRINT-RESIDUE

- `2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal.md`
  — `2026-07-27-agent-pipeline-0.4.7-hotfix` / issue `047-HOV` (Attended
  one-action guard override, AC-047-41–47, delivering
  `human-guard-override.mjs`/`guard-human-override.mjs`/the central Codex
  guard adapter, marked "Implemented" and closed) — the closure validated
  the override's own internal correctness but its acceptance criteria never
  scoped whether the fallback should fire when the underlying guard already
  supplied agent-executable recovery text; confirmed a residual gap, not an
  explicit deferral (0.4.7-hotfix's own "Deferred work and non-claims"
  section does not list this item).

### FUTURE-SPRINT

- `2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery.md`
  — Nova B / `NVA-B61-7` (`issue-acceptance-matrix.md:70,72-77` names
  exactly this failing acceptance outcome) — stays open because Nova B has
  not started: entry gate (accepted Nova A Result + explicit PO activation)
  is unmet, `nova-b0` deliberately not dispatched. (Note: the item's own
  text cites "#57/NVA-B61-7" — #57 is actually the unrelated Nova A1
  canonical-reconciliation issue; only NVA-B61-7 is the real match.)

### LOOSE (13)

- `2026-08-09-the-security-scan-looks-for-its-license-allowlist-in-the-pipelines-own-repository.md`
  — **security gate / consumer-project fit** — **High** — makes the
  `security` gate structurally unsatisfiable for every consumer project
  (hardcoded Pipeline-repo-relative allowlist path), reports the failure as
  a generic scanner error rather than "not configured."
- `2026-08-09-elephant-writes-production-code-directly-without-a-goldfish-dispatch.md`
  — **dispatch process** — **High** — a core governance safeguard was
  silently bypassed with zero technical detection; caught only because the
  PO happened to notice live.
- `2026-08-09-agents-read-the-pipelines-source-because-nothing-describes-its-interface.md`
  — **onboarding/discoverability** — **Medium** — measured ~40 of 114
  commands in one run spent rediscovering the CLI surface from source; real
  efficiency drag, not correctness/security.
- `2026-08-09-project-reset-does-not-classify-the-proof-policy-artifact.md`
  — **onboarding hygiene** — **Low** — item's own text confirms the
  leftover is fail-closed (can only make a later `approve-push` MORE
  restrictive, never less).
- `2026-08-09-two-minor-happy-path-retries-in-the-final-codex-run.md` —
  **onboarding/discoverability** — **Low** — item's own text: "this is the
  guard system working as designed, not a defect."
- `2026-08-09-what-the-claude-greenfield-run-adds-to-the-happy-path-findings.md`
  — **onboarding/discoverability** — **Medium** — priced on the still-open
  sub-points only (late language-gate firing, authority-staleness ordering,
  no git-identity onboarding); the `--help` sub-point is already fixed.
- `2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection.md`
  — **onboarding/discoverability** — **Medium** — ~17 minutes and 8
  guard-level errors before any implementation starts, entirely
  documentation-completeness gaps in already-correct enforcement.
- `2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md`
  — **runner/tooling config (Codex-side)** — **Low** — item's own text:
  primarily Codex CLI's own behavior, "may not be actionable from the
  Pipeline side at all."
- `2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript.md`
  — **restart/continuity design** — **Low/deferred** — already carries a
  PO-recorded Triage decision (2026-08-10, "Deferred, not declined")
  pending a live Codex retest — not a fresh prioritization call.
- `2026-08-09-restart-resume-hint-write-misses-the-project-prefix.md` —
  **guard UX / messaging** — **Medium** — a cheap, well-scoped fix whose
  absence let one real restart lose the human's actual project intent
  entirely.
- `2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`
  — **dispatch/authorship evidence integrity** — **High** — found
  independently by three separate Critic rounds across twenty commits;
  authorship entirely self-reported with nothing external verifying it.
- `2026-08-09-critical-push-signing-ceremony-gives-no-path-feedback.md` —
  **push/approval ceremony UX** — **Medium** — a wrong subcommand guess or
  missing path confirmation forces a manual `ls`/polling fallback, wasting
  time on a critical-path ceremony without defeating any gate.
- `2026-08-09-critical-human-proof-policy-seeded-without-trust-anchor.md` —
  **push/approval — trust-anchor security** — **High** — signature mode
  currently accepts any well-formed externally supplied proof key, not
  specifically the PO's own, defeating the core purpose of the check.

**Methodology note:** two items (the CLOSED-SPRINT-RESIDUE item and
`critical-push-signing-ceremony-gives-no-path-feedback`) share one root
mechanism (the 047-HOV human-override fallback) — only the item whose own
Direction section names files 047-HOV actually delivered is filed as
residue; the other's defect is a different file outside that closed scope
and stays LOOSE/prioritized rather than being silently dropped as a
duplicate.

**Batch 3 summary:** 15 total, 1 closed-sprint-residue, 1 future-sprint, 13
loose (4 High, 5 Medium, 4 Low).
