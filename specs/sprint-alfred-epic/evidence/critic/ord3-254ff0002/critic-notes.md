# Critic notes - ordinal 3 correction review, candidate 254ff0002f7682468d4143d03ae88753f043f43a

Phase A material (each line: candidate - not a finding)

- plugins/pipeline-core/lib/guard-override-ledger.mjs:1-61 - no production consumer; hooks/guard-git.mjs:384 still resolves the tree ledger (candidate - not a finding)
- plugins/pipeline-core/lib/guard-override-ledger.mjs:7-8 - header says the ledger "now lives" under the common Git dir (candidate - not a finding)
- commits 756b326 / ad63852 / ff0d7f5 / 74a77e0 - Dispatch: stage-0 (elephant) on diffs beyond EL-01 stage-0 criteria; GIT-03 line 41 exception form unused (candidate - not a finding)
- commits 0ce02d2 / 8b52ed2 / 73b552c / ff1e33d - backlog-only commits carry stage-0 instead of administrative binding (candidate - not a finding)
- scratch/critic-ord3/evidence/critic-diag-ord3b.log:12-13 and critic-diag-ord3.log:702 - push-prepare.test.mjs PUSHSIG-S4c RED in both runs; no green rerun (candidate - not a finding)
- plugins/pipeline-core/scripts/commit-pipeline-owned.mjs:23-31,59 - default (no --agent) commits without the GIT-03 pair; spawned commit not visible to the agent command guard (candidate - not a finding)
- plugins/pipeline-core/lib/guard-override-ledger.mjs:38-50 - read side fail-open on unreadable/corrupt ledger (replay surface) (candidate - not a finding)
- plugins/pipeline-core/lib/guard-override-ledger.mjs:53-56 - mkdir 0o700 does not harden an existing dir; file default mode (candidate - not a finding)
- plugins/pipeline-core/scripts/close-coordinator.mjs:701-704 - courseAuthorship reported outside the plan digest (candidate - not a finding)
- critic-diag-ord3.log:216,395,399 vs ord3b/ord3c - Q9 (D55), NGHS09, NGHS13 failed in superseded run, pass later on same tree (candidate - not a finding)
- backlog/items/2026-10-20-the-stage-0-verifier-bound-is-not-the-stage-0-criterion.md:24-26 - records that a session "can only write the stage-0 trailer"; no due date (candidate - not a finding)
- backlog/index.json - endpoint diff examined at stat level only (candidate - not a finding)

## Phase B results (evidence gate passed)

Header: requested route claude-opus-5-5 at max; effective identity claude-opus-5-5 (runtime system prompt of this dispatch), effort not observed; lane functional-equivalent-read-only, OS isolation not asserted. Ruleset 254ff0002f7682468d4143d03ae88753f043f43a. Candidate: enumerated commits f62b5143a16cd08c8b61878df99ad5a8a727f9be..254ff0002f7682468d4143d03ae88753f043f43a, tree 3355cfbe061eb9caaa36bb1fea314a6137be19ca, ordinal 3 (correction).

F1 (major) - D56 (2) ledger move not delivered; new module unconsumed, header claims the move as current.
  Evidence: lib/guard-override-ledger.mjs:7-8 ("now lives under the repository's common Git directory"); only importer lib/project-authority.test.mjs:22; hooks/guard-git.mjs:382-384 still resolves a tree path (unchanged in range); scripts/commit-pipeline-owned.mjs:6-8,24-26 still treat the override log as a tree file. Riders (latent, unwired): read side skips unreadable files/corrupt lines on the replay-consumption path (38-50); mkdir 0o700 does not harden an existing dir (53-56). Spec-ref: D56 (2), D56 preamble, hunt cat. 3.
F2 (major) - Dispatch: stage-0 (elephant) on all 10 commits; 756b326 (4 files, ~19 lines, test), ad63852 (5 files, >33 lines, test), ff0d7f5 (test-only), 74a77e0 (2 files, ~93 lines, new module) exceed EL-01 stage-0; GIT-03:41 exception form (D55 Q12) in force at base, unused; backlog-only 0ce02d2/8b52ed2/73b552c/ff1e33d had administrative (elephant) (git.md:50-64). Verifier accepts stage-0 up to 10 paths (backlog item :19-26) -> invisible misdeclaration. Not asserting the work was unratified (D51 (4), D54 (2), D55 Q11, D56 (4)). Spec-ref: GIT-03, D55 Q12, EL-01 (roles/elephant.md:35).
F3 (major) - push-prepare.test.mjs PUSHSIG-S4c RED in ord3 (log :702,:811) and ord3b (log :12-13, exit 1); ord3c reran only native-goldfish-host-state; fullVerify not-run. Failing case (push-prepare.test.mjs:1088-1102) and push-prepare.mjs not modified in range - attribution to the delta not established. Spec-ref: D56 (3), QG-03, QG-02.
F4 (minor) - commit-pipeline-owned.mjs:10-12,23-31,59: default without --agent spawns a commit without the GIT-03 pair; agent command guard cannot see a Node-spawned commit; commit-msg backstop admits neither-signal messages (git.md:47); docs/push-release-flow.md:124-129 shows the command first without --agent. Spec-ref: GIT-03 (git.md:32,47).

Prior IDs (admissible review-source citations only): F-A -> backlog item source only, no code/verifier change, stage-0 use continues (F2); F-B -> not reaching production (F1); F-C -> delivered via --agent, residual F4; F-D -> delivered (close-coordinator.mjs:483,493,701-704; pins test (g); SKILL.md); F-E -> no citation in read review sources; not verifiable from admissible input.

Deliberately not flagged: cat 1 D55 Q1 courseAuthorship outside digest by design, apply unchanged and pinned; cat 2 all 19 source paths map to D55 Q1 / D56 (2) / backlog registration; cat 3 --agent named by pipelineOwnedRemedy (push-prepare, push-init, po-approval-request) and both doc copies; cat 5 PF-36 assertions strengthened, corpus count 36->38 matches 2 new cases, pins additive; cat 7 no TP path touched, doc copies identical blob 9279e93, vendored-canon GREEN; cat 8 no secrets, no co-author/session trailers, AI-Assisted on all 10; cat 10 no new external dependency; cat 11 English; backlog transitions 2315-2318 hash chain consistent, STATUS open 256->260 matches 4 new items. Dropped: Q9 (D55)/NGHS09/NGHS13 red-then-green on same tree (ord3 env lacked scratch/; others unestablished) -> trajectory note; --agent writing stage-0 (elephant) regardless of role predates range. Not reached in content: backlog/index.json (stat only).

Trajectory: consistent (JSON exit/status match logs; ord3b/ord3c log SHA-256 match; head/tree/dirty match candidate; spec, CLAUDE.md, git.md, pipeline.yaml digests match; ord3 log and remaining guardrail digests not re-hashed). Limits: scratch runners, captured-process-output-not-host-attested, Full Verify not run. Authorship: no dispatch records; all commits Elephant-direct by trailer.

Briefing violations: none.

Pass/fail: FAIL
