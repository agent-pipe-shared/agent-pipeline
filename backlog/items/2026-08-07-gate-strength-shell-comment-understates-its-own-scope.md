---
schema: pipeline.backlog-item.v1
id: pipeline.gate-strength-shell-comment-understates-its-own-scope
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Adjacent finding by the Elephant while verifying the GMW lift question for the WP2-WP3 Part A residuals (2026-08-07). Verified against the code, not assumed. Recorded rather than fixed because the affected file is a NEVER_LIFTABLE_KERNEL_PATH and cannot be edited in-session.
---

# The gate-strength shell lane's scope comment says "five paths (GS-1..GS-5)" while the code covers seven, including product source

## Description

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:197` opens the needle
construction in `gateStrengthShellRefusal` with:

> `// Scoped to the five configuration paths (GS-1..GS-5) deliberately.`

Two lines below, `:206` derives the needles from the **whole** imported table:

```js
const needles = GATE_STRENGTH_PATHS.map((rule) => basename(rule.path));
```

`GATE_STRENGTH_PATHS` (`plugins/pipeline-core/hooks/guard-gate-strength.mjs:51-98`)
carries **seven** entries today, not five: GS-1..GS-5, then GS-7
(`.claude/guard-config.json`, added by Critic finding F5 on `511d7d7`) and GS-8
(`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, added by the
Part A origin-allowlist work). The comment predates both additions and was not
updated when the table grew — the code was correct each time, only its stated
scope was left behind.

The mismatch is not merely cosmetic in two respects:

1. **The count is wrong** (five vs. seven).
2. **The characterization is wrong.** The comment calls them "configuration
   paths". GS-8's entry says of itself that it is "the first entry in this
   table protecting product *source* rather than project configuration"
   (`guard-gate-strength.mjs:88-90`). A reader who trusts the comment will
   conclude that a shell command naming a plugin *source* file cannot be a
   gate-strength needle. It can: `basename` of GS-8's path is
   `public-core-origin-allowlist.mjs`, so any non-diagnostic shell command
   naming that file — including a `git commit -m` message that mentions it — is
   refused with `GUARD-GATE-STRENGTH-SHELL`.

That last consequence is the operationally surprising one. The same over-refusal
for the configuration paths is documented deliberately in the SHAPE paragraph
(`:187-192`, "a `git commit -m` message merely naming one of these files is
refused too. Over-refusal costs a `-F` flag; under-refusal costs the gate"), and
this session hit exactly that on a commit message naming a GS-4 path. The
documented rationale still holds for GS-8 — but a maintainer reading `:197`
would not expect a source filename to be in the set at all, so the surprise is
undocumented where it is most likely to be encountered.

## Triggering situation

Found on 2026-08-07 while reading `guard-lifecycle-ready.mjs` and
`guard-gate-strength.mjs` end-to-end to answer, from source rather than from
memory, whether a Guard Maintenance Window (ADR-0058) can lift TP-11 — the
question the PO made the GMW rollout conditional on. The lift answer was
established independently; this is an adjacent defect noticed in passing and
deliberately not fixed inside that unrelated task.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:197-205` (the stale
scope comment) and, as the authority it misdescribes,
`plugins/pipeline-core/hooks/guard-gate-strength.mjs:51-98`
(`GATE_STRENGTH_PATHS`, seven entries) plus `:88-90` (GS-8's own statement that
it is product source, not configuration).

## Why this was not fixed in-session

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` is listed in
`NEVER_LIFTABLE_KERNEL_PATHS`
(`plugins/pipeline-core/lib/guard-maintenance-window.mjs`), so it is refused
even under an active Guard Maintenance Window, and this repository runs
`gates.push_approval: signature`. The refusal is correct and is not itself the
defect: a comment fix is a change to the guard kernel, and the kernel's whole
premise is that an agent does not edit it in the session it is enforcing.

## Proposal

**Owner: PO / next guard-kernel change window.** Small and self-contained; it
should ride along with the next reviewed change to this file rather than
justify its own dispatch.

1. Replace the `:197` scope sentence with one that does not restate a count or
   a category the code derives dynamically — e.g. "Needles are every entry of
   `GATE_STRENGTH_PATHS`, by basename." A comment that names no number cannot
   go stale the next time the table grows, which is the actual failure mode
   here (it has now drifted twice, on GS-7 and again on GS-8).
2. Keep the GS-6 exclusion rationale at `:198-205` verbatim — it is accurate,
   load-bearing, and explains a genuine design decision (matching the live
   plugin root would refuse the bootstrap command the gate itself instructs the
   operator to run).
3. Extend the SHAPE paragraph's over-refusal note (`:189-191`) by one clause so
   the product-source case is explicit: a shell command or commit message
   naming a protected *source* file, not only a configuration file, is refused.

No behavior change is proposed. The code is correct as written; only its
self-description is not.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
