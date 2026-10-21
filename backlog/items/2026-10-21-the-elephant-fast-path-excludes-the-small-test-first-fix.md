---
schema: pipeline.backlog-item.v1
id: pipeline.the-elephant-fast-path-excludes-the-small-test-first-fix
type: requirement
owner: pipeline
status: open
created: 2026-10-21
source: "PO question 2026-10-21: 'gibt es einen Grund alles im Elephant zu machen? ... wenn es zu kleine Sachen sind, sollte der Elephant die selber machen'; PO: create the item"
sprint: none
done_when: manual
---

# The Elephant fast-path excludes the small test-first fix

## Description

`roles/elephant.md` EL-01 forbids production code in the Elephant session and allows one
exception, the rigor-0 stage-0 fast-path: all of at most 2 files, at most about 25 diff lines, no
architecture, schema, public-API, **test**, guardrail-hook-CI, dependency or security-surface
change, trivially revertable, no risk flag. The clarification under EL-01 adds that a lifted guard
does not extend this exception, and that "small, mechanical, no design latitude" is only the
`goldfish-mechanic` tier criterion.

The criteria exclude the most common small change in this repository: a test pin plus the one-line
fix it pins, which QG-04 and QG-07 require to come together (RED before the fix, one owner). Every
such fix therefore needs either a Goldfish dispatch with a full read-in, or a PO exception granted
in chat. Sprint Alfred worked the second way: the Elephant applied about thirty prepared patches
(PO exceptions of 2026-10-20 (Q14 (a), D57) and 2026-10-21 (lock)), and several commits carry the
`Dispatch: stage-0 (elephant)` trailer on diffs that are outside the fast-path definition. The
commit text of `21fba99dc` records the gap ("the installed commit guard predates the
elephant-exception trailer, so the stage-0 trailer stands in for it"). The authorship check at
close cannot tell a ratified exception from a violation.

The PO's position (2026-10-21): small things should be done by the Elephant, larger ones by a
Goldfish.

## Proposal

Pick one, with the PO:

1. Widen the fast-path by one named class, the **test-first pair**: one test change plus the
   minimal production change it pins, at most a stated size (for example 2 production files and
   about 40 diff lines in total), RED run before the fix recorded, outside protected paths
   (PB-*), guard hooks, security surfaces, schemas and public APIs. The class keeps `verify` and the
   evidence artifact mandatory.
2. Keep EL-01 as it is and record each Elephant exception as a decision-register entry with scope
   (patch list or item ids), ratified by the PO once, instead of per chat remark. Add the
   `Elephant-Exception: <decision id>` trailer the commit guard should accept, so the authorship check
   can verify it.
3. Both: option 2 for planned batches, option 1 for single fixes.

Design principle (PO, 2026-10-21): do not over-restrict. Flexibility is wanted as long as the
deviation is **conscious**. The rule therefore makes a deliberate exception cheap and visible, not
forbidden:

- A size bound is guidance that decides where the **default** lies (Elephant for the small
  test-first pair, Goldfish above it); it is not a hard gate. An Elephant that judges a larger
  change right to do itself says so in the trailer and the reason (one line), and proceeds.
- The authorship check at close **reports** an undeclared Elephant diff outside the fast-path as a
  finding for the PO; it never refuses a commit and never blocks a close for a declared one.
- Protected paths, guard hooks and security surfaces keep their own gates (signature or human
  operator); this item does not loosen them and does not add a second gate on top of them.
- No new approval step: the declaration is part of the commit, not a separate ceremony.

In every option the check must be able to verify the declaration mechanically (a trailer that
names the class or the decision id, plus a one-line reason), not by reading chat.

## Acceptance

- `roles/elephant.md` EL-01 (and its generated bootstrap block) names the chosen exception class or
  decision route, the default size guidance, and states that a conscious, declared deviation is
  allowed.
- The authorship check at close accepts a commit carrying the declaration and reports the same
  diff without it as a finding (warn, not refuse).
- A pin covers one declared case (accepted) and one undeclared case (reported), both outside the
  fast-path bound.
