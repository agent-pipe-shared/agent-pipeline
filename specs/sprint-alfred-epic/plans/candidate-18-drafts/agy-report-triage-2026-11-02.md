# Candidate 17 intake: AGY greenfield report, triage against current source (2026-11-02)

Source: forensic report of the Antigravity (AGY) greenfield consumer run (11 PO turns, 1059 steps, 149 min active,
41 guard blocks / failures, plugin 0.7.0 at that time). The report is the consumer agent's own analysis. Every claim
below was checked against the CURRENT source of this repo; "verified" means read in code, "unverified" means taken
from the report only. Product findings (28 acceptance criteria, 1000-seed bench) are not pipeline scope.

## Blockers (AGY cannot reach the governed path)

PO observation 2026-11-02 (ranks B1/B2 first in 17): in the AGY greenfield the Elephant dispatched only the Critic;
everything else (design review, implementation, tests) the Elephant did itself. Counted in the report: 5 spawns tried,
4 blocked or hung, 1 admitted (the Critic) and that one stayed undelivered (0 own turns). No subagent ran in that
whole run.

B1. Implementation dispatch on AGY has no working productive route.
- Native `invoke_subagent` for goldfish-implementor / goldfish-mechanic is refused BY DESIGN:
  `antigravity-pretool-guard.mjs` (AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE; verified). The sanctioned route is
  `elephant-implementation-dispatch.mjs` (sealed session consent, child `agy`, timeoutMs 300000 in
  `elephant-agy-implementation-dispatch.mjs`; verified).
- Report: that route hung ~22 min (steps 341-460) inside WSL and the Elephant then wrote index.html + tests itself.
  Cause NOT established. The report blames `antigravity-host-handoff-failed`, but that string is a diagnostic of the
  transcript-recovery handoff writer in the pretool hook (verified), not of this route. Needs a measurement, not a guess.
- Report's proposal (accept planApproval as consent for native invoke_subagent) CONTRADICTS the documented design
  ("no authenticated parent-session identity", header of `elephant-implementation-dispatch.mjs`). Do not adopt without
  a PO decision.
- FINDING (read in code, after the first triage pass): `elephant-agy-implementation-dispatch.mjs` is documented as "the only
  supported productive Codex-to-Antigravity implementation entry": a CODEX-hosted Elephant dispatching to an AGY child, with
  `routeAuthority()` hard-requiring `duties.implement.antigravity` (opt-in; mechanic and deep are `unavailable` in the
  registry) and a stored AGY session consent. An AGY-HOSTED Elephant therefore has NO sanctioned implementation route:
  native is refused by design, and the refusal text sends it to the Codex-to-AGY route, which launches a nested `agy`
  from inside an `agy` session. The 22-minute loss is this design gap, not (only) a hang bug. The child launch itself has
  open stdin and SIGTERM-only kill (fixed in slice 13 so it is bounded either way).
- 17 handling: slice 11 makes the AGY-hosted case refuse AT ONCE with a typed code and a repair that says "no sanctioned
  implementation dispatch on Antigravity yet, ask the PO", and corrects the guard text. Building a native AGY implementation
  consent (the hook payload does carry a conversation id, `antigravityArtifactHostContext`) is a PO design decision for
  later, named at the end.
- Consequence in the run: segregation of duties lost (Elephant wrote code and tests, Critic finalized in main context).
- 17 scope: (a) reproduce/measure why the child never terminates within 300 s (or why the 300 s bound did not stop it),
  (b) the route must return a typed non-success inside its bound, never hang, (c) the refusal text of the native route
  must say what to run, per runner, (d) PO decision on the consent question (tile).

B2. AGY Critic is spawned but never delivered; finalized in the main context.
- `invoke_subagent` for `critic` was admitted, message stayed under `.system_generated/messages/undelivered/` because the
  parent kept working in the same turn (report; the delivery timing is runner behaviour, unverified here).
- `references/antigravity-native-dispatch.md` has no sentence about ending the parent turn after invoke_subagent (verified
  by search: no match). Doc gap, cheap.
- Matches handover item 9 (AGY past feature-close-prepared, AGY Critic host). Critic pause in this repo does not stop
  building the route; it stops running Critics here.
- 17 scope: doc sentence + refusal/hint text that tells the Elephant to end the turn; then the host/finalizer path as far
  as it is buildable without a real AGY run (name the rest as open gate).

## Majors

M1. `dispatch-briefing.mjs` has no AGY runner. `RUNNERS = ["claude","codex"]` (line 156, verified); every Gemini model id
    fails DBG-MODEL-FAMILY (claude path checks the agent definition's Claude alias family, verified). Report blames a
    registry sync between model-role-bootstrap and the briefing; the real cause is a missing runner branch.
    `dispatch-record-write.mjs` record-model (lines 269/337) shows the same binding problem for AGY records (report:
    v3 routing has no resolvable binding for goldfish-implementor on AGY; unverified in detail).
    Fix: `--runner antigravity` in the briefing generator checked against the AGY route of the V3 registry, record-model
    accepting the AGY declared route. Same shape as the Codex branch.
M2. `po-human-approval.mjs` design-approval signing shows `selected approval mode: signature (uncommitted)` and goes on
    (line 419 prints `mode.source`, only `optional` observation of pipeline.user.yaml, line 402; verified). approve-plan
    then refuses CAC-SOURCE-UNAVAILABLE and the PO signs twice (a live passphrase wasted). Fix: refuse BEFORE the
    prompt when the approval mode source is not committed/clean. Check the other sign-intent kinds for the same gap.
M3. Read-only reviewers on AGY: the agent first used TypeName `research` (not a Pipeline role) and got
    DISPATCH-WRITE-CARRIER-REQUIRED. That refusal is correct (`writeCapableCarrierAdmission` admits readiness-reviewer,
    critic, plan-verifier, consult-advisor; verified), the report's claim "guard blocks read-only roles" is wrong. What is
    real: the refusal text does not say "use pipeline-core:readiness-reviewer", and the next AGY step
    (AGY-NATIVE-ARTIFACT-MISSING, `antigravity-native-dispatch-coordinator.mjs`) needs a prepared artifact with
    an under-documented JSON shape (DISPATCH-PACKET-INVALID, DISPATCH-MODEL-MISSING, RDB-PREPARATION-FAILED: report
    #7-#9). Fix: refusal text names the admitted carrier and the prepare command; example packet in the reference.
M4. Close chain legibility (report P5, ~15 commands, undocumented schemas): `pipeline.critic-evidence-reference.v1`
    fields, `session-critic-finalizer` admit vs finalize + request shape (SCF-REQUEST), `critic-dispatch-preflight`
    argument shape (CDP-ARGUMENT, `--range`), feature-package state steps and `--activate` only on register,
    `dispatch-record-write` repo-relative request paths. For 17: refusal/hint texts name the next command and show the
    field list (extends handover item 6). Orchestrating the chain inside close-coordinator is a design change: ask
    the PO whether it belongs in 17 or 0.7.1.
M5. Push threat model: `prepare-push-subject` fails CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE with no remedy, while
    `push-prepare.mjs` (line 310) already names `pipeline-state.mjs materialize-push-threat-model`. Fix: same remedy text on
    the prepare-push-subject path; whether the close commit should already carry the file is a PO question (the
    file makes the tree dirty after close).
M6. Observation boundary is tool-level only (report 4.3.3): a `node scratch/x.mjs` run can read outside the repo. Do not
    claim hermetic. Goes into the runner-capability table (handover item 4) as an honest row, per runner.

## Minor (not in 17)
CLI overwrite behaviour of design-review-wrapper / receipt-create (DWP-REQUEST-EXISTS-DRIFT, DRC-OUT-EXISTS); `--help`
reference; auto-activation of git hooks and topology refresh after kickoff-promotion-apply; re-running bootstrap after
Compact (the Compact rule already says no); end-user README not required; short sign wrapper instead of the CMD block (P6);
turn hygiene (turn ended before the chain finished, no explicit "feature already closed" line).

## Not pipeline defects (working as designed)
GIT-03 Dispatch-trailer block, read-scope and credential-root blocks, node -e block, remote-missing for security-scan,
state machine transitions, kickoff clean tree.

## Signals for the PO (not scope)
72.4 % of tokens went to pipeline administration and guard recovery in a 785-line single-file product; the report calls
the AGY runner a conditional no-go until B1/B2 work. Strengths named: signature binding, scope guards, audit bundle.

## Proposed 17 slices (after slice 10)
11 AGY briefing runner + record route (M1)
12 sign-intent pre-prompt refusal (M2)
13 AGY dispatch refusals/hints/examples: write-carrier text, prepare packet example, end-turn sentence (M3, B2 doc)
14 close-chain hints and schemas (M4) + threat-model remedy (M5)
15 B1 measurement + typed bound for the implementation route (after the PO tile on consent)
16 capability table row for the observation boundary (M6, with handover item 4)
