# Counted pin runs, 2026-10-19

Two orchestrator sweeps on WSL Linux. Each test file the item readers mapped to an item was run
once with `node <file>` under a private TMPDIR outside the checkout. The counts come from the
Node test runner's own summary lines.

| File | Items | Head | Test files | Items with every mapped file green |
|---|---|---|---|---|
| `class-a-evidence-items.json` | 45 (items whose open agent work was evidence only) | b8ca8fada | see file | 37 |
| `class-b-implementation-items.json` | 97 (items with open implementation work) | f6e71163d | 168 | 59 |

"All green" is not acceptance. Each item row keeps the reader's `uncovered` clauses, and an
item with uncovered clauses still needs work or a decision. Critic review and PO acceptance
are separate gates.

The class B sweep ran while other Goldfish dispatches were editing disjoint files in the same
checkout. A red file is re-run before anyone works on it.
