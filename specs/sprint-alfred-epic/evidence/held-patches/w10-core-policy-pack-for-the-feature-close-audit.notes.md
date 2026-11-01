# W10 held patch: the core policy pack for the feature-close audit (D229)

Targeted delivery: green. Batch Critic, Full Verify, native Windows and PO acceptance are pending and not part of this patch.

Patch: `w10-core-policy-pack-for-the-feature-close-audit.patch` (25665 bytes, sha256 260ef4ed6123e759a965a51b3345ad58ca777fb465e38661d98f37638dcfe4f2), a diff on top of candidate `f45ef4529d15e94afb1e4001fa15e3ac53ccd9f3`. `git apply --check` in the plain baseline clone: exit 0. Six files: two production files, two test files, two docs.

## What changed, per production file

1. `plugins/pipeline-core/lib/organization-policy.mjs` (kernel path, listed in the maintenance-window kernel list)
   - New import `canonicalSha256` from `./governance-event.mjs` (already a kernel path; same canonical helper `audit-bundle.mjs` and `feature-close-audit-preflight.mjs` use).
   - New exports appended at the end: `CORE_BASELINE_PACK_ID` (`pipeline-core-baseline`), `CORE_BASELINE_PACK` (deep-frozen) and `resolveNamedOrganizationPolicyPack(id)` (returns the pack, anything else throws `OrganizationPolicyError` code `OPP-PACK-NAME`).
   - The pack: schema `pipeline.organization-policy-pack.v1`, governanceFloors exactly `{ requireHumanDecisionLedger: true, allowExternalAuthority: false }`, `documentClasses: []`, no optional key, compatibility `0.7.0` to `999.999.999`.
   - Window choice: `VERSION` is `/^[0-9]+\.[0-9]+\.[0-9]+$/` (plain x.y.z, no pre-release, no build metadata) and `compare` uses `Number`, so the largest honest upper bound is a very large x.y.z; `999.999.999` stays far away from any real release and inside safe integers. Lower bound `0.7.0` is the first core that ships the pack.
   - Revision: `canonicalSha256` of the pack body without `revision`, computed in code, pinned in the test as `6611e7f34e2b330b096dde3ec9f1662c5226bceb2390c96d856f0cd751bd8ee3` (the literal was computed from the body in a scratch probe BEFORE the production code existed, so the test does not depend on the code it pins).
   - Empty `documentClasses`: valid for `validateOrganizationPolicyPack` (only length > 32 is bounded), resolves to `documentClasses: []` in the effective policy, and the audit bundle plan, README and verification all work with it (the walk builds the real README bundle). The stop condition did not fire.
2. `plugins/pipeline-core/scripts/close-coordinator.mjs` (kernel path), function `auditRequest` only, plus one import
   - After the unchanged exact-shape check, each `packs` element is mapped: a plain object (non-null, non-array) is passed through untouched (same reference); the string `pipeline-core-baseline` is resolved to the shipped object; anything else fails `CLOSE-AUDIT-REQUEST` with a text naming the known id.
   - The function returns `{ ...request, value: { ...request.value, packs } }`; `request.sha256` (digest of the file bytes, which keep the NAME) is unchanged. The closed key set is unchanged.

Docs: `docs/organization-policy-packs.md` (new section "The shipped core baseline pack"), `plugins/pipeline-core/skills/close-feature/SKILL.md` (one sentence in the audit-route paragraph).

## Plan / apply consistency (verified from code and the walk)

`auditRequest` (the only caller is the `plan-transition` branch for `feature-close-prepared`) resolves the name once. `options.packs = request.value.packs` then holds objects; `audit.options` (stored in the plan) holds objects; `requestSha256` is the file-bytes digest in NAME form. The apply path reads `plan.audit.options` (`executeFeatureCloseAudit({ options: plan.audit.options ... })`) and rebuilds the lifecycle readback request with only `criticVerifyLifecycleId`; it never re-reads `packs` from the request file. `finish-feature.mjs` passes the request path through without parsing it. The walk asserts the stored receipt plan (`bundlePlan.effectivePolicy.packs`) lists the pack, and the manifest `effectivePolicySha256` equals the digest of `resolveEffectiveOrganizationPolicy` over the shipped pack.

## Tests (test-first)

Cases were written from D229 and recorded RED before the first production edit (log `red1`): 5 of 5 new cases in `organization-policy.test.mjs`, 4 of 6 new cases in `close-coordinator-audit-lifecycle.test.mjs` (the other two, "full pack object as before" and "no default pack", pin unchanged behaviour and are green on the original code by design). The existing `fixture`/`prepare` helpers gained an optional `packs` parameter (default is the previous full pack object, byte for byte); no existing case was weakened, skipped or deleted.

New cases (counts moved, for the pinned-count owner; nothing edited):
- `lib/organization-policy.test.mjs`: 27 -> 32 (+5): exact pack and validation across the window (0.7.0, 0.7.1, 0.8.0, 1.0.0, 12.34.56, 999.999.999), pinned revision literal and recompute, refusal outside the window (0.6.9, 0.0.1, 1000.0.0, 0.7, 0.7.0-rc1, 0.7.0+build -> `OPP-CORE-VERSION`), resolver refuses unknown ids (`OPP-PACK-NAME`), resolves alone and beside another pack.
- `scripts/close-coordinator-audit-lifecycle.test.mjs`: 8 -> 14 (+6): the walk (named pack: plan, apply, README bundle, effective policy lists the pack, request bytes keep the name, then the State writer closes), name beside a full object, full object unchanged, unknown name and wrong element types (`7`, `null`, nested array, `true`, wrong-case name, empty string, a second unknown name) refused `CLOSE-AUDIT-REQUEST` naming the known id with no bundle built, empty array still `FCA-POLICY-REQUIRED`, request without `packs` still `CLOSE-AUDIT-REQUEST` (exact shape), the pack named twice -> `OPP-RESOLVE-DUPLICATE`.

Revert proof (`driver revert`, the two production files restored to the candidate): the same 5 + 4 cases are red; restored byte-equal: true.

## Green lines (clone `c2`, baseline `base1` run the same files; all exit 0 in both)

| suite | baseline | clone |
|---|---|---|
| lib/organization-policy.test.mjs | 27 pass | 32 pass |
| scripts/close-coordinator-audit-lifecycle.test.mjs | 8 pass | 14 pass |
| lib/feature-close-audit-preflight.test.mjs | 6 pass | 6 pass |
| lib/audit-bundle.test.mjs | 18 pass | 18 pass |
| scripts/audit-bundle.test.mjs | 3 pass | 3 pass |
| harness/scripts/check-doc-contracts.mjs | valid | valid (3277 files, 2279 links) |
| lib/pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs | 12 pass | 12 pass |
| lib/pins/close-feature-names-reconcile-order-and-close-evidence.test.mjs | 5 pass | 5 pass |
| harness/scripts/check-auth-gate-inventory-drift.test.mjs | 35 pass | 35 pass |
| harness/scripts/check-verify-case-completion.test.mjs | 32 pass | 32 pass |
| lib/guard-maintenance-window-kernel-closure.test.mjs | 11 passed | 11 passed |
| scripts/finish-feature.test.mjs | 11 pass | 11 pass |
| scripts/organization-policy.test.mjs | 2 pass | 2 pass |
| lib/external-reference-adapter.test.mjs | 39 pass | 39 pass |

Failing-name set: empty in both, so no pre-existing red had to be separated. `check-verify-case-completion` ran outside Verify ("completion records are not written"), so the pinned per-file case counts were NOT evaluated; the movement above (+5, +6) is what the Verify owner must account for. Kernel closure: the two new import edges (`organization-policy.mjs -> governance-event.mjs`, `close-coordinator.mjs -> organization-policy.mjs`) land on files already in the kernel list; no violation, list not edited.

## Downstream sweep

`CLOSE-AUDIT-REQUEST`: emitted only in `auditRequest` (old shape text unchanged, new element text added); tests are the new lifecycle cases. `FCA-POLICY-REQUIRED`: only `feature-close-audit-preflight.mjs` and its test; unchanged (the empty array still reaches it, pinned by the new negative). `auditRequest` callers: one (`plan-transition`, `feature-close-prepared`). `resolveEffectiveOrganizationPolicy`/`validateOrganizationPolicyPack` consumers (`audit-bundle.mjs`, `organization-policy-activation.mjs`, `external-reference-adapter.mjs`, `scripts/organization-policy.mjs`): behaviour unchanged, their suites green. `docs/audit-and-evidence.md` line "needs an approved organization policy pack" is outside the write scope and now slightly incomplete (the baseline pack can be named); left, listed as follow-up.

## The chain for a consumer whose slices carry only `Dispatch: <slice> (goldfish)` commits

Marker legend: [walk] exercised by the new walk through the real entry point; [seam] replaced in the walk by a hand-built fixture; [code] read from code only, not executed; [gap] not found.

(a) Critic-bound candidate Verify evidence [seam in walk: `verify.json` is hand-built, the lifecycle is recorded by calling `recordCriticVerifyLifecycle` directly, no Full Verify was run].
`node <plugin-root>/scripts/verify-evidence-producer.mjs --root <repo> --mode candidate --critic-packet-id <consumed-critic-packet-id> [--critic-evidence-feature-id <feature-id>] --out specs/<feature-id>/<evidence>.json` (flags at `parseArgs`, `verify-evidence-producer.mjs`). It requires: a CLEAN working tree (`candidateIdentity` = empty `git status --porcelain=v1`; governed admission only when clean; `VEP-DRIFT` if the tree or HEAD changed during the run), a configured consumer Verify command (`VEP-NO-COMMAND`), exactly one of `--critic-packet-id` / `--critic-reverify-receipt-id` (`VEP-CRITIC-REQUIRED`), and a consumed Critic receipt bound to the exact HEAD commit (`readBoundConsumedCriticReceipt`), or with `--critic-evidence-feature-id` an evidence-only carry-forward (`inspectConsumedCriticEvidenceCarryForward`; requires candidate or release mode). It reads the repo's Verify configuration and the private Critic packet receipt under the git common dir; it writes the evidence file at `--out` (`pipeline.verify-evidence.v0`, `exitCode: 0`, `candidate {commit, tree}`, `selection`), after deleting any prior file at `--out` and the default evidence path.

(c) The `criticVerifyLifecycleId` is a by-product of (a), not a separate step [code]: when a Critic packet id is given, the producer itself calls `recordCriticVerifyLifecycle({ repoRoot, featureId, gitCommonDir, criticPacketId, candidate, evidencePath, evidence })` after writing the evidence and returns it as `criticLifecycle` (`receipt.id` is the id; the walk fixture uses `lifecycle.receipt.id`). It reads the consumed Critic receipt (and a PO residual acceptance if one is bound) and the evidence bytes, and writes a private receipt `<git-common-dir>/agent-pipeline/critic-verify-lifecycle/<id>.json` (path as used by the forgery test). I did not read whether the producer CLI prints `criticLifecycle`; the function return carries it.

(b) Binding the evidence into the feature package and reaching state `completed` with candidate == HEAD [seam in walk: `lifecycle.json` is hand-written in the fixture]. Findings from code, each with its evidence:
- Required shape for `completed`: artifacts prd, spec, acceptance, result, candidate-evidence, and `candidate` non-null (`validateFeaturePackage`, `feature-package-topology.mjs`: required-class list and `FTP-CANDIDATE`). The candidate-evidence entry is `{ class: "candidate-evidence", path, sha256, authority: false, mutability: "immutable", retention: "retain" }`. The audit preflight then needs a candidate-evidence artifact that is `pipeline.verify-evidence.v0`, `exitCode 0`, with the manifest's candidate, and that satisfies the candidate boundary.
- `register-feature-package.mjs` (registration at plan approval) writes the manifest with `candidate: null`; its candidate-evidence entry is the delivery-contract envelope, not the Verify evidence (`feature-package-registration.mjs`, manifest build). Its other modes add a review unit, Critic diagnostic evidence, a review lineage or a delta request as candidate-evidence; none registers Verify evidence.
- `pipeline-state.mjs feature-package-plan|apply --root --manifest --next-state <state> --plan-sha256 <sha>` moves state along `implementing -> verifying -> completed`, but the apply postimage is "the current manifest with ONLY `state` replaced" (`computeFeaturePackagePostimage`: `{ ...value, state: plan.to }`).
- `pipeline-state.mjs feature-package-reconcile --root --manifest --plan-sha256 --by --proof-request --proof-authority --proof` only refreshes stale artifact DIGESTS (and lifts the authority of the one Result entry Continuity binds). It needs a PO signature: the PO runs `po-human-approval.mjs authorize-critical --kind feature-package-reconcile` in the PO's own terminal (printed as `signatureCommand` by `continuity-result-bootstrap-plan`/`-apply`); the signed subject binds `{ manifest, planSha256, candidate }` where `candidate` is the CURRENT HEAD (`defaultGitCandidate`), so a new commit invalidates the proof. `<po-name>` is supplied by the PO.
- [gap] I searched for any writer of `manifest.candidate` (`rg` for `candidate` assignments and `...value, (candidate|state)` over `lib/` and `scripts/`, plus the topology/registration/pipeline-state files): the only manifest-state writer is the `state` replacement above, and registration writes `null`. I found NO shipped verb that sets `candidate` or adds the Verify evidence as a candidate-evidence entry. By the code, `implementing -> verifying` through `feature-package-apply` would leave `candidate: null` in a `verifying` manifest, which `validateFeaturePackage` refuses (not executed by me; read from the two functions). Consequence: unless a verb exists that I did not find, a consumer must write `state: "completed"`, `candidate: { commit, tree }` and the candidate-evidence entry into `specs/<feature-id>/lifecycle.json` by hand, with correct digests. This may block the Toolbox consumer independently of the pack fix; it is an OPEN QUESTION for the Coordinator, and I did not check whether a guard blocks a hand edit of that file.

(d) The audit request file (any repo-relative JSON path, e.g. `evidence/audit-request.json`):
`{"schema":"pipeline.feature-close-audit-request.v1","manifestPath":"specs/<feature-id>/lifecycle.json","coreVersion":"0.7.0","packs":["pipeline-core-baseline"],"criticVerifyLifecycleId":"<id from (c)>"}`. Exactly those five keys. `coreVersion` must be plain x.y.z: the stamped build string (with `+claude...`) fails the version pattern (`resolveEffectiveOrganizationPolicy` -> `OPP-RESOLVE-INPUT`, from the code at the `VERSION.test` check, not walked) and a core outside 0.7.0 to 999.999.999 fails `OPP-CORE-VERSION`.

(e) Coordinator steps [walk, same argv as the fixture's `prepare`]:
1. `close-coordinator.mjs plan-start --root <repo> --lifecycle <id> --actor <name> --close-intent durable-stop`, apply the returned `nextAction`.
2. `close-coordinator.mjs plan-transition --root <repo> --lifecycle <id> --actor <name> --phase checkpointed`, apply.
3. `close-coordinator.mjs plan-transition --root <repo> --lifecycle <id> --actor <name> --phase feature-close-prepared --architecture-impact <value> --continuity-close-request <close-request.json> --audit-request <audit-request.json> --critic-verify-lifecycle <id>` (the flag value must equal the request's `criticVerifyLifecycleId`, else `CLOSE-CRITIC-VERIFY-ARGS`). Reads: State, the close request, the audit request, the manifest, the evidence, the private Critic/Verify receipt. Writes nothing in the tree (plan). Apply the returned `nextAction` (confirmed apply): this builds `audit-bundles/<feature-id>/<candidate-commit>/` (README.md, manifest.json, artifacts) and writes the private audit receipt under the git common dir. The returned apply output carries the State-writer `nextAction`.
4. Run that State-writer action exactly as returned: `pipeline-state.mjs close-feature --by <name> --architecture-impact <value> --coordinator-lifecycle <id> --coordinator-sha256 <sha> --continuity-close-request <file> --critic-verify-lifecycle <id>`. The walk ran it with no signature and it printed `Feature "audit-feature" closed`; whether a real project's gates add a human step to `close-feature` was not checked.
Or in one go: `finish-feature.mjs --root <repo> --by <name> --architecture-impact <value> --audit-request <path> --critic-verify-lifecycle <id> [--continuity-close-request <path>]` [walk, existing case].

(f) Commit order [code + walk]. The preflight requires `manifest.candidate` to equal the CURRENT `HEAD` commit and `HEAD^{tree}`, else `FCA-CANDIDATE-CHANGED` (`planFeatureCloseAudit`; it does not require a clean tree). The Verify producer, in contrast, requires a clean tree. So:
- BEFORE the plan, the only commit is the candidate itself (the last work/registration commit; HEAD at Verify time). The Critic review must already be consumed for that same commit.
- UNCOMMITTED at plan time: the Verify evidence file written by (a), the manifest edit (candidate, state, evidence entry), the audit request. The walk fixture does exactly this: it commits the work, then writes `verify.json`, `lifecycle.json` and `audit-request.json` and plans successfully. `audit-bundles/` is created by the apply and also stays uncommitted. Committing any of them before the plan moves HEAD and makes the manifest's candidate stale (`FCA-CANDIDATE-CHANGED`; the late-drift walk case pins it for the apply step too).
- AFTER `feature-close-prepared` and the State writer: per the close-feature skill Step 3, finish Result/backlog/handover/HISTORY/telemetry/retrospective, bind them with `tracked-close-finalized`, and make ONE final commit that contains the manifest, evidence, audit request, `audit-bundles/` output and the tracked close files; only after that commit does the coordinator accept `candidate-frozen`. This last part is from the skill text, not walked.

## Deviations and decisions to confirm

- A non-object, non-string `packs` element (for example `7`, `null`, a nested array) was previously refused later as `OPP-SHAPE` (via the preflight); it is now refused earlier as `CLOSE-AUDIT-REQUEST`, as the briefing specifies. A plain malformed OBJECT element is untouched and still reaches the preflight.
- The `FCA-POLICY-REQUIRED` remedy text still reads "do not invent a policy" without naming the baseline pack. Changing it needs a preflight test edit; left unchanged (suggest a follow-up so a consumer sees the route in the refusal).

## Deliberately not changed

`audit-bundle.mjs`, `feature-close-audit-preflight.mjs`, `feature-close-audit-preflight.test.mjs` (in scope, untouched, green), the kernel list, pinned counts, `docs/audit-and-evidence.md`.

## Unverified

Native Windows; a real signature (reconcile or close ceremony); a real Full Verify and a real Critic packet (seams above); a real consumer repository; whether any guard blocks hand-editing the package manifest; the missing verb in (b).
