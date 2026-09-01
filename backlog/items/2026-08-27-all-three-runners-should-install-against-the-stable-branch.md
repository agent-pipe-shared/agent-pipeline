---
schema: pipeline.backlog-item.v1
id: pipeline.all-three-runners-should-install-against-the-stable-branch
type: requirement
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
done_when: manual
source: "PO decision 2026-08-27, confirmed in session; distribution mapping performed the same day against the live installers and the update-channel resolver"
---

# All three runners should install against `stable` by default, and check freshness fail-open against it

## Description

Target picture, as decided by the PO: a default installation in a foreign consumer
repository pulls `stable`; the freshness check tests against the same channel; and the
behaviour is **fail-open** — a newer version (a beta, parallel development, someone's
own rebuild) is explicitly allowed, and an older one is tolerated too, but the user is
told plainly and unmistakably that an update is needed.

The local rsync mechanics used today exist only because this repository develops the
Pipeline itself. They are not the consumer path and should not shape it.

## Triggering situation

The PO asked, during the 2026-08-27 candidate session, how a foreign consumer
repository is guaranteed to pull the current `stable`, and whether updating can be
semi-automatic. The distribution path was then mapped against the live code rather
than from memory.

## Affected artifact

- `plugins/pipeline-core/scripts/pipeline-update-channel.mjs` — channel resolution
- `plugins/pipeline-core/hooks/staleness-check.mjs` — the SessionStart observation
- `plugins/pipeline-core/scripts/install-agy.mjs` — the Antigravity installer
- `SETUP.md` — states the missing branch flag itself
- `docs/marketplace-supply-chain-threat-model.md` — governs the auto-update question

## Proposal

**Already built, and not to be rebuilt.** The channel default is already `stable`
(`pipeline-update-channel.mjs`, with `alpha` reserved for
`local-self-development`); the states `current` / `update-available` /
**`local-ahead`** / `unknown` already exist, so "locally newer" is already a distinct
and tolerated state; and `staleness-check.mjs` already runs at SessionStart, never
blocks and never updates.

**The three real gaps:**

1. **Claude Code installs from the default branch, and that is `main`.** There is no
   branch flag for `marketplace add` — `SETUP.md` says so itself. This is therefore
   not solvable in code: `stable` has to become the default branch of the
   distribution repository. That is a PO action, not a commit. Today `main` and
   `stable` happen to point at the same commit, so it works by coincidence rather
   than by construction.
2. **Antigravity has no remote path at all.** `install-agy.mjs` contains no `git`, no
   clone and no ref — only a local path reference written into `.agents/plugins.json`.
   It needs an installer that clones `stable` the way the Codex path does, plus an
   update command. This is the largest gap and is plain build work.
3. **No auto-update.** Deliberately not fully automatic: the plugin IS the enforcement
   layer, and a silent self-update is precisely the supply-chain attack surface
   `docs/marketplace-supply-chain-threat-model.md` describes. What is appropriate is
   detect → report unmistakably → execute on confirmation → require a restart.

**An update never takes effect immediately.** The running process has already loaded
the old copy. Demonstrated in this same session: two dispatches died at a 50-turn
limit the repository had long since raised to 80. Any update flow must end by telling
the user to restart, or it will appear to have done nothing.

**Suggested order:** the agy installer and its update command · sharpen the staleness
message to name the exact runner-specific update command · PO switches the default
branch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a PO requirement; split, because one third of it is
  not agent work at all
- **Rationale:** Type `requirement` is correct — this is a PO-stated obligation,
  not a defect found or an improvement proposed. The item's own mapping is its
  most valuable part and was verified rather than assumed: the channel default is
  already `stable`, `local-ahead` already exists as a tolerated state, and
  `staleness-check.mjs` already runs at SessionStart without blocking. So the
  fail-open behaviour the PO asked for is largely built, and rebuilding it would
  be the expensive mistake here.
  The three gaps are genuinely different kinds of work and must not be scheduled
  as one:
  1. **Default branch (`main` → `stable`)** — not solvable in code; `marketplace
     add` has no branch flag. This is a PO action on the distribution repository.
     It currently works only because `main` and `stable` happen to point at the
     same commit, which is a coincidence, not a design.
  2. **Antigravity remote installer** — plain build work, the largest piece, and
     the only one that is straightforwardly dispatchable today.
  3. **Update flow** — deliberately not fully automatic. The plugin IS the
     enforcement layer, so a silent self-update is the supply-chain surface
     `docs/marketplace-supply-chain-threat-model.md` exists to describe. Accepted
     shape: detect → report unmistakably → execute on confirmation → require a
     restart. The restart is not optional advice: this session re-confirmed that
     a running process keeps the copy it loaded.
- **Assignment (if accepted):** Sprint Nightwing (unchanged) for gaps 2 and 3.
  **Gap 1 is a PO action and carries no window** — it should not sit in a sprint
  waiting for an agent that cannot perform it.
- **Date:** 2026-08-28

## Update 2026-09-01 — gap 1's mechanism superseded by ADR-0078, requirement retained

- **Decision:** merged-into-adr-0078 (gap 1 only); the item as a whole stays
  `open` — gaps 2 and 3 are untouched by this update.
- **Rationale:** [ADR-0078](../../docs/adr/0078-distribution-channels-on-main.md)
  (accepted 2026-09-01, PO decision in session) resolves gap 1 by a different
  mechanism than the one this item proposed. This item's gap 1 asked for
  `stable` to become the distribution repository's default branch, so that a
  plain `marketplace add` (no `--ref` flag) would land a consumer on `stable`.
  ADR-0078 instead retires the `stable` *branch* outright: `main` is the only
  published channel, `main` carries releases, and the `stable` *update
  channel* (unchanged) resolves through the highest final `vX.Y.Z` tag, not
  through any branch — it never depended on the `stable` branch existing.
  `SETUP.md`'s Codex marketplace pin now targets `main`.
  This item's underlying *requirement* is unaffected and remains fully live:
  a default installation must land a consumer on the released version, the
  freshness check must compare against that same released line, and the
  behaviour must stay fail-open (newer-than-released tolerated and reported,
  older-than-released tolerated but flagged plainly). ADR-0078 changes only
  which ref carries "released" — from a `stable` branch to `main` — not
  whether the requirement holds. Gaps 2 (the Antigravity remote installer)
  and 3 (the update flow) are untouched by this decision and remain exactly
  as triaged on 2026-08-28.
- **Date:** 2026-09-01
