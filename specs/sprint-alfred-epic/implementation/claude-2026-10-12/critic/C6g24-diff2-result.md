# Critic C6g2 and C6g4 correction-diff review 2 of 3: result

Review object: cb2255013, 4b03f6d21, 667f1a99b (git show per SHA). Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5.
Verdict: **FAIL** (one major finding). Notes: scratch/dispatch/critic-aeb9390cc595f0d1f/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G24-F1 | major | 667f1a99b changes `normal()` in the self-protected protected-baseline module from a double- to a single-backslash replacement without any test that drives a backslash path. There is no RED-to-GREEN proof. The changed surface is unpinned: pattern normalisation at :108/:110/:114, a doubled backslash now becomes `//`, and separators are not collapsed. | plugins/pipeline-core/lib/protected-baseline.mjs:30,33,42,108,110,114; QG-04; spec §4.3 A3 contract |

Cleared: G2-A (the DACL pin's native-facts check can now fail, with negative controls); G4-1 and G4-2 (the AGY header line citations, and its owner and due date against the spec); trailers; dependencies; language; security.
Briefing note: the findings registry pointed at the prior result file instead of a bare ID list (the Critic did not open it). Future DIFF briefings carry bare IDs only.

## Coordinator disposition

G24-F1: correction dispatch ALF-C-C6G24-F1. It adds behavioural cases for `normal()`: single and double backslashes, mixed separators, and a native `plugins\pipeline-core\hooks\hooks.json` spelling matching its forward-slash rule. Whether separators should collapse is decided from the module's contract. A production change to protected-baseline.mjs would be a signature-bound patch. DIFF review 3 follows on that fix.
