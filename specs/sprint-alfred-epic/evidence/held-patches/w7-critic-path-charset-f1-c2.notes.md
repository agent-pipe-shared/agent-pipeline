# PF-97 slice F1-c2 (finish RE70c): state at budget checkpoint

Candidate: e65df0f53d36136d705d4e455b9408d8364a93eb, stacked on the F1 held patch (w7-critic-path-charset-f1, applied in both clones as the baseline). Status: CHECKPOINT. The RE70c cause is established and fixed; the broader suite sweep is incomplete.

## Cause (RE70c)

Production is correct. A probe in the clone compiled a real lineage record with compileCriticReviewLineage for seven paths (plain, parentheses, brackets, space, non-ASCII, colon, dollar) and ran projectCriticReviewEconomy on each: all returned ok true. So the control record and the special paths both pass. The failure was a TEST HELPER defect: economyCriticRecord changed the paths and rehashed recordSha256, but the projection also binds request.compiledSha256 to a hash of the diff, packages and coverage (criticCompiledRequest, review-economy.mjs around line 286 and the check near line 409). That field stayed stale, so every helper record was refused with RE-CRITIC-PROJECTION-SHAPE regardless of the path. A consequence: RE70d passed vacuously before (the helper record was always invalid); it now tests the path rule for real.

## Changed lines (in the patch, 1314 bytes)

- plugins/pipeline-core/lib/review-economy.test.mjs, helper economyCriticRecord: after the path mutation, recompute record.request.compiledSha256 with the same field set as criticCompiledRequest (packetId, candidate, diff, references, packages, coverage paths/acceptance/edges, mode, admissionCode). No assertion changed or weakened.

## RED and GREEN

- Baseline (clone2, F1 only): review-economy.test.mjs exit 1, 123/124 checks, only RE70c FAIL (log re2.log).
- Patched (clone): exit 0, 124/124 checks, RE70a, RE70b, RE70c, RE70d all PASS (log re.log). Failing-name sets: baseline {RE70c}, patched {}.
- critic-review-lineage.test.mjs (clone): exit 0. critic-diagnostic-evidence.test.mjs with node --test (clone): exit 0. Counts not read beyond the exit code.
- Apply check of the patch in clone2 at the stacked baseline: git apply --check exit 0.

## Item 3 (lineage refusal code) - NOT done

The code of the old narrow rule for a special path was not measured. From reading the unpatched lineage core: PATH (line 45) is used by safePath (line 96), which makes the packet check at line 131/135 and the package check at line 150 fail; the record shape code at those lines is a CRL-V2-PACKET family code per the earlier recon, but the exact code through compileCriticReviewLineage was not run. The lineage test was not tightened.

## Item 4 (preflight tests searched)

Searched critic-packet-preflight.test.mjs, critic-dispatch-preflight.test.mjs and critic-generic-batch.test.mjs with case-insensitive patterns for unsafe, bad, illegal, invalid path, special character, with space, parenthesis, colon and CRL-V2-PACKET: no hit. The only path refusal cases found are missing-file and credential-path cases (CGB-REFERENCE lines 241 and 247; CDP-CANDIDATE-PATH lines 736 and 738; CDP-EVIDENCE-PATH line 852), none about character class. No case asserts the old narrow behaviour; none updated.

## NOT done

- The sweep of critic-course-admission, critic-generic-batch, critic-packet-preflight, critic-dispatch-preflight, session-critic-finalizer, check-verify-case-completion, check-product-capability-inventory and generate-architecture-overview --check in clone and clone2 was started in one background run (driver mode suites) but its results were NOT read when this checkpoint was written. Logs are under scratch/agent-out/w7dc/logs (names: admission, batch, packet, dispatch, finalizer, vcc, inventory, arch; suffix 2 for clone2). No claim is made about them. No VCR01 count pin measured: the added lines are a helper change, not a new case, so the review-economy case count is unchanged.
- Clones left in place for the continuation; cleanup not run.
- JSON schema patterns (F2), hint quoting (F3) out of scope.

## Proposed commit message

fix(critic): finish the path character rule for the economy projection and verify the focused suites

## Operator flow and classification

Apply the F1 patch first, then this diff; git add -u with a path limit, commit with --no-verify, stamp, install. No protected test path (agent-obligations section 2) is touched. An independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
