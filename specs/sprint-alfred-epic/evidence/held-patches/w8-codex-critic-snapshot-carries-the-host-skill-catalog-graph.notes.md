# w8-codex-critic-snapshot-carries-the-host-skill-catalog-graph (held patch, not applied)

Cause of the red `codex-critic-host` cases CCH115 and CCH133: the Codex Critic child runs from a verified snapshot of its module graph. `lib/passive-read-policy.mjs`
(in that snapshot) gained a static import of `lib/host-skill-catalog.mjs` (AC-209), which reaches `private-boundary`, `hardened-private-directory`, `windows-private-state`
and `successful-spawn`. None of the five was in the snapshot list, so the child died at load with `ERR_MODULE_NOT_FOUND` and the host reported `unavailable` (child
exit 1, 1319 bytes of stderr). This is a product defect: the production Codex Critic could not start after that change.

Measured with the relative-import closure of the snapshot entries: exactly these five modules were missing; nothing else.

Change: `snapshotRuleset` in `scripts/codex-critic-app-server.mjs` adds the five modules, so they are committed-byte checked like the others, and the expected module graph in
`codex-critic-host.test.mjs` (CCH114, which recomputes the graph digest) lists them.

Evidence (clean clone): `codex-critic-host` 137/137 (CCH115 and CCH133 were red), the kernel closure suite still 11/11. Applies to the repository HEAD.
