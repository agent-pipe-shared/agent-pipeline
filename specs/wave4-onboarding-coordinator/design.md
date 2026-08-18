# Wave 4 — atomic bootstrap-from-intake onboarding coordinator (design)

**Status:** design (not implemented) · **Date:** 2026-08-18
**Package convention:** `specs/<safe-feature-id>/` per ADR-0045.
**Origin:** `backlog/items/2026-08-18-fresh-repo-onboarding-intake-first-transaction.md`
(Triage, 2026-08-18) — PO explicitly chose the item's own Option 1 (the full
six-step coordinator) over the analyst's sequenced/deferred recommendation.
Folds in two subsumed siblings: `2026-08-18-lossless-pre-restart-checkpoint.md`
and `2026-08-18-intake-values-restart-resilient-immediately.md`.

This document is a design, produced by a read-only design dispatch
(NVA-W4-DESIGN-ONBOARDING). It does not modify
`onboarding-continuity.mjs`/`project-onboarding-v3.mjs`/`resume-hint.mjs`; it is
grounded in their current code (paths/line numbers cited below are as read
2026-08-18, HEAD `0dcb169373c924f219b2067dda28868b0d8d6c29`) and is meant to be
directly implementable without further design decisions, except where a
sub-point is explicitly flagged UNRESOLVED / needs implementation-time
verification.

## 0. Core strategic choice (governs sections a/c/d)

The current two-phase model has two transactions:
`applyOnboardingKickoff` (writes 5 provisional targets — state, handover, prd,
spec, history — from a 160-byte goal, `onboarding-continuity.mjs:4734`) then
`applyOnboardingKickoffPromotion` (the sole authority-binding transaction,
`onboarding-continuity.mjs:5000`, writing state/history/handover/cleanupBinding
as an already-atomic, already-fault-tested 4-target CAS transaction, taking
caller-supplied `prdPath`/`specPath`/`designInputPath` as already-authored
files).

This design's central move: **keep the promotion transaction's shape as the
sole authority-binder (step 5 below), and replace the *kickoff* half — the
part that self-creates a provisional bound-looking pre-state — with a new,
purely private, restart-resilient intake checkpoint (steps 1–3) plus a new,
idempotent, unbound staging-generation step (step 4) that produces the real
PRD/spec/design-input the promotion-shaped binder then consumes.** The binder
itself (`applyOnboardingKickoffPromotion`) is reused near-verbatim, fed
newly-generated paths instead of PO-hand-authored ones, rather than
reimplemented. This is deliberate: sections (c) and (d) below both depend on
inheriting that function's already-hardened crash-safety and its three
already-fixed defects, rather than re-deriving or accidentally
re-diverging from them.

`kickoff`/`kickoff promote` as CLI verbs are **retired for fresh repositories**
and replaced by a new `intake-*` / `bootstrap-bind-*` subcommand family (§a.4).
They are **not deleted** — §e covers why.

---

## (a) Schema — checkpoint, authority states, six-step sequence

### a.1 Intake checkpoint — schema and location

**Location:** the SAME private, restart-resilient, plugin-owned state
directory kickoff already resolves via `resolvePrivate()` /
`resolveOnboardingPrivateState()` (`codex-onboarding-runtime.mjs`, imported at
`onboarding-continuity.mjs:54`), where `continuity-history.json` and
`session-cleanup-binding.json` already live
(`onboarding-continuity.mjs:106-109`). Per ADR-0063's kinds table, this is
"Plugin-owned private runtime state" (home `.git/agent-pipeline/**` and
sibling plugin-declared private paths) — never a workspace path an agent
writes directly. New basenames, alongside the existing ones:

- `intake-checkpoint.json` — the checkpoint itself.
- `intake-checkpoint-evidence/<sha256>.txt` — one file per lossless,
  sanitized material-input blob (content-addressed; §a.2 explains why full
  text lives here rather than in the checkpoint or the resume card).
- `.intake-checkpoint.lock` — same writer-lock discipline as
  `.kickoff-writer.lock` (`onboarding-continuity.mjs:4805`).

**Schema (`pipeline.onboarding-intake-checkpoint.v1`):**

```
{
  schema: "pipeline.onboarding-intake-checkpoint.v1",
  root: <realpath the checkpoint is bound to>,
  revision: <integer, incremented on every accepted write — the CAS
    discriminator this file's own beforeSha256/afterSha256 convention uses
    everywhere else>,
  createdAt: <ISO>, updatedAt: <ISO>,
  consent: { granted: true, at: <ISO> } | null,
  values: {
    gitAuthor: { name, email } | null,
    language: "de" | "en" | null,
    profile: "epic" | "feature" | "mini" | null,
  },
  materialInput: [
    { sha256, evidencePath: "intake-checkpoint-evidence/<sha256>.txt",
      byteLength, receivedAt: <ISO> }, ...
  ],
  designQuestions: [
    { question, answer, answeredAt: <ISO> }, ...
  ] | null,               // null until the ONE bundled round is asked
  transactionState:
    "collecting" | "design-questions-pending" | "ready-to-generate"
    | "generated" | "bound",
  generated: null | { designInputSha256, prdSha256, specSha256, generatedAt },
  contentSha256: <sha256 of the object above, minus this field — same
    self-digest convention as resume-hint.mjs's buildResumeHint()>,
}
```

Each write is a single-target atomic write (`writeExclusiveSynced` +
temp-file + `renameSync` + `fsyncDirectory`, the same primitive
`onboarding-continuity.mjs` already uses for every other private-state file —
see §c.1). The checkpoint is the **single source of truth**; nothing else
(resume card, staging files) is authoritative over it.

**Why full material input is NOT resume-hint-shaped:** resume-hint.mjs caps
context at `RESUME_HINT_MAX_BYTES = 4096` across four ~480-byte fields
(`resume-hint.mjs:9,13`) — by design, for a *public, git-tracked, sanitized*
card. The checkpoint is private (never committed, `.git/agent-pipeline/**`),
so it is not bound by that cap; it stores the PO's real ≥10 KB input
losslessly, one evidence file per received chunk, addressed by digest. The
resume card (§a.3) keeps pointing at this content by path+SHA only, exactly as
the `lossless-pre-restart-checkpoint` sibling's own Proposal specifies
("resume card should thereafter reference only that file's path and SHA").
"Sanitized" here means: evidence files are written verbatim (this is private,
gitignored, machine-local storage, not a git-tracked artifact resume-hint.mjs
must defend), but the design recommends reusing resume-hint.mjs's existing
`FORBIDDEN_SHAPES`/`secretAssignment` filters as a best-effort scrub before
persisting evidence bytes, purely as defense-in-depth against the checkpoint
directory later being copied somewhere less private by a future change — not
because the private location itself requires it today.

### a.2 Restart-resilient values (subsumes `intake-values-restart-resilient-immediately`)

`values.gitAuthor` / `values.language` / `values.profile` are each written to
the checkpoint **immediately upon being answered**, one field at a time
(single-target atomic write, `revision` incremented), not deferred to a
resume-hint capture. Git identity: **held in the checkpoint until the first
commit** (the sibling item's own second option), not set repository-locally
immediately — this avoids a partially-configured `.git/config` becoming yet
another provisional, pre-authority artifact the coordinator would need to
reason about superseding.

### a.3 Resume-card reference (subsumes `lossless-pre-restart-checkpoint`)

`resume-hint.mjs`'s schema (`RESUME_HINT_SCHEMA = "pipeline.resume-hint.v1"`)
needs one **additive** field, following the exact precedent already set for
`progress` (`resume-hint.mjs:14-26`, NVA-BL-72: "additive and OPTIONAL, never
required... cannot become a fifth required key"). Proposed: an optional
`intakeCheckpoint: { path, sha256 }` sibling to the existing `basis` field
(not folded into `basis`, whose `validBasis()` shape at
`resume-hint.mjs:77-81` is closed to `{featureId, planSha256, specSha256}` and
must stay that way — this is a genuinely new, independent reference, not a
widening of an existing closed shape). A restart barrier populates this field
from the checkpoint's current path+`contentSha256` before firing; the
following session reads it, resolves the checkpoint by path, verifies the
digest, and resumes `transactionState` from there — no re-pasting, no
re-asking already-answered values. This is a schema evolution to
`resume-hint.mjs`, not a code change performed by this design dispatch.

### a.4 Provisional-vs-bound authority states (`v4Inspection` status)

| `transactionState` (private, checkpoint-internal) | Public `v4Inspection` status (new or reused) | What exists on disk | Publicly bound? |
|---|---|---|---|
| (no checkpoint) | `intake-required` (**new**, replaces `kickoff-required` for genuinely fresh repos) | nothing | no |
| `collecting` | `intake-required` | checkpoint only | no |
| `design-questions-pending` | `intake-design-questions-required` (**new**) | checkpoint only | no |
| `ready-to-generate` | `intake-design-questions-required` (until step 4 runs) | checkpoint only | no |
| `generated` | `bootstrap-binding-required` (**new**) | checkpoint + `project/.onboarding-staging/{design-input.md,prd_<id>.md,spec.md}` | **no** — staging is explicitly unbound, freely regenerable (§a.5, §c.2) |
| `bound` | `ready` (existing) | `specs/<id>/` package + `pipeline-state.json`/calibration/handover point at it | **yes** |

This satisfies proposal step 6 directly: there are **no provisional kickoff
artifacts** in the new flow at all (not even unbound ones) until step 4, and
even step 4's staging output is explicitly named, located outside `specs/`,
and never treated as authority by any consumer until step 5 binds it — so
"strictly unbound/replaceable staging data" is the literal on-disk shape, not
just a stated intent.

### a.5 The six-step sequence, mapped onto new CLI subcommands

Modeled on the existing `ONBOARDING_SUBCOMMANDS` table shape
(`project-onboarding-v3.mjs:62-86`) — plan/apply pairs, `mutates` and
`automatedArgvShape` declared per entry so `guard-lifecycle-ready.mjs`'s
allowlist derivation (`automatedLifecycleArgvCommands()`) covers the new
commands the same mechanical way it already covers every existing one
(GUARDDERIVE-1).

1. **`intake-consent-apply`** (mutates) — captures consent + any still-missing
   required values (git author/language/profile) in one bundled ask; writes
   `consent` and whichever `values.*` fields were answered. Idempotent: safe
   to re-run, only fills fields still `null`.
2. **`intake-capture-apply`** (mutates) — appends one material-input chunk as
   a new evidence file + `materialInput` entry. Called once per PO message
   containing requirements; restart-resilient by construction (§a.2/§c.1).
3. **`intake-design-questions-apply`** (mutates) — writes the ONE bundled
   design-question round's answers into `designQuestions`, flips
   `transactionState` to `ready-to-generate`.
4. **`intake-generate-plan` / `intake-generate-apply`** — plan/apply pair
   (mirroring every other command in the table) that reads the checkpoint,
   deterministically derives `design-input.md`/`prd_<id>.md`/`spec.md`
   staging bytes, writes them under `project/.onboarding-staging/`, and sets
   `generated`. See §c.2 for why this needs no new fault-injection stages.
5. **`bootstrap-bind-plan` / `bootstrap-bind-apply`** — plan/apply pair that
   is, in implementation, a **thin adapter over
   `planOnboardingKickoffPromotion`/`applyOnboardingKickoffPromotion`**: same
   `profile`/`featureId`/`planPath`/`prdPath`/`specPath`/`designInputPath`
   inputs, sourced from the staging paths instead of caller-supplied ones, and
   run with `plan.kickoff` describing "no prior kickoff" (a null/absent
   `kickoff` predecessor) rather than a real kickoff revision — this is the
   one shape difference the implementation must add: `buildKickoffPromotionPlan`
   currently assumes a kickoff predecessor exists (`recognisedKickoff()` /
   `seed` check, §c.3); the new caller needs a validated "coordinator-sourced,
   no predecessor" branch alongside it, not a replacement of the existing one.
6. Consequence of (1)–(5): no provisional kickoff artifacts are ever written
   for a fresh repo. `applyOnboardingKickoff`/`kickoff-plan`/`kickoff-apply`
   are simply never called by this path (§0, §e).

---

## (b) Write-permission carve-out — exact file set and mechanism

**Settled constraint (PO, 2026-08-18, not open for debate):** the files below
must be writable before the general readiness gate
(`requireProjectOnboardingReady` / `GUARD-LIFECYCLE-NOT-READY`,
`guard-lifecycle-ready.mjs:2242,2320-2336`) is satisfied, because onboarding is
what *produces* readiness. Named exactly, nothing wider:

**Set 1 — CLI-invoked writes (the bulk of steps 1–5).** These are not direct
Edit/Write targets; every existing onboarding write already runs as
`node .../project-onboarding-v3.mjs <subcommand> --activate ...` under Bash.
For a Bash-invoked command, the operative guard mechanism is **not** a
per-path Edit/Write carve-out — it is the already-existing "sanctioned
lifecycle command" allowlist that `evaluateAfterGrammarAdmission()` checks
BEFORE raising `GUARD-LIFECYCLE-NOT-READY`
(`guard-lifecycle-ready.mjs:2320-2323`, `isSanctionedLifecycleCommand`),
derived from `ONBOARDING_SUBCOMMANDS` via `automatedLifecycleArgvCommands()`
(GUARDDERIVE-1). **The carve-out is: add the six new subcommand names from
§a.5 to `ONBOARDING_SUBCOMMANDS`** (`intake-consent-apply`,
`intake-capture-apply`, `intake-design-questions-apply`, `intake-generate-plan`,
`intake-generate-apply`, `bootstrap-bind-plan`, `bootstrap-bind-apply`, plus
their plan-side siblings for the mutating ones), each with an explicit
`mutates`/`automatedArgvShape` declaration exactly like every existing entry —
this is the SAME mechanism already in place, extended by table rows, not a
new guard code path. No other file in `guard-lifecycle-ready.mjs` needs to
change for this set.

The files these commands write, so the "exact file set" is stated plainly
rather than left implicit in "whatever the CLI does":

- `<privateOnboardingDir>/intake-checkpoint.json` (+ `.tmp`, `.lock`)
- `<privateOnboardingDir>/intake-checkpoint-evidence/<sha256>.txt`
- `project/.onboarding-staging/design-input.md`
- `project/.onboarding-staging/prd_<id>.md`
- `project/.onboarding-staging/spec.md`
- The existing promotion target set, reused unchanged by step 5:
  `project/pipeline-state.json` (or the resolved calibration/state path),
  the configured handover path, `<privateOnboardingDir>/continuity-history.json`,
  `<privateOnboardingDir>/session-cleanup-binding.json` — already writable
  exclusively by the onboarding CLI's own apply transactions today
  (`protectedStateWriterOnly()`, `guard-lifecycle-ready.mjs:2445-2448`); this
  design does not widen that.

**Set 2 — direct agent Edit/Write (steps that need the *session*, not the
CLI, to write).** Exactly one path, and it is **already carved out, not new**:
`project/.resume-hint-input.json` (`RESTART_RESUME_HINT_INPUT_PATH`,
`guard-lifecycle-ready.mjs:126`, admitted by
`isRestartResumeHintInputWrite()`). §a.3's `intakeCheckpoint` field is an
additive schema field on the object written to this SAME path — the guard's
admission check is path-only (`resolve(root, filePath) === join(root,
RESTART_RESUME_HINT_INPUT_PATH)`, `guard-lifecycle-ready.mjs:1088`), so it
does not need to change at all for the new field to be admitted; only
`resume-hint.mjs`'s schema validator needs the additive-field change from
§a.3.

**Explicitly excluded from any new carve-out:** the intake checkpoint and its
evidence files are **never** a direct agent Edit/Write target — single-writer
discipline, CLI-only, matching the existing rule for `continuity-history.json`
("the only writer of that path in the whole plugin",
`onboarding-continuity.mjs:136-138`). Widening Set 2 to cover the checkpoint
directly was considered and rejected: it would let an agent bypass the CAS/
revision discipline in §a.1/§c.1 by writing malformed or non-atomic content
directly, which is exactly the class of risk the single-writer rule already
exists to close elsewhere in this file.

---

## (c) Crash-safety

**Overall confidence: high for steps 1–3 and step 5 (reuse of already-proven
primitives); high-with-one-explicit-open-item for step 4 (new, but
deliberately designed to need no new fault-injection surface); one
verification item flagged rather than asserted (see c.4).**

### c.1 Steps 1–3 (checkpoint writes) — reuse the general single-target primitive

Every checkpoint write (consent, one value, one material-input chunk, the
design-question round) is a **single-target** write. The file already uses
this exact primitive for `continuity-history.json` and
`session-cleanup-binding.json`: `writeExclusiveSynced()` (temp file,
`O_EXCL`, `fsyncSync`, `renameSync`, `fsyncDirectory` —
`onboarding-continuity.mjs:4570-4589`) plus the same
`.lock`/`acquireLock()`/`releaseLock()` writer-lock discipline
(`onboarding-continuity.mjs:4598-4693`), keyed to a token derived from the
checkpoint path rather than a plan digest. This is **not** the 5-target
`KICKOFF_FAULT_STAGES` transaction — it is the SAME building block that
transaction is built FROM, applied to one target instead of five, so it
inherits the same per-write atomicity (a crash mid-write leaves either the old
committed content or nothing; never a torn file) without needing an
enumerated multi-stage fault list of its own. `revision`/`contentSha256`
give it the same CAS-drift detection every other target in this file already
has (compare-before-write, refuse silently-diverged preimages).

**Restart-resilience is structural, not a resume-hint capture:** because
steps 1–3 write to the checkpoint immediately (§a.2), a restart never loses
already-answered values or already-captured material input — there is nothing
transient to lose. The resume card (§a.3) only needs to point at where the
checkpoint already durably is; it does not carry the payload.

### c.2 Step 4 (staging generation) — justified case for NOT extending `KICKOFF_FAULT_STAGES`

Requirement (c) permits either reusing/extending the existing 15 stages or
"making an explicit, justified case for a different but equivalently rigorous
crash-safety mechanism." This is that case: staging generation is designed to
be a **pure, deterministic, idempotent function of the checkpoint's own
`contentSha256`** — write-if-different, content-addressed against the source
checkpoint revision it was generated from. A crash mid-generation leaves
either a stale/partial staging directory (detected on the next `inspect` by
comparing `generated.designInputSha256`/etc. — or their absence — against a
fresh re-derivation from the current checkpoint) or nothing; either way the
next session's `intake-generate-apply` call **always safely re-derives and
overwrites** staging from the checkpoint, because nothing downstream has
consumed staging as authoritative yet (§a.4 — staging is never bound). This
is equivalently rigorous to fault-injection testing *for this specific step*
because the recovery property fault-injection exists to prove — "a crash at
any point still leaves the system in a state that can safely reach a correct
end state" — holds by construction (idempotent regeneration) rather than by
enumerated-stage testing. The implementation MUST still add ordinary
crash-injection tests asserting this idempotency claim (mid-write kill,
re-run, assert convergence) — that is a normal test-authoring obligation for
the implementation dispatch, not a gap in this design.

### c.3 Step 5 (binding) — direct reuse, one structural addition named explicitly

`bootstrap-bind-apply` reuses `applyOnboardingKickoffPromotion`
(`onboarding-continuity.mjs:5000-5145`) unchanged: same lock acquisition
(state lock + private lock, same tokens), same four-target CAS algebra
(state/history/handover/cleanupBinding — `currentTarget()`/`exactPreimage`/
`recoverPrefix` at `:5032-5068`), same ordered publish (history → cleanup
binding → handover → state-as-commit-point, with `deps.crashAt` hooks at each
boundary: `promotion-history-published`, `promotion-cleanup-binding-published`,
`promotion-handover-published`, `promotion-state-published` — all four
directly observed in the code read for this design), same
post-commit-only supersession publish
(`publishKickoffSupersession`, best-effort, non-blocking, `:5139`).

**One structural addition, named so it is not silently assumed:**
`buildKickoffPromotionPlan`/`validatePromotionPlan` currently validate a
`plan.kickoff` predecessor and call `recognisedKickoff(observed, spawn)`
(`:5070-5072`) to confirm a real prior kickoff seed exists before treating an
"exact preimage" as legitimate. The coordinator's call has no such
predecessor by construction (§0 — no provisional kickoff was ever written).
This needs a validated **"coordinator-sourced" plan variant** — `plan.kickoff:
null` (or an equivalent explicit marker) — with its own preimage check
(there is no pre-existing state/history/handover to compare against at all,
so the "exact preimage" branch becomes "the four targets are absent", not
"they equal a recognised kickoff's postimage"). This is a genuine, scoped
code change to the promotion plan/apply pair's validation branch — not a
reuse-for-free — but it is additive (a new admitted branch beside the
existing kickoff-sourced one, never removing or loosening the existing
kickoff-sourced validation) and it inherits every other line of the
already-hardened transaction unchanged.

### c.4 Explicitly flagged — NOT resolved with full confidence, do not assert past this

The four `deps.crashAt` hooks observed in §c.3 are the **commit-boundary**
crash points (after each target's rename, before the next target's write
starts). `KICKOFF_FAULT_STAGES` (`onboarding-continuity.mjs:182-198`) is a
**finer-grained**, enumerated 15-stage list for `applyOnboardingKickoff`
specifically (temp-fsync, rename, AND directory-fsync as three separate
injectable stages per target, across 5 targets). Within this design
dispatch's reading budget (the promotion function and its surrounding test
file were not read in full — only the ~340-line window containing the
function body), **I could not confirm whether `applyOnboardingKickoffPromotion`
has an equivalently fine-grained per-boundary fault-injection test suite of
its own, or only the four coarser commit-boundary hooks directly observed.**
This matters because §c.3 leans on promotion's crash-safety being
"already-hardened" at the same granularity kickoff's is. **Required
implementation-time step, stated explicitly rather than assumed:** before
relying on reused promotion machinery as step 5's complete crash-safety story,
the implementation dispatch must (i) read `onboarding-continuity.test.mjs`'s
promotion-crash coverage in full, (ii) if it is narrower than
`KICKOFF_FAULT_STAGES`' per-target-per-boundary granularity, extend
`applyOnboardingKickoffPromotion` with the missing temp-fsync/rename/
directory-fsync `crashAt` hooks per target (an explicit, permitted extension
under requirement (c)'s "reusing/extending those stages" option), and (iii)
add the corresponding tests. This is named here as an open item per the
stop-condition instruction — not asserted as already-safe.

---

## (d) Prior-incident coverage

All four are **closed** under the current two-phase model (verified by
reading each item's own closure block, 2026-08-18). The risk this design must
manage is **regression** — a reimplemented binding transaction could easily
reintroduce any of these, since three of the four are specifically about the
promotion transaction's contract. The concrete mechanism preventing that is
§0's core choice: reuse `applyOnboardingKickoffPromotion`, do not
reimplement it.

1. **`2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md`** —
   root cause: promotion and the PO plan gate had *independently evolved,
   contradictory* readings of what `activeFeature.planPath` must be
   (`planPath === specPath` vs. `planPath` must be a `prd_*.md`). Fixed;
   closure evidence `po-gate-authority.test.mjs`. **Prevented by:** step 5
   reuses the ALREADY-FIXED `applyOnboardingKickoffPromotion`/
   `po-gate-authority.mjs` contract verbatim — there is exactly one binder,
   not two independently-maintained components that could re-diverge. The
   implementation dispatch should add one differential/regression test
   asserting the coordinator's generated `planPath` satisfies the plan
   gate's current contract, as a named regression guard (not performed by
   this design dispatch).
2. **`2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`**
   — root cause: an admitted Edit/Write against a *bound* PRD/Spec/design-input
   dropped session readiness with no recovery route. Fixed:
   `GUARD-LIFECYCLE-AUTHORITY-BOUND` refusal, generic to "a bound PRD, Spec,
   or design input" (`boundAuthorityDocumentPath()`,
   `guard-lifecycle-ready.mjs:2449-2452`), not kickoff-specific. **Prevented
   by:** this design's staging→bound transition (§a.4) is exactly the moment
   `pipeline-state.json`'s `activeFeature`/authority pointers start existing —
   which is what the generic check keys on — so the newly-authored
   `specs/<id>/` documents inherit this protection automatically the instant
   step 5 commits, with no new guard code. Before that (staging state), the
   documents are deliberately NOT yet recognised as bound, so free
   re-generation during steps 1–4 (design-question answers changing the
   generated PRD, say) is not blocked by this same refusal — the design must
   not accidentally trip it early, and reusing the existing bound-detection
   logic (keyed on committed `pipeline-state.json`, which step 5 alone
   writes) keeps that boundary exactly where it already is.
3. **`2026-08-08-no-design-to-implementation-handover-exists.md`** — root
   cause: post-promotion, V4 inspection's `nextAction` went to `null` with no
   guidance toward `set-phase --phase implementation`. Fixed (general
   phase-transition guidance layer, not kickoff-specific).
   **Prevented by:** step 5 sets the initial bound `phase` using the SAME
   mechanism promotion always has (this design does not introduce a new
   initial-phase value or bypass the existing guidance layer), so the fix is
   inherited automatically rather than needing to be re-derived.
4. **`2026-08-09-the-promotion-supersedes-the-handover-and-leaves-it-saying-otherwise.md`**
   — root cause, directly on point: the two-phase split let promotion commit
   without refreshing the handover or the runtime language it had frozen at
   kickoff time, because promotion originally had no handover target at all.
   Fixed by adding `handover` as a 4th CAS target to
   `PROMOTION_TARGET_KEYS`/`applyOnboardingKickoffPromotion`
   (`onboarding-continuity.mjs:131-141`, code comment there names this exact
   incident by its symptom). **Prevented by:** this is the strongest of the
   four, structurally — the new design captures `language`/`gitAuthor`/
   `profile` exactly ONCE in the checkpoint (§a.1/a.2) and there is no earlier
   partial-binding write for a later step to fail to refresh (unlike
   kickoff's separate goal-time write); AND step 5 reuses the
   ALREADY-CARRIES-A-HANDOVER-TARGET promotion function verbatim, so the
   specific defect (a promotion with no handover target) cannot recur because
   the function being reused no longer has that shape.

---

## (e) Migration story — deliberate choice, not a silent default

**Recommendation: dual-track by repository state, with a stated retirement
condition — not "new repos only, silently."**

- **Repos with a completed promotion (bound authority already exists).**
  Unaffected, no action needed. `v4Inspection` already reports `ready` (or an
  ongoing-work status); such a repo is already past onboarding by definition
  and never reaches this coordinator's subcommands. The overwhelming majority
  case.
- **Repos with only a completed-but-superseded provisional kickoff directory**
  (the existing `SUPERSEDED.md`-marked leftover, `onboarding-continuity.mjs:164-167`).
  Inert historical cruft already, unaffected by this design; nothing to
  migrate.
- **Repos caught mid-kickoff at ship time** (kickoff-apply already ran —
  provisional state/handover/prd/spec/history exist — but kickoff-promote has
  not): the ONLY genuinely open case, and the one the backlog item's own Risk
  #4 flags as unaddressed by any of its three options. **This design's
  answer:** keep `kickoff-plan`/`kickoff-apply`/`kickoff-promote-plan`/
  `kickoff-promote-apply` and their full existing machinery (§0, the 15-stage
  harness, `KICKOFF_SUPERSESSION_BASENAME`) **alive and unchanged**, but
  **remove them from `v4Inspection`'s offered next-action for a genuinely
  fresh (never-kickoff'd) repo** — a fresh repo is routed into `intake-*`
  exclusively (§a.4's `intake-required` status); a repo `v4Inspection`
  recognises as already mid-kickoff (`recognisedKickoff()`,
  `onboarding-continuity.mjs:5071`, already exists and already detects this)
  keeps being routed to `kickoff-promote-*` to finish the transaction it
  already started, under the OLD contract.
  - **Named consequence, stated rather than hidden:** such a repo does NOT
    retroactively gain this design's lossless-intake benefit — its
    provisional PRD/spec were captured from the old 160-byte goal, not a full
    checkpoint, and promoting it via the old path does not change that. This
    is an accepted, narrow, time-bounded loss (only affects repositories that
    ran `kickoff-apply` in the window between today and this coordinator's
    ship date), not a systemic gap.
  - **Stated retirement condition, not performed here:** once no live
    in-flight kickoff is observed for a stated number of releases (or by
    direct confirmation no such repo exists), a follow-up dispatch removes
    `kickoff-plan`/`kickoff-apply`/`kickoff-promote-*`, their fault-injection
    tests, and `KICKOFF_SUPERSESSION_BASENAME`/`publishKickoffSupersession`
    entirely. This design does not schedule or perform that removal; it names
    it as the deliberate end-state so it is not silently dropped, per ADR-0063
    §Consequences' own convention for stating deferred obligations explicitly.
  - **Explicit, named consequence of keeping both tracks alive:** real,
    ongoing dual-maintenance weight — two onboarding transaction shapes
    coexist until the retirement condition above is met. The backlog item's
    own "Estimated complexity: large" already priced in a large surface; this
    design makes the SHAPE of that cost explicit (a bounded, named
    deprecation window) rather than leaving it implicit.

---

## Open items for the implementation dispatch (do not silently resolve, carry forward)

1. §c.4 — verify `applyOnboardingKickoffPromotion`'s existing crash-injection
   granularity against `KICKOFF_FAULT_STAGES`' per-boundary standard; extend
   if narrower, before relying on it as step 5's complete crash-safety story.
2. §a.5 step 5 / §c.3 — implement the "coordinator-sourced, no kickoff
   predecessor" validated branch in `buildKickoffPromotionPlan`/
   `validatePromotionPlan`, additive beside the existing kickoff-sourced one.
3. §a.3 — implement the additive `intakeCheckpoint: {path, sha256}`
   resume-hint schema field (schema version bump discipline per the existing
   `progress`-field precedent).
4. §a.4 — the three new `v4Inspection` status names (`intake-required`,
   `intake-design-questions-required`, `bootstrap-binding-required`) are this
   design's proposal; the implementation dispatch may refine naming but
   should preserve the three-state distinction (collecting vs. questions
   vs. generated-unbound) since §a.4's table is what makes proposal step 6
   verifiable.
5. §d.1 — add the named plan-gate-contract regression test for the
   coordinator's generated `planPath`.
6. §e — the retirement condition for the old kickoff/promote track is named
   but not scheduled; needs its own follow-up backlog item once this
   coordinator has shipped.
