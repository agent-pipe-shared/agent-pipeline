---
schema: pipeline.backlog-item.v1
id: pipeline.gate-strength-override-route-advertised-not-offered
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Found live on 2026-08-08 while preparing the two gate-strength edits Sprint-Phoenix's gate-integrity phase needs (the TP-11 legacy-tier row and the new TP-12 row). Both denials advertise an in-session override and neither offers one. Observed against this tree at commit c425170."
---

# The gate-strength guard promises an override "below" and prints nothing below

## Description

`guard-gate-strength.mjs` refuses an `Edit` to a gate-strength path and ends its
denial with:

> "…a human-authorized override (chat- or signature-mode …) can admit one exact,
> audited edit, exactly like every other guard this override family already
> covers (ADR-0059). Escape hatch: the PO edits this file directly, outside an
> agent session, **or authorizes the override below**."

**There is nothing below.** The message ends there, followed by one blank line.

Reproduced twice, on two different rules and two different files, in the same
session:

| Attempt | Rule | File | Override block |
| --- | --- | --- | --- |
| Append TP-11 + TP-12 rows | **GS-7** | `.claude/guard-config.json` | absent |
| Append the TP-12 row | **GS-4** | `project/guard-config.json` | absent |

## Why this is not "that path simply has no override"

Three checks, each of which would have explained the absence and none of which
does:

1. **Both paths are override-eligible.** `protectedPath()` in
   `plugins/pipeline-core/lib/human-guard-override.mjs:494-509` names
   `.claude/guard-config.json` and `project/guard-config.json` explicitly.
   Neither is a `hardBoundaryPath` (`:517-523`).
2. **The override family is installed and healthy here.**
   `guard-human-override.mjs verify-audit` returns
   `{"status":"valid","entries":6}`.
3. **The guard's own code takes the override branch for these rules.** The
   "no in-session override at all" wording is guarded by a ternary on
   `matched.id === "GS-6"` (`guard-gate-strength.mjs:308-318`); GS-4 and GS-7
   take the else branch, which is the one that promises the override.

So the guard reached the branch that offers a route, and produced no route.

## The most probable mechanism — stated as a hypothesis, not as proof

`guard-gate-strength.mjs:267` only ever composes guidance when
`consumeHumanGuardOverride` returned `absent` or `replan`:

```js
if (consumed.status === "absent" || consumed.status === "replan") { … plan … }
```

Every other status falls through **both** branches and leaves `overrideGuidance`
as the empty string it was initialised to — which is exactly the observed output.
One such status is reachable from the capability store rather than from this
edit: `consumeHumanGuardOverride` iterates every `*.json` in the store and, if
`validatedCapability` throws on **any** of them, returns
`{ status: "invalid", code: "HGO-CAPABILITY" }` for the whole call
(`human-guard-override.mjs:1857-1858`) — not `continue`, but `return`.

This repository's store holds exactly one record, dated 2026-07-30, with
`"status":"consumed"`. It was written by a **different plugin install** — its
`plugin.root` is a Codex plugin cache path at version `0.4.7-partial-auth`,
while the plugin enforcing today is a different root and version.

**Confirmed by measurement, same day — the hypothesis above is no longer a
hypothesis.** A read-only probe called `consumeHumanGuardOverride` with a
deliberately non-matching tool input (a file path that does not exist, so no
stored capability can match it) and a synthetic denial. A healthy store must
answer `absent` for that. It answered:

```
{"status":"invalid","code":"HGO-CAPABILITY"}
```

Nothing was written and nothing was consumed. That return is produced only by the
whole-loop `return` at `human-guard-override.mjs:1857-1858`, so
`validatedCapability` does throw on the one stored record, and it does so before
any matching is attempted.

**Which widens the consequence past this item's title.** The status does not
depend on the tool, the path, or the guard: it is the store's answer to *every*
call. So **every HGO-routed guard denial in this checkout is silent**, not only
the two gate-strength rules that exposed it. Any guard in that family will refuse,
promise a route, and print nothing.

## Consequence, and why it is worth more than its size

The PO's standing rule for this pipeline is that it must never require the human
to perform work outside the session. This defect converts the two gate-strength
edits of the current phase from "one signature each" into "the PO opens an editor
and edits a protected configuration file by hand" — the exact outcome the rule
forbids, arrived at silently.

It is also **invisible in the direction that matters**. A denial with no route is
indistinguishable, to the reader, from a rule that legitimately has none — and
the adjacent GS-6 really is such a rule. ADR-0059 Decision 4 anticipated this
exact confusion and required a denial with no route to say so with a typed
reason (`guard-gate-strength.mjs:291-294` carries that intent). The failure mode
here defeats that decision by not reaching either branch.

**A note on how it was found, because that is the reusable part.** It surfaced
only because an edit was actually attempted. Reading the guard's source suggests
the opposite conclusion — this session had already written into the phase plan,
from a careful reading of `:308-318`, that the two rows would cost signatures
rather than hand edits. The code path was read correctly and does not execute
that way here.

## Affected artifact

`plugins/pipeline-core/hooks/guard-gate-strength.mjs:248-300` (the guidance
composition and its two-status condition); `plugins/pipeline-core/lib/human-guard-override.mjs:1852-1861`
(the whole-loop return on an unvalidatable capability). The stale record lives in
this checkout's private override store and is not a tracked file.

**Ownership note:** both modules belong to the Nova session. This item is a
filing, not a repair.

## Proposal

**Owner: PO**, for assignment to Nova. Ordered by what unblocks the most.

1. **The mechanism is established; what remains is why that record fails
   validation.** The probe above proves `validatedCapability` throws on it. Which
   check rejects it — the MAC against an audit key rotated since, the foreign
   plugin identity, a schema field added after 2026-07-30 — decides whether this
   is a migration defect or a key-lifecycle one, and only the first is a
   one-repository problem.
2. **A denial must never be silent.** Whatever `consumeHumanGuardOverride`
   returns, the guard should emit either a route or a typed reason why there is
   none. The present `if` enumerates two statuses and drops the rest; an `else`
   that always produces `humanGuardRouteUnavailableReason` would close it
   regardless of what the underlying cause turns out to be. This is worth doing
   even after the specific cause is fixed.
3. **One unusable record should not disarm the store.** A capability file that
   fails validation is a reason to refuse *that* capability, not to abandon the
   scan. Note the tension deliberately: failing closed on an unparseable
   security record is defensible, and the fix must not turn into "ignore records
   we cannot read". Reporting it as a typed, visible error is the reconciliation
   — the present behaviour fails closed *and* silently, which is the worst of
   both.
4. **Consider whether a foreign-install record should be admitted at all.** The
   stored record names a different plugin root and version than the one
   enforcing. Whether such a record should be scanned, ignored, or reported is a
   design question this item does not settle.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
