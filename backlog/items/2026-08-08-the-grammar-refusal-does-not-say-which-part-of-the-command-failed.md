---
schema: pipeline.backlog-item.v1
id: pipeline.grammar-refusal-does-not-say-which-part-failed
type: defect
owner: pipeline
status: closed
created: 2026-08-08
closed_at: 2026-08-18
closure_repository: self
closure_commit: 8e2d21ca9c8205e7b23b2d3d7b5d78288c237104
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
due: 2026-08-22
source: "Found by REPAIRMAP-1 while building the repair map, and immediately suffered by that same dispatch: it lost its own final commit to this refusal after 40 tool uses of otherwise-good work."
---

# The grammar refusal names the rule but not the part of the command that broke it

## What happens

`git commit -m "line one↵↵line two"` is refused with `GUARD-PARSE-UNSUPPORTED`.
The refusal states the rule correctly — one simple command, no operators, no
redirects — and prints `"retryActions":[]`, so it names no narrower path at all.
What it never says is the one thing the caller needs: **the newline inside the
`-m` value is the problem**, and `git commit -F <file>` is the shape that works.

Every agent that has to write a commit message longer than one line meets this,
and each one rediscovers `-F` by trial. The dispatch that found it lost its own
commit to it after forty tool uses of otherwise-finished work — the file was
staged, the suites were green, and the report had to be reconstructed by the
dispatcher from the working tree.

## Why the empty `retryActions` is the specific defect

The guard already has the machinery to do better: other denials in the same file
emit typed `retryActions` naming exactly what may be run instead. Here the block
is present and empty, which reads as "there is no narrower path" when in fact
there is a completely ordinary one. An empty list is a claim, not a silence.

## A second claim recorded here on 2026-08-08, which is false — withdrawn 2026-08-09

The withdrawn claim was that the two grammar codes differ in liftability:
`GUARD-OPERATOR-UNAPPROVED` offering a human override route while
`GUARD-PARSE-UNSUPPORTED` does not, so the map's single grammar row could not
say both and needed splitting.

**Measured, and it does not hold.** Both grammar branches call the identical
function with the identical arguments — `guard-lifecycle-ready.mjs:1686` and
`:1701` are `humanOverrideRoute(code, …, "command", root, toolName,
input.tool_input, dependencies)`. Inside `humanOverrideRoute` (`:275-335`) the
`code` parameter is read exactly once, at `:288`, inside a message string — it
never reaches a condition. The route itself is decided by
`consumeHumanGuardOverride` and `recordHumanGuardDenial`, both of which are
handed the tool input and the project root, not the denial code. The same
block's own test pins it: at
`guard-lifecycle-ready.test.mjs:831` and `:838` one fixture yields
`Human override available for this exact command` for **both** codes.

The counterexample in the other direction was in hand and misread. On
2026-08-09 an operator-class refusal (`rg … | head`, `GUARD-OPERATOR-UNAPPROVED`)
printed *"No human override route is offered for this exact command"* with
`status=external-operator-required`, `HGO-EXTERNAL-PROJECT-BOUNDARY` — the exact
behaviour the withdrawn claim attributed exclusively to the other code.

So the map's single grammar row was never wrong for one code and right for the
other. It is coarse in a different way: it answers per code, while the guards
answer per invocation. That is a real limitation and it is not the one recorded
here in error.

**Why the mistake is worth keeping visible.** It was written into two commit
messages and this item before anything measured it, and it survived because the
map was built to read the planner rather than to re-state a rule — the one
design decision that stopped it from propagating into shipped code. A reader
that asserts a distinction the enforcing code does not make is worse than the
coarse row it would have replaced.

## Partially fixed 2026-08-09 (`53aa19a`), and the fix has a visible seam

The refusal now names the rejected element, at both grammar call sites
(`guard-lifecycle-ready.mjs:1695` and `:1706`, via `rejectedGrammarElement()`),
and the newline-in-`-m` case carries a real typed retry action. Proven
behaviour-neutral by `harness/scripts/guard-grammar-differential.mjs`: 30 command
shapes, 9 admitted before and after, 0 reclassified.

**What is still open, and it is the original defect in a narrower place.** The
two call sites are not symmetric:

- `:1693` — `GUARD-PARSE-UNSUPPORTED` passes
  `retryActionsForDeniedCommand(command, root)`.
- `:1706` — `GUARD-OPERATOR-UNAPPROVED` and `GUARD-REDIRECT-UNAPPROVED` pass a
  literal `[]`.

So an operator or redirect refusal still prints `"retryActions":[]` — a claim
that no narrower path exists — without ever asking whether one does. Whether
`retryActionsForDeniedCommand` would return anything useful for those shapes is
the measurement to take first; if it would, the fix is passing it. If it would
not, the honest fix is saying so rather than printing an empty list that reads as
a checked answer.

**A confirmation worth keeping, from chasing this.** A Critic reviewing the block
noticed that a live refusal in that same session carried no `Rejected element:`
line, which looked like the fix not being wired. It is wired; the *installed*
plugin copy had not been synced from the checkout yet. That is the expected state
between a commit and the operator's `rsync` + `/reload-plugins`, and it is worth
recording because it means **no observation of guard behaviour from inside a
session is evidence about the committed code until that sync has run** — a trap
for exactly this kind of review.

## Direction

1. **Name the failing element, not just the rule.** The parser already knows
   which token or construct it rejected; saying so costs nothing and is the
   difference between one retry and five.
2. **Emit a real `retryActions` for the newline-in-`-m` case** — `-F <file>` is a
   fixed, safe alternative and the guard can name it.
3. ~~Split the map's grammar row so each code carries its own liftability
   answer.~~ **Withdrawn 2026-08-09** — the premise is false, see the section
   above. If the row is refined at all, the axis is per-invocation, not per
   code, and that means the map would have to be handed a command rather than
   asked for a table.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  general case. This is its sharpest single instance: the rule is unstated *and*
  the refusal does not teach it.
- `2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`
  — same shape, different audience.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, remains open in current backlog (not deferred).
- **Rationale:** re-verified live, 2026-08-17: the asymmetry described under
  "What is still open" is unchanged at current line numbers (the file has
  moved since filing) — `guard-lifecycle-ready.mjs:2089` still passes
  `retryActionsForDeniedCommand(...)` for `GUARD-PARSE-UNSUPPORTED`, while
  `:2111` still passes a literal `[]` for `GUARD-OPERATOR-UNAPPROVED` /
  `GUARD-REDIRECT-UNAPPROVED`. This is minor day-to-day agent-ergonomics
  friction affecting every session that hits an operator/redirect refusal
  (a common occurrence, as this very triage pass repeatedly demonstrated),
  cross-cutting rather than tied to a future sprint's scope — worth a cheap
  `goldfish-mechanic`/`goldfish-implementor` pass once picked up: measure
  whether `retryActionsForDeniedCommand` would return anything useful for
  operator/redirect shapes, then either pass it through symmetrically or
  document why not.
- **Assignment (if accepted):** unassigned, next available implement slot.
- **Date:** 2026-08-17

### Closed 2026-08-18 (overnight AFK block, NVA-MICRO-3)

Measured, per Direction: every command reaching the
GUARD-OPERATOR-UNAPPROVED/GUARD-REDIRECT-UNAPPROVED branch has an accepted
parse containing at least one of `|&<>()`, and `retryActionsForDeniedCommand`
returns `[]` unconditionally on the first such character (its per-part
recovery only ever handles `;`/newline-joined segments) — confirmed
empirically across `&&`, `|`, `>`, `2>&1`, `| tee`. Wiring the call through
would be dead code, not a fix, so the outcome is a confirmed non-fix: the
literal `[]` stays, with a one-line comment now stating why. No behavior
change. Independently re-verified: `node --test
plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` → 96/96 green.
