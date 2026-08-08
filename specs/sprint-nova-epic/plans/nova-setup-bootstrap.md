# Nova — setup in the bootstrap, narrow gauge

Status: design, PO-approved to be planned during the implementation phase as an
explicit exception. Not implemented. Deliberately minimal: the PO asked for a
usable base now, with the full treatment left to Nightwing.

Source decisions: PO, 2026-08-08, recorded in
[`backlog/items/2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md`](../../../backlog/items/2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md).

## 1. The problem this closes

The documented install path is "add the marketplace, install the plugin". Nothing
in it asks a single setup question, and `setup.mjs` is explicitly not for consumer
projects (`SETUP.md:202`). Every setting therefore resolves without the human,
including the push approval mode, which resolves fail-closed to `signature` — the
strictest setting, handed to the least prepared user, who has no key and is never
told one exists. The one hint the system offers is `setup-check`'s advice to run
`setup.mjs`, the script the documentation forbids them to use.

Setup belongs in the bootstrap, not in a manual `node` invocation.

## 2. Two configuration planes, zero field overlap

| Plane | Carries | Asked |
|---|---|---|
| Machine | PO key directory, guided key creation, `push_approval_default`, `routing` (model per duty), `language`, `session`, `usage` | once per machine |
| Repository | `gates.push_approval` (effective, committed), remaining `gates`, `autonomy`, `critic_export` / `advisor_export` | written at first bootstrap in that repository |
| Never asked | the runner, the scratch location, `claude_md_max_lines` | — |

**No field appears in both planes.** The repository plane carries
`gates.push_approval`; the machine plane carries `push_approval_default`. Two
fields, two meanings, so no precedence rule is needed — and every precedence rule
is a place where the weaker plane can override the stronger. This repository
already applies the same rule between `pipeline.yaml` and `pipeline.json`
(ADR-0046/ADR-0054).

**Why the effective value must stay in the repository.** `readPushApprovalMode`
returns the strict default whenever `pipeline.user.yaml` is absent, uncommitted, or
differs from its committed bytes. That is the setting's entire protection: a local
edit cannot weaken a repository-wide gate. Machine-scoped, it would be a switch
each participant can flip for themselves with no trace in the repository, and CI
would have no source for it at all.

**Why there is no runner field.** The same repository may be worked with Codex and
with Claude alternately, for cost or model reasons. A stored project runner cannot
express that. The runner is read from the running session at the CLI edge and
carried explicitly inward.

## 3. The human is asked once, on the machine

First bootstrap on a machine with no machine plane:

1. State plainly what is about to be configured and why, in one short block —
   not a wizard.
2. **Approval mode default.** Explain the two modes in one sentence each:
   `signature` proves the approval with a detached Ed25519 signature whose private
   key never leaves the human's terminal; `chat` records an attribution in the
   session — a labelled record, not a proof. Recommend `signature`. Accept `chat`.
3. **If `signature`:** walk the human through key creation, proposing a default
   directory rather than demanding one. The key is created once, by the human, in
   their own terminal, encrypted, and thereafter only ever *invoked* — never read,
   moved, or copied. Nothing about this step may place key material inside a
   checkout.
4. **Model routing and language** are confirmed or accepted as defaults here, since
   both are operator properties.

First bootstrap in a *repository*: no question. The machine default is written
into the repository's committed value, and the human is told in one sentence what
was written and how to change it.

## 4. Absent or stale machine plane — the bootstrap helps rather than blocks

A new team member, or the same person on a new machine, arrives with no machine
plane. That is the ordinary case, not an error.

- The bootstrap detects the absence and runs the machine-setup step above.
- It must never terminate in advice the human cannot act on. Concretely,
  `setup-check`'s `default-markers` branch currently offers exactly one resolving
  step, `node setup.mjs`, which a consumer must not have. That branch must name
  what a consumer can actually do.
- When the effective mode resolves to `signature` and no PO authority exists, the
  message says so and names the single command that creates one. A gate whose
  precondition is invisible is indistinguishable from a broken gate.

## 5. Downgrading to `chat` — human intent has priority

The PO's requirement: a solo user doing small work must be able to use `chat`, must
be warned about what they give up, and must never be in a state from which `chat`
is unreachable.

The rule follows from the modes themselves: **the strength you are leaving is the
strength required to leave it.**

| Repository state | Switching to `chat` requires |
|---|---|
| Never carried a signed approval | An ordinary committed configuration change, with the risk statement shown once and acknowledged. |
| Has carried at least one signed approval | A signature. You prove you hold the key before you relinquish the mode that key protected. |

This is not ceremony for its own sake. In the second case the repository's history
contains approvals whose weight came from `signature`; silently lowering the mode
would retroactively change what those records are worth to a reader. Requiring the
key to make that change keeps the downgrade attributable to the same authority that
made the stronger claim.

The risk statement, shown before the change and not buried: under `chat` an
approval is an attribution record, not a proof. It says who claimed to approve; it
cannot demonstrate that they did. For solo work on a repository only that person
pushes to, that is a reasonable trade and the Pipeline should not pretend
otherwise.

**No dead end.** There must be no reachable state from which `chat` cannot be
reached. Open question named rather than hidden: a repository that has signed
approvals and whose key has been *lost* has no signature path. Whether that is
recoverable, and by what, is not decided here.

## 6. Out of scope, deliberately

- **The team case.** One participant signs on their machine, another does not.
  Under this design the effective repository value is committed and shared, so both
  are governed by the same mode — but nothing yet reconciles a participant whose
  machine plane says `chat` with a repository that says `signature`, beyond the
  fail-closed rule. The PO named this explicitly as a later problem.
- Where the machine plane physically lives. An environment variable
  (`PIPELINE_PO_APPROVAL_DIRECTORY` today) is losable and undiscoverable; a file
  under the user's configuration directory is better but needs its own guard
  treatment, since the guard currently admits exactly one derived directory outside
  the project root.
- Everything Nightwing will do properly: the full field taxonomy, migration of
  existing projects, and any UI beyond plain prose in the bootstrap.

## 7. What implementation must not do

- Introduce any persisted per-project runner value.
- Move `gates.push_approval`'s effective value out of the committed repository
  state.
- Place key material, or a path that resolves to key material, inside a checkout.
- Let any branch of `setup-check` advise a consumer to run `setup.mjs`.
- Add a second environment-based runner resolution instead of reusing the one in
  `pipeline-start-preflight.mjs`.
