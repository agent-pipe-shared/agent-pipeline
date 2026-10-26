---
schema: pipeline.backlog-item.v1
id: pipeline.windows-private-state-check-counts-acls-inherited-from-above-the-repository
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "PO consumer run 2026-10-26 (brownfield repo on a Windows data drive, first native dispatch after implementation entry): guard-dispatch blocked with CVCT-FILE although the plan was approved"
done_when: manual
---

# The Windows private-state check counts ACEs inherited from above the repository

## Evidence (measured on the consumer machine)

First native dispatch of a consumer repository on a Windows data drive. `guard-dispatch` returned
`CVCT-FILE: the current plan approval is unavailable`, while `pipeline-state.mjs inspect` showed the plan
approved. The cause (confirmed with `icacls` on `project/pipeline-state.json`): the file inherits
`Authenticated Users: Modify` and `Users: Read` from the drive root. `calibrationApprovalFile`
(`scripts/pipeline-state.mjs`, `privateState: true`) calls `assessWindowsPrivatePath`, whose policy
(`evaluateWindowsPrivateState`) reads every effective ACE of the file (`GetAccessRules($true,$true,...)`) and
refuses any principal other than the current one.

The PO's expectation: the D145 direction (2026-10-25, ordinary host paths no longer blocked by foreign
grants) already covered this, and private custody should be judged **from the repository downward**, never on
what the drive or a parent folder grants.

## Why D145 did not cover it

D145 relaxed host/project/plugin/source and process-image paths. It deliberately kept strict private custody,
and the strict policy still counts ACEs that the repository root itself inherited from its ancestors. On any
repository below a drive root or folder with a broad inherited grant (very common on a second data drive) the
approved plan therefore reads as unavailable, and the repair offered is a manual `icacls /inheritance:r` on the
user's own `project/` folder.

## Wanted (PO direction, 2026-10-26)

The problem is inherited rights inside repositories. It must be found **at bootstrap on Windows**, corrected
**right there with a concrete instruction to the user**, and afterwards **everything is checked at the root
only**:

1. **Bootstrap/preflight (Windows, once):** observe the effective DACL of the private-state root. When it
   carries inherited foreign grants, stop with a typed finding that names the exact folder and prints one
   copy-paste command (inheritance removed, current user full control, `(OI)(CI)` so files created later
   inherit the narrow rights). The plugin still writes no ACL itself; the user runs the command, the next
   preflight reads it back and continues only on `secure`.
2. **After that, root-only checks:** the runtime guards (plan approval, `CVCT-FILE`, state readers, batch
   observer) assess the private root once (memoized by object identity) and treat files created below it as
   covered by inheritance from that root. No per-file DACL verdict, no look above the root. Owner, reparse-point
   and physical-path checks are unchanged.
3. The pure evaluator stays testable without PowerShell (observation fixtures); the native observer reports
   whether an ACE is inherited so the finding in step 1 can name it.
4. A file with an **explicit** foreign ACE below a secured root (someone changed it later) is still `insecure`
   at the next root-or-readback check; the root-only rule never hides a changed root.
5. **Decided by the PO, 2026-10-26:** "root" = the private-state directory (`project/` and
   `<git-dir>/agent-pipeline`), not the whole repository root, so the user's source tree keeps its normal rights.
   Goal stated by the PO: all Windows ACL checks come out clean under this one rule.
- Regression cases: root hardened → file below it is `secure` without its own observation; root inherits
  `Authenticated Users` → preflight finding with the command, runtime refuses with a pointer to it; explicit
  foreign ACE on the root → `insecure`; malformed or missing observation fails closed.

## Second consumer observation (Toolbox, D6, 2026-10-26) and status

The Toolbox session (Windows 11, build 0.7.0+claude.20261026152532.b8a2ec6) hit the same cause independently and the
PO raised it to P0 (blocks the first dispatch with no agent-side workaround): the preflight and
`windowsAuthorityReadiness` reported `ready` beforehand, the failure surfaced only at the first dispatch as
`CVCT-FILE: the current plan approval is unavailable` (identical text for other causes, cf. D12), while
`pipeline-state.mjs inspect` showed `planApproved: true`. `project/pipeline-state.json` inherited
`Authenticated Users:(M)`, `Users:(RX)`, `Administrators:(F)`, `SYSTEM:(F)` from the project folder and the drive.
`icacls` is closed to the agent by the PowerShell grammar and no sanctioned repair exists ("No action in this
diagnostic writes an ACL"). Open question from the consumer: does the writer re-create the file by rename on later
state changes and does the hardened folder's inheritance cover that? Check after the next status change.

Status: points 2 to 5 are in held patch `D165-S7a` (applied in operator commit `1bcce7add`, targeted tests green, not
measured on native Windows). Point 1 (Windows bootstrap finding with the copy-paste `icacls` instruction, slice S7b)
and the missing readiness check in the preflight are still open. Two further Windows dispatch gates follow behind this
one (see `pipeline.dispatch-authority-store-check-fails-on-windows`).

## Why P1 (original rating, raised to P0 above)

It stops every first dispatch on a data-drive Windows repository, and its only remedy today is a permission
change on the user's folder. Kernel paths (`lib/windows-private-state.mjs`, `scripts/pipeline-state.mjs`): a held
patch applied by the PO as operator.

## Interim

PO runs, once per repository, in PowerShell:
`icacls "<repo>\project" /inheritance:r /grant:r "$(whoami):(OI)(CI)F"`
(removes inherited grants on `project/`; Administrators and SYSTEM lose direct access there).
