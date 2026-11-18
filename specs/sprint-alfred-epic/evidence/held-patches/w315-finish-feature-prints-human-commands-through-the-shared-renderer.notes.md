# w315 — finish-feature prints its human commands through the shared renderer (candidate 31, lane L9)

Chained on the base clone of candidate 31: apply the base-clone patch first, then this one (this patch is a delta and does not apply to the real checkout alone).
Closest existing accepted criterion: AC-112 (fresh bounded attempt under its unchanged text). The PRD and the Spec are unchanged.

## What it changes

- `lib/human-command-render.mjs`: new `humanCommandLine({ executable, argv })`, the single-line form of a command that prose hands a human to copy. Windows-style absolute paths are shown forward-slashed (same rule as the block renderer), a word that needs quoting is double-quoted with `\ " $ \`` escaped, no line break. Display only; no argv, digest or stored value changes.
- `scripts/finish-feature.mjs`: the three human-copy builders now use it: the close `rerun` (finishFeature), `rerunBase`/`rerun` (the one-shot close; every printed rerun, `next` and repair is built from them) and the PO terminal `sign-intent` line of the SBOM override.
- Tests: `human-command-render.test.mjs` (two cases: Windows paths and quoting, POSIX identity and escaping) and `finish-feature.test.mjs` (a literal-scan case: no `node ${fileURLToPath(...)}` template and no `node ${PO_HUMAN_APPROVAL} sign-intent` template remain, the renderer is imported).

## Recon (every printed `node <script>` site of the three scripts)

- `finish-feature.mjs`: rerun, rerunBase, sign-intent = human-copy, converted. Remaining `node ${STATE_WRITER|PREPARE_DISPATCH|REGISTER_PACKAGE|VERIFY_PRODUCER|SECURITY_SCAN|COORDINATOR|OWNER_ROUTE|commit-pipeline-owned...}` texts are repair argv the agent runs (named steps inside prose with placeholders such as `<name>`), left as they are.
- `close-coordinator.mjs`: two repair texts (`continuity-result-bootstrap-plan`, `approve-critic-acknowledgement`) are agent argv; none is a human-copy line. Unchanged.
- `onboarding-init.mjs`: already renders through `boundedOpaqueCopyCommand` / the shared copy-safe rendering; no concatenated human line. Unchanged.

## Not changed

No argument, order or meaning of any command; no gate, signature, approval, record shape or digest. A bare-safe word (`--by Name` without a blank) is now printed unquoted where it used to be always quoted: same shell meaning.

## Not proven

Tests only: the Critic is suspended by the PO for candidates of this repository and no Full Verify ran. A real Windows terminal run was not made; the Windows path form is pinned by string cases.

## Checks

- `human-command-render.test.mjs` 13 of 13 (RED before: missing export), `finish-feature.test.mjs` 107 of 107, `close-coordinator.test.mjs` 58 of 58.
