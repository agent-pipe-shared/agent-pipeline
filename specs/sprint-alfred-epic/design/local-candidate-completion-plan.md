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
Keep each checkbox open until its full stated evidence is present. A stamped
source candidate is installable, not automatically accepted or release-ready;
no missing native observation, Critic, AC or PO gate is waived by this order.

## Required before the next local candidate

- [ ] Regular Critic-before-Full-Verify admission and content-bound review reuse;
  substantive changes require scoped review, deterministic reruns alone do not.
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
  cannot waive readiness or final approval.
- [ ] Original Alfred Critic findings closed with independent evidence, including
  durable adoption authority and real accepted-profile/module drift comparison.
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
  mocked runner entry envelopes and a local guard fixture, not three
  installed-host observations; the full item remains open.
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
  Checkout progress, 2026-09-25: the structured entry now re-reads the
  committed parent, tree, paths and exact message after normal hooks. A hook
  that silently changes staged content or the Dispatch trailer yields typed
  recovery, and the CLI exits nonzero without printing private Git text.
  The focused library/CLI suites pass 11/11. This does not yet reproduce the
  reported GIT-03 host incident or authenticate record provenance from the
  live dispatch context, so the item remains open.
- [ ] Shell/dispatch economics followup: reduce avoidable `&&`/commit formatting
  retries through safe generated commands and bounded orchestration; no blanket
  shell grammar relaxation. Explain coherent feature scope versus independently
  bounded parallel dispatches and existing risk-limited collection-block batching
  in user-facing guidance. Measure fixed, per-tool and retry costs separately;
  do not claim constant overhead or unmeasured token/time savings.
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
  gate; the 70/70 preflight suite covers equal readback and malformed-source
  rejection. Installed native-session consumption, task-module applicability
  and the required independent comparison evidence remain open, so the AC is
  not marked complete from this source-level fixture alone.
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
  across the complete bootstrap proposal, and a deterministic older-Opus to
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
- [ ] NEW unique 0.7.0 candidate build/distribution stamp, explicitly requested
  by PO. Bind stamp and final evidence to the actual delivered source. Do not
  reuse 0.7.0+codex.20260918192112.f2963473 or claim an old install is this build.
  Use one timestamp and eight-character frozen-source OID across ALL THREE
  runner manifests: `0.7.0+codex.<timestamp>.<oid>`,
  `0.7.0+claude.<timestamp>.<oid>` and
  `0.7.0+antigravity.<timestamp>.<oid>`. The local stamper now validates every
  manifest before writing any, with a disposable-Git regression for a bad
  third manifest; this does not itself freeze, stamp, commit or install the
  current dirty checkout. Determine the stamp only at candidate freeze and
  qualify the resulting stamped candidate before handoff.
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
integration item above remains open until the fresh/resume entry routes are
exercised as installed on all three runners; unit-level injected orientation
alone does not prove live host reachability. The separate user-documentation
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
The product-capability inventory cannot validate its new surface
against the older committed source baseline until the finished source has a
real commit and the inventory is rebound to it. The current checker reports
seven suites as absent from that committed baseline: `agy-final-return`,
`agy-host-commit-admission`, `agy-host-commit-execution`, `model-role-session`,
`portable-agy-authorship-export`, `portable-agy-authorship-export-cli`, and
`portable-critic-export`. All seven are
registered in the current worktree's Verify sources; this is a source-baseline
freeze wait, not a missing registration to be patched around. The read-only
0.7 readiness report now checks both direct `verify.mjs` registrations and
the declarative `verify-suites.json` registry, and names the red gate
`capability-inventory-source-baseline-uncommitted` instead of a false
structural defect. Its 11/11 regression suite passes. The gate remains red
until the actual source commit is bound. The inventory's positive validator
fixtures now read committed inventory bytes, so its full local test suite
passes 30/30 during source preparation without relaxing the production
checker; that checker still reports all seven uncommitted surfaces. The wired
route is still not final-candidate qualification
or a live provider-backed observation.
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
