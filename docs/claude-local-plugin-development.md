# Claude local plugin development

See also: [Codex local plugin development](codex-local-plugin-development.md) for
the Codex-runner counterpart of this document.

Local pre-release testing and normal released operation use separate Claude
Code plugin identities, each backed by a distinct registered marketplace. This
separation is mandatory because Claude Code's marketplace registry is
host-wide (`~/.claude/plugins/known_marketplaces.json`) and keyed by
marketplace **name**, not by the key an operator used to declare it. A
project- or user-scope declaration that resolves to a marketplace manifest
whose `name` field collides with an existing registration silently
overwrites that registration — see "The name-collision hazard" below, which
this repository once suffered from directly.

## Identities

| Purpose | Plugin selector | Marketplace source |
| --- | --- | --- |
| Local development and pre-release live tests | `pipeline-core@agent-pipeline-local` | A separate local marketplace root (a directory outside this checkout; see "Create the local marketplace root" below), `--scope user`, source type `directory`, named `agent-pipeline-local` |
| Normal operation, consumer repositories, and post-release validation | `pipeline-core@agent-pipeline` | The official Git marketplace, or this checkout's own root registered directly (its manifest now correctly self-names `agent-pipeline` — see "Reaching the released selector from this checkout" below) |

Exactly one selector should be enabled locally while testing, installed
`--scope local` from the marketplace named `agent-pipeline-local`. Do not
repoint the `agent-pipeline` marketplace name to a local-development source
and do not use a local candidate through the released selector.

The local selector is only a source-topology override. It does not waive
candidate-bound Verify, Security, Critic, PO, push, release, or remote-readback
gates, and it never changes a consumer repository's portable authority.
Distribution channels remain separate project authority: consumers default to
`stable`, while the Agent-Pipeline self-repository explicitly selects `alpha`.
An operator may opt a project into `beta` only by running the read-only
`pipeline-update-channel.mjs plan --repo <project> --channel beta` operation
and then explicitly confirming its returned digest-bound `applyAction`.
Neither a local source switch nor a session restart changes that channel
automatically.

## The name-collision hazard

This repository's published marketplace manifest (root
`.claude-plugin/marketplace.json`) once self-named `agent-pipeline-local`
instead of the published identity `agent-pipeline` — a regression introduced
by a metadata-refresh commit and fixed by
[ADR-0052](adr/0052-marketplace-identity-restoration-and-local-dev-separation.md).
While that defect stood, a Claude Code marketplace registered under that
`name` field, **not** under the key an operator used to declare it. A
project-scope declaration such as

```json
"extraKnownMarketplaces": { "agent-pipeline": { "source": { "source": "github", "repo": "<org>/<repo>" } } }
```

resolved, then registered itself under the name `agent-pipeline-local` —
**silently overwriting** a correct user-scope declaration of that same name
that pointed at a local checkout. The observed result on two machines:
`~/.claude/plugins/known_marketplaces.json` held `agent-pipeline-local` with
`source.source: "github"`, every session loaded the published release
instead of the local checkout, and the release-selector plugin id declared
in project settings (`pipeline-core@agent-pipeline`) could never resolve
because no marketplace of that name survived registration. Sessions ran
pre-fix code while `claude plugin list` truthfully reported a newer version
installed — the two disagreed because the registry recorded the last
install while the session resolved through the marketplace.

**This is why local development now uses a marketplace root that is
physically separate from this checkout** (see below), rather than the
checkout itself: it is the only arrangement in which the published identity
(`agent-pipeline`, this checkout's own manifest) and the local-development
identity (`agent-pipeline-local`, a distinct root) can both be registered on
the same host at the same time without either overwriting the other.

### Migrating an existing pre-fix registration

If `~/.claude/plugins/known_marketplaces.json` currently holds
`agent-pipeline-local` sourced directly from this checkout (the only
arrangement possible before ADR-0052), the next marketplace refresh
(`claude plugin marketplace update agent-pipeline-local`, or any operation
that re-resolves it) will register it as `agent-pipeline` instead, because
this checkout's manifest now correctly self-names the published identity.
Migrate deliberately instead of waiting for that surprise:

```text
claude plugin marketplace remove agent-pipeline-local
```

Then create the separate local marketplace root below and re-register from
there.

## Create the local marketplace root

The local marketplace root is a directory **outside this checkout** — never a
committed artifact of this repository, and never a sibling directory nested
inside it (`claude plugin validate` rejects a plugin `source` that escapes the
marketplace root via `..`; a nested sibling has no other way to reach
`plugins/pipeline-core`). Pick any convenient location, for example a sibling
of the checkout itself, and record its path as `<local-marketplace-root>`.

Unix / macOS / Unix-WSL:

```text
mkdir -p <local-marketplace-root>/.claude-plugin
mkdir -p <local-marketplace-root>/plugins
ln -s <absolute-checkout-root>/plugins/pipeline-core <local-marketplace-root>/plugins/pipeline-core
```

Native Windows (no elevation required):

```text
mkdir <local-marketplace-root>\.claude-plugin
mkdir <local-marketplace-root>\plugins
mklink /J <local-marketplace-root>\plugins\pipeline-core <absolute-checkout-root>\plugins\pipeline-core
```

Write `<local-marketplace-root>/.claude-plugin/marketplace.json`:

```json
{
  "name": "agent-pipeline-local",
  "description": "Local development marketplace root for agent-pipeline, symlinked to a checkout.",
  "owner": { "name": "agent-pipeline" },
  "plugins": [
    {
      "name": "pipeline-core",
      "source": "./plugins/pipeline-core",
      "description": "Local-development candidate, symlinked/junctioned to a real checkout."
    }
  ]
}
```

`claude plugin validate <local-marketplace-root>` should pass (this exact
shape was confirmed by probe 2 in ADR-0052). Switching which checkout the
local root serves is then a matter of repointing the symlink/junction to a
different checkout's `plugins/pipeline-core` and restarting the session — the
marketplace registration itself (`agent-pipeline-local`, pointed at
`<local-marketplace-root>`) does not need to be removed and re-added.

## The cachebuster mechanism and version convention

`claude plugin install` materializes the build into a cache directory named
after the manifest version string, with `+` replaced by `-`:

```
version "0.5.2+claude.20260805231810.4221989"
  → ~/.claude/plugins/cache/<marketplace-name>/<plugin-name>/0.5.2-claude.20260805231810.4221989/
```

Consequences, both intended: (1) an installed build is **pinned** — it never
silently follows new commits in the source checkout; (2) a new build
propagates **only** when the version string changes. This is the entire
purpose of the `+claude.<...>` build-metadata suffix.

**Scope of the pinning claim (measured 2026-08-06, corrected here).** Both
consequences hold for a **git-sourced** marketplace, which is materialized into
the versioned cache directory above. They do **not** hold for a
**directory-sourced** marketplace such as the local development root: after
`/reload-plugins`, this session served the `conventional-commit` skill from
`<local-marketplace-root>/plugins/pipeline-core/skills/conventional-commit`
— i.e. live, straight through the symlink into the working tree — whereas at
session start the same skill came from
`~/.claude/plugins/cache/agent-pipeline-local/pipeline-core/0.5.1/skills/…`.
A directory source therefore follows the checkout, and the cachebuster's role
for it is to make the *registry* agree with the tree, not to freeze the code
a session runs.

Two practical consequences: `/reload-plugins` is sufficient for a
directory-sourced local build and **no session restart is required** (a restart
is still required for a git source, and the update command still says so); and
a stale `.in_use` marker in an older cache directory does not mean that version
is loaded — check the owning PID before believing it.

Version convention adopted for this repository:
`<semver>+claude.<YYYYMMDDHHMMSS>.<short-oid>`, e.g.
`0.5.2+claude.20260805231810.4221989`. The `<short-oid>` is the 7-character
OID of the **functional** commit whose content the build carries — not of
the metadata commit that writes the string, which cannot know its own OID.
The registry separately records the actual installed commit in its
`gitCommitSha` field, so both are traceable.

## Enter local test mode

```text
claude plugin marketplace add <local-marketplace-root> --scope user
claude plugin install pipeline-core@agent-pipeline-local --scope local
```

Restart the Claude Code session; a plugin change takes effect only after a
session restart. Then confirm the readback contract below before starting
live-test sessions.

## Update an existing local build

`claude plugin install <id> --scope local` is a **no-op** against an
already-installed plugin, even when the manifest version has changed. It
reports `Plugin "<id>" is already installed (scope: local)` and does not
re-materialize. Updating an existing local install requires `claude plugin
update` instead, with a `--scope` flag matching the install scope:

```text
claude plugin update pipeline-core@agent-pipeline-local --scope local
```

`claude plugin update <id>` defaults to `--scope user` and fails against a
`local`-scope install with `Failed to update plugin "<id>": Plugin
"pipeline-core" is not installed at scope user`. On success it reports
`Plugin "pipeline-core" updated from <old> to <new> for scope local
(<checkout>). Restart to apply changes.` Restart the session to apply the
change.

## Readback contract

Verified on a correct local-development installation:

- `claude plugin marketplace list` shows the marketplace with a
  directory/path source (the local marketplace root, not this checkout's
  path), not a GitHub source.
- `claude plugin list --json` returns a bare array; the single enabled entry
  has `id: "pipeline-core@agent-pipeline-local"`, the expected candidate
  `version`, `scope: "local"`, and an `installPath` under the cache
  directory named for that version.
- `CLAUDECODE=1 node <plugin-root>/scripts/pipeline-start-preflight.mjs`
  returns `"status": "ready"` with `version` equal to `installedVersion` and
  `"installedSource": "local-development"`. A `"status":
  "plugin-refresh-required"` here means the manifest and the registry
  disagree — reinstall or update before starting sessions. An
  `"installedSource"` other than `local-development` means the marketplace
  is not attested as a directory source; treat it as the name-collision
  hazard above until disproven.
- A plugin change takes effect only after a **Claude Code session restart**;
  the update command says so explicitly.

## Reaching the released selector from this checkout

Since ADR-0052, this checkout's own root manifest correctly self-names
`agent-pipeline` (the published identity), so registering this checkout
directly — instead of through the separate local marketplace root above —
resolves under the released selector:

```text
claude plugin marketplace add <absolute-checkout-root> --scope user
claude plugin install pipeline-core@agent-pipeline --scope local
```

The readback should show `pipeline-core@agent-pipeline` at the version
carried by this checkout's `plugins/pipeline-core/.claude-plugin/plugin.json`.
This exercises the released selector's name resolution using this checkout's
own content; it is not a substitute for validating an actual GitHub-sourced
release, and it must not be run at the same time as local-development testing
through `agent-pipeline-local` from the same checkout — the two exercise
different purposes and should not be combined.

## Scope model

A local-scope install is per-repository: it is recorded in
`~/.claude/plugins/installed_plugins.json` with a `projectPath` field naming
the single checkout it applies to, and it does not affect any other checkout
on the host. A marketplace declaration, by contrast, lives at `--scope user`
in `~/.claude/settings.json` and is host-wide: every repository on the host
can see the marketplace, but only repositories with their own install and
enablement actually load the plugin. The local marketplace root and the
symlink/junction it contains are what let a single `agent-pipeline-local`
registration serve any checkout on the host: switching which checkout is the
development source means repointing that symlink/junction and restarting the
session, not removing and re-adding the marketplace declaration.

## Exit / retire local test mode

```text
claude plugin uninstall pipeline-core@agent-pipeline-local --scope local
claude plugin marketplace remove agent-pipeline-local
```

`claude plugin uninstall` defaults to `--scope user`, exactly like `claude
plugin update` — the same scope-mismatch trap documented above applies here
too, so a `local`-scope install requires the explicit `--scope local` (or
`-s local`). This document records the documented interface of `uninstall`
(measured from its `--help` output) rather than an observed success output:
unlike the sequences elsewhere in this document, this command has not been
confirmed by readback. The subsequent `marketplace remove` (unqualified,
removing from every scope) drops the local marketplace root's registration,
so the local selector `pipeline-core@agent-pipeline-local` can no longer
resolve. Restart the session after these changes.

### Known limitation (resolved by ADR-0052)

Before ADR-0052, there was no verified command sequence in this document for
reaching the released identity (`pipeline-core@agent-pipeline`) by re-adding
this repository's own GitHub source, because this repository's own published
manifest self-named `agent-pipeline-local` instead. That limitation is
resolved: this checkout's manifest now correctly self-names `agent-pipeline`,
so both the official GitHub-sourced marketplace and a directory-sourced
registration of this checkout itself resolve under the released selector —
see "Reaching the released selector from this checkout" above.

Restart the session after any marketplace or install change and re-run the
readback contract before starting further sessions. Repository state and
continuity remain unchanged by this host plugin-source switch.
