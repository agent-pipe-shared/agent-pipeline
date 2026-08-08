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
| Has carried at least one signed approval | A signature — from **any** valid key, not the original one. See §5a, which decides this deliberately downward. |

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
reached. The lost-key case is addressed in §5a, which turns out to be the same
question as the team case.

## 5a. Which human — and the single trust anchor that answers it wrongly

The PO stated the intended property: the system must assure that **a** human
audited, deliberately **not which** one. A newly created key that did not exist
before must work for a new approval.

**That is not what is implemented.** `project/critical-human-proof.json` pins
exactly one trust anchor:

```json
"trustAnchor": { "keyReference": "local-po-key", "publicKeySha256": "…" }
```

One key, one fingerprint, committed, validated as a single object by
`critical-human-proof-policy.mjs` (`exactKeys(anchor, ["keyReference",
"publicKeySha256"])`). Three consequences follow:

1. A new key does not work — it fails the anchor check.
2. A lost key is a genuine dead end for the signature path.
3. The team case is not merely unhandled but structurally excluded: one anchor
   admits one holder.

**The anchor buys nothing against the actual threat.** What the signature defends
against is an agent approving its own work. An agent cannot produce one, because
the key lives outside the checkout and the passphrase is typed at a human's
terminal — and that remains true *whichever* key it is. A freshly created key
defends exactly as well. The anchor costs the team case and recoverability, and
returns nothing the threat model asks for.

**What is given up, stated plainly.** The claim weakens from "the PO approved" to
"a human approved". Someone with shell access on the machine could create a key
and approve — but someone with shell access can already do worse. For a solo user
this changes nothing; for a team it is precisely the intended behaviour.

**The distinction that matters: not restricted, but always recorded.** Any
well-formed key may sign. The approval record must capture *which* public key did,
so the question "who approved this" remains answerable after the fact even though
it is not enforced beforehand. Unrestricted is not the same as unrecorded, and
conflating the two would be the real loss.

**The scope statement this rests on, from the PO, 2026-08-08.** It governs more
than this feature and is recorded here because §5a is where it first becomes
load-bearing:

> we make sure agents do not break out and do strange things; humans doing strange
> things is a layer addressed elsewhere

Everything §5a gives up sits on the far side of that line. Creating a key and
approving with it requires access to both the repository *and* the machine. A
party holding both is not the adversary this layer is built against, and defending
against them here would only be a second, weaker copy of a control that belongs
somewhere else. The pinned anchor is exactly that duplicated control: it costs
rotation, recovery and teams, and it does not stop anyone who already holds both.

The PO's reason, stated on 2026-08-08 and generalized here because it decides more
than one question: a person with repository and machine access **can open any file
natively and change anything**, without an agent and without the Pipeline being
involved. There is no configuration this system can hold that such a person cannot
edit directly. Building protection against them is therefore not defence in depth;
it is a control with no reachable threat, paid for in capability.

The test to apply to any proposed restriction: **what does it stop an agent from
doing?** If the answer is "nothing an agent could do anyway", the restriction is
aimed at humans and does not belong in this layer.

**This resolves §5's downgrade rule, and it resolves it downward.** Leaving
`signature` on a repository with signed history is secured by "a human is present",
not by "the same human" — the same standard as any other approval. The earlier
formulation, that the strength you leave is the strength required to leave it,
survives only in that weaker sense: a signature is still required, so an agent
cannot perform the downgrade on its own. Requiring the *original* key would be the
duplicated control again, and it would recreate the dead end §5a exists to remove.

**Attribution is untouched by all of this.** The record still carries which key and
which name performed the downgrade. Removing a restriction is not the same as
removing the record, and conflating the two would be the one genuine regression
available here.

**Where the name is required, and where it is not** (decided 2026-08-08 while
implementing this): creating a new signing key requires it — there is no record to
read it from, and an approval that cannot name its human is the gap being closed.
A `setup` that recovers or re-reads an existing authority record does **not**:
the stored name is used. Requiring it there would be a usability regression with
no gain in attribution, and it would break the recovery path against a directory
that already holds keys. A record predating the field is the one recovery case
that must still ask, with an error saying so rather than the generic usage text.
The distinction belongs where the directory's state is known, never in the
argument parser, which cannot see whether a record exists.

Found because a mechanic-tier dispatch refused to decide it: briefed to add one
argument at one call site, it reported five call sites and one whose intent the
briefing did not settle, rather than choosing. The refusal is what surfaced the
over-broad requirement.

**Attribution needs a name, not a constraint.** The PO's addition: keys carry
names, or the approving human supplies their name alongside the key identifier
instead of a bare `approve`. Either way the record answers "who" without the policy
ever restricting "who may". Concretely, the approval record carries the key's
`publicKeySha256`, its `keyReference`, and the human-supplied name — three fields,
none of which gates anything.

**Direction for implementation** (not built here):

- Replace the single `trustAnchor` with an optional anchor *set*. Absent or empty
  means "any well-formed key", which is the PO's intended default. A populated set
  means membership is enforced, for projects that want the stronger claim.
- Every approval record carries the signing key's `publicKeySha256` and a
  human-supplied `keyReference`, whether or not a set is configured.
- The schema change is a version bump, not an edit in place: existing repositories
  carry `pipeline.critical-human-proof-policy.v1` with a single anchor, and their
  behaviour must not change silently under a new reader.

With this, the lost-key case resolves without a special mechanism: create a new
key, sign with it, and the record says which key it was.

## 6. Out of scope, deliberately

- **The team case, in its remaining half.** §5a removes the structural blocker —
  multiple humans with different keys become possible. What is still unhandled is
  the *mode* mismatch: a participant whose machine plane says `chat` working in a
  repository whose committed value says `signature`. The fail-closed rule makes
  that safe rather than resolved. The PO named this explicitly as a later problem.
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
