# Critic range bindings bundle, verification and PO apply blocks (2026-10-28)

Four patches, applied in this order and committed as ONE commit. They apply on the installed candidate (`0.7.0+claude.20261028194700.6d09463`, PF-95 stamp) and
replace nothing. This is a HELD PATCH set: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so.

1. `w7-critic-range-bindings-command-c1.patch`: library and `derive` command for the correction-input bindings, eight cases in the preflight test file.
2. `w7-critic-range-bindings-canon-c2.patch`: the project-state record role in the Critic template (both copies), review protocol section 2.2, the Critic role,
   the Critic skill and an ADR-0014 amendment; one pin case.
3. `w7-critic-range-bindings-preflight-c3.patch`: the dispatch preflight refuses a range with such paths when the bindings file is missing or stale; seven cases.
4. `w7-critic-range-bindings-preflight-c3b.patch`: the VCR01 pin of `critic-dispatch-preflight-tests`, 169 to 246 (measured). The earlier increment
   `w7-critic-range-bindings-command-c1b.patch` is superseded by this one; do not apply it.

Backlog item: `backlog/items/2026-10-28-critic-range-with-state-or-handover-files-has-no-admissible-briefing.md` (PO decision 2026-10-28). Recon:
`CRITIC-RANGE-BINDINGS-RECON-2026-10-28.md`.

## What the bundle does

- The Coordinator runs `plugins/pipeline-core/scripts/critic-correction-input-bindings.mjs derive --root --base --head --out` for the range. Classification is
  closed: the calibration handover file and a `pipeline-handover*.md` file next to it are `project-state record`; files of the Critic results layout
  (`specs/<segment>/evidence/critic/...` and `evidence/critic/...`) are `retained prior result`; everything else is source. A rename across classes is refused
  (`CCI-MIXED`). The document carries blob ids, SHA-256 and modes per touched version and the literal `absent` at addition and deletion boundaries; no body,
  finding or summary. A run on a real 40-commit range of this repository excluded the state file and printed counts only.
- The Critic still never reads those paths: the new role is a binding, not readable material, and the forbidden-material rule is unchanged.
- The preflight, in the range path, derives the document itself. With exclusions and no `correctionInputBindings` it refuses `CDP-CORRECTION-INPUT-REQUIRED`
  with a verb-first message naming the command; a stale or unreadable file is `-STALE`; a refused path is `-REFUSED`. A matching file is echoed
  (`correctionInputBindings: {path, digestSha256}`).

## Test evidence (fresh clone of HEAD, the four patches applied in order)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` | 63 | 63 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |
| `plugins/pipeline-core/lib/pins/opus-critic-only-batched-for-architecture-and-security.test.mjs` | 16 | 16 | 0 |
| `harness/scripts/check-critic-fail-closed.test.mjs` | 1 | 1 | 0 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". Suites that execute the preflight, run with and without the patches on the
same commit: `observe-critic-preflight` (3 tests, 3 fail), `verify-evidence-producer` (50 tests, 5 fail) and `codex-critic-host` (137 tests, 2 fail, CCH136 and
CCH137) fail identically on both, so they are pre-existing; `codex-isolated-critic-contract` (22), `push-prepare` (88) and `report-interruptions` (20) pass.
Full Verify is not run for this bundle.

## Named gaps and gates (not done)

- **Calibration fallback:** when the repository has no readable project calibration, the preflight classifies without the project-state role (a state file in
  the range is then not detected there and the Critic itself stops on it). The default of the library stays refusing.
- **Empty-tree base:** the preflight skips the check when the base is the empty tree (no base commit); a range from the empty tree is not covered.
- **Layout pattern:** the retained-result pattern is `specs/<single segment>/evidence/critic/...`; an epic with a deeper layout is not recognized and would
  show up as source. Confirm against the consumer's real path before relying on it.
- **Real use:** not yet run by a consumer; the next consumer run is the real test.
- The earlier c23 slice (admit refusal detail) is cancelled as wrong premise and is rewritten later.
- Full Verify, batch Critic, native Windows (D58 to D61), D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-command-c1.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-canon-c2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-preflight-c3.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-preflight-c3b.patch`
then `git status --short` (expect the new library and command, the preflight script and its test, the pin test, the template copies, the protocol, the role, the
skill, the ADR and the case-completion test).

Block 2, stage with a path limit and commit ONCE with your own ceremony:
`git add -A -- plugins/pipeline-core harness roles templates docs/adr`
`git commit --no-verify -F scratch/commit-msg-po-apply-critic-range.txt`

Block 3, tell the Elephant. It stamps (`scripts/stamp-candidate.mjs`), then you refresh the installed plugin copy and install, and the Elephant runs
`refresh-mandatory-hooks.mjs` and reads the preflight back.

## After the install, for a consumer

1. `derive` for the range (base to candidate) into a path under `scratch/`.
2. Pass that file as `correctionInputBindings` in the Critic dispatch request and in the briefing's Correction input bindings field.
3. Release the claimed package and start the new one.
