# Claude native identity consumer inventory

Static source inventory only. No live/provider/native PASS; independent review pending.

- **alias-observation** — plugins/pipeline-core/lib/claude-model-host-observation.mjs:25–72. Trusted Claude executable; repository-free bounded --print --model alias call. Exactly one modelUsage key required. Assurance is host-observed-single-call-not-provider-attested; no observed effort.
- **actual-usage-parser** — plugins/pipeline-core/lib/model-role-session.mjs:106–119. Result envelope must succeed and contain nonempty modelUsage keys. These IDs prove one reported usage only; not latest family, installed-account catalogue, provider attestation or effort.
- **slot-projection** — plugins/pipeline-core/lib/model-role-host-observations.mjs:15–65. Alias-key cache; projects observation onto role/effort slots. Slot effort is requested policy metadata, not reported inference effort.
- **bootstrap** — plugins/pipeline-core/scripts/model-role-bootstrap.mjs:145–225. Existing session store reused before discovery. New session observes, reads approved policy, prepares receipt and asks current bootstrap readback acknowledgement. Alias V3 baseline cannot infer concrete approval.
- **legacy-baseline** — plugins/pipeline-core/lib/model-role-v3-baseline.mjs:13–76. Exact model-ID V3 selectors require installed-host-observed admission; alias rejects ALIAS-NEEDS-EXACT-APPROVAL. Existing semantics are not future family adoption automation.
- **selection-receipt** — plugins/pipeline-core/lib/model-role-session.mjs:175–253. Approved compatible available IDs selected by policy rank; receipt pins concrete modelId/effort/session/role/policy/evidence. Digest alone is not hostile-replacement authority.
- **stored-authority** — plugins/pipeline-core/lib/model-role-host-store.mjs:39–90. Rechecks policy authority and admitted readback/receipts; signed authority or recomputed V3 baseline. Private store code inspected, no private state opened.
- **dispatch-selection** — plugins/pipeline-core/scripts/model-role-dispatch-select.mjs:32–98. Reads stored exact session selection; optional projection/store failure returns exact registered V3 selector+effort. It does not assert observed alias concrete identity.
- **host-binding** — plugins/pipeline-core/lib/model-role-host-session.mjs:69–110. Rereads stored authority; requires one runner/role/effort receipt, passes concrete ID to dispatch binding.
- **dispatch-binding** — plugins/pipeline-core/lib/model-role-dispatch.mjs:12–45. Includes receipt/readback digests and validates exact session/role/effort/model binding.
- **packet-preflight** — plugins/pipeline-core/lib/role-dispatch-preflight.mjs:146–238. Checks closed role-dispatch packet, candidate and referenced path bindings. Not actual model/effort attestation.
- **critic-packet** — plugins/pipeline-core/scripts/critic-claude-host.mjs:178–410. Validates stored selected concrete ID and V3 effort; seals candidate/export packet, native handle and receipts. Receipt model/effort fields are requested. Functional fallback explicitly weaker and not OS-isolated.
- **critic-launch** — plugins/pipeline-core/scripts/critic-native-bare.mjs:44–146. Pins executable/contract/schema and route digest; argv has --model and --effort. Stream parser accepts exactly one schema-valid verdict result; does not compare modelUsage or reported effort.
- **session-critic-consumer** — plugins/pipeline-core/scripts/session-critic-finalizer.mjs:214–435. Sealed packet's admitted concrete model overrides older caller V3 selector. Result/receipt candidate, verdict and readback checked; this does not add actual Claude identity evidence.
- **readiness-launch** — plugins/pipeline-core/scripts/runner-design-readiness-bootstrap.mjs:177–357. Claude argv requests model/effort; parser validates structured report against dispatch/candidate/sources, denied tools and model-authored hostExecution refusal. Does not inspect modelUsage or actual effort. Host receipt binds requested route and response SHA.
- **readiness-independent-consumer** — plugins/pipeline-core/lib/design-readiness-host-evidence.mjs:154–198. Independently rereads private runner receipt twice, current route, repository, candidate/source/report/selection hashes. Assurance host-observed-local; requested route, not reported Claude identity.
- **native-prelaunch** — plugins/pipeline-core/lib/native-goldfish-host-state.mjs:116–163. Foreground Task/Agent marker closes briefing role/candidate/scope and records tool_use_id/session, baseline in exclusive private pending file. No native launch performed here; configured model/effort originate briefing.
- **native-return** — plugins/pipeline-core/lib/native-goldfish-host-return.mjs:108–127. PostToolUse Task/Agent exact session+tool-use match, completed status, resolvedModel equals binding; optional modelsUsed rejects switches. Effort is not reported/checked; missing modelsUsed is accepted.
- **native-host-commit** — plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs:20–119. Validates final/critic paths, admission and host commit, then private observation and v4 publication. Public model/effort copied binding; actual matching model relies on host return contract.
- **native-downstream-verifier** — plugins/pipeline-core/lib/native-goldfish-host-observation.mjs:117–152. Reads private observation and verifies record bytes plus Git commit/parent/tree/path/message/Dispatch marker. Clean clone lacks receipt and cannot PASS. Local host evidence, not provider attestation.
- **native-hook** — plugins/pipeline-core/hooks/native-goldfish-host.mjs:4–60. Hook delegates host input to finalizer; source contract is inspected, actual runner delivery/provenance is unverified.
- **record-schema** — plugins/pipeline-core/lib/dispatch-record.mjs:138–260. Validates closed public v4 record fields and dispositions. Nonempty model/effort fields do not independently establish execution identity.

## Future ownership

Exact S2/S5/S6 sources, directly referenced schemas and discovered tests are listed in the paired JSON. These are future coordination ownership proposals.

## Inspection boundary

Static imports/callers and bounded source searches; window reads/search output, some large output truncated. Hashing a file does not imply complete semantic inspection.
Selected test references inspected, none run; fixtures do not prove provider/native host behavior.
- No implemented latest-compatible family-policy adoption automation demonstrated
- Claude Critic/readiness actual modelUsage and effort cross-check absent in inspected parsers
- Native Goldfish resolvedModel/modelsUsed are required host payload contract, not independently validated runner support here; modelsUsed optional
- Native Goldfish effort remains briefing/configured value
- Independent verifiers establish local persisted bindings, cannot upgrade them into provider attestation
- Uninspected: Complete transitive dependencies of packet/control stores, signing/trust policy and Git commit execution
- Uninspected: Advisory-host-bridge consult fallback full launch/return chain
- Uninspected: Claude goal/AFK host consumers discovered by bounded file listing but not traced
- Uninspected: Installed hook registry wiring and real runner hook payload provenance
- Uninspected: Provider/latest-family catalogue semantics or actual account availability
- Uninspected: Full schema interiors and discovered tests beyond selected searches; hashes/existence only for these additional paths

Codex and Antigravity implementation chains assigned other workers; no state/handover/history or private receipts read.

## Evidence

The paired JSON contains exact retained commands and results. Earlier scans are not reconstructed as a full transcript. Initial shell report generation was refused before execution; per-target patch recovery wrote only these two reports.

Task MODEL-FAMILY-CLAUDE-CHAIN-20261001; date 2026-10-01; parent-observed HEAD ccb6385f15baf3426236c5870740a430b90049a7; ruleset 0.7.0+codex.20260930201913.96dd4a5c; manifest 4c287d572f49806e587e0c1264e33b1c1b6fcde64bc634b2d7b3bdbf6b93e086. Methodological Goldfish gpt-6.1-sol/medium; no native authorship or authenticated budget claim.

Source hash validation is recorded in the paired JSON; hash capture alone is not full semantic inspection.

Hash validation: 48 paths captured and independently reread equal; command exit 0. Exact byte digests are in the paired JSON.
