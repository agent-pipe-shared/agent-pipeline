# Held patch: EL-01 tripwire admits scratch/ writes only while the bound spec is unreadable (Slice A)

Candidate: 400c6213db04d4abf1c93335b59d68a9a2e7d086. Patch: `w7-tripwire-scratch-unreadable-spec.patch` (git diff --binary against the candidate; touches `plugins/pipeline-core/hooks/guard-el01-tripwire.mjs` and `.test.mjs` only). PO decision 2026-10-27: the NARROW version. Recon: `scratch/wave3/recon-half-moved-feature-directory.md` (model output; cited lines re-verified: resolveSpecPath :193-210, unreadable-spec branch :401-410, EXEMPT_PREFIXES :177, path normalization :316 all matched).

## Cause
With a half-moved feature directory, `continuity.authority.spec.path` points at a missing file. The tripwire marks the risk flag unevaluable (D86, fail closed) and refuses every non-exempt write; `scratch/` is not exempt, so the rebind cannot even be staged, and there was no fallback to the planPath-sibling spec.

## Changes (guard-el01-tripwire.mjs)
- `resolveSpecPath` tail extracted into `planSiblingSpecPath(feature)`.
- New `let boundSpecUnreadable = false`.
- Spec-unreadable branch: on read failure set `boundSpecUnreadable`; on ENOENT try the planPath-sibling spec; if readable, it decides the risk class (specPath switches to it). Otherwise unevaluable as before, repair text now names rebinding `continuity.authority.spec.path`/`planPath` and that `specs/` and `scratch/` writes are admitted.
- Before the dispatch-record lookup: `if (boundSpecUnreadable && normalizedPath.startsWith("scratch/")) exit 0`. normalizedPath is posix-normalized, so `scratch/../src/x` is refused. `scratch/` is NOT added to EXEMPT_PREFIXES; a readable risk-high spec keeps the tripwire.

Design note: the scratch admit keys on the BOUND spec being unreadable, even when the sibling fallback succeeded (the recon's case 1 requires ALLOW with a risk-high sibling). Non-scratch writes follow the sibling's risk class.

## Tests (guard-el01-tripwire.test.mjs, TP-11a..g, inserted before Cleanup)
RED against unchanged code (exit 1): 5 failing: TP-11a, TP-11b, TP-11c, TP-11e, TP-11f (TP-11d traversal and TP-11g readable-high control pass on the old code by design).
GREEN patched: `27/27 cases passed.` (20 existing + 7 new). No existing case changed.
Neighbour pin `lib/pins/agy-el01-write-authorization-gap.test.mjs` in clone (unedited): pass 27, fail 0.
Baseline (clone2, unchanged candidate), whole file: `20/20 cases passed.` Failing-name set baseline: empty; patched: empty. Identical.

## Not done
Slice B (git mv / git restore repair lane in lifecycle-gate), inspect/preflight next-step unification, PowerShell parity, Antigravity/Codex runner test review beyond the agy pin. Full Verify, native, Windows qualification, batch Critic, PO acceptance remain open.

## Proposed commit message
fix(guard): the EL-01 tripwire admits scratch writes only while the bound spec is unreadable and falls back to the sibling spec (Slice A)

## Operator flow
1. `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-tripwire-scratch-unreadable-spec.patch` at the candidate.
2. `git add -u -- plugins/pipeline-core/hooks`
3. `git commit --no-verify -F <msgfile>` (message above).
4. stamp, install per the operator tools.

## Protected-path classification observed
Both patched files are guards/guard tests under policies/control-placement (held-patch route). Neither matches a TP-1..TP-13 pattern in agent-obligations section 2. The patch was staged in a scratch clone; the repository tree under plugins/ was not edited.

## Review
Independent Critic review stays a parent-owned batch gate.
