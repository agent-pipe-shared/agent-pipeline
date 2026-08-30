# Usage

For a new project on the `0.6.0` candidate, use the runner's public Pipeline
start path after the PO has chosen to install it. Let the Driver inspect the
project and return the next action. It is the source of sequencing: follow its
structured action exactly, and replace only its declared human-input
placeholders. Do not reconstruct a sequence of internal onboarding commands.

The normal human stops are deliberate: give the requested project and author
details, choose or create the first trust anchor, answer the intake/design
questions, approve the plan, and provide the real verify command. Once the
Driver returns `ready`, implementation can begin under the normal plan and
evidence rules. A returned refusal, recovery state, or restart boundary is a
stop to resolve through its own public action, never a reason to edit generated
state by hand.

The automated Greenfield contract covers Claude, Codex, and Antigravity, but a
`0.6.0` candidate is not yet a release. Use [What's new in
0.6.0](whats-new-0.6.0.md) for the release boundary. Use
[PIPELINE_FLOW](../PIPELINE_FLOW.md) for the maintained V3 user journey,
[SETUP](../SETUP.md) to adopt it, and the
[Operating Model](operating-model.md) for normative roles, gates, and evidence.
