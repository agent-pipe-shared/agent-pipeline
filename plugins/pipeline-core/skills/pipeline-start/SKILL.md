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

Accept only schema `pipeline.start-preflight.v1`, status `ready` or
`plugin-refresh-required`, absolute matching `pluginRoot`, valid
version/source/boundary/handoff, and a read-only `nextAction` when ready.
Goldfish/Critic validate but never execute onboarding; Elephant executes the
returned action at its declared boundary. Resolve role before preflight:
conflicting or unknown carriers stop — Critic is closed, never Elephant.

Print only after a ready result:

`Agent Pipeline start: version {{MANIFEST_VERSION}} · plugin root {{ABSOLUTE_PLUGIN_ROOT}}`

For local development also print the source line → `references/freshness.md`.

A canon pointer here (`roles/`, `guardrails/`, `templates/prompts/`,
`docs/push-release-flow.md`) means repo-root if present, else the vendored
`${PIPELINE_PLUGIN_ROOT}` copy — rule: `references/canon-references.md`.

## Scratch space

For any temporary file (probe script, held note, throwaway fixture) use the
repository's own `scratch/` directory: inside the project root, permitted by
the containment guard without an exception, and exempt from the dev-plan gate
in every phase — including `draft`, which is the phase a fresh project starts
in and where a write there used to be refused. The onboarding-readiness check
(`GUARD-LIFECYCLE-NOT-READY`) admits it too while a session sits at
`intake-required` or `intake-design-questions-required` — the two statuses a
fresh project passes through before onboarding completes, where a scratch
write used to be refused with no route named forward. Never a host-temp path —
the guard refuses a write outside the project root; do not fall back to
guessing one when a write is refused. Never `.git/` either:
`.git/agent-pipeline/**` is pipeline-owned private state, not agent scratch.
A session needing disciplined cleanup (bind at start, release at close,
retire a crashed session's orphan on a later bootstrap) uses
`bindScratchDescriptor`/`releaseScratchDescriptor`/`retireOrphanScratchDescriptors`
in `plugins/pipeline-core/lib/session-cleanup-recovery.mjs`; an ad hoc file
needing no lifecycle can be written directly under `scratch/`.

Onboarding writes a `.gitignore` ignoring `/scratch/`, `/evidence/`, and
`/project/pipeline-state.json` when the project has none. A project that
already owns one is never touched — add those three entries yourself if you
want these files kept out of history. `/evidence/` matters beyond tidiness:
`security-scan.mjs` refuses a dirty working tree, so leaving the evidence
artifacts tracked makes the security gate unsatisfiable.

**Directory contract, beyond scratch (ADR-0063):** where anything ELSE new
belongs — a durable evidence artifact, a spec package, a decision record —
is governed by `docs/adr/0063-repository-directory-contract.md`'s
directory-kinds table, not invented per session. Condensed: normative canon
stays in its existing location (`docs/`, `roles/`, `guardrails/`,
`policies/`); decision records live in `docs/adr/`; specifications live in
`specs/<feature-id>/` (ADR-0045); evidence a gate or backlog
`closure_evidence` field actually cites lives in `backlog/evidence/` or
`specs/*/evidence/` (tracked); machine-regenerated evidence lives in the
ignored root `evidence/`; agent-authored temporary material lives in the
ignored `scratch/` above; plugin-owned private runtime state lives under
`.git/agent-pipeline/**` and declared `.claude/` paths. Never invent a new
top-level directory for a kind this table already names a home for.

## Normal bootstrap command sequence

### One onboarding consent, not a chain of prompts

When the user has directly agreed to use Agent Pipeline for this repository,
consent authorizes the bounded local onboarding happy path: read-only plans
and readbacks, portable authority seed, any plan-disclosed local Git init,
runtime init, restart-barrier prep, and the first kickoff artifacts. State
the bounded effects once, then execute each returned digest-bound action and
readback without re-asking per digest. `requiresConfirmation` describes the
action's safety shape, not a second PO chat gate.

A local Git init result carrying a `collect-input` action for the repository's
commit author (`project-onboarding-v3.mjs`'s `applyProjectOnboardingV3`,
neither `user.name` nor `user.email` resolves locally or globally) is a
blocking question, same tier as the kickoff goal/profile/language questions —
never a diagnostic to notice and act on later, never a default or invented
value. Ask the PO once now for both, hold the answered values, and apply them
via `git config user.name "<name>"` / `git config user.email "<email>"` in
THIS repository's local config only, immediately before the first commit,
never sooner — never `--global`, never an untyped value.

Restart bounds and what this consent does NOT grant →
`references/onboarding-recovery.md`.

**Before this consent exists:** never create a deliverable file — reading,
explaining, answering are fine, artifacts are not, even in the turn you say
you will wait for a yes. Never volunteer whether the Pipeline fits the task;
that call is the human's — if asked, state cost/benefit neutrally, not a
recommendation.

1. **Step 0 / V4 onboarding:** `nextAction.kind: "advisory"` runs nothing --
   go to Step 2, surfaced. Otherwise execute the exact read-only
   `project-onboarding-v3.mjs inspect --root "$PWD" --intent bootstrap` action
   returned by preflight. Accept only ready `pipeline.project-onboarding.v4`
   native-local or receipt-bound plugin-managed forms, including CAS-READY
   App-Server readback where required. Empty `.codex` is not authority.
2. **Loaded authority:** read ruleset presence, V3 source/runtime authority,
   profile, model/effort, Advisor model-free preflight, calibration, role
   prohibitions, freshness/update availability, handover/state and Verify
   availability. Machine-read full sources and emit digest-bound compact
   facts; never claim a skipped or cached check passed.
3. **Boundary:** one simple shell command per tool call; never compose
   `&&`, `;`, redirects or pipelines except bounded, expansions-free
   `rg … | rg …` or `rg … | head -n 1..500` diagnostics, and never a heredoc
   or a multi-line command. The full closed grammar, its costliest
   workarounds, and the commit-trailer rule (`AI-Assisted: true`, plus
   `Dispatch: <TASK_ID> (goldfish)` for a dispatched Goldfish, nothing else
   identifying provider/model/session/run/trace/account — GIT-03,
   `guardrails/git.md`, no override) are in
   `templates/prompts/agent-obligations.md` §1/§6 — read it before hitting
   the same refusal live. This binds a Goldfish/Critic dispatch and an
   undispatched Elephant session alike. Treat
   `executionBoundary: "host-authorized-wsl"` as mandatory: submit the exact
   returned action directly at that boundary, including every Git
   observation, keeping that routing authoritative. For Codex, never retry
   in the Codex workspace sandbox first, and never probe both sandbox and
   host views. Runner-owned structured `executable`/`argv` actions are
   primary; a human copy-only rendering must use a tested native Bash/zsh,
   PowerShell or cmd.exe renderer with explicit safe continuation, never a
   visually wrapped long command. When a tool result already carries such a
   pre-rendered field — for example `launch.copyCommand` in
   `project-onboarding-v3.mjs`'s `restartCopyCommands`, whose `posix`/
   `powershell`/`cmd` arrays are each a line already bounded under
   `COPY_COMMAND_MAX_COLUMNS` — relay it VERBATIM, line for line, from that
   same tool result. Never hand-reconstruct the command from memory of a
   prior turn, even for the identical restart action seen before: a
   correctly relayed rendering on one occasion does not carry over to the
   next if the command is retyped instead of re-read.
4. **Confirmation:** after all checks print exactly this line, five concrete
   fields, no placeholder (additions, role variants → typed references):

   > Bootstrap check passed: ruleset {{VERSION_OR_SHA}} loaded · Project {{PROJECT}} · Calibration {{CALIBRATION_FILE}} · State {{HANDOVER_DATE}} · Role {{Elephant|Goldfish|Critic}}

   Never print it without Steps 1–5. "Non-ready" excludes
   `plugin-refresh-required` (soft-refresh; carried forward, not withheld). No
   confirmation on non-ready, unavailable, stale, malformed or drifted state.
   The four required confirmation facts are: `runtime.status`, `profile/model`
   and `role`, `calibration/handover`, and `Verify availability`; each is
   digest-bound to the machine readback and printed before continuation. If
   this project has `gates.push_approval` configured, note here that any push
   will need a signed or chat-cleared approval before it can land —
   `references/push-approval.md` explains the full ceremony when a push is
   actually being constructed or discussed.
5. **Observation governance:** run
   `node "${PIPELINE_PLUGIN_ROOT}/scripts/observation-governance-bootstrap.mjs" --root "$PWD"`
   before confirmation. `not-applicable` is the successful Consumer result; a
   source checkout runs `node harness/scripts/check-observation-governance.mjs`,
   and a `failed` one is case **F6** → `references/failure-cases.md`.

6. **Restart hint for material session input:** before a first kickoff **and
   before proposing, displaying, or performing any restart, session cut or
   Compact after kickoff**, the agent MUST determine whether the user supplied
   material design input, scope, constraints, or open questions since the last
   durable PRD/Spec update or Resume-Hint capture. This includes input received
   after a short kickoff goal has already initialized the project. When it did,
   distil that input into a bounded, closed context card and capture it; do not
   reduce it to a new short kickoff goal or merely promise to remember it.
   **Before a restart the session is not ready, and then exactly one argv shape
   is admitted** — card at the fixed path, no other flags, `--help` included in
   what is refused:
   `node <plugin-root>/scripts/resume-hint.mjs capture --root <root> --card-file <root>/project/.resume-hint-input.json --consume-card`.
   Write the card to that exact path first. Elsewhere (a ready session) any
   `--card-file <json>` works. A short goal with no further
   material input needs no card. Read back `resume-hint.mjs inspect` after a
   successful capture and state that the `available` card will be used in the
   next session; when no restart follows, use it as context for the current
   kickoff or planning step instead.
   At the start of the NEXT session, when `resume-hint.mjs inspect` reports
   status `available`, the agent MUST read `project/resume-hint.json`'s
   content in that same turn and incorporate its `intent`, `constraints`,
   `scope`, and `questions` into its understanding of the session's goal
   before presenting the bootstrap confirmation line — noting the card's
   availability without reading its content does not satisfy this step. A
   failed or skipped read must be surfaced honestly, never silently skipped
   or claimed as done when it was not; this is a MUST-DO consumption step, not
   a new readiness precondition, so it never blocks or gates the session.
   The card is never a gate and capture failure must be surfaced honestly rather
   than claimed as persisted context.
   Its exact keys are `intent`, `constraints`, `scope`, and `questions`, and
   their shapes differ: `intent` is one string; the other three are **arrays** of
   short strings, at most 4, 4 and 3 entries. Every entry is a distilled
   statement, never a transcript. Interpret user intent
   rather than keywords: an intended restart/session cut captures it; changed
   scope or constraints refresh it; canonised or revoked information is
   discarded. At bootstrap, `resume-hint.mjs inspect` is passive context only:
   `absent`, `challenged-stale`, or `ignored-invalid` never changes readiness,
   actions, authority, approval, close state, or exit status. Do not capture
   raw transcripts, commands, approvals, lifecycle instructions, host paths,
   URLs, credentials, secrets, or private identifiers. The validator rejects
   those forms rather than persisting them.

   The same one guard-admitted argv shape above also accepts two further,
   OPTIONAL top-level card keys — never a new flag: `materialInput`, an array
   of the user's own material design input, one verbatim, unbounded,
   possibly multi-line entry per chunk. This is additive: the existing
   `intent`/`constraints`/`scope`/`questions` keys keep their shape, caps and
   meaning exactly, and their "distilled statement, never a transcript" rule
   is unaffected. That rule does NOT apply to `materialInput` — it is
   explicitly exempt from the 4/4/3 short-string caps and the single-line/
   480-byte limit, because a user-authored design document legitimately
   contains fenced code, several paragraphs, or a quoted line. It is still
   screened, like every other key, for credential, secret, host-path, URL and
   private-identifier shapes; a chunk that fails this screen is refused and
   nothing is persisted.

   The same shape also accepts `values`, an object of already-answered
   onboarding input (commit-author name and email, operator-facing language,
   PO profile) captured before the restart barrier, so a session after the
   mandatory restart finds them instead of asking twice. It is persisted into
   the onboarding intake checkpoint, not into `project/resume-hint.json`, and
   an already-answered value is never overwritten by a later capture — ask
   once. `git config user.name`/`user.email` is still written only
   immediately before the first commit, in this repository's local config
   only, never sooner: only the SOURCE of that value changes, from
   conversation memory to this persisted state, never the timing.

   The MUST-DO consumption step above extends to both: at the start of the
   next session, when `resume-hint.mjs inspect` reports them, the agent MUST
   also read the persisted material-input chunks and the persisted answered
   values in that same turn and incorporate them — never re-ask a value
   already answered — with the same honesty duty on a failed or skipped read
   and the same never-a-gate rule: this stays a consumption duty, never a
   readiness precondition.

7. **Normal restart is handover-only:** a same-topic restart, context cut, or
   request to save progress is not a block close. Update only the calibrated
   handover and, where needed, the sanitised Resume-Hint, then re-enter with
   this bootstrap. Never invoke `close-block`, `close-feature`, or the close
   coordinator merely to start a new chat. `close-block` is available only
   when the PO explicitly selects `durable-stop` (the topic ends) or
   `runtime-transfer` (PC/CLI/runtime changes); its coordinator rejects any
   other start intent before it can write private lifecycle state.

**Role prohibitions (Elephant, embedded — read no file for this):** EL-01 no
production code (sole exception: the stage-0 fast path per `roles/elephant.md`
— EL-01) · EL-02 delegate once, via the 6-field briefing, never step by step ·
EL-03 judgment stays at its level · EL-04 no silent fundamental decision
(register + ADR) · EL-16 delegate-first: EVERY implementation is a briefed
Goldfish dispatch · EL-18 one repo, one Elephant · EL-19 PO gate: present the
PRD readably, wait for "approved". Print verbatim under the Model/Effort line:

> Role prohibitions loaded: EL-01/EL-02/EL-03/EL-04/EL-16/EL-18/EL-19 — implementation only via Goldfish dispatch (Tier-0 per roles/elephant.md — EL-01; further exceptions only by the PO); PRD gate: present readably + wait for 'approved'

### Kickoff intake, durable design package, and document quality

A pristine project, a first `kickoff plan`, material design input, or a design
package about to be created or promoted — in any of those states load
`references/kickoff-design.md` before writing or promoting anything, and follow
it. It carries the two PO questions in full, the package directory and file
names, the promotion transaction, the source-evidence rules, and the PRD/Spec
quality bar.

A pristine project's `v4Inspection` status is not always `kickoff-required`:
since commit `10e1b6a0`, a genuinely fresh repository (no prior kickoff
transaction) is routed instead to `intake-required`,
`intake-design-questions-required`, or `bootstrap-binding-required` — load
`references/intake-generate-design.md` for that path instead of
`kickoff-design.md`. A repository already mid-kickoff under the old model
keeps following `kickoff-design.md` untouched.

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

The happy path loads no reference file. Load only the exact condition:

- `references/onboarding-recovery.md` for non-ready V4, restart, kickoff,
  private handoff or host-bound recovery;
- `references/private-overlay.md` for private overlay, cleanup or
  project-authority privatization;
- `references/roles.md` for Goldfish/Critic role-specific prohibitions;
- `references/freshness.md` for freshness/update/calibration/handover detail;
- `references/failure-cases.md` for typed failure and recovery cases;
- `references/continuation.md` for `PCR-BLOCKED` or `PCR-DECISION-PENDING`;
- `references/kickoff-design.md` for kickoff intake questions, the durable
  design package, promotion, and the PRD/Spec quality bar;
- `references/intake-generate-design.md` for the `intake-*`/
  `bootstrap-binding-required` coordinator path a genuinely fresh repository
  now actually routes toward, its staging output, and its handoff into the
  same promotion transaction `kickoff-design.md` documents;
- `references/push-approval.md` for the point a session constructs,
  explains, or discusses the push-approval gate (`gates.push_approval`),
  before a human clears it;
- `references/transcript-forensics.md` for preparing a forensic-analysis
  dispatch of a runner's own session transcript after a live test run.
- `references/workflow-dispatch.md` for using the Workflow tool or
  `isolation: "worktree"` to fan out Goldfish/Critic work: the
  Elephant-only orchestration rule, the mandatory worktree self-heal
  briefing text, the ~50-tool-call termination cliff and required budget
  language, and how to recover a truncated dispatch's real work.

No happy-path reference is mandatory. Lazy loading never widens authority and
must preserve lifecycle, V3 authority, calibration, handover, Verify and
continuation checks.

## Gate authority and autonomous continuation

The applicable Operating Model, compiled runtime manifest and recorded active
plan are the only gate authority. Never add a chat or human checkpoint for a
routine implementation step.

Once bootstrap is ready and the required plan gate is recorded, continue the
approved implementation autonomously: scoped edits, focused tests, state
readback, one-line commits, Verify, Critic preparation and ordinary block
continuation are agent work. A standing approval is not a fresh human touch.
**"Agent work" here means Goldfish-dispatched work, starting with the very
first implementation edit of the plan — not this Elephant session writing
the diff itself.** Implementation work under an `epic`- or `feature`-profile
plan is dispatched to a Goldfish subagent (via the Agent/Task tool,
optionally fanned out with the Workflow tool) rather than written directly
by this session; a `mini`-profile plan is the sole exception and may be
implemented directly. Build the dispatch briefing from
`templates/prompts/goldfish-task.md` (never freehand); for the Workflow-tool
variant, see `plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`
for its additive
requirements. This is a followed instruction, not a technically
guard-enforced rule — no guard blocks or detects a non-dispatched write, so
skipping the dispatch right here produces no refusal to catch it: get this
right by reading this paragraph now, not by expecting a later guard to stop
a miss.
A feature's implementation is not complete until a Critic review
(`critic-review` skill) has been dispatched against it and returned a
result — pass, or a documented fail-then-fix cycle; this is a requirement to
satisfy before treating the block as done, not an optional or ambient step.
The Workflow tool and the Agent tool's own fan-out capability are
Elephant-only — never delegate them to a fork or `general-purpose` subagent,
which inherit the full parent toolset unlike the tool-scoped
`goldfish-*`/`critic` roles; see `references/workflow-dispatch.md` before
using either.

A recorded PRD/Spec approval is an execution mandate for its accepted scope.
Choose implementation details, sequencing, bounded recovery, test fixes and
internal alternatives without asking again; record material choices and
return results for acceptance. Ask only where alternatives materially change
accepted scope, acceptance criteria, priority, risk, cost, an external or
irreversible consequence, or a configured decision/acceptance gate. Never
turn routine uncertainty or several options into a series of PO approvals.

Ask the human only for a configured decision gate, required final acceptance,
an irreversible or externally consequential action, or a typed hard block
whose safe recovery actions cannot progress. A guard
denial alone is not a human gate: first run its exact typed read-only or
lifecycle recovery action. Never bypass a real gate or turn an automated
evidence failure into an invented PO approval.

When one of those does require asking, a confirmation with only one real
option (proceed or don't, with nothing else meaningfully on offer) is plain
text plus waiting for the reply — never `AskUserQuestion`, whose own
validator rejects a single-option call outright.

## Compact

Compact preserves active goal/revision, emits bounded re-grounding. It
does not trigger a second full Elephant bootstrap unless a real SessionStart or
typed recovery follows; `PCR-READY` loads no recovery references.
