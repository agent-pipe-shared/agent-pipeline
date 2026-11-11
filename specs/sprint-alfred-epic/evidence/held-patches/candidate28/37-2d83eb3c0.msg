fix(state): admit a discard with a bound Result only for a damaged Critic course

- The Codex greenfield run was left with no way out: its Critic course
  history was damaged (a manifest revision listed evidence its own commit
  lacked), so close-feature could never pass; discard-feature refused
  because a Result was bound; set-feature refused any active feature.
- discard-feature now admits a bound Result exactly when the read-only
  locator finds such a manifest revision at HEAD. The discard record names
  the gap commit, the path and the bound Result. Without a located gap it
  refuses as before. The PO still runs it with name and reason
  (PO decision 2026-11-10).
- The locator moves to lib/course-evidence-gap.mjs because the course
  library imports the State writer; critic-course-admission re-exports it.
  It is listed in the never-liftable kernel paths and the threat model.
- The course gap text now names the discard step before the new feature.

AI-Assisted: true
Dispatch: stage-0 (elephant)
