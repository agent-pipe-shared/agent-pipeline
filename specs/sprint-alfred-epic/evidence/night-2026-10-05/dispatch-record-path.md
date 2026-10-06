# RECPATH-d: where a dispatch record may be written today, and the seam to confine it to repository-root `evidence/`

Read-only diagnosis. "Measured" = read or run in this dispatch; "inferred" = not opened line by line (tool budget exhausted at ~24 of 30 uses, three calls refused by the shell grammar).

## (a) Template wording (measured)

- `templates/prompts/goldfish-task.md:455`: "write `evidence/dispatch-record-{{TASK_ID}}.json`" (the only instruction that names a path). Relative path, no "repository root" qualifier (the line contains no "root"). NOT unambiguous: next to a result file under `specs/.../evidence/` a dispatch can read it as sibling-relative. This is the defect in the backlog item.
- `goldfish-task.md:459`: "Create the dispatch record FIRST" - names no path. `:444`, `:436` - "write/finalize the dispatch record" / interim report "into the dispatch record" - no path. `:250`, `:281` - say NOT to write a record (diff-only / native host-commit) - no path.
- `templates/prompts/critic-review.md:75-82`, `:248-250`: path appears only as `evidence/dispatch-record-*.json` / `evidence/dispatch-record-<TASK_ID>.json` in a prohibition (never hand the raw record to a Critic). Not a write instruction.
- `templates/prompts/agent-obligations.md:167` (generated): `evidence/dispatch-record-<TASK_ID>.json` as a commit-trailer binding requirement. Relative, no root qualifier, not a write instruction.
- Mirror copies exist under `plugins/pipeline-core/templates/prompts/` (same three files; inferred identical, per `git grep`).
- The briefing's own field 6 wording ("the `evidence/` directory at the REPOSITORY ROOT, sibling of `plugins/` and `specs/`, never under `specs/`") is a dispatch-time addition, not template text.

## (b) Readers / consumers (partly measured)

Measured to read ONLY root `evidence/`:
- `plugins/pipeline-core/scripts/dispatch-record-write.mjs:213-215` - sanctioned writer; target must equal `evidence/dispatch-record-<taskId>.json` or it fails (`target-path`).
- `plugins/pipeline-core/lib/guard/dispatch-record-lane.mjs:60,126,146` - ownership claim and collision check regex `^evidence/dispatch-record-(...)\.json$`. A record under `specs/.../evidence/` does not match and is therefore invisible to both.
- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs:185` - closing-allowance write lane `^evidence/dispatch-record-.*\.json$`; allowance text at `:196`, `:491`.
- Duplicate of the lane inside `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1305-1393` (same regexes) - a second copy of the logic besides the split module (measured; relation to the split inferred).

Read via an `evidenceDir` variable (directory origin NOT confirmed; my grep for its definition was refused): `plugins/pipeline-core/hooks/guard-dispatch.mjs:179`, `hooks/stop-fanout.mjs:111`, `hooks/post-compact-reground.mjs:72` - `join(evidenceDir, "dispatch-record-<id>.json")`. Inferred: root `evidence/`.

Not opened (inferred to take `evidence/dispatch-record-<id>.json` by convention, from `git grep -l`): `scripts/dispatch-authorship-verify.mjs`, `harness/scripts/check-dispatch-provenance.mjs`, `lib/fanout-ledger.mjs`, `lib/pipeline-commit.mjs`, `scripts/check-critic-skip-coverage.mjs`, `scripts/critic-packet-preflight.mjs`, `lib/critic-export-policy.mjs`, `lib/session-cleanup-recovery.mjs`, `lib/slice-queue.mjs`, `lib/design-advisor-provenance.mjs`, `hooks/guard-el01-tripwire.mjs:81` (case-insensitive `dispatch-record-<anything>.json` by bounded search - may match any location; measured from its comment only). Strip tool: `scripts/dispatch-record-strip-for-critic.mjs` takes `--record <path>` (arbitrary path, `:15`), so it reads wherever it is pointed.
Net: no measured reader scans `specs/**/evidence/` for records.

## (c) Is a misplaced record refused or flagged today? (measured, partial)

- Via the sanctioned writer `dispatch-record-write.mjs`: YES, refused (`:213-215`).
- Via Write/Edit by the dispatch itself: NO refusal found. `dispatch-record-lane.mjs:23-25` classifies `specs/*/evidence/**` as an evidence artifact (host-path scan only, `GUARD-EVIDENCE-HOST-PATH`), and `:146-147` returns `null` (admits) for any path not matching the root pattern. So the misplaced record is silently written and, being unowned/unseen by the collision lane, escapes ownership and task-id-collision protection. No other guard or validator that flags it was found (not exhaustive: unopened files above).

## (d) Smallest seam

In `plugins/pipeline-core/lib/guard/dispatch-record-lane.mjs`, next to `checkDispatchRecordCollision` (`:145`): a check on Write/Edit whose normalized relative path has basename `dispatch-record-*.json` but does not match `^evidence/dispatch-record-...\.json$` (i.e. any `**/dispatch-record-*.json` elsewhere) returns a block verdict (new denial code, in the style of `blockedDispatchRecordCollision` `:205`), wired where `evaluate.mjs:24` already imports the lane. Also mirror into `hooks/guard-lifecycle-ready.mjs:1393` if that duplicate is still live (inferred; check split map `harness/guard-split-map.json`). Complementary but separate: reword `goldfish-task.md:455` to say "repository-root `evidence/`".
RED test host (inferred, not opened): `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (references dispatch-record; NOT in the protected TP list in `agent-obligations.md` section 2). Caveat: the dispatch-record-lane module has no dedicated test file in the `git grep` list.
Risk to design around: the two tracked legacy files in (e) must stay writable/readable (never move/delete); the check should apply to new writes only.

## (e) Tracked misplaced records (measured)

`git ls-files -- "specs/**/evidence/dispatch-record-*.json"` -> 2 files:
- `specs/sprint-alfred-epic/evidence/dispatch-record-ALF-SCANNER-APPLY.json`
- `specs/sprint-alfred-epic/evidence/dispatch-record-ALF-VERIFY-REG-FINALIZE.json`
(`**` handled by git's default pathspec glob; both under `sprint-alfred-epic`.) The two untracked read-only dispatches named in the backlog item are not counted here.

## Checks run
`node --test harness/scripts/check-consumer-safe-paths.test.mjs` -> exit 0 (9 pass, 0 fail).
