fix(audit): read every lineage segment whole and judge completeness by unread bytes and unknown children

Codex greenfield run 3 (C1): audit-current read large session files by
head and tail windows only (about 33.9 MB of middles skipped), still
said complete, and exact turn, tool and token counts stayed unknown.
PO tile 2026-11-13: full paginated export of all segments and children
with an offset/hash check; unread bytes and unknown children must be 0,
partial sums labelled partial.

- observe() reads [0, snapshot size) page by page (windowBytes per page)
  with one running sha256 (contentSha256, pages, snapshotBytes). A record
  split by a page boundary is carried; one longer than recordBytes is
  read and hashed but counted unparsed once. An in-progress last line
  (trailingPartialBytes) and bytes appended during the read are not
  unread. Memory stays one page plus one record.
- Per segment: turnCount, toolCallCount, spawnedChildren.
- One verdict, auditCompleteness: complete only with 0 unread bytes, 0
  unknown children and no other reason. A member over the byte bound
  (now 1 GiB for all non-current members) is not read and its whole size
  is counted unread (unreadSegments, segment-bytes-unread).
- A child a lineage member spawned (its spawn result names the agent id)
  but whose session file is not in the lineage is counted: in another
  repository as outsideChildren, otherwise as unknownChildren. Only
  counts leave the module, never ids.
- totals (records, turns, tool calls, token delta) carry status complete
  or partial.
- Later session_meta records no longer fail the current segment unless
  they claim another working directory for the same id.
- Pin restated (head-and-tail case is now a whole read) plus three C29-C1
  cases.

Checkpoint-Intent: candidate 29c, Codex run 3 C1 (audit-current)
AI-Assisted: true
Dispatch: stage-0 (elephant)
