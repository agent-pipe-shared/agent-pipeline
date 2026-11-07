# w262: the forensics reader paginates and separates "metadata complete" from "all events read" (candidate 20, G20-31, AC-108)

Base: `35db88a31` (the candidate-20 chain). Built in the slice clone `scratch/agent-out/s-forensics`. One held patch. Closest criterion: AC-108
(PRD and Spec unchanged). Source finding: Codex greenfield report P1 "incomplete forensics interface" (session search caps candidates, the
current raw history is missing, metadata "complete" contains unread windows).

## What

- `scripts/runner-transcript-recovery.mjs`
  - `list` is paginated: optional `pageSize` (1..500) and `cursor`. The candidate order is now total (mtime descending, then session id,
    then path), so the opaque cursor (the last emitted position) stays stable. The result carries `page` (`pageSize`, `returned`, `total`,
    `more`, `nextCursor`, `nextCall`, `candidateBoundReached`) and `metadataComplete` (false when the enumeration cap truncated the
    candidates). Without `pageSize` everything is returned as before and `page.more` is false. Bad values are typed
    `invalid-page-size` / `invalid-cursor`.
  - `readRunnerTranscriptWindow` (new): resumable windowed read of one session's merged raw events, whole lines only, a cursor of
    `<byte offset>.<session digest prefix>`. Result: `startOffset`, `endOffset`, `totalBytes`, `lineCount`, `nextCursor`, `nextCall`,
    `metadataComplete` and `eventsComplete`; `eventsComplete` is true only for the window that reaches the end. A session that changed
    between windows is `cursor-stale`; `invalid-window-size` / `invalid-cursor` are typed. The concatenated windows equal the unwindowed read.
  - `exportRunnerTranscript` adds `metadataComplete` (candidate set and children whole) and `eventsComplete` (no skipped line, no byte
    ceiling). `completeness`/`incompleteReasons` are unchanged, so "complete" still needs both.
  - Turn markers add `endTimestamp` (last timestamped record of the turn), `recordCount` and `toolCallCount` for Claude, Codex and Antigravity
    where the transcript carries them (null/0 otherwise).
  - CLI: `list ... --page-size N [--cursor C]`, `read ... --window-bytes N [--cursor C]` (prints one JSON line with `text`); a cursor without its size
    flag is `invalid-invocation`. `export` takes neither.
- `lib/guard/sanctioned-args-scripts.mjs` (`sanctionedTranscriptRecoveryArgs`): admits exactly those optional flags (digits, URL-safe cursor).
- Tests: six G20-31 cases in `runner-transcript-recovery.test.mjs` (RED first), five existing assertions restated in place with a comment
  (the export key set gained two keys; turn markers compared through `legacyTurns` on their original fields); one catalogue pin case
  with six admitted and eleven refused shapes in `catalogue-admit-prescribed-lifecycle-verbs.test.mjs`.

## Why

A greenfield session could not reconstruct what happened: the list hid how many candidates existed, the raw history could only be read in one
unbounded call, and "complete" did not tell metadata from events.

## Not changed

- `lib/path-spelling.mjs`, the separator-sweep sites, `read`'s default unbounded output, the segment enumeration cap itself.
- Per-phase/duty counters beyond turns: transcripts carry turns, records, tool calls and timestamps, but no phase/duty label, so none is invented.
- Claude and Antigravity have no `read`/`list` adapter today (Codex only); the windowed read follows that.
- Nothing registered in `harness/verify-suites.json` or the inventory; no new test file in the plugin (cases extend registered suites).

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, a run against a real home transcript store (fixtures are synthetic),
Windows/macOS. Each windowed call re-reads and re-authenticates the whole session (bounded output, not bounded memory/time). The chain is not
applied in the real repository, so `git apply --check` there is expected to fail until the chain is applied in order.
