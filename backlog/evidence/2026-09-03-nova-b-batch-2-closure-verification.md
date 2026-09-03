# Nova-B batch 2 — closure verification

Second verification pass of the 2026-09-03 autonomous run. As in batch 1, each
section records what the dispatcher checked directly, not what the implementing
dispatch reported.

## `pipeline.the-ledger-commit-rule-was-given-a-second-home-in-a-different-voice`

Closed against `232eb5b0f98df987ca4801d437d7fc8bae010438`.

The rule now has one normative home: `guardrails/git.md` `GIT-10`.
`backlog/README.md` lines 125–149 are replaced by a two-sentence pointer holding
no rule text of its own.

Verified in the dispatcher's own session after the commit:

- `node harness/scripts/generate-vendored-canon.mjs --check` → "all vendored
  files match their repo-root originals".
- `diff guardrails/git.md plugins/pipeline-core/guardrails/git.md` → empty. The
  vendored copy was carried in the same commit, which is the obligation this
  repository otherwise leaves to a gate run to discover.
- `node harness/scripts/check-doc-contracts.mjs` → valid across 1275 files and
  1236 links, so the pointer resolves and nothing was orphaned.

**Half the item's premise did not survive contact with the code, and that is the
useful result.** The item asserted that `backlog/README.md` named a script path
that does not resolve, and used that as the argument for which of the two texts
was canonical. The dispatch was briefed to establish this from the scripts rather
than from the item's say-so, and found both `reconcile-backlog-ledger.mjs` and
`check-backlog-state.mjs` present and both texts already naming the same correct
path. The claimed broken path was stale.

The real defect — one rule with two normative homes — was untouched by that, and
is what got fixed. Had the dispatch accepted the item's framing, it would have
justified the right change with a false reason, and the item's stale claim would
have been laundered into a closure record.

**"Nothing was lost" is defended rather than asserted.** `GIT-10` did not carry a
standalone rule for the `closure_commit` OID format; it only touched OID validity
inside a discussion of one historical event. That bullet was folded in from the
`README.md` text before the duplicate was reduced, in both the canonical and
vendored copies. This is the one place where the removed text contained something
the survivor lacked, and it was preserved rather than discarded.

## `pipeline.the-opaque-payload-lane-refuses-a-mention-not-a-write`

Closed against `e52e5373` (second of two commits; `6ce13d26` carries the parser).

The item required resolution 1 — teach the lane to tell a write from a mention —
and recorded that correcting the denial text alone would NOT close it. Both were
done, in that order.

Re-run by the dispatcher after both commits landed:

- `node --test plugins/pipeline-core/lib/protected-test-paths.test.mjs` → **29/29**,
  exit 0.
- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` →
  **225/225**, exit 0.

The four assertions that carry the closure are named for the task and cover both
directions:

- a protected path merely mentioned in a write call's *content* argument is
  admitted, for `node -e` and `python3 -c` alike;
- `python3 -c` `open()` without a write-capable mode is never a target, so
  reading is unaffected;
- `git rebase --exec "node --test <protected suite>"` — running a suite, not
  writing to it — is admitted, which was the item's headline regression;
- **variable indirection stays refused.** This is the important one: it proves
  the fail-closed default survived the change rather than being traded away for
  the admissions above.

`TPSHELL-OPAQUEMENTION` pins the same three behaviours end to end through the
guard, and the pre-existing `TPSHELL-REBASE-EXEC` refuse-direction assertions
still pass unchanged.

**Residual scope, reported by the dispatch rather than left to be discovered.**
These shapes still refuse a mere mention, because the parser cannot resolve them:
a write sink whose target is its second argument (`renameSync`, `copyFileSync`
destinations; `os.rename`, `shutil.copy`, `shutil.rmtree`, `os.rmdir` are not in
the sink set at all); `pwsh`/`powershell -c` payloads, a different grammar left
untouched; Perl and Ruby written without parentheses; free text outside any
recognised call, variable indirection included; and a write performed by a script
the command merely names instead of embedding, which is a pre-existing gap stated
in the module's own header.

**The denial text is now true where it fires, and the dispatch said plainly where
it does not.** The new caveat is scoped to `lane === "opaque-interpreter-code"`
and correctly states there that an unresolvable payload is refused whether or not
it writes, naming the route forward. It deliberately does not fire for the
sibling `unparsed-command` lane, where the same false "only a detected write is
refused" claim still stands. That gap is filed as
`backlog/items/2026-09-03-the-unparsed-command-lane-still-carries-the-false-denial-claim.md`
rather than fixed here — the item is worded around the opaque lane throughout,
and widening the diff to a second lane would have been undisclosed scope creep in
the opposite direction from the one this repository usually worries about.

## Note on a dispatcher error in this run: a briefing cited a file that was never created

Recorded here rather than as its own item, because it is a compliance lapse
against an existing remedy, not a new defect.

`goldfish-task.md` requires that a backlog item handed to a dispatch be passed
through `backlog-item-strip-for-dispatch.mjs` first, and that the STRIPPED copy's
path be listed — never the raw item. The reason is recorded in
`backlog/items/2026-08-18-triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference.md`:
an item's own Triage and closure prose records a prior verdict ABOUT the item,
not spec content, and handing it to a dispatch as background contaminates the
dispatch with that verdict.

The `NVA-B-RECSHAPE-1` briefing listed `scratch/strip-recshape.md` as its first
context file. That file was never created — the strip step was skipped for that
one item while being performed for four others in the same run. The dispatch
found the path missing, substituted the raw backlog item, judged the briefing's
own fields self-contained enough to proceed, and reported the substitution as a
briefing defect rather than absorbing it silently.

So the contamination the strip step exists to prevent did occur, and was surfaced
only by the dispatch's own honesty. The lapse is the dispatcher's: a per-item
manual step performed four times out of five is the shape of a step that wants to
be mechanical, which is worth noting the next time the dispatch-construction path
is touched.
