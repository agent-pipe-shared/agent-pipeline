---
schema: "pipeline.backlog-item.v1"
id: "pipeline.execution-model-switchback"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-19"
closed_at: "2026-08-28"
closure_repository: "self"
closure_commit: "42256fd63d80670303506cefba3a04c64df94260"
closure_evidence: "backlog/items/2026-07-19-execution-model-switchback.md"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Closed 2026-08-28 by PO scope narrowing; candidate-binding out of scope."
---

# pipeline.execution-model-switchback

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.execution-model-switchback` — "open, partial";
desired/actual reconciliation and post-compact requests exist
(`lib/main-session-route.mjs`, `lib/interaction-continuity.mjs`,
post-compact hook + tests), but "real main-session attestation remains
missing." Remaining sanctioned gate: "candidate-bound host attestation
and drift/return-request evidence."

**Decision:** accepted as a real, still-open gap — **not dispatched
this pass.** "Real main-session attestation" needs an actual
observable mechanism for confirming a session genuinely returned to
its main/desired execution route (not merely a code-reachability
proof), which is design latitude a briefing this session did not have
time to scope precisely enough to hand to a goldfish without risking a
vague, re-doable dispatch. Queued as a design-then-implement package,
same tier as `2026-07-19-codex-plugin-validator-host-parity.md`'s
host-parity design gap. **Assignment:** pipeline, unassigned pending a concrete
attestation-mechanism design decision. **Date:** 2026-08-18

### Investigation/Implementation, 2026-08-18 (wave 2, dispatch NVA-W2-1)

**Method:** re-read the item's own text plus every file it names, live
against `7eca44ca5c954e3a6a9ca7fd0f5fa845ab88a13e`, and traced who calls
what, rather than trusting the Triage's characterization. Result: the
Triage's "real main-session attestation remains missing" is confirmed,
but the mechanism gap is sharper and the design space narrower than a
generic "needs a mechanism" reads.

**Confirmed current state (evidence, not inference).**

1. `plugins/pipeline-core/lib/main-session-route.mjs`
   (`reconcileMainSessionRoute`) is a pure reconciliation kernel: it
   compares a *desired* route (from the runner-profiles-v3 registry)
   against a caller-supplied `observed` object, and its own doc comment
   is explicit that "a requested profile route is policy, not identity
   evidence" and "a child/dispatch receipt can never satisfy this
   boundary." It performs zero I/O and **produces no observation
   itself** — it only validates the shape of one handed to it
   (`observedMainSession()` requires `subject === "main-session"`,
   `source === "host-introspection"`, a `SAFE_ID` `eventId`, a known
   `runner`, and non-empty string `modelId` **and** `effort`).
2. The only production caller is
   `plugins/pipeline-core/hooks/post-compact-reground.mjs`
   (`mainSessionRouteProjection()`), which reads
   `input.pipelineMainSessionRoute.observed` straight off the
   SessionStart hook's own stdin JSON and passes it through unchanged.
   Its own comment says "A host adapter may provide one separately
   under pipelineMainSessionRoute" — i.e. it assumes a producer exists
   elsewhere. **No such producer exists anywhere in this repository.**
   A repo-wide search for `pipelineMainSessionRoute` (source, not test)
   returns exactly this one read site; nothing constructs or writes
   that key into real hook stdin. In live use today the hook therefore
   always evaluates `reconcileMainSessionRoute` with
   `observed: null`, which — correctly, per its own contract — always
   returns `MSR-UNVERIFIED`. The whole reconciliation path is
   currently **inert by construction**, not merely under-tested; this
   matches `main-session-route.test.mjs` and
   `post-compact-reground.test.mjs`, both of which only ever construct
   the `observed` object by hand as a fixture.
3. `plugins/pipeline-core/lib/interaction-continuity.mjs` is unrelated
   to attestation — it is pure message-classification/continuity
   policy (informational vs. additive vs. decision vs. control-change)
   and never touches route or model identity. It is correctly cited by
   the Triage as adjacent shipped work, not as part of the missing
   piece.
4. The nearest existing precedent for "evidence a route actually ran"
   is `plugins/pipeline-core/lib/route-receipt.mjs` +
   `scripts/route-receipt.schema.json`, used for **dispatched child**
   runs, not the main session (the exact boundary
   `main-session-route.mjs` says a child receipt cannot cross). Reading
   it end to end: it is *also* a pure validator — it checks a receipt
   against a `trustedEvidence` object with `source: "host" | "cli"`,
   but never sources that evidence itself; the caller must already hold
   it. `docs/adr/0036-runner-honest-profiles-v2.md` states this
   explicitly for the adjacent usage-envelope work: "These contexts
   require a trusted local caller but do not provide cryptographic
   provider attestation." This is the accepted trust ceiling already in
   production elsewhere in this codebase — non-cryptographic,
   self-policing, local-caller-trusted evidence is an *accepted class*
   here, not an automatic disqualifier for a design.
5. The only genuine host-originated *model-identity* signal found
   anywhere in the codebase is `model.display_name` / `model.id` in
   the statusLine JSON, read by
   `plugins/pipeline-core/scripts/statusline-context.mjs`
   (`resolveModelName()`). That script's own header, however, states
   three disqualifying facts for using it as attestation evidence
   as-is: (a) "the exact Claude-Code statusLine stdin JSON shape could
   not be independently confirmed from any file already in this repo"
   — the field names are a defensive guess, never validated against a
   real host; (b) "`.claude/settings.json`'s `statusLine` field is
   untouched here on purpose" — the script is **not wired live** yet
   (tracked as its own pending item, TP-4/W-WIRE-2); (c) it captures
   only a model name, never an effort/thinking-budget level. A
   repo-wide search for any host-provided "effort" signal (Claude
   statusLine, Codex `codex-session-start-hint.mjs`, Codex app-server
   `turn.completed` usage handling in `runner-usage-v1.mjs`) returns
   nothing — no CLI surface in this codebase exposes a runtime
   reasoning-effort value at all, for either runner. `main-session-route.mjs`'s
   `observedMainSession()` hard-requires a non-empty `effort` string;
   inventing one from the desired/requested route instead of a real
   observation would silently smuggle policy back in as if it were
   evidence — exactly the failure mode the module's own doc comment
   forbids ("a requested profile route is policy, not identity
   evidence") and exactly what ADR-0036 separately rejected for usage
   fields ("Normalizing missing usage fields to null or numeric zero:
   rejected because it would pretend an observation").

**Design implication.** A concrete, buildable mechanism to the *same*
trust ceiling already accepted in this codebase (local-caller-trusted,
not cryptographic) is plausible in principle: persist a per-session
evidence file (analogous to `.claude/.usage-<session_id>.json`,
already gitignored/regenerated machine state) written from a real,
periodically-firing host-driven hook invocation (statusLine, once
TP-4 wires it live and its real field names are confirmed against an
actual host, not assumed), keyed by `session_id` + a monotonic
tick/eventId, and read by `post-compact-reground.mjs`'s
`mainSessionRouteProjection()` to build the `observed` object it
already knows how to validate. That closes gap #2 above. It does
**not** close gap #5: there is currently no way to honestly populate
the required `effort` field from any host signal for either runner,
for any mechanism variant considered. Any design that ships without
resolving that is not "real main-session attestation" as scoped by
this item's own text — it is model-identity attestation with a forced
or fabricated effort value, which is a materially smaller and
differently-honest claim than what the item asks for.

There is also a structural, not merely missing-wiring, limitation
worth naming explicitly rather than deferring silently: nothing in
either CLI's hook architecture, as currently understood from this
repo's own code and comments, distinguishes a script invocation that
the real host triggered on its own schedule from the same script
invoked manually by the agent's own Bash tool with hand-crafted stdin.
`route-receipt.mjs`/ADR-0036 already accept this ceiling for dispatched
child routes ("requires a trusted local caller"); a main-session design
built to the same standard is consistent with existing practice, but
it is worth stating in the same place the design is proposed, not
assumed silently, since "host-introspection" as a label reads stronger
than "local caller, self-policed" actually is.

**Decision: design-only, no implementation this dispatch.** The
briefing's own escape valve ("implement only if the design converges
cleanly on something small and unambiguous") does not apply here. A
correct implementation touches: (a) `statusline-context.mjs`
live-wiring (TP-4, its own separate pending item, with its own
PO-sentinel-edit requirement) plus confirming its real stdin field
names against an actual host — not something this dispatch can verify
from a worktree; (b) a new evidence writer/reader module + schema,
mirroring the `route-receipt.mjs` pattern but for the main session; (c)
wiring that reader into `post-compact-reground.mjs` (and any other
SessionStart-adjacent site that should reconcile mid-session, not only
post-compact); (d) an explicit, PO-visible decision on how — or
whether — to represent `effort` at all given no host signal for it
exists, which is a product decision, not an engineering one; (e) a
threat-model note stating the local-caller-trusted (non-cryptographic)
ceiling honestly, in the same place the mechanism is described. That
is a genuine multi-file, multi-surface design-and-implement package,
not a small unambiguous patch — implementing a slice of it here would
either leave `effort` fabricated (dishonest evidence, the exact
failure this item exists to prevent) or leave the mechanism half-wired
and untestable against a real host from this worktree. Zero production
code changed.

**Recommended next steps for a future dispatch (in order):**
1. PO decision: how to represent (or explicitly not attest) `effort`
   absent any host signal — options include leaving `effort` as a
   fixed `"unknown"` sentinel distinct from a real observation (would
   need a `main-session-route.mjs` contract change, since
   `observedMainSession()` currently requires a non-empty *real*
   value), narrowing this item's scope to model-identity-only
   attestation with `effort` explicitly out of scope, or finding a
   host signal not yet discovered.

   **Decided 2026-08-19 (PO):** narrow scope to model-identity-only —
   `effort` stays explicitly out of scope for this item; no
   `main-session-route.mjs` contract change, no fabricated value. A
   future item may revisit `effort` if either runner ever exposes a
   real reasoning-effort signal.
2. TP-4: wire `statusLine` live and empirically confirm its real field
   names against an actual running host (not the defensive guess
   `statusline-context.mjs` currently ships with).
3. Build the evidence writer/reader module + schema (route-receipt.mjs
   pattern) and wire it into `post-compact-reground.mjs`.
4. Add the threat-model note stating the local-caller-trusted ceiling
   explicitly, alongside the mechanism description.

**Files read (no changes):** `plugins/pipeline-core/lib/main-session-route.mjs`,
`plugins/pipeline-core/lib/main-session-route.test.mjs`,
`plugins/pipeline-core/lib/interaction-continuity.mjs`,
`plugins/pipeline-core/hooks/post-compact-reground.mjs`,
`plugins/pipeline-core/hooks/post-compact-reground.test.mjs`,
`plugins/pipeline-core/lib/route-receipt.mjs`,
`plugins/pipeline-core/lib/route-receipt.test.mjs`,
`plugins/pipeline-core/scripts/route-receipt.schema.json`,
`plugins/pipeline-core/scripts/statusline-context.mjs`,
`plugins/pipeline-core/hooks/codex-session-start-hint.mjs`,
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`,
`docs/adr/0036-runner-honest-profiles-v2.md`,
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`.
No status/Closure change; item remains open pending the PO decision
and follow-up package above. **Date:** 2026-08-18

### Status correction, 2026-08-20

The canonical ledger retains this item at `in_progress`; it does not permit a
rewind to `open`. The current evidence is design-only and no implementation
dispatch has started. It is intentionally carried forward as a real
Nova-relevant design gap, not as a completion claim.

### Model-identity-only implementation, 2026-08-20 (dispatch NVA-MODEL-IDENTITY-01)

Implemented the PO-approved model-identity-only slice for Nova A. The
statusLine context process now writes a session-bound
`pipeline.main-session-model-identity.v1` snapshot containing only the real
statusLine model identity, session id, host-introspection label, event id, and
timestamp. `post-compact-reground.mjs` reads that snapshot only when the
compact SessionStart input identifies the same session and exposes it as
additive model-identity evidence. This slice is session-bound only; it does
not contain or claim a candidate commit/tree binding. The evidence remains local-caller-trusted
and non-cryptographic; it is not provider attestation. The existing full route
reconciliation remains unchanged and still requires a real `effort` signal.
Effort is explicitly out of scope here and is absent from the new schema,
writer, reader, tests, and acceptance claims.

Remaining host-wiring gate: `.claude/settings.json` still has no live
`statusLine` command wiring in this repository, and this repository cannot
empirically confirm the actual host statusLine stdin field names. An attended
TP-4 host step must wire the command and capture one real host invocation,
confirming `session_id` plus `model.display_name` (or the accepted model
fallback) before this evidence can be treated as live production observation.
Until that gate is satisfied, this item remains `in_progress`; no closure or
Full Verify claim is made.

Remaining candidate-binding gate: no actual repository commit/tree observation
is carried by this schema or produced by the statusLine path. A future slice
must source and validate that binding from a real repository observation before
the evidence may be described as candidate-bound.

### TP-4 correction, 2026-08-25 (dispatch AGY-SWEEP-execution-model-switchback)

Re-read this item per explicit PO instruction to revisit deferred/still-open
items rather than rubber-stamping the prior Triage. The 2026-08-20 entry's
"Remaining host-wiring gate" claim — "`.claude/settings.json` still has no
live `statusLine` command wiring in this repository" and "an attended TP-4
host step must wire the command" — is **factually wrong as of this dispatch**,
confirmed by direct evidence, not inference:

1. `git show 4375585c:.claude/settings.json` (this repo's first tracked
   commit) already contains `"statusLine": {"type": "command", "command":
   "node plugins/pipeline-core/scripts/statusline-context.mjs"}`. The wiring
   has been present in this repository's own live `.claude/settings.json`
   throughout its tracked history — it was never a pending step here; the
   stale `NOT YET WIRED (TP-4)` comment inside
   `statusline-context.mjs`'s own header (unchanged since that file's
   creation) is itself the drift, not the settings file.
2. Live production evidence that the wiring is actually firing, captured
   during THIS dispatch's own session, in the main repo's `.claude/`
   (not this dispatch's isolated worktree, which has no such file):
   `.claude/.main-session-model-identity-89b5ae44-0cc4-4e78-9d79-029562e85118.json`
   — `{"schema":"pipeline.main-session-model-identity.v1","subject":"main-session",
   "source":"host-introspection","sessionId":"89b5ae44-...","eventId":
   "statusline-89b5ae44-...-1787690583424","modelId":"Sonnet 5","observedAt":
   "2026-08-25T20:43:03.424Z"}`. The captured `modelId` is `"Sonnet 5"` — only
   `resolveModelName()`'s first branch (`model.display_name`) can produce that
   exact string; its later fallbacks (`model.id`, a bare string) would have
   produced a different-shaped value (e.g. `claude-sonnet-5`). This closes the
   item's own stated confirmation requirement ("confirming `session_id` plus
   `model.display_name`") empirically, from a real host tick, not a
   hand-constructed fixture.
3. Corroborating evidence the write is host-driven and repeated, not a
   one-off manual/test invocation: the sibling
   `.claude/.usage-89b5ae44-....json` (written by the same
   `statusline-context.mjs` script's `writeUsageFile()`) carries a LATER
   timestamp (`20:47:54.090Z` vs. the identity file's `20:43:03.424Z`),
   showing the statusLine command ticked more than once across this live
   session; and `.claude/.stop-suggest-89b5ae44-....json`, written by an
   entirely different hook (`stop-suggest.mjs`, a Stop hook) keyed to the
   same `session_id`, shows a second independent host-driven script
   confirming the session is real and host-invoked, not manually seeded from
   inside a worktree.

**Conclusion:** TP-4 ("wire `statusLine` live and empirically confirm its
real field names against an actual running host") is satisfied — not by a
new ceremony, but by evidence this dispatch found already sitting in the
main repo's `.claude/` from ordinary live use. Recommended-next-step item 2
from the 2026-08-18 entry is done; item 3 (evidence writer/reader + schema +
`post-compact-reground.mjs` wiring) was already done 2026-08-20
(NVA-MODEL-IDENTITY-01). Item 4 (threat-model note) is substantively present
in `main-session-route-attestation.mjs`'s own header comment ("this module
does not claim provider or cryptographic attestation") though not yet
promoted to a standalone doc — a documentation-polish gap, not a functional
one.

**Still genuinely open, and why it is not a bounded technical patch:** the
"remaining candidate-binding gate" quoted above asks to "source **and
validate**" a commit/tree binding. `route-receipt.mjs` (the only existing
precedent for this kind of binding in this codebase) validates a dispatched
child's `candidateCommit`/`candidateTree` against a **dispatcher-held**
`dispatchBinding` supplied by the caller who dispatched that exact task — the
ground truth to validate against always comes from outside the receipt
itself. A main/coordinator session has no dispatcher and no single fixed
candidate commit the way a dispatched task does; its HEAD moves as commits
land throughout the session. Recording HEAD at observation time is a bounded
technical addition (a "sourcing" step), but "validating" it against some
ground truth has no defined ground truth to validate against for a main
session — that is a structural gap this item's own wording did not
anticipate, not a missing line of code. Separately, `statusline-context.mjs`
runs on every statusLine tick under a stated fail-open/never-blocks/
best-effort contract; spawning a `git` subprocess (or hand-parsing
`.git/HEAD`, packed-refs, and worktree `.git`-as-a-file semantics) on that
hot path is a real behavioral change to live PO tooling, not a free
addition — it was not attempted this dispatch.

No production code changed this pass; this is a documentation-only
correction of a stale claim, backed by primary evidence. **Decision:
`implemented`** for the TP-4 correction itself (a real, verifiable fix to
this item's own inaccurate state, actioned by editing the item), while the
remaining candidate-binding "validate" half stays open as a structural gap
for a future dispatch — not scoped here because no bounded technical
addition can supply the missing ground truth to validate against; the
"source" half alone (an additive, unvalidated `headSha` observation field)
was assessed but not built this pass, given the hot-path cost above.
**Files read (no changes to production code):**
`.claude/settings.json` (this repo's, both current and at commit
`4375585c`), `.claude/.main-session-model-identity-89b5ae44-...json`,
`.claude/.usage-89b5ae44-....json`, `.claude/.stop-suggest-89b5ae44-....json`
(main repo, read-only, outside this dispatch's worktree),
`plugins/pipeline-core/scripts/statusline-context.mjs`,
`plugins/pipeline-core/lib/main-session-route-attestation.mjs`,
`plugins/pipeline-core/hooks/post-compact-reground.mjs`,
`plugins/pipeline-core/lib/route-receipt.mjs`. No status/Closure change;
`status:` left exactly as found (`in_progress`) per this dispatch's own
briefing constraints. **Date:** 2026-08-25

## Closure — PO decision, 2026-08-28: candidate-binding narrowed out of scope

The one remaining gate was the "candidate-binding gate": source **and validate**
a repository commit/tree binding for the main-session identity evidence. The
2026-08-25 investigation established why that cannot be met as written, and the
finding is structural, not a missing implementation:

> `route-receipt.mjs` — the only existing precedent for this kind of binding in
> this codebase — validates a dispatched child's `candidateCommit`/`candidateTree`
> against a **dispatcher-held** `dispatchBinding` supplied by the caller who
> dispatched that exact task; the ground truth to validate against always comes
> from outside the receipt itself. A main/coordinator session has no dispatcher
> and no single fixed candidate commit the way a dispatched task does; its HEAD
> moves as commits land throughout the session.

Recording HEAD at observation time is a bounded addition, but "validating" it has
no defined ground truth for a main session. An item cannot stay open against a
criterion nothing can satisfy — that is precisely the failure
`pipeline.a-resolved-backlog-item-can-keep-status-open-indefinitely` describes.

**Decision (PO, 2026-08-28): narrow the scope, exactly as `effort` was narrowed
on 2026-08-19.** Candidate-binding is explicitly **out of scope** for this item.
No fabricated binding, no unvalidated field presented as validated evidence, and
no `git` spawn added to `statusline-context.mjs`'s fail-open hot path. A future
item may revisit it if a real ground truth for a main session ever exists.

**What this item delivered, and what it honestly claims.** Model-identity-only
attestation is implemented and live: `statusline-context.mjs` writes a
session-bound `pipeline.main-session-model-identity.v1` snapshot from the real
host statusLine tick, and `post-compact-reground.mjs` consumes it when the
session ids match. TP-4 is satisfied — confirmed 2026-08-25 from a real host
tick, not a fixture. The evidence is local-caller-trusted and
non-cryptographic; it is **not** provider attestation, and the module's own
header says so.

**Deliberately still not claimed:** full route reconciliation
(`reconcileMainSessionRoute` with a complete `observed` object) still requires a
real `effort` signal, which no runner exposes — unchanged and out of scope since
2026-08-19. `MSR-UNVERIFIED` therefore remains the correct live outcome for the
full-route path, and that is the accurate state, not a defect.
