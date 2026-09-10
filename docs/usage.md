# Usage

Use Agent-Pipeline when the result needs to be recoverable, reviewable, and
safe to hand between agents or sessions. It is particularly useful when a team
must inspect which candidate was checked and which decision was made. The
resulting evidence supports review and audit work; it is not compliance
certification.

## Start or adopt a project

After the PO has chosen to install the pipeline, start through the runner's
public Pipeline-start path. For a new project, let the onboarding Driver inspect
the directory and return the next structured action. It owns the sequence:
follow the action as returned and replace only its declared human-input
placeholders. Do not rebuild a private sequence of onboarding commands.

The ordinary human inputs are purposeful: project and author details, the
first trust-anchor choice (an existing key is valid, as is a newly created
one), the project/intake answers, and a plan decision where the selected
profile requires it. A real full Verify command is required before release,
while new projects begin with the shipped, explicitly labelled baseline. The Driver retains approved
onboarding context across its restart boundary so the next session does not
need to rediscover it.

A refusal, recovery result, or restart boundary is also an action contract.
Use its named public recovery step; do not edit generated state or guard files
by hand to move past it.

## Verify a consumer project

Use the installed plugin's `scripts/verify-evidence-producer.mjs` to run
Verify in your project. It combines general pipeline checks with your existing
configured product command, and records progress, individual results and
candidate-bound evidence through the Verify journal.

New onboarding creates the project adapter. To prepare an existing project,
run `node <plugin-root>/scripts/verify-evidence-producer.mjs --prepare --root
<project-root>` and commit the resulting `project/consumer-verify.mjs` with
the project changes. Preparation preserves your configured verify command;
it does not replace your tests. A conflicting adapter is reported for repair.

On the clean committed candidate, run
`node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root>`.
Choose the boundary explicitly and supply the reviewed base:

```bash
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode critic --base <review-base>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode push --base <remote-base>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode release --base <release-base>
```

`work`, `critic`, `candidate`, and `push` run the fixed baseline plus commands
registered for changed areas. `release` always runs the full project command.
Unknown paths, missing bindings and incomplete policies fall back to full.

The fixed baseline validates project authority and a present runtime manifest,
tracked JSON syntax, merge-conflict markers, and `git diff --check`. If no
product command exists yet, ordinary evidence is marked `baseline-only`; it
does not establish product-test coverage and release mode refuses it.

Projects can add a `verifyImpact` object to their calibration. Each baseline or
area command has a stable id; each area declares repository-relative paths.
The schema and example are in [ADR-0081](adr/0081-boundary-aware-impacted-verify.md).
The existing `verify` field remains the full project command.

Eligible baseline results can resume on the same bound candidate; the opaque
project command runs freshly. A changed candidate, failed run or interrupted
attempt cannot borrow an old green result as current evidence. Resolve
`<plugin-root>` from the installed pipeline, not a source checkout path.

## Deliver work after readiness

Once the project is ready and any required plan gate is recorded, delivery
continues autonomously within that approved scope:

1. Split independent, non-overlapping packages so they may run in parallel.
2. Give each implementor a bounded goal, exact context paths, acceptance checks,
   prohibitions, and stop conditions.
3. Run the configured verify command and any applicable security checks.
4. Run the independent Critic review required by the profile and risk.
5. Record the outcome and close the feature only when its tracked work is
   actually complete.

The human remains the decision owner for material scope changes, configured
approvals, and remote or otherwise irreversible actions. Routine task ordering,
test fixes, evidence collection, and follow-up within an approved plan are
delivery work, not extra approval turns.

In your project, the agent also handles ordinary Critic execution: after the
required plan and deterministic checks, it prepares the bounded review input,
starts and monitors the review, reads the actual result, and continues authorized
repairs. You do not need to approve the review again or routinely launch it in
a terminal. The agent uses the host's normal permission mechanism when needed;
actual denials or unavailable execution are reported, never bypassed. Host
capabilities vary. This workflow preserves expressly defined human gates,
review admission, isolation, and correction/review limits.

## Choose the human-approval strength deliberately

The optional repository-wide selector is `gates.human_approval` in
`pipeline.user.yaml`:

```yaml
gates:
  human_approval: "signature" # or "chat"
```

`signature` is the default and the only strong, cryptographically attested
option. It uses the applicable signing and trust-policy path. Choose `chat`
only for a repository the PO has deliberately classified as low-consequence
and non-critical. In that mode, an explicit answer in the chat can be recorded
by the agent as `chat-attributed-unattested`; it needs no key, trust anchor,
human terminal command, copy-paste command, or UI/host/TTY attestation. It is
therefore not proof that a human, account, or device supplied the answer.

Do not use `chat` for security-sensitive, regulated, production-critical,
financially consequential, or otherwise valuable repositories. Tests, action
bindings, and other safety rules still apply, but none turn the chat answer
into an attestation.

This is a forward-compatible policy, not an assertion about every installed
plugin. Before an installed runtime recognizes `gates.human_approval`, retain
the action-local settings documented by [ADR-0056](adr/0056-push-approval-mode.md)
(`gates.push_approval`, and where supported `gates.reconcile_approval`). They
remain `signature` by default. Do not add the new key and assume it has a
global effect until configuration validation and runtime readback show that the
installed version supports it. See
[ADR-0076](adr/0076-global-chat-attributed-unattested-approval-mode.md) for the
full decision and migration boundary.

Private review export can reuse one repository-scoped consent decision while
keeping secrets, credentials, caches, transcripts, and unrelated projects out
of scope. The exact provider, service, paths, digests, revocation behavior, and
host-permission boundary are maintained in [runtime boundary](runtime-boundary.md#private-review-export-consent).
Ordinary Critic execution remains agent work; changing the recipient or data
boundary requires an amended decision.

## Know the boundary

`0.6.2` names the next release's documented scope; it is not a tag,
installation recommendation, or availability claim. The three-runner
Greenfield Driver contract is covered for Claude, Codex, and Antigravity, but
coverage is not a claim of identical native enforcement across hosts.
Publication still needs its own Verify, security, independent review,
approval, and remote readback. Nova B remains open for further runner and
workflow refinements.

Use [SETUP](../SETUP.md) for installation, [PIPELINE_FLOW](../PIPELINE_FLOW.md)
for the maintained lifecycle, and the [documentation map](README.md) for the
canonical next links. Consult [enforcement](enforcement.md), [audit and
evidence](audit-and-evidence.md), [security controls](security-controls.md),
[cost and measurement](cost-and-measurement.md), and [parallel work](parallel-work.md)
when those boundaries apply. [Operating Model](operating-model.md) remains the
normative role and gate contract.
