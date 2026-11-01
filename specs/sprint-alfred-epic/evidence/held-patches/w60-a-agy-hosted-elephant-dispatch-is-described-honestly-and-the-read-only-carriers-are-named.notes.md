# w60 — an Antigravity-hosted Elephant is told honestly what it can dispatch, the read-only carriers are named, a review dispatch ends the parent turn (candidate 17, slice 11)

Applies after w56 (same guard file, different hunk). Apply order for this slice: w56, then w60.

## What went wrong

In the Antigravity (AGY) greenfield run no subagent ran at all. The Elephant dispatched the Critic only; the design review, the implementation and the tests it did itself. Read against the source:

1. **Implementation.** Native `invoke_subagent` for `goldfish-implementor` is refused by design (`AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE`). The refusal pointed at `elephant-implementation-dispatch.mjs`,
   which is documented as the Codex-to-Antigravity implementation entry (its header says so) and requires `duties.implement.antigravity` (opt-in; mechanic and deep are `unavailable` in the registry)
   and a stored session consent. Launched from an AGY-hosted Elephant it started a nested `agy` child that never answered, about 22 minutes. An AGY-hosted Elephant has no sanctioned implementation route
   that is known to work; the text sent it into one.
2. **Read-only reviewers.** The agent used the runner-native type `research` and got `DISPATCH-WRITE-CARRIER-REQUIRED`. The guard is right (it admits the shipped read-only roles critic,
   readiness-reviewer, plan-verifier, consult-advisor; `research` is not a Pipeline role and carries no read-only guarantee), but the text did not say which carrier to use.
3. **Briefing generator.** `dispatch-briefing.mjs` knows `claude` and `codex` only; a Gemini model id failed `DBG-MODEL-FAMILY` with a repair that tells the caller to pass a Claude id. The AGY route does not read
   that briefing at all (it reads a `pipeline.role-dispatch-request.v1` packet and its own V3 route).
4. **Critic delivery.** The Critic's message stayed under `.system_generated/messages/undelivered/` while the parent kept working in the same turn; the review was finalized in the main context.
   `antigravity-native-dispatch.md` said nothing about it, and said "do not start another `agy` process", which contradicts the implementation route.

## Change

- `antigravity-pretool-guard.mjs`: the native-implementation refusal now names the sanctioned entry with its argv, says it is the Codex-to-Antigravity route and unproven from an AGY-hosted Elephant, allows at most
  one attempt, says to stop and ask the PO when it does not return `authored-commit-recorded`, forbids writing the implementation unless the PO decides so, and points read-only roles to the native route.
- `elephant-implementation-dispatch.mjs`: when the host is Antigravity (`resolveActiveRunner`, injectable as `resolveHostRunner`) the receipt carries `advisory: AGY-HOSTED-ELEPHANT-UNPROVEN`. It refuses nothing and the
  receipt of any other host is byte-identical to before.
- `guard-dispatch.mjs`: the write-carrier refusal names the type it refused and the carriers that are admitted.
- `dispatch-briefing.mjs`: a Gemini model id gets a sentence that an Antigravity dispatch does not use this generator. The Claude-family refusal is unchanged.
- `references/antigravity-native-dispatch.md`: the route table per role (read-only roles native after prepare; implementor not native, entry and argv; mechanic and deep not available), what the briefing generator does
  and does not cover, one attempt then the PO, and "end the parent turn after dispatching a read-only role" (marked as observed in the greenfield run, the runner rule itself not verified).
- Tests: the native-implementation guard case, the carrier refusal, the Gemini hint, the advisory (AGY, codex, claude, thrown route) and a doc pin. Mutation-checked: advisory condition and Gemini hint each turned their
  case red; originals restored from backup. AGY guard suite, dispatch-briefing, dispatch-guard, selector and doc-pin suites pass (163 plus 81 plus the 38-case AGY guard suite).

## Not changed / not proven

- No hard stop for an AGY-hosted Elephant: the route might work in a setup this repository has not seen (for example native Windows). A native AGY implementation consent built from the hook's conversation id
  (`antigravityArtifactHostContext`) is a design decision for the PO and is not built here.
- Not run on a real Antigravity session. The cause of the 22 minutes is not established (w58 bounds the child launch either way).
- The runner's rule for delivering a subagent's message (when the parent turn ends) is the report's observation, not verified.
