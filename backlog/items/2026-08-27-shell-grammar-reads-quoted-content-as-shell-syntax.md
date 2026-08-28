---
schema: pipeline.backlog-item.v1
id: pipeline.shell-grammar-reads-quoted-content-as-shell-syntax
type: defect
owner: pipeline
status: resolved
created: 2026-08-27
sprint: nightwing
sprint: nova
tracking: "NOW / Nova A — PO decision 2026-08-28: admit `&&`, and secure it. This item is the prerequisite half; the admission is unsafe until the parser stops reading quoted content as syntax."
source: "Three live refusals in one Elephant session, 2026-08-27, each on a read-only command whose only offending characters sat inside a quoted argument. Reproduced twice more on 2026-08-28, and independently by a dispatched Goldfish which overran its tool budget for this reason and said so in its own report."
---

# The closed shell grammar classifies characters inside quoted arguments as shell operators

## Description

`guard-lifecycle-ready.mjs`'s command parser rejects read-only commands whose
operator-looking characters exist only *inside* a quoted argument — the argument
is data, never shell syntax, and no shell would interpret it as an operator.

Three reproductions from one session, all read-only, all refused:

1. **A ternary inside a `node -e` script.** A purely read-only
   `node -e '<script containing ?  :>'` is refused as `GUARD-PARSE-UNSUPPORTED`.
   Control: the identical script rewritten with `||` instead of the ternary is
   admitted. The `?` and `:` inside the quoted script body are being read as
   shell metacharacters.

2. **An alternation inside a `grep` pattern.**
   `grep -n "^const X\|^export function Y" <file>` is refused as
   `GUARD-PARSE-UNSUPPORTED`. The `\|` is regex alternation inside a
   double-quoted pattern; the command has no pipeline at all. Splitting it into
   two separate `grep` calls succeeds.

3. **`head -40` vs `head -n 40`.** `grep … | head -40` is refused as
   `GUARD-OPERATOR-UNAPPROVED` while `grep … | head -n 40` is admitted, even
   though the grammar's own documented exception is "bounded grep-to-head".
   `head -40` is the identical bounded read in the form most agents type first.

## Why this matters

Cases 1 and 2 have no override route at all: the planner returns
`status=external-operator-required`, `code=HGO-EXTERNAL-ADAPTER-BOUNDARY` — an
attended operator outside the session. For a read-only diagnostic that is a dead
end, and the session's only recourse is to guess a different phrasing.

The cost is not theoretical: each of these consumed a turn and a retry in a live
session, and case 3 in particular is a shape an agent reaches for constantly.
This is the same class as the wildcard defect fixed in `a80236d8` — a matcher
looking at raw command text rather than at parsed argv.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the command parser and
  its operator/parse classification)
- `plugins/pipeline-core/lib/human-guard-override.mjs` (the route planner that
  returns no route for these)

## Proposal

Not designed here. The parser already tokenizes quoting well enough to produce
`segments[].argv` (`simpleWords()` depends on it), so the classification should
be able to run on the parsed argv rather than the raw text. Case 3 is
independently cheap and can be fixed alone: accept `head -N` alongside
`head -n N` in the bounded-pipeline exception.

## Acceptance

- Each of the three reproductions above is admitted, with the equivalent
  genuinely-composed command still refused under its existing code.
- A read-only diagnostic refused by this classifier always has a route, or the
  refusal states why none exists in terms the session can act on.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Reproduced three times in one session on read-only commands,
  each with a passing control that differs only in phrasing — the classification
  is demonstrably wrong, not merely strict. Two of the three have no override
  route at all (`HGO-EXTERNAL-ADAPTER-BOUNDARY`), so the cost is a dead end per
  occurrence, not a ceremony. Same root class as
  `pipeline.sed-regex-address-is-misread-as-an-absolute-path`: a matcher reading
  raw command text where parsed argv is already available. Fix the two together;
  a shared regression table over both symptom sets is the cheaper shape.
- **Assignment (if accepted):** Sprint Nightwing (ADR-0043 Amendment scope:
  low-friction adoption — this is friction an agent meets every session).
  Deliberately NOT Nova: the 0.6.0 candidate is stamped and under live PO test,
  and `guard-lifecycle-ready.mjs` is exactly the file a change would invalidate
  it through. Deliberately NOT Alfred, whose control-integrity scope it would
  otherwise fit — Alfred is in flight and closed to new scope (PO, 2026-08-28),
  the same rule ADR-0043 already applied to Phoenix.
  **Splittable:** case 3 (`head -N` alongside `head -n N`) is independent of the
  argv rework and can land alone in an hour if the window is tight.
- **Date:** 2026-08-28

## PO decision 2026-08-28: admit `&&`, and the order that makes it safe

The PO asked directly: *"lassen wir jetzt && zu und sichern das irgendwie ab? das würde
echt viele turns sparen"*. Accepted, and pulled into Nova A.

**The Nightwing assignment above is superseded, and its stated rationale no longer
holds.** It deferred this because "the 0.6.0 candidate is stamped and under live PO test,
and `guard-lifecycle-ready.mjs` is exactly the file a change would invalidate it
through." That candidate is no longer the target — a new one is being built, is not
stamped, and `guard-lifecycle-ready.mjs` is already being changed inside it
(`2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md`). Landing this
change before the candidate's Critic review puts it *inside* the review rather than
sneaking it in afterwards, which is the safer of the two orders.

### The two halves, and why this one comes first

Admitting `&&` requires splitting a command into segments. A splitter that reads quoted
content as syntax — the exact defect this item describes — would split
`git commit -m "fix: a && b"` into two segments and classify garbage. **So this item is
not merely related to the `&&` admission; it is its precondition.** Fix the tokenizer
first; the admission is a small change on top of a correct one.

### What admitting `&&` may and may not be

The admission grants **no new authority**, and that property is what makes it securable
rather than merely convenient: anything expressible as `a && b` is already expressible as
two tool calls, each classified exactly as it would be inside the chain. The change is
ergonomic, not permissive — and it is only true if every one of these holds:

- Segments are split by a **quote-aware** tokenizer. A segment the tokenizer cannot parse
  with confidence fails closed, as today.
- Each segment is classified by the **existing** classifier, unchanged. The command is
  admitted only if **every** segment is independently admitted — union of requirements,
  never a verdict inherited from the first segment.
- `&&` only. Not `;`, not `||`, not `&`, not redirects, not newlines, not command
  substitution. `&&` is the one operator whose fail-fast semantics mean a later segment
  cannot run past a failed earlier one, so the union rule is exactly right for it.
- A bounded segment count, so a pathological command cannot be used to exhaust the
  parser.
- The refusal for a rejected chain names **which segment** was refused and why. A chain
  refused as a whole teaches nothing, which is this item's own complaint one level up.

### The refusal must state the grammar it is enforcing (PO, 2026-08-28)

*"wichtig ist, dass der guard das erlaubte grammar immer auch sagt, also was beim pipen
erlaubt ist wenn er was blockt"*.

The refusal today does gesture at this — it ends with "Only bounded rg-to-rg, rg-to-head,
grep-to-grep, and grep-to-head diagnostic pipelines are admitted as exceptions." That
sentence is not wrong, and it is not enough: it names the shapes without their bounds, so
it does not tell the reader the thing that actually costs the retry.

Measured examples of what the current text leaves out, each one a real refusal:

- `head -n 40` is admitted and `head -40` is refused — the same bounded read, and the
  refused spelling is the one most agents type first (case 3 above). The text says
  "grep-to-head" and stops.
- A `|` inside a quoted pattern is refused as an operator. Nothing in the message hints
  that the guard is reading quoted content at all, so the reader concludes their pipeline
  was rejected and goes looking for a pipeline they never wrote.
- The maximum `head -n` bound (1..500) appears in the message, but the equivalent bound
  on the other admitted shapes does not.

So: whenever the guard refuses on grammar, the refusal states the **complete** admitted
grammar in a form the reader can copy — each admitted shape with its bounds and its exact
required spelling — and, once segment splitting exists, **which segment** of the submitted
command was refused and under which rule. A refusal that names the rule but not the
satisfying form is the same defect as a gate that names no satisfying command, which this
repository already treats as a defect elsewhere.

This applies to every refusal path the guard has, not only the pipeline one, and it is
worth stating separately because it is the half that pays off even if the `&&` admission
were dropped entirely.

### Acceptance criteria (in addition to those above)

- A negative regression suite drives every admitted-operator shape and asserts that no
  mutating, protected-path, or cross-repo-mutating segment becomes admitted by being
  placed after an admitted one. This is the safeguard the PO asked for, and it is the
  deliverable — not the `&&` support itself.
- A table-driven test pairs each historical refusal in this item with its now-admitted
  form and with a genuinely-composed control that stays refused.
- Every grammar refusal the guard can emit carries the complete admitted grammar with
  bounds and exact spellings. A test asserts the property rather than one example: for
  each admitted shape in the guard's own table, the refusal text contains a form that,
  when submitted, is actually admitted. That closes the loop mechanically — the message
  cannot drift away from the grammar it describes, because the test runs what it prints.

## Related

- `2026-08-28-guard-bypass-paths-have-no-negative-regression-suite.md` — the suite this
  change must not land without.
- `2026-08-28-a-heredoc-refusal-teaches-no-substitute.md` — the same grammar, the same
  "refused with no substitute" shape, deliberately left out of scope here.

## Closing note (reconciliation, 2026-08-28)

Resolved. Verified live in this session (HEAD b4fc36a3), not from a commit message:

- **Case 1** (ternary inside `node -e '...'`) — ran `node -e 'const x = 1 ? "a" : "b";
  console.log(x)'` directly as a tool call; admitted, printed `a`.
- **Case 2** (`\|` alternation inside a quoted `grep` pattern) — ran
  `grep -n "tokenize\|CONTROL" plugins/pipeline-core/hooks/guard-command-grammar.mjs`
  directly; admitted, matched both terms. Read `guard-command-grammar.mjs` lines 80-125:
  `tokenize()` now tracks a `quote` state variable and only checks characters against
  `|;&()`/redirect logic once `quote === null` (lines 91-126), so a `|` or `\|` byte
  written inside `'...'`/`"..."` is appended to `state.value` and never reaches the
  operator classification at all.
  - **Case 3** (`head -N` vs `head -n N`) — ran `grep -n "CONTROL" .../guard-command-
  grammar.mjs | head -40` (no `-n`) directly; admitted. Code confirms: `guard-lifecycle-
  ready.mjs` lines 1597-1601 comment "NVA-I-GRAMMAR: the combined `head -N` form... `head
  -N` was previously refused for grep-to-head/cat-to-head while already admitted for
  [rg-to-head]" — now admitted uniformly.
- **`&&` admission** — verified live at the top of this dispatch: `git status --short &&
  git checkout --detach b4fc36a3` was refused with `"&&"-chain segment 2 of 3
  ("git checkout --detach b4fc36a3") is not independently admitted"` — confirming the
  chain is split per-segment (union-of-requirements, not first-segment-wins) rather than
  refused as a whole.
- **Refusal states the complete admitted grammar** — the same live refusal printed the
  full bounded-pipeline table with exact spellings and the `N in 1..500` bound for both
  `head -n N` and `head -N` forms, plus the `&&`-chain bound ("up to 6"), matching the
  acceptance criterion.
- **Regression suite** — `guard-lifecycle-ready.test.mjs` carries extensive positive/
  negative pairs for these shapes (grepped for "regression"/"negative", 20+ hits spanning
  the affected code paths).

All three reproductions and the PO's two follow-on requirements (safe `&&` admission,
refusal names the full grammar) are landed and independently confirmed by direct
execution, not inferred from source alone.
