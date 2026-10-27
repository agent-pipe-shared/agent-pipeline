# W7 elephant-context guard-dispatch (C1): INTERIM, tests only, DO NOT APPLY

Candidate 4e02aa2afc028c33ce3522395e354764c785652d. Outcome: blocked at the tool-budget checkpoint (call 28 of 35).

## State
- Done: recon re-verified against the code; six RED cases written in a scratch clone (GD67..GD72, corpus count 67 -> 73); patch holds ONLY the test file edit (53 insertions, 1 deletion).
- NOT done: no production edit to `plugins/pipeline-core/hooks/guard-dispatch.mjs`; the new cases were never run (neither RED nor GREEN); the whole-file baseline versus patched failing-name comparison was never run; the apply check was never run; clones are still present under `scratch/agent-out/w7qc/` (driver `cleanup` not run).
- The patch as it stands would turn the suite RED with six new failing cases. Do not apply it without the production half.

## Re-verified recon claims (against the clone at the candidate)
- `guard-dispatch.mjs` has no template-shape check on an Agent prompt (the only WARNING for prompts is the Workflow unresolved-prompt notice, line 176).
- `writeCapableCarrierAdmission` (line 210-218) refuses direct `Plan` and `general-purpose` with `DISPATCH-WRITE-CARRIER-REQUIRED`; direct `Explore` is admitted (line 215). The existing GD2i cases expect ALLOW for Plan and general-purpose: this is the pre-existing carrier-policy red. Its failing names were not enumerated in this run.
- No Explore/Plan route text and no retry state exist.

## Design (not implemented)
- A: after `evaluated` is computed (around line 807), for a direct dispatch whose bare type (strip `pipeline-core:`) starts with `goldfish-` or equals `critic`, test the prompt against the six numbered field markers (goldfish) or the three critic headings (Fail-closed reference boundary, Phase A adversarial hunt, Phase B evidence gate); if they are missing, write one stderr line `WARNING (guard-dispatch): GUARD-DISPATCH-PROMPT-NOT-TEMPLATE-SHAPED: ...` naming `templates/prompts/goldfish-task.md` or `templates/prompts/critic-review.md`. Markers can be copied from `scripts/elephant-context-measure.mjs` lines 35-51. Never changes the exit code.
- B: in the carrier refusal loop (line 812-817), for type Explore or Plan, append `admitted route: Explore through a direct Agent call`. Durable state exists by convention: `<resolveGitCommonDir(root)>/agent-pipeline/<feature>/...` (see `lib/advisor-prohibition-binding.mjs` line 86). Use `agent-pipeline/refused-dispatch-retry/<sha(session_id)>/<sha(type NUL prompt)>.json`; if present, refuse with `GUARD-DISPATCH-REFUSED-RETRY` and a pointer to `backlog/items/2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads.md` instead of the full text; fail open (full text) when there is no session id or no common dir.

## Cases written (GD67..GD72, ids ascending, end of the test file)
GD67 A-i goldfish warns; GD68 A-ii template-shaped goldfish and critic emit none; GD69 A-iii critic warns and stays admitted; GD70 A-iv Explore and general-purpose emit none; GD71 B-i refused Plan names `admitted route: ...Explore`; GD72 B-ii unchanged retry gets the pointer, a changed prompt or other session gets the full text. Corpus assertion updated 67 -> 73. No existing case was changed, weakened or removed.

## Proposed commit message (for the finished slice)
feat(guard): warn when a dispatch prompt is not template-shaped and stop unchanged retries of a refused Explore or Plan dispatch

## Operator flow (when the production half exists)
apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. Protected-path classification observed: neither `guard-dispatch.mjs` nor its test matches TP-1..TP-13; edits in the scratch clone were admitted.

## Gates
An independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: RED cases + patch (tests only); remaining: production edit in guard-dispatch.mjs, run RED then GREEN, whole-file base vs patched failing-name comparison, regenerate patch, apply check, cleanup; next step: reuse `scratch/agent-out/w7qc/clone` (still present, test edit in place) and apply the design above.
