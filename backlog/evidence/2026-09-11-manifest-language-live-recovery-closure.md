# Manifest-language live-recovery closure — 2026-09-11

The open item described a language/configuration correction that unnecessarily
required a complete process restart. The current implementation now separates
that data repair from an actual runtime-target transition.

## Implementation lineage

- `0ac3ab3247a10abc8e98e636146dfac1e5bf2ead` admits real projection drift into
  kickoff apply and regenerates the complete owned runtime projection inside
  the same language-correction transaction.
- `a2b952e4bef09375326e084cbc45d3b75cd37d06` closes the common same-language
  branch: even when the requested language equals the seed default, admitted
  drift is regenerated before readiness is reported. This is the final
  implementation commit used as `closure_commit`.

## Acceptance evidence

On 2026-09-11, the host-bound
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` suite completed with
169 cases across four shards and zero failed shards (exit 0). Its exercised
regressions include:

- a language differing from the portable-seed default reaches a consistent
  authority without a mismatch/drift repair chain;
- a language switch with unrelated runtime projection drift repairs that drift
  atomically, without a separate plan/apply repair;
- the seed-default, unchanged-language kickoff also repairs genuine drift;
- a genuine Codex runtime initialization still returns and persists
  `restart-required`.

The test uses temporary repositories and real Git operations, so it was run
host-bound after the WSL workspace sandbox rejected child-process execution.
No native Codex sandbox or App-Server acceptance is claimed or needed for this
data-path closure.

Rollback is a revert of the two implementation commits above; the older
restart-conservative behavior remains represented by the genuine
runtime-target test.
