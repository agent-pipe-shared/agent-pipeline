# PRD — V3 Fresh-Project Onboarding (0.4.2)

## Problem

When Codex is launched in an existing but empty directory, the loaded
`pipeline-core` skill starts with a Git command and therefore emits an
incidental `not a git repository` error.  It then leaves project installation
to the conversation.  This is neither a completed bootstrap nor a useful,
typed recovery path.

The same entry point must distinguish a genuinely new project from a legacy
consumer needing V3 migration and from a partially configured directory.  It
must never make a V2 projection, a private lock, a copied `setup.mjs`, or an
unexplained overwrite look like a successful install.

## Outcome

`pipeline-start` becomes the proactive, official first decision point for a
consumer root:

| Detected state | Required behavior |
| --- | --- |
| Ready V3 project | Run the existing read-only V3 authority check and continue normal bootstrap. |
| Legacy V0/V1/V2 source | Stop normal bootstrap, present/use the official V3 migration inspect → plan → explicit apply path. |
| Fresh empty directory | Produce a read-only, exact initialization plan.  When the user's request is to create a project, run the official initializer before app work; otherwise name the one official command and wait. |
| Partial, invalid, non-empty, or unsafe root | Fail closed with typed diagnostics and no write.  Offer the appropriate repair/migration diagnosis, never infer ownership of existing files. |

The initializer is plugin-shipped and creates one complete V3 authority plus
its V3-owned runtime projection.  The result then passes the same
`v3-bootstrap-authority.mjs` readback used by a migrated consumer and has a
subsequent V3 migration plan of `noop`.

## Scope

1. Add a plugin-owned `project-onboarding-v3` command with `inspect`, `plan`
   and explicit `apply --activate` operations.
2. Define strict, read-only state classification before any Git or pipeline
   assumption in `pipeline-start`.
3. For the fresh state, create a new Git repository (without an automatic
   commit), a valid V3 `pipeline.user.yaml`, and only the V3-owned runtime
   targets through one checked, recoverable transaction.
4. Seed a conservative, runner-neutral V3 policy: Codex and Claude enabled,
   Codex default, `gated` pushes, `feature-branch`, WIP 1, blocking plan/push
   gates, warning security gate, English human/agent language, and no advisor
   export consent.  The command must render the full frozen V3 registry rather
   than duplicate/hand-maintain routing mappings.
5. Seed the minimal bootstrap calibration required by the generated V3
   projection.  Project-specific policy, an initial commit, a remote, and
   application files remain user/next-task decisions.
6. Update the Codex/Claude-facing start instructions so an explicit new-project
   request leads to the initializer rather than a generic question about
   missing files.
7. Remove/replace stale documentation that tells a new consumer to run or copy
   a root `setup.mjs`.

## Non-goals

- No automatic write merely because a directory is empty; the write is
  authorized by an explicit request to create/initialize a project or the
  explicit `apply --activate` command.
- No automatic commits, remotes, dependency installs, app scaffolds, or
  project-policy choices beyond the documented safe seed.
- No repair by replacing files in a non-empty/partial consumer.
- No claim that Codex has an automatic SessionStart hook: the current Codex
  manifest exposes pre-tool guards only.  Proactivity is guaranteed when the
  mandated `pipeline-start` skill executes for the user's first request.

## Contract and safety invariants

- `inspect` and `plan` are read-only; their public output contains paths,
  classifications, diagnostics and digests, not source bytes.
- A root must be a real directory, not a symlink.  All created/checked paths
  must remain inside the resolved root and reject symlink components.
- `fresh` means no Git metadata, no `pipeline.user.yaml`, no V3-owned runtime
  target, and no unrelated entry.  Any ambiguity is `partial`/`unsafe`, never
  fresh.
- `apply` authenticates the unchanged in-process plan, verifies preimages,
  writes transactionally and rolls back all writes (including Git metadata if
  it created it) on failure.
- The V3 source is the sole routing authority.  The initializer does not write
  `.agent-pipeline/core.lock.json`, a consumer-root `setup.mjs`, or V1/V2
  routing configuration.
- The post-apply readback uses the plugin-local V3 authority validator and is
  read-only.  No bootstrap confirmation is allowed before that result is
  ready.

## Acceptance tests

1. A brand-new real empty directory is classified `fresh` without writes;
   `plan` names all targets and `apply --activate` makes a Git repository,
   valid V3 source and runtime projection.
2. Immediately after fresh apply, plugin-local V3 authority readback is ready,
   a follow-up migration plan is `noop`, and no root `setup.mjs`, lock file or
   V2 source exists.
3. The same test exercises the Codex projection and checks the generated
   Codex runtime files.
4. A V0/V1/V2 consumer is classified `migration-required`; its official
   migration remains the only writer.
5. A directory with one unrelated file, a partial runtime, malformed source,
   or a symlink is not initialized and is unchanged by `inspect`/`plan`.
6. `pipeline-start` documents and tests the state branch before any
   `git rev-parse`/V3 authority command, and its fresh-project path directs the
   exact official initializer.
7. The new suite is registered in the repository verification harness; focused
   tests, the full verify, and a fresh Critic review pass.

## Open implementation decision, resolved for this change

The initializer may perform `git init --initial-branch=main` because a user
asking to create a new project has explicitly requested a project rather than
an arbitrary directory mutation.  It must not commit.  If the host Git version
cannot honor the branch option, apply must reject before writing rather than
silently choosing an uncontrolled default branch.
