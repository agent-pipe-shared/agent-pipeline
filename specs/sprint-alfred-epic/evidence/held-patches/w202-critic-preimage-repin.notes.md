# w202 — the protected Critic preimage is re-pinned (candidate 19c)

PO decision 2026-11-04 (evening): the agent may prepare the re-pin of `codex-isolated-critic-protected-preimage.v1.json` as a held patch that the PO applies. This is an explicit one-time exception to the standing rule that the agent never re-pins this preimage.

- `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` case "current Critic execution surfaces remain byte-identical to the protected baseline" reported exactly two stale pins, identical in the main tree and on the chain (the chain changes neither file): `plugins/pipeline-core/skills/critic-review/SKILL.md` and `roles/critic.md`. All eight other pins match.
- The two `rawSha256` values are replaced by the measured digests of the current files (`9f84fcac…` and `b9b8ec8f…`); the paths, the baseline label and the other eight pins are unchanged.
- Consequence to be aware of: the pin protects the Critic's execution surfaces against silent edits. Re-pinning accepts every edit those two files received since the pinned baseline as reviewed. The PO is applying that decision, not the agent.
- Evidence on a work clone: the suite 1/1 (its five checks including the D41 diagnostic-route case).
