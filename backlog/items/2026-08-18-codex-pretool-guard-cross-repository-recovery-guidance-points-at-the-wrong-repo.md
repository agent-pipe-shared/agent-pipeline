---
schema: pipeline.backlog-item.v1
id: pipeline.codex-pretool-guard-cross-repository-recovery-guidance-points-at-the-wrong-repo
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Disclosed by NVA-CROSSREPOLEDGER-1's own final report (2026-08-18) as a real, separate finding outside its briefed scope."
---

# `codex-pretool-guard.mjs`'s printed recovery guidance names the coordinator repo, not the cross-repository target, after NVA-CROSSREPOLEDGER-1

## Description

`NVA-CROSSREPOLEDGER-1` (commit `1404eb28`) fixed
`recordHumanGuardDenial()`/`consumeHumanGuardOverride()` in
`plugins/pipeline-core/lib/human-guard-override.mjs` to bind the
one-time override ledger to a cross-repository command's actual target
repository, not the coordinating session's own root
(`backlog/items/2026-07-20-cross-repository-override-ledger-binding.md`).

`plugins/pipeline-core/hooks/codex-pretool-guard.mjs` hard-codes
`--repo ${projectRoot}` in the `plan`/`prepare-authorization`/
`authorize`/etc. guidance text it prints to the human when a
cross-repository command is denied. After the ledger-binding fix, that
printed guidance is now factually wrong for exactly the class of
command the fix targets: it tells the human to run the override
ceremony against the coordinator's root, while the ledger the fix now
creates actually lives under the target repository. The command
resolution itself is unaffected (this is a display-text gap, not a
security gap) — but a human following the printed guidance literally
would point `guard-human-override.mjs` at the wrong `--repo`.

## Affected artifact

`plugins/pipeline-core/hooks/codex-pretool-guard.mjs` — the sites that
print `--repo ${projectRoot}` in override-ceremony guidance.

## Proposal

Not designed here. Likely direction: thread the same
`crossRepositoryTargetRoot()` resolution `NVA-CROSSREPOLEDGER-1` added
to `human-guard-override.mjs` into this hook's own guidance-text
construction, so the printed `--repo` matches whichever root the
ledger actually binds to (target for cross-repository-eligible
commands, coordinator otherwise).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — real, disclosed finding, not yet actioned.
- **Rationale:** a real but narrow gap (guidance text only, not a
  security boundary — the underlying ledger binding is already
  correct); lower priority than the fix it follows from.
- **Assignment:** unassigned.
- **Date:** 2026-08-18
