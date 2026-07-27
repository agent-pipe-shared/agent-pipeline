# Nova / Cyborg collision and ownership matrix

## Boundary

Sprint Cyborg currently contains `#39` and `#41`–`#48` and is owned by
another runner. No Cyborg branch or candidate OID was visible at the Nova
branch cut. Cyborg is therefore an external workstream. Nova acceptance does
not wait for a Cyborg base, branch/OID, write-path manifest or Result.

Both Sprints start from published `v0.4.1`. Neither may consume unpublished
bytes from the other. A later integration candidate must reconcile the exact
accepted Nova and Cyborg OIDs and rerun all applicable gates.

The same rule applies to backlog authority: this Nova repository is canonical;
Cyborg has a manual read-only mirror of transition head `36dd616d…`. The
canonical allocation already resolves direct claims to 13 Nova and six Cyborg
items. A later duplicate direct claim blocks only the affected transition or
combined integration; it does not block unrelated Nova implementation.

## Contract ownership

| Surface | Nova ownership | Cyborg issue domain | Collision rule |
| --- | --- | --- | --- |
| Runner/execution capability | Runner, sandbox, worker, async and forge capability contracts | Security-verifier capability and assurance-control applicability | Separate namespaces/schemas; no shared generic `capability` schema without an approved common-contract ADR. |
| Security verdict | Nova records execution assurance only | `#41/#42` cover security controls, completeness and verdict | Nova cannot emit or waive a Cyborg security verdict. |
| Threat model | Nova package threat model for execution risks | `#43` covers canonical product threat/security-requirement lifecycle | Nova does not consume unpublished Cyborg schemas; later integration may reference accepted IDs. |
| Credentials | `#18` owns task-scoped execution leases | `#45/#46` cover signing/build/AI security controls | Nova lease schema cannot become signing or policy authority. |
| Findings/review | `#54` owns Critic review lineage | `#47` covers security finding/VEX lifecycle | Keep Critic findings and security findings separate until a versioned projection is approved. |
| Release preflight | `#56` owns deterministic local readiness | `#39/#42/#45/#48` cover security/supply-chain release requirements | Nova exposes an extension boundary; Cyborg registers only in post-Sprint integration. |
| Artifact topology | Nova uses existing feature-package topology | Cyborg may propose supply-chain/security artifact classes | Nova does not edit an unpublished Cyborg topology extension. |
| Forge/CI authority | `#51` owns provider-neutral forge capability mapping | `#46` covers security requirements for CI/repository-host authority | Nova maps observed capability; accepted Cyborg policy may constrain later integration. |

## Path ownership

### Nova-exclusive design and planned implementation paths

- `specs/sprint-nova-epic/**`
- new runner-capability contract/schema/tests
- new execution-plane companion contract/schema/tests
- new scheduling-lifecycle composition/tests
- new invocation reliability and Critic-lineage contracts/tests
- new local-worker, async-execution and credential-lease contracts/tests
- new Antigravity runner adapter/tests/docs
- new forge capability and GitLab adapter/tests/docs
- new macOS support-matrix fixtures/docs
- new benchmark contract/fixtures/reports

Exact file names are fixed by the approved slice brief before implementation.
A package may not widen from its declared paths.

### Cyborg-exclusive paths/classes

- secure-development control catalog and profiles;
- policy-complete security aggregation;
- canonical security threat/requirement artifacts;
- security scanner/module adapters;
- SBOM lifecycle and payload profiles;
- source/build provenance and attestations;
- security finding, exception and VEX lifecycle;
- product-security readiness/disclosure/incident artifacts; and
- Cyborg-specific specs/evidence.

### Shared later-integration resources

| Resource/path | Why shared | Required handling |
| --- | --- | --- |
| `harness/scripts/verify.mjs` | Both Sprints may register new suites. | Each Sprint may change its own branch; the post-Sprint integration package reconciles registrations. |
| `docs/adr/README.md` and new ADR numbering | Both may add architectural decisions. | Reserve ADR IDs or serialize additions; never renumber another branch silently. |
| `docs/operating-model.md` | `#38/#54` and `#46` may affect process/security wording. | Separate delta proposals; merge only through an approved reconciliation review. |
| `docs/state.md`, `HISTORY.md` | Branch-independent operational close surfaces. | Updated only at the owning branch close/integration boundary. |
| `VERSION`, release/plugin/marketplace manifests | Both influence a future release. | No Sprint-local version bump without release authority. |
| `governance/artifact-topology.json` and topology validator | Cyborg supply-chain artifacts may extend classes. | Cyborg-owned change; Nova consumes only after merge. |
| `plugins/pipeline-core/scripts/security-scan.mjs` | Cyborg core implementation. | Nova does not edit. |
| `plugins/pipeline-core/lib/control-execution-exchange.mjs` | Frozen common authority. | Neither Sprint edits v1 in place. |
| `plugins/pipeline-core/config/control-execution-extension-namespaces.json` | Shared extension registry. | Use existing namespaces where possible; a new namespace is a separately approved shared change. |
| runner-profile registries and generated projections | Nova adds a runner; Cyborg requalifies security capability. | Post-V3 additive migration plus serialized regeneration/readback. |

## Runtime/resource ownership

- Nova owns its local branch, Nova worktrees, test processes and opt-in external
  targets explicitly selected for Nova.
- Cyborg owns its branch, worktrees, scanner fixtures and security test
  resources.
- Global Git configuration, credentials, user home, shared caches, plugin
  install state and host daemons are not implicitly owned by either Sprint.
- A package that needs one of those resources must declare it and serialize.

## Collision gate

Before every implementation dispatch, compare the package write paths and
runtime resources with Nova's own active work. An identical repository path on
independent `v0.4.1` branches is a recorded later merge collision, not a
current execution collision and not isolation evidence.

`NVA-CYBORG-COLLISION` blocks only when both Sprints would mutate one physical
workspace/global resource concurrently, or during a combined integration
whose exact accepted diffs conflict. Resolution is one of:

1. serialize the actual physical/global resource;
2. reconcile both accepted OIDs in the post-Sprint integration package; or
3. create a separately approved common-contract lifecycle and deliberately
   rebase both Sprints after it is accepted.

No conflict is solved through an unpublished cherry-pick or an automatic
merge from `main`.

The same gate covers backlog ownership. The current direct sets are already
disjoint. A later duplicate target emits
`NVA-CYBORG-BACKLOG-CLAIM-COLLISION` for that transition; see
`design/backlog-intake.md`.
