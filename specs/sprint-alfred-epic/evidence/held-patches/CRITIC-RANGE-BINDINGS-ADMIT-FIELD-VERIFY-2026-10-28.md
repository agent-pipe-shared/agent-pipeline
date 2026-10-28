# Critic range bindings: the admit and finalize request field, verification and PO apply blocks (2026-10-28)

One patch, applied and committed as ONE commit: `w7-critic-range-bindings-admit-field-d1.patch` (2 files). It applies on the installed bindings candidate
(stamp `63c00a435`, `0.7.0+claude.20261028213857.bc522bc`). This is a HELD PATCH: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has
done so. Recon: `CRITIC-RANGE-BINDINGS-ADMIT-FIELD-RECON-2026-10-28.md`.

## What changes

`session-critic-finalizer.mjs` only: the admit and finalize request gains an OPTIONAL key `review.correctionInputBindings` in v1, v2 and v3 (absent, or a non-empty
string; `null` is refused), and `preflightInput` carries it only when the request has it. A request without the key is byte-identical to before. The packet
binding needs no code: `preflightSha256` hashes the whole preflight result, which echoes `{path, digestSha256}` of the bindings, and `finalize` recomputes the
preflight from the same request.

## Test evidence (fresh clone of HEAD, the patch applied as ONE commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` | 87 | 86 | 1 |
| `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` | 63 | 63 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 35 | 35 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". The one finalizer failure is the pre-existing
`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails identically on the unchanged baseline. The new cases
`D1 walk (1)` to `(6)` walk the whole route through the real CLI: admit without the field is refused naming the derive command, the real derive writes the file,
admit with the field is admitted and the packet binds the echoed bindings, finalize with the same request completes, a stale file is refused, and v1/v2 pass the
key through to the preflight. Full Verify is not run.

## Named gaps and gates (not done)

- The bindings file under `scratch/` must still exist at `finalize` (it is read again); if it was swept, derive it again for the same range (deterministic).
- A refused preflight still prints as `code: SCF-INTERNAL` with the real code as the prefix of `detail`; deliberately unchanged (other cases pin it).
- Operator text for the whole order (skills, hints printed by `register-feature-package.mjs` and `critic-diagnostic-evidence.mjs`, the push hint): next slice.
- Full Verify, batch Critic, native Windows (D58 to D61), D31 native qualification, the real consumer runs and PO acceptance stay open.

## PO apply blocks (from the repository root)

Block 1:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-admit-field-d1.patch`
then `git status --short` (expect `session-critic-finalizer.mjs` and its test).

Block 2:
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-admit-field.txt`

Block 3, tell the Elephant: it stamps, you refresh the installed plugin copy and install, the Elephant reads the preflight back.

## For a consumer after the install

Set `"correctionInputBindings": "<path under scratch/>"` inside `review` of the admit AND the finalize request (same value), after
`critic-correction-input-bindings.mjs derive --root <root> --base <base> --head <candidate> --out <that path>`. Omit the key for a range without state or retained-result paths.
