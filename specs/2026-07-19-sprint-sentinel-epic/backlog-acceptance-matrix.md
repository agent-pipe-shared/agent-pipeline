<!-- po-language: en -->

# Sentinel backlog acceptance matrix

Status: audited projection for the current integration candidate. This matrix
projects canonical backlog state and available evidence; it is neither a
backlog transition nor a release/go-live approval. The sixteen starting items
and five PO-admitted native-Windows blockers form the 21-item Sentinel scope.

Classifications are evidence-sensitive: `partial` means at least one AC block
remains; `delivered-but-unproven` means code/tests exist without the complete
candidate-bound AC/Verify/Critic/close chain; `closed` requires canonical
ledger and closure evidence. File presence or one green focused test cannot
close an item.

## Candidate re-baseline

The current tree contains the production and test paths cited below. Full
Verify and security evidence must be regenerated after the final corrective
commit and bound to that commit; previously generated evidence is historical
only. Native platform attestations, human gates, and remote effects are never
inferred from local fixtures.

| Canonical item and state | Current AC assessment | Production/test/Verify evidence | Remaining sanctioned gate |
| --- | --- | --- | --- |
| `pipeline.afk-assumption-mode` — **open**, delivered-but-unproven | Disabled mode, binding, ledger, locks, review, and transaction paths exist; the complete registered AC/close chain is absent. | `plugins/pipeline-core/lib/afk-{assumption-mode,ledger,review,transaction-host}.mjs` and tests; `scripts/afk-activation.test.mjs`. | Register all required suites, bind final PO disposition and candidate evidence, then dedicated close. |
| `pipeline.canonical-worktree-lifecycle` — **open**, delivered-but-unproven | Lifecycle/cleanup and recovery mechanisms exist; both close profiles and post-commit cleanliness are not fully dispositioned. | `lib/worktree-lifecycle.{mjs,test.mjs}`, session cleanup tests, Full Verify registration. | Prove both close profiles and recovery on the candidate; dedicated transition. |
| `pipeline.codex-plugin-validator-host-parity` — **open**, partial | Local parity classification exists, but it is not a host/version-bound native-versus-generic A/B on identical fixtures. | `scripts/codex-plugin-validator-parity.{mjs,test.mjs}` and Verify suite. | Produce native same-host/version/fixture evidence; `unavailable` is not success. |
| `pipeline.codex-sandbox-critic-longterm` — **open**, partial | Host/preflight/select/runtime contracts cover the intermediate lane; strong input-confined/network-denied assurance remains unproved. | Critic host, isolation, shadow, preflight, selection, and runtime modules/tests. | Original upstream, shadow, T1, isolation, and PO evidence for the strong lane. |
| `pipeline.documentation-information-architecture` — **open**, delivered-but-unproven | Capability and language checks exist. The inventory now records an explicit pending Critic gate instead of a fabricated digest. | `docs/product-capability-inventory.json`; inventory/language checks and Verify registration. | Final candidate-bound Critic receipt, operator journeys, EN/DE front-door acceptance, exact HAW-E batch. |
| `pipeline.dual-channel-publication` — **open**, partial | Planning, bundle, authority, and journal surfaces exist; no fresh shared authorization and four-effect fetch-back exists. | Publication bundle/authority modules and release/publication scripts/tests. | Execute complete two-channel HAW-E release/readback chain. |
| `pipeline.execution-model-switchback` — **open**, partial | Desired/actual reconciliation and post-compact requests exist; real main-session attestation remains missing. | `lib/main-session-route.mjs`, `lib/interaction-continuity.mjs`, post-compact hook and tests. | Candidate-bound host attestation and drift/return-request evidence. |
| `pipeline.nonblocking-interaction-continuity` — **open**, delivered-but-unproven | Trajectory, compact, resume, state, host, and status surfaces exist without complete AC-to-close mapping. | Continuity modules/CLI and registered tests. | Map and prove all trajectory/compact/resume ACs; dedicated close. |
| `pipeline.po-gate-worktree-authority` — **open**, delivered-but-unproven | Primary readback and linked-worktree/cardinality/digest negative cases exist. | PO-gate authority/publisher modules and tests. | Complete candidate-bound AC disposition and dedicated transition. |
| `pipeline.push-guard-worktree-target` — **in_progress**, delivered-but-unproven | Target binding and negative cases exist; no authorized regular target-worktree push/fetch-back is bound. | Push guard, worktree target-binding suite, Full Verify registration. | Exact authorized target-worktree push plus fetch-back, then dedicated close. |
| `pipeline.regulated-document-hooks` — **open**, partial | ID, binding, policy, impact, renderer, and lifecycle foundations exist; the complete private receipt/review/rationale/recovery vertical is not proved. | Document hook/identifier/lifecycle/adapter/binding/render modules and suites. | Every mandatory `(bindingId,event)` chain reaches current receipt plus review/rationale or typed blocker; HAW-E batch only. |
| `pipeline.session-keep-awake` — **open**, delivered-but-unproven | Projection, controller, cleanup, and platform classification exist; supported-host evidence and HAW-E acceptance are incomplete. | Session-power core/controller/helper/cleanup modules and tests. | Native lease/expiry/cleanup evidence per supported host; HAW-E batch. |
| `pipeline.source-available-commercial-licensing` — **closed**, corrective gate pending | Canonical sequence 15 closed the original item, but the current Critic correction adds explicit SUL consistency, third-text attribution, CLA/PR acceptance, and a still-open legal-rightsholder identity/review gate. Closure is not release approval. | `LICENSE`, `LICENSE-DOCS`, `NOTICE`, `CONTRIBUTING.md`, `CONTRIBUTOR_LICENSE_AGREEMENT.md`, SPDX/plugin metadata, `third-party-licenses.json`, license-contract checker; canonical closure evidence remains historical. | Insert the legally identifiable rightsholder/contracting party, obtain named human legal/rightsholder review, fresh Verify/security/Critic. Do not invent or reopen ledger history by hand. |
| `pipeline.stateful-design-contract-template` — **open**, delivered-but-unproven | Nine required design fields are enforced; no concrete stateful design has completed candidate-bound closure. | Documentation contract checker/tests and implementation plan. | Map fields to a concrete design and create dedicated closure evidence. |
| `pipeline.t1-governance-path-preflight` — **open**, partial | Governance packet and writer-preflight code exists without complete path/ETA/tool-setup disposition. | Critic packet governance, workflow preflight/writer modules and tests. | Specify, register, and prove remaining T1 ACs, then close. |
| `pipeline.verify-gate-scoped-registration` — **open**, delivered-but-unproven | Narrow registration authority exists and the current corrective package adds the two omitted SNT-0 suites plus license checks without removing existing suites. | `lib/scoped-verify-registration.*`, `harness/scripts/verify.mjs`, `codex-advisory-{app-server,bootstrap}.test.mjs`, license-contract tests. | Bind the updated PRD digest, final Verify evidence, AC matrix, and sanctioned dedicated transition. |
| `pipeline.windows-runtime-baseline-containment` — **closed**, closed | V2/V3 containment, native Windows no-op attestation, Verify/security, and independent Critic are canonically bound. | Ledger sequences 37–38; Windows containment closure/native-host evidence. | No #33 remainder; #34–#37 remain separate. |
| `pipeline.windows-directory-durability` — **open**, delivered-but-unproven | Advisory receipt persistence distinguishes pre-rename failure, confirmed durability, typed unsupported/reduced durability, and unknown post-rename faults. Other writers still need complete consumer mapping and native proof. | `lib/advisory-receipt-assurance.{mjs,test.mjs}`, Windows assurance Verify registration; worktree/profile writers expose typed durability boundaries. | Resolve AC wording versus reduced-durability behavior, prove every authority consumer on native Windows/POSIX/macOS as required, dedicated close. |
| `pipeline.windows-private-state-assurance` — **open**, delivered-but-unproven | Shared Windows DACL/owner/reparse observation and hardening now exists and is consumed by private boundary, PO gate/profile, worktree, release, sandbox, and advisory paths. Canonical state remains open. | `lib/windows-private-state.{mjs,test.mjs}`, private-boundary and advisory-receipt suites, migrated consumer tests. | Complete consumer inventory and negative/native Windows evidence, independent Critic, dedicated transition. |
| `pipeline.windows-verify-reproducibility` — **open**, delivered-but-unproven | Many fixtures now use capability gates, junctions, Windows path rules, native command shims, and classified skips; the CI workflow is still Linux-only and no final native standard-account Full Verify is bound here. | `windows-verify-fixture-ac-matrix.md`; updated setup, pipeline-state, security, sandbox, migration, and host tests. | Native Windows standard-account Full Verify/security/Critic evidence after #34/#35 plus an explicit Windows CI or equivalent durable gate; dedicated close. |
| `pipeline.windows-trusted-tool-resolution` — **open**, delivered-but-unproven | Shared resolver separates discovery, trust, identity, missing, rejected, and probe errors; consumers and closed three-suite registration exist. No transition is implied. | `lib/trusted-tool-resolution.{mjs,test.mjs}`, toolchain preflight/security consumers, `windows-assurance-verify-registration.*`. | Native Windows positive/negative evidence, complete consumer proof, security/Verify/Critic binding, dedicated close. |

## SNT-0 is an enabler, not a backlog item

SNT-0 is a prerequisite, not one of the 21 canonical items. The selected-host
bridge, Codex Advisory bootstrap/app-server adapter, coordinator, and their now
registered tests prove the fail-closed one-question boundaries. The
PO-authorized local functional equivalent remains weaker: no attested selected
sandbox execution, OS isolation, or model identity; no export, mutation, or
auto-apply. A repository file cannot claim live runtime success.

## Reconciliation rule

`node plugins/pipeline-core/scripts/check-backlog-state.mjs` proves structural
item/ledger/evidence/projection consistency only. Every open row requires its
own AC, Verify, candidate, human/remote gate where applicable, and sanctioned
writer transition. No bulk transition or matrix edit may create completion.
