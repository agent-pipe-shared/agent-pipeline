# D162 S4 held patch: session start offers the migration of a legacy deferred adoption

Patch: `d162-s4-orientation-migration.patch` (8277 bytes, SHA-256 `b243e8763658045ae92865af325d43a57feb29ee7ef808f58de3c4021e7441d3`).
Item: `sprint-alfred-epic.2026-10-26-brownfield-architecture-deferral-blocks-implementation-entry`; criterion AC-142; PO decision D162.

## Order and independence

Apply after C29 item 14 (the 14 patches of `scratch/wave3/c29-order-14.txt`, in order). Independent of D162 S2 and S3: it touches none of their files and needs neither applied.
Held because `plugins/pipeline-core/lib/architecture-adoption-orientation.mjs` and `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` are NEVER_LIFTABLE kernel paths; the PO applies it in the bundled signed ceremony.

## Behaviour

- Orientation: a resolved adoption state `deferred` yields status `migration-required` with the D162 guidance sentence; every other state keeps its status and guidance byte-for-byte.
- Preflight: `migration-required` offers the same read-only `architecture-adoption.mjs propose --root <cwd> --json` action as `adoption-required` (mutation false, requiresConfirmation false); readiness is unchanged.
- Reference doc `architecture-orientation.md`: one paragraph for `migration-required` (show the migration block, never run measure or apply without the PO's go, never offer a new deferral).

## Preimage SHA-256 (stacked clone: HEAD plus the 14 C29 patches)

| File | SHA-256 |
|---|---|
| `plugins/pipeline-core/lib/architecture-adoption-orientation.mjs` | `28d93f6dc6e0e7acd84f96593738cdfc0175efd75955d3106cbaaeae82a11784` |
| `plugins/pipeline-core/lib/architecture-adoption-orientation.test.mjs` | `6acb48d8276eb07c17a499a9d7b49ee46a86d9b27d1eb9a087d13953cf40c8be` |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` | `c2b69b8d63e768224ee0c51b0045c3d7b3a18097176153d572c73a20d5ee3cf6` |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` | `b78376921c2362b086566dc2d41bbbe44e91285697a8cfbb49875f0c4374ef27` |
| `plugins/pipeline-core/skills/pipeline-start/references/architecture-orientation.md` | `81d2bf770bd6f7ba18b92093cd0b32392d0f2d3fd9d2c86439b04e34b0a68475` |

Diffstat: 5 files, 65 insertions, 1 deletion.

## Verification counts (in the stacked clone)

- RED (before implementation): 3 D162 S4 tests, 1 pass, 2 fail (deferred to `migration-required`; preflight offers no action). `ℹ pass 1 / fail 2`.
- GREEN, new tests: `ℹ tests 3, pass 3, fail 0, skipped 0`.
- GREEN, combined run: both test files in full plus `pipeline-start-preflight.continuity-drift.test.mjs`, `architecture-adoption.test.mjs` and `check-consumer-safe-paths.test.mjs`: `ℹ tests 166, suites 7, pass 166, fail 0, cancelled 0, skipped 0`. `guard-maintenance-window-kernel-closure`: 11 passed, 0 failed. `check-consumer-safe-paths`: fixture and repository checks passed.
- No doc-contract test reads `architecture-orientation.md`.
- Stack check: in a fresh clone of the repository HEAD, the 14 C29 patches in order, then this patch, applied with `git apply --index`, exit 0.

## Proposed commit message

```
feat(architecture): offer migration of a legacy deferred adoption at session start

A deferred architecture adoption now orients as migration-required and offers the
read-only propose action, whose migration block the PO reviews (D162). Readiness
and every other orientation status are unchanged.
```
