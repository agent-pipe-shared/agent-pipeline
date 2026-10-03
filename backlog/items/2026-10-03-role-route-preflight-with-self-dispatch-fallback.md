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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
