# Agent decision journal

The Agent Decision Journal records only material, closed observational events:
assumptions, selections, verification scope, fallback, and escalation. Each
record has a stable reason code, exact candidate digest, optional human-decision
link, and explicit lifecycle state. It cannot grant, consume, revoke, or
replace human authority.

The canonical agent stream rejects free text, prompts, tool output, terminal
history, raw logs, chain-of-thought, account data, and authority-shaped fields.
It also rejects a journal event whose candidate digest does not match its
envelope candidate. Supersession is explicit and remains an observation link,
not an implicit policy change.

## External command offers and recovery

A Pipeline-known command or script is represented as one closed
`command-offer` journal event before it can be presented or initiated. The
record retains only a stable operation class/version or public-safe governed
artifact digest, candidate/repository/scope and policy digests, side-effect and
authority class, execution-assurance state, and typed omissions. It never
contains command text, arguments, paths, credentials, prompts, transcripts, or
unrestricted output.

`recordCommandOffer` requires verified append readback before presentation.
`recordPipelineAttempt` records an attempt before an executor can run; for a
destructive, guard-bypassing, or authority-changing action it delegates to the
human-authority verifier with an exact decision/candidate/repository/scope
tuple. This is the integration seam for Cyborg's later signed human-attestation
proof: an offer, transport state, or replay result cannot substitute for it.

User-executed work remains `execution-unobserved` until an independent bounded
evidence verifier confirms `observed-completed` or `readback-verified`.
Failures, partial results, cancellation, unavailability, mismatch, recovery,
and cleanup remain distinct append-only states. The command-offer adapter does
not execute commands and cannot itself grant authority.

## Taxonomy

Closed event kinds (`plugins/pipeline-core/lib/agent-decision-journal.mjs:4`):
`assumption`, `selection`, `verification-scope`, `fallback`, `escalation`,
plus the distinct `command-offer` kind dispatched separately
(`agent-decision-journal.mjs:20,32`). Lifecycle `state` values are `declared`,
`verified`, `contradicted`, `expired`, `invalidated`, `superseded`
(`agent-decision-journal.mjs:4`), a closed set orthogonal to the optional
`assumptionState` epistemic axis (`assumed`, `inferred`, `observed`,
`verified`, `contradicted`, `unavailable`, `unknown` —
`agent-decision-journal.mjs:6`); per A-AC-11 the two axes never collapse into
one enum (`agent-decision-journal.mjs:5,16`).

A `command-offer` event carries its own closed state machine (`offered`,
`acknowledged`, `authorized`, `copied`, `attempted`, `execution-unobserved`,
`observed-completed`, `readback-verified`, `failed`, `partial`, `cancelled`,
`unknown`, `unavailable`, `readback-mismatch`, `recovery-proposed`,
`recovered` — `agent-decision-journal.mjs:7`), a narrower execution-assurance
axis (`agent-decision-journal.mjs:8`), a closed `sideEffectClass`
(`non-authoritative`, `destructive`, `guard-bypass`, `authority-changing`),
and a `recoverability` class (`not-applicable`, `recoverable`,
`cleanup-required`, `rollback-required` — `agent-decision-journal.mjs:34`).

## Materiality policy

`governance/events/capture-policy.json:8` declares the agent stream's
`materiality` as `policy-selected` (schema enum `required` |
`policy-selected` | `not-applicable`,
`governance/schemas/governance-capture-policy.schema.json:32`), distinct from
the `required` materiality on the human and lifecycle streams
(`capture-policy.json:7,9`). Conceptually this marks agent-journal capture as
policy-governed rather than mandatory-for-completeness: the policy, not every
possible internal step, decides which of the five declared kinds gets
journaled.

Honesty note: `assertPortablePayload`
(`plugins/pipeline-core/lib/governance-event-store.mjs:295-329`), the
function that actually gates what a portable agent event may contain,
validates `storageProfile`, `personalIdentifiability`, and
`contextualIdentifiability` against the matching capture-policy stream entry,
but never reads or enforces the `materiality` field's value. This matches
the epic's own tracked gap:
`specs/sprint-phoenix-epic/design/closure-plan.md:223` records A-AC-09 as
"materiality is documented as design intent only; no code enforces or
measures it." The materiality label exists in the schema and the shipped
policy file; no runtime check currently selects or rejects an event because
of it.

## Trust model

Write access: any caller with append access to the portable governance-event
store may write to the `agent` stream (`origin: "agent"`), but the stream is
registered with `authorityClass: "non-authoritative"`
(`plugins/pipeline-core/lib/governance-event-store.mjs:39`), in contrast to
the `human` stream's `"human-authority"` (`governance-event-store.mjs:38`).
`assertIntent` enforces that every appended event's declared
`origin`/`authorityClass` matches its registered stream
(`governance-event-store.mjs:337-350`), so an agent-origin event structurally
cannot claim human authority.

Read access: agent-journal events use `storageProfile:
"repository-public-safe"` (enforced by the envelope's portable-policy-
coherence check, `plugins/pipeline-core/lib/governance-event.mjs:194`), so
anyone with ordinary read access to the repository can read the full agent
stream — there is no separate reader-authorization layer for this stream,
unlike the restricted-machine-local profile.

What the journal cannot grant: `resolveHumanGovernanceAuthority`
(`plugins/pipeline-core/lib/human-governance-ledger.mjs:48-65`), the only
function in this codebase that resolves Pipeline authority, reads
exclusively from human-stream decisions passed to it; nothing resolves
authority from `agent`-origin events. This is the code-level backing for the
prose above ("cannot grant, consume, revoke, or replace human authority"):
`validateAgentDecisionEvent`/`validateCommandOfferEvent`
(`agent-decision-journal.mjs:18-42`) admit only closed reason codes, digests
and lifecycle state, never a free-text authority claim.

## Retention

`capture-policy.json:8` declares `"retention": "repository-retained"` for
the agent stream — the same value used for the human and lifecycle streams
(`capture-policy.json:7,9`). The envelope's portable-policy-coherence check
(`plugins/pipeline-core/lib/governance-event.mjs:194`) enforces that every
portable (`repository-public-safe`) event, agent-journal events included,
carries `retentionCompatibility: "repository-retained"`; the alternative,
`"machine-local-expiring"`, is reserved for the separate restricted-machine-
local profile, which carries an explicit `expiresAtEpochMs`
(`governance-event-store.mjs:212-227,741`).

Honesty note: there is no expiry, pruning, or deletion code path for
portable agent-journal records in this module. Once appended, an agent-
decision event is retained for as long as the repository (and its Git
history) retains the file under `governance/events/agent/`;
`appendPortableGovernanceEvent` never removes or supersedes a canonical file
(`governance-event-store.mjs:629-663`). A shorter or different retention
would require routing the material through the restricted-machine-local
store instead (`governance-event-store.mjs:740-763`), which this module's
public agent-journal events do not do.

## Recovery

Two distinct situations exist, and only one has an automated recovery path.

1. **Interrupted append (self-healing, no operator action):** every write is
   staged to a temporary file (`.{name}.{random}.tmp`) and only becomes
   canonical via an atomic rename (`writeAtomic`,
   `governance-event-store.mjs:445-463`). A crash between the temp-file
   write and the rename leaves an orphaned temp file that `scanStream`
   explicitly ignores when reading the canonical prefix
   (`TEMPORARY_EVENT_FILE` test, `governance-event-store.mjs:419`), so an
   interrupted write can never corrupt what is already readable.
   `removeOrphanedTemporaryEvents` deletes any such leftover file
   automatically, under the stream's exclusive lock, at the start of the
   very next append (`governance-event-store.mjs:561-566,572`). This exact
   mechanism was pinned for the sibling human stream by
   `plugins/pipeline-core/lib/human-governance-ledger.test.mjs:385` ("an
   append recovers from an orphaned temporary file left by an earlier
   interrupted write"); the code path is shared
   (`governance-event-store.mjs`), not stream-specific, so it applies
   identically to the agent stream.
2. **Replaceable projection recovery (operator-invoked):**
   `recoverPortableGovernanceProjection` (`governance-event-store.mjs:
   689-733`) rebuilds only the replaceable `heads.json` index from an
   already-valid canonical chain, after a retained checkpoint verifies as
   `valid`/`verified`. It never repairs, rewrites, or removes a canonical
   event file.

Honesty note on what is NOT recoverable: a corrupted or forked canonical
hash chain itself has no automated repair. `scanStream` fails closed on a
broken chain (`GES-CHAIN`, `governance-event-store.mjs:439`) or a forked
sequence (`GES-FORK`, `governance-event-store.mjs:427`), and per
`docs/governance-events.md`, "a fork, a changed canonical interpretation, or
an authority change requires the later human-ledger disposition flow; it
cannot be repaired by this kernel." No such disposition flow exists for the
agent stream specifically (it is non-authoritative), so a corrupted
agent-journal chain segment has no documented repair procedure beyond
discarding and rebuilding history outside this module — this document does
not invent one.

## Operator documentation

The agent journal has no dedicated CLI; it is read and written through the
same portable governance-event surface used by all three streams, scoped by
`streamId: "agent"` in the request file:

```text
node plugins/pipeline-core/scripts/governance-event.mjs query --repo CHECKOUT --request-file REQUEST.json
node plugins/pipeline-core/scripts/governance-event.mjs verify --repo CHECKOUT --request-file REQUEST.json
```

(`plugins/pipeline-core/scripts/governance-event.mjs:42-53`, operations
`preview|append|verify|query|recover`.) `REQUEST.json` for `query`/`verify`
carries `{"schema": "...", "repositoryFingerprint": "...", "streamId":
"agent", "checkpoint": null|{...}}` (`streamRequest`,
`governance-event.mjs:60-63`); see `docs/governance-events.md` for the full
request/receipt shape shared by all three streams — this document does not
duplicate it. There is no agent-stream-specific inspection tool beyond this
shared surface.
