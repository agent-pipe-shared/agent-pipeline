---
name: pipeline-start
description: Mandatory Agent-Pipeline bootstrap for Elephant, Goldfish and Critic.
argument-hint: "[elephant|goldfish|critic]"
---

# Pipeline start (runner-neutral happy path)

NVA-B60-17 uses `lib/bootstrap-payload-budget.mjs`: the privacy-safe metric is
`utf8-byte-upper-bound` (one UTF-8 byte is a conservative upper-bound unit, not
an exact model-token count). Normal bootstrap and Compact re-entry target
10–15k units and reject an original payload over the hard 15,000-unit maximum.
Compact preserves the same goal and revision and records its own measurement.
## Role and runtime identity

Resolve the plugin root from this skill and run exactly:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs"`

Accept only schema `pipeline.start-preflight.v1`, status `ready` or
`plugin-refresh-required`, absolute matching `pluginRoot`, valid version/source/
boundary/handoff and a read-only `nextAction` when ready. For Goldfish/Critic,
validate but do not execute onboarding; Elephant executes the exact returned
action at its declared boundary. Resolve role before preflight: conflicting or
unknown carriers stop; Critic is closed and never becomes Elephant.

Print only after a ready result:

`Agent Pipeline start: version {{MANIFEST_VERSION}} · plugin root {{ABSOLUTE_PLUGIN_ROOT}}`

For local development also print:

`Agent Pipeline source: local-development · registered local Codex marketplace`

## Normal bootstrap command sequence

### One onboarding consent, not a chain of prompts

When the user has directly agreed to use Agent Pipeline for this repository,
that consent authorizes the complete bounded local onboarding happy path:
read-only plans and readbacks, portable authority seed, any plan-disclosed local
Git initialization, runtime initialization, restart-barrier preparation, and
the first kickoff artifacts. State the bounded effects once, then execute each
returned digest-bound action and its readback without asking again for the next
individual digest. `requiresConfirmation` describes the action's safety shape;
it does not invent a second PO chat gate after this consent exists.

After a required restart, an already seeded repository is evidence that this
onboarding consent has been exercised; resume its ordinary local bootstrap
without re-asking. Stop for a new human input only when no usable project goal
or material design input exists, a configured plan/acceptance gate is reached,
an action is external or irreversible, or a typed hard block has no supplied
safe recovery. Never treat this consent as approval for unrelated adoption,
remote operations, deployment, publication, destructive work, or a scope
change.

1. **Step 0 / V4 onboarding:** execute the exact read-only
   `project-onboarding-v3.mjs inspect --root "$PWD" --intent bootstrap` action
   returned by preflight. Accept only `pipeline.project-onboarding.v4` ready
   native local or receipt-bound plugin-managed forms, including CAS-READY
   App-Server readback where required. Empty `.codex` is not authority.
2. **Loaded authority:** read ruleset presence, V3 source/runtime authority,
   profile, model/effort, Advisor model-free preflight, calibration, role
   prohibitions, repository freshness/update availability, handover/state and
   Verify availability. Machine-read full sources and emit digest-bound compact
   facts; never claim a skipped or cached check passed.
3. **Boundary:** use one simple shell command per tool call. Do not compose
   `&&`, `;`, redirects or pipelines except bounded, expansions-free
   `rg … | rg …` or `rg … | head -n 1..500` diagnostics. Treat
   `executionBoundary: "host-authorized-wsl"` as a mandatory
   host execution profile: submit the exact returned action directly at that
   boundary, including every Git observation, and never first retry it in the
   Codex workspace sandbox. Keep that routing authoritative and never probe
   both sandbox and host views. Runner-owned structured `executable`/`argv`
   actions are primary; any human copy-only rendering must use a tested native
   Bash/zsh, PowerShell or cmd.exe renderer with explicit safe continuation,
   not a visually wrapped long command.
4. **Confirmation:** after all checks, print the auditable confirmation line
   with version, root, V3/runtime, profile, model/effort, role, calibration,
   handover and Verify evidence. No confirmation is printed on non-ready,
   unavailable, stale, malformed or drifted state.
   The four required confirmation facts are: `runtime.status`, `profile/model`
   and `role`, `calibration/handover`, and `Verify availability`; each is
   digest-bound to the machine readback and printed before continuation.
5. **Observation governance:** run
   `node "${PIPELINE_PLUGIN_ROOT}/scripts/observation-governance-bootstrap.mjs" --root "$PWD"`
   before confirmation. `not-applicable` is the successful Consumer-project
   result: do not look for, copy, or repair `harness/scripts/check-observation-governance.mjs` there.
   Only a checkout that carries the Pipeline source manifest is `required`; it
   runs `node harness/scripts/check-observation-governance.mjs`. A `failed`
   source-checkout result is case **F6**: fail closed, perform read-only
   diagnosis only, and correct the governed artifact through its reviewed
   recovery path before restarting bootstrap.

6. **Restart hint for material session input:** before a first kickoff **and
   before proposing, displaying, or performing any restart, session cut or
   Compact after kickoff**, the agent MUST determine whether the user supplied
   material design input, scope, constraints, or open questions since the last
   durable PRD/Spec update or Resume-Hint capture. This includes input received
   after a short kickoff goal has already initialized the project. When it did,
   distil that input into a bounded, closed context card and capture it with
   `resume-hint.mjs capture --card-file <json>`; do not reduce it to a new short
   kickoff goal or merely promise to remember it. A short goal with no further
   material input needs no card. Read back `resume-hint.mjs inspect` after a
   successful capture and state that the `available` card will be used in the
   next session; when no restart follows, use it as context for the current
   kickoff or planning step instead.
   The card is never a gate and capture failure must be surfaced honestly rather
   than claimed as persisted context.
   Its exact keys are `intent`, `scope`, `constraints`, and `questions`; each
   value is a short distilled statement, never a transcript. Interpret user intent
   rather than keywords: an intended restart/session cut captures it; changed
   scope or constraints refresh it; canonised or revoked information is
   discarded. At bootstrap, `resume-hint.mjs inspect` is passive context only:
   `absent`, `challenged-stale`, or `ignored-invalid` never changes readiness,
   actions, authority, approval, close state, or exit status. Do not capture
   raw transcripts, commands, approvals, lifecycle instructions, host paths,
   URLs, credentials, secrets, or private identifiers. The validator rejects
   those forms rather than persisting them.

7. **Normal restart is handover-only:** a same-topic restart, context cut, or
   request to save progress is not a block close. Update only the calibrated
   handover and, where needed, the sanitised Resume-Hint, then re-enter with
   this bootstrap. Never invoke `close-block`, `close-feature`, or the close
   coordinator merely to start a new chat. `close-block` is available only
   when the PO explicitly selects `durable-stop` (the topic ends) or
   `runtime-transfer` (PC/CLI/runtime changes); its coordinator rejects any
   other start intent before it can write private lifecycle state.

### Kickoff intake, durable design package, and document quality

Before the first `kickoff plan`, obtain both a single-line project goal and an
explicit PO profile: `epic`, `feature`, or `mini`. Ask for them together when
the project is pristine; if the user supplied only a goal, ask for the profile
before continuing. Explain the choices briefly (`epic` = cross-package
initiative, `feature` = bounded deliverable, `mini` = small, contained change).
Never infer, silently select, or retrospectively claim a profile from the
amount of text, an assistant's preferred route, or a model preflight. The
profile is a PO input, not a second confirmation for an already authorized
local onboarding transaction.

The transaction-created `specs/kickoff-*` files are provisional bootstrap
anchors, not the standard long-term design location. Once material design input
exists, create the normal design package before presenting a planning result
or proposing a restart, then use the sanctioned kickoff-promotion flow. Its
directory is `specs/YYYY-MM-DD_short-topic/`, where the date is the local
creation date and `short-topic` is a short, lowercase, ASCII-safe summary of
the user's topic. Use `prd_short-topic.md`, `spec.md`, and `design-input.md`.
Do not overwrite an existing package; choose an unambiguous suffix after a
readback. The promotion's `--profile`, feature ID, plan path, PRD path and Spec
path must bind to that package exactly.

Treat that named package as a pre-authority staging set: write and review its
PRD, Spec, and `design-input.md` there first, then run `kickoff promote plan`
and only its digest-bound `kickoff promote apply` to bind the PRD/Spec in State
and the source-evidence path/hash in the same immutable continuity transaction.
Never edit the active provisional
`specs/kickoff-*` PRD/Spec, or any already bound PRD/Spec, merely to add richer
design documentation. Do not invoke a repair, generic continuity CAS, manifest
repair, or hash-rebinding cascade solely because a new design package was
created. After promotion, a material change to a bound PRD/Spec follows the
ordinary reviewed planning/rebind path; it is not a document cleanup.

`design-input.md` is source evidence, not an unbounded conversation dump. It
records a faithful, sanitised structured extraction of the material input
(context, goals/non-goals, requested behaviour, constraints, risks, open
questions, and stated decisions) plus its capture date. The PRD and Spec both
link to it and carry a compact traceability table from its sections to their
requirements/decisions. Preserve the user's specificity; do not collapse a
detailed design into the initial one-line goal. Never persist private
identifiers, credentials, host paths, URLs, commands, or raw transcripts; when
such data is material, record only a redacted statement and a digest/reference
that is safe for the repository.

The source-evidence file is immutable after its PRD/Spec reference is bound.
If the design input materially changes, create a new safely named evidence
version and promote/rebind it through the ordinary planning change, rather than
rewriting an old evidence file and provoking authority-hash drift.

For material input, replace the bootstrap placeholders with a useful PRD and
Spec before a normal plan gate. The PRD covers problem/users, outcomes and
success measures, scope/non-goals, requirements with testable acceptance
criteria, assumptions/risks/open questions, and user-flow decisions. The Spec
covers linked source evidence, architecture and component responsibilities,
interfaces/state or data, operational constraints, test/verification approach,
and explicit PRD-to-Spec traceability. If the input describes an ordered user
flow, state transition, branching, event handoff, or operational workflow,
include a valid Mermaid flow/sequence/state diagram wherever it materially
clarifies that flow (normally the PRD user flow and/or the Spec execution
flow), and record a syntax self-check. Do not add a decorative diagram when no
flow exists.

## Typed lazy loading

The happy path loads no reference file. Load only the exact condition:

- `references/onboarding-recovery.md` for non-ready V4, restart, kickoff,
  private handoff or host-bound recovery;
- `references/private-overlay.md` for private overlay, cleanup or
  project-authority privatization;
- `references/roles.md` for Goldfish/Critic role-specific prohibitions;
- `references/freshness.md` for freshness/update/calibration/handover detail;
- `references/failure-cases.md` for typed failure and recovery cases;
- `references/continuation.md` for `PCR-BLOCKED` or `PCR-DECISION-PENDING`.

No happy-path reference is mandatory. Lazy loading never widens authority and
must preserve lifecycle, V3 authority, calibration, handover, Verify and
continuation checks.

## Gate authority and autonomous continuation

The applicable Operating Model, compiled runtime manifest and recorded active
plan are the only gate authority. Do not create a chat, confirmation or human
checkpoint merely because a routine implementation step needs to happen.

Once bootstrap is ready and the required plan gate is recorded, continue the
approved implementation autonomously: scoped edits, focused tests, state
readback, one-line commits, Verify, Critic preparation and ordinary block
continuation are agent work. A standing approval is not a fresh human touch.

A recorded PRD/Spec approval is an execution mandate for its accepted scope.
Choose ordinary implementation details, task sequencing, bounded recovery,
test fixes and internal alternatives without asking the human again; record
material choices and return results for acceptance. Ask only where alternatives
materially change accepted scope, acceptance criteria, priority, risk, cost,
an external or irreversible consequence, or a configured decision/acceptance
gate. Do not turn routine uncertainty or several implementation options into a
series of PO approvals.

Ask the human decision role only for a configured decision gate, required final
acceptance, an irreversible or externally consequential action, or a typed hard
block for which the returned safe recovery actions cannot progress. A guard
denial alone is not a human gate: first run its exact typed read-only or
lifecycle recovery action. Never bypass a real configured gate or turn an
automated evidence failure into an invented PO approval.

## Compact

Compact re-enters bootstrap, validates the persisted goal/revision and emits a
bounded machine-readback envelope plus a `pipeline.bootstrap-payload-measurement.v1`
receipt. `PCR-READY` does not load recovery references. An over-budget original
payload is surfaced as typed over-budget/truncated while the bounded message
still preserves feature, phase, revision and resumability facts.
