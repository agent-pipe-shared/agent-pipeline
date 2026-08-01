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

6. **Optional restart hint:** after the portable seed and before a first
   kickoff, capture a bounded, closed context card with
   `resume-hint.mjs capture --card-file <json>` when the user supplied one.
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
