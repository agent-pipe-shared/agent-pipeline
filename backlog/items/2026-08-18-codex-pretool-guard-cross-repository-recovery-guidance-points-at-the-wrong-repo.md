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

### Bounded for dispatch, 0.6.0 release triage sweep, 2026-08-18

- **Decision:** confirmed as a real, narrow display-text defect;
  queued for a bounded implement-tier dispatch with Verify, not
  attempted in this read-only pass (guardrail/hook code, MP-07).
- **Root cause, confirmed by reading:** `recordHumanGuardDenial()`'s
  `status: "planned"` return value
  (`human-guard-override.mjs:2101`, literally
  `{ status: "planned", requestSha256 }`) does **not** carry back the
  `repo.root` the function already computes two lines above
  (`:2019-2021`, `topology(crossRepositoryRoot ?? physicalRootDir, spawn)`,
  where `crossRepositoryRoot` is exactly the
  `crossRepositoryTargetRoot()` resolution `NVA-CROSSREPOLEDGER-1`
  added). `codex-pretool-guard.mjs` therefore has no correct root to
  use and falls back to `projectRoot` at every `--repo
  ${JSON.stringify(projectRoot)}` guidance site (currently ~lines
  504-524, all keyed off the `planned` object).
- **Bounded dispatch scope:** (1) add the already-computed `repo.root`
  to the `"planned"` return payload in `recordHumanGuardDenial()`
  (and check whether the `"author-repair-required"` branch a few
  lines above has the identical gap); (2) have
  `codex-pretool-guard.mjs`'s guidance-text construction use
  `planned.root` in place of `projectRoot` at those sites. Verify with
  a case that exercises a `cross-repository-target` denial so the
  printed `--repo` is checked against the actual target repo, not
  just the ordinary same-repo case where the two values coincide and
  the bug is invisible.
- **Assignment:** unassigned, queued for a goldfish/implement-tier
  dispatch with Verify.
- **Date:** 2026-08-18
