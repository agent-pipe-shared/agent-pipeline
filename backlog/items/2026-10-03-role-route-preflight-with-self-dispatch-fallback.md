---
schema: pipeline.backlog-item.v1
id: pipeline.role-route-preflight-with-self-dispatch-fallback
type: requirement
owner: pipeline
status: open
created: 2026-10-03
source: "PO requirement after the 0.7.0 three-runner greenfield tests, 2026-10-03; Claude Advisor producer failed silently (Claude test repo analysis V-2, V-11), Antigravity lacked Critic/Advisor routes."
sprint: alfred
done_when: manual
---

# Fast role-route preflight with a recorded self-dispatch fallback

## Description

**PO requirement:** the Pipeline is too restrictive when a role route fails.
For every runner there must be a quick preflight that checks whether the
Advisor, Critic, Goldfish and readiness routes actually work in this
environment. If a route does not work, the agent takes the role skill's prompt
(the canonical template) and dispatches it internally through the runner's own
subagent mechanism. The fallback is recorded in the result, and the work
continues. Agents must be able to take the admitted paths themselves and
dispatch skills without ceremony when something does not run as designed.

Observed: in the Claude run the formal Advisor producer failed with
`producer-output-invalid` and no surfaced stderr. A free `consult-advisor`
dispatch delivered real value (15 findings) but was not accepted by the formal
course: 17 minutes and 172k tokens of duplicate work. Claude could not use the
Advisor at all through the formal route.

## Acceptance

- A typed, read-only route preflight per runner reports, for each role, either
  `native` or `fallback-self-dispatch` with a reason code.
- With `fallback-self-dispatch`, the agent dispatches the canonical role
  template through its native subagent tool. The result record carries
  `route: fallback-self-dispatch` plus the failing reason. The course accepts
  that result as the role's evidence, with an honest assurance label instead of
  a refusal.
- Independence (fresh context, read-only for Critic and Advisor) and the
  template-only briefing rule stay intact. A fallback never lets the
  implementor review itself.
- Failing producers surface their stderr and exit code in the session result.

## Observed 2026-10-17: a Goldfish receives an Elephant-only action from preflight (major for 0.7.0)

Source: PO-supplied forensic analysis of the Codex WSL greenfield run, finding P1-1
(partially confirmed; call counts are owner self-reports).

- The first kernel owner (a Goldfish) ran an onboarding step that only the Coordinator may
  run, after a `ready` preflight handed it that action. A later correction was correctly
  refused as an unauthenticated amendment, but no usable recovery state existed.
- A replacement owner left twelve uncommitted files, exceeded the call cap (self-report:
  37 work calls against 20 + 5), and twice hit `spawnSync EPERM` at the Codex default
  sandbox edge before using the host boundary. No product commit or host dispatch record
  resulted, although the later checks were green.

Added acceptance (0.7.0, major):

- The preflight result is role-dependent: for a Goldfish or Critic it never carries an
  executable Elephant/Coordinator action (onboarding, hook refresh, attestation).
- Admitted test commands are routed to the declared host boundary from the first call, so
  a Goldfish does not burn attempts on a sandbox `EPERM`.
- When an owner dispatch fails or is refused, the course offers an explicit, atomic
  recovery state that keeps the same task identity and attempt history; neither a chat
  message nor a renamed task can stand in for it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D125) — Decide how the retired course is re-targeted so it can consume a fallback result as role evidence
  Acceptance says 'the course accepts the fallback result as the role's evidence', but the course it names is retired; the target for that acceptance is undefined.
- **HOST-SESSION-NEEDED** — Check the host-boundary route against a live Codex sandbox
  The spawnSync EPERM at the Codex default sandbox edge and the declared host boundary only occur inside a live Codex session (codex app/CLI turn); an agent may not drive an authenticated Codex turn. Observed: admitted test commands route to the host boundary from the first call with no EPERM.
