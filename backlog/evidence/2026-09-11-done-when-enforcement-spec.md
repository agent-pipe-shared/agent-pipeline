# Required `done_when` enforcement review brief

Review the fixed candidate against these criteria:

1. An `open` or `in_progress` backlog item without a `done_when` declaration
   is classified `UNDECLARED` and makes the checker fail.
2. Undeclared items in non-open statuses remain counted but non-fatal.
3. `MALFORMED`, `STALE-OPEN`, and `REGRESSION` behavior remains unchanged.
4. The source contains the graduation marker
   `pipeline.undeclared-is-fatal` named by the approved backlog predicate.
5. Tests cover the fatal open case and preserve the non-fatal disposition of
   rejected and deferred items.
6. The repository's current backlog passes the graduated check, demonstrating
   that no open or in-progress item is left undeclared.

Rollback is a normal revert of the implementation commit. It restores advisory
reporting for open undeclared items and requires no data or ledger migration.

