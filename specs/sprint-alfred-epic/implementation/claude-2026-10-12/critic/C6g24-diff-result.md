# Critic C6g2 and C6g4 correction-diff reviews 1 of 3: results

Both reviews stopped at the 80 % budget checkpoint and withheld pass/fail as partial; no blocker or major finding in the reached portion.
Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5 in each runtime prompt.

## C6g2-diff (1931e07b0, 07095b411)

Notes: scratch/dispatch/critic-a0a2c53bcc84af8e2/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G2-A | minor | 1931e07b0 claims the tautological DACL assertion is gone, but `assert.match(String(observed.nativeFacts), /./u)` passes for undefined, null or any object. | windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures.test.mjs:259-260 |
| G2-B | minor | The protected-baseline normalisation fix is deferred to a signature-bound patch in commit prose only, without owner or due date (QG-06). | 1931e07b0 message, last sentence |

Cleared: the guard condition `!Object.hasOwn(toolInput, "run_in_background")` fails closed for every non-false value; GD57-GD60 additive, GD58 RED on the previous logic; host-limitation reason owner/due; comment hunk; trailers; dependencies; language; security.

## C6g4-diff (b8eac766a, 000bbafe1, 5360819d9)

Notes: scratch/dispatch/critic-a5ffcf93c676afd72/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G4-1 | minor | The AGY pin header presents its fail-open list as complete; it omits unparseable input and empty target (exit 0), the dispatch-record*.json basename exemption, and that the writer can mint its own authorizing in-progress record (condition 6). | agy-el01-write-authorization-gap.test.mjs:28-42 vs guard-el01-tripwire.mjs:218-249, 252-259, 273, 281-282, 328-329 |
| G4-2 | minor | The header gives the open AC-109 decision due 2026-10-31, while spec.md bounds the Coordinator disposition of unresolved original rows, AC-109 included, at 2026-10-19. | pin :21-26 vs spec.md:3013-3020 |
| G4-3 | minor | 5360819d9's behavioural pin is deferred with a conditional trigger and no owner or due date. | 5360819d9 message body |

Cleared: AGY header line citations; AFR18 assertions traced to product branches; per-unlink cases vs git-hook-footprint.mjs:29-47 with exact codes; 5360819d9 source (MANDATORY_HOOK_IDS, refresh literal, conditional field, status/nextAction untouched); dependencies; language; trailers; security.
Not reached: agy-host-observed-store.mjs derivation of AGY-HOST-STORE-REQUESTER-UNAVAILABLE; project-uninstall.mjs PU-SHARED-SCOPE-DRIFT raise sites; pipeline-start-preflight.test.mjs and consumers of the new field; guardrail files; no suite run.

## Coordinator disposition

- G2-B and G4-3: recorded in the session ledger and PO topic list with owner Coordinator; both close when the Route B block applies ALF-C-C6G2-CORR-B.patch and the held git-hook-runtime pin is committed (due 2026-10-19).
- G2-A, G4-1, G4-2: correction dispatches.
