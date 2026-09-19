# Active PO topic register — 2026-09-17

This is the single working list for PO topics raised in the current 0.6.2
release and Greenfield cycle.  It is a prioritisation aid, not a replacement
for the detailed backlog records or an authority to publish changes.

| Priority | PO topic | Current disposition | Next safe action |
| --- | --- | --- | --- |
| P0 | Historical `v0.6.2` CI repair must be distinguished from current Nova qualification. | Main Verify run `35335056284` succeeded at `bca8f61571f8f6ce9bdae740bc1ecb11ca6dba6d`, which contains repair `8b4aa6aa98c73654fd21703ea8143d26e4dcd2f5`; the workflow is unchanged between those commits. This does not establish repair or replacement of the immutable public tag. | Preserve the historical main-CI readback; do not request a redundant push of the old repair. Qualify the current Nova candidate separately. |
| P0 | A Codex Greenfield must retain and read the complete first-session design input. | Implemented in the SessionStart intake checkpoint path; rechecked on 2026-09-18 with a >10 KiB neutral material-input fixture: the existing resume/intake E2E suite passed 13/13 through the Git-capable local host boundary and asserts byte-identical checkpoint plus next identified SessionStart context. The real disposable fixture lives outside this repository; this repository owns only the general pipeline contract. | Reproduce only if a new real Greenfield run demonstrates a failing lifecycle edge. |
| P0 | Read-only recovery must access appropriate prior session transcripts. | Implemented by the repository-matching, bounded transcript reader; rechecked on 2026-09-18: 4/4 direct tests list all prior project sessions by recency and read every selected session byte-identically, while current/foreign/unknown sessions remain refused. The listing authenticates only a bounded metadata prefix and its automatic excerpts stay bounded, but a selected authenticated session has no artificial size cap and is read byte-identically on demand. | Test the real runner/session identity handoff before expanding read scope. |
| P1 | A kickoff lock must not force agents into an unsafe or confusing recovery route. | The report matches a documented edge: after a crash-published checkpoint, an identical retry previously left its stale deterministic writer lock for the next real mutation. Local commit `2bfb1965` reclaims only that schema/token/age-valid stale lock; focused and complete onboarding suites passed, and the final independent Critic returned PASS at `420d9228`. | Keep local until normal immutable publication; reproduce a new lock only with its exact owner/age state before broadening recovery semantics. |
| P1 | The pre-push hook must not remain stale after the plugin cache updates. | The installed cache and current source both identify as `0.6.2+codex.20260917090016.4c10f238`, yet their installer source differs: the cache has the old unconditional `ready-to-upgrade` model, while source has integrity/currentness detection; the Git-capable installer suite is 33/33 green. A current-source read-only `--plan-install` returns `ready-to-upgrade`, `current: false`, `updateRequired: true`: it will replace only an intact installer-owned hook, not a modified/foreign one. A live Critic-preflight command naming `.claude/pipeline.yaml` was likewise refused by the enforcing cache although the current source's GST34 regression admits that exact read-only script shape. The direct preflight regression now proves that equal manifest/cachebuster versions with a different cached installer return `IPA-HOST-REGISTRY-CONTENT-MISMATCH`. This is the already-tracked cachebuster/runtime-source divergence, not a hook overwrite failure. | In the next normal plugin publication, mint a new immutable build identity and read it back from the installed runtime; connect that delivery to the existing cachebuster and installed-source backlog items. Do not silently overwrite hooks. |
| P1 | Human-terminal signing classification must not drift from the CLI. | Local candidate `bf05188b` makes the lifecycle guard consume the CLI-owned attended-signing catalog and covers `approve-fork-disposition`; PO-CLI tests passed 112/112 and the final correction Critic passed at `280bb309`. The existing [signing-command backlog item](items/2026-08-07-lifecycle-guard-does-not-know-the-human-signing-commands.md) contains the reversible recovery sequence. | Publish only through the normal immutable plugin path with installed-runtime readback; do not treat the current cache as containing this local source fix. |
| P1 | Release governance must stop re-running the same evidence under several names. | PO decision D1 adopts `release-satisfies-push` only for the identical qualified source candidate; the relation is one-way and never permits a push qualification to satisfy release. The prepared S→R envelope remains non-executing until its validator and allowlist owner exist. | Implement and verify the bounded envelope; a changed source, policy, environment class or unallowlisted path must force a new qualification. |
| P1 | A root-owned, locally tested Quickfix must not require a fictional dispatch or a fresh PO signature merely to create its ordinary commit. | PO decision D3: ordinary commits require genuine delegated Dispatch/record provenance, never a PO signature. This local candidate is therefore committed only from its actual bounded implementation dispatch and terminal record. | Keep GIT-03 fail-closed for missing/fictional trailers; use a real dispatch record for ordinary implementation commits. |
| P1 | A push ceremony should require the PO only for the external signature. | The Nova-B [push-intent lifecycle item](items/2026-09-17-push-artifacts-precede-operator-intent.md) defines read-only readiness, candidate-bound intent and exact remote-readback outcomes. The PO approved private journaling during signed batches on 2026-09-19 (audit contract 3). | Implement the approved journal/export contract while retaining candidate, destination and invalidation checks; do not request that storage/timing decision again. |
| P1 | Codex test runs that create Git fixtures need an explicit sandbox boundary. | The apparent pre-commit test failure was reclassified: restricted sandbox child spawning returned `EPERM` before hook execution; the authorized local path passed 51/51. Existing item `pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn` remains the single owner. | Use narrowly scoped elevated execution only for affected local Git/child-process suites; defer native-sandbox redesign to the existing future Windows work package. |
| P1 | Baseline-only Verify needs a late, typed recovery when push readiness discovers it. | Local implementation candidate `9a18c3b3` exposes the same confirmation-gated recovery through `inspect` and `push-init`; the protected-twin backstop uses canonical plan-authority validation. Focused recheck on 2026-09-18: late-recovery suite passed and `push-init` passed 26/26; final correction-diff Critic is green. | Keep it local until a clean full candidate Verify and the normal immutable plugin publication path; no retrospective release edit or PO signature is implied. |
| P1 | Greenfield late-Verify registration has been reconciled. | `harness/scripts/verify.mjs` already registers `pipeline-state-late-verify-tests`; the no-reuse full runs at `f3f79edf` and `04052891` executed it successfully. The historical missing-entry claim is superseded. | No further signature is needed for this existing registration. Keep the separate prepared publication-observer correction under its actual TP-3 boundary and the existing [suite-registration ceremony](items/2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md) owner. |
| P1 | Greenfield runner reports must drive validated work, not duplicate backlog noise. | All three reports reviewed; validated triage is in the three 2026-09-17 backlog items. | Reproduce native-Windows and runner-adapter claims before filing further security defects. |
| P1 | Workflow-tool dispatch record production reaches proprietary host boundary. | The repository-owned trustworthy producer core and return coordinator are implemented (commits 3801105d, 50a80e51), providing v2/v3 record validation, atomic publication, and return binding. The proprietary Workflow host has no repository-visible return callback. | PO to decide whether to close the backlog item as implemented up to the repository boundary or retain as an external host blocker. |
| P2 | Calibration twins must not turn one logical change into two protected ceremonies. | `project/pipeline.json` and `.claude/pipeline.json` are kept in sync today but still appear as separate user-facing authorities. The existing [calibration-twins item](items/2026-09-13-calibration-twins-should-have-one-canonical-writer-and-a-derived-copy.md) owns the migration design; no source behavior has changed. | Choose the canonical representation, derived-copy provenance, and consumer migration/readback before changing either protected calibration path. |
| P2 | PO-facing commands must remain copy-safe across every runner. | The Greenfield-driven audit reconciled `onboarding-init.mjs` with the central renderer on 2026-09-18; a follow-up static import inventory found no remaining production direct import of the opaque renderer from its legacy module. The renderer and onboarding focused suites pass. | Design a durable emitter-conformance boundary; do not treat an import inventory as proof of the broader “every emitter” criterion. |
| P2 | The release flow should be fast enough for ordinary releases. | D1's one-way reuse decision remains approved; the historical envelope closure does not prove the complete producer/input/Security flow. The PO approved the explicit promotion contract on 2026-09-19 (audit contract 4). | Finish and verify the approved flow. Retain full candidate qualification until input independence and deterministic record proof are demonstrated; no optimized-flow acceptance yet. |
| P1 | Marketplace attestation compares more than the property it protects. | Closed: PO decision D4 adopts Option A (complete decoupling ratified). The push-time marketplace attestation check was decoupled in 6fafa912; closure evidence recorded in `backlog/evidence/2026-09-18-marketplace-attestation-closure.md`. | Completed. |
| P1 | Shipped AI hardening gate has no work package in approved epic spec. | PO decision D5: retain code state (`ai-assisted-hardening.mjs`, `ai-assisted-hardening-gate.mjs`, `verify-topology-preflight.mjs`); defer spec reconciliation ceremony to formal candidate acceptance. | Candidate acceptance ceremony. |
| P2 | Audit-evidence overview needed for external/independent review. | Closed: PO decision D6 published `docs/audit-evidence-overview.md`, doc governance entry, and `check-audit-evidence-overview.test.mjs`; closure evidence in `backlog/evidence/2026-09-18-audit-evidence-overview-closure.md`. | Completed. |
| P2 | Restricted-store files and privacy sign-off bound to superseded candidate. | PO decision D7: retain 2026-08-31 PO ruling; preserve closed Phoenix epic digests without rewriting; privacy authority unified under Nova B candidate review. | Candidate privacy review. |
| P2 | Push approval occupies a single slot, serializing multi-destination releases. | PO decision D8: accepted batch-destination approval direction in P1 Push-Lifecycle packet, eliminating serial re-signing loops. | Incorporate in Push-Lifecycle packet implementation. |

## Historical PO decision packet — release-promotion simplification

Superseded where overlapping by the [2026-09-19 approved audit contracts](../specs/sprint-nova-epic/design/2026-09-19-po-approved-audit-contracts.md), especially decision 4. D1 was already approved. Do not re-ask those choices; implementation and verification remain open.

No release or push behavior changes through this packet. It turns the already
accepted S→R design into the smallest later PO/ADR decision, so the next
release does not rediscover the same three questions under time pressure.

1. **Record-only allowlist owner.** Select one versioned policy surface that
   owns the exact evidence/reconciliation paths permitted between substantive
   source candidate S and record-only commit R. Recommended constraint: the
   validator recomputes the complete S..R name-status and blob delta; unknown
   paths always require a fresh qualification.
2. **Mode inclusion.** Approve or reject one explicit partial-order edge:
   `release-satisfies-push` for the same source candidate and policy. The
   reverse edge remains forbidden. Labels alone must never imply reuse.
3. **Canonical Security evidence root.** Decide that detached candidate Verify
   and Security publish/read the same primary evidence root, with the root and
   source candidate bound in the envelope. This removes the manual secondary
   scan without treating worktree location as an evidence property.

If adopted, the implementation target is one qualified S plus at most one
allowlisted record-only R; a changed source, test policy, environment class or
unallowlisted path always starts a new qualification. Public `v0.6.2` remains
outside this mechanism.

## PO decisions — 2026-09-18

- **D1 — one-way release evidence reuse:** `release-satisfies-push` is allowed
  only for the same qualified source candidate; it never works in reverse.
- **D2 — public browser claims:** a public browser claim requires
  `browser-e2e`; `degraded` browser evidence blocks publication.
- **D3 — ordinary commit provenance:** ordinary commits require genuine
  Dispatch/record provenance and never require a PO signature. These decisions
  grant neither a push, a release, nor a signing action.
- **D4 — marketplace attestation decoupling:** ratified Option A (complete decoupling
  from push publication); closed backlog item with closure evidence.
- **D5 — AI hardening gate spec home:** retain current code implementation; defer
  spec reconciliation to formal Nova B candidate acceptance ceremony.
- **D6 — audit-evidence overview:** published `docs/audit-evidence-overview.md`
  and automated test suite; closed backlog item with closure evidence.
- **D7 — historic Phoenix privacy artifacts:** retain 2026-08-31 PO ruling without
  retroactively modifying closed epic digest records; candidate privacy review governs Nova B.
- **D8 — multi-destination push approval slot:** adopted batch-destination approval
  direction within P1 Push-Lifecycle architecture packet.

## Explicit non-actions

- No retroactive edit, retag, or replacement of public `v0.6.2`.
- No external push, release, branch-rule bypass, or signature attempt without
  fresh, candidate-bound PO authorization.
- No blanket session-transcript read access beyond the existing
  project-matching, read-only recovery contract.

## Canonical runner-report mapping

The three Greenfield reports remain source observations; this table prevents a
later reread from creating a second item for the same confirmed issue.

| Reported concern | Canonical owner / disposition |
| --- | --- |
| `verify: null` blocks a new consumer project's legitimate first verify command. | [baseline-only Verify recovery](items/2026-09-13-baseline-only-verify-needs-an-actionable-release-recovery.md) — locally implemented in `9a18c3b3`, with focused tests and final correction-diff Critic PASS; remains open only for full candidate qualification and normal publication. |
| Browser/Playwright proof is unavailable in some runner environments. | [portable browser evidence](items/2026-09-13-greenfield-browser-evidence-is-not-portably-provisioned.md) — local candidate preflight distinguishes a missing package/browser from a failed test and returns a non-zero typed `degraded` state even with an explicit fallback, so ordinary CI cannot silently pass it. PO decision D2 requires `browser-e2e` for public browser claims and treats `degraded` as publication-blocking; consumer/gate integration remains open. |
| A runner lacks a native dispatch parent identity. | [runner-native subagent identity](items/2026-09-13-runner-native-subagent-tool-identity-is-not-portable.md) — open; require a sanitized native envelope before changing fail-closed binding. |
| An invalid role packet wastes launcher time. | [role-dispatch packet preflight](items/2026-09-10-role-dispatch-payload-errors-fail-before-model-launch.md) — remaining work is real production-coordinator coverage, not another adapter-local validator. |
| Completed local work remains visibly `implementing` after a deferred public release. | [feature-close and usage-ledger recovery](items/2026-09-13-feature-close-recovery-and-usage-ledger-need-runner-selectors.md) — open; terminal recovery must not fabricate a publication. |
| Windows or native-runner claims that are not reproducible here. | Keep the existing platform-specific owners; do not promote a report assertion to a new security defect until its native sanitized fixture is captured. |

## Recommendation reconciliation — 2026-09-18

This is a source-to-owner check for the recommendations which were not
spelled out in the preceding canonical table.  It is intentionally a mapping,
not a second backlog: the reports are valuable evidence but are not themselves
authorization to multiply tickets or widen a security boundary.

| Report recommendation | Checked disposition |
| --- | --- |
| A sanctioned `set-phase --verify-command` write should not trigger two later signing ceremonies. | Closed by [sanctioned Verify transition](items/2026-09-13-sanctioned-verify-transition-is-rejected-by-the-commit-backstop.md): the narrow matching transition is admitted at the real pre-commit boundary; the closure records host readback 51/51. |
| Equal lifecycle argv must not require a Bash-to-PowerShell retry. | Open under [shell-lane parity](items/2026-09-13-identical-lifecycle-argv-must-have-shell-lane-parity.md). It correctly waits for the exact native-Windows envelope instead of generalising from prose. |
| Push preconditions should be reported before any signature preparation. | The independently checked local aggregation correction belongs to [full push preflight](items/2026-08-18-full-push-preflight-before-signature.md); the separate P1 intent/readback design above remains the remaining lifecycle simplification. |
| Critic invocation should reject invalid grammar before an expensive runner starts. | The cited failed call violated the already documented `PATHS/REFS ONLY` contract; it is not evidence of a runtime safety defect. The current source and installed 0.6.2 Critic skill have identical SHA-256 and already carry the strict positional grammar plus a one-line valid example. A separate argument preflight has no measured acceptance case yet and is not filed as a duplicate defect. |
| Dispatch tool budgets and combined implementation/test scopes must avoid a hard turn-limit cliff. | Open under [briefed tool budgets](items/2026-09-06-briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them.md); it already owns both missing native adapters and task-shape calibration. |
| Design decisions already present in material input should not be re-asked. | No existing item owns automatic extraction. This remains a P2 PO design choice: automatic adoption can accidentally turn a recommendation into consent. Any later implementation needs an explicit, reviewable distinction between quoted recommendation and PO-confirmed answer. |
| Direct Elephant implementation should become a hard technical gate. | Already decided and closed under [Elephant direct implementation](items/2026-08-09-elephant-writes-production-code-directly-without-a-goldfish-dispatch.md): the PO declined the technical gate and accepted clearer dispatch guidance instead. The Greenfield report supplies no new authorization to reopen that decision. |
| Codex workers could not commit because their sandbox blocked required Git child processes. | Already owned by [Codex worker sandbox profile](items/2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn.md). It is explicitly deferred to a native-Windows package; the present WSL host boundary is not acceptance evidence for a new sandbox design. |
| A release follow-up referenced an unusable local plugin path. | This is the existing installed-runtime/source divergence, owned by the P1 cache/publication topic above and [runtime installed-copy item](items/2026-08-27-a-repository-agent-definition-is-inert-the-runtime-loads-the-installed-copy.md). The normal immutable publication/readback is its only valid delivery route; no second path-repair item is created. |

## Greenfield optimisation status

The reports are implementation input, not a second backlog namespace.  This
table records their current disposition so subsequent Nova work starts with the
remaining problem rather than re-opening a corrected one.

| Reported friction | Current disposition |
| --- | --- |
| Placeholder design answers could become permanent while the CLI was being debugged. | Closed by the explicit, revisioned pre-generation replacement route: [onboarding-answer correction](items/2026-09-10-onboarding-design-answers-have-no-pre-generation-correction-path.md). |
| Push prerequisites appeared one after another, after earlier work had already been spent. | Closed for independent local checks: `push-init` aggregates its preflight failures before signature preparation; the remaining intent/readback optimisation is tracked by the P1 push topic above. |
| Multi-paragraph commit trailers required a scratch-file relay. | Closed by the typed, copy-safe trailer route: [commit trailer authoring](items/2026-09-13-commit-trailer-authoring-needs-a-typed-single-command-route.md). |
| One PO-facing onboarding command still bypassed the central renderer import. | Corrected locally in `03ca9c85`; focused onboarding and renderer suites passed. The broader emitter inventory remains open under [copy-safe PO commands](items/2026-08-28-po-facing-commands-are-not-uniformly-rendered-break-safe.md). |
| Fresh projects can legitimately carry `verify: null`, but late release recovery is not uniformly driver-visible. | Locally implemented in `9a18c3b3`: `inspect` and `push-init` expose one confirmation-gated typed recovery; canonical lifecycle authority and twin-only commit admission remain fail-closed. Full candidate Verify and normal publication remain open. |
| First-session input and read-only prior-session recovery were unreliable. | Implemented and rechecked locally: a >10 KiB first-input E2E is 13/13 through the Git-capable host boundary, and bounded transcript recovery is 4/4; retain the current scope until a live runner disproves it. |
| Native Windows path, adapter identity, and runtime-hook assertions. | Not promoted without a native, sanitized reproduction; existing platform/runner owners remain authoritative. |

## Nova B audit: approved review lifecycle correction — 2026-09-19

**PO approved implementation; no gate exception is active yet.** The [approved four-contract record](../specs/sprint-nova-epic/design/2026-09-19-po-approved-audit-contracts.md) covers review admission, no-commit terminal records, private push journaling and explicit promotion Security/input contracts. The ordinary source-change
selection in `critic` mode includes `critic-skip-coverage-check`. That check
rejects an otherwise valid pending Critic disposition, while the
[Operating Model](../docs/operating-model.md) requires the applicable
deterministic chain to be green before Critic. At candidate
`90988781b21e266d4561848695463fdaa6ced965`, a real selection probe selected
555/555 suites, and the actual coverage CLI rejected an isolated valid pending
T1 record. This reproduces a sequencing conflict, not an independent review.

Approved resolution: distinguish admission to the specifically bound current
review from final completion. Validate records and existing evidence at both
boundaries; require genuine task/candidate/path/digest-bound Critic evidence
at final completion. Any pre-review pending allowance needs an explicit
authenticated target and separate qualification/cache semantics. Unrelated
pending records and malformed or stale evidence must remain blocking. This
changes the sequencing contract and requires independent implementation review;
removing the check, fabricating receipts or treating a pre-review result as
release qualification is not a resolution.

The separate no-commit lifecycle correction is implemented locally in
`7babea80`: v4 admits explicit read-only and stopped-without-commit outcomes,
binds the exact report digest, and preserves authorship rejection and v3
compatibility. Root reruns of record, writer, authorship, Critic disposition
and coverage suites pass. This is not complete pipeline qualification: the
actual completion streams contain 12 record cases and 11 writer cases while
Verify still registers 10 each, so its receipt parser rejects both declarations.
The protected registration patch is being prepared. The ordinary writer also
still rejects the unresolved Codex `default` adapter; local schema-valid records
are not model-bound writer receipts. Existing records must not acquire invented
commits or false in-progress status. Independent review remains pending.

## Current Nova-B audit checkpoint — 2026-09-19

The latest full no-reuse Verify ran on `0405289169e7700e55c7117e36a4400f6704b4d8`
and failed with 548/555 steps; Security passed. Later phase-fixture and loaded
commit-guidance corrections have focused green checks, not a new full
qualification. Publication TP-3 and harness-fixture TP-5 patches are prepared
but unapplied; no valid maintenance window is installed. Independent review,
implementation of the approved review-ordering contract above, and candidate acceptance remain open.

The Antigravity timeout investigation found no overlapping registered suites
during the failed suite. A measured isolated run instead observed sixteen
`codex plugin list` launches. The lifecycle guard's installed-attestation
recovery probe omits its explicit runner and runs for an unrelated permissions
repair; a separate failing probe reproduces this for all three runner inputs.
Correct the unnecessary foreign-runner discovery without weakening guard
deadlines or admission. This is implementation work, not a new PO choice;
neither probe proves the original timeout's complete cause or native delivery.

## Evidence note: cache identity collision

The current source and the active cache share the exact same Codex build
metadata, although their `pre-push-hook-install.mjs` files are not identical.
That means an installer run can be internally successful while still executing
older logic.  The next release must treat the build identity and installed
runtime readback as one publication outcome.  This is additional evidence for,
not a duplicate of,
`pipeline.a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op` and
`pipeline.repository-agent-definition-is-inert-runtime-loads-installed-copy`.
