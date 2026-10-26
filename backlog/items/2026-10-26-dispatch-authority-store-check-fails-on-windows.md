---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-authority-store-check-fails-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, finding D25, build 0.7.0+claude.20261026152532.b8a2ec6): the first Goldfish dispatch fails before start with SDC-AUTHORITY-UNAVAILABLE / item-delivery-registry-initialization-failed (AGY-AUTHORITY-PRIVATE-PATH)"
done_when: manual
---

# A dispatch can never succeed on Windows: the dispatch authority store checks POSIX mode bits

## Evidence (consumer, Windows 11, Claude runner)

`guard-dispatch` refuses the first `pipeline-core:goldfish-implementor` dispatch with a generated briefing:
`SDC-AUTHORITY-UNAVAILABLE ... item-delivery-registry-initialization-failed (AGY-AUTHORITY-PRIVATE-PATH)`. No
dispatch has ever passed on that machine; the consumer's code is unchanged. This is a plugin defect, not a state
remnant. The PO confirmed on the machine: `.git\agent-pipeline` exists (28 sub-folders), `.git\agent-pipeline\run`
does not.

## Cause (read from the code by the consumer, to be re-verified against the current source)

`lib/agy-host-observed-store.mjs` lines 56-68 (`own()`, `sharedAncestor()`) demand the POSIX mode bits exactly
`0o700` (directory) and `0o600` (file), a zero `& 0o022` on every ancestor, and `uid` equality. On Windows Node
reports `0o777` for directories and `0o666` for files, and `process.getuid` does not exist. `sharedAncestor` already
fails at the parent folder `.git\agent-pipeline`; the check is never walkable on Windows. Line 86 creates leaves with
`mode 0o700`, which has no effect on Windows. The path is named AGY but a Claude session reaches it through the shared
dispatch route (native host binding of the item delivery registry).

`session-authority-repair.mjs inspect` reports `scratchBinding: dead-anchor`; `heal` repairs that
(`healed`, `reanchored`) and the dispatch fails unchanged. The repair route the guard names does not touch the cause
(same text for different causes, cf. D12 in the Toolbox friction item).

## Wanted

- On `win32` replace the mode/uid verdict by the ACL verdict already used for private custody (see
  `pipeline.windows-private-state-check-counts-acls-inherited-from-above-the-repository`, root-only rule), or skip it
  and keep only the symlink, directory and `realpath` checks. The refusal names the path and the checked bit.
- After the fix, walk the rest of the dispatch path on Windows for further POSIX assumptions (the consumer could not
  reach any step behind this one).
- Regression: a Windows-mocked `stat.mode` (`0o777`/`0o666`, no `getuid`) passes; a symlinked leaf and a foreign owner
  still refuse; the message carries path and bit.

## Acceptance (consumer test for the whole P0 group)

On a Windows consumer with an existing project, a feature run from `draft` to the first Goldfish dispatch needs no
manual `icacls`, `git mv` or `discard-feature` step.

## Notes

Kernel paths: a held patch applied by the PO as operator. Native Windows qualification is needed; none exists.
