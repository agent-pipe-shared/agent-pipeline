---
schema: pipeline.backlog-item.v1
id: pipeline.neutral-authority-tier-is-a-frozen-snapshot-the-compiler-never-updates
type: defect
owner: pipeline
status: open
created: 2026-08-06
source: "Sprint Nova session, 2026-08-06, ADR-0054 step 1 (routing hardcoded readers through resolveProjectAuthorityPaths). Comparing the two authority tiers before routing more readers to the resolver revealed that the tier the resolver PREFERS is the one nothing maintains."
due: 2026-09-06
---

# The neutral authority tier is a frozen migration snapshot; the V3 compiler only ever updates the legacy tier

## Description

Project authority resolves neutral-first: `resolveProjectAuthorityPaths()` prefers
`project/pipeline.yaml` / `project/pipeline.json` over `.claude/pipeline.yaml` /
`.claude/pipeline.json`.

The V3 runtime projection's owned targets
(`plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json`) are
`.claude/settings.json`, `.claude/pipeline.json`, `.claude/pipeline.yaml`, and the
four `.codex/*` files. **The `project/*` pair is not a projection target.** It was
written once, by the authority migration, and never again:

```
git log --oneline -- project/pipeline.yaml
  73cb41c fix(authority): vollendet neutrale Projekt-Autorität        # one commit, ever

git log --oneline -- .claude/pipeline.yaml
  5d2b83d docs(release): clarify per-push proof requirement
  fb0e9ac fix(nova): bind critical push proofs and recovery routes
  9393451 feat(settings): modernize V3 defaults
  … five more
```

So the file the resolver serves is the file nobody updates, and the file that is
actually maintained — by the compiler for its owned keys, and by hand for
everything else — is the one the resolver treats as a fallback.

## Impact (measured, not inferred)

`node -e "loadManifest(cwd) → gateConfig(manifest,'push')"` returns:

```json
{"mode":"blocking","type":"human","approval":"standing-approved"}
```

resolved from `project/pipeline.yaml`. Commit `fb0e9ac` ("bind critical push
proofs and recovery routes", 2026-08-02) deliberately changed that field to
`approval: required` — but only in `.claude/pipeline.yaml`. `guard-push.mjs:1403`
auto-passes the human push gate on exactly the value the resolver serves, so
**that hardening has never been in effect.** This is the same defect
[`2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates`](2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md)
records as an observation; this item is its root cause.

Three further divergences, all in the same direction (neutral stale, legacy
current), each of them a compiler-owned key:

| Field | `project/*` (served) | `.claude/*` (maintained) | `pipeline.user.yaml` (source) |
| --- | --- | --- | --- |
| `session.keep_awake` | `false` | `true` | `true` |
| `modelRouting.goldfish_mechanic` | `sonnet-5` / `low` | `haiku` / `medium` | (compiled) |
| `modelRouting.goldfish_deep` | `sonnet-5` / `high` | `sonnet-5` / `medium` | (compiled) |
| `humanRoles.po.displayLabel` | `PO` | `Human` | `Human` |

The routing rows are an MP-05/MP-07 model-discipline violation: a dispatch that
names its model from the resolved manifest names a model the source never
selected.

And one divergence in the **opposite** direction, which is why this cannot be
fixed by copying one file over the other:

| Field | `project/*` | `.claude/*` |
| --- | --- | --- |
| `pipelineUpdateChannel` | `alpha` | *absent* |

`alpha` is this repository's documented distribution channel. The compiler does
not emit the key, so a recompile dropped it from the legacy copy. Overwriting
neutral with legacy would silently move this repository off `alpha`.

## Why this was not caught

`check-routing-projections.mjs` validates the V3 projection against its **owned
targets** — i.e. against `.claude/*`, which is correct and green. Nothing compares
the two authority tiers against each other, and nothing asserts that the tier the
resolver serves is the tier the compiler writes.

## Proposed fix

1. **Decide the `gates.push.approval` value** (PO call — `standing-approved` per
   CLAUDE.md's push policy, or `required` per commit `fb0e9ac`). It is
   hand-maintained, not compiler-derived, so it has no source-of-truth answer.
2. Reconcile the remaining fields **from `pipeline.user.yaml`**, not by copying a
   file: compiler-owned keys take the compiled value, hand-maintained keys take
   the union (keeping `pipelineUpdateChannel: alpha`).
3. Make the tier the resolver serves the tier the compiler writes — ADR-0054
   step 3 moves writes to the top tier, which closes this structurally.
4. Add a **tier-agreement check** to Verify: for every artifact present at more
   than one tier, the compiler-owned keys must be identical. Without it, step 3
   fixes today's instance and nothing prevents the next one.

## Related

- [ADR-0054](../../docs/adr/0054-arbitheon-authority-directory-and-precedence-chain.md) — the precedence chain this defect lives in.
- [ADR-0053](../../docs/adr/0053-setup-generator-authority-resolved-targets.md) — named this drift class but recorded the direction backwards (it reads `.claude/*` as the stale mirror; the evidence above shows the reverse).
- [`2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates`](2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md) — the observed symptom.
