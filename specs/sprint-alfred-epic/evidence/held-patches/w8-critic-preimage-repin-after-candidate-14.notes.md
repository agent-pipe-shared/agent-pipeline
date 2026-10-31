# w8-critic-preimage-repin-after-candidate-14 (held patch, not applied)

Cause of the red `codex-isolated-critic-protected-preimage` Verify step: this candidate changes five of the ten protected Critic execution surfaces
(`harness/review-protocol.md`, `plugins/pipeline-core/agents/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, `roles/critic.md`, `templates/prompts/critic-review.md`)
through the earlier canon patches (project-state record role and bindings command, ADR-0014 amendment, budget-checkpoint wording), and the pin file still held the old raw SHA-256 values.

PO decision D221 (2026-10-31): the PO re-pins the preimage of exactly these five files. Change: the five `rawSha256` values in
`plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`, recomputed from the bytes of the stacked tree (all other patches applied, rebaseline commits excluded because they touch none of these files).
The path list, schema and baseline label are unchanged. The file is a protected path: apply under the Guard Maintenance Window like the other protected patches.

Evidence (clone): `codex-isolated-critic-protected-preimage.test.mjs` 5/5 after the re-pin, red before. Must be applied AFTER every patch that changes one of the five files; the apply script places it directly after the gitleaks fingerprints.
