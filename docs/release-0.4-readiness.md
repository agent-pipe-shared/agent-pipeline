# Release 0.4.0

**Status:** released on 2026-07-24 as annotated tag `v0.4.0`, peeled commit
`86deb0cbbed8cbaae7d652e7060c220cecfe3436`. The public `main` ref was read
back at that same commit. This record describes the released baseline; it does
not authorize a tag move, a replacement release, or a later publication.

## Version-resolution contract

ADR-0039 requires one release version across five logical public surfaces. The
`0.4.0` release resolves them as follows:

| Surface | Release value | Resolution boundary |
| --- | --- | --- |
| `VERSION` | `0.4.0` | Repository release-version surface. |
| Codex plugin manifest | `0.4.0` | `plugins/pipeline-core/.codex-plugin/plugin.json`. |
| Claude plugin manifest | `0.4.0` | `plugins/pipeline-core/.claude-plugin/plugin.json`; the SHA-phase omission of a `version` field is not used for this candidate. |
| Codex marketplace resolution | `0.4.0` | The selected `pipeline-core` Codex marketplace entry must resolve the Codex manifest above during the later release observation. |
| Claude marketplace resolution | `0.4.0` | `pipeline-core@agent-pipeline`, declared through `.claude/settings.json`, must resolve the Claude manifest above during the later release observation. |

Both marketplace rows were release-readback assertions, not claims that the
local source tree updates an installed cache or a remote marketplace. A later
hotfix must make its own fresh candidate-bound observations and publish an
additional immutable tag; it must not repoint `v0.4.0`.

## Historical release gates

The candidate gates, two-channel observations, authorized publication, tag
creation, and fetch-back/readback completed for the released baseline. This
historical statement does not transfer any of that evidence or authority to a
subsequent version.
