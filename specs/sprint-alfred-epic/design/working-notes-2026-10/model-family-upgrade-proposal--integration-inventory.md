# Model-family integration inventory — partial

Task `MODEL-FAMILY-INTEGRATION-INVENTORY-20261001`, 2026-10-01. This read-only source inventory stopped at the briefing's two-failure boundary. It does not close the complete integration graph, amend the design plan, implement behavior, or qualify any live runner. Independent review is pending. Briefed HEAD `ccb6385f15baf3426236c5870740a430b90049a7` was not independently verified; evidence binds current raw file bytes.

## Findings supported by collected source

Codex's current discovery producer requests `includeHidden:false`, merges pages and returns effort-filtered IDs. Claude's installed producer observes one minimal alias call and explicitly disclaims catalogue/compatibility proof; the separate Anthropic API producer is API-credential-only. Antigravity's producer parses `agy models` ID/display text. None of these readings establishes a complete trusted newest-family contract.

The common dispatcher reads session receipts and can fall back to legacy V3. Consumers include Critic hosts, advisory paths, Agy implementation/live hosts and native Goldfish hooks. Source parent checks against `observed.model` are visible, but Codex app-server child origin of that field is not traced here. It must not be relabeled independent actual execution identity. Claude native Goldfish compares host resolvedModel/modelsUsed; Codex native Goldfish compares start/stop hook model/configured route; these remain host evidence without provider attestation. Agy low-level execution can return unknown identity, making higher-level required identity checks material.

## Evidence inventory

Each SHA-256 is over current complete raw file bytes. `search-call-site-only` entries support only the identified call/field, not full behavior or all branches. Role labels separate discovery, bootstrap, selection, packet/launch binding, native execution signals, historic stores and acceptance consumers. All ownership is proposed future scope, not current edit authority.

| ID / runner / role | Evidence path and line | Raw byte SHA-256 | Relevance / future slice / read depth |
| --- | --- | --- | --- |
| codex-discovery / codex / producer | `plugins/pipeline-core/lib/codex-model-host-observation.mjs:67` | `8d9587bedc9262cad15c6631da952fea571876f0e90df27b9f96c7c8f4a9e77b` | Requests visible model/list pages; merged catalogue is effort-filtered before returning IDs. Raw pages and all effort metadata are not retained in output. **S2**, read-selected-source-or-excerpts |
| claude-discovery / claude / producer | `plugins/pipeline-core/lib/claude-model-host-observation.mjs:38` | `372941998394c3776e796290de1dd1f0231444deff066f692beead4d90ef02ba` | A minimal Claude alias model call yields one modelUsage-derived ID. Its source explicitly disclaims catalogue and compatibility assurance. **S2**, read-selected-source-or-excerpts |
| agy-discovery / antigravity / producer | `plugins/pipeline-core/lib/antigravity-model-host-observation.mjs:14` | `f80ffa6e2a82e04e9a27fb2dc2dc3a8500277a7fa1f61dca8974c8af93a61b0c` | Runs installed agy models and parses IDs/display text; no family/version/effort/latest completeness contract appears in this producer. **S2**, read-selected-source-or-excerpts |
| claude-api-discovery / claude / producer | `plugins/pipeline-core/lib/anthropic-model-catalogue-host.mjs:14` | `459781fbf8dbc55f994aaf7e62808fff0135f77f5fdb882852ca26a8e28aa353` | Separate API-credential catalogue is not Claude Code OAuth availability; not a substitute for installed family discovery. **S2**, read-selected-source-or-excerpts |
| collector / all / producer | `plugins/pipeline-core/lib/model-role-host-observations.mjs:29` | `8e9af5a214534815802a21cb2a539ea3de8c8e29c031e277b50ce831b9e99b29` | Observation cache is effort-keyed for Codex, alias-keyed for Claude, runner-keyed for Agy; collector projects available IDs into slots. **S2**, read-selected-source-or-excerpts |
| bootstrap / all / bootstrap | `plugins/pipeline-core/scripts/model-role-bootstrap.mjs:170` | `e1ef785636d037054a6a64a9deb5725af8fe330c9f08e28674f216b9da56d488` | Existing session store is reused; new family bootstrap must distinguish held evidence from new-work refresh. **S5**, read-selected-source-or-excerpts |
| selector / all / dispatch-selector | `plugins/pipeline-core/scripts/model-role-dispatch-select.mjs:17` | `5d32d64a0dae56548410800ded713abd0420735a16591d35b7739f8ed18c5c57` | Optional role failures can return legacy V3. Active-family errors must not use this fallback. **S5**, read-selected-source-or-excerpts |
| host-selection / all / dispatch-selector | `plugins/pipeline-core/lib/model-role-host-session.mjs:87` | `53ac47846985b078dc4145935cb11451be068ce9a778418b304c36a9949a82d3` | Current dispatcher selects from stored session receipts, rather than refreshing a new invocation. **S5**, read-selected-source-or-excerpts |
| role-binding / all / packet-binding | `plugins/pipeline-core/lib/model-role-dispatch.mjs:30` | `d4d881e1a54f8892a6191aa38914b0e3e05f086e1fe66c23f2dc3ba265cfc73c` | Binds requested exact ID/effort/role to admitted session receipt; no independent native execution identity. **S5**, read-selected-source-or-excerpts |
| role-packet / all / packet-sealing | `plugins/pipeline-core/lib/role-dispatch-preflight.mjs:146` | `da4528ec81d39052484ffecf8434369dd192e0cecfa7b580bd632e858fbc46ea` | Shared packet admission before launcher; source search found no model/effort fields in its selected matches. Exact packet validation shape needs further closure. **S5**, read-selected-source-or-excerpts |
| agy-elephant / antigravity / dispatch-selector-and-packet-sealing | `plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs:197` | `472d2f67cf88054c0d5672604658aaad732b7c9b73d901c9cfd0753354bdbecf` | Reads optional stored selection, folds receipt digest into route binding and seals exact requested model/effort. Hard-coded implementation model and consent restrictions need full follow-up. **S5**, read-selected-source-or-excerpts |
| production-router / all / dispatch-router | `plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs:58` | `3425567ba9050dfd3b70e0357a354b6f21266e6746f8f02927dcd2a53bc982c8` | Production selector imports Agy implementation host; complete inactive/unavailable runner branches have not been read in this partial inventory. **S5**, read-selected-source-or-excerpts |
| agy-session / antigravity / exact-native-launch-and-identity-readback | `plugins/pipeline-core/lib/agy-session-dispatch.mjs:257` | `6a2eb87488ce398708ed718ce8672816838e411b6da1faf9a4ef749f81689a3f` | Passes exact model and effort to invokeAgy; optional model-role store binds session receipt; result verifier requires requested/observed equality. Full consent/packet closure remains pending. **S5/S6**, read-selected-source-or-excerpts |
| agy-low-level / antigravity / exact-native-launch-and-identity-readback | `plugins/pipeline-core/lib/antigravity-execution-host.mjs:247` | `1a497af790aed575d9ac28b9dc647d69d8c5f187b88a173a0b3e4bcc7e967329` | Uses stream init.model or result model/modelIdentity; known mismatch is rejected, unknown can be returned by low-level code. Callers must require actual identity. **S5/S6**, read-selected-source-or-excerpts |
| agy-live-host / antigravity / packet-sealing-and-identity-verifier | `plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs:77` | `4e501a6320e6eb1de96f19fb835f4366528c58a402775c6f9f1eb2fb7471e28e` | Sealed request binds model/effort; launch-result comparison occurs. Search evidence only; full producer/verifier chain not closed. **S5/S6**, search-call-site-only |
| agy-finalize / antigravity / identity-verifier-and-historic-publication | `plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs:52` | `c95c8bb71ffcef399ef38e346fcdf737db0399967289710ca1c08883b079d90d` | Checks witness model against selected model and readback; search-only evidence, witness creation/storage chain still pending. **S6**, search-call-site-only |
| agy-local-readback / antigravity / historic-verification-store | `plugins/pipeline-core/lib/agy-host-observed-local-readback.mjs:73` | `8a31ef45d5a6183b24fd58efc79b45056ae99608db8b0586c77ababdd047d93e` | Local observed receipt readback invokes dispatch binding; search-only evidence; no native qualification inferred. **S6**, search-call-site-only |
| agy-consent / antigravity / authority-consumer | `plugins/pipeline-core/lib/agy-session-authority.mjs:87` | `f368a73cd3ad28b54c3f82978bb50bac1a7729c0137d0d19bcb04e30764223e6` | Consent is bound to exact requested model. Family upgrades must not counterfeit broader consent; exact future authority reconciliation requires review. **S5**, search-call-site-only |
| agy-probe-host / antigravity / dispatch-binding-and-acceptance-consumer | `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs:353` | `0a2d11eded8f9c719814eed91a0bcb47516b9e54308173d035ba4b3696a14b37` | Probe host optionally binds model-role store before gated execution. Source search/read of call site only; no live A1/E3 qualification. **S5/S6**, search-call-site-only |
| claude-critic / claude / dispatch-selector-and-acceptance-consumer | `plugins/pipeline-core/scripts/critic-claude-host.mjs:201` | `9a6159b2d273c8968f466cf57079205f7ee1a2597b3fdf2e65558e43a0ac443b` | Reconciles selected session model with Critic packet route, calls native-bare path or fallback. Full actual result identity parsing needs further reading. **S5/S6**, read-selected-source-or-excerpts |
| claude-bare / claude / exact-native-launch | `plugins/pipeline-core/scripts/critic-native-bare.mjs:56` | `e5c570dff894a75b332fddd042c9a9f60eb6cceafe748c28291e886ddd761a73` | Native argv passes exact model and effort; parseResult and returned identity still need full inspection. Requested argv alone does not prove actual identity. **S5/S6**, read-selected-source-or-excerpts |
| session-critic / all / dispatch-selector-and-acceptance-consumer | `plugins/pipeline-core/scripts/session-critic-finalizer.mjs:243` | `a3adfcdc6c2614466201c36b97f593bd29028c4d7a687c19042a8e14097d60ec` | Binds optional selected role to fresh session Critic packet; validation includes modelRole and receipts. No actual native launch identity established by this partial reading. **S5/S6**, read-selected-source-or-excerpts |
| codex-high-risk-route / codex / dispatch-selector | `plugins/pipeline-core/scripts/codex-critic-session-route.mjs:9` | `42670f191b2d69bb99dcc5e8f484121ecc64017c7f1f5dba3a27a4e32941e8e8` | Shared high-risk route selector projects admitted session model; used by native and selected hosts. **S5**, read-selected-source-or-excerpts |
| codex-selected-critic / codex / packet-sealing-and-acceptance-consumer | `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs:34` | `c8894c7c6cd03d91c28c9611706a726657f0a8c8a35b993cf7347079b12575d2` | Builds role dispatch and validates selected host identity/result; underlying child origin of identity remains untraced. **S5/S6**, read-selected-source-or-excerpts |
| codex-native-critic / codex / packet-sealing-and-identity-verifier | `plugins/pipeline-core/scripts/codex-native-critic-host.mjs:425` | `b7ac04f7d97e0319f0b7f3bba8bb289ef2b996861a7175ea0c714f0b5a3cb5e1` | Compares child observed model/effort and observedThreadReasoningEffort to selection; parent comparison alone does not prove child actual identity origin. **S5/S6**, read-selected-source-or-excerpts |
| codex-normal-critic / codex / dispatch-selector-and-historic-acceptance-consumer | `plugins/pipeline-core/scripts/codex-critic-host.mjs:1099` | `6e55471c7373398a29df842042a48519800127a534a5e11973dcbdd1ba740b0d` | Optional session selection is applied to Critic route; stored receipts compare requested model/effort. Exact family-version downstream schema closure pending. **S5/S6**, read-selected-source-or-excerpts |
| codex-critic-appserver / codex / exact-native-launch-and-identity-verifier | `plugins/pipeline-core/scripts/codex-critic-app-server.mjs:293` | `412dc9300a0e7ed9c7f036854917dbab06df4f437d4c9a6518e61abccd8a8a0e` | Spawns configured app-server child path via sandbox invocation, supplies exact model/effort, compares result observed fields. Identity echo versus independent native fields unresolved until child inspection. **S5/S6**, read-selected-source-or-excerpts |
| codex-advisory-appserver / codex / exact-native-launch-and-identity-verifier | `plugins/pipeline-core/scripts/codex-advisory-app-server.mjs:81` | `877b4be63e942f32bfe879a5d84e470292829c291899c9e300d6c5e77dcac9d2` | Parent passes and compares selected model/effort to child observed fields; returned identity is populated from selected route. Child origin must be independently traced. **S5/S6**, read-selected-source-or-excerpts |
| advisory-bridge / all / dispatch-selector-and-acceptance-consumer | `plugins/pipeline-core/scripts/advisory-host-bridge.mjs:74` | `1b6f0346d4bf8d052477817287534e525fc8e57173d3bea8b294dc6e85da5b3c` | Multiple Codex advisory and Claude consult-fallback selection call sites; native Claude Advisor is governed separately. Exact all branches and transports remain pending. **S5/S6**, read-selected-source-or-excerpts |
| native-prelaunch-hook / claude,codex / packet-sealing | `plugins/pipeline-core/hooks/guard-dispatch.mjs:234` | `d6df111025a43ad21e7dd602bacbaa2adf4b22c9ab3eaebc94eaeed08788d5da` | Pretool guard creates native Goldfish host state from exact dispatch tool input; source search only, full current selector binding not closed. **S5**, search-call-site-only |
| native-state / claude,codex / packet-binding-and-historic-store | `plugins/pipeline-core/lib/native-goldfish-host-state.mjs:161` | `3af829f9a5e7a2c1be09de224d0ea4ce355c4f2ab13d1ef11a4192957a91e9ce` | Binds one exact pending spawn_agent to SubagentStart expectedModel and agent ID; start uniqueness/TTL restricts fanout. No provider attestation. **S5/S6**, read-selected-source-or-excerpts |
| native-return / claude,codex / identity-verifier | `plugins/pipeline-core/lib/native-goldfish-host-return.mjs:115` | `8b6adf32d6185efdc9677e6ced46469c13c6c7e13a8e64bb9a13897e5d68ef6e` | Claude checks host resolvedModel/modelsUsed; Codex checks SubagentStop model against pending binding. These are host-carried identity signals, not provider attestation. **S6**, read-selected-source-or-excerpts |
| native-observation / claude,codex / historic-verification-store | `plugins/pipeline-core/lib/native-goldfish-host-observation.mjs:93` | `6393965de7bbd51ef4cb389df6ccd70989dfffd90baf91545c6e2190eb7c8564` | Observation records model/effort from configured binding after host return checks; assurance distinguishes Claude resolved-model from Codex configured-route evidence. **S6**, read-selected-source-or-excerpts |
| native-finalizer / claude,codex / acceptance-and-publication-consumer | `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs:12` | `dca09232cb8d110748856aadb6fd52742073cbf2234e036341b08b54b0f37ea6` | Uses native return observation/state before host commit and dispatch publication. New receipt versions must preserve historical record verification; no commit performed here. **S6**, read-selected-source-or-excerpts |
| native-hook / claude,codex / identity-verifier-entry | `plugins/pipeline-core/hooks/native-goldfish-host.mjs:6` | `97eab37a9dc859183df98f703060469c9271c94406c125ec4063b42a9670bb03` | Host return hook forwards to finalizer. It does not execute a provider model itself. **S6**, read-selected-source-or-excerpts |
| role-store / all / historic-verification-store | `plugins/pipeline-core/lib/model-role-host-store.mjs:138` | `a52175f11f3ed1740eb09c7ba1ca8fd7f17943b24dc2ebc4ed976bf2bc5dd3ad` | Exclusive per-session storage revalidates exact policy and acknowledgement; new invocation CAS/watermark state must preserve old schemas. **S5/S6**, read-selected-source-or-excerpts |
| v3-baseline / all / historic-authority-verifier | `plugins/pipeline-core/lib/model-role-v3-baseline.mjs:66` | `93831f00f2b5fae9e2e798eed33f1992c7fd727e3befefc12a019fa0f8bc089f` | Recomputes approved exact V3 selectors/current source. Must remain historic/inactive semantics, not active-family fallback. **S5/S6**, read-selected-source-or-excerpts |
| dispatch-record / all / historic-verification-consumer | `plugins/pipeline-core/lib/dispatch-record.mjs:6` | `f1a4e43424983a86bb75015377f123658f9fe26d4f7d136e1d15f4b8f7f64f52` | Accepts v4 and historical v3/v2 records with exact model/effort fields; not independent actual identity source. **S6**, read-selected-source-or-excerpts |
| main-route / all / bootstrap-and-compact-consumer | `plugins/pipeline-core/lib/main-session-route.mjs:11` | `0154bc45b8c33d8906cc643e8a9a2160652aec27b34bc5d4a75934436d5718ec` | Imports historic session receipt validator; full main-session requested versus attested identity reconciliation remains pending. **S5/S6**, search-call-site-only |
| main-attestation / all / identity-readback | `plugins/pipeline-core/lib/main-session-route-attestation.mjs:6` | `5812d35314eb465eedbdb59870bd0cf8bf191c88d600ebc38adb5aaf33549f9c` | Source search surfaced explicit limitation that this observation cannot satisfy full main-route contract. No full reading or guarantee. **S6**, search-call-site-only |

## Future S2/S5/S6 ownership

The exact current additional production paths below are concrete inspected candidates. They do not exhaust required ownership while the remaining graph is open. Tests, schemas and imported transports must be enumerated from real paths by the continuation; no guessed test path or undocumented provider contract is authorized. The existing four design documents remain unchanged.

### S2 inspected additional ownership candidates

- `plugins/pipeline-core/lib/anthropic-model-catalogue-host.mjs`
- `plugins/pipeline-core/lib/antigravity-model-host-observation.mjs`
- `plugins/pipeline-core/lib/claude-model-host-observation.mjs`
- `plugins/pipeline-core/lib/codex-model-host-observation.mjs`
- `plugins/pipeline-core/lib/model-role-host-observations.mjs`

### S5 inspected additional ownership candidates

- `plugins/pipeline-core/hooks/guard-dispatch.mjs`
- `plugins/pipeline-core/lib/agy-session-authority.mjs`
- `plugins/pipeline-core/lib/agy-session-dispatch.mjs`
- `plugins/pipeline-core/lib/antigravity-execution-host.mjs`
- `plugins/pipeline-core/lib/main-session-route.mjs`
- `plugins/pipeline-core/lib/model-role-dispatch.mjs`
- `plugins/pipeline-core/lib/model-role-host-session.mjs`
- `plugins/pipeline-core/lib/model-role-host-store.mjs`
- `plugins/pipeline-core/lib/model-role-v3-baseline.mjs`
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs`
- `plugins/pipeline-core/lib/role-dispatch-preflight.mjs`
- `plugins/pipeline-core/scripts/advisory-host-bridge.mjs`
- `plugins/pipeline-core/scripts/codex-advisory-app-server.mjs`
- `plugins/pipeline-core/scripts/codex-critic-app-server.mjs`
- `plugins/pipeline-core/scripts/codex-critic-host.mjs`
- `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs`
- `plugins/pipeline-core/scripts/codex-critic-session-route.mjs`
- `plugins/pipeline-core/scripts/codex-native-critic-host.mjs`
- `plugins/pipeline-core/scripts/critic-claude-host.mjs`
- `plugins/pipeline-core/scripts/critic-native-bare.mjs`
- `plugins/pipeline-core/scripts/elephant-agy-implementation-dispatch.mjs`
- `plugins/pipeline-core/scripts/elephant-implementation-dispatch.mjs`
- `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`
- `plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs`
- `plugins/pipeline-core/scripts/model-role-bootstrap.mjs`
- `plugins/pipeline-core/scripts/model-role-dispatch-select.mjs`
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`

### S6 inspected additional ownership candidates

- `plugins/pipeline-core/hooks/native-goldfish-host.mjs`
- `plugins/pipeline-core/lib/agy-host-observed-local-readback.mjs`
- `plugins/pipeline-core/lib/agy-session-dispatch.mjs`
- `plugins/pipeline-core/lib/antigravity-execution-host.mjs`
- `plugins/pipeline-core/lib/dispatch-record.mjs`
- `plugins/pipeline-core/lib/main-session-route-attestation.mjs`
- `plugins/pipeline-core/lib/main-session-route.mjs`
- `plugins/pipeline-core/lib/model-role-host-store.mjs`
- `plugins/pipeline-core/lib/model-role-v3-baseline.mjs`
- `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs`
- `plugins/pipeline-core/lib/native-goldfish-host-observation.mjs`
- `plugins/pipeline-core/lib/native-goldfish-host-return.mjs`
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs`
- `plugins/pipeline-core/scripts/advisory-host-bridge.mjs`
- `plugins/pipeline-core/scripts/agy-host-observed-finalize.mjs`
- `plugins/pipeline-core/scripts/codex-advisory-app-server.mjs`
- `plugins/pipeline-core/scripts/codex-critic-app-server.mjs`
- `plugins/pipeline-core/scripts/codex-critic-host.mjs`
- `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs`
- `plugins/pipeline-core/scripts/codex-native-critic-host.mjs`
- `plugins/pipeline-core/scripts/critic-claude-host.mjs`
- `plugins/pipeline-core/scripts/critic-native-bare.mjs`
- `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`
- `plugins/pipeline-core/scripts/goldfish-antigravity-live-host.mjs`
- `plugins/pipeline-core/scripts/session-critic-finalizer.mjs`

## Inactive/unavailable paths and source gaps

The production selector imports Agy dispatch; its complete runner branches have not been read, so Claude/Codex implementation availability is not claimed. Current route inventory explicitly distinguishes unavailable routes in the design context, but the actual registry branches still need source closure. An absent optional installed runner is not a missing source adapter contract; no installation presence was tested here.

- Actual Codex app-server child paths must be resolved from the observed hosts' CHILD constants before reading; guessed codex-native-critic-child.mjs is not a real source-path assertion.
- Read real native/selected Critic and advisory child implementations to classify actual thread/turn model versus request echo and actual effort.
- Read full Claude native-bare parseResult and fallback host-return schemas; full native Goldfish hook input provenance and effort source.
- Read full Agy stream parser, live witness/store/authorship chain, structured-final path and consent pin/upgrades interaction.
- Close generic execution-plane, sandbox invocation/reliability, main-session/Compact and downstream acceptance/verifier import/call graph.
- Read actual unavailable runner branches in elephant-implementation-dispatch and route registry before claiming inactive-path closure.
- Enumerate existing test/schema ownership for all consumers before future dispatch; current table enumerates inspected additional production paths only.

## Commands, stop and limitations

[integration-inventory.json](integration-inventory.json) contains each actual search/read command, outcome, current source hashes, ownership arrays and three-valued checks. The broad initial searches included test matches and some output was truncated; bounded follow-up exact source excerpts support the entries above. No tests or native executables were invoked.

Two attempts failed: the guard rejected an `rg -g` exclusion-option invocation as outside-root; then an explicit read of the guessed `codex-native-critic-child.mjs` failed with ENOENT. The former was followed by a successful explicit absolute-root search. The latter is an agent filename assumption, not proof of missing real source. At that point tracing stopped. Artifact construction only captured hashes and documented already-collected source evidence. A fresh closed dispatch must resolve the actual child path from its host constant and finish the unresolved graph.

Current acceptance: artifact/hash reporting passed; full three-runner call-graph inventory incomplete; independent review pending; implementation, Source Verify and installed/native qualification not performed. No native-authorship claim, policy/authority change, commit, staging, cache write, prototype change or provider capability experiment occurred.

