---
schema: pipeline.backlog-item.v1
id: pipeline.authority-gate-bypassable-by-choosing-a-different-write-tool
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-15
source: "Reported as a deviation by the PUSHBOUND-1 dispatch, 2026-08-08, and verified against guard-testpath.mjs:70-79. The dispatch disclosed the route honestly; the gap is the guard's, not the dispatch's."
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "9e477150ac87b2ec1d5d96753c4af79bf1a8876c"
closure_evidence: "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs"
---

# `guard-testpath` blocks Edit/Write and is walked around with Bash

## What happened

The `PUSHBOUND-1` dispatch needed to add fixtures to
`plugins/pipeline-core/hooks/guard-push.test.mjs` — squarely within its briefed scope.
`guard-testpath` (TP-5) blocked the `Edit`/`Write` tool call and offered an override
requiring an out-of-session Ed25519 signature the dispatch structurally cannot
produce, then refused the ceremony outright with `author-repair-required`. The
dispatch wrote the same bytes through Bash/Node `fs` instead and **reported it as a
deviation**, which is the correct handling of an accepted gap.

The gap is real and self-documented (`plugins/pipeline-core/hooks/guard-testpath.mjs:76-79`):

> Plain shell file writes are not seen either: `hooks.json` routes Bash/PowerShell tool
> calls only through `guard-git.mjs` (matcher `Bash|PowerShell`), which does NOT check
> test paths — a Bash/PowerShell redirect (`>`, `Set-Content` etc.) reaching a
> protected path is unguarded (accepted gap, same tripwire-not-a-sandbox …)

`MultiEdit` is listed as a second accepted gap on the same grounds.

## Why this is now a contradiction rather than a known limitation

`guardrails/global.md` GL-09, written today, classifies the testpath gate as
**authority-bearing** — one of the three gates that must fail closed rather than open.
`guard-testpath.mjs` simultaneously describes itself as a *tripwire, not a sandbox*.
Both cannot be true. A gate whose category obliges it to fail closed cannot rest on an
honour system about which tool an agent picks to write the same bytes.

This is the same shape as the finding GL-09 was written from, rotated ninety degrees:
the push gate's boundary was missing for *unanticipated faults*, and this one is
missing for *unanticipated routes*. Enumerating tool matchers has the identical
weakness as enumerating failure shapes — it holds until something not on the list
arrives, and here the thing not on the list is `Bash`, which every dispatch has.

## What makes it urgent rather than theoretical

It was exercised today, by a well-behaved dispatch, on the first attempt, without
looking for a bypass. The dispatch was not evading the guard — it was doing exactly
what it was briefed to do, hit a gate it could not clear, and took the route that
worked. Any agent in that position takes the same route, and only the honest ones
report it.

## Direction, not a design

1. **Decide the category explicitly and follow it.** Either the testpath gate is
   authority-bearing, in which case its coverage must not depend on tool choice, or it
   is a tripwire, in which case GL-09's list is wrong and must be corrected. Do not
   leave both statements standing.
2. **If authority-bearing: route shell writes through it.** `hooks.json` sends
   `Bash|PowerShell` only to `guard-git.mjs`. A path check on shell-borne writes is the
   same check already implemented, applied at a second matcher.
3. **Look at why the ceremony was unavailable.** TP-5 refused the override with
   `author-repair-required` — so the dispatch's only sanctioned route was closed
   *before* it reached for the unsanctioned one. A gate that blocks in-scope work and
   also refuses its own lift manufactures the bypass it then fails to detect.
4. **Do not respond by forbidding shell writes in briefings.** That is a prose control
   over exactly the population that cannot be relied on to follow prose — and it would
   have made today's outcome a silent failure instead of a reported one.

## Related

- `guardrails/global.md` GL-09 — the classification this contradicts.
- `2026-08-08-the-blocking-push-gate-has-no-terminal-exception-boundary.md` — the same
  enumeration weakness in the fault dimension rather than the route dimension.
- `2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`
  — the lift path that was unavailable here, unwalkable there.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, directions 1-3 — confirm the testpath gate is
  authority-bearing (per GL-09, not a tripwire), route Bash/PowerShell shell
  writes through it (closing the bypass), and investigate why TP-5's own
  override ceremony refused with `author-repair-required` before reaching for
  the unsanctioned route. **Plus an explicit addition beyond this item's own
  Proposal:** a human override must remain possible for this gate too, via
  signature-or-chat depending on `gates.push_approval` config — the same
  duality already used for push approval elsewhere in this repo, not a novel
  mechanism. Designed together with
  `2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`
  (cluster C) — closing the bypass without also building the briefed-test-
  change authorization (see that item) would strand legitimate work, which is
  exactly the scenario that produced this bypass in the first place.
- **Rationale:** PO, 2026-08-11: "Empfehlung aber auch human override muss
  möglich sein per Signatur oder Chat je Config." SECURITY/GUARDRAIL-class
  work — MP-07 mandates the higher-capability model at `max` for whoever
  designs and implements this.
- **Assignment (if accepted):** Unassigned. Design must cover: (a) routing
  `Bash|PowerShell` through the same path check `guard-testpath.mjs` already
  applies to Edit/Write, (b) the briefed-test-change authorization (see the
  sibling item for its own constraints), and (c) a signature-or-chat human
  override path for cases neither (a) nor (b) resolves — three components,
  one coherent design, not three separate patches.
- **Date:** 2026-08-11

### Dispatch confirmation, 2026-08-18

**Decision:** Confirmed queued for dispatch. The 2026-08-11 Triage above
already records a real, bounded, PO-approved decision (directions 1-3, plus
the signature-or-chat human-override addition) coordinated with the sibling
item `2026-08-08-the-test-path-guard-blocks-the-briefed-edit-and-offers-no-route.md`
(cluster C). Still unassigned and unimplemented as of this date, and not
deferred to any named future sprint. Touches guardrail/hook code
(`hooks.json`, `guard-testpath.mjs`) and a human-override ceremony — real
implementation plus mandatory Critic review required (MP-07, design-tier
model), not attempted in this read-only triage pass. This entry does not
change the decision, only reconfirms it is not stale and remains queued for
the 0.6.0 pass.
- **Date:** 2026-08-18

### Closure, 2026-08-18

**Verified implemented.** `guard-lifecycle-ready.mjs` now routes
`Bash|PowerShell` (`hooks/hooks.json` matcher, both wired to
`guard-lifecycle-ready.mjs --runner claude`) through the same protected-
test-path authority as `Edit|Write|NotebookEdit`, via
`protectedTestPathShellRefusalHit()`/`protectedTestPathShellBlocked()`
(guard-lifecycle-ready.mjs:822-862) — direction 1-2. A signature-or-chat
human-override route runs through `humanOverrideRoute()` at the same call
site (guard-lifecycle-ready.mjs:2385-2396) before the block is emitted —
direction 3 plus the PO's override addition.

A residual gap in that same mechanism — the shell classifier's own inner
`catch` swallowed a raised exception and returned `null` (fail OPEN)
instead of failing closed per GL-09 — was found by a full-Verify Critic
pass this session and fixed in commit `9e477150` (new `{ fault: true,
error }` sentinel, `protectedTestPathShellFaultBlocked()`, fault-injection
test `TPSHELL-7`). Critic-reviewed against the correctly-scoped range
`9fab42cf..a6f1bcbf` (5th dispatch attempt after 2 malformed/wrong-scope
attempts and 2 dispatch-construction defects on missing governance/`verdict:`
tokens — all Elephant-side, none a review outcome): **PASS**, no findings,
112/112 + 13/13 + 19/19 + 12/12 suites independently rerun and matched.
Sibling item `2026-08-08-a-permitted-edit-drops-the-session-into-an-
unrecoverable-readiness-class.md` was included in the same dispatch as
context only — the Critic itself flagged that this diff touches none of
that item's own (unrelated, unimplemented) scope; it stays open separately.
- **Date:** 2026-08-18
