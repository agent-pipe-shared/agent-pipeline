# Local candidate installation and Greenfield continuation

The PO cancelled the PC transfer. Stay on this machine and retain the active
feature and goal. This is an intermediate test candidate, not a release.

## Before installation

G35 is committed as `7502188da`; its focused qualification and twelve open
broad-suite fixture failures are recorded in the
[evidence](../evidence/codex-push-budget-2026-10-25/qualification/README.md).
The current matrix has197 items:175 at75,20 at50,two at25. The22 remaining
content items remain in scope. No PRD/Spec change, Enterprise policy change,
Full Verify PASS or Critic acceptance is implied.

Already completed: G35 fix7502188da, G6 installer hotfix0b1fc7699,
final evidence/bindings977dad8b0 and new stampd4d294977. Expected shared
suffix is 20261025134513.977dad8; Codex is0.7.0+codex.20261025134513.977dad8.
The previous32b398bf7/b68e22c candidate is superseded for installation by
this hotfix. Do not stamp again merely to resume. A later documentation-only
handover HEAD does not change the build. The three unintegrated proposals
still originate at32b398bf7; verify their Source preimages before later work.

## Retry the failed AGY global installation now

The owned PreInvocation matcher failure is fixed in the new stamped Source.
From the approved checkout, run:

```sh
node plugins/pipeline-core/install-agy.mjs
```

Select approved plugin directory1, then global topology refresh2, as in the
failed attempt. Expect the installer's actual final status refreshed and the
new Antigravity version0.7.0+antigravity.20261025134513.977dad8. If it refuses again,
preserve the complete result; do not hand-edit hooks or bypass ownership.
The agent has not performed this installation. Restart the actual AGY host
and verify its loaded version before Greenfield acceptance.

## Attended local Codex installation

Registry readback before this candidate confirmed the existing selector
`pipeline-core@agent-pipeline-local`, local marketplace root
`$HOME/agent-pipeline-local-marketplace`, and the preceding installed version
`0.7.0+codex.20261025125256.b68e22c`. The PO clarified this was the
existing session, not a fresh session or complete host restart.

The existing [local development guide](../../../docs/codex-local-plugin-development.md)
requires an attended operation outside affected Codex sessions because the
plugin selection is shared by the App Server. Fully close those sessions and
the Codex host before reinstalling the existing local selector:

```sh
cd "$HOME/src/agent-pipeline-shared_alfred"
git status --short
cat plugins/pipeline-core/.codex-plugin/plugin.json
codex plugin remove pipeline-core@agent-pipeline-local
codex plugin add pipeline-core@agent-pipeline-local
codex app-server daemon restart
codex plugin list --json
codex plugin marketplace list --json
```

This uses the already registered local marketplace. Do not run Git marketplace
upgrade as a local symlink refresh, edit cache files, enable the released
selector alongside the local one, or start a second daemon if restart fails.
The installed readback must show exactly one enabled Pipeline selector, the
new stamped Codex version, the local source type and the expected marketplace
path. If any condition differs, stop test startup and preserve the readback.

Fully start Codex again in this project root, inspect `/hooks`, and invoke
`/pipeline-core:pipeline-start`. Follow the runtime re-entry reading order and
record the actual loaded version and fresh bootstrap/model-role readback.
[SETUP.md](../../../SETUP.md) expressly says that a new thread in an old host
or plugin reload alone does not prove the cached skills changed. Repository
and goal continuity come from this handover, not reused session receipts.

Claude and AGY must also install the matching newly stamped runner versions
through their normal runner procedures before their Greenfield runs. A Codex
installation alone is no evidence that their loaded plugins changed.

## Parallel real Greenfield tests

After actual installation readback, run independent Codex, Claude and AGY
Greenfield projects in parallel. Preserve a separate project root and report
for each. Record installed candidate, CLI/host version, runner, platform,
approval mode, start/end status and exact report path. Exercise the ordinary
happy path from onboarding through review, implementation, verification,
close and an explicitly authorized push where applicable. Record human
interventions and guard toil, not only functional output.

Pay particular attention to AGY native tier dispatch and role separation,
current-session artifact export, diagnostic read commands, truthful missing
scanner coverage, post-close push approval continuity, and the repaired Codex
push-verification budget. General chat remains deliberately unattested;
signature mode must retain its actual proof requirements. No synthetic
fixture counts as native or cross-platform acceptance.

Use the reports to fix confirmed P0/P1 happy-path defects under the
[operative plan](plan_0.7.0-completion-and-greenfield-2026-10-24.md).
Continue remaining content work concurrently. Preserve the planned late
Critic batch and final Verify sequence; do not start duplicate early Critics.
Central nonweakenable Enterprise policy remains Nightwing.

## Optional backup push

Only `origin` / `refs/heads/feat/sprint-alfred` is authorized. Prepare a fresh
final commit/tree/destination-bound signature after the new stamp if backup
delivery is undertaken. The old proof is stale, and its audit was retained.
Do not bypass guards or make backup signing a prerequisite for local tests.
No PC transfer, close-feature, merge, tag or release is requested.
