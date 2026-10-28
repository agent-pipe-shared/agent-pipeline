# PF-97 F3: a real candidate packet with special file names walks the Critic route (test only, 2026-10-29)

Patch: `w7-critic-path-charset-f3.patch` (one file, `plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs`). Stacks on `w7-critic-path-charset-f1`, `-f1-c2` and `-f2`, in that order.
This is a HELD PATCH: nothing is applied, stamped, installed, reviewed or accepted until the PO has done so. The Goldfish ran out of budget before it wrote notes; this note is written by the
Elephant from the Goldfish report and from the verification below, and says which parts were measured by whom.

## What the patch adds

Case `CPP18` (walk case, `CPPW-1`) on a real git fixture whose reviewed range adds eight files: `src/app/(app)/(auth)/anmelden/page.tsx`, `src/app/[slug]/page.tsx`,
`src/app/@modal/(.)photo/page.tsx`, `routes/$id.tsx`, a name with a space, a name with the character U+00FC (built with `String.fromCodePoint(252)`), `src/a+b=c,d~e.ts` and `src/a:b.ts`.
The fixture helper takes an optional list of extra files. The count pins of the file are raised from 17 to 18 (registration assert, the CPP09 self-probe child: case count, disposed length,
counts, declared count). No production file changes.

## The walk (Goldfish report, steps re-read by the Elephant only through the suite result)

| Step | Production function | Result with F1+F1-c2+F2 stacked |
|---|---|---|
| 1 | `prepareCandidatePacket`, `inspectCandidatePacket` | accepted; `diffPaths` equals the sorted added paths, unquoted, no octal escapes |
| 2 | claim, record, `consumeCandidatePacket`, `readConsumedCandidateReceipt` | accepted |
| 3 | `compileCriticReviewLineage` (through the file's `lineage()` helper) with the packet paths as packet, package and coverage paths | accepted |
| 4 | `projectCriticReviewEconomy` on the compiled record | ok |
| 5 | `normalizePacketPath` over the list (what `paths()` of the generic batch calls) | same list back |
| 6 | `diagnosticPath` and `diagnosticEvidenceLocation` for `evidence/<special path>`, colon path included | accepted |

No step refused a special path, so no production gap was found beyond F1 and F2.

## Verification by the Elephant (fresh clone of HEAD `fbe44a6be`, four patches applied in order)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs` | 18 | 18 | 0 |
| `plugins/pipeline-core/lib/review-economy.test.mjs` | 1 (file with its own ok checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-review-lineage.test.mjs` | 1 (own checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 35 | 35 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |
| `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs` | 13 | 13 | 0 |
| `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` | 63 | 63 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check`: "Architecture overview current".

RED proof (measured by the Elephant): the F3 patch alone on HEAD, without F1 to F2, gives `critic-packet-preflight.test.mjs` 18 tests, 16 pass, 2 fail. The case `CPP18` is the intended
failure; the name of the second failure was not read (it may be the CPP09 self-probe, which re-runs the file). So the walk case can fail on the old narrow rules.

## Not done / gates

- The Goldfish did not write a baseline failing-name comparison for clone and clone2, did not drive `registerGenericCriticBatch` or the course admission verbs (the `safe` check there is not exported),
  and did not run the registration verbs `register-feature-package` with a registered feature up to `FPR-LINEAGE-COMPILE`: that step needs the consumed-packet and manifest fixtures of the
  registration route and stays open. Hint text that prints a path unquoted in a command was not surveyed (next slice).
- The finalizer suite `session-critic-finalizer.test.mjs` has one pre-existing red case (86 of 87) identical to the unpatched baseline; it is not touched by this work.
- Full Verify, the batch Critic, native Windows runs, D31 qualification and PO acceptance stay open.

## Operator flow

Apply `f1`, `f1-c2`, `f2`, `f3` in this order with `git apply`, then `git add -u -- plugins/pipeline-core harness/scripts`, a `--no-verify` commit, then the Elephant stamps and the PO refreshes the plugin copy.
Proposed commit message: `test(critic): walk a real candidate packet with special file names through the whole Critic route`.
