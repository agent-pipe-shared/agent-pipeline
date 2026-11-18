# w317 — the telemetry row texts name the Antigravity and Codex routes (candidate 31, lane L17 follow-up, C31-B7)

Chained patch: it is the delta on the base clone of candidate 31 and does NOT apply to the real checkout until that base clone, and then the w315 patch (the two new `usage-ledger.mjs` flags), are applied first (`apply --check` against the integration clone: exit 0; against the real repository: exit 1, expected). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt); the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.

## What

Text and capability data only; no behaviour change, no stored status, no record shape or digest change.

- `config/runner-capabilities.json`, row "Telemetry row at close": the Codex and Antigravity cells no longer say "not available"; they name `usage-ledger.mjs --row <label> --codex-rollout <file>` (price prints n/a) and `--antigravity-transcript <file>` (no dollar half). The file stays the source; the guide table is its row-for-row projection.
- `skills/pipeline-start/references/happy-path.md`: the table row is the same projection; close step 4 no longer says "skip it", it names both flags, says the transcript or rollout path is an argument you pass, and claims no dollar figure.
- `skills/close-block/references/close-light-and-extensions.md` (step 8, telemetry): one added sentence names the two routes.

## Why

The w315 patch added the two token-only flags and updated `close-feature/SKILL.md`; these three texts still said Codex and Antigravity have no telemetry row.

## Test (test first)

New case in `runner-capabilities.test.mjs` ("AC-112: the telemetry row names the token-only ..."): the data row, the guide step 4 line and the close reference must each name the flags, and the Codex and Antigravity cells must neither say "not available" nor carry a dollar figure. RED before the edit (1 of 6 failed, the cell was "not available"), GREEN after: `runner-capabilities.test.mjs` 6 of 6. The existing projection case (guide table equals JSON, row for row) is unchanged and green. No pin was restated (QG-04): none restated the old cell text.

## Not changed

`close-feature/SKILL.md` (done in w315), `usage-ledger.mjs`, the owner column of the row.

## Not proven

Not run: Full Verify, a Critic round, other pins that grep the replaced happy-path or close-reference wording (only `runner-capabilities.test.mjs` was run). How the closer finds the transcript or rollout path is not measured here.
