---
schema: pipeline.backlog-item.v1
id: pipeline.enforce-kickoff-po-questions
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-21
sprint: nightwing
done_when: contains plugins/pipeline-core/scripts/pipeline-state.mjs requireAttendedChatGateConfirmation
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Move kickoff PO questions (language, profile) to technical enforcement

## Description

The `pipeline-start` skill currently relies on the instruction layer to ensure the agent stops and asks the Product Owner (PO) for the project's language and profile (`Ask the PO once now for both... Never default or invent a value.`). While GPT-4o and Claude 3.5 usually obey this, less strictly aligned models (e.g., Gemini running in Antigravity) may hallucinate these values (e.g., `--language de`, `--profile feature`) and pass them directly into `kickoff plan` without asking the human. 

## Triggering situation

During the `sprint_agy` integration testing, the Antigravity agent invoked `kickoff plan` with hallucinated `language` and `profile` arguments. The technical enforcement layer (`guard-lifecycle-ready.mjs`) validated that the `--language` flag was present, but did not (and currently cannot) validate whether the agent actually obtained this value interactively from the user.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/SKILL.md`, `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, and potentially `guard-lifecycle-ready.mjs`

## Proposal

Move the collection of these critical PO parameters from the prompt layer to the technical enforcement layer. Instead of allowing the agent to provide `--language` and `--profile` as CLI arguments, the `kickoff plan` script could halt and interactively prompt the user on the console, or `guard-lifecycle-ready.mjs` could require the agent to run a specific typed interaction tool (`ask_po_input`) before allowing the execution of `kickoff plan`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** The proposal is a new technical-enforcement primitive (an
  `ask_po_input`-style interaction gate, or a script-level interactive halt)
  distinguishing "the agent asked the human" from "the agent typed a value"
  — genuine guardrail/architecture impact and design latitude, not a small
  fix. Per `docs/operating-model.md` §7 triage rule 4, scope like this is a
  PO decision, not the Elephant's alone. No PO input on this specific item
  has been given yet.
- **Assignment (if accepted):** pending PO scoping decision on the
  enforcement mechanism shape before any implementation is planned.
- **Date:** 2026-08-24

## Design direction decided, 2026-08-24 (PO scoping conversation)

The PO scoped this directly (chat, 2026-08-24), rejecting a bespoke new
`ask_po_input` primitive in favor of reusing the pipeline's existing
uniform human-approval ceremony: **[ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md)**
("every human gate is the same ceremony — one command, one word, one PIN"),
which is explicitly designed to be invariant across gate kinds (ADR-0061
Decision 2: "A new gate that introduces its own ritual is, by this decision,
incorrectly designed").

**Direction:** `kickoff plan`'s `--language`/`--profile` values become a new
gate kind under the SAME ceremony (`po-human-approval.mjs` /
`po-approval-gate.mjs` family) instead of freely-typable CLI flags — the
agent proposes a value, the PO reviews and clears it through the standard
one-command/approval-word/PIN flow, and `kickoff plan` only accepts a value
carrying a valid, digest-bound approval for it.

**Correction, 2026-08-24 (same session, before implementation started):**
the Elephant's first pass at this design assumed the whole ceremony runs
over the chat channel (so the agent would see the PIN in plaintext once
typed) and told the PO so; the PO accepted that framing and asked to start
anyway and validate empirically. Before dispatching implementation, the
Elephant read `plugins/pipeline-core/scripts/po-human-approval.mjs`
directly rather than relying on that assumption — `requireExplicitConfirmation()`
/ `defaultReadConfirmation()` read the confirmation word (a static token,
`"approve"`) and, downstream, the PIN itself, via `readSync(0, ...)` against
file descriptor 0 of the PROCESS RUNNING THE SCRIPT — meaning this command
is designed to be run by the human directly in their own terminal (the
agent hands them a command to copy-paste, exactly the
`attended-host-terminal`/`human-copy-only` execution-boundary pattern
already used elsewhere in this repo, e.g. `guard-human-override.mjs`'s
signature ceremony), not invoked by the agent's own tool call. **The agent
therefore does NOT see the PIN or the confirmation word at all** under the
`signature`-mode ceremony — a materially stronger property than first
described. This repo's own `gates.push_approval` is currently `signature`
(not `chat`), so if the new kickoff-parameter gate kind reuses that same
per-project calibration (per ADR-0061 Decision 2's own invariance
principle), it inherits the full external-key strength, not the lighter
`chat`-mode attribution-only variant ADR-0056 also offers.

**Open design question this correction surfaces, not yet resolved:**
`signature` mode binds an approval to a `candidate: {commit, tree}` (see
`plugins/pipeline-core/lib/critical-action-approval-request.mjs`,
`CRITICAL_ACTION_KINDS = ["push", "deploy", "publication",
"release-preflight"]`) — but `kickoff plan`'s language/profile question
often happens on a BRAND-NEW project, potentially before any meaningful
commit/candidate exists yet. Whether the new gate kind should genuinely use
full `signature`-mode candidate binding, or deliberately opt into the
lighter `chat` mode for this specific gate kind (since the threat here is
an overeager/hallucinating agent, not a high-stakes external effect like a
push), is a real tradeoff the PO has not yet weighed in on with this
corrected understanding. **Left open, not implemented tonight** — the
Elephant judged forcing this specific architecture call without PO input
would repeat the exact self-disposition mistake this session already
flagged and avoided for findings F3/F4/F5 earlier. Ready for the PO's next
session with this full context; the mechanism survey above
(`critical-action-approval-request.mjs`, `po-human-approval.mjs`) is
already done and does not need repeating.

**Not yet designed/implemented:** the exact new gate-kind wiring inside
`po-human-approval.mjs`/`po-approval-gate.mjs`, how `kickoff plan` rejects
an unapproved value, and the live test run validating the shape actually
works end to end. Scope this as its own dispatch package (genuine design
latitude in the gate-kind wiring — `goldfish-deep` tier) once picked up;
not started this session.

## Mode decided, 2026-08-25 (PO decision)

**`chat` mode**, not `signature`. Rationale (PO-confirmed): the threat
model here is an overeager/hallucinating agent typing a value without
asking, not an external attacker — `chat` mode's attribution-only property
already covers that, and it needs no `candidate: {commit, tree}` binding,
which matters because this gate fires on a brand-new project that may not
have a meaningful commit yet (the exact tension the "Open design question"
section above flagged). Ready for implementation dispatch.

## Implementation blocked, 2026-08-25 (AGY-KICKOFFPOQ-1)

Dispatched to implement the direction above under the `po-human-approval.mjs`/
`po-approval-gate.mjs` family. Stopped before writing any code — the
briefing's own stop condition 5 fires: "if `chat` mode turns out NOT to have
an existing kind-registry pattern to extend ... STOP and report that finding
rather than inventing a new registry mechanism." It does not.

**What was checked, in full:**

- `plugins/pipeline-core/lib/critical-action-approval-request.mjs` —
  `CRITICAL_ACTION_KINDS = ["push", "deploy", "publication",
  "release-preflight"]` is exclusively signature-mode: every request is
  built around a `candidate: {commit, tree}` structure and a detached
  Ed25519 proof. No mode branching exists in this file at all.
- `plugins/pipeline-core/scripts/po-human-approval.mjs` (1162 lines, read
  in full) and `po-approval-gate.mjs` — the family the design direction
  names as the ceremony to join. Zero occurrences of `"chat"`,
  `"attribution"` or `"in-session"` anywhere in either file. Every
  subcommand (`KNOWN_COMMANDS`, line 357: `setup`, `prepare`,
  `prepare-all`, `approve`, `approve-all`, `verify`, `verify-all`,
  `prepare-critical`, `approve-critical`, `verify-critical`,
  `authorize-critical`, `sign-intent`) is part of the signature-mode,
  external-Ed25519-key, human-attended-terminal ceremony. There is no
  chat-mode gate kind to join here, and no chat-mode test fixture in
  `po-human-approval.test.mjs` either (its one `"chat"` hit is an
  unrelated `pushApprovalDefault: "chat"` literal in a machine-plane
  fixture) — 71/71 tests still green, confirmed as a baseline, not
  because a chat gate-kind test exists among them.
- The only working `chat`-mode ceremony anywhere in the plugin is a
  bespoke, one-off `pendingPushChallenge` block inside
  `plugins/pipeline-core/scripts/pipeline-state.mjs`'s `approve-push` case
  (not in this dispatch's field-4 scope): a random `PO-XXXX` code, a
  10-minute expiry, bound to `remote`/`destination`/`forCommit:
  head.commit`. It exists for `push` only.
  `critical-human-proof-policy.mjs`'s `GATE_APPROVAL_MODE_KEYS` table also
  registers `feature-package-reconcile` as chat/signature-configurable,
  but no chat-mode ceremony for that kind exists anywhere in
  `pipeline-state.mjs` — the mode-selector table is not itself a working
  ceremony; each kind that has one hand-rolled its own.
  `plugins/pipeline-core/lib/human-guard-override.mjs` has a further,
  separate chat-armed-capability mechanism (`activate: true`) for blocked
  tool calls — a third, structurally unrelated domain, gated on the same
  `gates.push_approval` setting only as a precondition.
- None of the three is a generic, reusable chat-gate primitive a new kind
  can join without either (a) inventing a new dispatch mechanism inside
  `po-human-approval.mjs` (a file with zero chat concept today), or
  (b) copying `pipeline-state.mjs`'s bespoke `pendingPushChallenge`
  pattern into a fourth one-off case. Both are "a new gate that
  introduces its own ritual" (ADR-0061 Decision 2) and outside this
  dispatch's field-4 scope (`pipeline-state.mjs` is not a listed file).

**A second finding that likely reopens the mode decision itself:** the
2026-08-25 rationale states chat mode "needs no `candidate: {commit,
tree}` binding, which matters because this gate fires on a brand-new
project that may not have a meaningful commit yet." That is only half
true. Push's chat path does skip the Ed25519-signed `candidate:
{commit,tree}` *structure*, but it still requires and records
`forCommit: head.commit` (`pipeline-state.mjs` lines ~5641-5646,
~5669) — `approve-push` refuses with "current commit could not be
determined" when `gitHead()` fails. The one existing chat ceremony
therefore cannot run pre-first-commit either, which is exactly the case
the PO's decision was meant to accommodate. This is worth the PO's
attention before any further design/implementation dispatch.

**Options for the PO to weigh, none picked here:**

1. Design and build a genuine, reusable chat-mode gate primitive first
   (its own dispatch, genuine architecture latitude), then add the
   kickoff-parameter kind to it.
2. Copy the push case's shape into a third bespoke one-off inside
   `pipeline-state.mjs` for this kind specifically — accepted only with
   eyes open that it repeats rather than resolves the ADR-0061
   Decision 2 tension, and needs its own scope grant (`pipeline-state.mjs`
   was not in this dispatch's field 4).
3. Reconsider `signature` mode for this gate now that pre-first-commit is
   understood to block the existing chat path too, removing the original
   reason to prefer chat.

**Verification run (no source changed):**
`node --test plugins/pipeline-core/scripts/po-human-approval.test.mjs` —
71/71 pass. `node harness/scripts/check-consumer-safe-paths.test.mjs` —
9/9 pass. Both are baselines for the next dispatch, not evidence of new
functionality.

Status left `open` — no implementation was made, so this is deliberately
NOT an "Implemented" section and the item is not closed.

## Option picked, 2026-08-25 (PO decision)

**Option 1**: build a genuine, reusable chat-mode gate primitive first (its
own dispatch, real architecture latitude inside `po-human-approval.mjs`/
`po-approval-gate.mjs`), then add the kickoff-parameter gate kind to it.
This supersedes the 2026-08-25 "Mode decided" section above insofar as
`chat` mode is no longer assumed to already exist as a joinable primitive —
it has to be built. Options 2 (copy the push one-off) and 3 (fall back to
`signature`) were not picked.

**Scope for the next dispatch:** design and implement a chat-mode gate-kind
registry inside the `po-human-approval.mjs`/`po-approval-gate.mjs` family,
generalized enough that a NEW kind (starting with kickoff `--language`/
`--profile`) can register into it without a bespoke one-off ceremony per
kind — the property `pipeline-state.mjs`'s `pendingPushChallenge` and
`human-guard-override.mjs`'s `activate: true` mechanism each lack today.
Whether it must support running before any commit exists (the original
brand-new-project case) is part of that design, not decided here — the
primitive's shape should make that an explicit, considered choice rather
than an accidental limitation inherited from copying the push ceremony.
Not started; needs its own `goldfish-deep` dispatch package built from
`templates/prompts/goldfish-task.md`.

## Scope widened, 2026-08-25 (PO clarification, chat)

The primitive should also cover the **PRD/Spec plan-approval → implementation
handoff** (`docs/operating-model.md` §4, "Human plan gate"), not just kickoff
`--language`/`--profile`. Today that gate is prose-only: "present a readable
PRD and wait for explicit approval before implementation... never inferred
from chat" — the exact same unenforced-instruction shape that motivated this
whole item, just for a different gate. **Explicitly OUT of scope for now:**
Change Requests ("CRs") — the PO named this as a third future consumer, but
said a separate issue for it is coming later; do not design for it yet.

**Overlap found, needs resolving before/during the dispatch, not decided
here:** plan approval already has a DIFFERENT, already-shipped mechanism —
`po-gate-authority.mjs`'s physical acknowledgement marker
(`PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER`) written into the PRD/spec text,
plus `state.poGateAcknowledgement = {by, at}` (closed backlog item
`2026-08-18-atomic-prd-approval-without-mutation.md`, commits `00b768cb`
.. `2e5d1c91`). That mechanism was deliberately built to require the PO's
own hands physically touch the document (ADR-0021 explicitly rejects "a
pure UI dialog as approval") — a materially different property than the
attribution-only `chat` mode this item's own investigation describes.
Before building anything, the next dispatch must read ADR-0021 and
`po-gate-authority.mjs` in full and answer: does the new chat-mode gate-kind
registry REPLACE the marker mechanism for plan approval (reopening
ADR-0021's rejected alternative — a PO product decision, not an
implementor's call), sit ALONGSIDE it as an option, or should plan-approval
stay on the marker mechanism entirely and only kickoff `--language`/
`--profile` (and later CRs) join the new chat-mode registry? If the answer
isn't a clean yes/no from the files alone, this is a stop-and-report
condition for that dispatch, not a design call to make silently — same
discipline `AGY-KICKOFFPOQ-1` already followed once on the mode question
itself.

## PO product decision, 2026-08-25 (chat) — REPLACE, standardize all three

**Resolves the overlap above.** PO: "alle 3 standardisieren und bauen das
es nicht so viele verschiedene Optionen gibt nur cr nicht" — standardize
all three (push, kickoff `--language`/`--profile`, PRD/Spec plan-approval)
onto the ONE new chat-mode gate-kind registry; the goal is explicitly
FEWER distinct approval mechanisms in this codebase, not more variants
sitting alongside each other. This picks the REPLACE option over ALONGSIDE
or stay-on-marker: `po-gate-authority.mjs`'s physical PRD-marker mechanism
is superseded by the new registry for plan approval, reopening (and this
time deciding) ADR-0021's "pure UI dialog as approval" question — the PO
has now made that call explicitly, it is no longer an implementor's guess.
**Still explicitly excluded: Change Requests ("CRs")** — a separate issue
is coming later; do not design for it. Relayed to the in-flight
`AGY-CHATADAPTER-1` dispatch, which had been briefed to treat the PRD/Spec
outcome as investigate-and-decide-only.

**Correction, 2026-08-25 (same day, after AGY-CHATADAPTER-1's report):**
the dispatch correctly DECLINED to act on the scope-change relayed via an
in-session message — its own briefing's field 4 never granted write scope
on `po-gate-authority.mjs`/ADR-0021/`docs/operating-model.md`, and per this
repo's own "dispatch from the template, never freehand" discipline, a
scope change of this weight (reopening an ADR's rejected alternative)
needs a properly-authorized dispatch, not a chat relay. This was the
CORRECT call by the dispatch, not a failure — noted so a future session
does not try to shortcut a formal dispatch amendment via SendMessage
again. The PO's standardize-all-three decision above stands; it needs a
fresh, properly-scoped dispatch with those files in field 4, not a
resumption message.

## Push half landed, 2026-08-25 (AGY-CHATADAPTER-1) — kickoff/PRD-Spec still open

**(A), the confirmed push self-approval hole, is DONE and independently
reverified** — see the now-closed sibling item
`2026-08-25-chat-mode-push-approval-has-no-enforced-human-turn-boundary.md`
for the full evidence. The reusable primitive it built,
`plugins/pipeline-core/lib/chat-gate-ceremony.mjs`
(`requireAttendedChatGateConfirmation()`/`isAttendedTerminal()`), is what
kickoff and PRD/Spec gating must now reuse — not a second, independently
invented mechanism.

**(B) scope correction, found by the dispatch itself, confirmed by direct
read of `references/kickoff-design.md:100-118`:** `--profile` is NOT a
valid flag on `kickoff plan`/`kickoff apply` at all — the guard's
exact-length argv match rejects it there. `--profile <epic|feature|mini>`
belongs only to `kickoff promote plan`/`apply` (binding the PRD/Spec
package to a feature ID), a later, separate step. This item's own
original "Triggering situation" (an agent invoking `kickoff plan` with a
hallucinated `--language` AND `--profile`) is therefore imprecise about
which subcommand a hallucinated profile would actually reach — not
retracted, since the underlying risk (an agent supplying either value
without asking) is real for both commands, just split across two call
sites. **Corrected scope for the next dispatch:** gate `kickoff plan`/
`kickoff apply`'s `--language` through `chat-gate-ceremony.mjs`, AND
separately gate `kickoff promote plan`/`apply`'s `--profile` through the
same primitive — two call sites, one reused mechanism, not one call site
with two flags as originally assumed.

**Not yet dispatched:** (B) corrected kickoff `--language`/`--profile`
gating, and (C) the PRD/Spec plan-approval standardization (needs
`po-gate-authority.mjs`/ADR-0021/`docs/operating-model.md` §4 properly in
field-4 write scope this time). Item stays `open`.

## (B) kickoff `--language`/`--profile` landed, 2026-08-25 (AGY-CHATADAPTER-2)

Both call sites named in the correction above are DONE and tested:

- `kickoff plan`/`kickoff apply --language <de|en>`
  (`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`) now requires
  `requireAttendedChatGateConfirmation()` (`lib/chat-gate-ceremony.mjs`) to
  pass before the value is accepted.
- `kickoff promote plan`/`apply --profile <epic|feature|mini>` (same file)
  gated independently, same primitive.

**Design deviation from this item's own earlier framing, decided in-dispatch
(advisor-reviewed), reported here rather than silently built in:** the
Background's push-derived shape — "challenge-generate-and-store on first
call … confirm-and-consume on a second" — is NOT what was built. Push's
`pendingPushChallenge` needs a place to persist a challenge between two
separate process invocations; `pipeline-state.mjs` has one
(`project/pipeline-state.json`). Kickoff has none: `kickoff-plan` is
declared `mutates: false`
(`ONBOARDING_SUBCOMMANDS` in `project-onboarding-v3.mjs`), and
`lib/project-onboarding-v3.mjs` itself documents (lines ~123–140) that no
project state file exists this early in onboarding — inventing a new
persistence location purely to hold a pending-challenge record would have
been exactly the "new one-off ceremony" `AGY-KICKOFFPOQ-1`'s investigation
already stopped short of building, and cuts against the PO's own
fewer-mechanisms goal. The gate built instead is **stateless and reused
as-is**: `requireAttendedChatGateConfirmation({ expected: <the value
itself>, ... })` runs synchronously inside the one CLI call an agent or a
human makes. An agent's own tool call is never attended
(`isAttendedTerminal()` checks real TTY-ness on fd 0 before any read) and
so can never complete it, no matter what value it already knows; a human
re-running the exact same command in their own attended terminal, typing
the value back, always succeeds. No random code, no expiry, no state
surviving between calls — the primitive's own docstring explicitly
sanctions `expected` being "a fixed word," which is what this is. Verified:
15 new tests in
`plugins/pipeline-core/scripts/project-onboarding-v3-argv-closure.test.mjs`
(unattended refusal, attended-seam success, wrong-value refusal, and a real
`spawnSync` piped-stdin subprocess refusal — the actual security proof —
for both `--language` and `--profile`), plus 8 pre-existing kickoff-CLI
tests in `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` updated
to thread the same attended seam (6 broke because of this change; 2 were
already broken by `AGY-CHATADAPTER-1`'s unrelated `--challenge`-flag
removal and are fixed here too since they live in the same file). Full
`lib/project-onboarding-v3.test.mjs` suite: 132/132 green.

**Product consequence for the PO to weigh, not decided here:** the kickoff
CLI is used programmatically today (fixture setup, orchestration) across
much of the test suite and, presumably, real sessions — every unattended
caller (including the agent's own normal orchestration) now refuses until
a human runs the command themselves and confirms. That is the intended
enforcement this item exists to build, not a bug, but it is a materially
different day-to-day flow than before and is worth the PO's explicit
sign-off if it turns out to add more friction than wanted in practice.

**(3) `intake-consent-apply --language`/`--profile`
(design SSa.5 point 1) — investigated, NOT implemented, genuinely different
shape:** `applyOnboardingIntakeConsent()`
(`plugins/pipeline-core/lib/onboarding-continuity.mjs`) accepts BOTH
`--language` and `--profile` optionally in ONE bundled call (`language =
null, profile = null`), unlike kickoff-plan/kickoff-promote-plan, which
each carry exactly one gated value — the primitive as reused here binds one
`expected` value per confirming call, not two independently-optional ones.
It is also already gated by its own pre-existing consent mechanism
(`granted !== true` → `INTAKE-CONSENT-REQUIRED`, plus mandatory
`--activate`) — a different, already-shipped human-consent property this
item's own investigation would need to reconcile with rather than layer a
second, structurally mismatched gate on top of. Left for a future,
separately-scoped dispatch to design; not attempted here per this
dispatch's own stop condition for this sub-part.

**Still not yet dispatched:** (C) the PRD/Spec plan-approval
standardization. Item stays `open`.
