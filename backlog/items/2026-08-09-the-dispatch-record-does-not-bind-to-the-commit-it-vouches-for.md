---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-record-does-not-bind-to-its-commit
type: defect
owner: pipeline
status: open
created: 2026-08-09
due: 2026-08-23
source: "Found independently by all three Critic rounds against the 0.5.4 candidate (A-F2/A-F5, B-F3, C-F3/C-F4), then reproduced by the Elephant one hour later in 1c3cd86."
---

# The dispatch record is the authorship evidence, and it does not bind to the commit

## What happens

Authorship of a production diff is supposed to be provable from two artifacts:
the `Dispatch: <TASK_ID> (goldfish)` commit trailer, and the dispatch record
under `evidence/`. Three independent Critic rounds reviewing twenty commits found
that neither one holds, in four distinct ways.

**1. The trailer is simply absent.** `1dade30`, `d71aa71`, `25ae385`, `33a9f38`
and `da77e75` carry only `AI-Assisted: true`. Two of them are the largest
production diffs in their review sets — a 253-line generator and a 421-line
operator tool that writes protected test paths. `d71aa71` is the commit that
*introduces* the obligations document stating the trailer rule.

**2. The trailer is present and the record contradicts it.**
`evidence/dispatch-record-SHIP-2.json` records `outcome: "stopped-tool-budget"`
and names the work it did *not* reach; `02a8888` performs exactly that work and
carries `Dispatch: SHIP-2 (goldfish)`. `evidence/dispatch-record-SETUP-34.json`
says SETUP-4 was never started; `537eae2` performs SETUP-4 under that ID. Either
a second dispatch went unrecorded or the trailer is inaccurate, and the evidence
cannot distinguish the two.

**3. The record names a different commit entirely.**
`evidence/dispatch-record-AUTHAPPLY-1.json` was offered as authorship evidence
for a review set and names commit `e5a6a9b`, with changed files belonging to a
different subsystem.

**4. Most records are never finished.** `GRAMMARHINT-1`, `OBLIG-1`, `REPAIRMAP-1`,
`R1`, `R1B`, `R2A`, `R2D`, `R3` all sit at `outcome: "in-progress"` with an empty
or null `report`. The field that exists specifically so a truncated run stays
legible is the field that truncation takes out first.

**5. A trailer can be attached by someone who did not do the work.** `1c3cd86`
carries `Dispatch: GUARDFIX-2 (goldfish)` and was made by the Elephant, running a
generator the goldfish's scope excluded. The correct trailer for Elephant
stage-0 work is `AI-Assisted: true` alone. Nothing caught it, because nothing
checks that a named dispatch ID belongs to a record whose scope covers the
committed paths.

## Why the existing check does not catch any of this

The authorship check runs at close and looks for the presence of a trailer. All
five failures above are about *correspondence*, not presence: a trailer with no
record, a record with no matching commit, a record whose own contents deny the
commit, an unfinished record, and a trailer naming a dispatch that did not do
the work. Presence is the one property that was cheap to check, and it is the
one property that carries no information.

## The asymmetry that makes this worse than it looks

The trailer costs one line and is written by the party being vouched for. The
record is written by the same party. Nothing external observes the dispatch. So
the entire authorship story is self-reported, and the Critic — the one reader
whose whole job is to not take the implementor's word for anything — is handed
self-reported evidence as its authorship input. Round B put it exactly: for the
two largest production diffs "there is no deterministic evidence that the work
came from a dispatched fresh-context session rather than the orchestrator
session."

## Direction

1. **Bind the record to the commit, mechanically.** A record should name the
   commit it produced, and a check should verify that every `Dispatch: <ID>`
   trailer resolves to a record whose `outcome` is terminal and whose named
   paths cover the commit's paths. That check can run at close and in CI, and it
   is what turns the pair into evidence rather than a claim.
2. **Make the record's terminal write the same act as the commit.** The record
   is written last and truncation takes it; the commit is written last and
   survives. Whatever ordering makes the commit reliable should carry the record
   with it.
3. **Give the Elephant its own trailer.** Stage-0 Elephant work is legitimate and
   currently indistinguishable from unattributed work, which is why `1c3cd86`
   reached for a goldfish ID that did not fit. A trailer that says what actually
   happened is cheaper than a rule telling people not to misuse the one that
   exists.
4. **Do not fix this by rewriting history.** Every commit named above stays as
   it is; the record of what went wrong is worth more than a clean log.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  general shape: a rule that is enforced socially rather than mechanically.
- `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
  — the same block, and the same root cause for its withdrawn claim: something
  was asserted that nothing measured.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Direction 1 (mechanical binding check) already exists —
  `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` implements
  SHA binding, outcome terminality, path coverage, and recorded-model-vs.-
  agent-definition checking against exactly the five failure shapes this
  item describes, with its own header citing this item by name. It is
  deliberately NOT wired into `harness/scripts/verify.mjs` (TP-3) — a
  standalone diagnostic runnable at close, in CI, or by a Critic against a
  review set, so it never silently strengthens the gate. The Critic
  reviewing `NVA-GMWFIX-2` ran it live against `04a663d9` and found two real
  record defects with it (non-terminal outcome, missing `effort` field),
  both fixed the same session — direct evidence the tool works, not just
  that it exists. Directions 2 (write-ordering so the record survives
  truncation the way the commit does) and 3 (an Elephant-specific trailer
  distinct from the sanctioned `stage-0 (elephant)` form already in use) are
  genuinely still open design questions, unimplemented. This item stays
  open for those two; it is not the "not yet dispatched" state a hasty
  re-read of this item briefly (and incorrectly) recorded in `docs/state.md`
  on 2026-08-17 before this correction.
- **Rationale:** avoid dispatching duplicate work for something that already
  exists and is independently proven to catch real defects; keep the item
  open only for its genuinely unimplemented remainder.
- **Assignment (if accepted):** Directions 2/3 unassigned, no urgency signal
  beyond this item's own text — pick up in a dedicated design pass, not
  this AFK block. Sprint: Alfred — matches its confirmed scope ("mechanical
  governance, measurable rigor, and control integrity",
  `docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17 amendment)
  precisely.
- **Date:** 2026-08-17

### Investigation/Implementation, 2026-08-18 (wave 2, dispatch NVA-W2-3)

Re-confirmed the Triage's Direction-1 characterization live before starting:
`plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` and its test
file (`dispatch-authorship-verify.test.mjs`, 33 cases before this dispatch)
exist, implement the five failure shapes, and are still deliberately not
wired into `harness/scripts/verify.mjs`. This dispatch designs Directions 2
and 3 concretely, as briefed, and implements the one piece of Direction 2
that is genuinely small and unambiguous (a pure test addition proving an
already-shipped mechanism, zero production-code change). It does not touch
`roles/goldfish.md`, `templates/prompts/goldfish-task.md`, or the checker's
production logic — both directions require a normative decision (a role
contract used by every future dispatch, and a new trust category with real
security tradeoffs) that belongs to the Elephant/PO, not to a fresh-context
Goldfish acting unilaterally.

#### Direction 2 — write-ordering so the record survives truncation like the commit does

**Root cause, confirmed by reading the current protocol, not assumed.**
`roles/goldfish.md` GF-09-D already states the intended ordering: "commit →
write `report` into the dispatch record → return the report," with the
stated rationale "a truncated final message then costs the prose, not the
deliverable." That rationale is only half true. `outcome` and `report` are
written together as ONE final act in the current protocol (see
`templates/prompts/goldfish-task.md` field 6 and every real
`goldfish.md`-following dispatch, including this one — the record this
dispatch itself writes follows exactly this shape). A truncation at any
point between the LAST commit and that final act leaves `outcome` at
whatever it was set to at the record's *opening* act — normally
`"in-progress"` — which is exactly `NON_TERMINAL_OUTCOMES`. That is failure
shape 4 of this item's own `## What happens` section
(`GRAMMARHINT-1`, `OBLIG-1`, `REPAIRMAP-1`, `R1`, `R1B`, `R2A`, `R2D`, `R3`).
So "costs the prose, not the deliverable" describes the commit correctly but
is silent on the fact that it *also* costs the authorship-binding evidence
`dispatch-authorship-verify.mjs` needs (dimension 2, outcome terminality) —
the commit survives, but the proof that it belongs to this dispatch does
not.

**Recommended design: a commit-then-checkpoint protocol.** Split the single
final act into two, and move the first half to immediately follow *every*
commit rather than only the last one:

1. **Checkpoint (new, runs right after each `git commit`, before any other
   tool call):** append/merge into the dispatch record —
   - `commits`: append the just-made SHA (the field already reads as an
     array — `declaredCommits()` in the checker already unions `commit`
     (string) and `commits` (array) and treats "any declared sha binds" as
     a pass, purpose-built for exactly this multi-commit case — see
     `dispatch-authorship-verify.mjs` lines 189–201).
   - `outcome`: set to an interim value that is off
     `NON_TERMINAL_OUTCOMES` but distinguishable from a true final
     classification — recommended literal string
     `"committed-pending-report"`. `isTerminalOutcome()` is a denylist, not
     an allowlist (the header explicitly defends this design choice so a
     new word is never misclassified), so this value is ALREADY terminal
     with **zero code change** to the checker. Tests `(n)`/`(n2)` added by
     this dispatch (below) are the machine evidence for that claim.
   - `report.changedFiles`: derived directly from the commit just made
     (`git show --name-only`, the same source `readChangedPaths` already
     uses), not from memory or from the eventual prose summary. This is
     available at commit time and does not need to wait for narrative
     closure.
2. **Final act (unchanged in spirit, now strictly smaller):** overwrite
   `outcome` with the true final classification (`completed`, `blocked`,
   `partial`, ...) and write the six-section prose into `report` (or
   `report.summary`, depending on the record shape a project's template
   uses), exactly as GF-09-D already specifies.

**Why this is genuinely a narrowing, not a full fix, and why that is
acceptable here.** Step 1 already exists as the "next tool call" per current
GF-09-D ordering, so this does not lengthen the exposed window — it changes
*what* gets written in that already-adjacent step. What was previously "the
outcome + the whole prose report, together, once, at the very end" becomes
"the outcome + a machine path list, updated after every commit" plus "the
prose, once, at the end." The truncation window that can still lose the
*authorship claim* (not just the prose) shrinks from "the entire remainder
of the task after the last commit" to "the time between one `git commit`
call and the very next tool call" — which per the six-mandatory-section
report contract is already meant to be the immediate next step, not a
window a well-behaved dispatch should ever leave open on purpose.

**A stronger alternative considered and NOT recommended for now: embed the
claim in the commit trailer block itself**, e.g. a new
`Dispatch-Outcome: <value>` trailer composed as part of the SAME `git
commit` invocation, achieving true atomicity (one OS-level write, no window
at all) and, as a side effect, surviving a fresh checkout too (the JSON
record lives in gitignored `evidence/` per the checker's own LIMITS section
— a second, disjoint problem: "does the record survive truncation within
one run" vs. "does the record exist at all for a third party who only has
the commit"). Rejected as this dispatch's recommendation because it (a)
requires teaching the checker a second, competing source of the `outcome`
field with its own precedence rule against a possibly-stale JSON record,
and (b) commits the goldfish to knowing its true final classification
*before* the last commit of a possibly-multi-commit dispatch, which is not
always true. Worth revisiting if the checkpoint pattern's residual window
ever actually loses a real record — no evidence that it does yet.

**What this dispatch implements:** two regression tests in
`dispatch-authorship-verify.test.mjs` (`(n)` and `(n2)`, appended
immediately before the file's closing git-backed smoke test) that prove,
against the checker as it ships today, that (`n`) a record whose `outcome`
is the recommended interim value plus a matching `commits` entry and
`changedFiles` already returns `PASS`/`bound` with no code change, and
(`n2`) capturing the SHA early is not sufficient on its own — a record that
updates `commits` but leaves `outcome: "in-progress"` still `FAIL`s
`record-not-terminal`, which is the concrete reason Step 1 above updates
BOTH fields together, not just the SHA. `node --test
plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs` → 33/33
pass, exit 0 (31 pre-existing + 2 new).

**What this dispatch deliberately does NOT implement:** the protocol change
to `roles/goldfish.md` GF-09-D and `templates/prompts/goldfish-task.md`
field 6 that would make every future dispatch actually follow the
checkpoint pattern. That is a role-contract rewrite affecting literally
every Goldfish dispatch in the pipeline (including this one, which followed
the CURRENT ordering while writing this very record) — squarely a
decision-register-level change, not something a single fresh-context
Goldfish should enact unilaterally mid-dispatch. Recommend the Elephant
adopt the two-step ordering above verbatim into GF-09-D as a follow-up,
dedicated change (with its own Critic review, since it touches a role
contract).

#### Direction 3 — a distinct Elephant trailer, new taxonomy

**What already exists, confirmed live.** `Dispatch: stage-0 (elephant)` is
already sanctioned (`templates/prompts/agent-obligations.md` §6 /
`harness/scripts/generate-agent-obligations.mjs` lines 256–260) and already
checked (`dispatch-authorship-verify.mjs`'s `role === "elephant"` branch,
lines 282–313): the id must be exactly `stage-0`, and the diff must touch
at most `ELEPHANT_STAGE0_MAX_PATHS` (10) paths, or the verdict is
`UNVERIFIABLE` (never a free `PASS`). This already resolves the *general*
Direction-3 ask as it stood at authoring time (2026-08-09, when the item's
own text said the "correct" trailer for Elephant stage-0 work was bare
`AI-Assisted: true` — i.e. no dedicated trailer existed yet at all). The
Triage (2026-08-17) is explicit that what remains open is a trailer
*distinct* from `stage-0 (elephant)`.

**The gap `stage-0 (elephant)` does not cover, confirmed against the actual
cited commit.** `git show --stat 1c3cd86` (checked live in this dispatch)
is one file, one line, `chore(templates): regenerate the obligations block
after the envelope fix` — trivially inside the stage-0 size bound. Its
problem was never size; it borrowed `Dispatch: GUARDFIX-2 (goldfish)`
because, at that time, no Elephant-direct trailer existed at all (predates
`stage-0 (elephant)`). The gap `stage-0 (elephant)` leaves TODAY is
different and larger: `stage-0` is defined as the OM stage-0 fast-path
(small, disclosed, judgment-light, ≤ ~25 diff lines, no
architecture/schema/guardrail-hook-CI/security-surface change — see
`roles/elephant.md` line 35). Running a NAMED, deterministic,
already-reviewed **generator/regeneration script** directly (e.g.
`harness/scripts/generate-agent-obligations.mjs`, a manifest/version stamp
script) is categorically NOT "ordinary production implementation" — the
Elephant is not authoring the diff, a reviewed script is — but it can
legitimately produce a diff LARGER than the stage-0 bound (a
253-line-generated obligations block is cited elsewhere in this item's own
`## What happens` section) or touch a doc/schema path the stage-0
definition excludes. Today such a commit has no honest trailer: `stage-0
(elephant)` would be `UNVERIFIABLE`/`elephant-direct-oversized` if it trips
the path/size bound, and reaching for a goldfish ID (as `1c3cd86` did) is
exactly the misattribution this item exists to stop.

**Two concrete options, with an explicit recommendation and an explicit
security flag — genuinely still a design question, not implemented here.**

- **Option A (heuristic, low implementation risk): a second sanctioned
  Elephant id**, e.g. `Dispatch: generator-run (elephant)`, verified the
  same shallow way `stage-0` is today — id matches exactly, plus a
  (probably larger, or path-restricted rather than count-restricted) bound
  specific to known generator output paths. Cheap to add (one more
  `if (dispatch.id === ELEPHANT_GENERATOR_ID)` branch, structurally
  parallel to the existing `stage-0` branch), but it is exactly as
  self-reported and exactly as weak an evidence standard as `stage-0`
  already is — the checker's own LIMITS section already says as much about
  `stage-0` ("'Disclosed' and 'judgment-light' are not mechanically checked
  at all"). It would not be a qualitative improvement over what exists,
  only a second copy of the same trust level for a second shape of commit.
- **Option B (mechanical, stronger evidence, real implementation risk): id
  names the generator script itself**, e.g. `Dispatch:
  harness/scripts/generate-agent-obligations.mjs (elephant-generated)`, and
  the checker VERIFIES rather than trusts the claim: re-run the named
  script against the commit's parent tree and assert byte-identical output
  to what the commit changed — the exact discipline
  `generate-agent-obligations.test.mjs`'s own byte-equality contract test
  already applies in CI, just pointed at an arbitrary historical commit
  instead of the working tree. This is strictly stronger evidence than
  anything else this checker produces (mechanical proof, not a
  self-reported heuristic) and would be a genuine improvement to the
  checker's own evidential ceiling, not just a second special case.
  **Explicit security flag, why this is not implemented here:** the `id`
  slot of a `Dispatch:` trailer is attacker-influenced input (it arrives
  from commit text, exactly the same untrusted-input path `SAFE_TASK_ID`
  already exists to fence off for the goldfish branch — see
  `dispatch-authorship-verify.mjs` lines 126–136). A verifier that executes
  a script NAMED IN THAT INPUT is a code-execution surface into the
  verification tool itself and must not accept an arbitrary path — it
  needs a closed allowlist of specific, already-reviewed generator scripts
  (each with its own existing byte-equality test, so the pattern is not
  novel, only extended to historical commits), sandboxing/working-directory
  discipline so the re-run cannot mutate the real tree, and a decision
  about who is authorized to grow that allowlist. Designing an allowlisted,
  safely-sandboxed re-execution path is exactly the kind of
  guardrail/security-adjacent code this dispatch's own stop instruction
  (general TP-3 boundary) says to stop at rather than build unilaterally.
- **Recommendation:** start with Option A only if a second, immediately
  needed generator-run case actually appears (none is currently blocked on
  this); otherwise hold for Option B, since Option A does not raise the
  evidence ceiling the whole item is about and Option B does. Either
  option needs an Elephant/PO decision on the trailer's exact `id`
  vocabulary and, for Option B, a dedicated Critic-reviewed dispatch given
  the code-execution surface — not a unilateral implementation inside a
  design dispatch.

**What this dispatch implements for Direction 3:** nothing in code. The
item stays open for both directions; only the Direction 2 checkpoint
pattern advanced past pure design (two new regression tests proving its
core mechanism, cited above).

**Files touched by this dispatch:** this backlog item (new section only —
`status:` and no `Closure` section added, as briefed) and
`plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs` (two
new tests, `(n)`/`(n2)`, no production code changed).

### Direction 2 adopted into the protocol, 2026-08-19 (Wave 5, dispatch NVA-W5-07)

The commit-then-checkpoint design above is now the ACTUAL protocol text,
not only a recommendation sitting in this backlog item: `roles/goldfish.md`
GF-09-D and `templates/prompts/goldfish-task.md` field 6 both describe the
two-step ordering (checkpoint after every commit; final act overwrites
`outcome`+`report`) verbatim as designed here. No production code changed
— `dispatch-authorship-verify.test.mjs` (33/33) confirms the interim
`"committed-pending-report"` outcome was already terminal to the checker
before this change, exactly as the design predicted. Direction 2 is
**closed**; Direction 3 (a distinct Elephant trailer, still a genuine
open design question per Options A/B above) is the only remaining piece —
item stays `open` for that.
