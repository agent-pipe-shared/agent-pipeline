# PF-97 slice F3: walk a real candidate packet with special file names through the Critic route (held patch, stacked)

Candidate fbe44a6be. Stacked on the held bundle patch (F1, F1-c2, F2), applied in both scratch clones before work. The patch of this slice (w7-critic-path-charset-f3.patch) is the diff of the clone against that stacked baseline and touches ONLY plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs. No production file changed.

## Cause

No test drove a real candidate packet with special file names beyond the first step. An earlier fix failed after one step was walked, so the whole route is now walked at once.

## Changed lines (test file only)

- imports: dirname; inspectCandidatePacket, normalizePacketPath (preflight); projectCriticReviewEconomy (review-economy); diagnosticPath, diagnosticEvidenceLocation (critic-diagnostic-evidence).
- fixture(extraCandidateFiles = []) writes extra files into the candidate commit.
- New case CPPW-1 (CPP18) before the registration assert.
- Count pins raised 17 to 18: registration assert; in CPP09 self-probe caseCount, disposed length, counts pass 16 to 17, declaredCount, disposedCount. Justification: the corpus gained one case; no assertion weakened.

## Walk table (all against the stacked baseline)

Paths added: three framework route names (route groups with parentheses, a bracket segment, an at-sign slot with a dot-parenthesis segment), a dollar-sign name, a name with a space, a name with U+00FC (String.fromCodePoint(252)), a name with plus, equals, comma and tilde, and a name with a colon. The Linux host created all of them, including the colon file.

| Step | Reached | Result |
|---|---|---|
| 1 prepareCandidatePacket + inspectCandidatePacket | yes | accepted; diffPaths equals sorted added paths, unquoted |
| 2 claim, record, consume, readConsumedCandidateReceipt | yes | accepted (CPP-CLAIMED, CPP-CONSUMED) |
| 3 compileCriticReviewLineage (via the file's lineage() helper) | yes | accepted |
| 4 projectCriticReviewEconomy | yes | ok |
| 5 normalizePacketPath (what critic-generic-batch paths() calls) | yes | same list back; registerGenericCriticBatch itself not driven |
| 6 diagnosticPath + diagnosticEvidenceLocation on evidence/<path> | yes | accepted incl. colon; course-admission safe() is not exported, reachable only through its verbs, not driven |

No refusal at any step, hence no production gap and no relaxation.

## RED and GREEN

- GREEN: CPP18 passes. critic-packet-preflight.test.mjs whole file in the clone: tests 18, pass 18, fail 0. critic-review-lineage.test.mjs 17/17.
- RED (measured by the Elephant after the Goldfish stopped): this patch alone on HEAD, without the F1, F1-c2 and F2 patches, gives critic-packet-preflight.test.mjs 18 tests, 16 pass, 2 fail. CPP18 is the intended failure; the name of the second failure was not read (possibly the CPP09 self-probe that re-runs the file). So the walk case fails on the old narrow rules.
- Elephant verification on a fresh clone with f1, f1-c2, f2, f3 applied in order: critic-packet-preflight 18/18, review-economy 1/1 (own checks), critic-review-lineage 1/1 (own checks), critic-generic-batch 35/35, critic-course-admission 65/65, critic-diagnostic-evidence 13/13, critic-dispatch-preflight 63/63, check-verify-case-completion 32/32, check-product-capability-inventory 30/30, architecture overview current. session-critic-finalizer has one pre-existing red case (86 of 87), identical on the unpatched baseline.

## Failing-name sets

Whole files in the clone and in clone2 (stacked baseline, without this slice): critic-packet-preflight, critic-review-lineage, review-economy, critic-generic-batch, critic-course-admission, critic-dispatch-preflight (scripts), check-verify-case-completion: every run exited 0, so the failing-name set is empty in both; patched and baseline are identical. Baseline clone2 packet run has 17 cases, patched 18. Per-suite counts were read only for packet (18/18) and lineage (17/17); the other suites are exit codes only.

## Not done

The registration verb walk up to the lineage compile (FPR-LINEAGE-COMPILE) with a registered feature; direct drive of registerGenericCriticBatch and the course-admission verbs; hint quoting (out of scope).

## Proposed commit message

test(critic): walk a real candidate packet with special file names through the whole Critic route

## Operator flow

Apply the diff (git apply), `git add -u` limited to plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs, commit with --no-verify, stamp, install. Protected-path classification observed: the test file is not in the protected test-path table (TP-1 to TP-13); no ceremony needed. An independent Critic review stays a parent-owned batch gate.
