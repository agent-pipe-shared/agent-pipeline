# Critic C6g1 correction-diff review 3 of 3: result

Review object: 6940723ae, restricted to po-commands.mjs, the git-hook-runtime pin and its backlog item, plus passive-read-policy.mjs. Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5.
Verdict: **FAIL** (one major and one minor finding). This was the last allowed round for batch C6g1.
Notes: scratch/dispatch/critic-a2d076de170354075/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G1-D3-F1 | major | The original acceptance says an outside cp/install source is "a read (subject to the read policy)". No read policy is applied to that source operand. By static trace, a cp/install from a credential root into the project is not refused. This was not live-verified. | po-commands.mjs:271-282; passive-read-policy.mjs consumers; pin P3 uses only a non-credential outside source |
| G1-D3-F2 | minor | Commit 6940723ae carries five work packages under one `Dispatch: ALF-C-VERIFY-AUGSRC (goldfish)` trailer. The reviewed paths belong to ALF-C-C6G1-CORR-A3. | commit trailers; GIT-02, GIT-03 |

Cleared:
- G1-D2-F1: `sparse` takes its value, and the new cases discriminate against the old table.
- G1-D2-F2: the backlog wording now matches the pinned mv behaviour.
- The option tables match the GNU signatures.
- No test was weakened.

## Coordinator disposition

- G1-D3-F1: correction dispatch ALF-C-C6G1-CORR-A4. It first measures the real guard evaluation with a credential-root source, then writes a protected patch if the case is RED. The batch review budget is used up, so the fix gets Coordinator self-verification and no further Critic round.
- G1-D3-F2: accepted as a process defect of package 3. The next signed package uses the GIT-03 binding `Dispatch: quality-package-<digest> (integration)`.
