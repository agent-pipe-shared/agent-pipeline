# K118-SUITE-REGISTRATION-STEP notes (clone scratch/clones/k108, previous HEAD e18789b6f, now cf977e3b8)

Implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
Main checkout touched only under `scratch/` and `scratch/agent-out/`. Helpers: `scratch/k118-*.mjs`.

## Cause and change
7 `*.test.mjs` files had no verify registration (K108 flag 1). Entry shape in `harness/verify-suites.json` is declarative `{name, file, invariantPinned, nonOverlapNote}` with no runner-mode field (no serial/parallel/timeout keys exist in the file), so the seven entries are appended at the end of `suites` like their neighbours. Names: `<file>-tests` (`clone-hook-readiness-refresh-tests`, `commit-pipeline-owned-tests`, ...).
Two further registries had to follow, exactly as K102 (b32f67336) and C27b did:
- `harness/config/verify-case-completion.v1.json`: 4 rows (`legacy-process-only`, reason = the same backlog item K102 cited) for the 4 files the conservative classifier reports `node-test-single`: commit-message-policy-administrative-refusal (3 sites), gitleaks-scratch-clones-exclusion (5), onboarding-init-machine-plane-reason (4), pipeline-state-approve-push-chat-catalogue-repair (13). The other 3 files are not classified vulnerable (no row needed).
- `harness/scripts/check-verify-case-completion.test.mjs` VCR01 (QG-04, own hunk, justification in the commit message): +4 pinned rows, `registryCount` 357 -> 361, +4 names in the `addedAfterR5` exclusion set, comment. No row, assertion or digest removed or weakened; retained identity set still 266 / digest e7fa11eb... (measured by `scratch/k118-classify.mjs`).
- `docs/product-capability-inventory.json`: 7 `verify-phase:...` surface ids in `deterministic-verification` (alphabetical positions), then `scripts/rebaseline-inventory.mjs`.

## Deviation: two clone commits, not one
The inventory check reads surfaces from the COMMITTED sourceBaseline, so the baseline must name a commit that already holds the registrations; a single commit cannot contain its own hash. Same two-step shape as C27a/C27b. 36 = `9b00beff7` (verify-suites, registry, VCR01 pin), 37 = `cf977e3b8` (inventory surfaces + baseline 9b00beff7). Subject of 36 as briefed; trailers `AI-Assisted: true` / `Dispatch: stage-0 (elephant)` on both. Both went through the clone's real pre-commit and commit-msg hooks, none refused.

## Counted results (each run alone, final clone HEAD cf977e3b8)
| command | before | after |
|---|---|---|
| `node harness/scripts/check-verify-suite-registration.mjs` | exit 2, 7 UNREGISTERED (1085 registered) | exit 0, 1092 registered, 0 unregistered |
| (intermediate, 36 + surfaces missing) same | - | exit 2, 7 UNCATEGORIZED-VERIFY-SURFACE only |
| `node harness/scripts/check-verify-case-completion.mjs` | exit 0 (357 entries, 343 classified) | after registering only: exit 2, 4 VULNERABLE-UNREGISTERED; after rows: exit 0, 361 entries, 347 classified |
| `node harness/scripts/check-product-capability-inventory.mjs` | exit 0 | after surfaces: exit 1, 7 missing in committed baseline; after rebaseline: PASS |
| each of 7 test files `node --test <file>` | - | commit-message-policy-administrative-refusal 1/1, dispatch-scope-overlap 12/12, onboarding-init-machine-plane-reason 1/1, approve-push-chat-catalogue-repair 1/1, clone-hook-readiness.refresh 4/4, commit-pipeline-owned 2/2, gitleaks-scratch-clones-exclusion 2/2; 0 fail |
| `node --test harness/scripts/check-verify-case-completion.test.mjs` | 31/32 (VCR01 red) | 31/32 (VCR01 still red, pre-existing, see below) |

## Pre-existing red, NOT fixed (stop-condition: red before my change for an unrelated reason)
VCR01 fails at k108 HEAD e18789b6f (measured in the throwaway clone `scratch/clones/k118-check`, before any edit of mine) and identically after: its first `deepEqual` finds 4 pinned site counts that the bundle grew: git-null-device-sites-tests 14 -> 17, session-authority-repair-tests 123 -> 144, slice-queue-cli-tests 109 -> 125, slice-queue-tests 310 -> 330 (all `top-level-assertions`, same suites, only more sites). Cause: bundle steps added cases to those suites; the pins were not restated. Restating them (QG-04, bounded justification: growth only) is a separate step; a 5th, 6th assertion after the first `deepEqual` could not be run by the test itself, so `scratch/k118-classify.mjs` re-computes them: retained 266 / digest matches, vulnerableCount 347 = classified 347, registryCount 361. Nothing else in the suite is red.

## Diffs (all `git apply --check` clean AND applied in the throwaway clone `scratch/clones/k118-check` at e18789b6f; registration + case-completion checkers exit 0 there)
- `scratch/agent-out/k118-suite-registration-protected.diff` (harness/verify-suites.json, +42) - applies after the bundle (needs the entries array of step 02 and tail = run-parallel-tests).
- `scratch/agent-out/k118-suite-registration-unprotected.diff` (registry + VCR01 test, +39/-1).
- `scratch/agent-out/k118-suite-registration-inventory-protected.diff` (docs/product-capability-inventory.json, 7 surface lines only; the sourceBaseline hunk is deliberately dropped, the operator re-measures it with `node scripts/rebaseline-inventory.mjs`).
- Message files `scratch/agent-out/k108-msgs/36-register-decision-round-tests.txt`, `37-register-decision-round-inventory.txt`; runbook steps 36 and 37 appended.
Clone tree is clean at cf977e3b8 (the edits are committed, not left in the working tree).

## Risks / open items
- Runbook step 34 and 35 show empty `git add -- ` / `git commit ... -- ` path lists (pre-existing generator gap in `k108-runbook.md`, not touched; use the `paths` of their diffs).
- The 7 entries use generic invariant texts for files whose test names were read, not the full tests; an operator/Critic may want sharper `invariantPinned` text (field is free text).
- Ratchet line effect against `architecture/boundary-policy.json`: none (no listed file touched; verify-suites.json, registry and the inventory are not ratcheted).
- Not run: Verify gate, Windows, independent Critic read.
