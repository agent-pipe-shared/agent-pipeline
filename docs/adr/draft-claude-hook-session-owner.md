# Draft ADR — Claude hook-observed session owner for governed item admission

- **Status:** proposed (number allocated at acceptance, ADR-0069)
- **Date:** 2026-10-12
- **Decision source:** PO chat decision T6-A, recorded in
  `specs/sprint-alfred-epic/plans/po-decisions-2026-10-12.md`
  ("Claude session decisions").

## Context

Every role-`goldfish` dispatch must pass governed item admission
(`hooks/guard-dispatch.mjs`, `requiresGovernedItemAdmission`). Admission needs
the approved feature's v2 `slice-queue.json`; its only sanctioned writer,
`prepareGovernedItemQueue` (`lib/native-goldfish-host-state.mjs`), first needs a
bound current owner from `nativeManagedCurrentOwner`
(`lib/native-managed-authority-support.mjs`). That owner came exclusively from
the in-process Source requester (`lib/session-requester-bridge.mjs`,
`AsyncLocalStorage`), which exists only inside a controller process that
launched the worker. Claude Code runs each PreToolUse/PostToolUse hook as a
fresh process, so under Claude the owner was always unbound, the queue could
never be created, and every productive Goldfish dispatch was refused with
`SQ-DELIVERY-STATE-UNAVAILABLE`. Reproduced live on 2026-10-12 (native Windows,
Claude runner).

## Decision

1. Add a narrower fallback owner source, `lib/claude-hook-session-owner.mjs`.
   A Claude hook process that has parsed its own hook input enters a
   process-wide scope with that input's `session_id` (shape-checked). The owner
   is the private session descriptor `claude-<session_id>` under
   `.git/agent-pipeline/session-descriptors/active/`, created on first use
   through the existing `worktree-lifecycle.mjs` `startSessionDescriptor` and
   loaded (digest-checked) by `loadSessionDescriptor` on every later use.
2. `nativeManagedCurrentOwner` consults it only when the in-process requester
   context is unavailable, and only for the same physical repository. The
   in-process requester always wins.
3. The owner reports assurance `physical-readback` (the descriptor is a
   physical readback; the registry's assurance vocabulary stays closed) and a
   separate label `ownerSource: "claude-hook-session-descriptor"`. It is
   hook-observed session identity, not an authenticated requester.
4. The descriptor records `ownerRuntime: null`: the hook process is transient,
   so a recorded pid would read as dead and invite retirement of a live
   session's descriptor.
5. Entry points: `hooks/guard-dispatch.mjs` (Claude `Task`/`Agent`) and
   `hooks/native-goldfish-host.mjs` (`--runner claude`).

## Consequences

- Productive Goldfish dispatch becomes reachable from Claude through the
  existing v3 native item route. Approval, criterion locator, write-scope,
  owner/criterion/scope collision, candidate, host-commit and Critic rules are
  unchanged and still apply.
- Assurance is lower than an authenticated controller requester: any process
  that can run a Claude hook with a chosen `session_id` can claim that
  session's owner. This is accepted for the Claude runner because the hook
  boundary is already the trust boundary of all Claude guards; a stronger
  authenticated Claude requester remains future work.
- Descriptors accumulate one per Claude session that dispatches productively;
  retirement on session end is a follow-up (no SessionEnd wiring here, since
  `hooks.json` is TP-4).
- Takes effect only after the operator refreshes the local marketplace copy
  (`docs/claude-local-plugin-development.md`), because guards run from the
  installed copy (GS-6).

## Alternatives rejected

- Hand-writing `slice-queue.json`: fabricates the governed writer's output.
- Disabling or bypassing `guard-dispatch`: removes admission entirely.
- Running implementation through non-Goldfish agent types: evades the gate.
- A new assurance value: the session-authority registry accepts only
  `physical-readback` and `controlled-unit-method`; widening that vocabulary
  is a larger kernel change than this bounded exception.
