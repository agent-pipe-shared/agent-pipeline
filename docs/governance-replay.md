# Governance replay

`governance-replay` is a read-only, local reconstruction view for the
canonical lifecycle stream. It queries the verified stream boundary with an
optional retained checkpoint and projects only exact lifecycle envelopes into
per-dispatch timelines. An incomplete, prefix-valid, stale, or invalid stream
returns `unavailable`; it is never rendered as a partial authoritative history.

The replay is non-authoritative. It cannot approve work, restore a package,
replace a human decision, or repair canonical records. Candidate invalidation
and ordering are represented explicitly, so an uncorrelated candidate change
or sequence fork fails closed rather than being normalized away.

## Local timeline and topology view

`governance-replay-viewer` turns a saved, verified replay readback into a new,
static offline HTML file. It renders each dispatch in sequence order and a
correlation topology of package, worker and attempt. `unknown` and
`unavailable` remain distinct states; an unavailable stream has no partial
timeline. The viewer accepts only the closed replay allowlist, rejects extra
event fields such as prompts, logs, credentials or private paths, uses a
network-denying Content Security Policy, and never overwrites a report.

```sh
node plugins/pipeline-core/scripts/governance-replay-viewer.mjs build \
  --root . \
  --replay evidence/governance-replay.json \
  --output evidence/governance-replay.html
```

The replay view is display-only. Cyborg's later proof of human authority must
be checked at its separate signed-authority boundary and, if shown here, remain
explicitly labelled as that verified fact; no lifecycle status or topology node
can imply it.

## Traceability

Every retained lifecycle event kind and field
(`plugins/pipeline-core/lib/lifecycle-governance-events.mjs`) is listed below
with the concrete user/audit need it serves. Per L-AC-08, none of these is
justified only by competitor or provider parity.

**Kinds** (`lifecycle-governance-events.mjs:10`):

- `dispatch` — marks that a dispatch was created/assigned under a package and
  candidate; lets an operator reconstruct "which dispatch existed, under
  which package/candidate, and when" from the durable stream rather than
  from chat history that may no longer exist.
- `status` — records a status transition
  (`proposed`/`active`/`completed`/`failed`/`cancelled`/`unknown`/
  `unavailable`/`invalidated`, `lifecycle-governance-events.mjs:11`) for a
  dispatch; lets an operator reconstruct a dispatch's progression over time
  for stall/drift diagnosis, from the stream instead of a live process that
  may no longer exist.
- `candidate-invalidation` — the one kind with a required paired field
  (`invalidatesEventId`, `status` fixed to `invalidated`,
  `lifecycle-governance-events.mjs:87`); lets an audit trace "this specific
  earlier record is no longer valid" explicitly instead of a later record
  silently superseding an earlier one — this document's own text above
  states the reason: "so an uncorrelated candidate change or sequence fork
  fails closed rather than being normalized away."
- `verification`, `review`, `gate`, `recovery`, `reconciliation` — each
  marks a distinguishable governance-touchpoint type on a dispatch's
  timeline (a check run, a review pass, a gate decision, a recovery action,
  a reconciliation action respectively); the shared audit need across all
  five is being able to ask "what class of governance event happened here,"
  not just "something happened," from a durable record instead of a claim —
  which is exactly what the replay viewer renders per dispatch (see "Local
  timeline and topology view" above).

**Fields** (`lifecycle-governance-events.mjs:78`):

- `eventId` — stable per-event identifier; the anchor `invalidatesEventId`/
  `supersedesEventId` reference, so one event can be cited unambiguously by a
  later one.
- `kind` — see per-kind list above; the field a replay timeline buckets on.
- `status` — closed enum; lets "what state was this dispatch/step in" be
  answered from the record instead of inferred from prose.
- `reasonCode` — closed, machine-readable reason; the same no-open-string
  design discipline the module's own comment states for `extensions`
  (`lifecycle-governance-events.mjs:26-32`) applied to "why," so a reason is
  auditable without becoming a free-text/PII leak.
- `correlation.packageId` — ties the event to the work package; needed to
  filter/join a replay to "all lifecycle events for package X."
- `correlation.dispatchId` — ties the event to one dispatch; the per-dispatch
  timeline the viewer builds ("renders each dispatch in sequence order",
  above) is keyed on exactly this field.
- `correlation.attemptId` — distinguishes retries of the same dispatch;
  needed to answer "which attempt succeeded/failed" when a dispatch was
  attempted more than once.
- `correlation.workerId` — ties the event to the worker/agent instance that
  produced it; needed for the "correlation topology of package, worker and
  attempt" the viewer renders (above).
- `correlation.correlationId` — the orchestrator-assigned identifier for this
  specific dispatch invocation, distinct from `workerId` (which agent) and
  `attemptId` (which retry); needed so a caller holding only the
  orchestrator's own correlation token — without knowing the internal
  package/dispatch/attempt identity — can still find every event for that
  invocation.
- `correlation.queueRevision` — the feature package's own queue revision at
  the moment the event was observed; binds the event to a specific queue
  state snapshot, the same candidate-binding discipline `candidate.commit`/
  `.tree` apply to code state (below) — needed to detect whether the queue
  was reordered or mutated after this event, not just whether the code was.
- `candidate.commit` / `candidate.tree` — binds the event to an exact code
  state so a lifecycle event is anchored to a specific, git-verifiable
  candidate rather than a moving target — the same candidate-binding
  discipline used by the agent stream's `candidateDigest`
  (`docs/agent-decision-journal.md`) and the human stream's
  `scope.candidate` (above).
- `invalidatesEventId` — links a `candidate-invalidation` event to the exact
  prior event it invalidates; see the `candidate-invalidation` kind above.
  Structurally mutually exclusive with `supersedesEventId`
  (`lifecycle-governance-events.mjs:86`).
- `supersedesEventId` — links a later event to an earlier one it supersedes;
  lets an audit trace a corrected/updated record back to what it replaces
  without losing the earlier append-only record, the same pattern the human
  stream uses for `supersedesDecisionId` (above).
- `extensions` — optional, additive, per-registered-namespace runner detail
  (`pipeline.lifecycle-extension-namespaces.v1`, closed to `boolean`/`count`/
  `enum` domains only, `lifecycle-governance-events.mjs:34-53`); lets a
  specific runner attach bounded, no-entropy detail (e.g. a retry count) to a
  lifecycle event without opening a free-text or digest field that could
  carry private data — the field-level enforcement of the "no open string
  domain, deliberately" discipline stated in the module's own comment
  (`lifecycle-governance-events.mjs:26-32`).
