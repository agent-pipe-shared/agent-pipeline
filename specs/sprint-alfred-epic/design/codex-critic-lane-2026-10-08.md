# Slice AL: native-Windows Codex Critic lane with typed fallback (contract and test list)

Design note, 2026-10-08. [D] = fact read at the cited line. [C] = choice, recommendation first. No code, test or
backlog file changes here. Authoring outcome is `partial`: three precedent files were located but not read in full (end of section 2).

## 1. Source

- [D] AL (`plans/po-decisions-2026-10-07.md:44`): Codex on native Windows is admitted as a Critic lane, with a typed
  fallback to the fresh Claude session lane "whenever the read-only assurance cannot be evidenced for that dispatch";
  probe slice first, then lane + fallback, full Critic. Questions N1, N2: `plans/po-open-questions-2026-10-07-night.md:17-18`.
- [D] Option text: `plans/triage-6-po-options-2026-10-07.md` section 3 (N1 A/B, :53-55) and section 4 (N2 A/B, :69-72).
- [D] Items (`backlog/items/`): `2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds.md`
  (options :55-60; source-checkout hardening landed in `61177860`, :68-83; Gitless installs fail closed, :85-89; deferred, :91-103) and
  `2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive.md` (collapse :23-35;
  "stays a PO decision" :95-97; deferred :99-110). Its cited line 236 is stale: `runSelectedCriticHost` is now at
  `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs:406`.

## 2. Seams [D]

- No first-class lane identifier exists: `git grep` for `criticLane`/`critic-lane` in `lib` and `scripts` finds only
  fixture ids in `lib/critic-review-lineage.test.mjs:87,375,423` (review lineage, a different concept). Lanes are code
  paths: selected sandbox lane (`runSelectedCriticHost`), native lane (`scripts/codex-critic-host.mjs`), plain fresh Claude session.
- win32 refusal today: `scripts/codex-sandbox-select.mjs:213` requires `platformClass === "linux-wsl2"`. The throw
  (:215) is caught at :1076-1079 and `compatibilityFailure()` (:236-238) yields `policy-drift` (no `failureClass`, not
  `F4-UNSUPPORTED`). Native Windows is therefore persisted as `unavailable` / `policy-drift`. The record vocabulary
  already admits it: `windows-native` (:274; `codex-sandbox-selection.schema.json:28`, also `windows-ntfs`), and path
  assessment already branches on `process.platform === "win32"` (:322-396).
- Fixture seam: `selectCodexSandbox` (:1063) takes injectable `observeHost` (:1069), `runPreflight` (:1083),
  `createCoordinatorScratch` (:1097), `readbackProfile` (:1115) and persistence; default preflight is
  `{ eligibility: "none", terminalCode: "host-error" }`. No runner has to launch.
- Collapse: `preflightFailure()` (:240-243) maps `profile-unavailable`/`network-unavailable` to `host-mode-unavailable`,
  all else to `preflight-failed`; `FAILURE_CLASSES` (:33). The granular code survives in the record:
  `preflight.terminalCode` is validated against `eligible | child-stdio-error | profile-unavailable |
  network-unavailable | host-error` (:286-288).
- Bridge `scripts/sandboxed-readonly-host-bridge.mjs:183` returns `{ status: "unavailable", failureClass, childStarted:
  false, selectionId, assurance }`; :228 `role-dispatch-preflight-rejected`; :236 `host-mode-unavailable`.
- Consumer: selected-host:477 calls the bridge; :489-490 turns unavailable/not-started into
  `unavailableResult("selected-sandbox-required", selected, ...)`, and `unavailableResult` (:391-396) keeps only
  `selectionId`: even the collapsed class is dropped. Other pre-launch codes: `selected-critic-route-invalid`
  (:416,:435), `selected-critic-role-dispatch-rejected` (:409,:441,:486). Child started then failed:
  `selected-critic-transport-failed` (:492-507). Success: `{ code: "reviewed", verdict, receipt, execution,
  sandboxBinding }` (:514-527), `sandboxBinding` = selection, execution-receipt and duty-receipt digests plus `assurance`.
- Critic receipt `pipeline.critic-receipt.v1` is built at selected-host:176 and :336 (duty digest :347). Ruleset
  bindings are five digests (:158: role, prompt, verdict-schema, child-executable, module-graph). The native sibling
  binds role/prompt/schema digests plus `rulesetCheckoutSha` and `executionSetSha256` (`codex-critic-host.mjs:1466,1733,
  1907,2029`). Neither receipt names the lane used.
- Fallback decision: `scripts/critic-t1-po-override.mjs:61-65,168` admits only `ALLOWED_PRE_VERDICT_CODES` (per the t1
  item: `binary-missing`, `child-stdio-error`, `permission-denial`, `sandbox-setup-error`, `unsupported-profile`). It
  shares one value with the selection vocabulary (`child-stdio-error`), so wiring one to the other admits almost nothing.
- Not read in full (slice 1 must read before the design is final): `scripts/codex-design-readiness-host.mjs`,
  `lib/codex-sandbox-compatibility.mjs` (only :98-99 seen: kernelClass/filesystemClass comparison), and
  `selectedCriticInProcessBridge` (selected-host:223-380) where the receipt is assembled.

## 3. Contract [C]

N1, recommend B: carry the lane evidence into the Critic receipt as digests; leave the sandbox execution-receipt schema
untouched. Why: A may force a schema extension of a fixed-key receipt (selected-critic item :50-53); tamper-evidence
already lives in the durable execution receipt and `sandboxBinding` binds it by digest; B can grow into A later, A cannot
shrink. The five ruleset digests already reach the receipt since `61177860`, so B adds only the lane record below.

N2, recommend B: at `runSelectedCriticHost`, read `terminalCode` from the persisted selection via `selected.selectionId`;
leave `preflightFailure()` and `FAILURE_CLASSES` alone. Why: A changes a two-value function that record validation
(:286-306) and `FAILURE_CLASSES` rely on, while the granular code is already persisted under an enum validator. If the
read fails: typed `CLF-SELECTION-UNREADABLE`, still a visible fallback (child never started).

Changes, in slice order:
1. `codex-sandbox-select.mjs` :213 + compatibility policy entry: admit `windows-native`/`windows-ntfs` only for an entry
   backed by probe evidence; otherwise keep `policy-drift` (no default widening).
2. New pure module (suggested `lib/critic-lane-fallback.mjs`): `decideCriticLaneFallback({ selected, selection })` returns
   `{ fallback, code, from, to }` from an exhaustive table; no I/O.
3. `runSelectedCriticHost` (:489-490, pre-launch codes :409/:441/:486): return the typed fallback result instead of
   `selected-sandbox-required`; extend `unavailableResult` (:391) with `failureClass` and `terminalCode`.
4. Critic receipt (:176/:336): add `laneRecord` (not `lane`, to avoid the lineage `lane.laneId`): `{ requested, used,
   platformClass, filesystemClass, assuranceClass, selectionSha256, executionReceiptSha256, fallback }`; `fallback` is
   `null` or `{ code, from, to, selectionId, failureClass, terminalCode }`.

Typed codes (provisional; slice 2 checks the code registry for collisions), pre-start only: `CLF-HOST-UNSUPPORTED`
(`host-unsupported`, `policy-drift`), `CLF-EVIDENCE-STALE` (`evidence-stale`, `profile-drift`), `CLF-PROFILE-UNAVAILABLE`
(`host-mode-unavailable`; terminal `profile-unavailable`/`network-unavailable`), `CLF-PREFLIGHT-FAILED`
(`preflight-failed`; terminal `child-stdio-error`/`host-error`), `CLF-RULESET-UNAVAILABLE` (role-dispatch rejected,
Gitless), `CLF-SELECTION-UNREADABLE`. After the child started: no fallback, result preserved (a second review is verdict shopping).

Never silent: result and Claude-lane receipt both carry `laneRecord.fallback`; the Claude lane's `assuranceClass` is
`fresh-session`, never the sandboxed class; `requested` stays the native lane; the dispatch log and the review header print
`from -> to (code)`. A receipt without `laneRecord` is invalid.

## 4. Test list (fixture-only: runner probe and `invokeCodexCriticAppServer` are injected spies; platform comes from the
injected `observeHost`, not `process.platform`; every case asserts zero real spawns)

Test-only dispatch first (1-8 red by design, 9-12 pin existing behaviour), then fix slices:
1. Windows observation (`windows-native`/`windows-ntfs`), no compatibility entry: `unavailable`/`policy-drift` pinned,
   fallback `CLF-HOST-UNSUPPORTED`. 2. With eligible injected preflight and entry (after slice 1): selected, `windows-native`.
3. Terminal `profile-unavailable`, 4. `network-unavailable`: `CLF-PROFILE-UNAVAILABLE`. 5. `child-stdio-error`:
`CLF-PREFLIGHT-FAILED` (proves the granular code, not the collapsed class, is read). 6. `runPreflight` throws:
`CLF-PREFLIGHT-FAILED`. 7. Scratch creation throws and 8. profile readback mismatch (:1097-1117): eligible preflight yet
unavailable, `CLF-PROFILE-UNAVAILABLE`. 9. Linux-WSL2 selection record byte-identical before/after (regression pin).
10. Child started then transport error: no fallback, `selected-critic-transport-failed` preserved. 11. Gitless pre-launch
rejection: `CLF-RULESET-UNAVAILABLE`, `childStarted: false`. 12. Persisted selection unreadable or id mismatch:
`CLF-SELECTION-UNREADABLE`. 13. Exhaustiveness: every `terminalCode` enum value (:286-288) and every `FAILURE_CLASSES`
entry (:33) maps to one fallback code or an explicit "no fallback"; `ALLOWED_PRE_VERDICT_CODES` asserted unchanged.
14. Visible fallback: `laneRecord.fallback` has from/to/code/selectionId, `assuranceClass` not sandboxed; receipt without
`laneRecord` rejected. 15. Native-lane success: `laneRecord.used` selected lane, `windows-native`, N1-B digests present.
16. Tamper: changed `executionReceiptSha256` or `selectionSha256` fails verification.

Protected paths [D, `templates/prompts/agent-obligations.md` section 2]: no seam file matches TP-1..TP-13; put new tests
beside the seam files. Registering a new test in `harness/verify-suites.json` is TP-13 (a human step: stop and report).
`plugins/pipeline-core/hooks/` (TP-1,2,4,5,6,7,10) is out of scope. The compatibility policy file's location and
protection status are unverified; slice 1 establishes them before editing.

## 5. Open choices for the PO (recommendation first)

1. N1: B (digest into the Critic receipt). Alternative A: mirror the native record.
2. N2: B (read `selection.preflight.terminalCode`). Alternative A: carry the granular code through `preflightFailure()`.
3. Authorization: row AL as the standing authorization for the pre-start codes, no per-dispatch `critic-t1-po-override`
   signature (that override stays for the isolated T1 lane). Alternative: a signed authorization per fallback (t1 item :95-97).
4. Fallback after the child started: never. Alternative: once, visibly recorded.
5. The real read-only probe on native Windows runs once on the PO's machine (no agent launches a runner); its receipt is
   the evidence for slice 1, fixtures cover the rest.
6. Gitless installed packages stay a fallback trigger (`CLF-RULESET-UNAVAILABLE`) until the installer-owned attestation exists.
