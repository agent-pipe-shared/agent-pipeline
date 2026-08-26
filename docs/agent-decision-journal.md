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

## Schema

Three closed event shapes exist under a `oneOf`
(`governance/schemas/agent-decision-event.schema.json:6-97`), enforced
identically by the runtime validators the store actually calls
(`plugins/pipeline-core/lib/agent-decision-journal.mjs:30-73`):

1. **Observational shape** (`assumption`, `selection`, `verification-scope`,
   `fallback`, `escalation`) — six required keys plus up to two optional
   ones: `eventId`, `kind`, `state`, `reasonCode`, `candidateDigest`,
   `relatedHumanDecisionId`, `supersedesEventId`
   (`agent-decision-journal.mjs:31`), plus the optional `assumptionState`,
   present only when the epistemic axis described under Taxonomy is recorded
   (`agent-decision-event.schema.json:14`), and the optional `identity`
   array (A-AC-05: one to seven entries, each a closed
   `dimension`/`value`/`provenance`/`assurance` object), present only when
   an identity choice is material to the decision being recorded — admitted
   only on `selection`/`escalation`/`fallback`, rejected on
   `assumption`/`verification-scope` with the dedicated `ADJ-IDENTITY-SCOPE`
   code (`agent-decision-journal.mjs:39`,
   `agent-decision-event.schema.json:15-30`).
2. **`command-offer` shape** — eighteen required keys covering offer
   identity and provenance (`offerOrigin`), the governed `operation` and
   `target` sub-objects, `sideEffectClass`/`authorityRequirement`, three
   digests (`policyDigest`, `redactionPolicyDigest`, plus the shared
   `candidateDigest`), `executionAssurance`, a bounded `omissions` array,
   offer linkage (`offerEventId`, `preEvidenceDigest`, `postEvidenceDigest`),
   and `recoverability` (`agent-decision-journal.mjs:49`,
   `agent-decision-event.schema.json:39`). `identity` does not exist on this
   shape at all — it is additive only to the observational branch above.
3. **`legacy-import-observation` shape** (H-AC-08) — eleven required keys:
   the seven base keys shared with the observational shape plus four new
   ones — `legacySourceClass` (a closed six-value enum,
   `mutable-approval-state` / `guard-override-jsonl-record` /
   `deployment-approval-log` / `override-receipt` /
   `backlog-transition-record` / `release-change-evidence`, one-to-one with
   the six legacy record classes named in the source GitHub issue's
   Migration section), `authorityProofStatus` (`unprovable` |
   `not-attempted`), and the nullable `sourceReferencePath`/
   `sourceReferenceDigest` pair (`agent-decision-journal.mjs:68-73`,
   `agent-decision-event.schema.json:80-96`). Like `command-offer`, it is a
   third, independent `oneOf` branch dispatched away from the observational
   branch before `KINDS` is ever consulted — not a sixth member of the
   5-kind observational set (`agent-decision-journal.mjs:33`, the
   `value?.kind==="legacy-import-observation"` early return, mirroring the
   `command-offer` dispatch on the line immediately above it). It reuses the
   existing `STATES` lifecycle set unchanged (no parallel state machine) and
   the `ADJ-SUPERSESSION` invariant already enforced for the observational
   branch: `state: "superseded"` requires a non-null `supersedesEventId`
   (`agent-decision-journal.mjs:71`). `sourceReferencePath` is validated
   against a local regex constant that duplicates
   `governance-event.mjs`'s `ARTIFACT_PATH` pattern exactly, rather than
   importing it, keeping this module dependency-free
   (`agent-decision-journal.mjs:15`). This shape carries no `identity` or
   `assumptionState` field — it is a closed shape of its own, not an
   extension of the observational branch. It inherits its non-authoritative,
   cannot-satisfy-a-gate guarantee entirely from the existing, unmodified
   `origin === "agent"` -> `authorityClass: "non-authoritative"` binding in
   `governance-event.mjs:175`; nothing in this shape or its validator needed
   to change to get that guarantee.

All three shapes are closed by `additionalProperties: false` in the schema
(`agent-decision-event.schema.json:8,38,81`) and by the matching `exact()`
key-set check in the runtime validator
(`agent-decision-journal.mjs:17,37,50,70`) — no undeclared key is
representable in any shape; the same `exact()` check also closes each
individual `identity` array entry to its four named keys
(`agent-decision-journal.mjs:18`). The published JSON Schema file is
not itself invoked by `assertPortablePayload` at write time
(`plugins/pipeline-core/lib/governance-event-store.mjs:318-324` dispatches
`origin === "agent"` events straight to `validateAgentDecisionEvent`, a
hand-written check); schema/validator drift is instead caught by dedicated
tests that load the schema file and assert its enums and
`additionalProperties` match the runtime constants
(`plugins/pipeline-core/lib/agent-decision-journal.test.mjs:72-79`, "A-AC-11
keeps the published schema closed and in step with the validator";
`agent-decision-journal.test.mjs:125-134`, "A-AC-05 keeps the published
identity schema closed and in step with the validator", covering the
`identity`/`dimension`/`provenance`/`assurance` enums and the 1-7 bounds the
same way; and the H-AC-08 sibling drift test, "H-AC-08 keeps the published
legacy-import-observation schema closed and in step with the validator",
covering `legacySourceClass`/`authorityProofStatus`).

## Taxonomy

Closed event kinds (`plugins/pipeline-core/lib/agent-decision-journal.mjs:4`):
`assumption`, `selection`, `verification-scope`, `fallback`, `escalation`,
plus the distinct `command-offer` and `legacy-import-observation` kinds
dispatched separately, before `KINDS` is ever consulted
(`agent-decision-journal.mjs:32-33,48,68`). Lifecycle `state` values are `declared`,
`verified`, `contradicted`, `expired`, `invalidated`, `superseded`
(`agent-decision-journal.mjs:4`), a closed set orthogonal to the optional
`assumptionState` epistemic axis (`assumed`, `inferred`, `observed`,
`verified`, `contradicted`, `unavailable`, `unknown` —
`agent-decision-journal.mjs:6`); per A-AC-11 the two axes never collapse into
one enum (`agent-decision-journal.mjs:5,23`).

A-AC-05 adds a fourth, independent axis: the optional `identity` array
carries closed provenance/assurance records for the seven named identity
dimensions — `runner`, `model`, `effort`, `profile`, `role`, `adapter`,
`capability` (`agent-decision-journal.mjs:8`, `IDENTITY_DIMENSIONS`). Each
array entry pairs one dimension with a bounded `value` (the shared `ID`
regex, `agent-decision-journal.mjs:3`), a closed `provenance` — how the
identity was learned: `same-dispatch-observed`, `requested-route`,
`inherited-session`, `unknown` — and a closed `assurance` — how confidently
it is held: `verified`, `reported`, `inferred`, `unknown`
(`agent-decision-journal.mjs:8`, `IDENTITY_PROVENANCE`/`IDENTITY_ASSURANCE`).
The array holds one to seven entries and no two entries may share a
`dimension` (`agent-decision-journal.mjs:18`, mirroring the duplicate-check
technique `validateCommandOfferEvent` already uses for `omissions`). Unlike
`assumptionState`, `identity`'s admissibility is itself kind-scoped: it is
representable only on the kinds where an identity choice is material to the
decision being recorded — `selection`, `escalation`, `fallback`
(`agent-decision-journal.mjs:8`, `IDENTITY_KINDS`) — and its presence on
`assumption` or `verification-scope` fails closed with the dedicated
`ADJ-IDENTITY-SCOPE` code rather than the generic `ADJ-SHAPE`
(`agent-decision-journal.mjs:39`).

A `command-offer` event carries its own closed state machine (`offered`,
`acknowledged`, `authorized`, `copied`, `attempted`, `execution-unobserved`,
`observed-completed`, `readback-verified`, `failed`, `partial`, `cancelled`,
`unknown`, `unavailable`, `readback-mismatch`, `recovery-proposed`,
`recovered` — `agent-decision-journal.mjs:9`), a narrower execution-assurance
axis (`agent-decision-journal.mjs:10`), a closed `sideEffectClass`
(`non-authoritative`, `destructive`, `guard-bypass`, `authority-changing`),
and a `recoverability` class (`not-applicable`, `recoverable`,
`cleanup-required`, `rollback-required` — `agent-decision-journal.mjs:50`).

H-AC-08 adds a third, independent kind, `legacy-import-observation`: a
pre-Phoenix or external approval/override/deploy record whose original
authority tuple cannot be reproven, imported only as this closed, explicitly
unverified observation. It carries a closed `legacySourceClass` (the six
legacy record classes named in source GitHub issue #30's Migration section:
`mutable-approval-state`, `guard-override-jsonl-record`,
`deployment-approval-log`, `override-receipt`, `backlog-transition-record`,
`release-change-evidence`) and a closed `authorityProofStatus`
(`unprovable` | `not-attempted` — the two honest outcomes of trying to
reprove the original authority tuple, `agent-decision-journal.mjs:13`). It
reuses the shared `STATES` lifecycle set rather than a parallel state
machine, and it is dispatched to its own validator exactly like
`command-offer` — a third `oneOf` branch, not a sixth member of this
section's 5-kind observational set (`agent-decision-journal.mjs:33,68`). It
inherits its non-authoritative, cannot-satisfy-a-gate guarantee entirely
from the existing, unmodified `origin === "agent"` ->
`authorityClass: "non-authoritative"` binding in `governance-event.mjs:175`
— nothing in this kind's shape or validator needed to change to get that
guarantee.

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
`validateAgentDecisionEvent`/`validateCommandOfferEvent`/
`validateLegacyImportObservationEvent`
(`agent-decision-journal.mjs:30-73`) admit only closed reason codes, digests
and lifecycle state, never a free-text authority claim.

## Privacy threat model

What this stream must never carry: free text, prompts, tool output, terminal
history, raw logs, chain-of-thought, account data, or an authority-shaped
field (stated in this document's own intro, and structurally enforced — see
Schema above: none of the three event shapes has a slot typed for prose or
an account identifier at all). At the field level, R-AC-05 enumerates the concrete
prohibited set and pins it as a test: credentials, tokens, account/accountId,
SSH keys, private paths, private coordinates, raw command text/arguments/
scripts, shell history, transcripts, prompts, unrestricted output, and any
"untyped" digest of the above
(`plugins/pipeline-core/lib/agent-decision-journal.test.mjs:15-33`, the
`PROHIBITED` fixture and "R-AC-05 refuses every enumerated private field and
every untyped digest at both journal boundaries").

Enforcement is structural rejection, not redaction or best-effort filtering:
because all three event shapes are `exact()`-closed (`agent-decision-journal.mjs:17`),
an event carrying an extra key such as `command` or `privatePath` fails
validation outright (`ADJ-SHAPE`/`ADJ-COMMAND-OFFER`/`ADJ-LEGACY-SHAPE`,
`agent-decision-journal.mjs:37,50,70`) before it can reach the store. There is
exactly one digest slot per shape family (`candidateDigest` on the
observational shape; `policyDigest`/`redactionPolicyDigest`/
`preEvidenceDigest`/`postEvidenceDigest`/`governedArtifactSha256` on the
command-offer shape; `candidateDigest`/`sourceReferenceDigest` on the
`legacy-import-observation` shape — all typed `^[a-f0-9]{64}$`,
`agent-decision-journal.mjs:3`), and none is documented or usable as a
stand-in for a private-content digest — the test asserts the one accepted
operation digest is the governed-artifact one and that a raw serialization
of an accepted event never contains any of the prohibited fixture values
(`agent-decision-journal.test.mjs:27-33`; the R-AC-05 fixture itself is
exercised only against the observational and command-offer shapes, not
re-run against `legacy-import-observation`, which the H-AC-08 tests cover
separately with their own closed-shape assertions).

At the store layer, `assertPortablePayload` additionally requires the agent
stream's registered capture-policy entry to declare
`personalIdentifiability: "prohibited"` and `contextualIdentifiability:
"prohibited"` before any event on the stream is accepted at all
(`plugins/pipeline-core/lib/governance-event-store.mjs:297`), and read access
to the stream is `repository-public-safe` (see Trust model above) — so the
privacy boundary is enforced twice, once at the shape level (this module) and
once at the policy-registration level (the store), with no path for either
boundary to bypass the other.

Honesty note: this is a structural/allowlist defense (only enumerated, typed
fields exist), not a content-scanning defense. A caller that wanted to
smuggle private data into a *permitted* field (e.g. choosing a `reasonCode`
that itself encodes a person's name) is bounded only by the `CODE`/`ID`
regexes (`agent-decision-journal.mjs:3`), which constrain character class and
length, not semantic content. This document does not find a semantic or
content-based privacy check anywhere in this module — the mitigation is
exhaustively enumerated-field allowlisting, not content inspection.

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
