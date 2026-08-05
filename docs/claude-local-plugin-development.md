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
overwrites that registration — see "The name-collision hazard" below.

## Identities

| Purpose | Plugin selector | Marketplace source |
| --- | --- | --- |
| Local development and pre-release live tests | `pipeline-core@agent-pipeline-local` | One explicitly registered local marketplace, `--scope user`, source type `directory`, named `agent-pipeline-local` |
| Normal operation, consumer repositories, and post-release validation | `pipeline-core@agent-pipeline` | The official Git marketplace |

Exactly one selector should be enabled locally while testing, installed
`--scope local` from the marketplace named `agent-pipeline-local`. Do not
repoint the `agent-pipeline` marketplace name to a checkout and do not use a
local candidate through the released selector.

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
`.claude-plugin/marketplace.json`) self-names `agent-pipeline-local`. A
Claude Code marketplace registers under that `name` field, **not** under the
key an operator used to declare it. Therefore a project-scope declaration
such as

```json
"extraKnownMarketplaces": { "agent-pipeline": { "source": { "source": "github", "repo": "<org>/<repo>" } } }
```

resolves, then registers itself under the name `agent-pipeline-local` —
**silently overwriting** a correct user-scope declaration of that same name
that pointed at a local checkout. The observed result on two machines:
`~/.claude/plugins/known_marketplaces.json` held `agent-pipeline-local` with
`source.source: "github"`, every session loaded the published release
instead of the local checkout, and the release-selector plugin id declared
in project settings (`pipeline-core@agent-pipeline`) could never resolve
because no marketplace of that name survived registration. Sessions ran
pre-fix code while `claude plugin list` truthfully reported a newer version
installed — the two disagree because the registry records the last install
while the session resolves through the marketplace.

### Recovery

In order, each confirmed by readback:

```text
claude plugin marketplace remove agent-pipeline-local
claude plugin marketplace add <absolute-checkout-root> --scope user
claude plugin install pipeline-core@agent-pipeline-local --scope local
```

`claude plugin marketplace remove` with no `--scope` removes the declaration
from **every** scope, including a correct one; the `add` re-establishes it.
After the `add`, `known_marketplaces.json` must show `source.source:
"directory"` with `path` equal to the checkout root.

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

Version convention adopted for this repository:
`<semver>+claude.<YYYYMMDDHHMMSS>.<short-oid>`, e.g.
`0.5.2+claude.20260805231810.4221989`. The `<short-oid>` is the 7-character
OID of the **functional** commit whose content the build carries — not of
the metadata commit that writes the string, which cannot know its own OID.
The registry separately records the actual installed commit in its
`gitCommitSha` field, so both are traceable.

## Enter local test mode

```text
claude plugin marketplace add <absolute-checkout-root> --scope user
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
  directory/path source, not a GitHub source.
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

## Exit / retire local test mode

```text
claude plugin marketplace remove agent-pipeline-local
```

This removes the local checkout's marketplace registration, so the local
selector `pipeline-core@agent-pipeline-local` can no longer resolve. This
document does not state a verified command for removing the local-scope
plugin install entry itself — the measured commands available to this
document are `install` and `update`, not a removal/uninstall command; do not
infer one. Restart the session after the marketplace removal.

### Known limitation

There is no verified command sequence in this document for reaching the
released identity (`pipeline-core@agent-pipeline`) by re-adding this
repository's own GitHub source. This repository's own published
`.claude-plugin/marketplace.json` self-names `agent-pipeline-local` (see
"The name-collision hazard" above): a marketplace added from this
repository's GitHub source registers under the name `agent-pipeline-local`,
not `agent-pipeline`, so the selector `pipeline-core@agent-pipeline` cannot
resolve from it. `claude plugin marketplace list` renders such a
GitHub-sourced entry as `Source: GitHub (<org>/<repo>)`, distinguishable
from a directory-sourced entry showing its path — but no add sequence
starting from this repository's own manifest reaches the released selector
id as it currently stands. The released row of the Identities table above
describes the intended target state of normal operation (a marketplace
already registered under the name `agent-pipeline` from an authoritative
distribution source), not a sequence an operator can reach today by
re-adding this checkout's own remote.

Restart the session after any marketplace or install change and re-run the
readback contract before starting further sessions. Repository state and
continuity remain unchanged by this host plugin-source switch.
