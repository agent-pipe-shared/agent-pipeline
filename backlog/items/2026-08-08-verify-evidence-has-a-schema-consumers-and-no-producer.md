---
schema: pipeline.backlog-item.v1
id: pipeline.verify-evidence-has-no-producer
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: b844ea342557e5313fe0a2d0ba2485c39464dce4
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, findings A2 and A3 from the Claude greenfield transcript against the 0.5.4 local candidate. Both verified in code by the Elephant before filing. The session had to write its own verify runner and invent an empty parent commit to get a Critic review at all."
---

# The Critic gate requires evidence nothing in the plugin can produce, and refuses a repository's first commit

## A2 — a schema, consumers, and no producer

`critic-dispatch-preflight` requires a `pipeline.verify-evidence.v0` artifact
bound to the candidate commit and tree, refusing with `CDP-EVIDENCE-REQUIRED`
without one. Searching the plugin for that schema returns exactly two files:
`scripts/publication-gate-evidence.mjs` and its test — a **consumer** of the
artifact. Nothing in the plugin writes one.

So a consumer project reaching its first Critic review must author the runner
itself. The observed session did: it built a `tools/verify.mjs` of its own. That
is the good outcome. The bad one is available and cheaper — hand-write the JSON —
and it produces exactly the fabricated evidence the schema exists to prevent.

Worth stating in the same breath, because it decides how this is fixed: the
binding **worked**. The transcript records `CDP-EVIDENCE-REQUIRED` stopping the
session from typing an artifact by hand, and the session called that out as a
guard closing the convenient path. The assurance is right. What is missing is the
sanctioned way to satisfy it.

Note also that a freshly onboarded project's verify contract is the bootstrap
placeholder, which exits 1. So the first Critic dispatch in a new project needs a
verify runner that does not exist, to satisfy a gate whose placeholder cannot
pass. Two absences that compound.

## A3 — a repository with one commit is not reviewable

`plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs:144`:

```js
const baseCommit = git(realRoot, ["rev-parse", "--verify", `${base}^{commit}`]);
```

For a root commit there is no parent, so the base offered is the empty-tree hash
— and the empty tree is not a commit. `^{commit}` fails and the preflight refuses
with `CDP-GIT`. The observed session worked around it by fabricating an empty
parent commit.

A repository whose entire history is one commit is the **normal** state of a
project that just adopted the Pipeline and produced its first feature. The first
review a new adopter attempts is the one that cannot run.

## Why these two are one item

Both stand between a new project and its first Critic review, which is the
Pipeline's central quality claim. A consumer that cannot run a review has adopted
the ceremony without the assurance. Fixing either alone still leaves the first
review unreachable.

## Direction, not a design

1. **Ship the verify-evidence producer.** It belongs in the plugin, not in every
   project. The observed session's own runner is a working reference for what the
   artifact must contain and how it binds to commit and tree.
2. **Keep the binding exactly as strict as it is.** The producer exists so the
   honest path is available, not so the check can relax. `CDP-EVIDENCE-REQUIRED`
   did its job and should keep doing it.
3. **Handle the root commit as an ordinary case.** Diffing a root commit against
   the empty tree is well-defined in git; only `^{commit}` peeling is not.
   Whatever the mechanism, the acceptance criterion is that a repository with
   exactly one commit is reviewable without inventing history.
4. **Cover it with a fixture that has one commit.** This class hides from every
   suite whose fixture repository starts with two, which is every fixture in this
   repository today.
5. **Decide what a new project's verify contract should be** so that the first
   review is not gated behind a placeholder that exits 1. Related to
   `2026-08-08-seeded-verify-contract-is-always-green.md`; the two describe the
   same seeded contract from opposite ends and should be decided together.

## Related

- `2026-08-08-seeded-verify-contract-is-always-green.md`
- `2026-08-08-a-session-is-told-it-is-ready-but-never-how-to-repair.md`
- `2026-07-19-verify-gate-scoped-registration.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** the plugin now ships the `pipeline.verify-evidence.v0` producer (Direction 1) and root-commit-vs-empty-tree handling for `critic-dispatch-preflight`'s base-commit resolution (Direction 3), closing both A2 and A3 (`closure_commit` `b844ea342557e5313fe0a2d0ba2485c39464dce4`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
