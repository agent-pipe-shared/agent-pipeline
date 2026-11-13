feat(onboarding): ask for the required tools at the first install, with a deferral

PO tile 2026-11-12: the agent shows each missing required tool with its route,
the person installs it in their own terminal or defers it, and the deferral is
recorded; the existing plan and close checks stay.

- the onboarding consent lists the tool check as a covered item; only the
  deferral record (toolchain-defer.mjs) is a covered action
- the start skill's onboarding reference says how: required scanner findings
  of environmentReadiness, the doc section, install now or later, never an
  installer run by the agent, unknown findings are no reason to install

AI-Assisted: true
Dispatch: stage-0 (elephant)
