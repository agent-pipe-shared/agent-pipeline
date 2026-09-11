# 0.6.2 greenfield findings across three runners — 2026-09-11

This record condenses three runner-authored session analyses supplied after
small greenfield product runs with Claude Code, Codex and Antigravity. The raw
reports remain local because they contain session detail and local paths. Their
timings, token counts and causal interpretations are observations from the
runners, not a controlled benchmark. Claims below are therefore labelled as
measured, estimated or inferred rather than promoted to product guarantees.

## What the runs established

- All three runners completed meaningful lifecycle work rather than a scripted
  smoke test: onboarding and specification work, implementation, verification
  and review or delivery steps were exercised. The runs support the current
  runner-neutral product contract; they do not show identical enforcement
  mechanics or identical workloads.
- The Antigravity run produced a small browser game, passed 7 of 7 Playwright
  checks and pushed the result. Its report records 114.9 minutes wall time,
  roughly 38–42 active minutes, 6.4 minutes of primary implementation and 273
  orchestrator tool calls. Its approximately 520,000-token total and 42%
  governance share are estimates.
- The Claude run records about 89 machine-observed minutes. It attributes about
  31 minutes to dispatched content and quality work and estimates roughly 55%
  of its own time as administration. Its independent Critic found a real
  missing restart-test assertion, while the signed push and hash-chained audit
  path completed and attempted hardening bypasses failed.
- The Codex run exercised recovery and verification binding but reported high
  ceremony and a read-scope denial during transcript-oriented diagnosis. Its
  product implementation ran through Goldfish; after one worker repeatedly
  under-delivered, a fresh Goldfish completed the game logic and tests. This is
  current end-to-end evidence that Codex worker dispatch is functional, while
  also motivating the separate bounded-retry work. The 0.6.2 candidate
  subsequently corrected the over-broad read denial. The report's final
  statement that the project was not pushed is stale relative to the later
  completed run, so it is not retained as outcome evidence.

These observations support hard enforcement across Claude Code, Codex and
Antigravity within each runner's tested adapter and host boundary. They do not
support a claim that every runner uses Claude hooks or that no future bypass is
possible.

## Findings mapped to existing work

1. **Dispatch packets must fail before launch.** The Claude report records one
   malformed Critic dispatch that consumed 30 seconds and 50,629 tokens while
   producing zero turns. This reinforces
   `pipeline.role-dispatch-payload-errors-fail-before-model-launch`, including
   its all-role, all-runner scope and zero-model-call acceptance test.
2. **Documentation needs reader-level review.** The reports describe useful
   product behavior, but the tester-facing explanation originally weighted
   audit machinery ahead of the SDLC capabilities that motivate a trial. This
   is direct evidence for the already accepted Nova B Lektor item and its
   separation between an expensive reader review during the documentation
   block and a cheap release-time binding check.
3. **Audit evidence is valuable but hard to discover.** Codex reported that
   ignored Verify and dispatch artifacts were difficult to use as durable
   evidence. Claude confirmed that signed delivery and the audit chain worked.
   Together these reinforce the existing Nova B audit-evidence overview: it
   must point to both versioned and local-only evidence without publishing raw
   logs or private paths.
4. **Back-to-back human signatures remain costly.** The Claude run encountered
   two signature ceremonies in one workflow. The accepted Nightwing defect for
   per-intent proof artifacts already describes the collision and the required
   consumer-level test, so no duplicate item is needed.
5. **Pre-generation onboarding answers needed correction.** This was a real
   user-facing dead end. It is fixed in the 0.6.2 candidate by an explicit,
   revisioned replacement command that closes after generation. The ordinary
   apply command remains idempotent and immutable.
6. **Verify scope is a future calibration opportunity.** ADR-0081 already makes
   work, Critic, candidate and push verification boundary-aware while retaining
   full verification for releases. A version-only stamp still selects the full
   registry because executable and configuration surfaces deliberately default
   to conservative classification. Relaxing that rule requires gate-strength
   evidence; it is not a safe 0.6.2 quick fix.
7. **Push preparation revealed known failures sequentially.** The Claude run
   needed three `push-init` attempts because the driver returned after the
   first red layer. The 0.6.2 follow-up changes the driver to execute all
   independent preflights and return their failures together. When an earlier
   layer is red, the full report runs in a mutation-free inspection mode so all
   findings bind the same candidate; any failure still blocks signature
   preparation.

## Candidate disposition

The installed local 0.6.2 candidate contains the read-scope correction, bounded review
input handling, session Critic default, optional external launcher, impacted
Verify behavior, user-project baseline checks and pre-generation answer
replacement. The push-diagnostic aggregation and its two Critic corrections
are included. The final correction review passed with no blocker or major
finding. Exact full Verify then passed 520 of 520 suites with Security exit 0
on stamped commit `18df868103346d4eb987b85219c55960cd39ce6b`, tree
`04fc11924d8adde3541f37d40d1d9da19bbeb71c`, run
`verify-1789080348179-424587e2f3c68292`. Local Codex and Claude readback
confirmed build `20260911004430.61ed1f6`.

No additional blocking or major defect was established by these reports after
those corrections. The remaining items improve cost, discoverability and
workflow ergonomics and stay in their accepted later sprint assignments.
