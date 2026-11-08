# w276: a documentation-only module can be dispatched to a Goldfish and its delivery is checked (candidate 20d, G20-65, AC-108)

Base: `9443438b0` (the applied and stamped candidate 20c). Built in the slice clone `scratch/agent-out/c20d-dm`. One held patch; it applies to the real repository on that base.
Closest criterion: AC-108 (PRD and Spec unchanged).

STATUS: implementation complete in the clone and saved as the held patch; targeted delivery see "Evidence" below. No full Verify, no Critic review, no PO acceptance (Coordinator owns those).

## What was measured

Claude greenfield `TabletApp_claude_070_3` (2026-11-08): the design's module `user-guide` owns only `app/ANLEITUNG.txt` and `docs/manual-checklist.md`; its test `tests/user-guide.test.mjs` was assigned to module `shell`.
`dispatch-briefing.mjs probe` refused the package with check `app/ANLEITUNG.txt` as `DBG-CHECK-NOT-TEST` (plus `NGHR-ITEM-DELIVERY-SHAPE`) and with check `tests/user-guide.test.mjs` as `DBG-MODULE-SCOPE-CROSSES`. No executable route existed, so the Elephant wrote both documents itself.

## What the patch changes

1. The closed set of document kinds is the one the design validator already used for `kind: "documentation"` modules, now exported from one place (`lib/architecture-design.mjs`): an owned path is a document when it is a `docs/` path or a file ending `.md`, `.mdx`, `.txt`, `.rst` or `.adoc`.
   A module is DOCUMENTATION-ONLY when every owned path is a document (judged by the paths, not by the declared `kind`). A glob that is not under `docs/` and has no document suffix (`app/**`) is not provably a document, so it makes the module a code module.
2. New check form `document:<owned path>` (package `check`, `--check`). The item-delivery check becomes a third exact shape `{ id, path, document, dependencies }` with `document === path`, a document suffix and the path among the dependencies (= the write scope). The `.test` and `command:` shapes are untouched.
   - `lib/native-goldfish-host-return.mjs`: shape validation (`validCheckForm`), exports `DOCUMENT_CHECK_PREFIX` and `DOCUMENT_CHECK_FILE`.
   - `scripts/dispatch-briefing.mjs` + `lib/dispatch-briefing-build.mjs`: the generator strips the prefix, adds the document to the write scope, builds the third shape. `document:` is refused unless the package names a documentation-only module (`DBG-CHECK-DOCUMENT-MODULE`: a code module, or no module reference at all) and the document is a document file (`DBG-CHECK-DOCUMENT-KIND`).
   - `lib/module-dispatch-scope.mjs`: the module cut judges the form with the module in hand: `DBG-CHECK-DOCUMENT-MODULE` for a code module, `DBG-CHECK-DOCUMENT-NOT-OWNED` for a document outside the module's owned paths (the repair lists the documents the module owns). Both refusals carry a runnable repair.
3. Host finalize (`executeGovernedItemDeliveryChecks`, `lib/native-goldfish-host-state.mjs`) verifies a document check deterministically from the COMMITTED bytes, never from the Goldfish's report, before the usual source snapshot: the path is a regular file in the delivery commit (`document-check-missing`), its blob is non-empty (`document-check-empty`),
   and, at first delivery (the base commit is given), the delivery changed it (`document-check-unchanged`: it is in `git diff --name-only <base> <delivery>`). The result row has `document` and a passing status without running any process. The refusal now also carries its `repair` text.
4. Design time: `inspectArchitectureDesignDraft` (the check `submit-plan` runs before any signature, next to the scope-coverage rule) reports `ARCHITECTURE-DESIGN-MODULE-NO-CHECK` for a module that owns no admissible check, with the field `modules[<n>].verificationEntryPoints`, the module's test that another module owns, and the three moves
   (move the test under a path the module owns or out of the other module's ownedPaths; register a `verifyImpact` command; make the module documentation-only). Admissible = documentation-only, OR a registered `verifyImpact` command exists in the calibration (any module may name `command:<id>`),
   OR an owned directory pattern (the module can hold its own test), OR a `.test` file among its entry points/owned paths that no OTHER module owns (a test no module owns is not a crossing, exactly as at dispatch time).
5. The repairs of `DBG-CHECK-NOT-TEST` and `DBG-MODULE-SCOPE-CROSSES` name `document:<path>` when the module is documentation-only (and only then; a code module keeps the old text).
6. `skills/pipeline-start/references/happy-path.md`: one sentence states the rule.
7. Tests, added to existing registered suites (no new file): `scripts/dispatch-briefing.test.mjs` (4 cases), `lib/native-goldfish-host-state.test.mjs` (NGHS69, NGHS70), `lib/architecture-design.test.mjs` (3 cases: the 2 design-time cases and the equality pin of the two copies of the document suffix set). No existing assertion was changed or removed.
8. `dispatch-briefing.mjs --help` documents `--check document:<owned path>`.

## Evidence (clone, one suite at a time; `node scratch/agent-out/test-in.mjs <clone> <suite> --private-tmp`, exit 0 each)

RED before the first production edit (previous run): dispatch-briefing 165/169 (the 4 new cases red), architecture-design 23/25 (the 2 new cases red), native-goldfish-host-state NGHS69/NGHS70 red.
GREEN on the final clone commit: dispatch-briefing 169/169; architecture-design 26/26; module-slice-proposal 13/13; design-authoring 5/5; design-approval-route 50/50; native-goldfish-host-state 81/81; guard-maintenance-window-kernel-closure 1/1 (GMWKC01, no new kernel import needed a threat-model entry); harness check-auth-gate-inventory-drift 35/35; pins happy-path-guide-names-only-existing-scripts 4/4, three-runner-happy-path-with-two-po-approvals 27 pass + 1 skipped (pre-existing skip), greenfield-machine-output-and-skill-budget 15/15; submit-plan drivers design-approval-route.e2e 18/18, project-onboarding-e2e 6 pass + 1 skipped, plugin pipeline-state 1/1, harness pipeline-state 1/1.
There is no separate module-dispatch-scope suite; `module-dispatch-scope.mjs` is exercised through dispatch-briefing.test.mjs.
Inventory: new case ids NGHS69, NGHS70 and +4 dispatch-briefing / +3 architecture-design cases need the Coordinator's rebaseline.

Restated in place after implementation (QG-04, one case written in the RED step): in the dispatch-briefing case "the DBG-CHECK-NOT-TEST and DBG-MODULE-SCOPE-CROSSES repairs name the document form", the probe assertion first picked the first `binding` finding, which is the consequence `DBG-BINDING-INVALID` (item delivery shape, listed before its cause, repair identical to its message); it now looks the finding up by its code `DBG-CHECK-NOT-TEST`. The asserted outcome (the repair of the cause names `document:<path>`) is unchanged and tied to AC-108 item (3).

## Not changed

- The approved-design inspection (`inspectArchitectureDesign`) does not apply the new rule: a design already signed is never refused after the signature for this reason; the rule runs where the PO has not yet signed (`submit-plan`). `ARCHITECTURE_DESIGN_REOPEN_CODES` is therefore unchanged.
- The recheck route (`requalifyNativeGoldfishItemDelivery`, no base commit) cannot ask "did the delivery change it": it still requires the committed, non-empty, regular document.
- "Unowned" cannot be judged at host finalize from the item delivery alone (it carries dependencies, not owned paths); it is a dispatch-time refusal (`DBG-CHECK-DOCUMENT-NOT-OWNED`, plus the existing `DBG-CHECK-NOT-IN-PATHS` invariant), and at finalize the document must be among the check's dependencies (the write scope).
- Code modules keep requiring a test file or a registered command exactly as before.
- The probe still lists the consequence finding `DBG-BINDING-INVALID` (NGHR-ITEM-DELIVERY-SHAPE, no own repair) before `DBG-CHECK-NOT-TEST` for a bare document path; the actionable repair is in the second finding. Reordering or enriching the first finding is left for later.
- The recheck route and the mid-flight scope-amendment routes were not given document-specific handling beyond what the shared `executeGovernedItemDeliveryChecks` does.

## Not proven

No live greenfield run of a document-only module through a real Claude Goldfish (the host path is exercised with real commits in `NGHS69`/`NGHS70`, not with a hook-driven stop). The new case ids NGHS69/NGHS70 add two cases to a registered suite; the inventory count of that suite is for the Coordinator's rebaseline.
