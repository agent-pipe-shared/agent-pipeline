# PO list collected during the AFK window (2026-10-22 night onward)

Goal: the content-final local 0.7.0 / Alfred test candidate, built without the PO. Nothing on this list blocks the work; it is
presented only on request. Each entry names the evidence and a recommendation. Carried over from the session-cut block in
`docs/state.md` are the five items marked (carried).

| # | Topic | Evidence | Recommendation |
|---|-------|----------|----------------|
| 1 | (carried) Chat-mode `approve-push` with a session-authority catalogue has no shell route; its refusal names an empty `inspect` | state.md session cut | Give the refusal a runnable repair (D74) |
| 2 | (carried) `TRUST-ANCHOR-MACHINE-PLANE-UNAVAILABLE` should name the missing home directory | state.md session cut | Add the path to the message |
| 3 | (carried) WINACL001 possible product defect | state.md session cut | Decide after the native Windows run |
| 4 | (carried) Orphan `node.exe` left behind | state.md session cut | Native Windows follow-up |
| 5 | (carried) MFHS023/028 cross-process ownership | state.md session cut | Post-0.7.0 |
| 6 | (carried) Stale "still open" texts in backlog items | state.md session cut | Re-read each before dispatch (CLAUDE.md rule); fix texts in a sweep |
| 7 | After a push the state file `project/pipeline-state.json` is left dirty (push-approval record, consumed proof). `commit-pipeline-owned.mjs --agent` refuses it (`CPO-FOREIGN-CHANGES`, `owned: []`); a commit with `Dispatch: administrative (elephant)` is refused by GIT-03 (`GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED`). Only `Dispatch: stage-0 (elephant)` passed | session 2026-10-22, commit `dfad883f2` | Either `approve-push` commits its own record, or the owned-files list of `commit-pipeline-owned.mjs` includes it; the refusal should name the working form |
| 8 | Reading one non-secret variable (`CLAUDE_CODE_SUBAGENT_MODEL`, MP-04) is refused through `printenv`, an `echo` expansion and `/proc/self/environ` (GUARD-ENV-DUMP, GUARD-PARSE-UNSUPPORTED); only a one-line node probe answered | session 2026-10-22 | Add a sanctioned read-only MP-04 readback to the Elephant preflight so the bootstrap line needs no workaround |
| 9 | Preflight reports `NODE-SANDBOX-UNREACHABLE` (node under an fnm path), `modelRoleBootstrap: MODEL-ROLE-BOOTSTRAP-POLICY-REQUIRED`, `agyStartHint: refresh-required`; hooks fire in this session, so informational | preflight 2026-10-22 | Link node at a stable path before the Windows/Antigravity runs; model-role policy is a PO setting |
| 10 | At session start both git hooks were stale (`HOOK-SNAPSHOT-STALE`) after the PO's install and `hook-refresh-required` had to run once | preflight 2026-10-22 | Let the installer refresh the hooks as part of its apply |
