---
schema: pipeline.backlog-item.v1
id: pipeline.codex-signed-candidate-worktree-admission
type: defect
owner: pipeline
status: open
created: 2026-10-11
source: Alfred intermediate integration attempt on 2026-10-11; native guard refusal e3e896bc94895a8415f9d4089b3124ad8183d34b4c04fc96b1c48f83a9bc517c; explicit PO requirement to fix in the next candidate
sprint: alfred
done_when: manual
---

# Signed candidate integration requires an external terminal despite an exact Worktree target

## Description

The Coordinator invoked the installed sanctioned quality-package materializer
with an exact candidate root, matching execution workdir, genuine human proof,
and candidate-local request and committed trust-policy paths. The native guard
still associated the action with the session's main repository and refused
`GUARD-GATE-STRENGTH-SHELL` before the writer ran. Consequently, a signed and
reviewable candidate package required an additional human terminal action.

## Triggering situation

The 525-path Alfred intermediate package used base
`56a2ffc0c5b858f2226bfeef3de6f60545b8a466` and intent
`ac7795a32f1ccbb5deb6aa0c8f0d9f12017ae1e98fc51b1785a78f30ae93ec35`.
The native refusal identified the main repository as its Root even though the
execution workdir was the candidate worktree. Static inspection confirms that
the Codex adapter selects native `input.cwd`, falling back to its own process
cwd, and does not interpret `tool_input.workdir` as a Root switch.

The subsequent human-operated writer reached `QUALITY-PACKAGE-GIT-apply`;
that separate patch-validation failure does not establish successful
application or weaken this admission finding. The candidate remained clean.

The agent's read-only strict preflight (`git apply --check` with
`--whitespace=error`) also raised `GUARD-TESTPATH-SHELL-FAULT` with "mutating
git apply has unbound patch targets". The original and corrected requests
received distinct recorded refusals. This falsely classified a nonmutating
check and prevented the agent from reproducing the writer's exact validation
before asking for the signature.

## Affected artifact

- `plugins/pipeline-core/hooks/codex-pretool-guard.mjs`
- Closed signed-quality-package shell admission and its physical-file checks
- Protected-test-path shell classification of strict read-only Git apply checks
- `plugins/pipeline-core/scripts/quality-package-materializer.mjs`
- Candidate integration and pre-signature validation

## Proposal

Provide a sanctioned, exact-scope candidate integration route within the
existing session. Bind the actual execution target to physical repository and
worktree identity and preserve native session authority, lifecycle readiness,
committed target trust policy, genuine human proof, clean matching base, exact
postimage digests, and installed-writer identity. Do not globally trust a
caller-supplied cwd, switch Roots through a fabricated environment value,
weaken the shell gate, or substitute an opaque execution proxy.

Acceptance requires genuine native admission and successful application on a
clean related candidate worktree, plus refusal of unrelated roots, forged or
changed proofs, mismatched workdirs, changed policy, dirty bases, arbitrary
scripts, and command composition. Main and unrelated worktrees must remain
unchanged. The PO performs the intended signature; the agent performs the
subsequent application and readback without an extra human terminal command.
The exact strict read-only preflight must also be admitted without admitting
an actual patch write, mixed commands, an unsafe path, or ambiguous arguments.

## Triage

- **Decision:** accepted by the PO on 2026-10-11.
- **Assignment:** Alfred, next local candidate.
- **Tracking:** item source created; official ledger registration and candidate-bound closure remain pending. No completion is claimed.
- **Coverage read 2026-10-21:** the strict read-only preflight half (`git apply --check` admitted without admitting a patch write) is delivered since `d02409a8a` (`readOnlyGitApplyCheckArguments`, `lib/protected-test-paths.mjs`) and pinned by `lib/protected-test-paths.test.mjs`. Still open: the exact-Worktree admission of the signed quality-package materializer (`hooks/codex-pretool-guard.mjs` binds Root to the session's `input.cwd`; protected hook, signed ceremony, Codex-host proof). The item has no AC row in `specs/sprint-alfred-epic/spec.md`.
