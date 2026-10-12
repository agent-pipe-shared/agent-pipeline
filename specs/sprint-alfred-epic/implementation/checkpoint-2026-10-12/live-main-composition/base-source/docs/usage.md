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
project/intake answers, and a plan decision where the selected profile requires
it. A real full Verify command is required before release,
while new projects begin with the shipped, explicitly labelled baseline. The Driver retains approved
onboarding context across its restart boundary so the next session does not
need to rediscover it.

A trust anchor is not a routine onboarding input. Prepare one only when the
project deliberately configures a human decision gate that requires the
signature path; see [the one-time human-approval key setup](../SETUP.md#human-approval-key-one-time-setup).

A refusal, recovery result, or restart boundary is also an action contract.
Use its named public recovery step; do not edit generated state or guard files
by hand to move past it.

## Verify a consumer project

Use the installed plugin's `scripts/verify-evidence-producer.mjs` as the
Verify invocation in your project. It runs your one configured product command
alongside the general pipeline checks, then records progress, individual
results, and candidate-bound evidence through the Verify journal. Running the
configured product command by itself runs product checks, but does not create
the Verify receipt.

New onboarding creates the project adapter. To prepare an existing project,
run `node <plugin-root>/scripts/verify-evidence-producer.mjs --prepare --root
<project-root>` and commit the resulting `project/consumer-verify.mjs` with
the project changes. Preparation preserves your configured verify command;
it does not replace your tests. A conflicting adapter is reported for repair.

On the clean committed candidate, choose the boundary explicitly. `work`,
`critic`, and `push` select the fixed baseline plus commands registered for
changed areas from the supplied base. `candidate` and `release` always run the
full project command. Unknown paths, missing bindings and incomplete policies
also fall back to full. One installed runner is enough for a consuming project;
Verify does not require accounts or installations for the other two runners.

Choose **one** command for the boundary you are at; the five lines below are
alternative invocations, not instructions to run every mode. A final
`candidate` run follows the required Critic review. Supply that boundary's
reviewed base and run the evidence producer once:

Obtain the base from the boundary already under review: the task's starting
commit for `work`, the Critic packet's review base for `critic`, the approved
integration base for `candidate`, the verified remote preimage for `push`, or
the release plan's base for `release`. Resolve it to an exact commit before
invocation; do not guess `HEAD~1` or use a moving remote ref. If there is no
reviewed base, omit `--base` and accept the producer's full-run fallback.

```bash
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode work --base <work-base>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode critic --base <review-base>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode candidate --base <candidate-base> --critic-packet-id <reviewed-packet-id>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode push --base <remote-base>
node <plugin-root>/scripts/verify-evidence-producer.mjs --root <project-root> --mode release --base <release-base> --critic-packet-id <reviewed-packet-id>
```

Use `critic` mode for pre-review diagnostics; a failing or not-yet-run Full
Verify can be disclosed to the Critic without claiming a final PASS. The
`candidate` line above is the Critic-bound final run: its packet is checked
before existing evidence is replaced. A same-candidate deterministic rerun
may use `--critic-reverify-receipt-id <id>` instead of the packet ID. An
unbound `candidate` run remains diagnostic and does not by itself prove the
required Critic/Verify lifecycle or authorize release.
After a clean exact-candidate run, check the installed plugin's read-only
qualification consumer:

```bash
node <plugin-root>/scripts/check-critic-bound-verify.mjs --root <project-root>
```

It reports whether canonical Verify evidence still matches the project checkout and
the consumed private Critic packet. A green diagnostic run, a dirty checkout
or missing private review evidence remains unqualified; this check does not
grant release or publication authority.

Add `--no-reuse` when a race, flake, or environment check must execute every
selected suite again at the same commit. The default continues to reuse valid
receipts. Public evidence records `verifyRun.receiptReuse` as `disabled` or
`allowed`, and each step records whether it was reused.

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

The human-approval strength is a separate, deliberately configured choice;
the default is the signature path. The [selector reference](#choose-the-human-approval-strength-deliberately)
explains its limits. No delivery step silently changes the approval mode.

There is no cross-runner cost or delivery-time estimate for this project.
Treat the [measurement boundary](cost-and-measurement.md) as transparency
guidance, not as a reason to widen concurrency or autonomy.

1. Split independent, non-overlapping packages so they may run in parallel.
2. Give each implementor a bounded goal, exact context paths, acceptance checks,
   prohibitions, and stop conditions.
3. Run the applicable targeted deterministic and security checks, then the
   Critic preflight.
   A candidate-bound Critic-mode [Verify evidence producer](#verify-a-consumer-project)
   receipt or validated diagnostic may admit review; Full Verify is still pending.
4. Run the independent Critic review; profile and risk determine its depth and route.
5. After corrections and any required delta review, run Full Verify on the
   reviewed candidate with its consumed Critic evidence. The final receipt
   includes the configured security outcome for that exact candidate. Record
   the outcome and close the feature only when its tracked work is complete.

Several independent, low-risk dispatches may share one predeclared, bounded
collection block: retain each task's targeted checks, review the combined
diff once, then run one Full Verify. Architecture, guardrail or security work
does not gain this batching exception. Keep a coherent feature scope separate
from the smaller, independently owned dispatch scopes; a shared checkout is
not isolation for parallel writers.

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

Before using this selector, check that the installed runtime recognizes it.
Until it does, keep the action-local settings documented by
[ADR-0056](adr/0056-push-approval-mode.md) (`gates.push_approval`, and where
supported `gates.reconcile_approval`). They remain `signature` by default. Do
not add the new key and assume it has a global effect until configuration
validation and runtime readback show that the installed version supports it.
See [ADR-0076](adr/0076-global-chat-attributed-unattested-approval-mode.md) for
the full decision and migration boundary.

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

## Assess architecture adoption in an existing project

This is a preview of the forthcoming `0.7.0` distribution, not an instruction
to run commands that may be absent from an older installed release. First
read back the installed plugin version and root in a fresh `pipeline-start`
session. Use these commands only when that installed version contains the
architecture-adoption CLI; otherwise follow the currently installed release's
documented path and wait for the approved update.

Architecture adoption begins with two read-only commands from the installed
plugin. Run them in the repository that you intend to govern; they inspect that
repository only and do not create maps, baselines, or a decision.

```bash
node <plugin-root>/scripts/architecture-adoption.mjs status --root <project-root> --json
node <plugin-root>/scripts/architecture-adoption.mjs propose --root <project-root> --json
```

`adoption-required` means the project has neither a usable architecture
baseline nor a valid adoption decision. The proposal is a four-stage planning
aid, not a pass or an authorization. The repository owner chooses whether to
adopt a bounded scope, defer it with a review/expiry date, or record a partial
scope through the normal human-decision route. Do not hand-write
`architecture/adoption-state.json`.

If a valid decision already exists but the physical map index is missing, the
bootstrap still offers this read-only, map-first proposal. Its
`decisionOptions` are empty: materializing the map does not ask the owner to
repeat a still-valid adoption decision. A later ordinary commit does not by
itself expire a deferral; its recorded review/expiry date or explicit
supersession controls that status. The map and fitness checks at the
implementation boundary remain separate from the bootstrap readback.

For a decision, the installed CLI's `prepare` command builds the exact request
from the selected decision, scope, rationale, decision reference and dates.
Review that request before using `apply` with the same arguments and its
matching `--request` plus authority evidence. In signature mode that evidence
is a separately produced `--proof`; in an explicitly configured, low-consequence
chat mode it is an intent-bound `--chat-approval` record, not a signature or
human-identity attestation. `apply` rejects missing, stale or mismatched
authority. Check the resulting `status` and the intended task scope with the
CLI's `check --scope` before treating the disposition as planning authority.

A deferred decision is not tied to an ordinary Git commit. It remains valid
until its declared review or expiry date, explicit supersession, or a changed
decision. Before work that depends on the architecture controls, the planning
boundary checks the current decision and scope; it fails closed if the
decision is absent, expired, malformed, or out of scope.

For a new repository, complete the guided initial design before implementation:
the onboarding flow materializes its first map index and module concepts from
that design. The generated entry pointer is navigation, not adoption approval
or proof that code conforms. For an existing repository, review the staged
proposal against its real modules and decisions, obtain the required adoption
disposition, and update the map without replacing existing architecture files
wholesale. A deferral may remain the correct disposition; do not manufacture a
map merely to make `status` look adopted.

Once a map exists, check the machine-readable module inventory and its derived
human overview from the consuming project root. `--check` is read-only; after
changing the map sources, `--write` regenerates only the overview HTML. Do not
edit the generated HTML as an independent architecture authority.

```bash
node <plugin-root>/scripts/module-inventory.mjs --root <project-root> --check
node <plugin-root>/scripts/generate-architecture-overview.mjs --root <project-root> --check
node <plugin-root>/scripts/generate-architecture-overview.mjs --root <project-root> --write
```

For an auditor, hand over the map index and module concepts, the applicable
ADRs or compiled decision summary, the current adoption decision and its
separately verified authority evidence, and the candidate-bound fitness
result. An [Audit Bundle](audit-bundles.md) can collect registered feature
artifacts for offline byte-integrity checks; it does not by itself establish
source provenance, deployment, approval or regulatory compliance.

## Private review export

Private review export can reuse one repository-scoped consent decision while
keeping secrets, credentials, caches, transcripts, and unrelated projects out
of scope. The exact provider, service, paths, digests, revocation behavior, and
host-permission boundary are maintained in [runtime boundary](runtime-boundary.md#private-review-export-consent).
Ordinary Critic execution remains agent work; changing the recipient or data
boundary requires an amended decision.

## Know the boundary

The three-runner Greenfield Driver contract covers Claude, Codex, and
Antigravity without asserting identical native enforcement across hosts.
Publication still needs Verify, security, independent review, approval, and
remote readback. The [current release status](overview.md) distinguishes
source implementation from candidate acceptance and installed availability.

Use [SETUP](../SETUP.md) for installation, [PIPELINE_FLOW](../PIPELINE_FLOW.md)
for the maintained lifecycle, and the [documentation map](README.md) for the
canonical next links. Consult [enforcement](enforcement.md), [audit and
evidence](audit-and-evidence.md), [security controls](security-controls.md),
[cost and measurement](cost-and-measurement.md), and [parallel work](parallel-work.md)
when those boundaries apply. [Operating Model](operating-model.md) remains the
normative role and gate contract.
