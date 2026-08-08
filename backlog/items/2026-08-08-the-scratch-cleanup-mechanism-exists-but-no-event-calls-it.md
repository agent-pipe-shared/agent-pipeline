---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-cleanup-mechanism-not-wired-to-any-event
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-15
source: "SCRATCH-1 dispatch, 2026-08-08, reported as its own open item. The PO had asked the question directly the same night: 'hoffe nur es gibt einen Event der die Sachen auch wieder aufräumt'."
---

# The scratch cleanup mechanism is built and nothing calls it

## What exists and what does not

`SCRATCH-1` (`7d3904a`, `23a0652`) added a scratch-descriptor lifecycle to
`plugins/pipeline-core/lib/session-cleanup-recovery.mjs`: bind, release, retire —
descriptor-bound, allowlisted, never a broad clear of the directory. 45 tests
green.

**Nothing in the live bootstrap or close flow calls any of it.** The dispatch
reported this itself rather than letting the green suite imply the feature was
live. So today, a session that uses `scratch/` accumulates directories that
nothing removes, and the mechanism that would remove them sits unreached.

This is the same failure shape the scratch directory itself had before this work:
`scratch/` was in `.gitignore` and sketched in the example manifest, and no code
path used it. The mechanism-without-a-caller is one step further along and one
step short of done.

## Why it matters more than it looks

The PO asked the cleanup question directly and the honest answer is "the mechanism
exists, the event does not". A partially wired cleanup is worse than none in one
specific way: it looks finished. A reader who finds `bindScratchDescriptor` and its
tests has no signal that nothing invokes it.

Concretely, unbounded growth is not hypothetical in this repository — the
repo-root `evidence/` directory reached a 128.7 KB file listing under exactly the
same conditions, and is recorded as instance six of
`2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`.

## Second gap, from the same dispatch

This repository's own live manifests do not exempt `scratch/` from the dev-plan
gate. The exemption was activated in `templates/pipeline.yaml.example` (`34962c1`)
but the repo's own `project/pipeline.yaml` and `.claude/pipeline.yaml` still lack
it. So in a lifecycle state where the dev-plan guard restricts writes, an agent in
*this* repository can still be refused a scratch write it has been told to use.

Note the trap this sits behind: those manifest files cannot be committed by an
agent by name, per
`2026-08-08-a-guard-string-match-makes-a-file-uncommittable-by-any-agent.md`.

## Direction, not a design

1. **Name the two events.** Bind on session start, release on ordinary session
   close. Both already have a call site in the bootstrap and close flows; this is
   wiring, not new machinery.
2. **Retire orphans on a later bootstrap**, not at close — a crashed session by
   definition does not reach its close. Reuse the existing orphan-retirement path
   rather than adding a second.
3. **Exempt `scratch/` in this repository's own manifests**, which requires the
   guard trap above to be resolved first or a human to make the edit.
4. **Pin the wiring, not just the mechanism.** A test that a session start creates
   a descriptor and a session close removes exactly what that descriptor claims —
   the current 45 tests cover the functions, which is why the gap survived them.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
