fix(close): commit an owned feature manifest only with the evidence it lists

- A Codex greenfield close ran commit-pipeline-owned.mjs, as finish-feature
  and the signed reconcile tell it to, while the feature manifest already
  listed an untracked evidence file. The manifest was committed alone and
  the evidence 46 s later. Every Critic course read walks each manifest
  revision and reads each listed evidence file there, so the course of that
  feature could not resolve again (CCA-EVIDENCE-MODE on the takeover and
  delta routes, CCA-EVIDENCE-READ on the history route) and a post-close
  re-review was blocked for good.
- An owned manifest now carries every listed candidate-evidence file that is
  untracked, a regular file and byte-identical to the listed digest into the
  same commit (reported as `carried`). Anything else refuses with
  CPO-MANIFEST-EVIDENCE, names the files and commits nothing.
- Tests use real Git and the real course reader, with a control that commits
  the manifest alone and shows the reader failure.

AI-Assisted: true
Dispatch: stage-0 (elephant)
