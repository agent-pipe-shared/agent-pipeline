# Handover to 0.5.2 — three findings from the `sprint_phoenix` side

> Findings about **0.5.2 code**, not about this branch. They are recorded here
> because `sprint_phoenix` will rebase onto that release and hit all three.

## How these were established

`sprint_phoenix` is a 0.4.6-era checkout, 474 commits behind `origin/main`. The
runtime that actually intercepted tool calls in the observing session was the
installed plugin build `0.5.2+claude.20260806101646.967bd09`.

Every claim below was established by reading or invoking **that installed
artifact**. Nothing here was inferred from this checkout's own source — a
distinction that matters, because during the same session a guard was reasoned
about from working-tree source while an older installed build was the one
enforcing, and the two disagreed on the verdict. Line numbers refer to the
installed build; re-anchor them before acting.

## 1. The publication executor requires gate evidence that nothing produces

**Severity: blocker.** This closes the only sanctioned route for an externally
attested push.

`hooks/guard-push.mjs:1449` refuses a raw push that carries a valid critical
proof and directs the caller to the publication executor:

> Raw git push cannot consume a critical proof; use the fixed publication
> executor for the externally attested action.

The executor only ever *reads* its gate evidence:

- `scripts/publication-executor.mjs:232` — `readBoundEvidenceRecord(repository.root, state.identityProbe, "identity")`
- `scripts/publication-executor.mjs:237` — `requireSuccessfulGate(identity, "identity", state.candidateOid, state.candidateTree)`
- `scripts/publication-executor.mjs:544` — the only non-test occurrence of the schema string `pipeline.publication-gate-evidence.v1`

No script emits that schema. `scripts/tool-identity.mjs` and
`scripts/release-preflight.mjs` ship in `scripts/` but carry no CLI entry point
and do not write gate evidence; they are libraries in a scripts directory.

The result is a closed loop with no exit. The guard permits the action only
through the executor, and the executor cannot be satisfied except by
hand-writing the attestations that authorize one's own publication — which is
the one thing an agent session must never do. The path is therefore not merely
incomplete for agents; it is uncompletable honestly by anyone.

**Suggested direction:** ship the two producers as real CLIs emitting
`pipeline.publication-gate-evidence.v1`, or have the executor derive the
identity and release-preflight gates itself from the probes it already binds.

## 2. `isPush` matches the substring anywhere in the command, including prose

`hooks/guard-push.mjs:220`:

```js
const isPush = /\bgit\s+push\b/.test(normalized) || directPush || shellWrapperPush;
```

The regex tests the entire normalized command string. `directPush` and
`shellWrapperPush` immediately above it do the job properly, by inspecting the
command *position* (`detectionTokens[1]`, and the `-C <root>` form). The
substring test is the one that overreaches.

**Reproduction.** A `git commit` whose message body contained the sentence
"a raw git push still cannot consume it" was classified as a push and then
rejected by the shell-bundle rule:

> BLOCKED (guard-push): push target is not unambiguous.
> Reason: push must be a standalone command (no shell bundle, pipe,
> redirection, or substitution).

The failure is fail-closed, so the risk is low — but the friction is not. It
makes it impossible to commit, document, or discuss push policy inside any
single command that mentions the phrase, which is precisely the workflow of
anyone working *on* the push gate.

**Suggested direction:** drop the substring test and rely on the two positional
detectors, or apply the substring test only outside quoted regions.

## 3. The push remediation text names only half of what is required

`hooks/guard-push.mjs:1437` tells the caller:

> Record: `node harness/scripts/pipeline-state.mjs approve-push --by <name>`.

The critical-proof check at `:1446`–`:1456` is independent of the approval
freshness check and is also required. A caller who follows the hint literally
records a `pushApproval` in mutable state, attributed to a human name supplied
in `argv`, and still cannot push.

In a repository whose push policy states that a `pushApproval` in mutable state
is never executable authority and must not be promoted or inferred from state,
the hint reads as an instruction to produce exactly the record the policy
disclaims. An agent following its guard's own remediation text lands on the
wrong side of the rule.

**Suggested direction:** say in the same message that the state record is
necessary but not sufficient, and name the proof requirement alongside it.

## What this means for the rebase

Findings 2 and 3 are friction and messaging. Finding 1 is load-bearing: after
the rebase resolves the `security-latest.v2` evidence gap, and after a PO
signature satisfies the two authority findings, publication still stops at the
missing evidence producers. Worth measuring before investing in a signature.
