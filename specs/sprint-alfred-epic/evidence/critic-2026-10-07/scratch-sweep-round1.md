# Critic record — scratch retention and sweep (C-S1, C-S2), round 1 (full)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 11b97c53e, dea126ba9, d7db4fd8a, 27e172a64.
- Verdict: **FAIL**. Trajectory: consistent.
- F1 major: "never live descriptor dirs" is not implemented — `--apply` only skips the `scratch/dispatch/` prefix (`scripts/scratch-sweep.mjs` ~80); `lib/physical-scratch-boundary.mjs` (`isPhysicalScratchTarget`, `scratchLivePluginRoots`) is not reused, so a live plugin installation or descriptor directory under `scratch/` older than 14 days can be deleted.
- F2 minor: own containment re-check before unlink lacks `isAbsolute`/drive-letter, alias and hard-link checks (~85).
- F3 minor: `--now` applies to `--apply`, so the 14-day floor can be bypassed.
- F4 minor: `--check`/`--sweep` plans list `scratch/dispatch/` files that `--apply` never deletes (preview ≠ applied set).
- F5 minor: neither suite registered in Verify (protected TP-3/TP-13).
- F6 minor: an unreadable tracked document silently contributes no references (`lib/scratch-retention.mjs` ~83).
- F7 minor: tracked (committed) files under a non-ignored `scratch/` are sweep candidates.
- Disposition: test-only dispatch C-S-T3 pins F1–F4, F6, F7 (live roots via the boundary module, cross-drive containment, `--apply` refuses `--now`, plan excludes `scratch/dispatch/` so preview = applied set, unreadable tracked document → nothing deletable plus a warning, tracked scratch files never candidates); then a fix dispatch; F5 → verify-registration slice of the signed package. One delta Critic remains (decision A).
