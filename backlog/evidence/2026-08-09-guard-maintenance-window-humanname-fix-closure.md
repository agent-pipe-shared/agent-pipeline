# Closure evidence: `guard-maintenance-window.mjs install --authority` SETUP-1 fix

- **Item:** `2026-08-09-guard-maintenance-window-rejects-a-fresh-setup1-authority-file.md`
- **Dispatch:** GF-072 (goldfish-implementor, claude-sonnet-5/medium), direct main-checkout dispatch after a first attempt failed on unrelated worktree-provisioning staleness (recorded separately in `2026-08-09-goldfish-critic-dispatch-truncation-costs-recurring-recovery-time.md`, instance 5).
- **Fix commit:** `861a5b69535b689e501b4ca4562a5eba24bd35b4` — narrows `guard-maintenance-window.mjs`'s `install --authority` branch to `{ keyReference, publicKeySha256 }` before it becomes `trustPolicy`, mirroring GF-067 (`ad81a9b9`) and GF-069 (`faf4c8dd`). The default (no `--authority`) branch is untouched.
- **New regression coverage:** `GMW26` in `plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` — CLI-level (`run` imported from `../scripts/guard-maintenance-window.mjs`), exercises a real `prepare` → `install --authority <fresh 3-field SETUP-1 file>` cycle end to end and asserts success.
- **Independent verification (Elephant, this session):**
  - `git show 861a5b69` reviewed directly: diff matches the required narrowing pattern exactly, touches only the two files the briefing authorized.
  - `node plugins/pipeline-core/lib/guard-maintenance-window.test.mjs` re-run independently: `27 passed, 0 failed` (including GMW26).
  - Full Verify (run by GF-072, bound to commit `861a5b69`): 267/267 suites at 0, exit 0, evidence `evidence/verify-latest.json`.
- **Mandated caller sweep (the process gap this item exists to close) — run and recorded this time:**
  Command: `grep -rn "args\.authority\|authority.*trustPolicy\|trustPolicy.*authority" plugins/pipeline-core/scripts/*.mjs` (plus targeted follow-up reads of each hit's surrounding context).
  Result — every direct construction of a `trustPolicy` object from external, PO-authored input, across all of `plugins/pipeline-core/scripts/`:
  - `pipeline-state.mjs:2757` — already narrowed (`{ keyReference: authority.value?.keyReference, publicKeySha256: authority.value?.publicKeySha256 }`), GF-067.
  - `po-approval-request.mjs:89-90` — already narrowed, GF-069.
  - `guard-maintenance-window.mjs:126-131` — narrowed by this fix, GF-072.
  - `po-human-approval.mjs:453` — already narrowed from its own local authority record (`{ keyReference: localAuthorityRecord.keyReference, publicKeySha256: localAuthorityRecord.publicKeySha256 }`); never took an external `--authority` file this way, so it was never in the affected population.
  - `guard-human-override.mjs` — deliberately accepts no `--authority` flag at all (documented in-code, `scripts/guard-human-override.mjs:153-166`: considered and rejected — `trustPolicy` is left unset and falls back to the default 2-field trust anchor).
  - No other `scripts/*.mjs` file references `args.authority` or constructs a `trustPolicy` from external JSON.
  **Conclusion:** the three-instance pattern (GF-067/GF-069/GF-072) is now exhaustively closed — no fourth sibling exists in the current codebase.
- **Standing design question** (not resolved by this item, per its own text): whether `po-approval-proof.mjs`'s `own()` should become a subset match instead of an exact key-set match, to make this class of writer/reader drift structurally impossible. Left to a future Elephant/PO decision.
