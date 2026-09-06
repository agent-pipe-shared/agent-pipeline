# Neutral findings registry — aefe0e9c / 6ca241f1 (selected Codex Critic transport)

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commits `aefe0e9c` and `6ca241f1`. Verdict: **FAIL**. Three major, one minor.

- **F1** (major): an observed "no child started" is converted to `undefined`
  and therefore recorded in the durable execution receipt as a child that
  started and lost its stdio; the transport's two failure codes are inverted
  for exactly that case.
- **F2** (major): the seam where F1 lives is exercised by no test — every
  test that drives the composed path injects past the real bridge.
- **F3** (major): the lane briefs contract files it neither pins nor binds,
  where the sibling native lane in the same file family enforces separation
  and digests.
- **F4** (minor): an unbacked impossibility claim in a code comment.

## Disposition

**F1 — confirmed against the source, and the dispatcher missed it first.**
Verified directly rather than accepted:
`sandboxed-readonly-host-bridge.mjs:131-133` routes `childStarted === false`
to `noChild()` — a truthful receipt with `terminal.childStarted: false` and
`observed` nulled — and routes **anything else, `undefined` included**, to
`postLaunchFailure()`, which writes `childStarted: true`, `stdioStatus:
"lost"` and populates `observed` from the selection.
`codex-critic-selected-host.mjs:137` maps the observed `false` to `undefined`.

So a run in which no process ever existed is recorded as one that started and
lost its output. The module's own header states "nothing here synthesises a
terminal observation, an exit code, or a cleanup status" — that sentence is
false as written.

**The implementing dispatch disclosed this**, in its own report, as one of two
"precedent quirks mirrored from `advisory-host-bridge.mjs` (not introduced,
not fixed there)". The dispatcher relayed it to the PO as a deliberate choice
"so the two duties behave alike" and did not check what the mapping does
downstream. That reading was wrong, and it is worth recording as a dispatcher
error rather than a dispatch one: **a disclosed quirk is a finding handed over
early, not a finding already dispositioned.** The dispatch did its part by
naming it.

The precedent point stands and does not excuse it: `advisory-host-bridge.mjs`
carries the identical expression, so this mirrors an existing defect rather
than inventing one. It propagates it into a second, SECURITY-class transport.
The fix is one line.

**F2 — real and it is why F1 survived.** All three tests driving
`runSelectedCriticHost` inject `executeSandboxedReadonlyDuty`, so the real
bridge never runs and the `false → undefined` branch has no coverage at all.
The same gap hides a second discarded observation: on the completed-but-invalid
path the app-server observed a real exit code, signal and `stdinEnded`, and
`postLaunchFailure` records `exitCode: null` / `stdioStatus: "lost"` anyway.

**F3 — filed, not fixed here.** Design-level: the lane resolves
`roles/critic.md`, `templates/prompts/critic-review.md` and the verdict schema
against the live checkout with only an lstat, and binds no digest of the
briefed bytes into either receipt. The sibling native lane enforces
`pipelineRoot !== repoRoot`, refuses a dirty ruleset checkout, and binds
`roleContractSha256`/`promptContractSha256`/`verdictSchemaSha256`. The Critic
also established that the advisory precedent briefs no contract at all, so
this is the first selected-lane member to brief one — and it dropped the
binding rather than inheriting an omission.

**F4 — rides with the F1/F2 fix.** The comment asserts the mirrored `take`-key
defect is "latent rather than live" in the advisory file on reasoning alone.

## Also recorded: a QG-01 violation the Critic named

The diff was handed over while `evidence/verify-latest.json` reports
`exitCode: 1`. The single non-zero suite is the TP-3-blocked registration
check, unrelated to these commits — which mitigates the cost but does not
change the fact. Reviewing against a red gate was a deliberate choice made
because the red cannot be cleared without a PO signature; that choice is the
dispatcher's and is recorded rather than argued away.
