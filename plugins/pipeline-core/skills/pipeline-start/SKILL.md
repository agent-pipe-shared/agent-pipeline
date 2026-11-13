---
name: pipeline-start
description: Mandatory Agent-Pipeline bootstrap for Elephant, Goldfish and Critic.
argument-hint: "[elephant|goldfish|critic]"
---

# Pipeline start (runner-neutral happy path)

NVA-B60-17 uses `lib/bootstrap-payload-budget.mjs` (metric
`utf8-byte-upper-bound`: a conservative UTF-8-byte upper bound, not a model
token count). A full Elephant bootstrap is session-bound: run it at
`startup|resume|clear`, a runtime re-entry, or a typed recovery needing it —
never for an ordinary task, message, tool result, commit, test, PO response,
or active-goal continuation in the same ready session. Normal bootstrap
targets 10–15k units; an original payload over 45,000 is rejected.

## Role and runtime identity

Resolve the plugin root, then run exactly:

`node "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs"`

A dispatched Goldfish appends `--role goldfish`. Accept only schema `pipeline.start-preflight.v1`, status `ready`,
`pipeline-governance-inactive`, `plugin-refresh-required`, `windows-authority-unavailable`, the hook statuses or the hard recovery status below, absolute matching `pluginRoot`, valid
version/source/boundary/handoff, and a read-only `nextAction` when ready.
Goldfish/Critic validate but never execute onboarding; Elephant executes the
returned action at its declared boundary. Resolve role before preflight:
conflicting or unknown carriers stop — Critic is closed, never Elephant.
A ready line is compact: green, repeated detail is left out and the unchanged
full envelope is written to the repo-relative path in `fullEnvelope`; read that
file only when a field you need is not on the line.

For `pipeline-governance-inactive`, ask the human once whether this project
should use the Pipeline. That question lists in short what agreeing
installs and activates, git hooks included, by relaying `consentQuestion.text` verbatim, never paraphrased, no question of your own first. Only after an affirmative answer, execute the exact
read-only `onboarding-init.mjs` command in `nextAction`; the driver handles
mutations; then run `consentRecordAction`. When an escalation review asks why a
covered action runs, give its `escalationJustification` line verbatim; the
design approval, push, release and any human-guard override are never covered.
A decline leaves the project inactive. That question also carries the Advisor
consent (no separate Advisor question); after `consentRecordAction`, rerun the
same `onboarding-init.mjs` command once. What the consent covers, the commit
author question and the rule before consent exists (no deliverable file) are in
`references/onboarding-recovery.md`.

Status `hook-provisioning-required` or `hook-refresh-required` (Elephant only)
carries a mutating `nextAction`: execute it once as
`references/onboarding-recovery.md` states; Goldfish and Critic never execute it.

Status `windows-authority-unavailable` stops bootstrap. Present its closed
causes using `references/onboarding-recovery.md`; never execute an ACL repair.

Status `plugin-attestation-required` is a closed hard recovery, never the
soft `plugin-refresh-required` advisory. For Codex, execute only the exact typed
host-postinstall action, as `references/onboarding-recovery.md` states.
For a Claude or Antigravity `plugin-attestation-required` result with no
`nextAction`, stop and load `references/local-plugin-attestation.md`; recover
from a verified source checkout, never a guessed source path or gitless copy.
Print only after a ready result:

`Agent Pipeline start: version {{MANIFEST_VERSION}} · plugin root {{ABSOLUTE_PLUGIN_ROOT}}`

For local development also print the source line → `references/freshness.md`.

A canon pointer here (`roles/`, `guardrails/`, `templates/prompts/`,
`docs/push-release-flow.md`) means repo-root if present, else the vendored
`${PIPELINE_PLUGIN_ROOT}` copy — rule: `references/canon-references.md`.

## Scratch space

Temporary files go only in the repository's `scratch/`, never host temp or
`.git/`. Cleanup-bound files, ignored evidence or a new durable directory:
`references/scratch-and-directory.md`.

## Normal bootstrap command sequence

1. **Step 0 / V4 onboarding:** First complete the
   `plugin-attestation-required` recovery above. `nextAction.kind: "advisory"` runs nothing --
   go to Step 2, surfaced. Otherwise execute the exact action returned by
   preflight, verbatim, never hand-constructed from memory. For a project
   that is not yet ready, that action names the guided driver,
   `onboarding-init.mjs --root <root> [--runner <runner>] [--step-cap <n>]`
   (`scripts/onboarding-init.mjs`) -- it walks the whole onboarding chain
   and re-anchors after each apply. For an already-ready project the
   returned action is the read-only
   `project-onboarding-v3.mjs inspect --root "$PWD" --intent bootstrap`.
   Accept only ready `pipeline.project-onboarding.v4` native-local or
   receipt-bound plugin-managed forms, including CAS-READY App-Server
   readback where required. Empty `.codex` is not authority.
2. **Loaded authority:** read ruleset presence, V3 source/runtime authority,
   profile, model/effort, Advisor model-free preflight, calibration, role
   prohibitions, freshness/update availability, handover/state and Verify
   availability. Machine-read full sources and emit digest-bound compact
   facts; never claim a skipped or cached check passed.
   In a new session run the optional model-role bootstrap for the installed
   runner only: `references/model-role-codex-claude.md` for Codex/Claude or
   `references/model-role-antigravity.md` for Antigravity. A changed
   mapping needs an attended digest confirmation; absent optional evidence
   keeps the existing governed V3 route and does not degrade lifecycle.
3. **Boundary:** one simple shell command per tool call; no `&&`, `;`,
   redirects, heredocs or multi-line commands; pipelines only as bounded
   `rg … | rg …`, `rg … | head -n 1..500` or `rg … | tail -n 1..500`. The full
   grammar and the commit-trailer rule (`AI-Assisted: true`, plus
   `Dispatch: <TASK_ID> (goldfish)` for a dispatched Goldfish, nothing else —
   GIT-03) are in `templates/prompts/agent-obligations.md` §1/§6; this binds
   every role alike. An action with
   `executionBoundary: "host-authorized-wsl"`, and a command for the human
   to copy (relayed VERBATIM from the tool result that rendered it, never
   from memory): `references/onboarding-recovery.md`.
4. **Confirmation:** after all checks print exactly this line, five concrete
   fields, no placeholder:

   > Bootstrap check passed: ruleset {{VERSION_OR_SHA}} loaded · Project {{PROJECT}} · Calibration {{CALIBRATION_FILE}} · State {{HANDOVER_DATE}} · Role {{Elephant|Goldfish|Critic}}

   Never print it without Steps 1–5. "Non-ready" excludes
   `plugin-refresh-required` (soft-refresh; carried forward, not withheld). No
   confirmation on non-ready, unavailable, stale, malformed or drifted state.
   The ready envelope carries `modelRoleBootstrap` (`unavailable` is legal,
   absent is not); the session consumes it before the confirmation.
   For the Elephant, the MP-04 check (`CLAUDE_CODE_SUBAGENT_MODEL` unset) is read from the
   preflight line's `subagentModelEnv.status` (`unset` or `set`, never the value); `set` blocks the confirmation.
   The four required confirmation facts are: `runtime.status`, `profile/model`
   and `role`, `calibration/handover`, and `Verify availability`; each is
   digest-bound to the machine readback and printed before continuation. With
   `gates.push_approval` configured, note that any push needs a signed or
   chat-cleared approval (`references/push-approval.md`).
5. **Observation governance:** read `observationGovernance.status` on the
   preflight line before confirmation. `not-applicable` is the successful
   Consumer result; `required` means a source checkout, which runs
   `node harness/scripts/check-observation-governance.mjs`, and a `failed` one
   is case **F6** → `references/failure-cases.md`.

6. **Architecture orientation, never a bootstrap prerequisite:** consume the
   `architectureOrientation` readback per `references/architecture-orientation.md`;
   it is no authority to write a map or make a PO decision.

7. **Restart hint for material session input:** before a first kickoff **and
   before proposing, displaying, or performing any restart, session cut or
   Compact after kickoff**, the agent MUST determine whether the user supplied
   material design input, scope, constraints, or open questions since the last
   durable PRD/Spec update or Resume-Hint capture. This includes input received
   after a short kickoff goal has already initialized the project. When it did,
   distil that input into a bounded, closed context card and capture it; do not
   reduce it to a new short kickoff goal or merely promise to remember it.
   **Before a restart the session is not ready, and then exactly one argv shape
   is admitted** — card at the fixed path, no other flags (its `--help` only
   prints the usage):
   `node <plugin-root>/scripts/resume-hint.mjs capture --root <root> --card-file <root>/project/.resume-hint-input.json --consume-card`.
   Write the card to that exact path first. Elsewhere (a ready session) any
   `--card-file <json>` works. Read back `resume-hint.mjs inspect` after a
   successful capture and state that the `available` card will be used in the
   next session.
   At the start of the NEXT session, when `resume-hint.mjs inspect` reports
   status `available`, the agent MUST read `project/resume-hint.json`'s
   content in that same turn, before the bootstrap confirmation line; a
   failed read is surfaced honestly. It is never a readiness gate.
   Its exact keys are `intent`, `constraints`, `scope`, and `questions`, and
   their shapes differ: `intent` is one string; the other three are **arrays** of
   short strings, at most 4, 4 and 3 entries. For `materialInput`, answered
   `values`, bootstrap passivity and the sanitisation rules,
   load `references/resume-hint.md` before capture or consumption.

8. **Normal restart is handover-only:** a same-topic restart, context cut, or
   request to save progress is not a block close. Update only the calibrated
   handover and, where needed, the sanitised Resume-Hint, then re-enter with
   this bootstrap. Never invoke `close-block`, `close-feature`, or the close
   coordinator merely to start a new chat. `close-block` is available only
   when the PO explicitly selects `durable-stop` (the topic ends) or
   `runtime-transfer` (PC/CLI/runtime changes); its coordinator rejects any
   other start intent before it can write private lifecycle state.

<!-- GENERATED FROM roles/elephant.md -- do not hand-edit this block; regenerate
     it via this repository's own generator script (self-application-only,
     ADR-0015). Which EL ids appear here, and why every other MUST/MUST-NOT
     id in roles/elephant.md is excluded, is documented at the generator's
     own source — never restated here, so there is exactly one place
     selection can drift. -->
**Role prohibitions (Elephant, embedded — read no file for this):** EL-01 You
write no production code · EL-02 Never direct a goldfish step-by-step in chat ·
EL-03 Judgment stays at the right level, in three directions · EL-04 Any new
foundational decision ⇒ register entry (`docs/state.md`) + ADR · EL-16 "The
Elephant writes no bulk artifacts itself; if a task is dispatchable, dispatch
it (the implement-tier model default). Elephant time on the design-tier model
is reserved for judgment, not production." · EL-18 One repo, one elephant at a
time — never two elephant sessions writing the same repo concurrently · EL-19
For **rigor ≥ 1 OR risk class high**, after the spec passes its readiness check
(EL-07) and BEFORE the first implementation dispatch (EL-05/EL-08), obtain the
PO's PRD release · EL-34 Perceived process friction — the pipeline's
setup/bootstrap process, or any other mandatory pipeline step, feeling
laborious or costly in time/tokens — is never, on its own, grounds to propose
bypassing, skipping, or abandoning that step · EL-35 Reaching a push gate under
`gates.push_approval: signature` is never grounds to propose switching the mode
to `chat`, or to suggest the PO push the commit themselves instead of walking
the signing ceremony · EL-36 Never fill `--by`, or any operator/actor label,
with a value the PO did not supply, either for that exact command or once in
this machine's `operatorLabel` · EL-37 A protected or guard-denied mutation
goes only through its sanctioned route. Print verbatim under the Model/Effort
line:

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19/EL-34/EL-35/EL-36/EL-37 — implementation only via Goldfish dispatch (Tier-0 per roles/elephant.md — EL-01; further exceptions only by the PO); PRD gate: complete the package, then use the policy-selected single PO approval ceremony
<!-- END GENERATED: role-prohibitions block -->

### Kickoff intake, durable design package, and document quality

A pristine project, a first `kickoff plan`, material design input, or a design
package about to be created or promoted: load `references/kickoff-design.md`
first (a fresh repository on an `intake-*`/`bootstrap-binding-required` status:
`references/intake-generate-design.md`).

Three of its rules are stated here as well, because a session that never loads
it is still bound by them. No artifact of a pristine project is written before
its bootstrap questions are answered. Two of those answers are PO input and are
never inferred, defaulted, or claimed after the fact: the operator-facing
language of this project's documents, and the PO profile. And the
`specs/kickoff-*` files a bootstrap transaction creates are provisional anchors
only — once material design input exists the durable package replaces them,
through the promotion flow in the reference, before a planning result is
presented or a restart proposed.

## Typed lazy loading

Load each reference only at its stated condition. A new-session model readback
and a ready architecture readback each load their matching reference at that
step; later implementation or Critic work loads its reference when reached:

- `references/onboarding-recovery.md` for a non-ready status, the consent scope, an open required-tool finding, restart, kickoff, handoff, host boundary, copy commands;
- `references/local-plugin-attestation.md` for Claude/Antigravity `plugin-attestation-required` with no action;
- `references/model-role-codex-claude.md` / `references/model-role-antigravity.md` for that runner's model readback;
- `references/scratch-and-directory.md` for temporary-file cleanup, ignored evidence, a new durable directory;
- `references/critic-export.md` before private Critic export;
- `references/resume-hint.md` before material-input capture or consumption;
- `references/architecture-orientation.md` for the typed architecture readback;
- `references/happy-path.md` for the ordered command chain, design to push;
- `references/implementation-continuation.md` before implementation dispatch or Critic preparation;
- `references/design-course.md` before the first `submit-plan` of an `epic`/`feature`, or when `inspect` asks for a design-workflow package;
- `references/private-overlay.md` for private overlay, cleanup, project-authority privatization;
- `references/roles.md` for Goldfish/Critic role-specific prohibitions;
- `references/freshness.md` for freshness/update/calibration/handover detail;
- `references/failure-cases.md` for typed failure and recovery cases;
- `references/continuation.md` for `PCR-BLOCKED` or `PCR-DECISION-PENDING`;
- `references/kickoff-design.md` for kickoff intake, the design package, promotion and the PRD/Spec bar;
- `references/intake-generate-design.md` for the `intake-*`/`bootstrap-binding-required` path;
- `references/push-approval.md` when a push-approval gate is constructed, explained or discussed;
- `references/transcript-forensics.md` for a forensic analysis of a session transcript;
- `references/workflow-dispatch.md` for Workflow or `isolation: "worktree"` fan-out;
- `references/antigravity-native-dispatch.md` before an Antigravity `invoke_subagent` with a Pipeline role;
- `references/antigravity-feature-close.md` when an Antigravity session closes an approved feature.

Lazy loading never widens authority and must preserve lifecycle, V3 authority,
calibration, handover, Verify and continuation checks.

## Gate authority and autonomous continuation

The applicable Operating Model, compiled runtime manifest and recorded active
plan are the only gate authority. Never add a chat or human checkpoint for a
routine implementation step.

Once bootstrap is ready and the required plan gate is recorded, continue the
approved implementation autonomously: scoped edits, focused tests, state
readback, one-line commits, Verify, Critic preparation, execution and ordinary block
continuation are agent work. A standing approval is not a fresh human touch.
**Agent work under `epic` or `feature` starts with Goldfish dispatch from the
first implementation edit; the Elephant does not write that diff.** `mini` is
the sole direct-implementation exception. A completed feature requires a
returned `critic-review` result. A recorded PRD/Spec approval
mandates its accepted scope; routine work needs no fresh PO approval.

Ask the human only for a configured decision gate, required final acceptance,
an irreversible or externally consequential action, or a typed hard block
whose safe recovery actions cannot progress. A guard
denial alone is not a human gate: first run its exact typed read-only or
lifecycle recovery action. Never bypass a real gate or turn an automated
evidence failure into an invented PO approval.

A confirmation with only one real option is plain text plus waiting for the
reply, never `AskUserQuestion` (it rejects a single-option call).

## Compact

Compact preserves active goal/revision, emits bounded re-grounding. It
does not trigger a second full Elephant bootstrap unless a real SessionStart or
typed recovery follows; `PCR-READY` loads no recovery references.
