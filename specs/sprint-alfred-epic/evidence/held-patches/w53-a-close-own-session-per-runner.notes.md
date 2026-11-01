# w53 — the closing session's own descriptor is derived for the runner that is closing (candidate 17, slice 7)

The close cleanup receipt (`close-coordinator.mjs write-cleanup-receipt`) and the cleanup recovery (`session-cleanup.mjs`) hard-coded runner `claude` when they looked
for the closing session's OWN descriptor. On Codex the own descriptor (`codex-<session id>`) was therefore counted as a foreign session: the receipt could never become
`complete`, and the text said "other sessions remain" when the true cause was "own session not derived". On Antigravity nothing could be derived at all.

## Change

- `lib/own-session-descriptor.mjs` (new): `invokingRunnerFromEnv(env, explicit)` (explicit valid runner wins; `CLAUDECODE=1` is Claude; the Antigravity markers are
  Antigravity; otherwise Codex) and `resolveOwnSessionDescriptor({ runner, env })` returning `{ runner, descriptorSessionId, derivation: "observed" | "unavailable", reason }`.
  Claude gives `claude-<id>`, Codex gives `codex-<id>`, Antigravity is `unavailable` with the reason (it creates no session descriptor and a command-line process does
  not carry its session id). It never picks "the newest" or "an unknown-owner" descriptor, because that guess could hide a live foreign session.
- `lib/claude-hook-session-owner.mjs`: exports `codexHookDescriptorSessionId` (the existing Codex id rule, now reusable).
- `lib/close-cleanup-receipt.mjs`: the observation (and so the evidence digest) now binds `runner`, `ownSessionDerivation` and `ownSessionReason` when the caller supplies
  them; when the own session could not be derived and descriptors exist, the result carries the typed code `CLOSE-CLEANUP-OWN-SESSION-UNDERIVED` instead of implying
  that other sessions remain. A caller that supplies nothing (the 16d callers) gets the previous observation unchanged.
- `scripts/close-coordinator.mjs`: `write-cleanup-receipt` resolves the own session per runner, prints `runner`, `ownSessionDerivation`, the reason and the typed code, and a
  `next` text that names the cause.
- `scripts/session-cleanup.mjs`: the requester session id uses the same resolver (call sites pass the parsed flags).
- `skills/close-feature/SKILL.md`: the receipt paragraph describes the per-runner derivation, the typed code, and labels a hand-written empty-input receipt as
  `operator-asserted` (an assertion, not an observation).
- Tests: four new tests in `scripts/close-coordinator.test.mjs` (runner detection, per-runner receipt derivation, typed underived result, descriptor derivation per runner),
  mutation-checked (a mutant applied to the derivation turned a test red; the original was restored from backup).

## Not changed / not proven

- Nothing was run on a real Codex or Antigravity session. Unproven: that the session id a Codex hook records equals `CODEX_THREAD_ID` / `CODEX_SESSION_ID` as seen by a
  command-line process. If they differ, the Codex path ends in the typed `CLOSE-CLEANUP-OWN-SESSION-UNDERIVED` result (visible, not a false `complete`), not a silent wrong match.
- Antigravity stays `unavailable`: with descriptors present its receipt stays `uncertain`; closing past that needs a decision on an Antigravity session identity (open item in the runner matrix).
- Suites: close-coordinator (46) passes in the clone; session-cleanup-binding (68) and session-cleanup-recovery (39) pass under `scripts/run-parallel.mjs` (they fail identically on the
  unmodified baseline when run standalone in a clone, with `domain-ancestor-unsafe`, so the isolated runner is the reference).
