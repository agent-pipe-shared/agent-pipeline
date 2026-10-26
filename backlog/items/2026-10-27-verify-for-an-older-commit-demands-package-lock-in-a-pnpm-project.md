---
schema: pipeline.backlog-item.v1
id: pipeline.verify-for-an-older-commit-demands-package-lock-in-a-pnpm-project
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer finding relayed 2026-10-27 (Glossover, PF-81): Verify for an older commit asks for package-lock.json although the project uses pnpm"
done_when: manual
---

# Verify for an older commit asks for package-lock.json in a pnpm project

## Evidence (consumer report, not yet reproduced here)

Running Verify against an older commit (the base of a Critic range, a detached or cloned tree) refuses because
`package-lock.json` is absent. The project installs with pnpm and carries `pnpm-lock.yaml`.

## Wanted

1. Recon first (read only): where Verify decides the dependency install step (`npm ci` against `package-lock.json`),
   and what `pipeline.json` calibration already says about the package manager.
2. The install step follows the project's declared or detected lockfile (`pnpm-lock.yaml` -> pnpm, `yarn.lock` -> yarn,
   `package-lock.json` -> npm); the refusal when NO supported lockfile exists names the lockfiles it looked for.
3. A test with a fixture project holding only `pnpm-lock.yaml`: the Verify install plan is a pnpm one and does not
   mention `package-lock.json`.

## Boundaries

Verify is a gate component: independent Critic review stays a parent-owned batch gate. No network install runs in the
test; the plan is asserted, not executed.
