# Runner test handover: candidate 30h (installed 2026-11-17)

Intermediate test candidate, not a release. No Full Verify, no Critic, no PO acceptance is implied.
Repository and goal continuity come from `docs/state.md`, not from reused session receipts.

## Common to every runner

- Candidate identity: stamp suffix `20261117180858.ce0f1d5` (stamp commit `73950a8a4`). The run counts only when the first line printed by
  `/pipeline-core:pipeline-start` carries exactly that version. A plugin reload or a new thread alone proves nothing about the loaded plugin.
- One separate test project root and one report path per runner. Record: candidate, host/CLI version, runner, platform, approval mode,
  start and end status, report path, every human intervention and every guard stop (toil, not only functional output).
- A fresh project may first answer `hook-refresh-required`: run the one action the preflight names, once.
- Not in this candidate (wave 30i, a separate chain): the Antigravity skill split and agent frontmatter, a bound session's State advance
  (`cancel-submitted-plan` / `cancel-mixed-plan-state` while a session-cleanup binding is held is still refused before the write with its typed
  repair), and `--supersedes` at feature registration (use `--successor-of` at review time).
- The PO-recorded model exception is built but has never been used on a real dispatch.

## Claude

- Plugin installed and reloaded on the PO's machine; start a new session in the test project and run `/pipeline-core:pipeline-start`.
- Look at: the human acceptance question comes after the candidate Verify and a plainly positive answer is accepted; a refused Result close names
  its cause; a Critic diff round no longer escalates to a full round because of `trustBoundaryChanged`; `CCA-MANIFEST-READ` names `--successor-of`.

## Codex

- Needs the attended reinstall of the existing local selector (all Codex sessions and the host closed first), as in
  [local candidate installation](local-candidate-install-and-greenfield-2026-10-25.md): `codex plugin remove pipeline-core@agent-pipeline-local`,
  `codex plugin add pipeline-core@agent-pipeline-local`, `codex app-server daemon restart`, then read back exactly one enabled selector with the
  new version. Then start Codex in the project and run `/pipeline-core:pipeline-start`.
- Look at: `cancel-submitted-plan` and `cancel-mixed-plan-state` in an UNBOUND session; every one-shot stop and every plugin-reload refusal names one
  runnable recovery; the acceptance question order as for Claude.

## Antigravity

- Not requested for this round. Its install and the 30i fixes are a separate step.
