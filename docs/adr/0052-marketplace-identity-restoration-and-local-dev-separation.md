# ADR-0052: Restore the published marketplace identity and give local development its own

> Agent-Pipeline · Sprint Nova · as of 2026-08-06

**Status:** accepted · **Basis:** Dispatch MARKETPLACE-ID-06, confirmed by git history and the repeated `claude plugin validate` probes documented below.

## Context

This repository's published marketplace manifest, root `.claude-plugin/marketplace.json`,
self-named `"agent-pipeline-local"` — the name reserved for local-development
testing, not the published identity. `git log -p -- .claude-plugin/marketplace.json`
shows this is a **regression, not a design choice**: commit `4375585`
("chore: initial snapshot — Agent-Pipeline v0.1.0") established
`"name": "agent-pipeline"`; commit `60df4e5` ("chore(plugin): refresh local
Codex metadata") — a commit whose stated purpose was refreshing *local*
metadata — mutated the *published* identity to `"agent-pipeline-local"`, and
it was never reverted.

Consequences, confirmed before this change:

- `setup.mjs` (`compileSettingsJson`) unconditionally writes
  `extraKnownMarketplaces["agent-pipeline"] = { source: { source: "github",
  repo: "agent-pipe-shared/agent-pipeline" } }` and
  `enabledPlugins: { "pipeline-core@agent-pipeline": true }` into every
  onboarded project's `.claude/settings.json`. Because a Claude Code (and
  Codex) marketplace registers under the `name` field of its source's
  manifest, not under the key an operator used to declare it, that
  declaration registered under `agent-pipeline-local` — silently
  overwriting any local-development registration of the same name — while
  `pipeline-core@agent-pipeline` could never resolve, because no marketplace
  of that name ever came into existence.
- Observed live on two different machines: the host registry held
  `agent-pipeline-local` with a `github` source while user settings correctly
  declared the same name as a `directory` source, so sessions loaded the
  published release instead of the local checkout. Re-running any plugin
  command from a sibling checkout of this repository re-triggered the
  overwrite within seconds.
- The documentation corpus already expected `agent-pipeline` as the published
  identity: `docs/marketplace-supply-chain-threat-model.md` opens with "the
  public `agent-pipeline` marketplace" and names the sequence `claude plugin
  marketplace update agent-pipeline`; `docs/release-0.4-readiness.md`
  requires `pipeline-core@agent-pipeline` to resolve;
  `docs/codex-onboarding-threat-model.md` states released operation is
  `pipeline-core@agent-pipeline`; the root manifest's own `description` field
  already said projects bind it via `pipeline-core@agent-pipeline` — the file
  contradicted its own `name` field.

Two design probes were run to establish the fix mechanism, both re-run to
confirm before this ADR relied on them:

1. A marketplace manifest whose plugin `source` contains `..`, built under a
   probe root in the system temp directory, is **rejected**:
   `claude plugin validate <probe-root>` failed with
   `plugins[0].source: Path contains "..": ...`, and reported that "Plugin
   source paths are resolved relative to the marketplace root (the directory
   containing .claude-plugin/), not relative to marketplace.json." So a
   sibling directory *inside* this repository cannot serve as a local
   marketplace root pointing back at `plugins/pipeline-core` — the validator
   forbids escaping the marketplace root via `..`.
2. A separate marketplace root — a directory outside this checkout,
   containing `.claude-plugin/marketplace.json` (name `agent-pipeline-local`,
   plugin source `./plugins/pipeline-core`) plus a **symlink** at
   `plugins/pipeline-core` pointing to this checkout's real
   `plugins/pipeline-core` — **passes** `claude plugin validate` (exit 0,
   "Validation passed"; with the marketplace-level `description` field
   omitted, it passes with one cosmetic warning: `description: No
   marketplace description provided. Adding a description helps users
   understand what this marketplace offers`; `--strict` turns that warning
   into a failure, confirming it is advisory only). Both probe roots were
   built under the system temporary directory, never inside this repository,
   and removed after the probe.

## Decision

Restore `"name": "agent-pipeline"` as the published marketplace identity in
the root `.claude-plugin/marketplace.json`. Give local development a
**separate marketplace root**, created outside the published tree (not a
committed artifact of this repository), named `agent-pipeline-local`, whose
sole plugin entry's `source` (`./plugins/pipeline-core`) resolves through a
**symlink** (Unix/macOS/Unix-WSL) or, on native Windows, a **directory
junction** (`mklink /J`, which needs no elevation, unlike a symlink) pointing
at this checkout's real `plugins/pipeline-core`. This is the mechanism
validated by probe 2 above, and it is what lets the published identity and a
local-development identity coexist without either overwriting the other.

`setup.mjs` needs **no change**. Its `extraKnownMarketplaces["agent-pipeline"]`
and `enabledPlugins["pipeline-core@agent-pipeline"]` declarations become
correct the moment the manifest's `name` field is fixed. This is the clearest
evidence available that the manifest, not the generator, was the defect —
recorded here explicitly rather than left implicit.

`docs/claude-local-plugin-development.md` and
`docs/codex-local-plugin-development.md` are updated to describe the separate
local marketplace root, its symlink/junction creation, the register/install/
restart sequence, and the readback contract, in place of the collision
workaround they previously had to document.

## Consequences

**Positive:** `setup.mjs`'s existing, unmodified declarations resolve as
designed for every newly and previously onboarded project. The documentation
corpus's existing references to `pipeline-core@agent-pipeline` (threat model,
release readiness, onboarding threat model) become literally true without
further changes to those files. Local development and the published identity
can be registered on the same host at the same time without either
overwriting the other, because they are backed by two physically distinct
marketplace roots with two distinct manifest `name` fields.

**Negative / operational burden:** this is a change to a **published,
consumer-facing supply-chain surface**, in the exact sense
`docs/marketplace-supply-chain-threat-model.md` defines (the trusted path from
a reviewed repository commit through the marketplace coordinate to plugin
bytes loaded at runtime). It therefore needs PO acceptance before any
publication; landing it on a feature branch is a candidate, not a release.

Any operator currently running a local-development registration named
`agent-pipeline-local` sourced directly from this checkout will, on their next
marketplace refresh (`claude plugin marketplace update agent-pipeline-local`,
or an equivalent re-add), see it re-register as `agent-pipeline` instead,
because the checkout's own manifest now correctly self-names `agent-pipeline`.
They must migrate:

1. `claude plugin marketplace remove agent-pipeline-local` (drops the stale
   registration that pointed directly at this checkout).
2. Create the separate local marketplace root and its symlink/junction back
   to this checkout's `plugins/pipeline-core`, per
   `docs/claude-local-plugin-development.md` ("Create the local marketplace
   root").
3. `claude plugin marketplace add <local-marketplace-root> --scope user`,
   then `claude plugin install pipeline-core@agent-pipeline-local --scope
   local`.
4. Restart the Claude Code session and confirm the readback contract in the
   same document before resuming live-test sessions.

**Residual uncertainty, stated plainly:** the symlink/junction arrangement
was validated with `claude plugin validate` only. Its behavior at `claude
plugin install` time was deliberately **not** tested by this dispatch,
because doing so would mutate a live host plugin registry that an active
session depends on (the dispatch briefing explicitly forbids running any
`marketplace add|remove|update` or `install|update|uninstall` command). This
is recorded as **unverified**, not as proven end to end. The first operator or
Critic who actually runs the install sequence against a real local
marketplace root should confirm or correct this record.

**Tri-platform:** per ADR-0051, this repository is developed for
Windows/macOS/Unix-WSL as a standing requirement, not only for the platform a
given session happens to run on. Both the symlink form (Unix/macOS/Unix-WSL)
and the junction form (native Windows, `mklink /J`) are recorded here and in
`docs/claude-local-plugin-development.md`, not only the form exercised by
this dispatch's own probes (which ran on Linux).

## Rejected alternatives

- **A `..`-relative plugin source from a sibling directory inside this
  repository, pointing back at `plugins/pipeline-core`.** Rejected: probe 1
  above shows `claude plugin validate` rejects it outright —
  `plugins[0].source: Path contains ".."` — and states that plugin source
  paths resolve relative to the marketplace root, not to `marketplace.json`.
  There is no validator-legal way to keep the local marketplace root inside
  this repository's own tree while still pointing at the real plugin
  directory through a relative escape.
- **Keep both identities on one manifest** (pick a single name and use it for
  both local development and the published release). Rejected as structurally
  impossible: a marketplace manifest has exactly one `name` field: one file
  cannot simultaneously self-name `agent-pipeline` and
  `agent-pipeline-local`. Any single-manifest approach necessarily collapses
  one identity into the other, which is the exact defect this ADR fixes.
- **A git-ignored local marketplace root nested inside this checkout.**
  Considered as an alternative to a root fully outside the checkout tree.
  Rejected: a git-ignored directory inside a checkout is routinely destroyed
  by `git clean -fdx` and similar operations that operators run without
  expecting to lose a host marketplace registration, and it blurs the
  boundary between "tracked project tree" and "operator-local host state"
  that this repository otherwise keeps sharp (`.pipeline/private-overlay.yaml`
  and `.pipeline/machine-local.yaml` are the existing precedent for
  machine-local material, and both live outside the tracked docs/plugin
  trees). A root fully outside the checkout keeps that boundary intact and
  needs no `.gitignore` entry.

## Follow-up / review

- This change must receive explicit PO acceptance before it is included in
  any tagged/published release, per the Consequences section above
  (published supply-chain surface).
- The first confirmed `claude plugin install` (or `add`/`update`) run against
  a real separate local marketplace root should be recorded here or in a
  successor ADR entry — today's evidence is validate-only, not install-time.
- Any operator holding a pre-fix `agent-pipeline-local` registration sourced
  directly from this checkout must migrate per the Consequences section on
  their next session touching this repository; this is not a self-executing
  transition.
