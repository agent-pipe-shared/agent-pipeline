---
schema: pipeline.backlog-item.v1
id: pipeline.grammar-refusal-does-not-say-which-part-failed
type: defect
owner: pipeline
status: open
created: 2026-08-08
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

## A second, related coarseness the repair map exposed

The map has one row for the grammar class, and the guards have two behaviours
under it:

- `GUARD-OPERATOR-UNAPPROVED` (a `|`, `&&` or redirect) **does** offer a human
  override route, and prints the full plan/prepare/authorize sequence.
- `GUARD-PARSE-UNSUPPORTED` (the command does not parse into the closed grammar
  at all) **does not** — the planner returns `external-operator-required`.

One row cannot say both, so the map currently reports the class as never
liftable, which is right for one code and wrong for the other. The map is a
reader and was correctly not allowed to change a guard, so this is recorded here
rather than patched there.

## Direction

1. **Name the failing element, not just the rule.** The parser already knows
   which token or construct it rejected; saying so costs nothing and is the
   difference between one retry and five.
2. **Emit a real `retryActions` for the newline-in-`-m` case** — `-F <file>` is a
   fixed, safe alternative and the guard can name it.
3. **Split the map's grammar row** once (1) and (2) land, so each code carries its
   own liftability answer.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  general case. This is its sharpest single instance: the rule is unstated *and*
  the refusal does not teach it.
- `2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md`
  — same shape, different audience.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
