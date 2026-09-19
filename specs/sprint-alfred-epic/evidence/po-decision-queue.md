# Alfred autonomous continuation — PO decision queue

Updated 2026-09-18. This is the collection point for decisions that genuinely
need the PO during the approved Alfred continuation. It is not a new approval
mechanism, a substitute for signed gates, or a record of feature acceptance.

## Standing instructions

- Continue the approved Alfred scope locally; the user will perform the
  terminal push after the local-priority rebase, and agents must not push.
- Keep `origin/feat/sprint-alfred` as the only upstream. Do not create
  `sprint_alfred`; the prior handover target has been corrected.
- The PO's 2026-09-09 instruction supersedes the prior no-push hold for the
  terminal user action. Keep the repository's force-push and signed-approval
  controls in force; agents do not execute the push.
- Use bounded parallel tasks where dependencies and file ownership permit.
  Check the intended slice/parallel hooks with actual observations; a tool
  call, configured hook, or running child alone is not execution evidence.
- Collect nonblocking questions here; continue independent approved work.
  Stop dependent work at a configured human gate, a material scope decision,
  or a typed hard block without a safe recovery route.

## PO decisions

### 2026-09-19 — Dispatched design, Advisor and independent readiness

The PO selected this next-candidate workflow: user input → dispatched initial
design draft → Advisor improvement proposals → Elephant decisions and revisions
→ independent readiness comparison against original user input, PRD and Spec
→ the final package presented for PO review → implementation. The Elephant
retains design ownership and records why advisory proposals are accepted or
rejected. Material unresolved product choices remain PO decisions. This amends
the design-authoring workflow; it is not permission to skip readiness or PO review.

The existing Claude native Advisor is preferred when available, with the
existing fresh read-only consult fallback otherwise. Reuse that fallback's
contracts for a runner-neutral Codex/Antigravity design rather than inventing a
second advisory system. Verify actual runner execution and report unavailable
honestly. Current Codex/WSL selected-sandbox consultation is explicitly deferred;
do not silently reinterpret it as a working native route or bypass that policy.
Any new functional-equivalent route must be explicit about its assurance and
must retain demand, consent, bounded evidence and no-auto-application controls.

The reported Windows/Claude run was a resume. Its missing architecture-adoption
question is not confirmed as a fresh-session defect; the PO plans a separate
fresh test. No acceptance or installed-runtime success is implied here.

### 2026-09-19 — Plugin update recovery and content-bound Critic reuse

The PO explicitly approved the four local runner-permission entries for installed
Pipeline `0.7.0+codex.20260918192112.f2963473`. The digest-bound merge
`7a3db1cfc5d6d5835b83707b04d17dd635268be6f57493a30dcb097a2af060b8`
returned `ready`; subsequent onboarding inspection returned `ready` with
runner permissions `current`. This resolves this specific permission request,
not a blanket authorization for future permission widening.

The next local Alfred candidate must repair ordinary plugin-update recovery so
versioned script paths do not repeatedly block the pipeline and require manual
PO intervention. Preserve narrowly bounded permissions and host security gates;
do not solve this with an unrestricted wildcard. A handover from another session
is announced and must be reconciled before implementing that repair. This is
approved agent work, not another pending PO decision. Implementation and
regression evidence remain open.

The PO also selected the regular sequence: Critic → fix → diff Critic → full
Verify → fix → full Verify. A Critic PASS binds the reviewed substantive content;
another Verify run alone does not invalidate it. Substantive changes require
appropriate diff review; evidence-only repairs do not automatically require a
fresh full review. Implement and test this as the regular flow, not a temporary
review exception. Release and final Verify remain unqualified until their actual
requirements pass.

### Finding repair continuation — 2026-09-19

The PO explicitly rejected a further pre-green review exception: "Nein,
zuerst den Ablauf regulär reparieren". The regular readiness-versus-completion
dependency and truthful interrupted/no-delivery record contract must be
repaired; no further exception-based Critic dispatch is authorized.

The PO now requests implementation of the findings, concrete signature
requests wherever actually necessary, and a fully checked local 0.7.0
candidate. This supersedes collecting every approval need without presenting
it. No installation, push, signing on the PO's behalf, or release clearance
is inferred.

Four bounded repair commits exist; independent review is still pending:

- F6 banner refusal: `b32445ea063a30b7b10905151702a8b085853690`.
  Canonical onboarding generation is preserved. Additional caller integration
  passed 294 tests: `evidence/alf-banner-integration.json` (captured text log).
- F1 plugin-only baseline: `6291bd4e1aecd20c863b6189f5601ed0a49032f9`.
  Plugin-local schema is byte-identical to the canonical schema; load failure
  denies writes. Additional unchanged guard/loader integration passed 46 tests
  plus 18 guard cases: `evidence/alf-baseline-integration.log`.
- F4 unavailable fitness: `deb76ccd5e1feff656be6c0d2fdd71b1040960d4`.
  45 focused tests passed. This fixes missing/invalid input and aggregate
  status, not the still-pending sanctioned removal of the obsolete 14-day
  normative threshold. The worker's expanded SHA was erroneous; the SHA here
  and in the normalized dispatch record was resolved from Git.
- F2 exact target/digest: `92e2500e554d5d099a1763425f2c6179da54def7`.
  A further bounded repair is in progress for absent files under symlinked
  parents; the first patch's broad realpath catch is not accepted as complete.

Coordinator schema reconciliation preserved raw worker records in local
`evidence/alf-*-raw-record.json` files and corrected incomplete record shapes,
actual requested host type, full commit IDs and report digests. These are
administrative corrections from observed data, not new verification claims.
`evidence/alf-repair-authorship-check.log` still reports all four as
`critic-evidence-pending`. No effective model identity is asserted.

F3 adoption authorization is in active bounded implementation; F5 digest-based
profile drift remains open and must consume an actual accepted reference,
not automatically bless the current state. The existing no-delivery dispatch
record, review ordering, documentation review, real AGY delivery and final
candidate qualification remain open. The prior one-run exception remains
consumed and is not silently extended by this status entry.

### One-run code Critic exception — consumed, partial review, 2026-09-18

The PO explicitly permitted one review before green Verify and subsequently
limited its target scope to code, tests, schemas and configuration. That run
has returned and the exception is consumed; it authorizes no additional run.
Candidate: `b7797309cf6abe175fd52b0a8749d82b43714ea0`, tree
`3c81f49019fb3412cd0efe0cd8fa938b7972c7c7`; base Nova `55cea86fcc30e2251d9f3b4dbc76b6f190bc81d1`.
Current full Verify `verify-1789765298391-c829827c5bcc90bc` remains failed,
572/573 passed, with the interrupted-dispatch evidence blocker described below.

ALF-CODE-CRITIC-1 returned six major findings and `pass: false`:

1. Plugin-only installation can lose the protected-baseline schema and fail open.
2. Briefed-test grants omit mandatory dispatch-digest and exact-target binding.
3. Architecture adoption records PO authority without the human ceremony.
4. Missing calibration and unavailable fitness outcomes can become green.
5. Profile drift uses an optional boolean instead of accepted digest comparison.
6. Plan staging admits pre-authority banners outside the staging directory.

These are open Critic findings, not applied fixes or new policy approvals.
Semantic coverage was incomplete across 157 source targets; 161 other paths
were explicitly deferred. Documentation, remaining source coverage and the
requested complete 1+1 review remain open. The trajectory verdict is
`not verifiable`; underlying check receipts were not independently reviewed.

Local report: `evidence/alfred-code-critic-round1-report.md`; exact verdict:
`evidence/alfred-code-critic-round1-verdict.json`. The installed sanctioned
session finalizer completed and its durable consumed receipt was read back:
packet `c1c0b81f88162c0eb1bbb86622da5c0c`, verdict SHA-256
`37ac7ae63734141a6a378bbb814f290685c9747f4340a5700c82341e2cecd724`.
This records a failed partial review, not gate clearance. Verify and release
remain blocked. Protected-surface repairs still require their applicable
authorizations; the ordering exception does not grant them.

### Latest continuation readback — 2026-09-18, 20:46 UTC

This entry supersedes the current-status wording below, not its historical evidence.
Clean candidate `eea18fe8475f5a0c9d8ad95046313510b7273d89` completed
`verify-1789764159371-d2cb98594ff4324c`: **572/573 passed**, exit 1.
Command: `node harness/scripts/verify.mjs --mode critic --base 55cea86fcc30e2251d9f3b4dbc76b6f190bc81d1 --no-reuse`.
Security passed; onboarding completion passed 283/283 with no skips.
Machine evidence: `evidence/verify-1789764159371-d2cb98594ff4324c.json`.
Terminal SHA-256: `a43a3ebbd6942578574ad3aa3964d41d547e3fdfc12507b932ba7dc8c5edaa2e`.

**Collected course decision: truthful aborted-dispatch representation.**
The sole failure is `critic-skip-coverage-check` on the interrupted local
`evidence/dispatch-record-ALF-SCANNER-PREP.json`. Its missing `resultSha256`
is not the only issue: an in-memory real incident digest then exposes
`record-commit-binding`, because terminal records require a final commit.
This task made no commit. Recommendation: define a narrow audited aborted/no-delivery
contract and its review ordering; alternative: retain the failed gate pending that work.
Do not invent commits, downgrade the schema, hide the record, or assert Critic clearance.
Evidence: `plugins/pipeline-core/lib/dispatch-record.mjs` and the run's coverage log.
Deferral blocks green Verify and the requested independent 1+1 review, not read-only preparation.

**Review preparation remains open:** `docs/state.md` mixes operative rules with prior
Critic results; `harness/review-protocol.md` §2.2 forbids excluding mixed content or
passing those verdicts to a fresh reviewer. No full-scope review or filtering is claimed.

### Current full Verify — completed, two pending gates, 2026-09-18

Candidate `f9649b0b1cb6a628320e6161a920af15bb143e5b`, tree
`d2a4fd204139fea7e9427ef71a179436b85c8664`, completed all 573 Verify
steps: 571 passed, two failed. Run `verify-1789762105324-22df756734f4055a`
terminated failed at `2026-09-18T20:12:25.437Z`; terminal SHA-256 is
`fd37c5c0ccac2234cbcf47a3ec0c4a42c477e199baeda995a43ae80779d71815`.
The onboarding suite itself passed 283/283; only its completion declaration
failed. The other failure is the security scan discussed below. The exact
single-purpose registration change remains pending under TP-3. No green
Verify, completed 1+1 Critic, release acceptance, installation, or publication
is claimed. The raw local journal is under
`.git/agent-pipeline/verify/runs/verify-1789762105324-22df756734f4055a/`.

### Alfred archive scanner collisions — PO approved and applied, 2026-09-18

The PO explicitly approved the described 78 exact content-bound exceptions
on 2026-09-18 ("ich genehmige die ausnahmen"). This resolves the bounded
exception decision only, not Security, Verify, Critic or release acceptance.
A fresh scoped application dispatch is authorized; its readback and candidate
checks must precede any claim that the scanner gate is green. New PO topics
are collected here while independent authorized work continues autonomously.

Application readback: all 78 entries are present exactly once, original ignore
bytes are preserved as a prefix, and both archive hashes are unchanged. The
worker's focused test initially exited 1; the coordinator's WSL-host rerun
passed 23/23 without skips. This rerun is not a full Security pass. See
[application evidence](alfred-scanner-exceptions-applied-2026-09-18.json).

Affected package: full Alfred 0.7.0 qualification. A bounded diagnostic of
the two committed Alfred transition archives found 78 scanner matches, all
exactly equal to the 64-hex `evidence.supersedesEntryHash` field. This is not
a blanket security clearance. Candidate, archive content hashes, rule and
location bindings, and proposed content-specific fingerprints are recorded
in [the sanitized diagnostic](alfred-ledger-secret-triage-2026-09-18.json).
No raw scanner secrets are included; no new exception remains applied.

A preparation dispatch briefly appended the proposed exceptions despite its
no-write scope. The coordinator stopped it and reverted exactly that append
before the subsequent PO-approved apply; see the
[scope incident and rollback](scanner-preparation-scope-incident-2026-09-18.md).
That incident was not PO authorization and did not authorize the later apply.

Decision requested: authorize only the individually listed `content-v1`
exceptions after checking the bound archive hashes and fingerprints.
Recommendation: use those exact content-bound entries through the sanctioned
authority writer, then rerun Security and full Verify. Alternatives: defer
and keep the gate red, or separately approve a broader archive-path policy;
the latter is not recommended because it would cover future unrelated
content. Do not mutate the immutable archives or weaken scanner detection.
Deferral blocks green full Verify and its dependent Critic/release gates,
but does not retract the existing approved 0.7.0 scope.

### 0.7.0 cross-runner delivery scope — approved, implementation follows repairs

On 2026-09-18 the PO explicitly required the productive Codex-Elephant to
Antigravity Goldfish route with `gemini-3.8-flash-high` in the full 0.7.0
release. Complete the current test corrections and intensive review first,
then extend the existing E3 implementation to this outcome. The provider-free
E3 fixture seam alone does not satisfy the newly requested release scope.
Evidence: `spec.md` §8.1, `plugins/pipeline-core/scripts/goldfish-antigravity-host.mjs`,
and its 13-case fixture suite, freshly passed on 2026-09-18.

The release-scope decision is resolved; implementation and live qualification
are open agent work. Prepare the concrete live-pilot scope (Google/Antigravity,
requested model, bounded no-write task, timeout, isolation expectation, output
redaction and recorded readback) before any remaining configured human gate.
Recommendation: qualify that route after repairs and carry its real outcome
into 0.7.0 acceptance. Alternatives are deferring the release until it works
or a new explicit PO scope revision; silently shipping only the fixture seam
would contradict the current instruction. Existing A1 acceptance from the
user-repository live test remains accepted, but must not be relabelled as
candidate-bound E3 execution evidence.

### Verify case-completion registration — signed and applied, 2026-09-18

Update: the PO signed intent
`6c7a08957c9a04035c220742807d42ee9644e83156cc7278e051e0c723200712`.
The sanctioned consumer armed request
`4a2e286cbb0ff8f63ee6b780741fbfd9764e81c9a17666af3e75c1d12c2933a0`,
plan `e738cd6e4a06545c9321fcdbba0eb7f52a5ed30b63b2dc0a2015f1546c93ad3c`.
The exact registration edit was applied and read back, then committed at
`52e20bcc4804127662e82a24fd2e4cc6212888b5`. After runtime recovery,
the registration checker passed (571 registered, no unregistered suites), and
the onboarding suite again passed 283/283 with no skips. Full Verify on the
next clean candidate is still pending. The following paragraph records the
earlier denial and its disposition history, not a new signing request.

The rebased onboarding suite declares and executes 283 cases, but
`harness/scripts/verify.mjs` still admits only OBC001–OBC281. The required
correction changes the registration length from 281 to 283, preserving all
cases and the existing completion checks. The installed TP-3 guard rejected
the edit and requires an externally signed authorization. No approval was
inferred from the autonomous test-repair instruction. The attempted request
digest was `f36a47351c5cebd37d9697c32db6def40744534693c00f0feb1d6d0f334fc337`;
it covered a combined patch, so prepare a fresh, single-purpose request for
the exact Verify edit when the PO returns. Recommendation: authorize that
registration correction. Alternative: defer the edit and retain the failed
completion gate; removing either real test is not a valid remedy. Until the
registration matches the suite, full Verify and subsequent gated Critic
dispatch remain incomplete. Evidence: `harness/scripts/verify.mjs` registration
and `plugins/pipeline-core/lib/onboarding-continuity.test.mjs` corpus.
The exact proposed edit, current file binding, and safe resumption sequence
are in [the registration handoff](verify-registration-approval-handoff-2026-09-18.md).
No signable intent is frozen while the PO is AFK: candidate drift would
invalidate it and cause another unnecessary signing round.

### Rebase governance disposition — approved and applied 2026-09-13

The PO explicitly approved keeping Nova's Human governance sequence 12–14 and
Human head 14 while removing Alfred's five divergent events 12–16 and the two
scanner exceptions that were needed only for those discarded events. The
rebase onto `d2b1dbfc9f70d1ae45ba036b65968c1d9302e5e4` is complete. Store
verification observes a prefix-valid 14-event Human chain ending at sequence
14, digest `7d695d1ec1c4ce85896bdbab63d48ac32962967d0bb6afc496f45e4c82d7234e`.
No fork disposition, replacement Human event, or retained Alfred exception was
inferred.

### C1 evidence cadence — fixed 14-day release/promotion gate removed, continuous quality retained — resolved 2026-09-13

The PO explicitly decided that Alfred has no fixed 14-day wait or age threshold
as a release or promotion gate. The affected packages are C1 interruption
receipts and their collection, correlation, storage, aggregation, and report
evidence, plus any later B1/D2 calibration or promotion package that consumes
them. Continuous C1 use remains mandatory: real event→correlation→storage→honest
report evidence, explicit `unknown`/`unavailable`/limited-coverage outcomes,
deterministic fixtures, and ongoing calibration are still required. The
Alternatives considered were retaining the fixed 14-day gate or relaxing the
evidence-quality requirements; both were declined. The
recommendation/disposition is to remove only the calendar gate, preserve the
evidence-quality contract, and leave historical candidate evidence and issue
snapshots untouched. The living normative PRD, Spec, and Acceptance statements
that encode the fixed window require a later sanctioned revision; this queue
does not change their authority. Deferral would leave the stale 14-day gate
ambiguous and could incorrectly block or falsely promote work. Durable evidence
is this resolved entry, the C1 artifacts under `specs/sprint-alfred-epic/evidence/`
and `telemetry/`, and the later sanctioned revision's audit trail.

### Alfred release shape — one full release, no preview/interim/slice releases — resolved 2026-09-13

The PO explicitly decided to target one full Alfred release, with no preview,
interim, or slice releases. The affected package is the full
`sprint-alfred-epic` release and its E2 integrated qualification; internal
slices remain implementation and verification units only and must not be
called releases. Alternatives considered were preview/interim releases or
publishing individual slices; both are declined. The recommendation/disposition
is one exact candidate satisfying the existing full epic completion predicate,
all existing gates, independent reviews, documentation acceptance, and PO
acceptance, followed only by separately authorized publication. Deferral would
leave release terminology ambiguous and risk treating incomplete slices as
the Alfred release. Durable evidence is this resolved entry, the existing
completion predicate in `specs/sprint-alfred-epic/spec.md` §13 and PRD §7/E2,
the acceptance matrix, and the eventual candidate-bound qualification and
publication approvals.

### Event 16 deterministic scanner collision — superseded by rebase disposition

The exact clean candidate is `d88b543486ddc8e6215d3944fafc1e38aa6790da`
(tree `f803aa1a4b353ee6093676b3f33961359d193fe1`). Full Verify is red (exit 1,
499/508 green); the security finding is one high `gitleaks` `generic-api-key`
finding at line 1, column 987 in the immutable public-safe event
`governance/events/human/16-evt-hgo-deny-cc612114562e4c5069cb6c66c06dda55-0.json`.
The focused diagnostic exits 0 and confirms the raw match equals the producer
`denyDecisionId`, `payload.decisionId`, and `idempotencyKey`. Evidence:
`evidence/alfred-recovery-d88b5434-verify.json` and
`evidence/alfred-event16-scanner-proposal.json`.

The PO explicitly approved on 2026-09-09 one permanent, narrow `content-v1`
exception bound exactly to the event path, `generic-api-key`, line 1, column
987, and the machine-confirmed content fingerprint in the scanner proposal.
The exact prepared entry has now been applied once through the permitted
mutation route and read back. The event remains immutable; the ignore file
pre-edit and post-edit hashes, event hash, and fixture result are recorded in
[event16-permanent-scanner-exception-2026-09-09.md](event16-permanent-scanner-exception-2026-09-09.md)
and [event16-permanent-scanner-exception-2026-09-09.json](event16-permanent-scanner-exception-2026-09-09.json).
That historical decision remains recorded here, but its target event and
exception were removed under the later 2026-09-13 rebase disposition above.
It is no longer an active scanner exception. Candidate Security and Full
Verify remain separate pending gates.

The candidate `84eeb02fc4b7aec0f808d8549efb48993d0c5045` then recorded Full
Verify exit 1 at 500/508 with the same eight failures; Security exited 0 with no
findings. The exact machine summary is
[event16-candidate-verification-2026-09-09.json](event16-candidate-verification-2026-09-09.json).
The PO separately requested on 2026-09-09 that this committed candidate be
pushed for PC transfer once prerequisites are handled. The prior no-push
standing is superseded for that request; use only `origin/feat/sprint-alfred`.
Push remains unexecuted because Verify failed and push preflight reports an
expired armed capability and divergent histories. Prepare reconciliation and
push prerequisites before any execution; do not claim a push or signature.

The candidate `84eeb02fc4b7aec0f808d8549efb48993d0c5045` then recorded Full
Verify exit 1 at 500/508 with the same eight failures; Security exited 0 with no
findings. The exact machine summary is
[event16-candidate-verification-2026-09-09.json](event16-candidate-verification-2026-09-09.json).
The PO separately requested on 2026-09-09 that this committed candidate be
pushed for PC transfer once prerequisites are handled. The prior no-push
standing is superseded for that request; use only `origin/feat/sprint-alfred`.
Push remains unexecuted because Verify failed and push preflight reports an
expired armed capability and divergent histories. Prepare reconciliation and
push prerequisites before any execution; do not claim a push or signature.

## Open agent work and later gates

| Topic | Current status | Next owner/action |
|---|---|---|
| C1 observer/store suite registration | After the Nova rebase, the authoritative checker reports exactly one finding: `observe-critic-preflight.test.mjs` is unregistered; 0 honoured and 0 expired exclusions | Prepare the exact registration and matching capability surface against the current registry, then use only the current author-repair/TP-3 route; no signature is presumed |
| C1 pure aggregation | Implementation and focused tests committed at `854b0da8`; receipt 64/64 and consumer checks 9/9 pass | With source projection now landed, prepare emission/local-report refinement, then run the next candidate Verify and independent T1 review |
| C1 source projection | Committed at `125a2d160ac7b3c4d16979ed4cfbe305a98f8ed5`, tree `173ccbd8f7b0e6e5438742c6a79be6692d01e9c6`; C1 receipt suite 80/80 (64 preserved plus 16 source-projection tests), consumer 9/9, diff-check 0; candidate `96238c3c` Verify is now recorded red at 499/508 | Prepare store/controller contract and later usage/observer work; T1 remains gated by red Verify and baseline is not started |
| C1 producer capture | Committed at `3e11cdadfe8c0e6ab9bd864211fc6dc6e03270dc`, tree `ab433771e3711d999d75d04fbc3f71acbeb7a845`; focused checks baseline 6/6 then 20/20, consumer 9/9, diff-check 0 | Integrate the reviewed store/observer/controller plans, then run a new candidate Full Verify; no emission or baseline claim |
| Slice/parallel hooks | Exact hook identity, native tool coverage and live invocation evidence unmeasured | Read-only investigation, then bounded tests where admitted |
| Existing first-core and scanner-exception review | Installed CAS-READY health and physical Critic adapter layout fix are observed; selected execution and T1 remain pending while Verify is red | Recheck the selected transport and candidate-bound review after the next green Verify |
| Real collection baseline | Continuous C1 evidence quality remains open; no fixed 14-day release/promotion gate applies per the 2026-09-13 PO decision | Implement/validate collection and calibration with honest coverage/status evidence; do not backdate or claim release/promotion from this queue |
| Future publication | Rebase onto Nova `d2b1dbfc…` is complete; reconciliation, Full Verify and current review/acceptance gates remain open | User performs any later terminal push against `origin/feat/sprint-alfred` only after independently checking the configured gates; agents must not push |
| Feature acceptance | Open | Present only after the required work and evidence exist |

The two earlier A1 decisions remain resolved as recorded in
[a1-po-decision-queue.md](a1-po-decision-queue.md). Their historical wording
does not reopen them. The suite-registration implementation and verification
status are in [registered-verify-gate-handoff.md](registered-verify-gate-handoff.md).

New entries must state the concrete decision, affected package, alternatives,
recommendation, consequence of deferral, and the evidence path. Clearly separate
an agent-recoverable blocker from a human decision; preserve resolved entries
with their disposition instead of silently dropping them.
