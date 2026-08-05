# Codex local plugin development

See also: [Claude local plugin development](claude-local-plugin-development.md) for
the Claude-runner counterpart of this document.

Local pre-release testing and normal released operation use separate Codex
plugin identities. This separation is mandatory because Codex plugin selection
and cache state are shared by App Server sessions. Reusing the released
`pipeline-core@agent-pipeline` identity for a local checkout lets an older
resumed session reconcile that shared identity back to its previously selected
release and delete the candidate cache while another session is using it.

## Identities

| Purpose | Plugin selector | Marketplace source |
| --- | --- | --- |
| Local development and pre-release live tests | `pipeline-core@agent-pipeline-local` | One explicitly registered local marketplace named `agent-pipeline-local` |
| Normal operation, consumer repositories, and post-release validation | `pipeline-core@agent-pipeline` | The official Git marketplace |

Exactly one selector may be enabled while testing. The local marketplace root
must be an absolute physical directory containing
`.claude-plugin/marketplace.json` with name `agent-pipeline-local` and the
candidate at `plugins/pipeline-core`. Its plugin manifest must carry a fresh
Codex cachebuster. Do not repoint the `agent-pipeline` marketplace name to a
checkout and do not use a local candidate through the released selector.

This is a host-wide selection for every repository served by the shared Codex
App Server. It is not an onboarding choice and cannot provide simultaneous
official and local Pipeline versions to different repositories. Never prompt a
consumer project to choose this source. Changing it is an explicit attended
operator operation: close all affected sessions, switch the sole selector,
restart the shared App Server, and verify the registry readback before reopening
sessions.

The local selector is only a source-topology override. It does not waive
candidate-bound Verify, Security, Critic, PO, push, release, or remote-readback
gates, and it never changes a consumer repository's portable authority.
Distribution channels remain separate project authority: consumers default to
`stable`, while the Agent-Pipeline self-repository explicitly selects `alpha`.
An operator may opt a project into `beta` only by running the read-only
`pipeline-update-channel.mjs plan --repo <project> --channel beta` operation and
then explicitly confirming its returned digest-bound `applyAction`. Neither a
local source switch nor SessionStart changes that channel automatically.

## Enter local test mode

Close all Codex sessions before changing the shared plugin selection. Then run
the following outside a Codex project session:

```text
codex plugin remove pipeline-core@agent-pipeline
codex plugin marketplace add <absolute-agent-pipeline-local-marketplace-root>
codex plugin add pipeline-core@agent-pipeline-local
codex app-server daemon restart
codex plugin list --json
codex plugin marketplace list --json
```

The readback must show exactly one enabled Pipeline plugin, selector
`pipeline-core@agent-pipeline-local`, the expected candidate version,
`marketplaceSource.sourceType: "local"`, and a source path below the registered
local marketplace root. Start live-test sessions only after that readback.

An older session may reinstall or select the released identity, but it cannot
replace the isolated local candidate cache. If both selectors become enabled,
stop testing, close all sessions, remove the released selector again, restart
the App Server, and repeat the readback.

## Return to released operation

Close all Codex sessions. Remove the local selector and its marketplace before
restoring the official one:

```text
codex plugin remove pipeline-core@agent-pipeline-local
codex plugin marketplace remove agent-pipeline-local
codex plugin marketplace remove agent-pipeline
codex plugin marketplace add https://github.com/agent-pipe-shared/agent-pipeline.git --ref main
codex plugin add pipeline-core@agent-pipeline
codex app-server daemon restart
codex plugin list --json
codex plugin marketplace list --json
```

The final readback must show exactly one enabled Pipeline plugin, selector
`pipeline-core@agent-pipeline`, the expected released version, and
`marketplaceSource.sourceType: "git"`. Only then reopen critical existing
sessions. Their repository state and continuity remain unchanged by this host
plugin-source switch.

If a daemon restart does not stop cleanly, do not start a second daemon or
delete its socket manually. Close remaining Codex processes and retry the
attended restart from outside a Codex session.
