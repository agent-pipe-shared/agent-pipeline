# w30j26 — GUARD-READ-TARGET is one exported constant, the briefing block names it, and the obligations template no longer claims that nothing exports the grammar (candidate 30j)

Applies AFTER the integrated 30j tree (the clone int30j): it is a delta on that state and does not apply to the real checkout before it. Order: integrated 30j tree, then J26. `git apply --check` against the integrated 30j tree: exit 0; against the real checkout it fails until that tree is applied (expected). The files are protected plugin source: the PO applies the chain.

## What it changes

- `lib/guard/grammar-denials.mjs` (no imports) gains `export const READ_TARGET_CODE = "GUARD-READ-TARGET";`.
- The three inline literals become that constant, with the denial bytes unchanged: `lib/guard/read-scope.mjs` (native Read/Glob/Grep refusal), `lib/guard/powershell-dialect.mjs` (PowerShell read refusal), `hooks/antigravity-pretool-guard.mjs` (native read refusal). The hook already imported `READ_TARGET_EXACT_FILE_ADVICE` from `../lib/guard/grammar-denials.mjs`, so it loads exactly as before; the constant is added to that same import.
- `lib/dispatch-briefing-build.mjs` `admittedShellShapesBlock()`: the native read entry now reads "A refused native Read, Glob or Grep call (`GUARD-READ-TARGET`; the guard prints this advice): ..." with the code taken from the export. That one added code name is the only change to the block bytes.
- `harness/scripts/generate-agent-obligations.mjs`: the section 1 comment no longer says "no component exports the whole grammar as data"; it names `ADMITTED_GRAMMAR_SHAPES` and `GRAMMAR_DENIAL_REMEDY` as the exported data that the generated briefing carries (no claim about what a refusal prints, because the short repeat form of a refusal does not print the list). Both copies (`templates/prompts/agent-obligations.md` and the vendored plugin copy) regenerated with the generator (the vendored copy is the byte copy of the canonical one, AC-2b).
- Tests (RED first for the three briefing cases): `scripts/dispatch-briefing.test.mjs` gains three cases: (1) the export equals the old literal and the native Read denial's first line is byte-identical (equality case, run through `readToolScopeVerdict` for a refused Glob `**`), (2) a source pin that the three sites import and use `READ_TARGET_CODE` and type no literal, (3) the block names the code once, from the export. `harness/scripts/generate-agent-obligations.test.mjs` gains one case (both copies lack the stale sentence and name the exported tables).

## Restated tests (QG-04)

- Only wording, no assertion weakened: the J18 pin message "the one code without an exported constant is not typed either" now says the code is read from `READ_TARGET_CODE`; the assertion (no typed `GUARD-READ-TARGET` literal in the builder) is unchanged. The AC-1 comment in the generator test no longer claims the grammar is not exported. No pin of the block text needed a restatement: the J18 cases assert lines and counts of exported constants, which the added code name does not change.

## Why

Candidate 30j tile (state-machine analysis, J18 recon): the code had no export, so the briefing could not name it without typing it a second time, and the generated template carried a statement that had become untrue. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `scripts/dispatch-briefing.test.mjs`: 196 of 196 (three new cases red first: 193 pass, 3 fail; then green).
- `harness/scripts/generate-agent-obligations.test.mjs`: 17 of 17 (the new case was written together with the generator change; its assertion about the stale sentence fails against the old text by construction, but it was not run separately RED).
- Check test of this patch: 2 of 2.
- Related suites run alone against the final clone state (all green): `lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs` 25 pass, 1 skipped, 0 fail (26); `lib/powershell-bash-guard-parity.test.mjs` 7 of 7; `hooks/antigravity-native-read-credential-roots.test.mjs` 9 of 9; `lib/pins/agent-obligations-says-no-and-and-while-the-guard-admits-six-segments.test.mjs` 9 of 9.
- `hooks/antigravity-pretool-guard.test.mjs` (the full hook suite) was started and stopped after more than 10 minutes without a result (many subprocess cases under machine load); it is NOT proven here and belongs to the Coordinator's Verify.
- The vendored plugin copy of the obligations file was made as a byte copy of the regenerated canonical file (the existing AC-2b case pins equality); the generator was run for the canonical copy.
- The clone commit message carries no trailers (the shell guard refuses a newline inside a command); the patch is a plain diff, the host writes the real commit message.

## Not changed

- What any guard admits or denies; no denial text or code byte; no gate, signature, approval, push approval, Critic evidence, security scan or audit bundle semantics; no stored status, record shape, digest or key byte.
- `GUARD-READ-TARGET-MISSING` literals (a different code, own text) and the `human-guard-override.mjs` comparison against it stay as they are.
- The other hand-maintained sections of the obligations template (commit discipline and later sections) are untouched.

## Not proven

- Integrated Verify and Critic review are pending (Coordinator). Not run: `hooks/guard-lifecycle-ready.test.mjs` and the full `hooks/antigravity-pretool-guard.test.mjs`. Byte identity of the denial first line is proven for the native Read lane by the equality case and, across runners, by the cross-runner pin above; the PowerShell and Antigravity hook sites are otherwise identical by construction (same template pieces, one constant).
