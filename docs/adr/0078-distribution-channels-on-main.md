# `main` is the only published channel; alpha is the working channel and beta is reserved

> Agent-Pipeline · Sprint Nova · as of 2026-09-01

> **Accepted as ADR-0078 on 2026-09-01.** Numbered in the act of acceptance per
> [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2 — this file, its index
> row in `docs/adr/README.md` and its observation-governance classification are one commit.

**Status:** accepted (2026-09-01, PO decision in session). **Supersedes** the PO decision recorded in
`backlog/items/2026-08-27-all-three-runners-should-install-against-the-stable-branch.md` as to
*mechanism*, and leaves that item's *requirement* (consumers follow the released version; the
freshness check is fail-open but tells the user plainly) fully intact.

**Governs:** `plugins/pipeline-core/scripts/ruleset-freshness.mjs` (`selectedChannelTarget`),
`plugins/pipeline-core/scripts/pipeline-update-channel.mjs` (channel resolution and the
distribution default), `plugins/pipeline-core/hooks/staleness-check.mjs` (the SessionStart
observation), `SETUP.md` (the Codex marketplace pin).

## Context

### What was measured, not assumed

`git ls-remote --heads origin` on 2026-09-01 returns `refs/heads/stable` and `refs/heads/main`
**at the same commit**, `dd1eb9ee`. The two refs are already identical; retiring one loses nothing.

The three channel names are not three branches. `selectedChannelTarget`
(`ruleset-freshness.mjs`, ~line 192) resolves:

```js
const selector = channel === "alpha" ? "refs/heads/main" : "refs/tags/*";
```

and `stable` then selects the highest tag whose `validTag(ref).beta === null` — i.e. the highest
final `vX.Y.Z`. So `stable` never resolved through the `stable` branch at all; it resolved through
tags. **Deleting the branch cannot break the stable channel**, which is what made this decision
cheap rather than risky. What the branch actually served was one thing: the Codex marketplace pin
in `SETUP.md` (`codex plugin marketplace add … --ref stable`).

### Why the current `alpha` is now wrong

`alpha` is hardcoded to `refs/heads/main`. Under this decision `main` becomes the *released* state,
so an `alpha` that points at `main` would report the release as the bleeding edge — the exact
inverse of what the channel means. This is not a cleanup; it is a correctness change forced by the
new topology.

### The conflict this decision had to resolve

`release-version-plan.mjs` already implements `beta` as a **prerelease tag** (`X.Y.Z-beta.N`,
`parsePromotionVersion`, ~line 111) and states outright that "alpha is not publishable"
(~line 122). A `beta` implemented as its own branch would be a second mechanism for a name that
already has a working one. The PO chose the tag mechanism (2026-09-01), so the release planner is
untouched by this decision.

## Decision

### D1 — `main` is the only published channel

Development happens locally and on feature branches. `main` carries releases. The `stable` branch
is retired; `SETUP.md`'s Codex marketplace pin moves to `main`. No consumer outside the PO has
installed against `stable` (PO, 2026-09-01), so no migration path is owed.

### D2 — `stable` resolves to the highest final release tag on `main`

Unchanged from today's behaviour: highest `vX.Y.Z` with no `-beta` component. This ADR records it
as the intended contract rather than an incidental one, and states that tags are cut on `main` —
deliberately WITHOUT adding a remote ancestry assertion, which would cost an extra `ls-remote`
round trip to re-prove something the release ceremony already guarantees.

### D3 — `alpha` is the working channel and names its own ref

`alpha` MUST NOT resolve to `refs/heads/main`. It resolves from one of two sources:

1. **A named feature branch** (`feat/sprint-nova-codex-v046`, `feat/sprint-alfred`, …), supplied by
   an optional persisted project field. Only a persisted project field may name it — no
   caller-provided ref crosses the resolver boundary, preserving the closed-input property
   `resolvePipelineUpdateChannelConfig`'s own comment already asserts.
2. **A local marketplace / self-development checkout with no such field set.** No remote comparison
   is made at all.

**These two are ordered, not alternatives — amended 2026-09-01, during implementation.** As first
written, this decision listed them the other way round and did not say which wins, which left a
real ambiguity: whether a self-development topology suppresses remote comparison even when a ref
IS configured. It does not. A configured ref always wins; the topology only decides what happens
in its absence. The reason is that `resolvePipelineUpdateChannel` defaults to `alpha` *only* under
`local-self-development` topology, so a topology gate would make this field unreachable in the one
habitat where `alpha` is the default — reproducing exactly the outcome the rejected alternative
"alpha makes no remote claim ever" was rejected for. The ambiguity was found by the implementing
dispatch rather than by review, and is recorded here rather than left to be re-derived from the
code.

When neither is available, `alpha` reports a typed "local, no remote claim" result. It never
fabricates a comparison against an arbitrary ref. A channel that cannot honestly answer "are you
behind?" must say so; answering against the wrong ref is worse than not answering.

The field accepts **any** branch name, `main` included, with no special case. Naming `main` as an
alpha ref is a legitimate configuration — it simply means the operator follows the released line
and will see an update only when a release lands, rather than on every commit of a working branch.
That is a quiet choice, not a misconfiguration, and the resolver must not second-guess it (PO,
2026-09-01).

### D4 — `beta` is reserved and inactive, with its own reason code

`beta` resolves to a typed **`channel-inactive`**, distinct from the existing
`channel-unavailable`. The distinction is load-bearing: `channel-unavailable` today means a
transient or environmental failure (`remote-unavailable`, `timeout`, an ambiguous tag set) and
invites a retry; `channel-inactive` means a deliberate, current product state and invites none.
Collapsing the two would tell an operator to retry their way out of a decision.

When beta is activated, its mechanism is already decided: prerelease tags `vX.Y.Z-beta.N` on
`main`, exactly as `release-version-plan.mjs` implements today. Activation is a configuration and
documentation change, not a new mechanism.

### D5 — A release tag must point at `main`, enforced where each half is actually enforceable

`stable` selects the highest final tag in the repository with no check that the tag sits on
`main`. Under D1, `main` is the only published channel, so a `v0.7.0` cut anywhere else would pull
every consumer onto a commit that was never released. Enforcement is deliberately split, because
neither available mechanism can carry it alone:

1. **Locally, before the push.** `guard-push.mjs` already resolves `refs/tags/<name>`
   (~line 466) and classifies tag patterns (`isTagPattern`, ~line 1160). A push of
   `refs/tags/v*` must additionally require that the tagged commit is reachable from
   `origin/main`, and refuse otherwise. The objects are already local, so this costs no network
   round trip, and it refuses before the tag exists on the remote.
2. **Remotely, as the backstop.** A tag ruleset on `v*` restricting who may create, update or
   delete matching tags. **A GitHub ruleset cannot express an ancestry condition** — this is
   stated explicitly so a future reader does not assume the remote is checking what only (1)
   checks. What the ruleset does is stop anyone outside the permitted set from creating a release
   tag at all; the repository currently has exactly one ruleset, `protect-main`, with
   `target: "branch"`, so tags are entirely unprotected today (measured 2026-09-01).

Deliberately NOT chosen: an ancestry check inside the channel resolver. It would re-prove at every
read, over the network, a property that is established once at write time — the wrong end of the
lifecycle, and the reason D2 leaves the resolver alone.

The honest limitation, recorded rather than glossed: (1) binds only sessions that run the
Pipeline's guards, and (2) cannot see ancestry. Together they cover the realistic failure — an
accidental tag from a working branch by someone using the Pipeline, and a deliberate tag by
someone who is not permitted to release. Neither covers a permitted human who bypasses their own
local guards.

## What this decision does NOT do

- **It does not change `release-version-plan.mjs`.** Beta prerelease tags remain a valid release
  mechanism; only the *update channel* named `beta` is inactive. How a release is cut and what a
  consumer follows are separate questions, and this decision touches only the second.
- **It does not add an auto-update path.** Freshness stays an observation, fail-open, per the
  superseded item's surviving requirement.
- **It does not delete the `stable` branch by itself.** That is an outward-facing act performed
  separately, after the documentation no longer points at it.

## Alternatives considered

### Rejected: keep `stable` as a branch alongside `main`

The measurement above shows the two refs already identical and the stable channel already
resolving through tags. The branch was a fourth pointer beside a channel model that was complete
without it, and its only real consumer was one line of `SETUP.md`.

### Rejected: `beta` as its own branch

Named by the PO as the intuitive shape, rejected on measurement: `release-version-plan.mjs`
already implements beta as prerelease tags, and a branch would duplicate it. It would also
reintroduce a distribution branch in the same decision that retires one.

### Rejected: `alpha` makes no remote claim ever

Simpler, and it would have needed no configuration surface. Rejected because a colleague working
on `feat/sprint-alfred` would then never learn that their branch is behind — the freshness check's
entire purpose, silently disabled for the channel where active development actually happens.

## Consequences

**Positive.** One published ref instead of two, with no divergence to keep in sync. The channel
model becomes three selectors over one history rather than a mix of branches and tags. `alpha`
stops misreporting the release as the bleeding edge.

**Negative.** `alpha` gains a configuration surface it did not have — one more field that can be
absent, stale, or name a deleted branch; the "local, no remote claim" result must therefore be a
first-class outcome and not an error path. `beta` carries a reason code for a state that is
currently unreachable in practice, which is dead surface until beta is activated — accepted
deliberately, because the alternative is to discover at activation time that the resolver has no
way to say "not yet".

## Follow-up

- Implementation: D3 (`alpha` ref resolution + project field), D4 (`channel-inactive`), D5's
  `guard-push.mjs` ancestry refusal, and the `SETUP.md` pin, with negative coverage for a named
  branch that no longer exists on the remote and for a `v*` tag whose commit is not reachable from
  `origin/main`.
- D5's remote half is a repository-administration act, not a code change: it is performed by the
  PO against the GitHub API, not by an agent.
- Re-triage `backlog/items/2026-08-27-all-three-runners-should-install-against-the-stable-branch.md`
  to record the mechanism change while preserving its fail-open freshness requirement.
- Retire `refs/heads/stable` on the remote once the documentation no longer references it.
