# w221 — a consumption answers absent only for a capabilities directory that is not there

- Found by: first Full Verify of the 19e chain, `codex-pretool-guard-tests` case 24 ("override persistence failure remains a sanitized fail-closed denial"). Reproduced alone in the rehearsal chain, green alone with this patch.
- Cause: w219 answered `absent` for ENOENT and ENOTDIR. A file where `human-guard-overrides` belongs is a persistence anomaly, not an empty store; the denial then carried `HGO-DECISION-RECORD-UNAVAILABLE` instead of the pinned typed adapter failure.
- Change: only ENOENT answers `absent` before the registry boundary; every other fault goes on to the boundary as before w219.
- Files: `plugins/pipeline-core/lib/human-guard-override.mjs` (protected, PO applies). Builds on w219 (same lines).
- Not changed: the w219 test (missing store, empty capabilities directory) stays valid.
