# Release 0.5.3 readiness

> Agent-Pipeline · Sprint Nova · as of 2026-08-07

A decision aid for the PO, not a status report. For every item it states whether
the candidate is ready and on what evidence. Everything here is read from
`docs/state.md`'s 2026-08-07 sections, ADR-0056/0058/0059, the gate evidence
files, and direct invocation — nothing is asserted from memory.

All three version carriers now read a bare `0.5.3`: `VERSION`, Codex's
`.codex-plugin/plugin.json`, and Claude's `.claude-plugin/plugin.json`.
`codex-pretool-guard.test.mjs` compares BASE versions, splitting at `+`, so it
accepted both the cachebustered and the stripped form — and that check is what
caught the Codex manifest being left behind on a first bump attempt.

**The cachebuster was carried through review and stripped for the tag**, which
is the practice this repository adopted rather than an exception to it. The cost
it buys against only bites after the fact: a cachebuster-free version cannot be
re-materialized locally under the same number, so a defect found in review would
have forced `0.5.4` instead of a corrected `0.5.3`. That mattered — the second
Critic round found four majors and the candidate was rebuilt three times under
`0.5.3`. Stripping happens at the tag because a released version must be
reproducible, and a build-metadata suffix naming a commit that is not the tagged
commit is not.

**Why 0.5.3 and not 0.6.0, although this candidate adds a capability.** In this
repository the minor position tracks sprints, not feature counts: a `0.X` bump
is reserved for the completion of a whole sprint. Sprint Nova is not finished,
so its increments land in the patch position regardless of what they contain —
and this one does contain something new, ADR-0059 Decision 1's signed admission
path for the Human Guard Override, which did not exist in 0.5.2. Read the patch
number here as "third increment within Nova", not as "nothing new shipped".

## Scope: what this candidate repairs

The PO's framing was a repair candidate for the GMW/HGO module and onboarding.
Both halves are present.

**Human authorization is now uniformly liftable.** Before this candidate, a
guard that blocked an agent either had a lift route or it did not, with no
governing principle — and several load-bearing ones did not. Now:

| Denial | Before | Now |
| --- | --- | --- |
| `GS-1..GS-5`, `GS-7` (gate-strength paths) | no in-session lift at all | HGO, signature or chat per committed mode (`503fe0d`) |
| `GS-6` (live plugin root) | GMW only | unchanged, deliberately (ADR-0058) |
| `TP-*` (protected test paths) | GMW only | GMW **and** HGO (`f650164`) |
| `GUARD-PARSE-UNSUPPORTED` / `-OPERATOR-` / `-REDIRECT-` | no lift at all | HGO, exact-command-bound (`bae3c1a`, scoped by `a52ff69`) |
| `GUARD-CROSS-REPO-MUTATION` | no lift | unchanged, deliberately (ADR-0059 Decision 5) |
| `GUARD-LIFECYCLE-NOT-READY` | no lift | unchanged, deliberately (ADR-0059 Decision 5) |

**Every signature is now preceded by an explicit confirmation.** `approve`,
`approve-critical` and `sign-intent` print what is being authorized and require
the literal token `approve` before OpenSSL is invoked (`5efb0f1`, `584a598`).
Previously the passphrase prompt was the only act of consent, and a passphrase
attests who you are, not what you agreed to.

**Onboarding no longer offers a Codex launcher to a non-Codex session.**
`restartAction()` receives the runner identity its caller already holds
(`5efb0f1`).

**`sign-intent` exists at all** (`2365a8c`) — before it, GMW's `guard-lift`
intent kind had no signing path, which made the documented flow unexecutable.

## Ready, with evidence

**Verify: 255/255 registered suites, 255 terminal receipts, on candidate
`a52ff69`.** `evidence/verify-latest.json`. `security-scan` exit 0.

**Targeted suites, re-run independently by the orchestrator rather than
accepted from dispatch self-reports:** `guard-lifecycle-ready.test.mjs` 38/38,
`human-guard-override.test.mjs` 23/23, `po-human-approval.test.mjs` 5/5,
`threat-model-approval-request.test.mjs` 36/36,
`project-onboarding-v3.test.mjs` 91/91, `check-backlog-state.mjs` valid,
`check-doc-contracts.mjs` 447 files / 719 links valid.

## The three blockers are closed — and closing them found four more

All three items below were the reason this candidate was called repair-ready
rather than release-ready. Each is now closed, and the closing is what turned
up the defects in the section after this one. That sequence is the point: the
blockers were not paperwork.

**1. Verify now reaches exit 0**, 255/255 registered suites and 255 terminal
receipts, binding `exact`. `guard-testpath-override-tests` passes 19/19. The
five failing cases were corrected under a signed TP-2/TP-6/TP-7 maintenance
window, and OT13 — which passed for an incidental reason while claiming to pin
a removed invariant — was rebuilt to assert `{status: "replan", code:
"HGO-DRIFT"}` by name, with a byte-identical twin fixture proving it tracks
drift rather than never admitting anything.

**2. `503fe0d` now has coverage.** `guard-gate-strength.test.mjs` runs 30/30,
including GST27 (a real, validly-armed, exactly-matching capability still does
not lift GS-6) and GST28 (a static pin that the consume call sits inside the
exclusion). Its evidence is execution now, not review.

**3. Two independent Critic rounds have run.** The first was dispatched on the
wrong tier — the shipped agent definition pins the review tier, so MP-07's
mandatory escalation for a guardrail diff silently did not happen, and only the
Critic's own report-header duty caught it. The re-run on the mandated tier
returned four majors the first round did not have, two of them inside the
security mechanism under review. The tier difference was not academic.

## What the second Critic round found, and what was done

Recorded here because a release note that lists only what was built, and not
what was nearly shipped broken, is the wrong shape for a decision aid.

**A caller could supply the trust anchor.** `--authority` let the signing CLI
verify against a key the caller had just generated, while ADR-0059 Decision 1
claims the subcommand "cannot succeed without a genuine signature it is
structurally incapable of producing". The red run armed a real capability from
a self-signed proof. The flag is removed, not constrained: a flag whose only
admissible value is the default carries no capability while keeping a
caller-supplied-anchor path alive.

**The outside-the-repository check was inert on Windows.** A hard-coded POSIX
separator meant only exact equality with the root was ever caught, so an
in-repository path passed as external. Composed with the above: an
agent-writable JSON file in the repo as trust anchor. Now compared through
platform-flavoured `relative()`, which also folds case on win32.

**The signature route dead-ended at its last step.** Every guard printed
`authorize-by-signature` as the decisive next command for `signature` mode —
this repository's committed mode — and the admission list matched only
`authorize` by strict equality, so the same guard refused what it had just
told the operator to run.

**A denial could fall silent.** Route planning has three outcomes; three guards
rendered one and swallowed the rest behind a bare `catch` that declared the
silence intentional. A denial that *could not* be routed printed identically to
one that was never eligible — the single outcome ADR-0059 Decision 4 does not
admit.

Two lesser findings closed alongside: the Codex adapter's Decision-4
continuation had no test at all while the other three guards had one, and a
docstring still claimed a guarantee that `503fe0d` had ended.

## Historical: the three blockers as they stood before the window

**1. Verify does not reach exit 0.** One suite fails:
`guard-testpath-override-tests`, five cases. All five share one cause — the
file pins the pre-Decision-3 assertion `no in-session override is admitted`,
which Decision 3 deliberately replaced. The guard is behaving correctly and the
test describes the old contract. It cannot be corrected in-session because the
file is itself a protected test path (TP-7).

**2. `503fe0d` shipped with no test coverage whatsoever.** The GS-1..5/7 lift
is the most security-sensitive change in this candidate, and its suite
(`guard-gate-strength.test.mjs`) is TP-6-protected, so the implementing
dispatch could not extend it. Its evidence today is review, not execution.
This is the single strongest argument against treating this candidate as
release-ready rather than repair-ready.

**3. No independent Critic round has run on this candidate.** ADR-0059's
implementation is guardrail-tier and the matrix makes a T1 review mandatory.
The prepared dispatch is ready but has no green candidate to review yet.

Items 1 and 2 are unblocked by one PO signature; item 3 follows them.

*(All three were subsequently closed — see the section above. The steps below
are kept as the executed record of how, because the flow they describe is
itself the subject of an open backlog finding.)*

## What the PO did, in order

**Step 1 — sign the maintenance window. This is the only command that is
yours.** `--repo-root` must be ABSOLUTE (`po-human-approval.mjs:87` requires
it and the usage string does not say so), and `--directory` must be the
external directory holding the key this repository actually pins — compare
`trust-policy.json`'s `publicKeySha256` against `trustAnchor.publicKeySha256`
in `project/critical-human-proof.json` if more than one directory exists,
because a `keyReference` of `local-po-key` does not discriminate between them.

```sh
node plugins/pipeline-core/scripts/po-human-approval.mjs sign-intent \
  --repo-root /absolute/path/to/checkout --directory "$PO_DIR" \
  --intent-sha256 "$INTENT_SHA256"
```

The digest is in `evidence/gmw-request.json` under `intent.sha256`; the
confirmation prompt names it back to you before the passphrase — compare the
two, and cancel if they differ.

**Step 2 is NOT yours.** `guard-maintenance-window.mjs install` reads no
private key; it verifies a signature and places a file, and its own source
documents it as `Agent-safe: verify-and-place only`
(`lib/guard-maintenance-window.mjs:382`). Tell the agent you have signed and
it runs the install. An earlier version of this document asked the PO to run
it, which was an orchestration error on the agent's part, not a requirement.

The request binds a candidate commit and opening tree, so it is invalidated by
any further commit; it is re-prepared as the last act before each handover.
The installed window, by contrast, is not tree-bound at use time — ordinary
commits during the window do not close it.

**Step 2 — the three test files get written, Verify re-runs, the Critic round
runs.** Agent work, no further human step.

**Step 3 — refresh the local build.** Operator-only by construction: an agent
session may not write into the plugin root enforcing its own guards, and
`guard-lifecycle-ready.mjs` refuses `GUARD-CROSS-REPO-MUTATION` for exactly
that reason.

```sh
cp -a <checkout-root>/plugins/pipeline-core <local-marketplace-root>/plugins/
claude plugin update pipeline-core@agent-pipeline-local --scope user
```

For a directory-sourced local marketplace, `/reload-plugins` suffices for guard
scripts (re-read per invocation); a change to `hooks.json` wiring needs a new
session. This candidate does not change `hooks.json`.

**Readback before trusting it:** `pipeline-start-preflight.mjs` must return
`status: "ready"` with `version` equal to `installedVersion` and
`installedSource: "local-development"`. A `plugin-refresh-required` there means
manifest and registry disagree. Done and confirmed for this candidate at
`0.5.3+claude.20260807221336.14e7b97` — note that the *installed* build carried
the cachebuster, which the tagged release does not; the reinstall was for
enforcement, the strip is for reproducibility, and they are different jobs.

## Release state: prepared to the push gate

Everything the agent can do is done. What remains is the gate itself.

- Candidate: `refs/heads/feat/sprint-nova-codex-v046`, pushed to `origin` and
  read back with `ls-remote`.
- Verify: exit 0, binding `exact`, 255/255. `security-scan`: exit 0.
- Version: bare `0.5.3` across `VERSION` and both plugin manifests.
- Both Critic rounds closed; every major finding fixed and re-verified.

The remaining path, per [`push-release-flow.md`](push-release-flow.md):

1. **Merge or push to `main`** — needs a fresh `push`-kind signature bound to
   the `main` destination, plus the `GG-03` double-confirmation override. Note
   that branch and `main` proofs cannot be prepared in parallel: both land on
   `proof-critical-push.json`, so a second request overwrites the first.
2. **`gh release create v0.5.3 --target <sha>`** — agent-executable, and not a
   push at all: it calls the GitHub API directly, so no push guard intercepts
   it. `git push origin <tag>` would be refused no matter how it is signed,
   because `approve-push`'s destination regex only matches `refs/heads/*`.

Neither step is started. Both are the PO's call.

## Known weaknesses, stated rather than smoothed

**The confirmation prompt is English-only.** It does not follow
`runtime.humanFacingLanguage`, which the PO's request named explicitly. Tracked
as [`pipeline.human-authorization-prompts-ignore-the-configured-language-profile`](../backlog/items/2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md).

**An absent `--runner` still resolves silently to Codex.** Two bounded tasks
have now reverted the same correction for the same reason; it needs a decision,
not a third attempt. Tracked as
[`pipeline.absent-runner-flag-silently-defaults-to-codex`](../backlog/items/2026-08-07-absent-runner-flag-silently-defaults-to-codex.md).

**One commit's `Dispatch:` trailer is not complete provenance.** `5efb0f1`
carries production changes from two dispatches because concurrent dispatches
share one checkout index. Disclosed by the dispatch itself, recorded rather
than rewritten. Tracked as
[`pipeline.parallel-goldfish-dispatches-race-on-shared-checkout`](../backlog/items/2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md).

**The session scratchpad is unusable under the guard.** The harness assigns a
directory outside the repository; `GUARD-CROSS-REPO-MUTATION` forbids writing
there and is deliberately outside HGO's authority. Not a defect in that
decision, but an unrecorded contradiction between the harness contract and the
guard. Not yet tracked.

**A grammar denial outside the repository root offered no override route.**
Observed once in this session on an `rg`-to-`head` diagnostic against a path
outside the root: the denial appeared without the new next-step block. Not yet
diagnosed; belongs in the Critic round's input for `bae3c1a`/`a52ff69`.

## Explicitly not in this candidate

- No push, no tag, no publication. `gates.push_approval` is `signature` and no
  push approval has been requested.
- No change to `hooks.json` wiring, so no session restart is required for guard
  scripts.
- No Claude-native restart launcher — the onboarding fix stops the wrong
  launcher being offered; it does not provide a right one.
- No change to GS-6 or to the cross-repository boundary.
