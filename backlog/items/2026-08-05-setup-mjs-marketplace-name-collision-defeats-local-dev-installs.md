---
schema: pipeline.backlog-item.v1
id: pipeline.setup-mjs-marketplace-name-collision-defeats-local-dev-installs
type: defect
owner: pipeline
status: open
created: 2026-08-05
source: "Live reproduction on this machine, Sprint Nova session 2026-08-05 (two separate clobbers of the local marketplace registration, both traced to setup.mjs's compileSettingsJson() output)"
due: 2026-09-05
---

# `setup.mjs` systematically re-creates a marketplace name collision that defeats every local development install

## Description

`setup.mjs:855-858`, in `compileSettingsJson()`, unconditionally assigns
`marketplaces["agent-pipeline"] = { source: { source: "github", repo:
"agent-pipe-shared/agent-pipeline" } }` into `.claude/settings.json` on every
compile, for every onboarded project, regardless of runner. Its adjacent
comment calls this "part of the staleness contract". The same builder's
fresh-project branch (`setup.mjs:842-847`) additionally writes
`enabledPlugins: { "pipeline-core@agent-pipeline": true }`.

The repository-root `.claude-plugin/marketplace.json` has `"name":
"agent-pipeline-local"`. A Claude Code marketplace registers under the
`name` field of its source's manifest, NOT under the key used to declare it.
Therefore the declaration above resolves and registers itself as
`agent-pipeline-local`, silently overwriting any existing registration of
that name — including a correct user-scope `directory` registration pointing
at a local development checkout.

- **Consequence A:** `enabledPlugins: { "pipeline-core@agent-pipeline": true
  }` can never resolve, because no marketplace named `agent-pipeline` can
  come into existence from this manifest.
- **Consequence B:** a local development build is silently replaced by the
  published GitHub release.

Blast radius: every project the Pipeline onboards, not only this repository.
Any consumer project that wants a local development build hits the same
collision.

## Triggering situation

**Reproduced live on 2026-08-05, twice, on this machine.**

1. At session start, `~/.claude/plugins/known_marketplaces.json` held
   `agent-pipeline-local` with `source.source: "github"` and a clone of
   `origin/main` at `5d2b83d` (= tag `v0.5.1`), while `~/.claude/settings.json`
   correctly declared the same name as a `directory` source pointing at the
   checkout; the session consequently loaded the pre-fix `0.5.1` cache and
   bootstrapped as `runner: "codex"`.
2. After the registration was repaired to `directory`, running `claude
   plugin install` from a *sibling checkout of this same repository*
   re-clobbered it back to `github` within two seconds (registry
   `lastUpdated` 21:25:59.801Z, immediately after that install at
   21:25:57.104Z), and a subsequent host-wide install then materialized
   version `0.5.1` / commit `5d2b83d` instead of the intended candidate.

## Affected artifact

`setup.mjs` (`compileSettingsJson()`, lines ~842-858), the generated
`.claude/settings.json` in every onboarded project, `.claude-plugin/marketplace.json`
(the `name` field that collides).

## Proposal

Shortest correct fix is a design decision, not a one-line edit, and is
explicitly NOT attempted here: the published and the local identity are
currently forced to share one manifest `name`, so they cannot both be
correct.

- **Option 1:** rename the published manifest to `agent-pipeline`. This
  makes `setup.mjs`'s declaration and the released selector correct, but
  leaves a local registration with no distinct name.
- **Option 2:** suppress the `setup.mjs` assignment (or make it conditional
  on runner/environment). This stops the clobber but removes the published
  binding.

A durable resolution needs an ADR because it changes a published
consumer-facing marketplace identity.

**Interim operational mitigation actually applied on this machine** (record
as applied state, not as the fix): exactly one marketplace registered —
`agent-pipeline-local` as a `directory` source at the development checkout —
and exactly one plugin install at `--scope user`, so no per-repository
plugin command is needed and the clobber has no routine trigger.

Cross-reference `backlog/items/2026-08-05-claude-dir-leftovers-defeat-runner-neutral-project-migration.md`,
which covers adjacent `.claude/**` drift, and note that `.claude/settings.json`
is a generated artifact so the fix belongs in the generator, never in a hand
edit of the generated file.

Owner: PO. Due: 2026-09-05.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
