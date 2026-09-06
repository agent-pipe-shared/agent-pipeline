# Codex-Critic transport: the installed adapter cannot find its ruleset — report and disposition

Handed over by the PO on 2026-09-06 from a Codex session running against the
installed plugin. Recorded here because the PO's chat is not a record; the
report's own facts were re-verified in this checkout before anything was
dispatched.

## The report, as facts (the parts confirmable by opening a path)

- Affected: `plugins/pipeline-core/scripts/codex-critic-app-server.mjs`, line 13,
  `const PIPELINE_ROOT = resolve(HERE, "..", "..", "..");`
- In the source checkout that resolves to the repository root, where
  `roles/critic.md`, `templates/prompts/critic-review.md` and
  `plugins/pipeline-core/scripts/critic-verdict.schema.json` exist. In an
  installed plugin (`<marketplace>/plugins/pipeline-core/scripts/`) it resolves
  two levels above the plugin root, where none of the three exists.
- `physicalRulesetFile()` calls `lstatSync` on each of them before the child
  starts, so the installed adapter fails before any Critic call.
- SHA-256 of the adapter file the Codex session checked:
  `5e60295bfd6ed7d92e95759fdaf15b479599b54b780e309a536447647b081ed0`.

## Verified here, 2026-09-06 16:10Z

- `sha256sum` of this checkout's `codex-critic-app-server.mjs` at `befe4470`
  is the same digest — the installed copy IS the current source; the defect
  is in the source, not a stale install.
- The earlier handover answer
  (`2026-09-06-codex-critic-transport-handover-answer.md`) does not mention
  the installed layout; this is a new finding, not a repeat.
- The plugin already vendors `roles/critic.md` and
  `templates/prompts/critic-review.md` under `plugins/pipeline-core/`, and
  `cmp` against the repo-root files is silent for both. The verdict schema
  already lives inside the plugin. Anchoring the adapter at the executing
  plugin root therefore resolves in both layouts without a fallback chain.

## Disposition

1. Resolution fix + regression check with a real installed-layout fixture:
   dispatched as `NVA-B-XPORTROOT-1` (goldfish-deep), part of the 0.6.2
   candidate.
2. Getting the corrected files into the installed plugin: PO queue #5
   (plugin update + reload); the version string alone proves nothing, the
   readback of the loaded file does.
3. One real selected Critic run with verdict and bound receipts: PO queue #8,
   still blocked by the runner permission classifier on the sandbox spawn.
   Reported as "built, not exercised" until it happens.
4. The Alfred checkout is not touched from here.

No guard is weakened, no receipt is invented, no generic `codex exec`
substitute is introduced.
