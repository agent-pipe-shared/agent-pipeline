# Release 0.4.5

> **Historical preparation record (superseded).** `v0.4.6` is delivered and
> closed; the sequence below is retained as provenance only, not current work
> or authority.

**Historical status:** local candidate preparation — no push, tag, merge, GitHub Release,
marketplace publication, Issue closure, or remote readback is authorized before
the final PO push gate.

## Scope

This patch closes the blocking fresh-empty-folder path from Issue #61 for
Codex. It adds the optional SessionStart offer, typed and digest-bound V4
onboarding progression, host Git initialization without a commit, restart-safe
compatibility admission, canonical `local-only` transition, and
runner-specific plugin-refresh guidance.

The exact delivered and deferred boundary, the prepared `sprint:NONE`
follow-up Issue, and the future #61 close comment are recorded in
[`specs/2026-07-25-codex-onboarding-0.4.5/result.md`](../specs/2026-07-25-codex-onboarding-0.4.5/result.md).
Issue #25 retains installation-ceremony and confirmation-count tuning.

## Required version equality

| Surface | Required value |
| --- | --- |
| `VERSION` | `0.4.5` |
| Codex plugin manifest | `0.4.5` |
| Claude plugin manifest | `0.4.5` |
| Codex marketplace resolution | observe `0.4.5` only after publication |
| Claude marketplace resolution | observe `0.4.5` only after publication |

The marketplace rows are future readback assertions. Changing the source tree
or installing a local development candidate does not satisfy them.

## Candidate boundary

The release candidate is the final commit and tree produced after all source,
test, documentation, version, and review corrections are complete. Full Verify,
Security, and independent Critic evidence must bind that exact identity.

Any amend, rebase, merge, generated-file update, documentation edit, or version
change after evidence creates a new candidate. All three gates must then be
rerun; evidence is never carried forward by assertion.

The user has authorized the TP1–TP5 protected-path lifts needed for this hotfix.
That authorization does not broaden the release boundary or authorize a push.

## Compatibility and recovery

- Ordinary existing repositories, linked worktrees, local-only repositories,
  and unsupported or drifted control layouts retain their typed classifications.
- The host-initialization receipt is accepted only for the exact root,
  calibration authority, kickoff history, and initialized Git control path.
  Copying, weakening, or drifting it fails closed.
- A canonical `host-managed` to `local-only` transition changes no Git remote,
  does not create a commit, and grants no push or publication authority.
- Codex has no `/reload-plugins` slash command. Native `/plugins` installation
  is followed by `/new`. When an external CLI update races a persistent
  App-Server catalog, the current compatibility path is an explicit,
  user-confirmed global daemon restart outside all affected sessions.
- Consumers may remain pinned to `0.4.4` while a corrective patch is prepared.
  A post-publication defect requires a new version; never move or reuse
  `v0.4.5`.

## Gate sequence

1. Finalize and review the complete intended diff, including version surfaces.
2. Create one candidate commit and record `HEAD` plus `HEAD^{tree}`.
3. From that exact clean candidate, run `node harness/scripts/verify.mjs` and
   read back `evidence/verify-latest.json`. Require exit `0`, clean start and
   finish state, and exact commit/tree equality.
4. Read back the Security evidence produced by the same gate and require no new
   unapproved finding. Any inherited exception remains bounded by its own
   owner, paths, scanners, and expiry; it is not silently widened here.
5. Run one fresh independent Critic against the exact candidate and approved
   specification. A correction invalidates prior evidence and returns to step
   1.
6. Re-read the final commit, tree, worktree, version surfaces, Verify, Security,
   and Critic result.
7. Stop at the Git-push PO gate. The authorization must name the exact commit
   and tree before any push, tag, Issue mutation, publication, or release.
8. Only after that gate, push the approved branch/ref, read it back, create the
   prepared follow-up Issue, close #61 with the final evidence links, and
   continue the separately authorized immutable release sequence.

## Not authorized in this preparation

- pushing any branch or tag;
- changing public `main`;
- creating or closing GitHub Issues;
- publishing a GitHub Release or marketplace build;
- claiming remote or marketplace readback.
