# Alfred 0.7.0 local candidate completion plan

Status: execution plan confirmed by PO in chat on 2026-09-19; not candidate
acceptance, signature proof, installation or publication authority.

## Two-stage local candidate handoff

First freeze, sign as required, commit and uniquely stamp a content-complete
source candidate; qualify its source-only checks and give the PO a copy-safe
install command. Only then can the PO install that exact build and the agent
read back installed runner/cache parity and real host behavior. Installed-host
evidence in the checklist below is therefore an **acceptance condition after
installation**, not a prerequisite for creating the very build to install.
One supported runner is enough for a consuming repository. Source contracts
and packaging must cover all three supported runners, but the local candidate
does not require installation, authentication or use of absent runners. A
live claim about a particular runner still requires that runner's own
installed-host evidence; another runner's receipt cannot substitute for it.
Keep each checkbox open until its full stated evidence is present. A stamped
source candidate is installable, not automatically accepted or release-ready;
no missing native observation, Critic, AC or PO gate is waived by this order.
Readiness separates source-build prerequisites from acceptance evidence that
requires the immutable build or its installed host. Unresolved Nova issue AC
dispositions remain visible as final-acceptance waits; they are never promoted
to PASS just to permit the local build.
NVA-A8-5's PO withdrawal is already explicit in the canonical backlog item and
Nova spec/acceptance/matrix, with the binding contract requiring exact
historical item bytes plus ledger event 793. Its active binding still points
at an older backlog snapshot, so a new binding must be regenerated from the
final committed 0.7 source baseline and independently read back. This is a
candidate-bound acceptance artifact, not missing pilot work or a source-build
blocker; it must not claim either discarded pilot ran or passed.

## Source-stage blockers before stamping

This is the source-content subset of the full acceptance checklist below.
Keep a row until its code and contract evidence are reviewed; do not turn a
missing installed-host observation into a source blocker or claim its later
acceptance from a checked source row.

- [x] `native-claude-codex-host-commit` — PO-directed AC-25 source extension.
  An explicitly marked, direct single Claude Task or Codex `spawn_agent`
  dispatch gets a private clean-baseline binding; each runner is correlated
  through its own native lifecycle evidence (Claude Task/PostToolUse and
  resolved model; Codex SubagentStart/SubagentStop association, session and
  model). Only the validated structured return's exact admitted diff is
  committed by the host with ordinary Git hooks; exact commit readback and a
  private local observation precede exclusive v4 record publication. Marked
  unsupported or ambiguous shapes receive no host-commit authority. Seven
  focused files pass 103/103 tests, including temporary real-Git commit and
  hook-denial cases, exact runner correlation, Codex stale-start expiry and a
  full Claude return→commit→private receipt→v4 publication order check.
  Verify registration reports 648 suites, zero exclusions and zero
  unregistered; case-completion reports 206 entries and 201 classified
  suites. This establishes source/contract implementation only: no installed
  Claude/Codex hook observation, provider attestation, signed portable export,
  or final-candidate Critic/Verify acceptance is claimed. The separate generic
  shell-command-flow source item below remains open; AC-25 does not silently
  close it.

- [x] `critic-before-final-verify` — regular final-candidate admission and
  content-bound review reuse, beyond the existing release-only consumer.
  Source contract complete: a consumed Critic binds candidate Verify and
  final-readiness readback; exact registered evidence-only commits can carry
  the review, while a source change cannot. Real-Git producer, lifecycle and
  coordinator fixtures pass. The frozen 0.7 candidate's own Critic/Verify
  chain remains a separate post-freeze acceptance item below.
- [x] `design-advisor-flow` — dispatched initial design, ordinary fresh Advisor
  and independent readiness/final-package approval path. The package reader is
  now wired through `present-plan`, the single `approve-plan` authority write,
  lifecycle projection, and `guard-devplan-policy.mjs` at the implementation
  boundary. It re-reads exact source/evidence bytes, stored signature, feature,
  PRD/Spec and approved package digest after unrelated commits. A new in-process
  lifecycle regression verifies the PO can approve one package containing a
  proposed Advisor-unavailable exception plus independent readiness even when
  the old separate admission callback reports unavailable; it no longer asks
  for an intermediate Advisor approval. Focused DWP, lifecycle, State, inspect
  and implementation-guard suites passed on 2026-09-26; the package/admission
  subset rechecked 21/21 on 2026-09-26. The former ordering
  deadlock and claims that DWP is unwired are obsolete.
  Source-contract progress: `pipeline.design-readiness-receipt.v1` no longer
  admits the caller-authored `freshReadOnly: true` claim. Its closed
  `hostExecution` binding now identifies the selected Codex readiness execution;
  `design-readiness-host-evidence.mjs` independently re-reads the private
  selection, execution receipt and duty-bound journal, verifies candidate,
  source-set and report digests, and rejects missing, changed or out-of-contract
  receipts. The physical package reader requires this verifier before approval;
  after the one final package signature, implementation readback relies on the
  signed immutable package digest instead of demanding a newly signed or
  machine-local receipt after every unrelated commit. Focused DWP and
  `spec-readiness-host` suites pass 20/20 and 3/3, including tests that reject
  the old boolean claim, altered report bytes, a lost journal, inadmissible
  source paths and oversized selected-duty references. The root and plugin
  schema copies are byte-identical.
  Source gap narrowed on 2026-09-27: `codex-design-readiness-host.mjs` now
  provides a production Codex composition that re-reads the five source files,
  derives the candidate-bound V3 readiness route, invokes the fixed app-server
  child through the selected Codex sandbox, and binds the exact report to its
  selected execution receipt. The child rejects tool actions outside the
  read/list/search-only allowlist; the host rejects candidate, source, route,
  or execution drift. The new composition tests pass 3/3; the app-server tests
  pass 3/3 when their offline fake child process is permitted. Together with
  the existing package (20/20) and generic readiness-host tests, this replaces
  the former injected-provider-only source gap.
  The runner-facing production entry is now `codex-design-readiness-bootstrap.mjs`:
  it checks the dispatch gate and V3 export posture, binds five explicitly
  named source files to `git show HEAD:<path>`, derives current commit/tree,
  calls the selected Codex host, rechecks source and candidate after return,
  and publishes the exact host-bound report exclusively at the requested
  receipt path. It prints the receipt digest for the final package reference;
  it does not approve or sign the package. A 2026-09-27 privacy review found
  and fixed a mismatched consent-field read; the bootstrap now honors explicit
  `advisor_export: declined` before onboarding/provider resolution, covered by
  its direct regression. The six-test bootstrap suite passes, including
  consumption of the written receipt by the physical package reader;
  the production app-server protocol fixture passes 3/3 when offline fake
  child processes are permitted. The Codex source workflow is now wired and
  fail-closed. On 2026-09-27, `runner-design-readiness-bootstrap.mjs` added the
  corresponding Claude and Antigravity production compositions. Both bind
  exactly five committed sources, the selected V3 readiness route and
  candidate; recheck candidate and source bytes after return; and publish an
  exclusive receipt backed by a repository-private host-observation record.
  Claude runs with restricted, tool-disabled, plan-mode arguments.
  Antigravity runs in a private temporary cwd with sandbox and plan mode,
  exposes no repository directory, and rejects any reported tool operation
  before publishing. Their five focused adapter tests pass, including local
  host-store readback, declined-export refusal and source-drift refusal. These
  are source/contract checks using fake runner output, not live model
  invocations or provider attestations. Since a user repository may have only
  one runner, all three source routes now exist; the runner actually installed
  in a consuming repo still needs its own later host-observation evidence.
  Installed-host qualification and the final frozen-candidate gate remain
  post-source acceptance evidence, not a claim made by these source tests.
  Test-only fixture keys do not create project authority.
  A focused runtime repair now admits an answered Claude consult fallback
  after recorded native failure and preserves `nativeAvailable: true` in its
  public admission. The host bridge writes a bounded private attempt trail;
  a v2 immutable transaction binds its exact bytes and the readback refuses
  a missing, single-consult or mutated trail. The pure, private-transaction,
  real bridge/temporary-Git and bridge tests pass (8/8, 5/5, 9/9, 19/19).
  Exhausted Claude routes now return a typed pending exception input only
  after physical receipt/trail and package-drift readback, with no public
  admission or implementation authority. The unavailable Advisor path is now
  explicitly represented in the one pending package review; it does not waive
  readiness or the exact final PO approval.
  The existing bootstrap acknowledgement is an earlier PRD/Spec intake
  receipt, not a signature over later Advisor/readiness bytes. The final
  package's exact digest therefore remains bound by the one final package
  approval; the earlier intake continuity is not relabelled as that approval.
  Focused regression recheck on 2026-09-27: all nine DWP/admission/lifecycle/
  authority suites exit green after consistently forwarding the optional
  host-readiness verifier seam through approval-time and pre-commit physical
  package re-reads. Production continues to use its independent default
  verifier; the seam is used only when a caller explicitly injects one.
  The legacy pre-authority-banner test now uses the mini-profile so it tests
  that guard independently of the new complete-package prerequisite for
  feature/epic presentation. This repairs fixture consistency, not installed-
  host evidence or the frozen candidate's own package-approval acceptance.
  Final source-stage recheck, 2026-09-27: all nine DWP/admission/lifecycle/
  authority test files pass, including the previously sandbox-blocked disposable-
  Git integration suites; the Codex host/bootstrap, shared Claude/Antigravity
  bootstrap, private host-evidence and receipt-store test files also pass.
  Verify registration reports 644 registered suites, zero exclusions and zero
  unregistered suites; case-completion reports 206 entries and 201 classified
  suites. Live installed-runner observations and exact-candidate package,
  Critic and Verify acceptance remain open below.
- [x] `alfred-critic-findings` — source repairs for the six original Major
  findings have the focused code/test recheck recorded below. Their final
  independent re-Critic is explicitly a **post-freeze acceptance gate**, not
  a source prerequisite for creating the candidate it must review. This
  checked source row does not close the findings or assert a Critic PASS.
  Recheck on 2026-09-26: the six relevant focused test files pass 227/227
  when child-process fixtures are permitted. In the restricted sandbox,
  three files initially reported red because `spawnSync` returned `EPERM`
  with no child output; the same files passed outside that restriction. This
  does not substitute for the final-candidate review.
- [x] `git03-provenance` — the productive Agy route derives its trailer from
  host-held admitted dispatch context after Final Return; the standalone
  caller-record wrapper is preview-only. Installed-host incident replay stays
  open in the full acceptance checklist below.
- [x] `shell-dispatch-command-flow` — the read-only
  `goldfish-commit-command-flow.mjs` producer now renders separate, bounded,
  exact-path stage and commit commands for POSIX and PowerShell; the shared
  Goldfish template selects the matching shell rendering and forbids manual
  composition and chaining. Its focused 4/4 suite includes guard-grammar
  admission and a real isolated Git commit with exact paths and trailers.
  The productive Agy host retains its separate host-held Git argv transaction
  and postimage checks; `pipeline-commit.mjs` remains preview-only for
  caller-selected records. This closes the generic source-generator gap, not
  installed Claude/Codex runner observation or full candidate acceptance.
  The separately metered fixed/per-tool/retry comparison is not part of
  this 0.7 source gate: the PO directed on 2026-09-27 that broader efficiency
  optimization follows 0.7. Carry it into the next-release measurement work;
  do not claim improvement or publish unverified cost figures meanwhile. The
  historical
  `evidence/c2-dispatch-token-breakdown.md` table names six precise dispatch
  totals without links to the raw per-dispatch usage records or a derivation
  method; the separate C2 operations note repeats the 17.2% figure but does
  not supply those inputs. Treat those numbers as an unverified historical
  estimate, not measured 0.7 efficiency evidence or a user-cost claim.
- [x] `effective-adr-applicability` — task-module applicability and inherited
  decision comparison without promoting ambiguous legacy ADRs to authority.
  The PO chose the full inherited-source route A on 2026-09-27: extend #9's
  owned interface for configured organization/team ADR references and consume
  that validated output in Alfred. Do not narrow AC-19 to local ADRs, invent a
  second resolver in Alfred, or treat an unconfigured source as proof of a
  configured one. The #9 interface, Alfred consumer and focused
  conflict/freshness/availability tests are now wired; the remaining live
  source and runner receipts belong to candidate acceptance after the stamp.
  Initial #9 source-admission slice now exists in
  `organization-architecture-source.mjs`: a bounded organization/team reference
  set is admitted only with an independently supplied trust anchor, a matching
  Ed25519 proof, a current freshness window and valid supersession; focused
  admission tests pass. Its pure resolver distinguishes no configured source,
  missing optional guidance, missing mandatory authority and contradictory
  inherited references. A read-only physical loader now binds source
  descriptors to a PO-signed project registry and reads separately signed
  payloads from the private Git common-directory store; its missing-source,
  tamper and invalid-registry fixtures pass. A new combined project/#9
  projection now binds inherited source revision into the parity digest,
  rejects same-ID project/inherited conflicts, and is read at bootstrap and
  implementation entry. An exact PO-signed project waiver can now name the
  original inherited digest and module; expiry or tamper cannot activate it.
  The focused suites pass. The operator-facing registry CLI prepares an exact
  PO signature request, rejects a changed registry preimage before signing,
  and activates only the verified digest with CAS readback. The human signing
  prompt discloses every source ID, required/optional classification, layer
  and pinned key digest; its temporary-key end-to-end fixture passes. All
  653 Verify suites are registered, with none unregistered. This closes the
  source route, not AC-19 acceptance: semantic incompatibility beyond
  mechanically shared identity, a real configured-source readback in a
  consuming project, fresh independent runner consumption, and semantic Critic
  review remain open. None may be inferred from these source fixtures.
  The PO decided 2026-09-27 that a digest-valid v2 ADR with `status: accepted`
  and explicit sorted module IDs is effective immediately for exactly those
  IDs, after each is validated against the physical OKF map. Proposed v2
  decisions remain inactive, and v1 module ADRs with ambiguous scope remain
  advisory. The implementation and tests now enforce this exact scope; the
  all-project projection does not inherit module-only decisions. A read-only
  task-path CLI resolves the touched module
  from the physically checked OKF map and rejects unowned, ambiguous or
  redirected map paths. Focused source projection checks pass 11/11. The PO's
  2026-09-26 map-first decision added one physically checked `governance`
  module and an exact-digest v2 sidecar for ADR-0009. Its 14 governed paths
  map to `governance`, `harness` or `pipeline-core`; the live reader reports
  the accepted applicability as active only for its named, physically mapped
  modules. No independent two-runner
  comparison is claimed. The implementation-entry reader now projects the
  plan's owned paths to their OKF modules and exposes per-module effective
  ADR status and unresolved paths as read-only evidence. Historical ambiguity
  and an approved adoption deferral do not turn this diagnostic into a
  lifecycle refusal; this is not yet proof of native-session consumption.
  The sanctioned `set-phase --phase implementation` now displays that compact
  per-module decision readback after a successful transition. Its real State
  suite passes with the new output assertion; no automatic acceptance of
  unresolved historical ADRs is implied. A 2026-09-26 follow-up fixed the
  all-area `project` projection used by `compileDecisionSummary`: it does not
  invent a `project` map module or treat that special view as
  `module-area-unresolved`. The read-only compile keeps ADR-0009 in the
  historical inventory, preserves its explicit `moduleIds`, and excludes the
  module-only decision from the all-project effective set. No separate v2
  activation contract is required under the PO's 2026-09-27 decision. Fresh
  focused checks cover module-only inclusion/exclusion, proposed status, CLI
  path resolution and compiled inventory; these are source fixtures, not
  independent native-session parity. A 2026-09-27 regression hardens
  `compareEffectiveArchitectureDecisions`: it
  validates the closed projection envelope and recomputes the digest over
  decisions, findings and active exceptions before comparing. A changed
  decision with a stale digest is unresolved; a valid changed exception
  projection yields typed divergence. The focused file passes. This protects
  the comparator's input integrity; it does not create session receipts or
  count as the required fresh cross-runner parity evidence.
- [x] `design-readiness-runner-adapters` — one supported runner must be enough
  for a consuming repository, so the independent readiness producer and its
  host-execution verifier need production routes for Codex, Claude and
  Antigravity. The Codex runner-bound composition and generic private host
  verifier are in place; Claude and Antigravity now use the shared exact-source
  bootstrap, model-output validator and repository-private host receipt store.
  Their focused source/contract suite passes 5/5; existing Codex-bootstrap,
  host-evidence and host-store suites pass 6/6, 3/3 and 4/4. Verify registers
  the new adapter suite, and both suite-registration and case-completion audits
  pass (644 registered suites; 206 registry entries). The product capability
  inventory names the new implementation and test surfaces, but its committed
  `sourceBaseline` predates multiple already-registered working-tree suites;
  baseline refresh remains a pre-stamp check after a committed source
  candidate. No native Claude or Antigravity model was invoked here:
  installed/live observations remain post-install evidence, not a source-build
  prerequisite or a claim of provider attestation. Keep the one-package/one-
  final-approval contract and do not turn an unavailable optional model or
  Advisor into an implementation deadlock; independent readiness remains
  required before that package can receive implementation authority.
- [x] `model-role-dispatch-coverage` — consume admitted session roles at all
  supported productive model-bearing dispatch boundaries; one installed
  runner must suffice for a user repository. The current runner-scoped
  bootstrap/store/selector contract suite previously passed 45/45; the
  selector's new Claude-only and Antigravity-only dispatch case passes 6/6,
  alongside the existing Antigravity-only host-session case. This proves the
  one-runner contract, not
  yet every productive Claude/Codex/Agy packet producer. The shared
  fresh-session Critic path now seals an admitted exact model and its private
  readback/receipt binding before launch; focused packet and finalizer tests
  pass, including fallback to the valid V3 route when optional selection is
  unavailable. The fresh-session Critic and Codex host now also fall back on
  throwing, malformed or mismatched optional selection (14/14 and 135/135
  focused checks); a defective V3 source itself remains an authority error.
  This does not yet establish every direct packet producer or
  installed-host behavior. The 2026-09-26
  case-completion audit also found that nine new suites used shorthand
  registration the static checker rejected and that the bootstrap suite had
  grown to ten cases while Verify expected nine. The registration shape,
  ordering and ten-case bound are corrected; both registration checks and
  the 14-case registry metatest pass. This repairs Verify's case-completion
  wiring, not the still-open productive dispatch coverage.
  Focused recheck on 2026-09-26: ten model-role policy, dispatch, identity,
  observation, host-store/session, V3-baseline, bootstrap, selector and Critic
  route suites pass 52/52, including the 39/39 internal session corpus. That
  run caught and corrected a stale route-count assertion: the explicit
  Claude Advisor consult-fallback is a forty-sixth registered task route,
  alongside 18 profile-phase/runner cells and 27 duty/runner cells. This
  verifies the route inventory fixture only; it does not close productive
  dispatch coverage.
  A source fallback defect found during the 2026-09-26 recheck is corrected:
  every `legacy-v3` selection now returns the exact validated V3
  `selector`/`effort` pair, rather than an empty model result that could leave
  the dispatcher to inherit or guess. The focused regression iterates every
  registered task route across all three runners, verifies exact fallback
  parity for each available V3 cell, and keeps a V3-unavailable route
  dispatch-local. All 10 model-role suites passed in the focused rerun;
  selector's seven registered cases are green. This closes the
  ambiguous-fallback-output defect, not the remaining productive packet
  producer binding or installed-host evidence.
  Producer readback on 2026-09-26: `session-critic-finalizer.mjs` now builds
  the selected Codex/Claude Critic route before packet sealing and binds the
  host readback/receipt digests into the private packet. Its selected-model
  and valid-V3-fallback cases pass 14/14 focused finalizer checks; the packet
  suite passes 10/10. The Codex-specific host separately has
  `applyCriticSessionModelRoute()` with a selection/readback-derived source
  digest. The host-managed Codex Advisor now also selects a qualified exact
  model before its child route, with a valid V3 fallback (19/19 focused
  checks). The fresh-session Critic finalizer now checks the exact model
  bound in its prelaunch packet rather than the superseded V3 selector; the
  real-Git Codex/Claude admission-to-finalization cases pass without reselection and
  rejects changed effort. The Claude ordinary Advisor now consumes its selected
  route end to end: after validating the incoming demand, the host reconstructs
  it as closed `pipeline.advisory-demand.v3` only when the private current-session
  selector returns the exact registered `duty.advisory.fallback` Frontier
  mapping. The v3 demand binds model, effort, host readback and selected-receipt
  digests but omits the private session ID. The coordinator checks that binding
  against the same host selection before any adapter, uses it only for the fresh
  consult after native failure, and carries its digest into the sanitized v1
  receipt. Native Claude's V3 Opus / `not-applicable` route is unchanged. A
  missing, throwing, malformed or legacy optional selection reconstructs V2
  demand and retains the exact registered V3 consult route. Lifecycle,
  coordinator, receipt and real-Git host-bridge regressions were rerun together
  on 2026-09-26: 47/47 pass, including selected Frontier fallback, exact
  demand/readback binding, unchanged V3 fallback when optional selection is
  missing, receipt redaction, and real-Git host publication. This closes this
  one Advisor producer, not the remaining direct packet producers or
  installed-host evidence.
  The direct selected Codex high-risk Critic host now resolves its valid V3
  duty plus optional current-session selection through a shared bound route;
  its source digest changes with the admitted readback/receipt and the bridge
  checks the route again before returning. The new route regressions pass,
  and the existing Codex host suite rechecked 135/135 on 2026-09-26.
  The native Codex host now validates its prebuilt packet against the same
  session-bound resolver; the 135 Codex-host plus eight native preflight
  regressions rechecked 143/143. A native packet producer that runs outside
  this checkout must still construct its selection with that exact route;
  no positive installed-host receipt is claimed. This does not prove every
  direct packet producer or installed-host use.
  The legacy E3 Agy fixture wrapper no longer requires an optional model-role
  receipt when its caller-supplied model and effort exactly match a valid,
  available V3 base duty cell. Both implementation agent types use the
  governed `duty.implement` base; the optional mechanic-specific role cannot
  revoke that fallback. An unapproved model or damaged V3 registry still
  refuses before probing; the focused E3 host suite passes 15/15. This is
  source fallback coverage, not productive E3 admission or installed proof.
  The lower-level Agy session dispatch now makes the same distinction when
  an optional role store is supplied: missing/corrupt optional selection may
  use only the exact available V3 implementation cell and still requires matching
  consent; an unapproved model or damaged V3 registry fails before launch.
  Its focused suite passes 5/5. The productive Elephant host already chose
  the V3 route before reaching this library, so this closes a direct-API
  inconsistency without inventing a new route authority.
  Other direct packet producers still need binding and installed-host proof.
  Recheck on 2026-09-27: the ten model-role authority/bootstrap/selector suites
  pass 10/10. The focused producer-integration set also passes 182/182 across
  `agy-session-dispatch`, `advisory-host-bridge`, `session-critic-finalizer`,
  `codex-critic-host`, `critic-claude-host` and
  `elephant-agy-implementation-dispatch`. The integration run required
  permission to launch its disposable local Git fixtures; it contacted no
  model provider. These results strengthen the exercised producer paths but
  do not establish that every direct packet producer consumes the selected
  role, nor do they replace installed-host evidence. Keep the source gate
  open until the remaining producer inventory is reconciled.
  This is a concrete remaining source/evidence gap, not an absent-runner
  installation requirement.
  Checkout correction, 2026-09-27: the direct Claude Critic packet consumer
  now derives the required normal/high-risk duty from its classified trigger,
  validates the registered Claude V3 fallback, and accepts an optional selected
  model only when the current Claude session ID, sealed packet model/effort,
  preflight digest, role, and host readback/receipt digests all agree. An
  unavailable or throwing optional selector may use only the exact V3 selector
  and effort; a stale selected packet fails before its smoke probe or export.
  The export boundary now admits the closed session-binding shape while keeping
  session IDs and role-readback digests out of the external export view. Its
  mutation regressions reject route, trigger, effort, and preflight drift.
  Focused checks: Claude host 20/20, export-policy 22/22, and the adjacent
  packet/finalizer/export suites 46/46. This closes that Claude consumer path,
  not all direct producers or installed-host qualification.
  PO direction, 2026-09-26: Claude native Advisor retains its
  `not-applicable` effort; its fresh consult fallback receives a separate
  bootstrap-confirmed functional Advisor route, with the exact valid V3
  fallback when optional selection is absent. The model-role route source
  now inventories that separate Claude consult-fallback cell and the
  read-only selector resolves it independently; focused selector/host-session/
  observation suites pass. This is wired through session readback, a v3 demand
  binding, the consult child and the v1 receipt, with an explicit mismatch
  refusal. Focused tests cover both the selected route and the optional-selection
  fallback; remaining model-role coverage elsewhere and installed-host
  qualification are still open.
- Final source-inventory correction, 2026-09-27: the earlier "remaining
  producers" notes above are chronological snapshots and are superseded by the
  current call-site audit. The production consumers now include the shared
  Codex/Claude fresh-session Critic finalizer, Codex selected and native Critic
  hosts, Claude Critic host, Codex/Claude Advisor bridge, Antigravity Goldfish
  host, and admitted Agy implementation dispatch. Each resolves an exact
  selected current-session route before sealing or launching and retains only
  its validated V3 fallback when optional selection is unavailable; the shared
  selector covers a consuming checkout with any one of the three runners. The
  lower-level `codex-critic-packet-host` name found during inventory has no
  production caller in this package and is not an independent dispatch entry.
  The ten model-role authority/bootstrap/selector suites pass 10/10 in the
  2026-09-27 recheck. The producer-integration recheck previously passed
  182/182 on 2026-09-27; a repeat in this sandbox hit `spawnSync git EPERM`
  in real-Git fixtures and was not counted as a pass. This closes the source
  inventory for model-role dispatch. Post-stamp installed-session readback,
  user mapping acknowledgement, and live model observations remain open in the
  acceptance checklist below; they are not a source-coverage gap.
- B8-focused source recheck, 2026-09-27: the serial lifecycle, protected-test-
  path, pipeline-start preflight, installed-plugin attestation, settings merge,
  and Antigravity admission/adapter suites now exit 0 together. The first run
  exposed stale rebase test helpers that constructed an `epic` plan but omitted
  its now-required design-workflow package; the rebase-only fixtures now use
  the package-free `mini` profile. No production admission rule was weakened.
  This is source/fixture evidence only; fresh installed-host observations and
  the broader B8 acceptance matrix remain separately open.
- [x] `alfred-ac-source-review` — inspect all 28 Alfred AC/incident criteria
  against the current implementation and retain any unresolved source gap.
  The 2026-09-26 criterion-by-criterion audit at
  `scratch/0.7-alfred-ac-source-audit-20260926.md` contains all 24 AC and 4 IR
  rows; its structural checker reports no duplicate/missing/malformed IDs or
  unnamed evidence. This completes the source-inventory task only: it does not
  close any criterion or waive the acceptance evidence explicitly listed in
  the audit. The audit found source/spec questions
  that cannot be erased by a green backlog projection: AC-11/B2-ii now has
  its own TP-13 protected class and a candidate/history append-only check,
  with a focused real-Git regression, but the signed block ceremony and final
  candidate readback are still unproven; AC-12's former "only Triage" wording
  has been corrected in the Spec and acceptance row to the later tested rule:
  strip Triage and independently identified stale verdict/closure prose while
  preserving genuine later requirements and decisions. The focused strip
  regressions still need final-candidate qualification. AC-11/B2-i additionally had a real signature-mode chat-grant
  bypass in the checkout; the writer and stored-record reader now enforce the
  committed approval mode and cryptographic proof readback, with focused
  positive/negative regressions. These changes still need final candidate
  qualification and any required protected-source approval.
  IR-4's historical "read-only retry" wording was also stale: the later
  accepted fix directly admits a bounded recognized read-only probe and keeps
  unresolved interpreter writes denied. PRD §3/§7, the acceptance criterion,
  and the intake disposition now state that actual contract; the walkthrough
  no longer calls the wording an unresolved gap. `guard-lifecycle-ready.test.mjs`
  passes 256/256 and `check-doc-contracts.mjs` passes after this correction.
  This is source/test alignment only; exact frozen-candidate Verify/Critic
  evidence remains open.
  Historical D1 evidence is not sufficient for AC-19 or AC-20: its AC-19 row
  compares significance-axis outputs rather than effective decision and
  exception sets across two fresh runners; its AC-20 row validates ADR
  schema/digest/status, which cannot establish that an independent Critic
  detected a semantically false ADR. Preserve the historical artifact as
  evidence of what was run, but do not upgrade either criterion from it.
- [x] `ac2-mutation-route-coverage` — source inventory is explicit and tested,
  without claiming AC-2 acceptance. `policies/control-placement.v1.json`
  identifies MultiEdit, script-mediated writes and runtime path aliases as
  typed residual gaps for the affected guards; `control-placement.test.mjs`
  asserts those exact classifications. These disclosures are not enforcement:
  MultiEdit has no matcher, arbitrary child-script writes and runtime path
  aliases are not sandboxed by the static shell classifier. Do not silently
  treat any of them as covered. AC-2 remains open until its actual supported
  mutation-route acceptance evidence is satisfied; native A1 evidence for the
  PO's release runner is a separate post-install acceptance requirement, not
  a prerequisite for creating this source candidate.

## Required before the next local candidate

- [ ] Regular Critic-before-Full-Verify admission and content-bound review reuse;
  substantive changes require scoped review, deterministic reruns alone do not.
  Source audit, 2026-09-26: `critic-lifecycle-admission.test.mjs` passes 8/8
  for fresh content-bound Critic, changed-diff re-review and unchanged-content
  behavior. The production release-mode `verify-evidence-producer.mjs` has a
  Critic packet or bound reverify-receipt preflight. The same preflight now
  runs for an explicitly Critic-bound full `candidate` Verify before old
  evidence is replaced; its same-mode rerun is lifecycle-bound. The focused
  producer suite passes 33/33 in temporary Git fixtures. An unbound candidate
  run remains diagnostic to avoid recreating the Critic/Verify deadlock. The
  feature-close consumer now rederives its private lifecycle identity and
  independently re-reads the consumed Critic packet, rejecting forged
  lifecycle fields before a bundle or State transition. Its real temporary-Git
  coordinator/State/Audit integration fixture passes 8/8, including that
  negative case. The installed read-only `check-critic-bound-verify.mjs`
  consumer and the local 0.7 readiness report now distinguish an exact green
  producer receipt from final qualification: they revalidate the private
  consumed-Critic lifecycle binding and leave an unbound diagnostic Verify
  open. The focused lifecycle suite passes 7/7 and the local readiness
  regressions pass 14/14 on 2026-09-26. The candidate Verify producer can
  now carry a consumed Critic over an exact registered-evidence-only Git
  range. It records a v2 private lifecycle receipt, and its consumers
  independently rederive the range before final readiness or feature close.
  A real-Git producer fixture passes the evidence-only case and rejects a
  subsequent source change. This end-to-end readback also exposed and fixed
  a consumer field mismatch: public Verify emits `verifyRun.status`, not
  `verifyRun.terminalStatus`; the previous checker rejected even a valid
  green candidate. A clean frozen 0.7 candidate and its complete
  final gate chain remain unproven, so this item stays open.
- [ ] Truthful no-delivery dispatch completion preserving incident review.
  Checkout correction, 2026-09-25: the Agy live host no longer publishes a
  completed-undelivered record for an already delivered Final Return whose
  consent, result readback or diff admission later fails. It holds that case
  for recovery. A genuine completed-undelivered publication first checks the
  physical Git HEAD against the captured pre-launch commit. The delivered
  failed/blocked Final Return is re-read from the exact host result bytes with
  its outcome bound before being held for recovery. The focused host
  and admission suites pass 10/10, including failed-Final, revoked-consent and
  changed-HEAD negative cases. The authored post-commit Finalizer and its
  independent local readback are covered by AFR15's real temporary-Git,
  signed-test-consent integration fixture (AFR 15/15). The source candidate
  now writes a distinct Critic-required v4 `stopped-without-commit` host
  observation for an interrupted launch with no Final Return, after an
  unchanged-HEAD check; a contradictory final or changed HEAD stays in
  recovery. The PO approved that distinct interruption record in chat on
  2026-09-25. Installed, provider-backed end-to-end observation and a real
  candidate-bound incident/Critic resolution remain missing, so this item
  stays open.
- [ ] Plugin bootstrap projection and exact recovery-plan fixes integrated;
  version updates do not repeatedly require manual per-version permission repair.
  Checkout correction, 2026-09-25: `pipeline.user.v3` can now carry the
  SHA-256 of the Core routing registry. Newly migrated V2 sources receive it;
  this checkout has it. A source carrying an unknown registry binding is not
  eligible for the V3 compatibility refresh. The older installed Codex copy
  was exercised with a read-only inspect against this checkout and returned
  `invalid-source`, rather than proposing its older model routes. The current
  source migrator passes 53/53 cases, including the non-downgrade regression.
  This does not yet prove automatic, consent-bound Claude permission-family
  carryforward or installed bootstrap parity, so the full item remains open.
  The settings merge's exact-family classifier and digest-bound apply now
  expose an automatic carryforward only for a complete prior permission
  family under the same installed cache lineage, with matching installed
  Claude manifest version and regular-file SHA-256 readback of the manifest,
  driver and merge script bound into the plan. A changed manifest invalidates
  the approved plan digest. The onboarding observation selects that narrow
  action without another per-version ask; a source checkout, partial family
  or missing/mismatched installed readback never gets automatic authority.
  The generic `onboarding-init` driver continues following published commands
  after earlier human answers; a blanket `requiresConfirmation` stop was
  tested and correctly rejected because it deadlocked normal onboarding.
  Installed-host re-entry still needs readback after the PO installs the
  eventual stamped build, so the full item remains open.
- [ ] Nova guard-order correction: parallel `apply_patch` guard results retain
  patch-input order despite asynchronous completion, so the resulting denial
  and HGO binding are repeatable. Prove the installed candidate cache contains
  the indexed assignment and run the Nova regression after the one shared
  candidate installation; do not ship it as a separate interim package.
  Source-level regression rechecked 2026-09-25: `guard-apply-patch.test.mjs`
  completed 17/17, including mixed parallel/serial denial order. Installed
  candidate-cache parity remains unproven, so this item stays open.
- [ ] Chat mode consistency from policy/migration through driver, approval,
  GG-03, push guard and applicable release/deploy gates. Preserve exact authority
  bindings and signature-mode negative coverage.
  Checkout progress, 2026-09-25: V3 registry refresh now preserves explicit
  chat/signature approval modes and the external-ledger setting through its
  V2-only render kernel (new RPM04 regression; migration 52/52 and projector
  31/31). Focused critical-action chat, release-preflight (50/50) and push/deploy
  guard (179/179) suites pass. These do not yet establish one end-to-end
  candidate-bound approval, GG-03 and deploy/release transaction, so the full
  item remains open.
- [ ] HA Verify remedies, failure diagnostics and confirmed BOM issue repaired;
  other reported HA defects investigated and resolved with explicit evidence.
  PO disposition, 2026-09-25: the two historical diagnosis reports are not in
  this checkout or its reachable history. Do not repeatedly request them.
  The PO will re-test in the HA consumer repository later against the then-
  current plugin path. This is a deferred *operational proof*, not a technical
  PASS, fabricated repair, or reason to prevent a content-complete local
  source candidate. Retain the open result until that actual HA observation.
- [ ] Initial dispatched design, ordinary fresh Advisor across runners (Claude
  native preferred), Elephant disposition, independent readiness, and one final
  package approval. Technically enforced; scoped PO Advisor-failure exception
  cannot waive readiness or final approval. Source progress on 2026-09-27:
  Codex now has a bounded production readiness bootstrap which binds the five
  exact Git-committed design sources, dispatch-time candidate and selected
  sandbox execution, then exclusively publishes and reads back a
  host-bound `pipeline.design-readiness-receipt.v1`. The physical package
  reader consumes that receipt and includes its complete bounded report in the
  single PO review projection without granting implementation authority. The
  focused readiness/Advisor/package chain passed 35/35, and all 641 Verify
  suites remain registered with zero exclusions/unregistered cases. This is a
  source completion for the Codex readiness producer only: there is not yet a
  corresponding production readiness producer and host-proof verifier for a
  Claude-only or Antigravity-only repo, nor an attended installed-host run,
  final package presentation, PO package signature, or implementation
  transition readback. Therefore the one-runner product path and this entire
  lifecycle item remain open; do not represent the Codex fixture as a live
  review or final approval.
- [ ] Original Alfred Critic findings closed with independent evidence, including
  durable adoption authority and real accepted-profile/module drift comparison.
  Source recheck, 2026-09-26, against the six Major findings recorded in
  `evidence/po-decision-queue.md` for ALF-CODE-CRITIC-1:

  | Finding | Current source and focused result | Remaining claim boundary |
  |---|---|---|
  | 1. Plugin-only protected baseline | The schema is resolved inside the shipped plugin; the plugin-only and missing-schema fail-closed tests pass in `protected-baseline.test.mjs` (9/9). `check-protected-delta.mjs` now reports `unavailable`, not a misleading `pass`, when that baseline cannot be read (focused 3/3). | No installed final-candidate readback or independent re-Critic yet. |
  | 2. Briefed-test grant binding | `human-guard-override.mjs` binds the canonical exact target and briefing digest, enforces the committed approval mode, and revalidates signed proof on stored-record read; focused WP-B2-1 cases pass 6/6. | No current-candidate independent re-Critic yet. |
  | 3. Adoption human authority | `architecture-adoption-authority.mjs` verifies the current chat/signature ceremony and durable readback, with anti-forgery and plugin-only CLI fixtures (33/33). | The actual deferred/approved decision remains a separate authority fact; no independent re-Critic yet. |
  | 4. Unavailable calibration/fitness | Fitness class 10 returns `unavailable` without measured calibration; aggregate fitness does not convert unavailable to pass, while real findings remain blocking (architecture-fitness 47/47). | A live calibrated PASS is not claimed. |
  | 5. Accepted profile/module drift | Fitness class 9 compares the current profile, routing and map digests to the accepted adoption snapshot, rather than relying on the optional caller boolean (same 47/47 suite). | A changed accepted snapshot still needs its own authorized disposition. |
  | 6. Staging banners outside staging | Both submit-plan and approve-plan reject pre-authority banners even on canonical paths (`plan-authority-staging-guard.test.mjs` 11/11). | No final-candidate independent re-Critic yet. |

  This is a source/test recheck, **not** a replacement for the failed partial
  Critic verdict or its missing exact report files. The historical queue names
  157 incompletely reviewed source targets and 161 deferred paths. Keep this
  row open until a fresh scoped independent review and candidate binding
  resolve that coverage honestly.
- [ ] Greenfield architecture integration: missing physical maps must be detected
  before implementation authority across Claude, Codex and Antigravity entry
  paths. Distinguish proposed adoption, authorized disposition and materialized,
  validated maps. Cover fresh repositories and resumed/brownfield sessions;
  never infer map existence or compliance from an AGENTS.md pointer.
  Greenfield bootstrap must materialize the initial map index before publishing
  its entry pointer, then derive planned module concepts from the actual initial
  design. Mark unknown/planned coverage honestly; scaffolding is not adoption
  approval or evidence that implementation conforms. Never overwrite Brownfield
  maps or treat an existing repository as empty just because maps are absent.
  Explicit Brownfield acceptance: ordinary fresh-start AND resume flows must
  actually surface a scoped migration proposal when required, not merely expose
  a status command. Valid prior decisions do not cause repeated prompts; expired
  deferrals surface again. Exercise Claude, Codex and Antigravity routes.
  Current checkout check, 2026-09-25: architecture-adoption fixtures pass
  33/33 and architecture-fitness passes 46/46, including the former
  staged-proposal regression. A missing physical map now offers the read-only
  map-first proposal even with a valid existing disposition; that proposal
  omits repeat decision options. The shared preflight regression exercises
  fresh and resume entry for Claude, Codex and Antigravity with both absent
  and valid-deferred decisions, without turning map absence into a bootstrap
  failure. The implementation transition now also has a regression using the
  real planning fitness evaluator: a valid deferral plus missing physical map
  produces `missing-navigation-index` and the guard refuses implementation
  authority; the complete lifecycle-guard suite passes 254/254. These are
  mocked runner entry envelopes and a local guard fixture, not installed-host
  observations. The first consuming repository needs a real observation for
  its installed runner; absent runners are not a local-candidate gate. The
  broader cross-runner claim remains open until separately evidenced.
- [x] README instructions for architecture adoption/map creation and auditor
  handoff, tested against shipped CLI interfaces in an installed-plugin fixture.
  Explain triggers, prerequisites and authority modes; distinguish bundle byte
  integrity, separately verified signature, source provenance, actual deployment
  evidence and regulatory compliance. No unsupported assurance claims.
- [x] Audit Bundle usability: document `audit-bundles/<bundle-id>/` instead of
  the opaque `dist/` example, preserving explicit caller-selected output paths.
  Generate a short auditor README inside each new bundle: contents, candidate,
  prerequisites, portable offline verification commands, expected outcomes and
  limits. Bind generated guidance to integrity verification; avoid local author
  machine paths or unsupported claims of self-contained verifier availability.
- [x] Obsolete fixed 14-day requirements reconciled with the existing PO decision;
  evidence quality remains required.
- [ ] Codex Elephant / Antigravity dispatcher path completed and practically
  verified; do not substitute fixture-only proof for live capability.
  Checkout correction, 2026-09-25: the sealed outer dispatcher now rejects
  terminal host claims with absent, fractional or non-finite model-call counts,
  not only literal zero. Its focused suite and the adjacent real temporary
  session fixture pass; neither proves an installed provider-backed dispatch,
  so the item remains open.
- [ ] Greenfield AGY close orchestration: one `finish-feature` entry point over
  existing result/bootstrap/close/transition/feature-close operations. Preserve
  every prerequisite and approval; no implicit PO approval from `--by`. Validate
  inputs before mutation, report partial progress honestly, and resume safely
  without duplicate audit entries or falsely closing a blocked feature.
  Integrate automatic candidate-bound audit bundle creation/verification before
  reporting full close completion, with a durable receipt and non-overwriting
  `audit-bundles/<feature-id>/<commit>/` location. No extra normal-case PO gate;
  optional signing and external backup/publication remain separate operations.
  Checkout progress, 2026-09-25: `finish-feature.mjs` already drives the
  coordinator's planned CAS transitions and its automatic audit-bundle build.
  It now also resolves a lost final process response by read-only comparison
  of the closed State's coordinator and audit references with the durable
  coordinator, without repeating `close-feature`. A wrong actor, lifecycle,
  revision or audit receipt is refused. The focused driver, coordinator and
  audit preflight/executor suites pass 55/55 with local Git fixtures. A
  separate real coordinator/State/Audit-Bundle integration fixture passes
  7/7, including lost-response recovery with no duplicate State or bundle
  writes. An installed Antigravity-host observation and final-candidate close
  receipt remain open, so the checklist item stays open.
- [ ] Greenfield AGY commit formatting: reproduce reported GIT-03 failures and
  provide a structured commit entry point reusing canonical message/trailer
  rules. Derive Dispatch from actual runtime context, never invent attribution;
  preserve staged-only scope and all hooks. Test multiline messages, quoting,
  invalid inputs and hook rejection; no implicit staging or `--no-verify`.
  The 2026-09-25 standalone wrapper checked post-hook parent, tree, paths and
  message, but its 11/11 green tests did not prove that its caller-selected
  opening record belonged to the live dispatch. It also occupied the later
  exclusive v4 target. That executable path is therefore not acceptance
  evidence for the productive route.
  Source correction, 2026-09-26: the productive Agy path now holds the admitted
  dispatch identity in its host process through validated Final Return,
  normal-hook commit readback and first/exclusive v4 publication. The separate
  standalone `pipeline-commit` wrapper could not prove that a caller-selected
  record represented the live dispatch; its `--execute` path now fails closed
  with `PC-HOST-CONTEXT` while preserving a non-authorizing message preview.
  The current preview-only library/CLI suites pass 9/9. A two-valid-record
  same-HEAD regression and a wrong-dispatch host-finalizer regression pass,
  alongside 29/29 Agy final-return/commit tests. The original
  greenfield host incident still needs an installed-runner reproduction or
  explicit source-to-incident disposition before this row can be accepted.
- [ ] Shell/dispatch economics followup: reduce avoidable `&&`/commit formatting
  retries through safe generated commands and bounded orchestration; no blanket
  shell grammar relaxation. Explain coherent feature scope versus independently
  bounded parallel dispatches and existing risk-limited collection-block batching
  in user-facing guidance. Measure fixed, per-tool and retry costs separately;
  do not claim constant overhead or unmeasured token/time savings.
  The Agy host-commit route is already a bounded, exact-argv sequence with
  normal hooks and post-commit readback (19/19 focused admission/execution
  tests on 2026-09-26). The remaining generated-command question concerns
  the non-Agy Goldfish routes; the standalone caller-selected-record wrapper
  must remain preview-only because it cannot prove live dispatch identity.
  E1 preflight integration, 2026-09-25: the common runner dispatch boundary
  now returns all independent static and input/destination findings before
  launch, while preserving the original first error code. Required path
  failures name only `requiredPaths[index]`, not repository-local private
  names. The direct policy corpus passes 38/38 and six adjacent Agy/Codex/
  Claude host suites pass 179/179 with zero model starts on rejection; the
  Verify case-completion registration now expects 38; its pinned aggregate
  counts are reconciled and the metatest passes 21/21. This removes a class
  of avoidable retry-and-model-start cycles but does not measure cost savings
  or close the separate `&&`/commit-formatting work.
- [ ] Greenfield onboarding defaults: collect identity, approval mode and
  language in one validated review/confirmation step. Read effective Git
  identity as a proposed default with provenance; do not mutate global config,
  infer approval-mode consent or activate unconfirmed defaults. Cover absent,
  partial and conflicting configuration across runners and resume paths.
  Checkout correction, 2026-09-25: the initial review now reports Git author
  environment values before `author.*` and `user.*` configuration, with the
  `EMAIL` fallback, matching Git's author precedence. A proposed value still
  does not count as PO consent. The affected real onboarding shard passes
  45/45, including a new precedence regression. Full three-runner installed
  observations and final candidate binding remain open.
- [ ] Complete content review coverage, documentation review, full Verify and
  Security qualification at the final local candidate.
- [ ] AC-7/B1 rigor-floor evidence: retain the Spec §5.1 report-only rollout
  and an inspectable selected-versus-derived disagreement record. The PO's
  2026-09-25 decision forbids a standalone B1 transition deadlock; the guard
  now emits a warning for under-selection or unknown actual Git surface.
  Promotion to enforcing still requires measured C1 calibration and a later
  PO decision. The focused transition fixture passes, but Verify evidence
  projection and full candidate qualification remain open.
- [ ] AC-19 effective ADR continuity: the source projection now reports
  historical ADRs without safe machine-readable applicability as `advisory`
  rather than blocking implementation or guessing scope, per the PO's
  2026-09-25 decision. Invalid governed records still block. The focused
  decision-projection suite passes and this checkout's readback is advisory.
  The shared bootstrap now exposes its compact project-wide digest/status for
  Claude, Codex and Antigravity without turning the warning into a session
  gate; the 71/71 preflight suite covers equal readback and malformed-source
  rejection. The map resolver now normalizes absolute paths against the
  consuming repository and refuses equally specific or partly unbound owners
  (architecture fitness/design consumers 53/53). The v2 module-sidecar source
  contract has validated OKF IDs and focused projection regressions. PO
  option A on 2026-09-26 added a narrow fifth `governance` module and
  drafted one v2 sidecar for historically accepted ADR-0009. All 14 paths
  in that ADR's `Governs:` line now resolve to exactly one of `governance`,
  `harness` and `pipeline-core`; its accepted, digest-valid v2 sidecar is
  effective for exactly those module IDs under the PO's later direct-effect
  decision, without granting historical unscoped ADRs module authority. The
  live module/overview suite passes
  27/27 outside the restricted child-process sandbox. A focused architecture
  recheck on 2026-09-27 passed 98/98 across map/design, effective-decision,
  entry-readiness, baseline, and fitness suites. Its AC-19 test explicitly
  labels two isolated reads of the same source as a precondition, not the
  required two-runner parity fixture. A new integration regression now invokes
  the real project-ADR reader through fresh Claude, Codex and Antigravity
  bootstrap selections against one physical decision estate; the 71/71
  preflight suite passes and all three produce the same validated projection
  digest/status/counts. This closes that source-integration gap, not AC-19's
  operational criterion: installed native-session consumption and a readback
  from two genuinely separate supported-runner sessions remain open, so AC-19
  is not marked complete from fixture execution alone. Live source readback on
  2026-09-27 is `advisory` for `governance`: ADR-0009 is effective only for
  its three explicit module IDs; 84 numbered ADR Markdown files exist, and
  historical files without sidecars remain visible warnings. Two proposed
  draft sidecar digests were refreshed after their Markdown changed, removing
  a transient `blocked` source drift without promoting either draft.
- [ ] AC-20 semantic ADR conformance: the historical D1 fixture proves
  structural ADR validation, not a Critic's detection of a token decision
  that disagrees with implementation. The current
  `fixtures/ac20-token-adr/` pair has a schema-valid, matching-digest ADR
  and contradicting implementation; the focused D1 suite rechecked this
  precondition on 2026-09-26, and the combined D1/effective-decision source
  checks passed 32/32. This is deliberately not a semantic-review PASS.
  Run the named adversarial token-ADR
  fixture through an independent candidate-bound Critic and retain its actual
  finding before claiming this criterion.
- [ ] Functional model roles at fresh session bootstrap across Claude, Codex
  and Antigravity. Keep `frontier`, `worker` and `efficient` independent of
  provider product names and reasoning effort; select an approved exact model
  only after role-specific compatibility and observed availability, then bind
  one host-held receipt and the user's exact mapping acknowledgement to that
  session. Dispatch and Compact must reuse that binding without mid-session
  remapping. Migrate project source, V3 registry, schemas and all three runner
  projections together, preserving current unavailable dispositions until
  their own installed-host checks pass. The PO's later 2026-09-25 decision
  clarified that Luna may also write. MP-02/MP-03's Mechanic floor still
  applies: `efficient` is not intrinsically below it, but each exact model
  needs route-specific qualification before bounded writing.
  The PO-approved 13-task target matrix is recorded in
  `docs/adr/draft-functional-model-roles-at-session-bootstrap.md`, with a
  runner-specific functional role for each row. A new exact model is a
  non-authorizing replacement candidate until compatibility evidence and a
  PO-approved mapping change exist. The resolver now exposes such discoveries
  across the complete bootstrap proposal. The PO confirmed on 2026-09-26
  that the existing V3 **exact model-ID selectors** may serve as the initial
  approved assignment, but only after their separate role/effort compatibility
  checks pass. This does not approve the future exact ID behind a floating
  Claude alias, nor any newly discovered replacement model. The bootstrap now
  implements that exact-V3 baseline exception without requiring a redundant
  PO signature for an unchanged, qualified selector.
  A deterministic older-Opus to
  newer-Opus fixture proves that the old session stays pinned and the next
  changed mapping needs one exact acknowledgement. This is not a live Claude
  account-catalogue test: the installed CLI has no verified catalogue reader
  in this worktree, while its `opus` alias can float to a newer model.
  The current resolver and tests are contract-only. On 2026-09-25 the PO's
  exact-model target matrix was applied together to the V3 registry,
  `pipeline.user.yaml`, project projections and runner agents; the migration
  inspect reports no drift. Codex implementation and mechanic now both name
  `gpt-6-luna` at high effort, while the normal and high-risk Critic routes
  name `gpt-6-sol` at their separate efforts. This is still an exact-ID V3
  configuration, **not** the proposed functional-role bootstrap: no trusted
  all-runner catalogue observation, host-held session receipt, one-time
  acknowledgement or dispatch-time role binding is live. The installed older
  plugin can overwrite these projections on onboarding, so do not run its
  migration against this source checkout again; the current source migrator
  restored them and passed readback. Exact model/duty compatibility and the
  Mechanic writing floor still require evidence. Do not claim this item closed
  from the pure receipt checksum or the updated route names.
  The 2026-09-26 local host probes confirmed that Codex app-server `model/list`
  and `agy models` expose exact available IDs; pure bounded parsers and negative
  tests now admit those observations without inferring roles from product
  names. Bounded installed-host collectors now call Agy's `models` and the
  Codex App Server's paginated `model/list` without starting a model turn;
  their complete-result and negative fixtures are part of the focused corpus.
  The official Anthropic Models API provides an account-scoped list;
  a bounded host fetcher and page parser are tested, but no API key is configured here. Its
  account is not automatically the Claude Code OAuth account. An isolated
  Claude Code `modelUsage` probe failed authentication with an expired OAuth
  session, so no installed-host availability was observed. The pure host-result
  parser correctly rejects that error. An isolated, repository-free host-probe
  helper now exercises the alias/result boundary in the 39/39 focused
  model-role session regressions,
  but the real OAuth failure still supplies no model observation. These parsers
  and the helper do not authenticate their producer. A new host-session layer
  now resolves the complete active route set, requires the exact one-time
  acknowledgement, writes it exclusively to a private session store, and
  re-reads it for task dispatch. The Agy session-dispatch boundary and the
  E3 fixture host can reject a substituted model before launch when a
  session-bound request uses the host store. The productive
  `elephant-agy-implementation-dispatch.mjs` route now selects the approved
  model from a published current-runner session receipt before sealing its
  scope and consent; its route digest binds that receipt and the V3 base
  policy. Malformed optional stored evidence does not authorize a replacement:
  dispatch emits a typed diagnostic and retains the consent-bound V3 selector.
  Historical sessions with no receipt retain that selector during migration.
  Missing or defective optional bootstrap source, observation or session
  identity likewise reports a V3 fallback without making the lifecycle
  partial; a V3-unavailable task still cannot launch, and consent is never
  inferred from that fallback. The focused model-role and productive Agy
  suites pass 11/11 in the current uncommitted checkout.
  A current-runner host observation
  collector joins the installed runner's probes to every active route for that
  runner, deduplicates repeated Claude aliases, and rejects missing or API-only
  Claude evidence before offering a partial mapping for admission (7/7 focused
  regressions). A signed exact-model policy reader now verifies a complete
  active-runner role/effort set against an explicit PO proof and configured
  trust anchor, without demanding approval of uninstalled runners or revoking
  the approval for an unrelated later commit (5/5 focused
  regressions). Native session-key resolution now uses Codex's matching
  `CODEX_SESSION_ID`/`CODEX_THREAD_ID`, Claude Code's
  `CLAUDE_CODE_SESSION_ID`, or Agy's host-observed conversation ID; missing
  and contradictory IDs fail closed (3/3 focused regressions). No signed
  replacement-model policy artifact has yet been issued. The PO-approved
  concrete V3 selector now has a separate initial-baseline path: each active
  runner slot must be observed with its exact V3 ID and effort before the
  host can derive the limited policy; a Claude alias or newly discovered ID
  cannot enter by this exception (4/4 baseline regressions). The live Codex
  probe reached this availability condition, but no attended session receipt
  has been published yet. An attended Codex/Claude bootstrap
  command now composes the live identity, signed policy reader, complete
  *current-runner* catalogue observations, prior-session mapping and exclusive
  store write. One installed runner is sufficient: Codex never has to probe
  Claude or Agy to enter a Codex session; separate Claude-only and Agy-only
  observation fixtures likewise never probe the absent providers. The signed
  approval source still describes all configured runner routes. The attended
  command prompts for the exact digest only on a changed mapping (10/10 focused
  regressions). The private store pins the source and revalidates either a
  signed replacement policy against the configured trust anchor or an exact
  V3 baseline against the current governed registry on every read. A policy
  rewrite, trust-anchor change or V3 source drift fails closed; ordinary
  unrelated HEAD advances do not require a new signature. The five direct
  store regressions and the Agy E3 host fixture
  (15/15 outside the process-restricted sandbox) pass. A live, read-only
  Codex bootstrap probe on 2026-09-26 observed this account's `gpt-6-sol`
  and `gpt-6-luna` at all configured efforts, without a model turn; it
  returned `HUMAN-CONFIRMATION-REQUIRED` and wrote no session receipt. This proves
  availability and advertised effort support only, not route-specific model
  quality or PO approval of a replacement. This is still host
  observation, not provider attestation. The `pipeline-start` skill now
  invokes the current-runner CLI as a new-session step and preserves V3
  when the new mapping is unavailable. The Agy CLI also verifies a fresh,
  exact-session, exact-version hook lock before an attended admission; that
  local lock is not provider attestation. The native start hook now surfaces
  its session locator ephemerally for that CLI, with its 6/6 focused hook
  regressions green. A new pre-packet task selector reads the exact
  current-runner admission and returns either its bound model or a typed
  `legacy-v3` disposition; a corrupt optional receipt is never admitted as
  model authority and instead returns a visible diagnostic plus the V3 route.
  A damaged optional role projection now also falls back to an independently
  validated V3 task cell; a task without a valid V3 route still cannot launch
  (5/5 focused regressions). The Antigravity bootstrap CLI likewise contains
  optional source-loader exceptions before they can escape as a bootstrap
  failure. Neither fallback admits a new model or closes the still-open
  productive dispatch coverage.
  A missing/defective optional model mapping does not make the ready lifecycle
  partial. The normal Codex Critic packet producer now
  consumes that selection before sealing its route; both model and route
  authority digest change together, and its focused host suite is 135/135.
  The shared fresh-session Critic admission now checks a Codex or Claude
  session's exact task model and effort before creating its packet (12/12
  finalizer regressions); it does not manufacture a model from an old packet.
  Trigger row T2 (high risk by risk class) now selects the high-risk Critic
  model duty alongside T1, while T3 remains normal; the finalizer regression
  proves both assignments before packet creation. The trigger classification
  itself still needs an independent source binding.
  The normal `pipeline-start` dispatch guidance now requires the same
  read-only selector before native model-bearing packet construction, with
  `legacy-v3` as an explicit current-runner fallback rather than a session
  readiness failure.
  Installed-host execution for any runner claimed live, direct host routes
  outside that admission, and independent trigger/risk classification remain
  unproven. The Agy implementation producer and Codex Critic producer now
  consume session selections in source, but that does not establish universal
  dispatch coverage; this remains a source gap, not merely a missing
  operational proof. The explicit task-to-role projection
  now checks the PO matrix against V3 without using product names as role
  authority. The missing pure-read duty is now registered for all three
  runners and projected through the sanctioned V3 migration into this
  checkout's `pipeline.user.yaml`; the 34/34 focused regressions retain a
  negative missing-duty case. V3-unavailable Agy routes remain visible but
  cannot demand a model selection or become launchable from this projection.
  The exact known-predecessor migration is
  explicit-activation-only and rejects an altered or unknown predecessor
  (54/54 focused migration regressions). This checkout now has productive
  selector consumption at the reviewed model-bearing boundaries: Codex normal
  and high-risk Critic packet paths, the shared Claude/Codex fresh-session
  Critic finalizer, Advisor host routing (including the distinct Claude
  consult-fallback route), and the consent-bound Antigravity implementation
  producer. The `pipeline-start` briefing requires selection before sealing
  other native model-bearing packets and specifies the exact V3 fallback. A
  grouped recheck of model-role authority, host session, selector, bootstrap,
  Critic, Advisor, and Antigravity producer suites passed 118/118 on
  2026-09-27. A same-day callsite audit confirms the in-package productive
  boundaries are the Codex normal/high-risk Critic hosts, Codex native Critic,
  shared Codex/Claude session Critic, Claude Critic, Codex/Claude Advisor,
  and consent-bound Antigravity implementation routes; each consumes a
  session-bound selection before its model-bearing launch and retains the
  independently validated V3 fallback. The separately owned
  `codex-critic-packet-host.mjs` has no CLI entry point or in-repository
  production caller; its direct tests cover a low-level packet protocol, not
  an additional productive route. Arbitrary third-party callers are outside
  the shipped dispatch surface and are not claimed as enforced by this source
  audit. This closes source-stage dispatch coverage, not the full acceptance
  criterion: installed session readback and final-candidate binding remain
  open and must be verified after stamping on an available runner.
- [ ] NEW unique 0.7.0 candidate build/distribution stamp, explicitly requested
  by PO. Bind stamp and final evidence to the actual delivered source. Do not
  reuse 0.7.0+codex.20260918192112.f2963473 or claim an old install is this build.
  Use one timestamp and eight-character frozen-source OID across ALL THREE
  runner manifests: `0.7.0+codex.<timestamp>.<oid>`,
  `0.7.0+claude.<timestamp>.<oid>` and
  `0.7.0+antigravity.<timestamp>.<oid>`. The local stamper now validates every
  manifest before writing any, with a disposable-Git regression for a bad
  third manifest; this does not itself freeze, stamp, commit or install the
  current dirty checkout. Rechecked 2026-09-27: the disposable-Git test passes
  1/1; it proves a malformed third manifest leaves the first two byte-for-byte
  unchanged and a valid stamp gives all three manifests the same timestamp and
  source OID while retaining the required runner-specific version prefixes.
  Determine the stamp only at candidate freeze and qualify the resulting
  stamped candidate before handoff.
- [ ] Clean, identifiable Alfred main worktree candidate and copy-safe install
  handoff for WSL and Windows. User performs installation; agent does not.

Cadence-item evidence (2026-09-24): the PO's 2026-09-13 decision is recorded
in `specs/sprint-alfred-epic/evidence/po-decision-queue.md`; the current PRD,
Spec, acceptance AC-6 and four C1 plans require measured quality without a
fixed 14-day wait. `node scratch/audit-0.7-c1-no-fixed-window.mjs <repo-root>`
reported all eight normative sources present, zero stale normative matches
and zero active runtime matches. This closes only the obsolete-calendar-rule
reconciliation; it does not establish calibrated promotion or release evidence.

Audit-Bundle evidence (2026-09-25): `docs/audit-bundles.md` documents the
explicit `audit-bundles/<bundle-id>` convention and an independently chosen
output path. `plugins/pipeline-core/lib/audit-bundle.mjs` generates a
candidate-bound `README.md` with prerequisites, offline verification command,
expected result and assurance limits; its digest is recorded in the manifest.
The bundle, CLI, close preflight and close executor suites passed 31/31 in a
child-process-capable local run, including README tamper detection. This closes
the usability subitem only, not final candidate qualification or a claim that
an unsigned bundle proves its own provenance.

Architecture adoption check (2026-09-25): the current repository resolves to
the signed `deferred` decision with review date 2026-10-20 despite later Git
commits; the adoption suite passed 32/32, including a plugin-only CLI fixture.
The real repository's module inventory check validates four modules and its
generated HTML overview is current. `docs/usage.md` now explains map creation,
validation and auditor handoff using the shipped CLI. The broader architecture
integration item above remains open until a fresh/resume entry route is
exercised on an installed runner; unit-level injected orientation alone does
not prove live host reachability. Each additional runner needs its own live
evidence before claiming its native route, but is not required for a
single-runner consuming repository. The separate user-documentation
subitem is complete: `README.md` points to `docs/usage.md`, which now covers
read-only discovery, initial-map creation, signed versus chat-attributed
authority, map/overview checks, and auditor handoff with assurance limits.
The plugin-only architecture CLI fixture runs the documented status, proposal,
module inventory, overview write and overview check commands against a
disposable consuming project (32/32 suite passing).

Critic cadence check (2026-09-25): the production preflight admits a
candidate-bound `critic`-mode Verify receipt or validated targeted diagnostics
with Full Verify still explicitly pending. The release Verify producer consumes
the passing Critic packet and permits deterministic rechecks only through the
same content-bound Critic/Verify lifecycle. Focused admission, diagnostic,
preflight and producer suites passed 83/83. The normal `critic-review` skill
now states this ordering and removes its misleading bare-binding JSON example.
The first checklist item remains open until a substantive final candidate is
actually reviewed through the regular host route before its full release-mode
Verify; contract tests and skill wording are not that live review.
The canonical Operating Model, QG-01 and user-facing usage guide now state the
same targeted-checks → substantive Critic → Full Verify order, and the
Operating Model/guardrail plugin copies were regenerated. Documentation and
language checks pass. This closes the prose contradiction only; it does not
replace the required final-candidate review and Verify receipts.

Bootstrap permission check (2026-09-25): the installed-cache A→B repair,
repeated A→B→C canonicalization, partial-family refusal and unrelated-grant
preservation are implemented and pass 26/26 focused tests. The normal
projection can offer a digest-bound `apply-runner-permissions` action, but it
still carries `requiresConfirmation: true` for a new cache version. Thus the
stronger no-repeated-manual-repair criterion is not closed by those tests.
`scratch/0.7-runner-permission-update-decision.md` records the narrow options
and installed-host acceptance evidence; no broad wildcard grant is presumed.

Antigravity bootstrap identity check (2026-09-25): the PreInvocation start
hook and PreToolUse guard now resolve the same validated native session ID,
including Agy's `conversationId`. Previously the start hook could write
`session-<conversationId>/requires-bootstrap.lock` while the guard looked up
`session-null`, silently missing the mandatory bootstrap block. A disposable
initialized-Git integration fixture now proves the guard consumes the lock;
a path-shaped conversation ID is refused before filesystem use. This is
source-level repair only until the shared candidate is stamped, installed,
and the installed hook copy is read back.
The same regression now also proves that a Git-initialized but ungoverned
workspace receives an optional onboarding hint without any mandatory lock;
mere plugin presence is not activation.

Nova apply-patch ordering check (2026-09-25): `guard-apply-patch.mjs` now
stores each parallel or repository-serial guard result at its original
patch-input index before rendering denials. A mixed-lane, two-path regression
proves the first path's serial lifecycle refusal appears before the second
path's parallel refusal; the full focused guard suite passed 17/17 in a
child-process-capable run. The checklist item remains open until the one
shared stamped candidate is installed and its cache copy is read back; this
source edit is also outside the previously signed r4 package.

No-delivery implementation check (2026-09-25): the additive v4
`completed-undelivered` record, exclusive writer receipt and return-coordinator
branch are prepared. A real coordinator-to-writer integration test publishes
the non-authoring record and refuses replay; the affected schema, writer,
coverage and authorship suites pass. The Agy live host now uses the same
exclusive writer through an in-memory request: a real temporary-session test
confirms records for missing Final Returns and post-return consent revocation,
and a duplicate task ID is rejected before a second model call. This host
path does not invoke the workflow coordinator; candidate-bound incident/Critic
evidence is still absent.
The new exclusive no-delivery record deliberately remains `criticRequired`.
The coverage reader now accepts a separate Critic addendum only when it binds
the exact immutable record bytes, task, candidate and Critic artifact digest;
the consumed private Critic packet must also name the same record as an explicit
evidence reference in a descendant review candidate, whose Git blob is
byte-equal to the original record. Its passed receipt must bind that review
candidate and task. Absent, failed, orphaned, changed or malformed bindings
fail closed.
Its host-only writer checks
the existing physical record and artifact bytes, publishes exclusively and
returns a readback digest. The historical-index bypass remains rejected. This
is not yet a finished review workflow: a real candidate-bound Critic run and
end-to-end readback are still needed before this failure path can be called
lifecycle-complete. The packet/receipt path now machine-binds the exact
post-dispatch record bytes, but no real live run has exercised this path yet.
A portable signed export is also still needed for fresh-clone verification.
The current productive Antigravity entry is
`elephant-implementation-dispatch.mjs` ->
`elephant-agy-implementation-dispatch.mjs` ->
`goldfish-antigravity-live-host.mjs` -> `agy-session-dispatch.mjs`.
That host no longer treats a CLI exit-zero result envelope as delivery:
without a valid structured child Final Return the receipt is
`completed-undelivered`/`AGY-SESSION-FINAL-UNDELIVERED` and writes a v4
non-authoring observation when its model call completes. A valid return is
only `final-pending-host-commit`. The live host now captures a clean Git
baseline before launching Agy, rechecks the stored consent after the return,
and admits a successful final only when the actual diff exactly matches the
child's claim and consent paths. The sealed outer route now passes this
admission to `agy-host-observed-finalize.mjs`: it performs the PO-decided
normal-hook Host-Commit and then exclusively publishes the authored v4
dispatch record. A failure after Git may have committed is
`recovery-required`, never a no-delivery claim.
The separate `agy-host-commit-execution.mjs` step is now prepared and tested
against disposable real Git repositories: it rechecks admission, stages only
the admitted paths, runs ordinary commit hooks and verifies the new parent,
tree and changed paths; a hook denial cannot become a false success. The
admission now records Git-clean-filtered blob IDs and the executor compares
them to the staged index, rejecting a same-path content mutation between
admission and `git add`; the deletion case remains valid. The executor now
also requires a caller-held earlier post-return admission and rejects
same-path byte drift before it stages anything. Admission, execution and
live-host focused checks pass; the executor is now wired after the live
host's validated Final Return through the sealed Elephant route.
The route's consent and `runner-profiles-v3` authority also still bind the
concrete `gemini-3.8-flash-high` ID. Neither the transport receipt alone nor
the model-role resolver proves end-to-end implementation delivery. The wired
host path validates the child return, binds observed model and changed paths
to session/consent, commits only admitted paths on the host, then publishes
and reads back one v4 record. Failed or missing delivery stays non-authoring;
the real provider-backed end-to-end observation remains open.
The actual Agy headless JSON contract reports `status` and `response`, but
does not generally report the effective model in that result envelope; the
earlier JSON fixtures added a nonstandard top-level `model`. The transport
now invokes the installed CLI with the prompt bound as its final
`--print=<text>` argument, after all options. A real benign smoke test from
`/tmp` demonstrated that a bare `--print` consumes the next option as its
prompt; the corrected form passed argument parsing but returned a provider
eligibility 503 with zero turns and zero tokens. The prior `--prompt <text>`
shape and an intermediate bare-`--print` shape were both incompatible with
the real CLI despite permissive mocks; focused suites assert the corrected
argument binding. This is still not a provider-backed Final Return. The transport
rejects a reported non-`SUCCESS` status even with process exit 0, without
exposing the provider's raw error. The live host now selects documented
`stream-json`, checks the overridden model in its initialization event,
binds it to the terminal result's conversation ID, and discards intermediate
step payloads under bounded stream limits. A separate `/model` call or a
`--model` request alone is not same-invocation readback. The 39/39 focused
host/dispatch checks include a real child-process stream fixture and
missing/mismatched-chain negatives. The live route now requests an enforced
`pipeline.agy-final-return.v1` object, independently validates its dispatch,
candidate, outcome, bounded report and normalized claimed paths, and reports
`final-pending-host-commit` rather than delivery success. The focused
return suite is registered in Verify. A real provider-backed invocation of
the complete Host-Commit/record path is still missing; the path itself now
passes a temporary real-Git/signature fixture. A six-case disposable-Git suite now tests the separate
`agy-host-commit-admission.mjs` boundary: baseline cleanliness, actual versus
claimed paths, consent, concurrent HEAD/index drift, prior untracked input,
symlinks and renames. It is registered in Verify and called by the productive
live host. The live-host fixture additionally proves a structured successful
return reaches only `final-pending-host-commit` with exact admitted paths,
while a consent revoked during the model run cannot be admitted. An existing
dirty checkout is rejected before model launch; isolated-worktree
provisioning is still needed for routine use against dirty shared worktrees.
The host now rereads the exclusive result file before admitting a successful
return: it pins a no-follow file descriptor, checks exact byte digest, rejects
duplicate JSON keys, and revalidates dispatch, candidate, session, same-run
observed model and structured Final Return after the signed consent recheck.
That work exposed and fixed a real receipt bug: the result SHA-256 previously
hashed a JSON-serialized Buffer rather than the written bytes. The focused
session-dispatch and live-host suites pass 7/7, including result tamper and
duplicate-key negatives. The returned model witness is a host-local verified
input to the now-wired authored-record path, not a portable signature or
provider attestation.
The separate pure `draftAgyAuthoredRecordAfterCommit` step now verifies that a
successful host commit readback has a new commit, the original baseline parent,
a valid tree and exactly the Final Return's changed paths, then constructs a
schema-valid v4 authored draft. The draft alone grants no authority: the
separate host-only writer requires independent local receipt, consent,
result-byte and Git readback before publishing. The general Git-backed
authorship verifier additionally requires a separately bound Critic addendum
for the record's `criticRequired` state. The public writer still rejects a
self-declared Agy model. A temporary real-Git/signature fixture exercises
Host-Commit, private receipt, exclusive v4 publication, forged consent/result
rejection and the fresh-clone `UNVERIFIABLE` boundary.
The product-capability inventory cannot validate its new surface against the
older committed source baseline until the finished source has a real commit
and the inventory is rebound to it. The current checker reports 17 Verify
surfaces absent from baseline `b10a5b7c3a124e109f585560f81cae8ba7c47535`:
14 under deterministic verification (new Critic, package, model-role and
append-history suites) and three Codex design-readiness suites. The source-stage
inventory is now aware of the separately tracked readiness-adapter row; its
focused readiness-report tests pass 12/12. A source audit also found and fixed
unsorted capability-14 arrays. The inventory checker now reports no structural
array defect; its remaining errors are only those 17 entries not yet present
in the committed source baseline. This is an honest post-commit rebind step,
not a missing registration to patch around or a reason to weaken the checker.
The readiness report still names `capability-inventory-source-baseline-uncommitted`
until the actual source commit is bound. The inventory's positive validator
fixtures read committed inventory bytes, so its full local test suite passes
30/30 during source preparation without relaxing the production checker. The
wired route is still not final-candidate qualification or a live
provider-backed observation.
The old cross-runner model comparison against Claude frontmatter is no longer
the publication authority for a host-observed Agy record. The distinct
host-only writer and Git-backed authorship verifier require the locally
persisted, same-invocation model/consent/result/commit binding; a record-local
`modelOverride` cannot substitute for it. Historical Claude records remain
readable. Without the private receipt, or in a fresh GitHub clone without a
separately approved signed redacted export, Agy authorship stays
`UNVERIFIABLE`. The focused Agy Final Return and authorship suites pass, but
this is not a final-candidate Critic clearance or a real authorized Agy run.
The connected local Return/Host-Commit/Record/portable-export test selection
passes 57/57 on 2026-09-25, including ordinary Git-hook rejection and
committed-clone readback. These are temporary-Git fixtures, not a substitute
for the outstanding provider-backed and signed-export observations.
The portable-export CLI now rejects an absent local authorship record before
writing a signing request and uses exclusive, inode-checked publication for
both request and signed export. Its four focused publication regressions pass,
including existing-target and symlink denial plus a temporary-Git test-key
proof, forged-signature refusal and committed clone readback. That positive
fixture injects the prepared subject and therefore does not test the private
local-PASS admission. The suite is registered in Verify. Before displaying or
signing a portable Agy request, the human signer now invokes the CLI's
read-only `check` mode to rederive that exact request from the local host and
Critic PASS; a merely well-shaped, hand-written request is refused. The
focused signing tests pass 3/3, including that denial. Exact-byte retries of
`prepare` and `publish` now read back the existing physical file and return
success without replacing it; changed bytes fail with a drift code. The
temporary-Git publication suite passes 4/4 with both retry and tamper cases,
so an unchanged attempt need not mint a fresh signing intent after a lost
response. A complete positive
CLI ceremony with a real local PASS and attended PO proof remains outstanding.
Checkout correction, 2026-09-25: a fresh clone that contains both the public
v4 dispatch record and its signed export now uses the export as the portable
substitute for the private Critic addendum and model receipt in both
authorship and repository-wide Critic coverage. The reader
requires the physical record to match both its committed Git blob and the
signed `recordSha256`, and cross-checks task, commit, observed model, effort,
route policy and report digest. A correctly signed but internally
contradictory model claim is refused; a changed working record cannot gain
PASS. An absent private Critic addendum may be replaced by the signed export,
but a present invalid addendum still fails both authorship and repository-wide
coverage; the clone fixture checks this negative case. Previously
the export fallback ran only when the record was missing, so the normal
record-present clone remained `UNVERIFIABLE`. A real temporary-Git clone
regression passes with the record present and fails after record-byte drift;
the portable suite passes 5/5, the authorship suite 57/57 and the Critic
coverage suite 25/25. This fixes the
consumer path, not the outstanding live producer/attended-signature proof.
The working contract at `scratch/alfred-no-delivery-record-contract.md`
retains the remaining live-run and portable-readback obligations.

Agy consumer-install guidance correction (2026-09-25): the interactive
installer now prints `where.exe node` on Windows and `command -v node` on
macOS/Linux; `SETUP.md` and `GEMINI.md` show both host-shell checks. The
GitHub tag-clone and installer path in `SETUP.md` now have a PowerShell form
as well as the POSIX form. The installer fixture passes 10/10 and the
documentation contract checker passes.
Neither shell check substitutes for a desktop/service host PATH readback.

README review-order correction (2026-09-25): both language blocks and flow
diagrams now distinguish targeted pre-Critic checks from post-review Full
Verify, consistent with the PO's regular Critic → correction/diff review →
Full Verify sequence. `check-doc-contracts.mjs` and
`check-language-canon.mjs` pass on the edited tree. This is not the final
Reader review: its source-bound two-stage protocol requires a clean fixed
candidate, and any later covered-document edit invalidates the binding.

## After local handoff, before published 0.7.0

User installation and real Greenfield/brownfield/architecture/runner tests;
repair resulting defects and refresh affected reviews/tests; final integration
and full Alfred acceptance matrix. Then complete a dedicated user-documentation
release pass for the actual 0.7.0 behavior: update feature guides, onboarding,
architecture migration, audit-bundle/auditor handoff, approval modes, dispatch
and troubleshooting instructions. Keep the entry README concise and
orientation-first; link out to progressive-detail guides rather than embedding
governance internals or runner-specific repair detail in the first-read path.
Run the independent reader review against the final user-facing documents and
bind it to the release candidate before distribution qualification; explicit PO
acceptance and separately authorized publication follow.

## After published 0.7.0, before seeking users

An independent first-install trial on a fresh PC is the first post-release
validation step: no prior Pipeline plugin cache, project configuration, local
marketplace copy, or inherited runner permission state may be assumed. Record
the OS/runner matrix, exact published installation steps, plugin
identity/readback and a small fresh Greenfield bootstrap result. Treat any
required pre-existing local path, stale cache, hidden permission, or
undocumented manual repair as a release defect and issue a follow-up patch
release before recruiting users; do not turn it into an implicit prerequisite.
No known missing core function above is deferred merely to call a partial build
the requested local candidate. This is one full Alfred release, not slice releases.

## Evidence rules

Only check off an item after inspecting evidence that covers its full scope.
Targeted green suites are progress, not full candidate qualification. Actual
installed-runtime readback is distinct from checkout tests. Never infer signing,
host enforcement, model attestation or live runner execution from prose or mocks.
Protected edits use exact sanctioned requests; present signatures when needed.

The three Greenfield AGY usability items were requested by PO on 2026-09-19
for this local candidate. Their reported call/token savings and underlying
causes are hypotheses until reproduced. Command names and option schemas above
are proposed interfaces, not claims of implemented CLI support. Implement close
orchestration after the lifecycle/review contract is repaired; integrate commit
formatting and onboarding defaults against the same final governance contracts.
Include regression and end-to-end coverage in candidate qualification, with no
gate relaxation or extra routine PO approvals introduced by the wrappers.

Working contracts: scratch/alfred-regular-review-flow-repair.md,
scratch/alfred-no-delivery-record-contract.md,
scratch/alfred-adoption-proof-repair-plan.md,
scratch/ha-chat-push-diagnostic-intake.md,
scratch/ha-consumer-verify-repair-contract.md, and the design-advisory input/draft
in this directory. Historical PO decisions remain authoritative; this checklist
does not reopen them or silently approve new exceptions.
