# ADR-0054: `.arbitheon/` authority directory, three-tier precedence chain, configurable location

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted (design + sequencing), implementation staged · **Supersedes
nothing; extends** [ADR-0046](0046-project-authority-layering.md) and completes the
follow-up [ADR-0053](0053-setup-generator-authority-resolved-targets.md) deferred.

## Context

Project authority today is two-tier. `plugins/pipeline-core/lib/project-authority.mjs`
resolves a `NEUTRAL_*` layer (`project/pipeline.yaml`, `project/pipeline.json`,
`project/pipeline-state.json`, `project/guard-config.json`,
`project/guard-override.log.jsonl`) ahead of a `LEGACY_*` layer under `.claude/`, with
`compatibility: "dual-read-one-write"`.

Two problems remain.

**The directory names are wrong for what they hold.** `.claude/` names one runner —
this is a dual-runner, tri-platform product ([ADR-0051](0051-dual-runner-tri-platform-development-contract.md)),
and `.claude/` must stay reserved for the things that genuinely belong to Claude Code
(`settings.json`, `settings.local.json`, `~/.claude/plugins/**`, the session marker
files). `project/` is generic to the point of being a collision hazard in any repository
that already has a directory by that name, and it carries no product identity at all.

**Most readers do not use the resolver.** ADR-0053 established this by grep and deferred
it explicitly; this ADR closes it. The concrete danger is ordering: the moment writes
move to a new top tier while a reader still opens `.claude/pipeline.yaml` on a hardcoded
path, that reader silently serves stale data. That is not hypothetical — it is exactly
the defect ADR-0053 fixed in `setup.mjs`, and the same session produced a live
misdiagnosis from it (a session read the stale `.claude/pipeline.yaml`, saw
`approval: required`, and concluded a push gate was active that the live
`project/pipeline.yaml` does not have).

**Why not `.agent-pipeline/`.** It is already taken, by a different concept.
`.agent-pipeline/` is the **private overlay root**: `private-overlay-activation.mjs`
admits `.agent-pipeline/core.lock.json` plus the four overlay classes (`policies`,
`guidelines`, `templates`, `extensions`) as one closed namespace boundary, and it is
registered as a governance marker in `guard-lifecycle-ready.mjs`,
`codex-pretool-guard.mjs` and `codex-session-start-hint.mjs`. Putting project authority
in the same directory would merge a public, committed, project-owned authority with a
private, operator-owned overlay under one name. Separately, "agent-pipeline" names the
pipeline specifically, whereas the directory is meant to hold whatever the umbrella
product keeps in a repository.

## Decision

### 1. `.arbitheon/` is the default project-authority directory

The five authority artifacts resolve, in order, from:

```
.arbitheon/   (new default, top tier)
project/      (current neutral tier)
.claude/      (legacy compatibility tier)
```

`.claude/settings.json`, `.claude/settings.local.json`, `.claude/.runtime/**`,
`.claude/.usage-<session>.json`, `.claude/.stop-suggest-<session>.json` and everything
under `~/.claude/` are **not** project authority and are explicitly out of this
chain — they belong to Claude Code and stay where they are.

### 2. The directory name is configurable, from `pipeline.user.yaml`

The setting cannot live in the authority it names — that is circular. It lives in
`pipeline.user.yaml`, the pre-authority source of truth the V3 compiler already reads
before any runtime projection exists. An unset value means `.arbitheon`. A configured
value replaces only the **top** tier; `project/` and `.claude/` remain the fallback
tiers regardless, so a configured repository can still read an unmigrated artifact.

### 3. Precedence, not a big-bang migration

Resolution walks the chain and takes the first tier that carries a usable layer. Nothing
is deleted as a side effect of anything. The existing safety rule that made the two-tier
chain trustworthy is preserved and extended: **mutable lifecycle State may not exist at
two tiers at once.** `pipeline-state.json` present at more than one tier is
`PA-LEGACY-STATE-RETIREMENT-REQUIRED` — a typed stop with a bounded retirement action,
never a silent precedence win. Immutable-by-convention artifacts (manifest, calibration,
guard config) may coexist during migration; State may not.

### 4. Cleanup is gated on proven completeness and is an operator action

A completeness check compares the lower tiers against the top tier artifact by artifact.
Only when it is green may the lower tiers be removed, and only through an explicit
operator-invoked action with a digest-bound plan and readback. There is no automatic
deletion, and no release is required to carry it: a repository may sit on the chain for
several releases.

### 5. Implementation order is normative, not stylistic

1. **Route every category-A reader through the resolver.** Behaviour-preserving; a
   repository whose authority is the legacy tier reads exactly the same bytes from
   exactly the same file afterwards.
2. **Introduce the third tier and the configurable name** in
   `project-authority.mjs`.
3. **Move writes to the top tier**, readers keep falling back.
4. **Add the completeness check**, and only then the gated cleanup action.

Any other order writes to a tier that some reader does not yet know how to find.

## Reader classification (evidence for step 1)

Established by exhaustive grep over the five authority basenames in every path spelling
(`".claude/pipeline.yaml"`, `join(root, ".claude", "pipeline.yaml")`, …), across all
non-test `.mjs`/`.js`/`.cjs`, then read site by site.

**A — hardcoded authority readers; must route through the resolver (step 1).**

| Site | Artifact |
| --- | --- |
| `harness/scripts/check-claude-md-lines.mjs:30` | calibration (`claudeMdMaxLines`) |
| `harness/scripts/check-po-language-projection.mjs:14` | manifest |
| `harness/scripts/check-doc-contracts.mjs:457` | calibration (`handover`) |
| `harness/scripts/check-doc-contracts.mjs:492` | manifest presence |
| `harness/scripts/verify.mjs:391` | manifest presence (TP-3 protected) |
| `plugins/pipeline-core/scripts/check-routing-projections.mjs:151` | manifest (v1-schema branch) |
| `plugins/pipeline-core/scripts/session-power.mjs:69` | manifest |
| `plugins/pipeline-core/scripts/toolchain-preflight.mjs:193` | manifest |
| `plugins/pipeline-core/scripts/check-artifact-lifecycle.mjs:21` | State path constant |
| `setup.mjs:577` (`--migrate-agents-adapter`) | manifest |
| `setup.mjs:1540` (`--publish-po-profile`) | manifest |

**B — tier-union classifiers and markers.** These already list `project/` *and*
`.claude/` side by side; they are not stale readers, and routing them through the
resolver would be wrong — they must recognise an artifact at *any* tier. They need a
third entry in step 2, not a resolver call:
`codex-pretool-guard.mjs:194-199`, `codex-session-start-hint.mjs:9-15`,
`guard-lifecycle-ready.mjs:33-39` and `:821`, `human-guard-override.mjs:380-385` and
`:458-476`, `critic-packet-governance.mjs:98`, `guard-devplan.mjs:144`,
`review-economy.mjs:946`, `codex-critic-host.mjs:89`.

**C — deliberate legacy-tier projection writers.** The V3 compiler *owns*
`.claude/pipeline.yaml`/`.claude/pipeline.json` as compiled projection targets; these
are the write side and belong to step 3, not step 1:
`project-onboarding-v3.mjs`, `runner-profile-migration-v3.mjs`,
`runtime-projection-v3.mjs:702-809`, `check-routing-projections.mjs:118` (asserts the
projection target itself), `private-overlay-activation.mjs:355`.
`critic-dispatch-preflight.mjs:159,162` is a fourth kind again: it reads the manifest
**out of a git commit** by tree path, so it follows whatever path the candidate commit
actually carries.

**D — Claude Code's own surfaces; unchanged, forever.** `.claude/settings.json`
(`setup.mjs:165,1712`, `ruleset-freshness.mjs:287`), `~/.claude/plugins/**`
(`pipeline-start-preflight.mjs:56`), `~/.claude/projects` (`usage-ledger.mjs`),
`.claude/.runtime/**` (`codex-host-layout.mjs`), and the session-keyed marker files in
`stop-suggest.mjs:480,722` / `statusline-context.mjs:200,219`.

## Consequences

**Positive.** One resolver decides where authority lives, so the drift class ADR-0053
documented cannot recur one level down. The product owns its directory name instead of
borrowing a runner's. A repository can migrate at its own pace, and can be proven
migrated before anything is deleted. Consumers that never migrate keep working, because
`.claude/` stays in the chain.

**Negative / cost.** Three tiers is more resolution surface than two, and the
category-B lists each grow a third entry that must be kept in sync — a real maintenance
tax, accepted because the alternative (a resolver call in a path classifier) would make
those guards blind to artifacts at a tier they are not currently resolved to. The
configurable name adds a second place besides code where the top tier is decided;
`pipeline.user.yaml` is chosen precisely because it is already the pre-authority root of
the V3 compile chain, so it adds no new bootstrapping order.

## Rejected alternatives

- **Rename in one migration, no chain.** Rejected on the PO's own reasoning: it
  strands every consumer that has not run the migration, and it forces the deletion
  decision at the same moment as the introduction decision. A chain lets the two be
  separated by as many releases as the operator wants.
- **`.agent-pipeline/` as the authority directory.** Rejected: already occupied by the
  private overlay root (`core.lock.json` + four overlay classes), and it names the
  pipeline rather than the product.
- **Keep `project/` and only fix the readers.** Rejected: it leaves a generic directory
  name that collides in ordinary repositories, and it does not answer the naming
  question that the overlay/authority split makes unavoidable.
- **Put the directory setting in the manifest** (`pipeline.yaml`). Rejected as
  circular — the manifest is one of the artifacts whose location the setting decides.

## Follow-up

- [ADR-0055] wires the Ed25519 human hard gate and makes it configurable; it is
  independent of this chain but shares the "configurable, default on" shape.
- The documentation repointing ADR-0053 recorded (roughly fourteen normative documents
  still naming `.claude/pipeline.json` as *the* calibration path) is now a
  three-tier repointing and should follow step 2, not precede it.
