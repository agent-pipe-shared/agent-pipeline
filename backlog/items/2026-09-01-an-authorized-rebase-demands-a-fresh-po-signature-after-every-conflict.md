---
schema: pipeline.backlog-item.v1
id: pipeline.an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "PO handover received in session on 2026-09-01, transcribed faithfully from the live reproduction on the agent-pipeline-shared_alfred checkout."
---

# An authorized rebase demands a fresh PO signature after every conflict

## Order for the implementing dispatch

- Fix the defect in the clean 0.6.0/0.6.1 candidate session.
- Do not modify the running Alfred checkout.
- No switch to chat approval.
- No broader guard-maintenance window.
- No weakening of the dev-plan gate.

## Goal

An already-approved feature branch must be able to rebase onto a new base.
Conflicts may still be inspected and resolved by hand, but `git rebase
--continue` and legitimate conflict resolutions must not demand a fresh PO
signature after every conflict.

## Live reproduction (verbatim)

- Checkout: `agent-pipeline-shared_alfred` (directory name only).
- Branch before rebase: `feat/sprint-alfred`.
- Pre-rebase tip / orig-head: `d418ee953ecf5581abbeca7bb06d261b49c6ac35`.
- Rebase target: `dfd26254ffa040a50af28d3b3f46737245d4c5cd`.
- Rebase standing at 28 of 53.
- Current `REBASE_HEAD`: `74d6607c96dd49768fe64a93dba63e47402f2224`.

The state at the original tip is valid: `planApproved: true`,
`activeFeature.id: sprint-alfred-epic`, `activeFeature.phase: implementation`,
with bound plan/spec approval. During the rebase the partially rebuilt tree
instead shows an earlier design state with `planApproved: false`, and
`guard-lifecycle-ready` treats that intermediate state as current authority
and blocks every further rebase step. Each human-guard override is correctly
single-use, so a new Ed25519 signature is demanded after almost every
conflict.

## Confirmed classification defect

`plugins/pipeline-core/lib/protected-test-paths.mjs` parses git commands with
the generic `operands(argv)` parser, so `core.editor=true` in `git -c
core.editor=true rebase --continue` and `checkout` in `git checkout --ours --
backlog/...` are wrongly treated as file paths; the guard output names `File:
core.editor=true`, which is not a real target.

## Requirement 1 — rebase authority continuity

Bind rebase authority to the following, in full:

- real repository and git-common-dir identity;
- `head-name`, `orig-head`, `onto`;
- full lowercase git OIDs;
- a hash of the rebase todo and of the completed portion;
- the original feature state from `orig-head`;
- plan and spec bytes also from the `orig-head` git tree;
- a lifecycle of `implementing` successfully derived from those;
- the currently conflicted paths;
- no remote or push authority.

Where the state at `orig-head` is validly approved and in implementation,
that authority carries the rebase to completion; a partial replay state must
not turn an existing approval back into an apparent draft authority.

## Requirement 2 — narrow conflict resolution

The authority applies only to:

- the genuine active rebase;
- exactly its current conflict paths or patch surface;
- exact continuations (`git rebase --continue`, `git -c core.editor=true
  rebase --continue`);
- permitted Edit/Write/apply_patch resolutions on those conflict paths;
- git conflict commands whose actual pathspecs lie inside that surface.

Implementation files not touched by a conflict must not become editable
merely because a rebase is active somewhere.

## Requirement 3 — git argument classification

Parse git per subcommand:

- never treat the subcommand as a path;
- never treat `-c` and its value as a path;
- never treat revisions such as `HEAD` as a pathspec;
- determine the real pathspecs for `checkout`/`restore`;
- do not check repository-wide mutators such as `rebase` against invented
  file candidates;
- recognise `git rebase --show-current-patch` as read-only.

## Requirement 4 — no general exception

Full prohibition list:

- no session-wide human-guard override;
- no multi-use override as a general capability;
- no extension of the guard-maintenance window to the lifecycle kernel;
- no automatic `--skip`;
- no `--edit-todo`, `exec`, arbitrary `-c`, or shell chaining;
- no push or force-push authorisation;
- no global switch to `gates.human_approval: chat`.

`git rebase --abort` keeps its existing narrow recovery semantics.

## Requirement 5 — the authority must be discoverable at the point of denial

PO decision, 2026-09-01, added after Requirement 3 landed and before the
wiring package was briefed.

A session that has never heard of the rebase authority must still be carried
through a conflicted rebase by the guard itself. Two properties follow, and
both are part of the wiring, not of the resolver:

- **The authority is never opt-in.** It applies because the repository is
  genuinely mid-rebase from a validly approved `orig-head`, never because the
  session knew to ask for it, named a flag, set an environment variable, or
  had read this item. A capability that only an informed session can reach is
  the same blocker it replaces, moved one level down.
- **Every denial that the authority could have permitted, or that occurs
  inside an active rebase, names the route forward in its own denial text.**
  The denial states what is permitted on the current conflict surface, which
  paths that surface currently contains, and the exact next command — in the
  machine-readable retry-action shape the guards already emit
  (`pipeline.guard-retry-actions.v1`), not only in prose. An empty
  `retryActions` array during an active rebase is itself a defect: it is
  precisely the state in which a session is stranded with no named way on.

The failure this closes is the one observed live: the guard refused, the
refusal named no route, and the only path anyone found led back to a fresh PO
signature. Correct narrow behaviour that cannot be discovered from the
refusal is indistinguishable, to the session experiencing it, from no
behaviour at all.

Two test cases carry this, in addition to the twelve below:

1. During an active rebase from a validly approved `orig-head`, a refused
   command that lies outside the conflict surface produces a denial whose
   `retryActions` is non-empty and names the conflict surface.
2. A session with no prior knowledge of the authority — no flag, no
   environment variable, no prior successful call — reaches a successful
   `git rebase --continue` by following only what the denials told it.

## Test cases

### Positive (five)

1. `git -c core.editor=true rebase --continue` during an active rebase whose
   `orig-head` carries a validly approved, in-implementation state succeeds
   without a fresh signature.
2. An Edit/Write resolving a genuine conflict marker inside a currently
   conflicted path succeeds under the rebase authority.
3. `git checkout --ours -- <conflicted-path>` (a real conflict path) succeeds
   without being misclassified via the `core.editor=true`/`checkout` operand
   bug.
4. `git rebase --show-current-patch` succeeds as a recognised read-only
   command during an active rebase.
5. `git rebase --abort` succeeds via its existing narrow recovery semantics,
   independent of the new rebase authority.

### Negative (seven)

1. Editing an implementation file that is NOT part of the current conflict
   set, while a rebase is active, is still blocked.
2. `git rebase --edit-todo` is refused even under active rebase authority.
3. `git rebase --exec '<anything>'` is refused.
4. `git -c <arbitrary-key>=<arbitrary-value> rebase --continue` where the
   `-c` value is not `core.editor=true` is refused (or at minimum not
   silently admitted as a path-carrying operand).
5. Any push or force-push command is refused under rebase authority alone,
   with no push or force-push authorisation implied.
6. A conflict-path git command whose actual pathspec lies OUTSIDE the current
   conflict/patch surface is refused.
7. Attempting to invoke rebase authority against a rebase whose `orig-head`
   state is NOT validly approved (`planApproved: false` at the true starting
   point, not merely at an intermediate replay state) is refused — the
   authority carries forward only an already-valid approval, it does not
   manufacture one.

## Acceptance conditions

- Targeted unit and regression tests green.
- Full `verify.mjs` green.
- No change to `pipeline.user.yaml`'s approval mode.
- No claim that the rebase authority authorises a push.
- A new local candidate through the normal cachebuster/install/reload
  procedure.
- A readback confirming the loaded plugin version actually contains the fix.

## Closing intent

The fix must not decide conflicts automatically; it preserves the
already-valid approved authority of the original feature tip during a
deterministic history replay, so the rebase can continue after each
inspected resolution without a new PO signature.

## Likely affected surfaces

- `plugins/pipeline-core/lib/protected-test-paths.mjs`
- `plugins/pipeline-core/hooks/guard-devplan-policy.mjs`
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
- their tests
- possibly a new narrow module for rebase-authority validation
- the human-guard / lifecycle threat-model documentation

## Review requirement

This is guard code introducing a new authority that suspends a lifecycle
gate. It carries a mandatory T1 Critic round.
