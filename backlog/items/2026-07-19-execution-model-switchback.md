---
schema: "pipeline.backlog-item.v1"
id: "pipeline.execution-model-switchback"
type: "workflow-improvement"
owner: "pipeline"
status: "open"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
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

This item is returned from `in_progress` to `open`: the current evidence is
design-only and no implementation dispatch has started. It is intentionally
carried forward as a real Nova-relevant design gap rather than represented as
active implementation work.
