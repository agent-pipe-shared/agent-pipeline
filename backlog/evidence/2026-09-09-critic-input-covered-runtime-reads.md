# Critic input-covered runtime reads

`compiledIntermediateReadback()` now removes only physical runtime paths already
covered by the physical repository input root before the unchanged strict
compiler runs. Retained external reads, `/proc/self`, `/dev/null`, write roots,
denied roots, sensitive roots, profile bytes, and network policy are unchanged.

The regression uses an isolated temporary repository topology: an input-root
helper and the root itself are coalesced; a similarly prefixed sibling remains
an explicit runtime read. The real compiler accepts the coalesced set and still
rejects the uncoalesced covered helper for overlap. No source-repository private
session state is created.

`node --test plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs`
exited 0; capture:
`scratch/NVA-B-CRITIC-INPUT-COVERED-READS-1/runtime-suite-green.txt`.
