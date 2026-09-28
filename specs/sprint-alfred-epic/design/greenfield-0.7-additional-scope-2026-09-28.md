# Next local 0.7 candidate: activation, Agy topology and preserved-content unregister

Prepared 2026-09-28 from explicit PO direction and the three open source items. This is a reviewable scope extension, not an approval, implementation, installed-host result, or backlog closure. Existing full 0.7 work remains in scope. No new Reader course is requested.

## Source requirements and observed facts

| Item | Verified basis | Remaining uncertainty |
| --- | --- | --- |
| `pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin` | Physical 0.6.2 managed/imported copy coexists with a current 0.7 global path registry; installer lacks imported-copy lifecycle. Historical fixture lock contains 0.6.2. | Exact CLI discovery/precedence, executing source, import recreation and restart behavior need isolated S1–S6 observations. A version lock and plugin list alone do not prove the executing path. |
| `pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in` | Existing probe enumerated real hook wiring and measured effects against ungoverned Git/non-Git fixtures; source has inconsistent marker lists and pre-scope hardening. | Codex/Agy payloads were approximated; Windows was not probed. Live payload/readback and declined fixtures remain acceptance work. |
| `pipeline.no-uninstall-path-for-a-repository-that-once-opted-in` | Reset classification removes seeded records and private implementations without coordinating Git shims; no content-preserving exit exists. | Ownership of project enablement keys, exact footprint by onboarding path, shared-worktree scope, and stale absolute-cache hook behavior need focused fixtures. |

PO decision received through the parent: include all three items in the next local candidate; central activation contract, persisted decline and content-preserving unregister are required. Git conventions and publication-executor policy apply **only to opted-in Pipeline repositories**. Outside that scope the only exceptions are destructive Git protection and the initial opt-in hint. A durable refusal suppresses the hint too. No pending PO choice remains for that rule.

## Normative requirements

Independent targeted source executions now reproduce seven ungoverned hook
effects, all three broken Git shims after canonical reset, and a controlled
commit-msg failure after removal of its install-time library path. The durable
[diagnostic report](../../../backlog/evidence/2026-09-28-activation-uninstall-targeted-verification.md)
records the actual terminals and limitations. Actual Agy discovery/precedence,
native runner payload delivery and real cache pruning remain unverified.

### R1 — One activation authority, separate from discovery

Every Pipeline hook, nested guard, start/resume skill entry and lifecycle side-effect producer obtains the same read-only, bounded activation observation before its Pipeline behavior. The result identifies a physical repository/worktree scope and an explicit state: `active`, `inactive`, `declined`, or `unverifiable-active`. The final closed schema and writer are frozen in slice S1 before consumers change.

`active` requires actual sanctioned enrollment provenance (or a strictly validated legacy enrollment with a documented migration). Directory names and arbitrary markers do not grant authority. `AGENTS.md`, `CLAUDE.md`, architecture/maps, specs, backlog, handovers, a plugin installation or a path registry are insufficient individually or together. Retained documents are content. A malformed active enrollment is a governed diagnostic, never a blanket disarm. Absence of enrollment must not itself trigger repair, bootstrap, or denial of unrelated work.

Durable `declined` takes precedence over retained generated authority/projections and content. Its record must survive removal/archive of `.git/agent-pipeline`; a per-repository Git-local config record is the proposed storage for Git repositories. Define common-repository versus worktree semantics explicitly; do not let a linked-worktree exit erase another worktree's enrollment or shared hooks. Non-Git decline needs a separate bounded host-local record keyed to independently observed physical root, with no automatic write during ordinary hooks. Neither design may mint identity, keys or consent as a side effect of observation.

The initial hint records an explicit human answer through its sanctioned action. A recorded `no` is persistent; restart/compact does not prompt again. Explicit opt-in reverses decline and follows existing onboarding authority. The writer cannot merely interpret a retained documentation pointer as renewed consent. Proven enrollment migration must preserve current active governance rather than silently relaxing it.

### R2 — Inert means no Pipeline effects

For `inactive`/`declined`: do not block ordinary reads/writes, tools, subagents, Git commits or ordinary pushes; do not inject lifecycle/setup/recovery instructions; do not write scratch lifecycle, budgets, slicing, usage, restart locks, private HGO requests/audit keys or HOME state; do not emit routine stderr noise. This check precedes wrapper input-hardening, role enforcement, consent-write and telemetry code. It must also be reached when a project root is absent or unsupported, without inventing enrollment.

The destructive Git rule set stays effective outside activation. Its denial must not bootstrap a Pipeline audit/key store in a foreign repository. Exactly classify destructive protections separately from process conventions; preserve all applicable force/ref-deletion/destructive protections. Trailers (GIT-03), publication executor, role models, Critic rules, lifecycle and tooling hardening are active-scope behaviors. The opt-in hint is permitted only before a durable decline. Active positive controls prove the new predicate is not a universal bypass.

### R3 — Agy observes and converges the effective topology

Use one bounded read-only topology observer for installer/preflight/refresh. Inventory managed/imported copies, import metadata, global registry, workspace registry, and Pipeline-specific external hook wiring. Report physical path, manifest version, content identity and observation class without exporting unrelated config or credentials. Read/parse ambiguity is `unverifiable`, not `single-current`.

Source fixtures prove parsing/conflicts; isolated actual CLI observations establish supported install/import/uninstall syntax and precedence; a fresh real session independently observes its executed source and guards. Keep those evidence classes separate. No global uninstall, config mutation or HOME experiment is authorized by this preparation. A convergent host-owned refresh plan is derived from observed topology and approved source; unrelated registrations/keys remain unchanged. One effective Pipeline source per chosen scope is the target, but workspace-only support and retirement of a managed/global source require S1–S6 evidence and an explicit concrete remediation plan. Global discovery is not repository opt-in.

### R4 — Unregister removes mechanics while preserving content

Provide a distinct digest-bound `project-uninstall plan|apply` lifecycle, deriving footprint from authority resolution, runtime-projection owned keys, actual hook records and workspace registrations. Do not invoke reset with renamed labels. Default preservation covers all source, docs including edited/unchanged AGENTS and maps, ADRs, specs/design packages, backlog, handovers, evidence and Git history. Any optional deletion of unchanged seeded content requires its own explicit selected plan option; never sweep `docs/`, `specs/`, `.agents/` or a container by name.

Classify exact owned whole-file mechanics, owned keys, preserved content, foreign/modified ownership and never-touched user-scope stores. Strip only proven Pipeline-owned keys and preserve all unrelated bytes. Foreign or modified hooks/keys are reported and left intact; missing ownership is not permission to delete. Account for `core.hooksPath`, linked worktrees and shared private state before admitting apply.

Ordered transaction: verify frozen plan/ownership/affected bytes; remove owned Git shims through their sanctioned remove routes before their implementations; strip owned keys and whole-file runtime mechanics; remove owned workspace bindings/consent; persist decline; archive/remove admissible private mechanics last. The transaction journal and recovery authority survive that last stage. Every fault boundary has resumable readback and no per-step approval chain. The lifecycle authorization applies to this exact plan; it does not authorize unrelated cleanup.

No retained **executable** Pipeline binding may reference a removed implementation. Retained docs may mention the plugin or its prior history. Thus an assertion that *no file contains a plugin path* is incompatible with preservation and must not be the uninstall oracle. Readback instead inventories live hooks, configured executable projections and registry keys. Ordinary Git commit/push, build and project tests remain usable. Re-onboarding preserves retained records and does not regain old plan approval or reuse consumed consent as new authority.

## Architecture alignment

Read `architecture/map/pipeline-core.md` and `governance.md`: runtime enforcement belongs to pipeline-core, policy prose cannot substitute for hooks, and harness owns orchestration. ADR-0063 keeps temporary proposals here and durable citations in tracked evidence; consumer content/layout must be preserved. ADR-0067 keeps all three runners independent and distinguishes interactive enforcement from execution-plane authority. ADR-0062 prevents claimed host execution from synthetic fixtures or fallback metadata. The directory/activation changes do not add a model route, global lifecycle capability, delegation, or release authority. Final implementation may need a narrow ADR addendum for explicit activation and uninstall transaction semantics; this draft does not claim the existing ADRs already authorize arbitrary global cleanup.

## Slices, disjoint ownership and dependencies

Paths below are proposed new surfaces unless already present. Before dispatch, the integrator checks the actual aggregate for collisions. A single owner handles each shared file; workers do not reset others' edits.

| Slice | Exclusive files/responsibility | Dependency and handoff |
| --- | --- | --- |
| S0 — Agy capability/topology evidence | New `scratch/agy-topology-spike-*` controlled disposable fixtures and resulting sanitized evidence proposal; no operator config mutation | Parallel with S1. Establish S1–S6 facts before selecting productive Agy remediation; source contract does not assume precedence. |
| S1 — Activation authority | New `lib/governance-scope.mjs`, its fixtures/tests, proposed `scripts/project-activation.mjs` and tests, activation schema/mirror, sanctioned onboarding enrollment integration in `lib/project-onboarding-v3.mjs` | Freeze read-only API/storage/scope/legacy migration first. Own onboarding shared file exclusively; uninstall writer consumes API, never writes it independently. |
| S2 — Hook consumers and process split | All three runner hook wrappers/start hints, shared lifecycle/role/budget/slicing/resume/native-host guards, `guard-git` and `guard-push`, corresponding hook tests | After S1 API. Own complete hook files to avoid racing existing security repair owners. Merge the full 0.7 proposed postimages before adding early scope checks. Preserve destructive union. |
| S3 — Agy source convergence | New `lib/antigravity-plugin-topology.mjs` and tests; `install-agy.mjs`/tests; `scripts/installed-plugin-attestation-host.mjs`; Agy branch of `pipeline-start-preflight.mjs`/tests; host-owned refresh planner | After S0 facts. Observer may develop from sanitized fixtures in parallel; mutation plan stays held until actual CLI topology is verified. S3 alone edits preflight; S1/S2 supply activation API without touching it. |
| S4 — Content-preserving uninstall | New uninstall lib/CLI/tests; narrow factored footprint derivation from `scripts/project-reset.mjs` with reset parity tests; Git hook installer remove APIs/tests; workspace projection key-removal helper | After S1 contract; S3 provides read-only topology/owned workspace binding removal API. S4 owns Git installers and runtime-projection removal implementation; S1 owns onboarding. Reset behavior cannot silently become uninstall. |
| S5 — Qualification and registration | Wiring-enumerated ungoverned/declined probe suite; uninstall cross-runner transaction suite; harness registration; kernel closure/doc entries; five-source addenda/architecture entry points/setup guides | Receives frozen source manifests from S1–S4. One integrator owns shared harness/kernel/docs surfaces and preserves existing full0.7 registrations. Candidate freeze then source checks and installed-host acceptance separately. |

S0 and S1 can start independently. S2 and S4 run in parallel after S1 interfaces freeze because hook consumers versus lifecycle/installer writers are distinct. S3's observation implementation can proceed independently using fixtures; its productive refresh must await S0. S5 integrates, not overwrite-selects overlapping historic postimages. Existing Advisor, lifecycle-security and release work remain required.

## Acceptance matrix

| Check | Required evidence / rejection |
| --- | --- |
| Activation | Actual sanctioned active enrollment; inactive fresh Git/non-Git; declined across new sessions/compact; alias/root drift and malformed active record; legacy enrolled migration; AGENTS/maps-only and retained-docs-after-uninstall remain inactive/declined. |
| Hook matrix | Enumerate current Claude/Codex/Agy wiring automatically. Ungoverned/declined ordinary tools, Critic-named foreign subagent, inline code, commit without Pipeline trailers and ordinary push have no Pipeline effects. No working-tree/private/HOME writes; no routine diagnostics. Active controls still enforce. |
| Destructive exception | Force/ref deletion and destructive workspace Git protections reject in all scope states. Their rejection does not mint Pipeline private keys/audit files outside enrollment. No exemption permits destructive Git merely because decline exists. |
| Agy topology | Disposable S1–S6 actual CLI facts; parsing/error fixtures; duplicate/stale/import/global/workspace conflicts and foreign-hook preservation; convergent second run; fresh loaded-path/content/version readback. Never promote 0.6.2 report or mutable lock to 0.7 evidence. |
| Uninstall | Onboard each runner, install three owned Git hooks, create/edit content, plan/apply/readback: kept file digests identical, mechanics unregistered, decline survives, ordinary Git local commit/push and project tests work. Reject aliases/drift/foreign ownership without partial destructive cleanup. |
| Crash and shared scope | Fault every journal phase, including after shim removal and before private archive; resume without lost authority. Linked worktree/shared hooks remain untouched when another active worktree depends on them; ambiguous shared removal yields explicit bounded conflict. |
| Upgrade/remove cache | Remove disposable installed-plugin cache after hook install: reproduce B2 or disprove with actual hook readback; chosen version update/removal route keeps Git operational with explicit mechanism. No stale path silently turns a commit into broken Node execution. |
| Re-enrollment | Explicit opt-in clears decline through writer, preserves retained docs/packages/handovers and starts current onboarding; historical approval is not new plan authority. |
| Full candidate | Merge all prior0.7 scope plus these slices; registrations and schema mirrors; focused acceptance, Critic then release Verify, frozen source commit and install handoff. Installed three-runner result belongs to that exact candidate and actual loaded content identity. |

## Concrete unresolved implementation questions

Two further confirmed workflow defects found during this intake remain in the
candidate's existing approval/lifecycle repair scope: the canonical signer
transport rejects the closed DWP request's nested digest
(`pipeline.design-workflow-signing-request-schema-drift`), and a historical
cancellation receipt blocks withdrawal of a different current submission
(`pipeline.historical-plan-cancellation-blocks-current-withdrawal`). A separate
owner prepares the narrow signer and cancellation validators/tests; the shared
state/schema integration remains sequenced. Preserve strict default validation,
single attended signing confirmation and historical audit facts.

1. Prove which current V3/legacy enrollment records distinguish consent from mere seeded authority. Freeze a migration adapter; do not substitute any-marker detection.
2. Freeze Git common/worktree activation and decline storage semantics without cross-worktree deactivation. For non-Git folders choose a host-owned persistent location with identity/alias checks.
3. Run isolated Agy S1–S6 before adopting or retiring any global topology. Source-first detection must work even when stale loaded code cannot diagnose itself.
4. Determine ownership of project enabledPlugins keys and effective hooksPath. A key written by the user without Pipeline provenance is foreign.
5. Verify B2 stale-cache hook dependency and select a concrete upgrade/unregister repair. It is not yet confirmed as an independently reproduced defect.

These are bounded engineering/observation dependencies, not requests for another routine PO gate. The parent retains authority to bind the extended five sources and required signature route. This draft neither extends an existing approved package by assertion nor invents a new Advisor course or human checkpoint.
