# Release 0.5.2 readiness

> Agent-Pipeline · Sprint Nova · as of 2026-08-06 (rewritten for the final candidate)

A decision aid for the PO, not a status report. For every item it states whether
the candidate is ready and on what evidence. Everything here is read from
`docs/state.md`'s two `2026-08-06` sections, the six ADRs this candidate carries,
the gate evidence files, and direct invocation — nothing is asserted from memory.

`VERSION` reads `0.5.2`. Branch `feat/sprint-nova-codex-v046`, 20 commits ahead of
the remote. Not on `main`; no tag exists.

## Ready, with evidence

**Both gates green and candidate-bound.** `evidence/verify-latest.json` and
`evidence/security-latest.json` are bound to the same commit and tree with
`binding: "exact"`, clean at start and finish. Verify: `exitCode: 0`, **242**
registered suites, terminal receipts matching. Security: `exitCode: 0`,
`findings: []`; gitleaks/semgrep/license-check `PASS`, osv-scanner `SKIPPED` ("no
package sources found"). Re-run both against the candidate you are gating — the
figures above are from the last run before this document was written, and any
commit invalidates the binding.

**Three T1 Critic rounds ran across the sprint; all three FAILED first.** That is
stated plainly because it is the point: the reviews caught real defects, twice in
work that had already been reported complete.

- Rounds one and two (overnight block) — FAIL with six findings, then discharge of
  F1/F2/F4 plus two new findings, all fixed.
- Round three (this block, `f1dd7cf..5d5ff93`, Opus/max, GUARDRAIL row) — **FAIL
  with four findings.** F2, F3 and F4 are fixed in the candidate; F1 is a
  lifecycle disclosure, recorded rather than fixed (see "Known weaknesses").

**The authority-tier defect, found and closed.** The tier the resolver prefers
(`project/*`) was a frozen snapshot from migration day — one commit, ever — while
the tier it treats as fallback (`.claude/*`) was the one the V3 compiler and the
maintainers actually updated. Measured, not inferred: `gateConfig(manifest,
"push")` returned `standing-approved`, so commit `fb0e9ac`'s deliberate hardening
to `required` had never taken effect. Four compiler-owned values were stale the
same way, two of them model-routing rows, which made every dispatch reading the
resolved manifest an MP-05/MP-07 violation. Tiers are reconciled, and
`check-authority-tier-agreement` is a registered Verify step so it cannot recur
unnoticed.

**Backlog ledger: 39 findings → 0.** `check-backlog-state.mjs` is now a registered
Verify step. The remedy if it ever goes red is one command
(`reconcile-backlog-ledger.mjs --activate`).

**The verify-registration blocker from the previous revision of this document is
closed.** The PO granted the standing TP lift; the suite is registered and
counted. Registering it surfaced a rule that had been invisible: a registered
suite must also appear in `docs/product-capability-inventory.json`.

**ADR-0052's outstanding condition is met.** Its follow-up asked for a first
confirmed `claude plugin install` against a separate local marketplace root. That
ran successfully on 2026-08-06.

## The smoke test ran, and it found a blocker

A fresh session installed the candidate into an empty directory and followed only
the tool's own printed next actions. Every step returned exit 0 and well-formed
JSON; the guard hook passed; no crash, no stack trace. And the result is wrong.

**A Claude consumer following the tool's own instructions is silently routed onto
the Codex rail.** `inspect --runner claude --intent bootstrap` correctly reports
`runner: "claude"`, but the `nextAction` it prints drops `--runner` and `--intent`,
and the `plan` subcommand accepts `--runner claude` and then discards it:

```
plan --root <dir>                                     → runner: codex | intent: onboarding
plan --root <dir> --runner claude --intent bootstrap  → runner: codex | intent: onboarding
```

`CLAUDECODE=1` was set in both. The chain then writes `pipeline.user.yaml` with
`runners.default: "codex"` and ends at `runtime_missing: "required Codex runtime
targets are absent"` — inside what is nominally a Claude bootstrap.

Root cause is a parsed-then-discarded option plus a literal default:
`planProjectOnboardingLifecycleV4` takes no `runner` at all, and
`v4Inspection(rootDir, fs, intent = "onboarding", runner = "codex")` supplies one.

**Assessment: this blocks the release.** It is the exact failure mode ADR-0051
exists to prevent, on the primary consumer onboarding path, in the release whose
stated purpose is that the hardened Codex work also runs cleanly on Claude. It is
the same class as the F-A finding fixed earlier this sprint — that fix corrected
the ready gate and never reached this path.

**Not fixed in this candidate, deliberately.** There are 24 `v4Inspection` call
sites and most do not thread identity; correcting it is a real change to runner
threading through the whole V4 lifecycle, not a release-commit edit. Doing that
un-reviewed immediately before the gate — in a block the Critic has already
flagged as having no dispatch provenance — would be the worst possible moment.
Tracked as
`backlog/items/2026-08-06-onboarding-lifecycle-plan-hardcodes-the-codex-runner.md`
with a four-part proposed fix.

Two secondary observations from the same run, neither a defect: the CLI is still
named `project-onboarding-v3.mjs` while its schema is `pipeline.project-onboarding.v4`;
and `requiresConfirmation: true` is advisory JSON metadata only — the script
mutates immediately when invoked directly, so the confirmation gate must be
enforced by whatever orchestrates the calls.

## Required release-time step, proven by direct invocation

**Both plugin manifests must read exactly `0.5.2` before a tag.** The release
version plan checks five surfaces — `VERSION`, and each runner's plugin manifest
twice (as manifest and as resolved marketplace entry) — and compares each against
the target version with a strict `!==`. The local-development cachebuster suffix
makes two of them mismatch. Run against the candidate's own bytes:

```
deriveVersionSurfaceConsistency({...}, "0.5.2")
  → refused: RVP-VERSION — private codexPlugin does not equal targetVersion
```

Current surfaces:

| Surface | Value |
| --- | --- |
| `VERSION` | `0.5.2` ✓ |
| `.claude-plugin/plugin.json` | `0.5.2+claude.20260806101646.967bd09` ✗ |
| `.codex-plugin/plugin.json` | `0.5.2+codex.20260803204000` ✗ |

This is not a defect: the `+build` suffix is what makes `claude plugin update`
pick up a new local build at all, so it must stay while the candidate is being
tested. It does mean the released artifact is a *different build string* from the
one smoke-tested, and that stripping both suffixes is a mandatory, separate step
between accepting this candidate and tagging it — followed by a re-run of Verify
and Security on the stripped commit, because that commit is then the real
release candidate.

Note also that the Codex manifest's build metadata is from 2026-08-03 and has not
tracked this sprint's content. That is harmless for the version check above (it
gets stripped either way) but means no Codex-side local install has been
refreshed against this candidate. **The smoke test below covers the Claude runner
only.** A dual-runner release claim would need the Codex side exercised too.

## What the PO must decide

**1. Accept or reject six consumer-facing decisions.** None has PO acceptance yet.
Two of them change behaviour for every project that inherits this manifest:

| ADR | What it changes for consumers |
| --- | --- |
| [0052](adr/0052-marketplace-identity-restoration-and-local-dev-separation.md) | The published marketplace identity — a supply-chain surface per `docs/marketplace-supply-chain-threat-model.md`. |
| [0053](adr/0053-setup-generator-authority-resolved-targets.md) | Which configuration tier `setup.mjs` writes to. Pristine projects seed at the neutral tier — a design judgement the ADR names as such. |
| [0054](adr/0054-arbitheon-authority-directory-and-precedence-chain.md) | **Turns the push gate on.** Design and step 1 only; steps 2–4 are staged and NOT in this candidate. |
| [0055](adr/0055-critical-human-proof-waiver.md) | A new policy schema (`.v2`) with reasoned waivers for `deploy`/`publication`. |
| [0056](adr/0056-push-approval-mode.md) | `gates.push_approval` in `pipeline.user.yaml` — how a human clears the push gate. |
| [0017](adr/0017-push-policy-standing-approval.md) | Marked superseded **for this repository only**; adopters may still choose standing approval. |

**2. Confirm the push-gate posture is what you want shipped.** This repository now
ships `gates.push.approval: required` with `gates.push_approval: signature`. A
consumer inheriting this manifest gets a blocking human push gate demanding an
Ed25519 proof. If that is not the intended default for adopters, it must change
before publication, not after.

**3. Decide the smoke-test outcome.** A fresh-session install into an empty
directory is the last thing between this candidate and a release; its result
belongs in this document before the gate.

**4. Approve the release itself.** Merging to `main` and cutting a tag are
explicitly out of scope of this document and of every session that produced this
candidate. The PO's standing scope limit — feature branch only — has been in force
throughout and was refused three times when challenged. This document prepares the
decision; it does not make it.

## Known weaknesses, stated rather than smoothed

**No dispatch provenance for this block (Critic F1, major, unfixed).** The
afternoon block's 20 commits were Elephant-authored; no production diff came from
a dispatched Goldfish session, and the range includes a guardrail hook, the verify
gate and two new library modules — every one a disqualifier in EL-01's stage-0
exception. The cause is a session-level constraint on invoking subagents, not a
judgement that dispatch was unnecessary. No retroactive dispatch record was
written, because inventing provenance is what the previous round's F6 refused.
This is a real gap in the authorship evidence for a guardrail-class change and the
PO should weigh it as one.

**`chat` mode is attribution, not proof.** ADR-0056's second mode is deliberately
weaker: in `signature` mode the agent is cryptographically incapable of producing
the clearance, in `chat` mode it is not. Shipped as a documented, self-declaring
choice.

**Verify has a non-deterministic suite.** `local-worker-supervisor-cli-tests`
failed once on a clean tree and passed standalone and on re-run. Recorded as a
backlog item rather than swept under the green. A gate that can go red without a
defect trains its readers to re-run instead of investigate.

**A closed backlog item points at a commit that does not exist here.**
`2026-07-20-source-available-commercial-licensing` declares
`closure_repository: "self"` with a commit `git cat-file -t` cannot resolve —
introduced by the very disposition approved to repair unreachable evidence. Not a
gate; the state checker does not verify reachability for already-recorded entries.

**69 of 288 test files are unregistered.** Unregistered-but-green coverage loss,
not hidden breakage; eight were individually proven green. A green Verify is
evidence that the registered suites pass, not that the full corpus does.

**The German reference sections of `operating-model.md` and
`session-bootstrap.md` still name the legacy calibration path.** Every remaining
occurrence sits below the `DE-REFERENCE-BELOW` marker that declares those sections
redundant and non-authoritative; the English above them is corrected.

## Runner and platform scope, clarified 2026-08-06

**The support claim stands: Claude Code and Codex, on Windows, macOS and Unix/WSL.**

An earlier revision of this document read ADR-0051's "support" clause literally and
concluded 0.5.2 was evidenced for one runner on one platform with three accepted gaps.
The PO rejected that reading and [ADR-0057](adr/0057-runner-platform-support-is-an-implementation-obligation.md)
records why: a release is always developed on one machine, and under that reading
verifying one combination and fixing what it finds would leave every *other*
combination unevidenced against the new candidate. A definition under which improving
the product shrinks its claim is not usable.

The obligation ADR-0051 actually carries is on the **implementation** — runner
neutrality by construction with no silent single-runner default, shell portability for
both PowerShell and POSIX, and path/filesystem neutrality. Manual cross-platform
verification is optional, performed independently by the PO, and gates nothing.

For 0.5.2 this means:

| | 0.5.2 |
| --- | --- |
| Support claim | unchanged and unqualified |
| Runner-neutrality defect found this sprint | `RUNNER-THREAD-17`, in flight — must land |
| Manual Codex / macOS / Windows runs | optional, PO-scheduled, not release gates |
| Native-Windows red-suite class | retained as a tracked defect class, unchanged |
| Antigravity | out of scope; landing it supersedes ADR-0051 |

The honest caveat, carried from ADR-0057: the mechanical checks that would make the
implementation obligation self-enforcing mostly **do not exist yet**, so it currently
rests on review. Building them — a literal-runner-default check first — is worth more
than any number of manual matrix runs and is the named follow-up.

Details and the optional evidence log: [`docs/runner-platform-conformance.md`](runner-platform-conformance.md).

## Explicitly deferred to 0.5.3, with reasons

- **ADR-0054 steps 2–4** (`.arbitheon` tier, configurable directory name, writes
  to the top tier, completeness-gated cleanup). Step 1 is a clean boundary and
  nothing depends on step 2 landing. Introducing a third authority tier days
  before a release is the wrong sequencing.
- **PRD approval (`approve-plan`) proof-binding** — still unattributed. ADR-0055
  closed the push half and says so. Changing a second human gate in the same
  release compounds risk without compounding value.
- **The local-plugin-install attestation binding** (backlog N1, due 2026-09-06).
  The attestation's stated scope — this checkout only, not the external
  marketplace root — is the true scope and is documented as such.
