# Journal orchestration wiring scope: A-AC-01, A-AC-05, H-AC-08, L-AC-01

Scoping/design document only. No production code, `plugins/pipeline-core/hooks/hooks.json`, or
journal machinery is touched by this document or by the dispatch that produced it
(WP-WIRING-SCOPE). It answers, per criterion, WHERE in real orchestration the recording call
should fire and what the call site looks like. A separate, later, PO-approved wiring wave
executes against this design, the same shape of deferral `stop-suggest.mjs`'s header comment
already establishes as this repository's precedent ("a later bundled wiring wave (W-WIRE) adds
the Stop entry under one explicit PO-approved sentinel edit").

The four criteria's own acceptance-evidence-map notes (`specs/sprint-phoenix-epic/evidence/
acceptance-evidence-map.mjs`) independently confirm the shape/validation half of each is already
built and tested, and that the only open gap is "no code path emits/imports/calls it at all" —
this document closes that gap on paper, not in code.

## Shared building blocks (read, not modified)

- `plugins/pipeline-core/lib/agent-decision-journal.mjs` — `validateAgentDecisionEvent` (kinds
  `assumption`/`selection`/`verification-scope`/`fallback`/`escalation`; optional `identity` array
  scoped by `ADJ-IDENTITY-SCOPE` to `selection`/`escalation`/`fallback` only) and
  `validateLegacyImportObservationEvent` (kind `legacy-import-observation`, six closed
  `legacySourceClass` values, `authorityProofStatus` in `{unprovable, not-attempted}`).
- `plugins/pipeline-core/lib/governance-event-store.mjs` — `appendPortableGovernanceEvent`
  (async; resolves the physical repository root/fingerprint, loads the stream registry and
  capture policy, then does a locked, atomic append). This is the actual persistence step every
  call site below would need to reach, directly or through a thin wrapper.
- `plugins/pipeline-core/lib/external-command-offer.mjs` is the ONLY existing precedent for a
  "record + verify readback" wrapper (`recordCommandOffer` et al.), and it exists only for the
  `command-offer` kind. No equivalent wrapper exists today for plain `assumption`/`selection`
  events or for `legacy-import-observation` — a caller wiring A-AC-01/A-AC-05/H-AC-08 would call
  `validate*Event` then `appendPortableGovernanceEvent` directly, or the wiring wave would first
  build a thin wrapper mirroring `appendValidated`'s readback discipline. Noted here because it
  changes the shape of "just wiring" slightly for these three kinds versus command-offer; not
  itself new capability, since the pattern to mirror is already fully built.

## A-AC-01 — material assumption/selection, recorded before dependent action

> WHEN an agent declares a material assumption or selection, THE SYSTEM SHALL record its domain,
> status, selected option, stable reason codes, evidence basis/gaps, and revalidation trigger
> before dependent action where policy requires.

**Status note in the evidence map:** "record shape pinned; nothing enforces recording BEFORE
dependent action where policy requires" — i.e. the shape already carries every named element
(`kind` ~ domain, `state` ~ status, `candidateDigest` ~ selected option, `reasonCode` ~ stable
reason, `assumptionState` ~ evidence basis/gaps when epistemic, `supersedesEventId` ~ revalidation
trigger link). The only real gap is the caller and its timing.

**Scope of this section.** A-AC-01 as written covers any material assumption or selection an
agent declares — that is broader than one call site. This section scopes the one sub-case that
has a genuine, policy-loaded, machine-observable trigger today: a dispatcher's runner/model/role
**selection** at subagent-dispatch time (MP-05 already requires every dispatch to name its model
explicitly). Free-form "assumption" declarations made in prose (e.g. an Elephant reasoning
mid-session) have no single mechanical trigger in current orchestration and are NOT scoped here —
flagging that as a real, separate open question rather than forcing an answer.

**Proposed call site:** `plugins/pipeline-core/hooks/guard-dispatch.mjs`, top-level script body,
at the point after `dispatchFindings({ subagentType, prompt })` returns (line 51) and before the
`if (findings.length === 0) process.exit(0)` (line 52). This is a PreToolUse hook on the
`Task`/`Agent` tool — it runs, and must complete, before the subagent dispatch (the dependent
action) is allowed to proceed, which is exactly the ordering A-AC-01 requires.

**Moment in control flow:** after `role`/`findings` are computed, regardless of whether
`findings.length === 0` (compliant) or not (blocked) — a selection was made either way; recording
it is orthogonal to whether the briefing passed structural review.

**Data available at that point:** `subagentType` (raw tool input, e.g. `goldfish-implementor`),
`prompt` (the full briefing text, containing the "Model/effort for this run" and "Ruleset SHA"
lines per `templates/prompts/goldfish-task.md`/`critic-review.md`), `role` (`"critic"|"goldfish"|
"other"`, computed by `dispatchFindings`). Populating `validateAgentDecisionEvent`'s required
fields: `kind: "selection"`, `state: "declared"`, `reasonCode` (a new bounded code, e.g.
`DISPATCH-RUNNER-SELECTED`), `relatedHumanDecisionId: null`, `supersedesEventId: null|<id>`.
`candidateDigest` is NOT resolvable from the hook's current inputs (`toolInput` carries no commit/
tree) — see risk below.

**Status: HYPOTHESIZED (mechanism), VERIFIED (file content read; the exact 51/52 line pairing and
`dispatchFindings` signature are current as read for this document).** The mapping from "selection
was made" to a fully populated event is not yet a design decision the hook's existing code makes
for you.

**Risk/consideration:**
- `candidateDigest` (required, SHA-256) needs a "candidate" concept guard-dispatch.mjs does not
  currently resolve. It does zero filesystem/git access today (pure text matching on stdin JSON).
  The wiring wave must decide what "candidate" means for a dispatch-selection event — most likely
  the working tree's current HEAD via a deliberately added `git rev-parse HEAD` (mirroring
  `guard-push.mjs`'s own `sourceCommit`/`sourceTree` resolution) — and that is new, if small,
  capability, not free.
- `appendPortableGovernanceEvent` is async and does locked, multi-file work (registry, capture
  policy, atomic append). guard-dispatch.mjs today is synchronous and trivial. Adding a real
  append inline changes this hook's latency profile on every dispatch; per its own docstring
  ("FAIL-OPEN on anything it cannot parse... a broken hook must not become a work stoppage") any
  append failure must itself fail open (never block a dispatch on a journal write failure), which
  needs an explicit try/catch discipline this file does not have today.

## A-AC-05 — identity provenance/assurance, when identity is recorded

> WHEN runner, model, effort, profile, role, adapter, or capability identity is recorded, THE
> SYSTEM SHALL include its provenance and assurance.

**Proposed call site: the SAME site as A-AC-01** — `guard-dispatch.mjs`, same point after
`dispatchFindings` returns. `kind: "selection"` is in `IDENTITY_KINDS`
(`agent-decision-journal.mjs` line 8), so the identical event can carry an optional `identity`
array alongside the A-AC-01 fields. See "Collision / composition" below — this is deliberately
not drafted as an independent second call site.

**Data available for the identity array:** `dimension: "role"` — `role`/`subagentType` are
already computed strings. `dimension: "model"`/`"effort"` — present as free text somewhere in
`prompt`, but NOT already captured as a clean value: `NAMES_MODEL`
(`plugins/pipeline-core/lib/dispatch-policy.mjs` line 89) is deliberately an *existence* test, not
a capturing pattern bound to the "Model/effort for this run:" label — the file's own docstring
(lines 76-88) explains why an earlier, label-adjacent version was reverted (it cried wolf on a
compliant template field). Building an `identity.value` that both passes `ID` (`/^[A-Za-z0-9]
[A-Za-z0-9._:-]{0,127}$/`) and is actually the right substring requires new, more structured
extraction than exists in this file today.

**Status: HYPOTHESIZED.** The kind-eligibility (`selection` is in `IDENTITY_KINDS`) is VERIFIED
by reading `agent-decision-journal.mjs`; the actual value-extraction mechanism is not designed
here and does not exist yet.

**Risk/consideration:** `provenance`/`assurance` for a value read out of the dispatcher's own
prompt text should be `"reported"`, not `"verified"` or `"same-dispatch-observed"` — the hook
never independently confirms the subagent actually ran with that model, only that the dispatcher
claimed it. Misclassifying this as `"verified"` would overstate the record's own assurance,
which `IDENTITY_ASSURANCE`'s enum exists precisely to distinguish.

## H-AC-08 — legacy record imported as unverified observation

> WHEN a legacy approval/override/deploy record cannot prove its original authority tuple, THE
> SYSTEM SHALL import it only as an unverified observation that cannot satisfy a gate.

**Proposed call site:** `plugins/pipeline-core/scripts/migrate-backlog-state.mjs`,
`applyBacklogMigration` (line 95), specifically alongside `baselineEvents` (line 64-84) — every
legacy Markdown backlog item under `backlog/items/` becomes one baseline transition event written
to `backlog/transitions.ndjson`. This function's own recorded `reason` text is already, verbatim,
an admission of exactly what H-AC-08 describes: *"Record the pre-existing legacy backlog status
during canonical ledger migration; no implementation or closure is claimed."* This maps directly
onto `legacySourceClass: "backlog-transition-record"` — one of the six closed
`LEGACY_SOURCE_CLASSES` (`agent-decision-journal.mjs` line 15) — and it is the ONE class of the
six for which a concrete, already-built importer function exists in this repository today; the
other five (`mutable-approval-state`, `guard-override-jsonl-record`, `deployment-approval-log`,
`override-receipt`, `release-change-evidence`) have no equivalent importer and are out of scope
for this call site.

**Moment in control flow:** inside `applyBacklogMigration`, after `baselineEvents(loaded.items,
plan.commit, at)` produces the per-item transition events (currently written only to
`backlog/transitions.ndjson`) and before the function returns `{ ...plan, wrote: true }` (line
110) — one `legacy-import-observation` event per migrated item, alongside its baseline transition
event, not instead of it.

**Data available:** per item (`readLegacyItems`, line 34-62): `path` (e.g.
`backlog/items/2026-...-slug.md`, already validated against the same shape `SOURCE_PATH`
requires — no leading slash, no `..` segments), `source` (the raw legacy Markdown text, from
which a `sourceReferenceDigest` = SHA-256 of `source` can be computed the same way
`external-command-offer.mjs`'s `recordPrivateHandoffCommitment` already digests `detail`), and
`plan.commit` (the full 40-hex baseline commit OID, resolved via `git rev-parse HEAD` at line 89
— already present, no new git call needed here unlike the guard-dispatch.mjs site above).
`authorityProofStatus`: `"not-attempted"` is the honest value — the migration explicitly does not
attempt to reprove the original legacy approval's authority tuple; `"unprovable"` would overclaim
that an attempt was made and failed. `candidateDigest` (required on the base shape, SHA-256, not
the git OID pattern) would need to follow whatever convention this codebase already uses to
digest a commit-scoped candidate elsewhere (see `governance-event.mjs`'s `canonicalSha256`) —
not invented fresh here.

**Status: VERIFIED.** `migrate-backlog-state.mjs` was read in full for this document; the
`applyBacklogMigration`/`baselineEvents` control flow, the `reason` text, and the available
per-item fields are all confirmed against current file content, not assumed from the briefing.

**Risk/consideration:** `applyBacklogMigration` is documented as "one-time" (it refuses to run if
`backlog/transitions.ndjson` already exists, line 99) and already has a rollback path on partial
failure (lines 111-119) that restores every written file to its pre-migration content. Any added
`appendPortableGovernanceEvent` call must be included in that same rollback discipline — a
journal event that survives a rolled-back migration would itself be a stale, dangling record.

## L-AC-01 — nine event kinds projected through the closed lifecycle schema

> WHEN dispatch, status, cancellation, candidate change, verification, review, gate, recovery, or
> reconciliation produces a material event, THE SYSTEM SHALL project it through a closed lifecycle
> schema.

This criterion's nine kinds map onto TWO call sites, not one, because they cover disjoint parts
of orchestration.

**Call site 1 — `plugins/pipeline-core/scripts/pipeline-state.mjs`, `writeState`
(line 590-644).** This is the single compare-and-swap chokepoint every state-mutating subcommand
already funnels through (dispatch, status transitions, cancellations, candidate changes,
verification/review/gate recordings, recovery, reconciliation — the file defines
`CONTINUITY_SUBCOMMANDS`, `PUBLICATION_SUBCOMMANDS`, `AUTHORITY_REVISION_SUBCOMMANDS`,
`FEATURE_PACKAGE_READ_SUBCOMMANDS`/`FEATURE_PACKAGE_WRITE_SUBCOMMANDS` — read as line-number
anchors only, not enumerated field-by-field here). `writeState` already accepts an `options`
object with two existing callback hooks, `options.transition` and `options.beforeCommit`
(line 601, 610) — the natural, minimal-surface design is a third, symmetrical
`options.lifecycleEvent(nextState, written)` callback invoked only after a successful commit
(after `atomicWriteContinuityState` returns, line 637), so each of the dozens of call sites across
this 6,727-line file supplies its own kind/correlation mapping without duplicating the
append-and-readback logic at every one of them.

**Status: VERIFIED (chokepoint mechanism) — the exact per-subcommand kind mapping is explicitly
NOT enumerated here (HYPOTHESIZED/not attempted).** `pipeline-state.mjs` is 6,727 lines; reading
`writeState` and locating its two existing callback hooks was done directly against current file
content, but enumerating which of the file's dozens of subcommands maps to which of L-AC-01's nine
kinds is real design work the wiring wave itself should do, not something a budget-bounded scoping
pass over a file this size can responsibly hand-wave here.

**Call site 2 — `plugins/pipeline-core/hooks/guard-push.mjs`, the terminal aggregation point
(line 1750: `if (failures.length === 0) process.exit(0); // all-green -- allow`).** This is the
push GATE's own pass/fail decision — `kind: "gate"`. `sourceCommit`/`sourceTree` are already
resolved and in scope at this point in the file (confirmed used together at line 1728:
`candidate: { commit: sourceCommit, tree: sourceTree }`, in the existing external-push-ledger
check) — this is a direct, already-present match for `validateLifecycleGovernanceEvent`'s required
`candidate: { commit, tree }` shape (`OID` pattern, line 85 of `lifecycle-governance-events.mjs`).
`state`: `"completed"` when `failures.length === 0`, `"failed"` otherwise.

**Status: VERIFIED.** `guard-push.mjs` was read at its terminal aggregation region (lines
1700-1754) for this document; the `failures.length === 0` chokepoint and the pre-existing
`sourceCommit`/`sourceTree` availability at that point are confirmed against current file
content, not assumed.

**Risk/consideration (both sites, and specific to guard-push.mjs):** the lifecycle schema's
`correlation` object requires FIVE non-null ID-pattern strings (`packageId`, `dispatchId`,
`attemptId`, `workerId`, `correlationId`) plus a `queueRevision` integer
(`lifecycle-governance-events.mjs` line 84) — a shape that assumes an active package/dispatch/
attempt/worker continuity context. `pipeline-state.mjs`'s subcommands mostly operate inside
exactly that context (continuity revisions, feature packages). `guard-push.mjs`, however, is a
git-level hook that can fire for a human-initiated `git push` entirely outside any active pipeline
dispatch — for those pushes, four or five of the five required correlation strings may have no
real value to populate. The wiring wave needs an explicit decision here (e.g. a reserved sentinel
correlation for "no active continuity," or scoping the guard-push.mjs "gate" event to only fire
when a continuity context IS present) — this document does not resolve it, because resolving it
is a design choice with real behavioral consequences, not a mechanical wiring fact.

## Collision / composition

1. **A-AC-01 and A-AC-05 collide at `guard-dispatch.mjs`.** Both are scoped to the same call
   site, the same moment, and (for A-AC-05) the same event — not two independently drafted
   sections that would conflict if built together. The proposed composition: ONE `kind:
   "selection"` `agent-decision-journal` event per dispatch, always carrying the A-AC-01 base
   fields, and carrying the optional `identity` array (A-AC-05) whenever the wiring wave has
   confidently extracted a clean model/effort/role value from the prompt — never fabricating an
   identity entry rather than omitting it when extraction is unreliable, since `identity` is
   optional at the key level precisely so partial confidence can omit the field rather than
   assert a wrong one.
2. **L-AC-01 spans `pipeline-state.mjs` and `guard-push.mjs` without conflicting** — they cover
   disjoint kind subsets (state-mutation kinds vs. the push `gate` kind specifically) and neither
   call site's proposed shape contradicts the other's. They should, however, share one
   design decision if built in the same wave: whether a `guard-push.mjs` "gate" event, when it
   DOES have an active continuity context available (a push that followed a pipeline dispatch),
   correlates back to that same `dispatchId`/`packageId` chain `pipeline-state.mjs` already wrote
   — rather than each site inventing its own, disconnected correlation identity for what is, in
   that case, actually one continuous story.
3. **H-AC-08 does not collide with the other three** — `migrate-backlog-state.mjs` is a distinct,
   one-time script with no other criterion's call site nearby.

## Verified vs. hypothesized summary

| Criterion | Call site file | Status |
|---|---|---|
| A-AC-01 | `guard-dispatch.mjs` | HYPOTHESIZED (file read and current; extraction/append mechanism not designed) |
| A-AC-05 | `guard-dispatch.mjs` (same site) | HYPOTHESIZED (kind-eligibility VERIFIED; value extraction not designed) |
| H-AC-08 | `migrate-backlog-state.mjs` | VERIFIED (file read in full; control flow and fields confirmed) |
| L-AC-01 | `pipeline-state.mjs` (chokepoint) | VERIFIED mechanism / HYPOTHESIZED per-subcommand kind mapping |
| L-AC-01 | `guard-push.mjs` (gate) | VERIFIED (terminal aggregation region read; fields confirmed present) |

## Bundled vs. separate wiring wave

One bundled wave, not four independent ones. Three of the four call sites
(`guard-dispatch.mjs`/A-AC-01+A-AC-05, `guard-push.mjs`/L-AC-01) touch guardrail-tier hook files
that this repository already treats as a single trust boundary requiring one coordinated,
PO-approved `hooks.json` edit per the `stop-suggest.mjs` precedent this briefing points at, and
the fourth (`pipeline-state.mjs`'s `writeState` callback) is itself a shared chokepoint whose
correlation identity the guard-push.mjs site should ideally reuse (composition point 2 above) —
building them in separate, uncoordinated waves risks exactly the kind of drift point 2 warns
about, where two sites invent two different correlation identities for what should be one
continuous dispatch-to-push story. H-AC-08's `migrate-backlog-state.mjs` site is the one genuine
exception: it is a standalone, already-isolated one-time script with no shared chokepoint or
correlation dependency on the other three, so it could ship alone without losing anything — but
there is no cost to bundling it either, since it needs no coordination with the others to be
correct.
