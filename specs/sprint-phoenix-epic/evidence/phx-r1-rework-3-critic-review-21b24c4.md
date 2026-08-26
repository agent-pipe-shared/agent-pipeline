# Critic review — PHX-R1-REWORK-3 (`21b24c4`), round 4 of 4

**Review object:** `21b24c41a8513346929427cc17466b1e3d9d32b2`, single parent
`945fc18`. Delta review over `specs/sprint-phoenix-epic/design/part-a-residuals-and-dispatch-template-drift.md`
(§I.1.3 / §I.1.6 / §I.1.7 / §III.4).

**Verdict: PASS. No findings.**

**Round accounting:** this was the fourth and final autonomous round for residual
R1 (initial + three delta re-reviews), the cap set by the Critic contract. A FAIL
here would have gone to a PO course gate rather than a fifth round; it did not.

**Transcription note.** Persisted by the Elephant from the dispatch's returned
report. Content is verbatim apart from this header. The report contains no
machine-specific absolute paths; the reviewer explicitly checked for and found
none in the review object either.

---

Route requested: claude-opus-5 at max. Effective model identity: **unknown** (no
direct same-dispatch route evidence observed). Isolation:
`functional-equivalent-read-only; OS isolation not asserted` — write tools exist
in this host; none was invoked, nothing was written (not even a scratchpad file),
and no work was delegated.

**Disclosures (auto-injected context, accepted, not silent):** a `CLAUDE.md`
project-instructions block; a user auto-memory summary (push target, dirty-state-file
convention, verify-worktree note); user email and current date; and a git-status
snapshot from the parent session's start. The snapshot was not used as a freshness
reference — I established `HEAD == 21b24c41a8513346929427cc17466b1e3d9d32b2` and
its single parent `945fc18` with my own `git rev-list --parents`, and built the
diff myself. MCP server instructions (Supabase) were also injected and are
irrelevant here; unused. Per the dispatch's own bare fact, the
`PHX-R1-REWORK-3` dispatch record under `.git/` cannot be read in halves: I read
the whole file, including its `rationale` and `deviations` prose. I used it only
for authorship and command/exit-code verification; every claim below is derived
from source I read myself.

**Working-tree divergence:** `.claude/settings.json` is modified relative to
`21b24c4` and is not part of the review object. No other path diverges, so my
source reads match the commit; the marker-tracking claims were nevertheless
verified with `git ls-tree -r 21b24c4` rather than the working tree.

## 1. Findings

**None.**

I re-derived every load-bearing number in the delta from source rather than from
the document, the dispatch, or the implementor's JSON artifact, and each one
holds:

- Write lane, `plugins/pipeline-core/hooks/guard-gate-strength.mjs:185-187`: an
  inline literal of exactly **five** markers (`pipeline.user.yaml`,
  `project/pipeline.yaml`, `.claude/pipeline.yaml`, the two protected
  guard-configuration basenames under `project/` and `.claude/`), resolved
  against `CLAUDE_PROJECT_DIR || process.cwd()` (`:163`), `process.exit(0)` when
  none is present.
- Shell lane, `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:36-44`: six
  literals plus the seven `targets[].path` of
  `plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json` (loader
  `plugins/pipeline-core/lib/runtime-projection-v3.mjs:29-30`, `:129-131`),
  deduped by `:44`. Two targets (`.claude/pipeline.json`, `.claude/pipeline.yaml`)
  collide with literals → 6 + 7 − 2 = **eleven**, matching the document's
  enumeration entry-for-entry and in order. Neither guard-configuration spelling
  is in it.
- Intersection **3** (`pipeline.user.yaml`, `project/pipeline.yaml`,
  `.claude/pipeline.yaml`), write-lane-only **2**, shell-lane-only **8**. The
  document's divergence table is correct in both directions.
- `GOVERNANCE_MARKERS` has exactly one use, `:896`, before
  `gateStrengthShellRefusal()` is reached at `:904-907` — so "stands down before
  any needle is compared" is right, and the lane has no second marker test.
- Fixture `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs:28-38`: its
  five `writeFileSync` calls are `:32` `pipeline.user.yaml`, `:33`
  `project/pipeline.yaml`, `:34` the protected guard-configuration basename under
  `project/`, `:35` GS-2's protected proof path under `project/`, `:36`
  `README.md` → **three** write-lane markers, not four. F-3's correction is right,
  and the added "holds for both lanes because `pipeline.user.yaml` is in both
  lists" is right.
- Tracking at `21b24c4`: all five write-lane markers tracked; ten of eleven
  shell-lane markers tracked; `.agent-pipeline/core.lock.json` neither tracked nor
  present in the working tree.
- Wiring citations `plugins/pipeline-core/hooks/hooks.json:34-42`
  (`Edit|Write|NotebookEdit` → gate-strength) and `:16-24` (`Bash|PowerShell` →
  lifecycle-ready) are exact; `guard-gate-strength.mjs:77-82` does carry the T1 F5
  note with the literal phrase "the wrong way round".
- The F-2 correction holds mechanically: `git add`/`git commit --` are absent from
  the read-only git subcommand list (`guard-lifecycle-ready.mjs:351-366`), so the
  shell lane genuinely does refuse a file-scoped stage of that basename in a
  checkout it recognises as governed — including a vendored copy, whose nested
  repo-relative path the write lane would not even match at `gateStrengthRuleFor()`
  (`:143-151`).

Neither AC change lowers a bar. AC-R1-6's previously unconditional claim was false
in an ungoverned checkout and is now both corrected and *additionally* constrained
(the unconditional form is explicitly forbidden); AC-R1-9 went from one condition
to two plus two explicit failure clauses. Net effect on both is a raised bar.

## 2. Deliberately not flagged

1. **Spec fidelity.** The backlog item
   `backlog/items/2026-08-07-attestation-git-presence-gate-not-gs8-protected.md`
   mandates direction 1 (narrow GS-9 entry + constant extraction, PO-decided);
   §I.1.3 still specifies exactly that, and the delta touches only residual
   precision. All three prior finding IDs are addressed with source-verified
   corrections, not with restatements.
2. **Scope.** One file, seven hunks, all inside §I.1.3 / §I.1.6 / §I.1.7 / §III.4.
   §I.2 (`:628-706`) and Part II (`:1059-1518`) are untouched. §I.1 was fully
   assessable without reaching into either — no out-of-scope coupling to report.
   §I.2.3's one adjacent mention (`:637`, "the governance-marker check that scopes
   the path table") is lane-correct and needed no change.
3. **Disclosed §III.4 deviations.** Two edits beyond the briefed F-3 correction are
   declared in the dispatch record. Both are defensible from the document's own
   rules: correcting the PHX-R1-REWORK-2 entry that called `:893-900` a
   "five-marker" stand-down removes a statement F-1 proved false, and §0.4
   (`:84-88`) requires every session that reworks a section to log its own reads in
   its own dated block.
4. **`AC-R1-9`'s write-lane clause vs. GS-6 — examined, dropped.** Read in
   isolation, "the write-lane refusal (`Edit`/`Write`/`NotebookEdit` on the
   module's path) fires only in a checkout carrying one of the five write-lane
   governance markers" (`:566-568`) is too strong:
   `guard-gate-strength.mjs:168-177` decides GS-6 before the marker branch, so in a
   self-hosted install where the source copy *is* the live plugin root the refusal
   is unconditional. Dropped because the same criterion's first clause mandates
   reproducing or citing the whole §I.1.3 residual block, and residual 3
   (`:256-268`) states that case explicitly; the AC's subject throughout is GS-9;
   and falsification needs a checkout that is simultaneously the live plugin root
   and stripped of all five tracked markers. Consequence not concrete enough for
   the evidence gate — recorded here rather than inflated into a finding.
5. **`§III.4:1735` "all five governance markers" — examined, dropped.** Unqualified
   after the rework's new vocabulary, but true (they are the write lane's five, all
   tracked) and disambiguated by the new block's "With the write-lane check in the
   block above" (`:1783`). A wording nit with no false claim and no anchor.
6. **Table cell "the `Edit` is admitted" (`:309`) — examined, dropped.** Scoped by
   its column header to the gate-strength write lane; `guard-lifecycle-ready.mjs`
   is separately wired for write tools at `hooks.json:25-33` and may still refuse
   for lifecycle reasons. The imprecision runs toward *overstating* exposure, which
   is the safe direction for a residual disclosure, and the prose at `:338` says
   "through the write lane" precisely.
7. **QG-06 (documented-instead-of-fixed).** Residual 4 declines a follow-up with a
   stated reason (reconciling the two lists changes every path rule and the whole
   shell lane; a guard-family/ADR-0058 decision, and §0 forbids this document from
   applying a guard change). The block explicitly serves QG-05's "state the blind
   spots next to the gate" (`:225-226`) rather than presenting documentation as a
   mitigation, and R1 demonstrably inherits both preconditions rather than creating
   them. Not a finding.
8. **QG-04 / test integrity.** No test file touched; no skip, threshold, or
   assertion changed. The rework additionally repaired the coupling to the
   untouched AC-R1-2 ("GST17 passes unmodified, so both lanes refuse it") by
   proving in §III.4 that the fixture's `pipeline.user.yaml` is a marker on both
   lists — so AC-R1-2 remains true rather than silently stranded.
9. **QG-02/QG-03 and the verify gate.** `node harness/scripts/verify.mjs` is
   recorded as *not run — unreachable*, with an explicit "nothing was run in its
   place" and no substitute claim, in both the document and the dispatch record.
   That matches the dispatch's own environment note and QG-03's three-valued
   honesty. For a docs-only diff the relevant deterministic gate is
   `check-doc-contracts`, which ran green with its scope limit stated in the
   machine-written log itself.
10. **Security surface / SEC-04 / ADR-0011 / secrets.** No new imports, packages,
    actions or images (documentation only) — no registry check applicable. Document
    is English throughout, agent-facing, per ADR-0011. No secrets, no absolute
    paths, no machine-specific values in the committed content (`rg` for `/home/`,
    drive letters, session IDs, `Co-Authored`: no hits). No protected basename
    appears in the commit message, consistent with `GUARD-GATE-STRENGTH-SHELL`.

**One out-of-diff observation, offered without severity because it is not a defect
of this review object:** `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:43`
calls `loadRuntimeProjectionV3OwnedKeys()` at *module scope*, and that loader does
an unguarded `readFileSync` + `JSON.parse`
(`plugins/pipeline-core/lib/runtime-projection-v3.mjs:129-131`). A missing or
malformed shipped `config/runtime-projection-v3-owned-keys.json` would therefore
throw during the hook's ES-module evaluation — exactly the disarm-by-config-fault
failure mode that file's own comment at `:99-118` documents having fixed for the
memoized path, and `hooks.json` treats exit 1 as "allow + config warning". This is
product code the diff does not touch and the document is not obliged to enumerate;
it belongs in a backlog item, not in this verdict.

## 3. Trajectory check

**consistent.**

- Authorship: commit `21b24c4` carries the trailer
  `Dispatch: PHX-R1-REWORK-3 (goldfish)` and the dispatch record declares
  `"role": "goldfish"`. A dispatched fresh-context session, not
  orchestrator-authored — no EL-01/EL-16 lifecycle violation. No provider/model
  co-author trailer, no session URL/ID, no account identifier in the commit.
- Mechanical fields verifiable against my own reads: `files`, `insertions: 167`,
  `deletions: 45` match `git show --stat` exactly;
  `statusAfterCommit: "M .claude/settings.json"` and
  `settingsFileStagedOrCommitted: false` match the working tree and the commit's
  file list.
- Machine-written evidence: the `PHX-R1-REWORK-3` doc-contracts log under `.git/`
  records its own command, `node: v24.15.0`, `exitCode: 0`, `startedAt
  2026-08-07T21:01:47.145Z` / `finishedAt …21:01:47.450Z` — 52 s before the commit
  at 21:02:39Z, a plausible ordering for a run on the final pre-commit state. It
  carries its own scope limit, so the green exit cannot be over-read as citation
  evidence.
- The `PHX-R1-REWORK-3` marker-inventory JSON under `.git/` agrees with my
  independent derivation on every field (5 / 11 / 3 / 2 / 8, the exact eleven-entry
  list, the seven targets, the per-line fixture classification, and
  `.agent-pipeline/core.lock.json: false`). I did **not** execute the accompanying
  `.mjs` measurement script; I read the four source files and compared afterwards.
- The one claimed-but-not-run check (`verify.mjs`) is recorded as not run with no
  substitute, consistent with the dispatch's environment note and with the
  document's own "Not run" entry.

## 4. Briefing violations observed

**None.** The dispatch handed references only, plus the delta scope (changed paths,
section list, prior finding IDs and severities, affected invariants). Recorded
transparently: prior finding IDs `F-1`/`F-2`/`F-3` with severities arrived without
their content, rationale, or any expected conclusion, and the dispatch explicitly
required me to re-derive every restated set and count from source — which I did
before comparing to anything. I judge that admissible as the delta-form scope
mechanism rather than a prior verdict. No chat history, no handover, no state, no
implementor explanation reached me except inside the dispatch-record artifact,
whose unavoidable rationale block is disclosed above.

## 5. Verdict

**PASS.**
