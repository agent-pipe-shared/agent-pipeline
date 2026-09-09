---
schema: pipeline.backlog-item.v1
id: pipeline.standing-critic-consent-reprompts-host-approval
type: requirement
owner: pipeline
status: open
created: 2026-09-09
source: "PO-requested investigation, 2026-09-09; durable standing-consent and reprompt observations in backlog/evidence/2026-09-09-local-candidate-po-decisions.md and backlog/evidence/2026-09-09-standing-critic-consent-reprompt.md."
sprint: none
done_when: manual
---

# Standing Critic consent re-prompts host approval for the same review scope

## Description

The PO has granted standing, repository-scoped consent for genuine Critic
reviews through the configured Codex route, including the necessary private
review inputs. During preparation of a later review in that same established
scope, the host automatic approval layer nevertheless rejected payload and
destination approval before a Critic child process was created. The PO then
reapproved the concrete operation and requested that recurring consent be
investigated and redesigned for the backlog.

This is a requirement to avoid repeated approval prompts for a previously
authorized Critic scope. It is not evidence that a repository hook is faulty,
nor authority to bypass arbitrary host or service security policy.

## Triggering situation

On 2026-09-09, the standing consent record named the repository, the configured
Codex Critic route, and necessary private review inputs. A later private
candidate-review request was rejected by automatic approval before process
creation, then explicitly reapproved by the PO. After that reapproval, a
separate selected-transport result ended before child creation with
`selected-sandbox-required`; that transport result is distinct from the consent
repetition and must not be used as proof of its cause.

## Affected artifact

- External host automatic-approval policy and its durable-scope capability,
  which is outside repository control and must be investigated rather than
  assumed configurable.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` — prepares the
  repository-side Critic request and must expose only truthful approval context.
- `plugins/pipeline-core/scripts/codex-critic-host.mjs` and
  `plugins/pipeline-core/scripts/codex-critic-selected-host.mjs` — selected
  transport and pre-child failure reporting must remain distinguishable.
- `plugins/pipeline-core/skills/critic-review/SKILL.md` and
  `templates/prompts/critic-review.md` — operator-facing consent and failure
  wording must state the external boundary accurately.

## Proposal

Run a bounded design investigation before changing enforcement. First establish
whether the host offers a supported durable approval capability for this exact
action. If it does, bind a standing consent record to repository identity,
Critic purpose, configured destination identity, permitted private-input
classes, provenance, expiry, and revocation. Repository code may present that
truthful, bounded context to the host, but must not claim to grant or suppress
host approval itself.

Acceptance must demonstrate that a repeated request with the same valid scope
does not prompt again, while a changed repository scope, destination, private
input class, expiry/revocation state, or Critic purpose is refused or requires a
new decision. The implementation must preserve a visible typed distinction
between host approval rejection and `selected-sandbox-required` before-child
transport failure. It must neither send a private payload nor start a provider
child while approval is absent or rejected.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** pending.
- **Rationale:** Future scheduling and the host capability are unconfirmed.
- **Assignment (if accepted):**
- **Date:**
