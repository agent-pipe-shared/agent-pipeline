# Release 0.4.0 readiness

**Status:** public release candidate documentation as of 2026-07-24. This is
not a tag, a GitHub Release, a marketplace publication, an authorization, or
machine evidence of any remote effect.

## Version-resolution contract

ADR-0039 requires one release version across five logical public surfaces. The
`0.4.0` candidate resolves them as follows:

| Surface | Candidate value | Resolution boundary |
| --- | --- | --- |
| `VERSION` | `0.4.0` | Repository release-version surface. |
| Codex plugin manifest | `0.4.0` | `plugins/pipeline-core/.codex-plugin/plugin.json`. |
| Claude plugin manifest | `0.4.0` | `plugins/pipeline-core/.claude-plugin/plugin.json`; the SHA-phase omission of a `version` field is not used for this candidate. |
| Codex marketplace resolution | `0.4.0` | The selected `pipeline-core` Codex marketplace entry must resolve the Codex manifest above during the later release observation. |
| Claude marketplace resolution | `0.4.0` | `pipeline-core@agent-pipeline`, declared through `.claude/settings.json`, must resolve the Claude manifest above during the later release observation. |

Both marketplace rows are required release-readback assertions, not claims that
the local source tree has updated an installed cache or a remote marketplace.
The later HAW-E procedure must freshly observe and bind them with the candidate
and immutable `v0.4.0` tags before publication.

## PO disposition and remaining gates

The PO has confirmed that Sentinel and HAW-E implementation/tests are
functionally complete. That disposition does not manufacture candidate-bound
machine evidence, a canonical backlog transition, a Result, or permission to
publish.

Release remains pending all of the following for the exact final candidate:

- Full Verify, Security, and an independent final Critic with candidate-bound
  evidence.
- Fresh, bounded-age two-channel observations and the required HAW-E remote
  authorization/consents.
- The authorized joint publication, immutable tag creation, and required remote
  fetch-backs/readbacks.

Until those gates complete, `0.4.0` is only a public release candidate and no
remote release should be inferred from these documentation surfaces.
