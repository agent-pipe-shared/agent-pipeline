# w266: the audit route closes the feature, the closed candidate passes the push gate, the release preflight is measured (candidate 20, G20-35 last part, AC-108)

Base: `e686c0e46` (the w265 chain head, including the Critic-export carry fix). Built in the slice clone `scratch/agent-out/s-push2`.
One held patch (it applies on top of the w265 patch; `git apply --check` in the real repository fails until the chain is applied in order).
Closest criterion: AC-108 (PRD and Spec unchanged).

STATUS: the walk `plugins/pipeline-core/scripts/close-path-e2e.test.mjs` is GREEN end to end on all three runner identities (claude, codex,
antigravity): sanctioned feature course, Critic round, audit route, close to `closed-local`, Critic-bound push Verify, push-prepare `ready`,
push guard decision, release preflight measured. The `G2035_STOP_AT_AUDIT` switch and the debugging classifier call are removed.
One product break is fixed (finding 2); two findings are reported and NOT changed (findings 1 and 3). No full Verify, no Critic review, no PO acceptance.

## What the patch changes

1. Walk, package side of the audit route: `register-feature-package.mjs --add-verify-evidence`, `feature-package-plan`/`-apply` to `verifying`, then
   `completed` for exactly HEAD (no further reconcile signature was needed), the audit request (`pipeline.feature-close-audit-request.v1`, packs
   `pipeline-core-baseline`, lifecycle id read from the private lifecycle directory), `feature-close-prepared --audit-request --critic-verify-lifecycle`.
2. Walk, rest of the close chain to `closed-local` (unchanged w264 steps), then step 5: `git remote add`, the Critic-bound push Verify, `push-prepare.mjs`
   (`ready: true`), `hooks/guard-push.mjs` as a child process: blocked (exit 2) before `approve-push`, admitted (exit 0) after it for `HEAD:refs/heads/main`,
   blocked again for another destination. Step 6: the release preflight refusal pinned (finding 3).
3. Fixture: the push gate is configured from the start (`gates.push: blocking / human / approval: required` in the manifest the PO-gate profile receipt
   binds), and `materialize-push-threat-model` runs before the design commit (see decision D1).
4. Product fix (finding 2): `lib/feature-package-registration.mjs` `addVerifyEvidence` admits only `specs/<feature>/evidence/**` (was: anything under
   `specs/<feature>/`); the three texts that prescribed the old path are corrected (`skills/close-feature/SKILL.md`, `skills/pipeline-start/references/happy-path.md`,
   the usage text of `scripts/register-feature-package.mjs`). Regression: `scripts/pipeline-state-rebind-mutable.test.mjs`.

## The decisive question, answered with evidence

Is the Critic bound before the close carried across the close's own commits (tracked close effects, State, handover) to the pushed commit? YES, on the
sanctioned path, provided finding 2 is fixed. Measured on all three runners: the release-mode, Critic-bound Verify (`--mode release --critic-packet-id P
--critic-evidence-feature-id e2e --out evidence/verify-latest.json`, push-prepare's own remedy, N24) passes over the range reviewed candidate..HEAD =
diagnostic registration, Critic export with lineage and manifest entry (one commit, w265 fix), Result bind + signed reconcile, final tracked close.
The carry goes through the REGISTERED classifier (`classifyRegisteredEvidenceOnlyCommits`, `criticCloseCommit` admits the final close commit: specs/<feature>/,
audit-bundles/<feature>/, State). The administration-union route (`decideCriticEvidenceCarry`) alone does NOT carry that range (CEC-CONTENT-CHANGED: the
Critic export under `evidence/critic/**` is vetoed there, by design); the two routes do not compose, and nothing needs them to.

## Decisions and refusals, each with its source (written before building on it)

- D1 `PUSH-THREAT-MODEL-MISSING` at `submit-plan` once the push gate is `approval: required`: the refusal's own repair names
  `pipeline-state.mjs materialize-push-threat-model` and the commit rule (same draft commit, before the item binding). The fixture follows it.
- D2 `CLOSE-CRITIC-CALLER-AUTHORED` at `feature-close-prepared`: `close-coordinator.mjs` `assertCriticIndependenceForClose` (lines 329-348), decided from the label
  in the consumed receipt. See finding 1.
- D3 N24 (`push-prepare.mjs` ~212 and its `verify-evidence` remedy text): `--mode push` refuses Critic inputs (`VEP-CRITIC-CARRY-INPUT`); the Critic-bound push
  Verify is `--mode release` with the Critic inputs and a fresh `--out`. The walk follows it. The push route taken is the chat route push-prepare prints for
  `humanApproval: chat-attributed-unattested` (`approve-push` without a proof, then `git push ... HEAD:refs/heads/main`), the fixture's own configuration
  (`pipeline.user.yaml gates.human_approval: chat`). A signature-mode push approval was NOT walked (see Not proven).

## Findings

1. NOT CHANGED, needs a PO/Coordinator decision (reported with options, stop condition 5): on today's product no rigor >= 1 feature close is reachable.
   Since G20-24 (PO 2026-11-07) `originGate` (`scripts/session-critic-finalizer.mjs` 133-141) labels every finalize `caller-authored-fallback` when no Source
   return record exists; no runner issues one (the CLI reader is `unavailableOriginalSourceReader`, line 132). `assertCriticIndependenceForClose` (C19-D2b, PO
   2026-11-03) accepts that label only at rigor 0 and low risk. The refusal's named repair ("run the Critic review as a fresh native session and finalize WITHOUT
   the fallback") is not runnable: finalizing without the flag is exactly what produces the fallback label. Measured: `CLOSE-CRITIC-CALLER-AUTHORED`
   ("found rigor 1 and high risk"), the walk's first refusal after the package side. The walk stands in for the missing producer through the finalizer's own
   dependency (`readOriginalSourceReturnFn`, the way `session-critic-finalizer.test.mjs` does), run in-process under the runner identity's markers; the close
   gate is NOT weakened or bypassed. Options: (a) a runner-side Source return producer (the real fix, large); (b) decide what the close gate accepts at
   rigor >= 1 when no producer exists (a gate decision, PO); (c) accept that rigor >= 1 closes wait for (a). Until then the walk proves everything AFTER
   this gate, not the gate itself.
2. FIXED at its cause (clone commit `f654971ea`): `addVerifyEvidence` registered Verify evidence anywhere under `specs/<feature>/`, and the skill, the happy-path
   reference and the usage text prescribed `specs/<feature>/<name>.json`. Every reader of the registered course (`critic-course-admission.mjs` 163, 179, 695,
   711) requires candidate evidence under `specs/<feature>/evidence/`, so the registration passed and the push-boundary Critic-bound Verify then refused
   `VEP-CVL-CARRY-RANGE` ("Evidence-only Git range cannot be verified") with no repair named, only at push time (the classifier threw
   `CCA-REGISTRATION-SHAPE`, `lib/critic-verify-lifecycle.mjs` 90 swallows it into `range = null`). Now the registration refuses `FPR-VERIFY-PATH` naming
   `specs/<feature>/evidence/<name>.json` and writes nothing. Regression (RED first, then GREEN): `scripts/pipeline-state-rebind-mutable.test.mjs`, new case
   "directly under the package directory, outside evidence/" (a valid passing evidence file there registered as `verify-evidence-added` before the fix). Existing
   fixture paths of that suite were restated in place to `evidence/` with a comment (QG-04: no case weakened, none skipped or deleted).
3. NOT CHANGED, measured: the release preflight is the Pipeline's own publication gate. `release-preflight-cli.mjs` observes `VERSION`, the plugin manifests under
   `plugins/pipeline-core/` and, in a source checkout, the source reader binding; a consumer project has none of them. First refusal on the fixture:
   `RPC-INPUT: VERSION is unavailable (VERSION)`, exit 2, no record written. The walk pins that refusal (the fixture is not given fabricated source surfaces).
   A consumer release route does not exist yet; when it does, that assertion becomes a `ready` record.

## Known PO-list item (unchanged, as instructed)

The registered-package Result bootstrap leaves `reconciliation-pending`; the fixture signs the `feature-package-reconcile` with its own test key (w265 finding 3).
Package `verifying`/`completed` needed no second signature.

## Not changed

`lib/path-spelling.mjs`, the separator-sweep sites, `harness/verify-suites.json` (the walk is already registered), the close gate and the finalizer origin gate
(finding 1), `lib/critic-course-admission.mjs`, `lib/critic-verify-lifecycle.mjs` (its swallowed classifier error is the reason finding 2 surfaced as a code with no
repair; the registration-time refusal removes the cause; making the carry refusal name its cause would be a separate change), the release preflight.
The administration route `decideCriticEvidenceCarry` and the registered classifier were not merged.

## Not proven

Signature-mode push approval (only the chat route was walked); a real remote push or transport; a Source return record issued by a real runner; the release preflight
reaching `ready`; GMWKC01 (no kernel import added; not run); the suites that pin skill or reference text (the SKILL.md, happy-path.md and usage text edits were not
checked against text pins or derived inventories: refresh-derived-files was not run, as instructed); `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`
(its `specs/feature/verify.json` argv only exercises command-catalogue admission, which was not changed; not run); full Verify, Critic review, PO acceptance,
Windows/macOS (the fixture uses the POSIX private-profile write only).

## Evidence (clone, runner-neutral)

- walk alone: `node scratch/agent-out/test-in.mjs scratch/agent-out/s-push2 plugins/pipeline-core/scripts/close-path-e2e.test.mjs` -> tests 1, pass 1, fail 0, exit 0 (final state; also green at each segment checkpoint).
- `plugins/pipeline-core/scripts/pipeline-state-rebind-mutable.test.mjs` -> RED before the fix (1 fail of 9), after: tests 9, pass 9, fail 0.
- `plugins/pipeline-core/scripts/register-feature-package-readback.test.mjs` -> tests 10, pass 10, fail 0.
- `node --test specs/sprint-alfred-epic/evidence/held-patches/w266-c20-audit-close-push.check.test.mjs` -> pass 1.
