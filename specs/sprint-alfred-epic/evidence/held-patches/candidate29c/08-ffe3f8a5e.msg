fix(transcript-export): open parent-linked children beyond the bound and type outside children

Follow-up to the C1 export name index. A Codex child can be known only
through its own parent_thread_id, with no agent id in the parent. Beyond
the candidate bound such a child was never opened, yet the export could
say complete.

- Every rollout file beyond the bound that sorts after the session's
  oldest segment is authenticated as a candidate too (a child cannot
  predate its parent); the bound is only lifted when the session's own
  segments carry rollout names.
- A spawned child whose session file exists by name but belongs to
  another repository is counted as outsideChildren with reason
  child-outside-repository, as audit-current already does; unknown
  children are only those with no session file at all.
- A session whose files all lie beyond the newest-first bound is found
  by name instead of being typed no-prior-project-matching-transcript.
- Two more C29-C1 tests; key list gains outsideChildren.

Checkpoint-Intent: candidate 29c, Codex run 3 C1 (export)
AI-Assisted: true
Dispatch: stage-0 (elephant)
