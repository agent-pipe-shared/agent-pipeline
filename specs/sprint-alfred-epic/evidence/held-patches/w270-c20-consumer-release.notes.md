# w270: a consumer project releases its closed, pushed feature as a version tag after one PO release approval (candidate 20, G20-42, AC-108)

Base: `2de3eecda` (the w269 chain head). Built in the slice clone `scratch/agent-out/s-rel`. One held patch; `git apply --check` in the real repository fails until the chain is applied in order.
Closest criterion: AC-108 (PRD and Spec unchanged). Docs touched, named because a pin demands them: `docs/push-release-flow.md` (new section "Releasing a consumer project: a version tag").

STATUS: see "Evidence". No full Verify, no Critic review, no PO acceptance.

## What the patch changes

1. Onboarding (`lib/project-onboarding-v3.mjs`): a create-only `VERSION` target (`0.1.0`) in the plan, like the `.gitignore` seed, so it rides the existing sanctioned onboarding commit route. An already-onboarded project
   gets it from the release preparation's named repair: `release-preflight-cli.mjs --init-version --root <root>` (create-only, refuses the Pipeline's own source checkout), printed in the `RPC-VERSION-MISSING` refusal.
2. Consumer release preflight: the consumer mode of the existing `scripts/release-preflight-cli.mjs`, decided from the project's shape by `isConsumerReleaseProject()` (none of the three Pipeline plugin manifests present), never by a flag.
   `lib/consumer-release.mjs` reports the FIRST missing step, in order, as `code: message; repair: <command>` with exit 2 and no record written: `RPC-CONSUMER-NOT-CLOSED` (State `closedFeatures`), `RPC-CONSUMER-RELEASE-NOTES`,
   `RPC-CONSUMER-EVIDENCE` (push-prepare's OWN report for origin/refs/heads/main: working tree clean, Verify, the Critic-bound Verify N24 carry, security evidence, threat model), `RPC-CONSUMER-SECURITY` (a critical calibration without a
   configured security gate, G20-25 wording), `RPC-CONSUMER-PUSH-APPROVAL` (the recorded push approval verified for this candidate in chat or signature mode, the guard's own verifiers), `RPC-CONSUMER-NOT-PUSHED` (HEAD reachable from
   `refs/remotes/origin/main`, ADR-0078 D5), `RPC-CONSUMER-TAG-EXISTS`. Defaults for a consumer: `--preflight-id consumer-release`, `--out evidence/release-preflight.json`, a fixed retention digest label; the record is the Pipeline's
   own `pipeline.release-preflight.v1`, with a single version surface (`VERSION`) and its documents read from the registered feature package manifest (`feature.id`, artifact classes prd/spec/acceptance/result).
3. Release notes: `RELEASE-NOTES.md` must hold a committed `## v<VERSION>` entry naming the closed feature id (the agent writes it WITH the feature, so the Critic reviews it and the Critic-bound push Verify carries it; a notes commit after
   the review is a content change the carry refuses, see the close-feature skill). The preflight refuses naming this when it is missing.
4. Release approval: the existing `release-preflight` critical kind, in the configured mode. Chat: the run itself records the approval. Signature: the command stops at `RPC-CONSUMER-PO-APPROVAL` and prints the PO's exact
   `authorize-critical --kind release-preflight` command for exactly the subject digest, then runs again with `--proof-request/--proof`. A `ready` record stores a private approval (`kind release-preflight`, the same store as the push
   approval, `lib/critical-action-authorization.mjs`) bound to the tag, version and exact commit; a proof is consumed there, so it cannot be replayed. NO new approval verb, so the inventory/catalog are unchanged.
5. Tag push: `hooks/guard-push.mjs` admits exactly one release-tag push for a consumer project when `authorizeRecordedReleaseTag` accepts it (annotated tag, `v<approval.version>`, peeled to the approved commit; a signature-mode project also
   needs the consumed proof), and otherwise refuses an ANNOTATED release tag naming the release command. A lightweight release tag is not judged here: it falls through to the full gate (Verify evidence and a push approval bound to the tag
   destination), unchanged, because the protected `hooks/guard-push.test.mjs` pins that gate for tags (PGD*, PG-N27-TAG-06/07). Release-tag ancestry (ADR-0078 D5) still runs first. The Pipeline's own source checkout keeps its full gate (case G20-42a); the
   annotated consumer case is G20-42b in `hooks/guard-push-release-tag-ancestry.test.mjs`. The new function lives in
   the kernel file the guard already imports. The onboarding plan imports `lib/consumer-release.mjs`, so the Elephant added it to
   `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`) and to `docs/guard-maintenance-window-threat-model.md` (GMWKC01 and GMWKC03 green).
6. Docs: `docs/push-release-flow.md`, `skills/pipeline-start/references/happy-path.md` (step 6), `skills/close-feature/SKILL.md`.
7. Walk (`scripts/close-path-e2e.test.mjs`, step 5 onward and the fixture setup): VERSION and the notes entry in the fixture, a local bare repository as origin (the approved push really happens), the pinned `RPC-INPUT: VERSION` refusal replaced by the
   consumer release walked to the pushed annotated tag on all three runner identities in CHAT mode, negative cases (no push approval, not pushed, tag without release approval, another tag). A signature-mode walk was attempted and
   failed in its setup (`approve-plan: DAB-APPROVAL-PROOF-INVALID` with the test signing fixtures); the Elephant reverted only that walk edit, no product code. New cases in `hooks/guard-push-release-tag-ancestry.test.mjs` (no existing case changed): G20-42b (annotated consumer tag, named refusal) and G20-42a (source shape keeps the general gate). Restated in place: the three exact path lists in `lib/project-onboarding-v3.test.mjs` gain `VERSION` (the new create-only target). A comment in `lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` records the release approval as per-release; the pin itself is unchanged because no pipeline-state verb was added.

## Not changed

`lib/path-spelling.mjs`, the separator-sweep sites, `harness/verify-suites.json`, the Pipeline's own source release behaviour (`release-preflight-cli.test.mjs` green unchanged), the sibling slice's Critic-finalize step in the walk, the push approval
route itself, the non-release tag rules.

## Evidence (Elephant, slice clone, one suite at a time, private TMPDIR)

`scripts/close-path-e2e.test.mjs` green (chat mode, three runner identities); `hooks/guard-push.test.mjs` green (the annotated-only
consumer tag block fixed the seven reds PGD23, PGD02, PGD04, PGD18b, PG-CHECKPOINT, PG-N27-TAG-06/07 an earlier draft caused);
`hooks/guard-push-release-tag-ancestry.test.mjs` with the happy-path pin 28/28 (1 skipped, pre-existing);
`lib/project-onboarding-v3.test.mjs` green; `scripts/release-preflight.test.mjs` and `release-preflight-cli.test.mjs` green;
`guard-maintenance-window-kernel-closure.test.mjs`, `guard-maintenance-window.test.mjs` and
`harness/scripts/check-auth-gate-inventory-drift.test.mjs` green.

## Not proven

- Signature mode of the release approval (and of the push approval in this walk): rendered and reached by code, not walked.
- A real consumer run on any runner: the walk uses fixtures and a local bare origin.
- No full Verify, no Critic review, no PO acceptance.
