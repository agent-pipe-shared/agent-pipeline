---
schema: pipeline.backlog-item.v1
id: pipeline.shell-grammar-reads-quoted-content-as-shell-syntax
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
source: "Three live refusals in one Elephant session, 2026-08-27, each on a read-only command whose only offending characters sat inside a quoted argument."
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
