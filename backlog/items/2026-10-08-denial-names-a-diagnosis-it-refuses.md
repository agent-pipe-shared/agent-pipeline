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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **NOT-BLOCKED** — Triage the item and decide the scope of PO decision BI (degrade an unverifiable approval to advisory)
  The scope of BI is decided and built: item extension 2026-10-22 records PO decision D117 (only DWP-PACKAGE-PHYSICAL qualifies; GUARD-DEVPLAN-APPROVAL-UNVERIFIED advisory; hooks/guard-devplan-approval-unverified.test.mjs). Only the empty Triage block is left, which an agent can fill.
