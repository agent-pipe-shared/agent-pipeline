---
schema: pipeline.backlog-item.v1
id: pipeline.denial-names-a-diagnosis-it-refuses
type: defect
owner: pipeline
status: open
created: 2026-10-08
source: "Haupt-PC session 2026-10-08 late: GUARD-DEVPLAN-SHELL denial during an unverifiable approval."
sprint: alfred
done_when: manual
---

# A guard denial names a read-only diagnosis that the same guard refuses

## Description

With an unverifiable approval (`DWP-PACKAGE-PHYSICAL`), the `GUARD-DEVPLAN-SHELL` denial text says: "Use
design-advisory-admission.mjs inspect --repo-root <root> --feature <id> --plan <plan> --spec <spec> for read-only
diagnosis." Running exactly that command is refused by the same guard under the same lane (`opaque-script-execution`),
as is every other `node` call including a single `node --test` file. The only remaining diagnosis was reading minified
source and handing PO-run scripts back and forth (T73, T76).

## Proposal

Every diagnosis or recovery command a denial names must be admitted in the state that produced the denial (a typed
read-only allowlist bound to the denial code), and a test pins it per denial code. More generally (PO decision BI): an
approved feature whose approval cannot be re-verified must degrade to advisory, never lock all execution.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted and built; the second half (PO decision BI, advisory degradation of an unverifiable approval) is decided by D117 (2026-10-22).
- **Rationale:** D117 builds the advisory degradation now (`GUARD-DEVPLAN-APPROVAL-UNVERIFIED`), and the first half (every denial names an admitted command) is pinned per denial code in `lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs`; see "Reconciled 2026-10-23".
- **Assignment (if accepted):** none open for the BI half; the "Not covered" residue in the 2026-10-22 extension stays a documented limit. Independent Critic read and PO acceptance pending.
- **Date:** 2026-10-23 (filled from the 2026-10-22 extensions)

## Extension 2026-10-22: every other denial that names a command

The admitted-recovery pin (`plugins/pipeline-core/lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs`) covered only the
design-advisory emitter. It now also holds a source inventory of every guard denial text that prints a "Run ..." command
(`hooks/` and `lib/guard/`): a new or removed one fails the inventory until it is classified. Result of the classification:

- `GUARD-BOOTSTRAP-RECEIPT-MISSING` names the preflight script: sanctioned, green.
- The `guard-push` feature-checkpoint denial names the bare `push-init.mjs --checkpoint`, which is not a runnable spelling,
  and `sanctionedPushInitArgs()` does not admit `--checkpoint`, `--candidate` or `--record-ref` although `push-init.mjs`
  parses them and `buildPushInitArgv()` emits them, so in a blocked lifecycle state the shell lane refuses the command
  the denial points at. Two `todo` cases pin this; the fix touches protected guard files and is handed over as a JSON
  patch.
- The GG-22 ledger denial (`reconcile-backlog-ledger.mjs --activate`) and the dispatch-record lane
  (`capture-evidence.mjs`) name scripts that are not in the sanctioned catalogue. They are refused as
  `opaque-script-execution` only while the lifecycle gate blocks, which cannot be the state of a commit or a
  dispatch-record write; pinned as an observed limit, not as a defect.

Not covered: denials whose command is not introduced by a "Run"/"then run"/"use plugins/pipeline-core/scripts" phrasing,
and the PO-run commands that human-guard-override denials print (those are attended-operator steps by design). The second
half of the Proposal (an approved feature whose approval cannot be re-verified degrades to advisory) is a product
decision and was not touched.

## Extension 2026-10-22: the second half is built (PO decision D117, decision BI)

An approved feature whose approval cannot be re-verified now degrades to ONE advisory instead of blocking, in both lanes
(Edit|Write hook and the Bash lane). "Cannot be re-verified" is deliberately narrow: only a verification INPUT that is
unavailable qualifies, today exactly `DWP-PACKAGE-PHYSICAL` (the approved design workflow package file is missing or not a
physical repository file). The advisory (`GUARD-DEVPLAN-APPROVAL-UNVERIFIED`) names the cause, what could not be verified,
that nothing was verified, and the single repair (`reopen-design`); it travels on the existing exit-0 notice channel. Every
mismatch (`DWP-APPROVAL-DIGEST-DRIFT`, source drift, wrong signer, binding drift), a missing trust-anchor setup, a revoked
approval and an absent approval record keep blocking with their current codes. `designAdvisoryAdmission()` is unchanged, so
callers that need real authority (architecture-design, design-decision-bindings) still see `ok:false`. Lane-level proof:
`hooks/guard-devplan-approval-unverified.test.mjs`; the advisory contract is pinned in the denial pin. The first-half
`todo` cases named in the earlier extension are already real (`todo: false`).

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Triage the item and decide the scope of PO decision BI (degrade an unverifiable approval to advisory)
  The scope of BI is decided and built: item extension 2026-10-22 records PO decision D117 (only DWP-PACKAGE-PHYSICAL qualifies; GUARD-DEVPLAN-APPROVAL-UNVERIFIED advisory; hooks/guard-devplan-approval-unverified.test.mjs). Only the empty Triage block is left, which an agent can fill.

## Reconciled 2026-10-23

Text sweep K58-BACKLOG-TEXT-SWEEP-2. Superseded sentences above, kept as history:

- Description and Proposal ("Running exactly that command is refused by the same guard" and "an approved feature whose
  approval cannot be re-verified must degrade to advisory, never lock all execution"): both halves are built. The
  advisory half is PO decision D117 (2026-10-22), commit `3b1649817` (`feat(guard): degrade an unverifiable design
  approval to one advisory (D117)`), lane proof `plugins/pipeline-core/hooks/guard-devplan-approval-unverified.test.mjs`.
  The first half (denial names a command the guard refuses): the `push-init --checkpoint` spelling was admitted by
  commit `cbfcc602e` (`fix(guard): admit push-init --checkpoint and print a runnable command in the checkpoint
  denial`), and the pin `plugins/pipeline-core/lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs` holds the source
  inventory with the earlier `todo` cases now real (`todo: false`).
- Triage ("Decision / Rationale / Assignment / Date" empty) and the Blocker-analysis line "Only the empty Triage block is
  left": filled today from D117.
- Still open, unchanged: the "Not covered" residue of the 2026-10-22 extension (denials not introduced by a
  "Run"/"then run" phrasing; PO-run human-guard-override commands, attended by design). Independent Critic read and PO
  acceptance of the D117 change remain pending; no status change is made here.
