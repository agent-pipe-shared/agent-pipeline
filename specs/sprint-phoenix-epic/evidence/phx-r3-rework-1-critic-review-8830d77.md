# Critic review — PHX-R3-REWORK-1, round 2 of 4

**Review object:** bounded delta, base `84876f1`, head `8830d77`, enumerated
commits `e231d13`, `9ae1ba0`, `8830d77`.

**Verdict: FAIL.** 1 major (F-A) + 4 minor (F-B, F-C, F-D, F-E).

**Transcription note.** Persisted by the Elephant from the dispatch's returned
report. Findings, trajectory check and briefing violations are verbatim apart from
transcription of machine-specific absolute paths to repo-relative form. **Section 2
("deliberately not flagged") is condensed by the Elephant** — the full enumeration
of re-derived measurements is in the session transcript; what is kept here is every
item that bears on a decision.

---

Bootstrap check passed: ruleset 2914a55713d714d95323231edaddccec5e1d6c2e5a4fbfaaaaa9d913a5fb1efc loaded · Project agent-pipeline · Calibration pipeline.json · State n/a (Critic sees no history) · Role Critic

**Route requested:** claude-opus-5 at max. **Effective model identity: `unknown`** —
no direct same-dispatch route evidence was observed; the host label is not route
evidence.
**T1 assurance:** `functional-equivalent-read-only; OS isolation not asserted`. The
host is write-capable; no write tool and no mutating command was invoked, and
nothing was delegated.

**Disclosure duty.** Auto-injected: the `CLAUDE.md` project instructions, a git
status/recent-commits snapshot from the *parent* session's start, the user's
auto-memory summary, and MCP server instructions (irrelevant here). None of the
injected git snapshot was used as a freshness reference. The three enumerated
commits' messages were read as objects to verify, never as trusted input. The
persisted round-1 verdict was **not** opened although visible in the tree, and
`docs/state.md` was not read as narrative — exactly three pinned lines were resolved
via `git grep <rev>` for coordinate checks. Beyond the five enumerated evidence
artifacts, the round's own generator scripts and inventory JSON under `.git/` were
read.

**Scratchpad.** Pre-existing state found and *not* built on: an empty
`pre-diff-design.md` and a `verify-15b4b21/` directory. Nothing was created or
written; all evidence is stdout from read-only commands.

## 1. Findings

### F-A · major — The design document contradicts the spec's recorded PO scope decision, and this delta re-published the superseded option sizes while editing the sentences that carry the contradiction

**Gap.** The spec records a settled scope decision:
`backlog/items/2026-08-07-dispatch-templates-cite-restructured-operating-model-sections.md:151-153`
reads

> **PO decision on scope (APS, 2026-08-07): B3 — sweep all 39 live agent-facing artifacts (~232 citations).** B1 (this item's original 2 files / 9 citations) and B2 (6 files / ~47) were presented with sizes and not taken.

with a sequencing constraint at `:153-156` (0.5.3 merge first, sweep second). At the
reviewed head the design document still says the opposite in four places: `:62`
"**which files** to change is a scope decision **the PO still owes**"; `:1393-1394`
"written for scope option **B1** … because that is the option the backlog item's
literal wording names. **It is not a green light: §II.6 is an open PO decision**";
`:1430` "§II.6 The implementation boundary — **an open PO decision**"; `:1436`
"**This design does not choose the boundary.**" The document binds itself to exactly
this record at `:51`: "Each item's `Triage` block records a binding 2026-08-07 PO
decision. Taken as given, not re-argued."

This delta touched both affected regions. `e231d13` rewrote `:62-64` (the "PO still
owes" sentence) and rewrote the §II.6 option table, adding a new parenthetical at
`:1448-1452` that re-derives all three sizes "**and stated so they can be
re-added**" — presenting B1/B2/B3 as live alternatives. It also moved the chosen
option's size to a value the PO's record does not carry: B3 `~232` → **233**
(`:1446`, `:1450`), B2 `~47` → **48** (`:1445`), with no note that the recorded
decision was taken against superseded figures. The spec's own re-scope bullet
(`:132-141`) likewise still quotes "**344 citations across 57 files**" and "230
citations", which this delta changed to 345/231.

**Risk — major.** §II.5 is the implementation inventory an implementer works from;
it enumerates three files (B1) and tells the reader the decision is open. Following
it implements the option the PO explicitly did not take (3 files instead of 39) and
drops the recorded merge-before-sweep sequencing constraint. Secondarily, the
delta's own corrected size for the chosen option now silently disagrees with the
size in the authoritative decision record.

**Evidence.** The backlog item at `:151-156` and `:132-141`; the design document at
`:51`, `:62`, `:1371`, `:1393-1394`, `:1430`, `:1436`, `:1444-1446`, `:1448-1452`.
The decision is inside the bound range and predates the delta: `git log` on the
backlog item → `fc2cd9f` `2026-08-07 22:09:59 +0200`, versus `e231d13` at
`2026-08-08 00:01:21 +0200`. It did not exist at the pin:
`git grep -n 'PO decision on scope' 84876f1 -- <backlog item>` returns nothing.

**Spec-ref.** The backlog item's `Triage` block (the spec named in this dispatch),
plus the document's own §0.2 rule at `:51`.

*Stated fairly:* the commit that created the divergence (`fc2cd9f`) is outside the
review object, and the dispatch record lists the backlog item under
`filesDeliberatelyNotChanged`. Reconciliation may be the Elephant's act rather than
the implementor's. It is a finding against this delta nonetheless, because the delta
edited both carrying sentences and re-derived the option sizes without noticing that
one option had already been chosen.

### F-B · minor — The replacement coverage statement in §II.8 is already false at the reviewed head; the coordinate checker scanned the *pre-rework* document

**Gap.** `:1639-1643` states: "**New coverage statement, true of what was actually
done:** every fully qualified `path:line` coordinate in Part II — **40 unique, 47
occurrences** — was resolved against the pinned tree by a checker … and each was
read against the claim it carries." Part II at the reviewed head contains roughly
**52 unique / 62 occurrences** of that coordinate shape — the extra ~12 were
introduced by the rework itself, including several inside the very bullet that makes
the claim.

**Risk — minor.** This is the direct replacement for a coverage claim withdrawn as
overbroad (F2). A reader — or the next reviewer — who takes it at face value will
believe that coordinates such as `templates/CLAUDE.project.md:21`,
`docs/state.md:1801`, `roles/critic.md:103`, `roles/elephant.md:99` and
`templates/prompts/elephant-kickoff.md:114` carry machine assurance. They do not.
(All of them were re-derived by hand and are correct, so nothing downstream is wrong
— but the assurance is claimed, not delivered.)

**Evidence.** Claim at `:1639-1643`. The run's own scope:
`.git/phx-r3-rework-1-coords-84876f1.json:3-8` — `"docRange": [1059, 1517]`,
`"count": 47`, `"unique": 40`; and `:47-53`, which records `docs/state.md:700` at
`docLine 1124` — the *withdrawn* coordinate, i.e. the pre-rework text. Mechanism:
`.git/phx-r3-rework-1-coords.mjs:15-16` reads the working-tree document and slices
`FROM..TO`; the artifact's mtime (23:50) precedes the first delta commit (00:01).
None of the rework's new coordinates appear in the output.

**Spec-ref.** §II.8's own stated verification claims.

### F-C · minor — The "146" undercount figure does not reproduce from the artifact it cites; the artifact yields 147

**Gap.** `:1607-1608` states the run "counted the tokens the scan drops for the
*other* reason: **146** tokens in C1–C9 have no document reference on their line at
all". The cited run reports 147.

**Risk — minor.** The figure is explicitly framed as a measured lower bound left to
the PO with §II.6, and no count depends on it — but it is a bolded measurement in a
verification log, in the delta whose purpose is to correct measurements that do not
reproduce.

**Evidence.** `.git/phx-r3-rework-1-reproduce-84876f1.json:2002` →
`"unattributedCount": 275`. The `audit` array (154 entries) is C1–C9-only by
construction (`.git/phx-r3-rework-1-reproduce.mjs:108`), so every C10/OTHER entry
lies in `unattributed`. Anchored counts: 429 total (= 154 + 275); 127 C10; 1 OTHER.
275 − 127 − 1 = **147**. The unpinned sibling run is not the source either
(`unattributedCount: 326`, 164 C10).

**Spec-ref.** §II.8's stated verification claims.

### F-D · minor — `8830d77`'s replacement quotation is not the text of the line it is attributed to

**Gap.** That commit's entire purpose is "quote the third audit row instead of
characterising it", on the stated standard that "a citation is backed by what the
target reads, not by a paraphrase of it." The resulting text at `:1601-1604` says
`docs/state.md:1801`'s `§7` "**reads** '`PX0-AC-02` through `PX0-AC-07` describe the
very §7 path that is currently blocked'". Line 1801 does not read that. At the pin it
reads `through PX0-AC-07 describe the very §7 path that is currently blocked.` — the
quotation is stitched across `:1800`–`:1801` and silently drops the actual start of
`:1800`.

**Risk — minor.** The conclusion it supports is unaffected (line 1801 alone contains
`PX0-AC-07` and `§7`, so the token demonstrably does not point into
`docs/operating-model.md`). The defect is that the fix for a paraphrase is a
misattributed quote, in a document that elsewhere corrects exactly this class
(`:700`→`:727`, `:4`→`:21`).

**Evidence.** Claim at `:1601-1604`; pinned source
`git grep -n -B2 -A2 'PX0-AC-02' 84876f1 -- docs/state.md` shows the sentence
beginning at `:1800`. The rework's own artifact agrees with the source, not with the
document: `.git/phx-r3-rework-1-reproduce-84876f1.json:841-850` records
`"line": 1801` with the text starting at "through".

**Spec-ref.** The document's own citation standard as restated in `8830d77`.

### F-E · minor — "671 lines" for `docs/operating-model.md` does not reproduce (670)

**Gap.** `:1661` (added by `e231d13`) states "…plus the 2 `<a id>` values; **671
lines**." The file has 670.

**Risk — minor, inert.** Nothing depends on the figure, and it is consistent with a
pre-existing statement at `:1074` outside the review object. But it is an off-by-one
inside the F3 correction bullet, and inconsistent with the 1-based line numbering the
same document uses (there is no line 671).

**Evidence.** `wc -l` → 670; `rg -c ''` → 670. The 671 originates from
`split("\n").length`, which counts the empty trailing element:
`.git/phx-r3-rework-1-anchors-84876f1.json:6` `"fileLines": 671`. The file is
byte-identical at `84876f1` and in the worktree.

**Spec-ref.** §II.8's stated verification claims.

## 2. Deliberately not flagged (condensed by the Elephant)

**Re-derived independently from source and confirmed correct:** F1's substance
(`critic-review.md:15`'s `§4.2` resolves in none of the three candidate documents,
every coordinate exact); **C1 = 9**; **the whole class table** — files 57, totals
345, A 231, B 114, reconciling exactly, with B2 = 48 and B3 = 233 checked by
summation and F4's 78 − 10 = 68 = 51+5+11+1; **F3** — 29 ATX headings, 20 of them
`##`, 31 anchors, ratio 31:29 confirmed including the named slug collisions; **F2's
two corrected coordinates** at the pin; **the "exactly four rule-id tokens"** claim,
with all three non-F1 instances verified at source and the newly disclosed uncounted
citation at `templates/prompts/elephant-kickoff.md:114` confirmed real; **the 490 →
500 correction** (exactly 10 markdown files added, 0 deleted, in the bound range);
**the 344/230/114 reconciliation and the 11-token C10 gap**, both halves reconciling
precisely.

**Scope: clean.** All three commits touch exactly one file. Hunks land at old `:60`
and then only `≥ :1062` — Part I and Part III untouched. No `.mjs`, `.json`, `.yaml`,
test or template file touched; the generated scripts and JSON live under `.git/` and
are untracked.

**Acceptance criteria: clean.** `AC-R3-1` … `AC-R3-7` are byte-unchanged by this
delta — none weakened, deleted or made newly tolerant. AC-R3-1 is in fact
strengthened by F1. AC-R3-3 is explicitly *not* claimed as met: the verify gate is
recorded as not run with no substitute claimed, in both the document and the
dispatch record.

**Security and language: clean.** No secrets, machine-specific absolute paths,
session or account identifiers in committed content; no prohibited trailer anywhere
in the bound range. English throughout, German only as quoted heading titles.

**Not independently re-derived:** the absolute count of 500 tracked Markdown files
(only the +10 delta was verified); the full 47/40 coordinate resolution and the
146/147 token list item-by-item (counts and a sample verified, not every entry);
per-class subtotals for C5 and C6 beyond the arithmetic identity; whether the
authoring session was genuinely fresh-context — no mechanism exposes that, only the
recorded chain.

**Candidates examined and dropped:** a shifting comparison basis at `:1620-1628`
(both sub-claims checked and true, so a citation-precision issue rather than a
finding); a loosely phrased "356 comparable, 357 with F1" (the load-bearing 11-token
claim reconciles exactly); an over-long line at `:1295` (style, no guardrail anchor);
the `verify.mjs` duplicate registration (excluded by the dispatch, not assessed);
QG-06 (the two disclosures are design residuals routed to a named owner, not warn-mode
gates or expiring TODOs).

## 3. Trajectory check

**`consistent`.**

- **Claimed commands were really run, and their outputs reproduce.** The heading
  scans the document claims were independently re-executed and produced the claimed
  line numbers exactly. The `collectAnchors` result reproduces from the checker's own
  source.
- **Evidence artifacts are machine-written and internally coherent.**
  `.git/phx-r3-rework-1-checks.json` is wrapper-recorded with per-command
  `startedAt`/`finishedAt`/`exitCode`/`signal`, `headAtRun: 8830d77…` (the bound
  head) and `measurementPin: 84876f1`; its first command starts four seconds after
  `8830d77` was committed. Artifact mtimes are ordered plausibly across the whole
  chain. One artifact predates a generator revision; the class data still agrees
  exactly, so the earlier comparison remains valid.
- **The verify gate is honestly recorded as not run**, with no substitute claimed, in
  both the document and the dispatch record. The two checks that did run are
  explicitly denied gate status.
- **Authorship: dispatched, not orchestrator-authored.** All three commits carry the
  trailer `Dispatch: PHX-R3-REWORK-1 (goldfish)`; the dispatch record records role
  `goldfish`, dispatcher `elephant`, model and effort with a stated MP-22/MP-23
  rationale, and `commits`/`filesChanged` matching the actual diff exactly. **Limit
  stated plainly:** the dispatch record and trailers are the only mechanism
  available; the recorded chain is self-consistent, but that the session was in fact
  fresh-context cannot be confirmed.
- **No prohibited metadata** in any commit in the bound range.

The two claims that did *not* survive the trajectory check are reported above as F-B
(coverage stated broader than the run performed) and F-C (a figure that does not
reproduce from the run it cites).

## 4. Briefing violations observed

No contamination: the dispatch carried no rationale, summary, praise, expected
conclusion or implementor characterization, and the prior finding IDs arrived as bare
identifiers with content withheld, as contracted. **Two factual defects in the bare
facts**, reported because either could have mis-scoped the review:

1. **"The reviewed file itself was modified only by those three" is false.** Within
   `84876f1..8830d77`, three further commits also modified the design document:
   `94ec7d8`, `f639811` and `21b24c4` (all `docs(phx-r1)`). Evidence:
   `git log --format='%H %s' 84876f1..8830d77 -- <file>` returns six commits. The
   review was scoped strictly to the three enumerated SHAs via `git show` per SHA, as
   instructed, and the difference was confirmed real by observing a `§0.4` hunk
   present in `git diff 84876f1 8830d77` that appears in none of the three.
2. **The "merge of `origin/main`" is not inside the bound range.**
   `git log --merges 84876f1..8830d77` is empty; the merge `35d9e11` has `8830d77` as
   its first parent, i.e. it landed *after* the bound head.

Neither affected the conclusions. Stage and model match the trigger matrix for this
diff class, so no wrong-stage finding.

## 5. Verdict

**FAIL** — 1 major (F-A), 4 minor (F-B, F-C, F-D, F-E).

The four round-1 findings were each genuinely re-derived from source before being
applied — F1, F2, F3 and F4 were re-derived independently and all four corrections
are substantively right, with the class table, the totals and the option arithmetic
reconciling exactly. The delta fails on what it added around them: the design
document now contradicts the spec's recorded PO scope decision while re-publishing
the superseded option sizes (F-A), and the replacement verification claims in §II.8
are broader than the runs behind them (F-B, F-C) or misattributed (F-D).
