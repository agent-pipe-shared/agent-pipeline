---
schema: pipeline.backlog-item.v1
id: pipeline.claude-dir-leftovers-defeat-runner-neutral-project-migration
type: defect
owner: pipeline
status: open
created: 2026-08-05
source: "PO observation, Sprint Nova session 2026-08-05, plus a concrete misdiagnosis it caused in that same session (Elephant read .claude/pipeline.yaml as authority and drew the wrong conclusion about the push gate); independently confirmed and extended by the T1 Critic of candidate 8d9b3df as finding F-E (major), which withdrew its own earlier, too-generous disposition of the same drift"
due: 2026-09-05
---

# Runner-neutral `project/` migration is incomplete: `.claude/` copies survive, disagree, and actively mislead

## Description

For runner neutrality, Pipeline-owned configuration is supposed to live under
the runner-neutral `project/` directory rather than the Claude-specific
`.claude/` one, and a migration path exists for this
(`plugins/pipeline-core/lib/project-authority.mjs`,
`planProjectAuthorityMigration`, `NEUTRAL_*` vs. `LEGACY_*` path constants).
In practice both trees coexist in this repository, and the surviving `.claude/`
copies **disagree with the live authority**.

Confirmed empirically in this session by invoking the resolver directly:

```
resolveProjectAuthorityPaths({ rootDir: <repo> })
  → { status: "ready", source: "neutral",
      manifest:    "project/pipeline.yaml",
      state:       "project/pipeline-state.json",
      calibration: "project/pipeline.json", … }
```

So `project/` is authoritative — yet `.claude/pipeline.yaml` and
`.claude/pipeline.json` still exist and are still read by humans and agents as
if they were. `.claude/pipeline-state.json` does not exist at all, while
`project/pipeline-state.json` does.

The mirrors do not merely duplicate — they **materially disagree**, and the
disagreements are gate- and model-relevant:

| Field | `project/*` (live authority) | `.claude/*` (legacy mirror) |
| --- | --- | --- |
| `gates.push.approval` | `standing-approved` | `required` |
| `session.keep_awake` | `false` | `true` |
| Goldfish route model / effort | `sonnet-5` / `low` | `haiku` / `medium` |
| (second route) effort | `high` | `medium` |
| `humanRoles.po.displayLabel` | `PO` | `Human` |
| `pipelineUpdateChannel` | `alpha` | *(absent)* |

The **model-routing divergence is the most serious** of these: an agent that
reads the legacy mirror derives a different model and effort tier than the
live authority declares, which collides directly with the MP-05/MP-07 model
discipline that `CLAUDE.md` makes mandatory for every dispatch.

### Agents are normatively directed at the wrong file

`guardrails/git.md:80` carries a **MUST** naming the legacy path:

> **MUST** follow the committed project calibration (`.claude/pipeline.json`:
> `branchModel`, `autonomy`, `wipLimit`, `worktree`) …

That line sits five lines above the GIT-05 line amended in commit `31d3a6b`.
Likewise `plugins/pipeline-core/skills/close-block/SKILL.md:83` (*"Read
`.claude/pipeline.json` of the current project"*) and `:98`, three lines above
and seven below the line the same commit amended.

In total **14 normative documents** reference `.claude/pipeline.json`:
`docs/operating-model.md`, `guardrails/git.md`, `guardrails/global.md`,
`guardrails/quality-gates.md`, `roles/goldfish.md`, `docs/state.md`,
`docs/adr/0028-manifest-approach.md`, `templates/CLAUDE.project.md`,
`templates/handover.md`, `templates/prompts/critic-review.md`,
`templates/prompts/goldfish-task.md`,
`templates/prompts/session-bootstrap-check.md`, and the `close-block` /
`critic-review` skills. `CLAUDE.md:34` points at `.claude/pipeline.yaml`.

So the canon directs every agent to a file that is not the resolved authority
and that demonstrably disagrees with it.

## Triggering situation

PO raised it directly (2026-08-05, verbatim): *"wegen runner neutralität sollen
eigentlich alle pipeline dateien in 'project' … dafür gibt es auch eine
migration. Leider bleiben die aber überall auch unter .claude und verwirren
dann alles."*

**It had already caused a concrete misdiagnosis earlier in the same session.**
Investigating whether the Ed25519 critical-human-proof mechanism gates pushes,
the Elephant read `.claude/pipeline.yaml`, saw `approval: required`, and
concluded the proof was mandatory for the pending branch push. Only a direct
`resolveProjectAuthorityPaths()` call plus a direct
`guard-push.mjs` stdin invocation (which exited 0, not blocked) revealed the
live authority is `project/pipeline.yaml` with `standing-approved`, and that
the proof check is therefore never reached. The stale file did not merely sit
there — it produced a wrong conclusion about an active security gate.

This is compounded by naming: `project/` is itself a poor name for the
runner-neutral location (PO's own assessment: *"eigentlich auch ein kack name
dafür"*), which makes the split even harder to reason about.

## Affected artifact

`.claude/pipeline.yaml`, `.claude/pipeline.json` (stale leftovers) vs.
`project/pipeline.yaml`, `project/pipeline.json`,
`project/pipeline-state.json` (live authority);
`plugins/pipeline-core/lib/project-authority.mjs` (the resolver and migration);
any doc, skill, or template still naming `.claude/pipeline.*` as the
calibration/manifest path — including `guardrails/git.md` GIT-05, which says
"`.claude/pipeline.json`", and `plugins/pipeline-core/skills/close-block/SKILL.md`
step 0, which instructs reading "`.claude/pipeline.json` of the current
project".

## Proposal

**Do not re-sync the mirrors by hand.** That is precisely what commit
`31d3a6b` did (it applied the wipLimit change to `.claude/pipeline.json` *and*
`project/pipeline.json` as two separate hunks) and it is what keeps this defect
class alive. Pick one of two structural end states:

1. **Retire the legacy tier.** Run the existing typed
   `planProjectAuthorityMigration` path to retire the `.claude/*` authority
   files, then repoint all 14 normative documents at `project/` (or better, at
   whatever `resolveProjectAuthorityPaths()` returns, rather than any hardcoded
   directory).
2. **Or make the legacy tier a generated projection**, if it must stay for
   installed-plugin compatibility — never a hand-edited second source — with a
   fail-closed drift check in `verify`: if a `NEUTRAL_*` and its `LEGACY_*`
   counterpart disagree on any semantically meaningful field, fail. Every
   divergence in the table above would have been caught immediately.

Both are architecture/guardrail-class work and warrant an ADR referencing
ADR-0051, per that ADR's own Follow-up rule.

**On the `project/` name (observation, not part of this defect):** the PO
notes `project/` is itself a poor name. The Critic's assessment, retained
deliberately: the directory name is baked into four exported constants and
every consumer of `resolveProjectAuthorityPaths()`, so renaming it is its own
ADR-scale change and should **not** be bundled with the drift fix — the drift
is the defect, the name is a preference. Decide it separately, but decide it
before any migration runs, so a rename does not cost a second migration.

Related: `backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`
(its proposal step 2 names the same manifest drift, from the security-gate
angle rather than the migration-completeness angle).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Partially addressed; the item stays open. **Option 1
  (retire the legacy `.claude/*` tier) is now proven impossible as written**
  and is withdrawn from the Proposal's option set. Only Option 2 (generated
  projection plus a fail-closed drift check) remains viable.
- **Rationale:** ADR-0053's investigation, done while implementing
  `AUTHORITY-GEN-07` (commit `32cfc85`), established that roughly a dozen
  executable files — including `harness/scripts/verify.mjs` — genuinely
  read the legacy `.claude/` tier directly, not merely the ~14 normative
  documents this item already lists. Retiring that tier via
  `planProjectAuthorityMigration` would therefore break live gate execution,
  not just stale documentation. `setup.mjs` was changed in `32cfc85` to
  derive its compiled write targets from `resolveProjectAuthorityPaths()`
  instead of hardcoded `.claude/` paths, which addresses the generator half
  of this item's own guidance ("the fix belongs in the generator, never in a
  hand edit of the generated file") but does not retire the legacy tier
  itself, nor does it add the fail-closed drift check Option 2 requires, nor
  repoint the 14 normative documents.
- **Assignment (if accepted):** Not assigned this session. Remaining work —
  the fail-closed drift check and the documentation repointing — is carried
  forward per `docs/state.md`'s 2026-08-06 section.
- **Date:** 2026-08-06
