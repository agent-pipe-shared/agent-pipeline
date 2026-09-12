# Human-terminal action templates — decision-grade design

Date: 2026-09-12
Candidate inspected: `d9268ede41f1bb01dec15cd043b8e5657f8f8342`
Backlog item: `pipeline.template-scripts-for-human-terminal-actions`

## Recommendation

Build a small declarative catalog and one generic action preparer/launcher. Do
not ship handwritten shell snippets and do not add another quoting, approval,
signing, installation or review implementation. A catalog entry names an
existing driver builder and its typed inputs. The preparer resolves and
validates every input, writes one local digest-bound request plus a short
platform launcher, and renders the invocation through the existing
`renderHumanCopySafeCommand()` path. The launcher revalidates the request and
then calls the existing driver without a shell.

This preserves the useful part of the PO's proposal — a runner fills a small,
clearly marked form instead of composing a command — while avoiding a second
source of truth for long argv lists. It also catches a bad value before the
human waits through a command that was doomed at launch.

The design is runner-neutral. It neither depends on Claude hooks nor claims
native Codex Sandbox/App Server support under WSL; that work is explicitly
deferred.

## Evidence and authoritative action inventory

The original three-runner result says Antigravity advanced quickly through the
first two phases partly because it generated helper scripts itself. The later
0.6.2 synthesis in
`backlog/evidence/2026-09-11-greenfield-062-three-runner-findings.md` still
records roughly 42–55% estimated governance/administration share and two
back-to-back human signatures in one Claude workflow. The older measured
failure is stronger than an ergonomic preference: long manually assembled HGO
commands wrapped mid-token and failed after copy/paste. The closed
`pipeline.universal-human-command-renderer` item fixed those known rendering
sites, so this design must extend that implementation rather than recreate it.

`docs/human-authorization-inventory.md` and
`harness/scripts/check-auth-gate-inventory-drift.mjs` are the single
authoritative inventory and coverage checker. The template feature extends
that inventory with template disposition metadata; it does not create a
second producer list or checker. Every current inventory entry is disposed
below.

| Existing authorization entry | Terminal-template disposition |
| --- | --- |
| Push (`kind: push`) | Already rendered by `pushPrepareReport()` and `authorizeCriticalPushCommand()`. Register the existing builder output as a compatibility consumer; keep its candidate binding and ceremony unchanged. |
| Deploy (`kind: deploy`) | Register as a typed critical-action variant only through the existing `po-human-approval.mjs` builder and proof verifier. Do not duplicate the ceremony. |
| Publication (`kind: publication`) | Same critical-action-family treatment as deploy, using the existing builder and verifier. |
| Feature-package reconcile (`kind: feature-package-reconcile`) | Same critical-action-family treatment; preserve its existing subject and candidate binding. |
| Release preflight consent (`kind: release-preflight`) | Same critical-action-family treatment. A template can fill and render the existing request, but cannot weaken or rename this gate. |
| Governance fork disposition (`kind: governance-fork-disposition`) | Register its existing `prepare-fork-disposition`, `approve-fork-disposition` and `verify-fork-disposition` state-machine steps. Do not coerce it into an ordinary critical-action variant. |
| Generic critical-action wrapper (`kind: critical-action`) | Abstract builder-family metadata only. It is not separately discoverable or executable because concrete variants carry the actual kind. |
| Guard Maintenance Window (`kind: guard-lift`) | Template only the externally signed step emitted by the existing GMW state machine. Install, lift and readback remain owned by `guard-maintenance-window.mjs`. |
| Human Guard Override (`kind: guard-override`) | Already rendered by `guard-human-override.mjs` and its guard consumers. Add discovery metadata and byte-equivalence coverage only; retain its state machine. |
| Threat-model approval (`kind: threat-model`) | Admit only when its current producer supplies the exact intent/request and existing verifier. No free-form generic launcher is allowed. |
| Security-authority proof (`kind: security-authority`) | Same constrained admission as threat-model approval: existing producer, exact intent/request and existing verification. |
| Plan/PRD approval (`approve-plan`) | Deliberately outside the Ed25519 proof family. If a terminal action is useful, register only the existing PO-gate-authority flow and preserve its approval mechanism. |
| PO-authority rebind (`po-authority-rebind-plan` / `-apply`) | Multi-step state-machine workflow. Template only exact existing transitions; keep the amendment record authoritative. |
| PO-authority decision (`po-authority-decision-plan` / `-select` / `-apply`) | Multi-step state-machine workflow. Template only exact existing transitions and do not merge it with signature actions. |
| Push chat mode | Keep the attended-TTY chat gate and attribution record. It gets no external launcher unless its producer explicitly returns an external-terminal action. |
| Deploy/reconcile waived mode | No terminal action. The committed waiver remains authoritative and is explicitly excluded from the catalog. |
| Kickoff language confirmation | Keep the attended-TTY chat ceremony. It is explicitly excluded from the generic launcher. |
| Remote provisional approval | Keep the hashed one-time-code mechanism and its rejection from critical flows. It gets no proof-template shortcut. |

The inventory's explicitly out-of-scope mechanical transitions (`set-*`,
`submit-plan`, `reopen-design`, `seal-plan-approval`, `revoke-plan`,
`bind-plan-spec`, `close-feature`, `continuity-*`, and
`authority-revision-*`) remain excluded: they do not independently request a
human decision and therefore must not acquire terminal templates merely from
this feature.

The same authoritative inventory should also classify non-authorization human
actions which need copy-safe rendering without calling them gates: onboarding
restart (`restartCopyCommands()`), installed-plugin attestation setup
(`installedPluginAttestation.setupAction`), first PO-key setup, and user runner
installation/update. Protected-source author-repair actions remain the exact
structured actions emitted by their guards. Verify, deterministic repair and
normal Critic review remain in-session operations and are excluded. Developer
marketplace sync/source switching is a later, separately identified audience.

Raw `remedy` text is never automatically a human action. Admission uses the
exact boundary tuple supplied by the producer. Current values include
`executionBoundary: "host"`, `"external-terminal"`,
`"attended-external-terminal"`, and `"local-process"`, plus the independent
`invocation: "user-copy-only"` and `codexToolCallPermitted: false` fields. The
catalog preserves these values byte-for-byte and does not normalize them into
a new boundary vocabulary.

## Reuse boundary

The following current primitives remain authoritative:

- `boundedCopySafeCommand()`, `renderHumanCopySafeCommand()`, `placeholder()`
  and `forcedQuote()` in `plugins/pipeline-core/lib/copy-safe-command.mjs`;
- `shellWord()`, `renderProjectOnboardingAction()`,
  `restartCopyCommands()` and `boundedOpaqueCopyCommand()` in
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs`;
- the action-specific builders and state machines named in the inventory.

`copy-safe-command.test.mjs` already proves the 72-column bound, exact argv
round trips through available real shells, visible unresolved placeholders,
and non-expansion of `$`, backticks and command substitutions. The new layer
must consume these outputs byte-for-byte. It must not implement quoting or line
wrapping itself.

## Proposed contract

### Shipped catalog

Store immutable metadata under
`plugins/pipeline-core/templates/human-terminal-actions/catalog.json` with
schema `pipeline.human-terminal-action-catalog.v1`. One entry contains:

- stable `id`, `revision`, concise purpose and audience (`user` or
  `developer`);
- `builderId`, resolved by a closed code registry to an existing action
  builder; the JSON does not duplicate the builder's argv;
- the producer's exact `executionBoundary`, `invocation`,
  `codexToolCallPermitted`, `mutation`, and `requiresPoApproval` fields. A
  terminal action is not thereby a PO gate;
- an ordered slot list and an expected-result/readback contract;
- supported runner and platform sets, with `all` permitted only when the same
  builder and result contract really apply.

The closed builder registry is essential. An arbitrary executable or argv in a
template would turn the catalog into a general command launcher and would
discard the safety gained by pointing at reviewed drivers.

### Placeholder schema

Each slot has exactly these fields: `name`, `type`, `source`, `required`,
`sensitivity`, `prompt`, and optionally `enum`. Initial types should be closed
to `absolute-directory`, `absolute-file`, `repo-relative-path`, `sha256`,
`git-oid`, `safe-id`, `human-name`, `runner`, `iso8601`, and `enum`. Sources are
`tool-result`, `repository-observation`, `machine-plane`, or `human-input`.

An unresolved required slot produces a typed `needs-input` result and no
executable launcher. `placeholder()` is used only to display that missing-input
form. Once resolved, every value is literal data passed to the existing builder;
placeholder-shaped strings never remain in executable argv.

Secrets are forbidden as slots. In particular, a private-key passphrase never
enters JSON or argv; the existing attended driver obtains it from its TTY. An
external key directory or existing-key path may be an `absolute-directory` or
`absolute-file` value in the local request, but is marked `machine-private` and
excluded from durable output.

### Prepared instance and launcher

The proposed `human-terminal-action.mjs prepare` command writes below
`scratch/human-terminal-actions/<instance-id>/`:

1. a private `request.json` containing template id/digest, resolved typed
   values, the producer's exact boundary tuple, builder result,
   runner/platform, applicable repository candidate or installed-plugin
   identity, expected result and an instance digest; and
2. one platform-specific `run-in-terminal.sh`, `.ps1` or `.cmd` launcher when
   the existing renderer can represent that platform exactly.

The launcher contains only a call to `human-terminal-action.mjs run --request
<path> --request-sha256 <digest>`. Its displayed invocation is generated by
`renderHumanCopySafeCommand()`, so even a long local path is copied safely. It
does not contain the operation's dynamic argv and does not duplicate driver
logic.

At `run`, the generic driver opens the request without following links,
verifies private-state/identity/bytes/digest, rechecks candidate or
installed-plugin freshness, reconstructs the action through the registered
builder, compares it with the frozen action, displays the existing disclosure,
and invokes the driver with `shell: false` and inherited TTY. Any mismatch
refuses before the operation. Existing confirmation inside
`po-human-approval.mjs` remains the only approval confirmation; the launcher
adds none.

The run boundary is machine-enforced. `prepare` and `inspect` may run in an
agent session, but `run` evaluates the frozen producer tuple before child
creation. For `executionBoundary: "external-terminal"` or
`"attended-external-terminal"` combined with
`invocation: "user-copy-only"` or `codexToolCallPermitted: false`, it requires
the existing attended-terminal primitive plus host-adapter evidence that the
invocation came from the copied external launcher. A workspace tool call,
structured agent/session caller, missing TTY, or boundary mismatch returns a
typed refusal such as `HTA-RUN-INVOCATION-FORBIDDEN` and never spawns the
driver. A TTY is boundary evidence, not proof of human identity. Actions with
`executionBoundary: "host"` remain executable only by the host adapter allowed
by their producer contract; `"local-process"` remains local to its owning
state machine. The implementation must not conflate these values or
`"host-authorized-wsl"`. A runner that cannot supply trustworthy caller
provenance cannot advertise `run` support for a user-copy-only action; it must
return the same typed refusal instead of accepting a caller-set environment
flag or command-line claim.

On POSIX, private state requires a non-symlink request and launcher, no
hard-linked request, owner match, mode `0600` for the request, private
directories, and readback after creation. On Windows, POSIX mode bits are not
evidence. Windows launchers remain unsupported until a dedicated slice sets
and reads back the existing native policy from
`plugins/pipeline-core/lib/windows-private-state.mjs`: exact current owner, no
reparse point for the request directory, request, launcher, or traversed
ancestor, and a DACL whose concrete principals are only the current owner. If
the native observer is unavailable, ownership differs, an inherited
Users/Everyone principal is present, or any reparse point is observed, the
driver returns a typed unsupported/private-state refusal and creates no
executable launcher.

### Result and readback

Exit code zero is insufficient. Every entry names an existing typed success
shape and a readback function. Examples are the
`pipeline.installed-plugin-attestation-host-result.v1` `status: written`
contract followed by renewed bootstrap verification, and the existing signed
proof verification after `authorize-critical` or `sign-intent`.

The local result receipt records action id/revision, input and candidate
digests, exit code, typed result code and readback status. It stores no raw
stdout, private path, username, passphrase or session identifier. If durable
evidence is needed, a separate redacted summary contains only repository-local
references and digests.

## Discovery and enforcement

Structured producers are the primary discovery channel. A producer that needs
human execution returns `templateId`, its prepared instance reference and the
pre-rendered `copyCommand`; the runner relays that field verbatim. Operators may
also use `human-terminal-action.mjs list --audience user --runner <runner>` and
`inspect <id>`, but agents must not search the catalog and guess an action when
a producer already returned one.

Extend `harness/scripts/check-auth-gate-inventory-drift.mjs` and its existing
test rather than adding another inventory checker. It should enforce three
narrow rules:

1. catalog entries and builder ids are unique and schema-valid;
2. every entry in `docs/human-authorization-inventory.md`, plus its explicitly
   classified non-authorization human-action rows, records either exclusion,
   an approved legacy renderer, or `templateId` plus structured argv/copy
   rendering; and
3. catalog builders have positive, refusal, stale-binding and result-readback
   tests.

The authoritative inventory remains explicit; the checker must not grep
arbitrary prose for words such as `command` or `remedy`.

## Acceptance falsifiers

The feature is not accepted if any existing authorization inventory row lacks
an explicit registered, legacy-renderer, abstract-family, or excluded
disposition; if a second inventory/checker can disagree with
`check-auth-gate-inventory-drift.mjs`; or if a catalog entry changes a
producer's exact boundary tuple.

The runner slice is not accepted if an agent/session tool can execute an
action marked `user-copy-only` or `codexToolCallPermitted: false`; if caller
provenance or attended-terminal evidence is absent but a child starts; if the
action builder is not reconstructed and byte-compared; or if candidate,
request, template, or installed-plugin drift reaches the child.

The POSIX slice is not accepted with a symlinked request/launcher, a
hard-linked request, wrong owner, permissive request/directory modes, or failed
post-write readback. Windows is not supported merely because argv formatting
passes. Its later slice fails closed when the native ACL observer is absent,
the owner differs, an inherited Users/Everyone ACE appears, a concrete
principal other than the owner appears, or any relevant path is a reparse
point.

## Redaction and copy/paste behavior

- Display purpose, mutation, approval requirement, target class, value origins,
  candidate/intent digest and expected readback before execution.
- Keep machine-private paths only in the locally protected request and
  terminal. Do not put them in versioned evidence or model-facing dispatch
  records.
- Never store credentials or passphrases. Redact raw child output from durable
  receipts; retain bounded digests and typed results.
- Require every physical rendered line to remain within the shared 72-column
  bound. Copy/paste tests must execute each supported platform reconstruction
  against an argv-capture fixture, including spaces, Unicode, `$`, backticks,
  quotes and command-substitution text. PowerShell/cmd formatting coverage
  does not enable a Windows launcher until native private-state tests pass.
- A platform the renderer cannot represent gets no launcher and a typed
  unsupported result. There is no guessed fallback shell.

## Compatibility and rollback

Adopt additively. Existing `command`, `copyCommand` and `setupAction` fields
remain during migration; new fields point to the same builder result and tests
assert byte equality. Consumer repositories run the launcher from the installed
plugin, without requiring a Pipeline source checkout. Claude Code, Codex and
Antigravity can consume the same action-instance schema on supported hosts.
The first prepared-runner release is POSIX-only; Windows consumers receive a
typed unsupported result until the native ACL/reparse slice is complete.

Every instance binds the catalog revision and builder implementation identity.
After rollback or upgrade, an old launcher whose binding no longer resolves
refuses and asks for regeneration. Rolling back the catalog/driver therefore
does not leave an old helper capable of executing against new semantics. The
current direct renderers remain the fallback until the adoption checker proves
all intended producers have migrated.

## Implementation slices

1. **Authoritative inventory and contract foundation.** Extend
   `docs/human-authorization-inventory.md` and
   `check-auth-gate-inventory-drift.mjs`; add schemas and the closed builder
   registry. Register existing safe actions and explicit exclusions, preserve
   every producer boundary field, and prove generated actions byte-identical
   to current builder output. No execution in this slice.
2. **POSIX prepared-instance runner.** Add prepare/inspect/run, POSIX private
   request validation, candidate/template binding, shell-free invocation,
   typed receipt and readback. Prove typed refusal for agent/session launch,
   missing attended-terminal evidence, wrong boundary, symlink/hardlink,
   stale binding, and tampering before adoption.
3. **First friction migrations.** Adopt PO-key setup and installed-plugin
   attestation setup, then ordinary user installation/update. Preserve
   `executionBoundary: "host"` and `requiresPoApproval: false` for attestation;
   routine installation maintenance must not invent a PO gate. Migrate HGO and
   critical actions as compatibility consumers of their existing builders.
4. **Windows hardening and reachability.** Implement native owner/DACL/reparse
   enforcement using `windows-private-state.mjs`, then enable PowerShell/cmd
   launchers only after refusal and live Windows tests pass. Extend producers
   where relevant, generate the user action list, and run the three-runner
   matrix on each actually supported host. Developer marketplace switching
   remains a later catalog group.

## Decisions

No new Operating-Model PO gate or security-policy decision is required for
these slices. The PO already accepted the template-script direction, the
design preserves existing action authorities and confirmation points, and
routine installation/attestation already declares that it needs no PO
approval.

Two non-blocking prioritization choices remain. First, include developer-only
local marketplace sync/source switching in the first release or after the
user-facing install/key actions; the recommendation remains to ship the user
actions first. Second, decide whether Windows support belongs to the same
milestone as the POSIX runner. The safe default is explicit Windows
unsupported status until the native ACL/reparse slice passes on Windows.
