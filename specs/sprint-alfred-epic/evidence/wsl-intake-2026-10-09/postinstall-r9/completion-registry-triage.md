# ALFRED-VERIFY-COMPLETION-REGISTRY-TRIAGE-R1

## 1. Outcome

Diagnostic delivered; no production/test/registry edits, commits, native execution records, or broad reruns. All nine named suites FAILED in the saved run. Six are completion declaration failures after zero callback failures, two are stale copied-fixture import closures, and one is a stale classified-descriptor assertion. Independent review pending; PO acceptance open.

## 2. Evidence and exact failures

Saved run: `verify-1791565248875-9dc2c922b74c4e2f`, candidate `e87ac5f1d7071570636719a60b1649004c6e7955`, tree `013330771fd44316db8e9b0702a5c93f33e0f903`. Index is explicitly nonterminal; this report does not describe whole Verify acceptance.

| Suite | Saved callback result | Descriptor vs declared source | Exact correction |
| --- | --- | --- | --- |
| commit-msg-hook-install-tests | 23 pass, 0 fail | CMI001–CMI022 (22) vs CMI001–CMI023 (23) | append CMI023 |
| dispatch-record-strip-for-critic-tests | 12 pass, 0 fail | DRS01–DRS11 (11) vs DRS01–DRS12 (12) | append DRS12 |
| governance-action-artifact-tests | 9 pass, 0 fail | GAA01–GAA08 (8) vs GAA01–GAA09 (9) | append GAA09 |
| model-family-runtime-host-tests | 5 pass, 0 fail | MFH001–MFH004 (4) vs MFH001–MFH005 (5) | append MFH005 |
| project-uninstall-tests | 12 pass, 0 fail | UC02C001–UC02C007 (7) vs UC02C001–UC02C012 (12) | append UC02C008–UC02C012 |
| windows-private-state-tests | 12 pass, 0 fail, 4 existing host skips; 16 total | WPS001–WPS013 (13) vs WPS001–WPS016 (16) | append WPS014–WPS016 |

All six logs end in `VERIFY-CASE-COMPLETION-DECLARATION` and exit 1: they are FAILED, not PASS. The policy schema and maxBytes are valid (65536), required dispositions are present, and existing ordered IDs agree. No ID type/format mismatch was found; the mismatch is count/set identity. The receiver compares both declared count and case-set digest, so weakening only a count check cannot repair it. Existing Windows skips remain declared identities; no new skip is proposed.

`verify-case-completion-registry-tests`: 32 callbacks, 31 pass, 1 fail (VCR01), case completion complete. Saved failure shows clone-hook-readiness and commit-msg-hook-install no longer classified, and assertion-site drift for design-course-command-admission 49→65 and model-family-approval-request 35→49. The candidate blob already expects command-admission 65, while the saved log expects 49: its displayed candidate metadata alone does not bind every executing worktree byte to that candidate. Do not conflate the log's runtime expectation with the candidate blob.

Candidate-bound inventory probe: 787 registered tests, 317 completion registry entries, 308 conservatively classified suites, no static checker findings. VCR01 candidate expectations remain stale: baseline 266 plus 19 newlyCounted = 285 versus actual 308; registry 292 versus 317; retainedR5 284 versus 307. Its newlyCounted array has 19 rows but clone-hook-readiness and CMI now classify as null, leaving 17. Retained identities outside that named delta therefore total 291 versus expected 266. The independent retained identity digest checks must be reconciled from the exact historical identity set and legitimate migrations, never replaced merely with current hashes to make green.

`verify-suite-registration-tests`: 40 checks printed OK, then an uncaught assertion at `assertReachedRegistration` (line 676) in the next check (line 689), because the fixture Verify child imports worktree-lifecycle, which imports missing `plugins/pipeline-core/lib/git-null-device.mjs`. No later cases were reached; this is one observed abort, not evidence that all remaining callbacks passed.

`windows-assurance-verify-registration-tests`: 23 pass, 1 fail, exactly WAVR19, with the same missing git-null-device fixture module. Both failures occur before ordinary suite registration, not because registration IDs were absent or duplicated.

## 3. Actual authority paths and ownership

Actual import chain: `harness/scripts/verify.mjs` imports `verify-case-completion-augmentation.mjs`; that loader reads `harness/config/verify-case-completion-augmentations.v1.json`. `harness/scripts/check-verify-case-completion.mjs` defines `DEFAULT_REGISTRY=harness/config/verify-case-completion.v1.json`, `DEFAULT_SCHEMA=harness/config/verify-case-completion.v1.schema.json`, `DEFAULT_VERIFY=harness/scripts/verify.mjs`, and `DEFAULT_DECLARATIVE=harness/verify-suites.json`. Its actual test is `harness/scripts/check-verify-case-completion.test.mjs`, not a guessed verify-case-completion-registry filename.

Minimal packages:

1. Harness declaration ownership: four builtin rows in protected verify.mjs (CMI, DRS, GAA, WPS). Preserve schema, maxBytes, IDs and required disposition; append only missing suffix IDs. TP-3 requires author repair for direct modification. An augmentation targeting these existing builtin policies currently fails the static checker because it forwards `caseCompletion:true` rather than the exact prior policy: `AUG-PREIMAGE`. Do not propose an augmentation as a presently working builtin bypass. If author policy requires augmentation, first implement exact static prior-policy parsing under separately authorized harness ownership, retaining its closed grammar and preimage check; then use digest-bound strict monotone extensions.
2. Declarative extension ownership: MFH and UC02 are existing rows in protected append-only verify-suites.json. Keep those rows byte-identical and append exact-file augmentation entries using `previousPolicySha256=verifyCaseCompletionPolicySha256(exact previous policy)`, complete ordered supersets, and maxBytes 65536. Current loader and checker support exact prior objects for declarative rows. No completion-disposition registry changes needed.
3. Fixture ownership: `harness/scripts/check-verify-suite-registration.test.mjs` FIXTURE_MODULES near 589 and `plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs` FIXTURE_MODULES near 151. Add the transitive git-null-device module to each physical copied-fixture closure; assess its imports before claiming closure complete. Preserve the intended registration assertions. No production registration edit is warranted by these import errors.
4. VCR01 ownership: `harness/scripts/check-verify-case-completion.test.mjs` near 107–260. Reconstruct historical named identity additions/migrations, reconcile null classifier transitions and changed assertion-site counts, preserve all required registry identities and migration checks. Classification is a conservative source-shape observation, not the FD callback count; never force migrated sources back into the vulnerable classifier just to match old counts.

## 4. Verification performed and required repro

Performed: saved logs/index reads; source policy/case-set comparison; pure static checker in physical and exact candidate/base mode; candidate Git blob reads. No affected test was rerun. Static checker success does not establish FD3 terminal success.

After authorized fixes: run the two fixture tests directly to prove they reach intended registration instead of import failure; run the VCR test and real registry checker; run each six-suite target through a focused real Verify registration/FD3 receiver with its genuine helper-produced stream. Require process exit success, declaration count and case-set digest equality, one disposition per registered case, valid terminal receipt, and existing platform skip classifications. Verify augmentation validation/preimage/non-monotone negative cases and declarative append preservation. No receipt fabrication or exemption is permitted. Whole Verify and native acceptance remain outside this diagnostic.

## 5. Artifacts / writes

Own scratch only: `probe.mjs`, `comparison.json` (physical observation), `candidate-comparison.json` (candidate-bound observation), and this report. The probe never imports verify.mjs or any affected test; it reads registration literals in a sandboxed VM and invokes the exported pure registry checker. Scratch artifacts are ignored, present locally, not committed durable acceptance evidence.

## 6. Dispatch / limitations

Goldfish diagnostic, no delegation. Actual duty.deep route gpt-6.1-sol medium, receipt `01e866e3764194fd6ab78202b934e56c83cbe3d734bc28f63e394bf880c99efe`; loaded ruleset `b7115494a79c3271c224c51d0bd388b0ccfff931a4ae11a0cd6a7eb19ce0b88d`. Installed preflight returned ready and matching ruleset/source identity at host-authorized-wsl. Goldfish did not execute onboarding. Full bootstrap confirmation was not claimed. Initial reads included an incorrect sandbox routing and guessed nonexistent paths; those were corrected to host-bound discovered files with no override or protected write. Shared checkout source can change concurrently; candidate comparison is exact Git blob scoped, and saved runtime logs are separately scoped. Independent review pending; PO acceptance open.
