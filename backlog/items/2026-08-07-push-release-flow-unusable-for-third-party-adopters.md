---
schema: pipeline.backlog-item.v1
id: pipeline.push-release-flow-unusable-for-third-party-adopters
type: defect
owner: pipeline
status: closed
created: 2026-08-07
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "0000000000000000000000000000000000000000"
closure_evidence: "backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md"
source: "PO, live during the 0.5.2 main-release session, 2026-08-07 — verbatim: 'Eine Entwickler Agent-Pipeline die nicht pushen und releasen kann ist unbrauchbar, außerdem viel zu unhandlich mit so vielen Freigaben.'"
due: 2026-09-06
---

# The push/release flow is unusable for a third-party adopter as shipped

## Description

An agentic development pipeline whose own agent cannot push a branch or
release a candidate without the human running commands in their own terminal,
multiple times, across multiple independent and non-obvious layers, does not
deliver on its core value proposition. Measured directly in this same
session, for one candidate, one branch push and one main-release push:

1. **Push-approval signature** (`gates.push_approval: signature`, ADR-0056)
   — a detached Ed25519 proof the agent is cryptographically incapable of
   producing, by design. Correct and intentional on its own.
2. **Two more PO-only artifact-producing steps just to prepare that
   signature** — `po-approval-gate.mjs prepare-critical` turned out to also
   be agent-blocked in practice (`GUARD-CROSS-REPO-MUTATION`, the external
   signing directory sits outside the project root), despite its own
   docstring saying "the agent may prepare this." The PO had to run both the
   prepare and the sign step personally, each a multi-flag CLI invocation
   the PO had no way to construct without the agent dictating it live.
3. **`GG-03` double-confirmation override** for the actual `main` push —
   its own separate ritual (explain, confirm, fixed phrase `OVERRIDE
   GG-03`, one-time token), independently of the signature already
   verified in step 1.
4. **The Claude Code harness's own "auto mode classifier"**, opaque to the
   agent, blocked the actual `git push`/`git restore` invocations a further
   two times in this same session, on top of everything the Pipeline itself
   already gated — discovered only by attempting the command, with no way
   for the agent to anticipate or bundle it with the Pipeline-side
   confirmation.
5. Net result: the PO ended up running the actual `git push` to `main`
   personally, in their own terminal — the exact operator action the whole
   apparatus above exists to route through the agent under a verified
   signature. The agent could not complete the one action all of the
   above was building toward.

None of the individual layers is unreasonable in isolation — the signature
requirement is a deliberate, load-bearing security decision (ADR-0055/0056),
and GG-03 is a real second line of defense against an unattended-agent
main-branch overwrite. The problem is the **composition**: five
independently-discovered, non-obvious, mostly-undocumented-for-agents
layers stacked on one release, several of which were assumed rather than
verified because nothing describes the real, current shape of this flow in
one place. This is a distinct, compounding defect from any one layer's own
design.

## Triggering situation

Live during the 0.5.2 release session (2026-08-07): every step above was
discovered by trial and error in the session — including two confirmed wrong
assumptions by the agent (which script/step is agent-executable; which of
two candidate external directories held the trust-anchored key), corrected
only after live failures (`GUARD-CROSS-REPO-MUTATION`, `CRITICAL-PROOF-
TRUST-ANCHOR-MISMATCH`). See also
`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`
(a related, narrower guard-scope gap found the same session) and the
2026-08-07 Nova IV section of `docs/state.md` for the session's own account.

## Affected artifact

The composition of `plugins/pipeline-core/hooks/guard-push.mjs`,
`plugins/pipeline-core/hooks/guard-git.mjs` (GG-03), the Claude Code harness
auto-mode classifier (outside this repo's control), and the
`po-human-approval.mjs`/`po-approval-gate.mjs`/`pipeline-state.mjs
approve-push` script family. No single file is "the bug"; the end-to-end
path a PO or agent must actually walk is.

## Proposal

Not designed here — this item exists to make the finding durable and force
a deliberate PO decision, not to freelance a fix for guardrail-class flow
design. Candidates for a future session to evaluate, explicitly not a
commitment to any of them:

1. **One authoritative, current document** ("How a push/release actually
   works, end to end, today") that names every layer above, which ones are
   agent-executable, which are PO-only, and the exact commands — so this
   is read once per session rather than rediscovered live. This alone would
   have prevented both wrong-assumption incidents in this session.
2. Evaluate whether the harness classifier's blocking of an
   already-Pipeline-authorized command is something the PO can pre-clear at
   the settings level (the classifier's own message suggests a Bash
   permission rule can allow this) — if so, document that as the standard
   setup step for anyone running this Pipeline, not a per-session surprise.
3. Evaluate whether `prepare-critical`'s external-directory write genuinely
   needs the full cross-repo-mutation refusal, or whether a narrower,
   config-declared exception (raised independently in
   `2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`'s
   sibling finding) would let the agent do the one half of the ceremony its
   own design intent already says it may.
5. **PO restatement, 2026-08-07, later the same day and sharper than the
   original:** an agent pipeline that cannot release *after the human has
   approved* is not worth having — so releasing must become possible, "auch
   mit Signatur oder Config je nach chat". That names the mechanism, not just
   the goal: the same admission shape ADR-0059 established for guard denials
   — signature always, chat whenever that is what the repository has genuinely
   committed to — should extend to the release path, rather than the release
   path keeping its own separate, human-only ceremony. Note what this does and
   does not ask for: the human still decides, and still signs in `signature`
   mode. What changes is that their decision, once made, is something the
   agent can *act on* end to end, instead of handing back a list of terminal
   commands. The PO deferred this deliberately on 2026-08-07 rather than
   improvising it during a release ("das nehmen wir uns noch mal vor"), and
   took only the branch push that session.
6. A frank cost/benefit PO review of whether five stacked layers is the
   intended security posture for every push, or whether some are redundant
   given the others (e.g., does GG-03 add real protection once a candidate
   already carries a verified per-commit, per-destination Ed25519 signature
   for `kind: push`?) — not proposing removal here, proposing the question
   be asked deliberately rather than left as accreted layers.
7. **PO requirement, 2026-08-07 evening, stated after walking the branch-push
   flow end to end:** *"das es zu umständlich ist und korrigiert werden muss.
   die eine signatur muss für alles reichen und auch da will man nicht 2
   befehle sondern nur den einen."* Two distinct requirements, both narrower
   and more testable than the earlier restatements, so they are recorded
   separately:

   **7a. One signature covers the work, not one action.** The same session
   signed twice within an hour — once for a guard maintenance window, once for
   a branch push — each binding its own candidate commit, each invalidated by
   the next commit. The second signature was needed *because* the first
   signature's own follow-up work produced commits. That is a loop: sign,
   fix, invalidate, sign again. A design has to answer what a signature
   legitimately covers. Candidate-bound is not obviously wrong — it is what
   makes the proof meaningful — but a session that lands ten commits under one
   approved intent should not need ten signatures, and today the binding is
   the only thing preventing that.

   **7b. One command, not two.** `prepare-critical` followed by
   `approve-critical` is not two decisions; it is one decision split across
   two invocations, and the split has already produced a live failure. In this
   very session `prepare-critical` failed on an invalid `--expires-at` (the
   validator demands an exact `toISOString()` round-trip, so a timestamp
   without milliseconds is rejected — and the error names no field), and
   `approve-critical` then signed the **stale** request still on disk without
   noticing. The confirmation text looked entirely normal; only the commit
   hash inside it revealed the wrong subject. Two commands with no coupling
   means a failed first step plus a successful second step yields a
   confidently signed wrong thing. Merging them is not only ergonomics — it
   removes that failure mode by construction.

   **7c. The loop is structural, not just a scheduling accident.**
   `approve-push` writes its approval and proof-consumption record into
   `project/pipeline-state.json`, which is **tracked**. So every approved push
   leaves the working tree dirty; Verify's `candidate-preflight` then refuses
   the candidate until that record is committed; and committing it moves `HEAD`
   past the very `forCommit` the approval names. Measured directly in this
   session: Verify went red on exactly one of 255 suites for this reason alone.
   The sequence approve → verify → push cannot be walked without either
   skipping Verify or invalidating the approval. Any fix for 7a has to answer
   this, because it is the same loop closing through the state file rather than
   through ordinary work commits.

   Two smaller findings from the same walkthrough, worth fixing whatever
   shape 7a/7b take:

   - **`prepare-critical`'s validation error is unattributed.** It says only
     `critical approval request is invalid`. Diagnosing it required reading
     the validator's source. Naming the offending field costs nothing.
   - **The push must be written with an explicit destination ref.**
     `git push origin <branch>` is refused; `git push origin
     HEAD:refs/heads/<branch>` is admitted. The guard's reasoning is sound and
     should stay — an attestation names a ref, and a command that does not
     name one cannot be matched against it without guessing — but nothing
     tells the operator this in advance, and the denial does not say it
     either. It is discoverable only by being refused.
8. **Layer 4 confirmed again, and it is outside this repository's control.**
   The Claude Code auto-mode classifier refused the fully authorized push —
   after the Pipeline's own gate had passed — and the only resolutions were
   the human running the command or granting a standing Bash permission rule.
   Candidate #2 above (pre-clear it at the settings level as a documented
   setup step) is the only lever this project has, and this session is a
   second measured instance of the same block.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open, partially addressed.
- **Rationale:** candidate #1 of this item's own Proposal — "one
  authoritative, current document" naming every layer, agent-executable vs.
  PO-only, exact commands — is now written:
  [`docs/push-release-flow.md`](../../docs/push-release-flow.md), pointed to
  from CLAUDE.md's bootstrap-read "Push policy" bullet and "Where things
  live" section so it is read once per session rather than rediscovered
  live, as this item's own text asked for. This closes the *documentation*
  half of the finding, not the underlying composition: candidates #2
  (whether the harness classifier can be pre-cleared at the settings level),
  #3 (whether `prepare-critical`'s cross-repo refusal can be narrowed), and
  #4 (a deliberate PO cost/benefit review of whether five stacked layers is
  the intended posture) are all still open and are explicitly PO-territory
  calls per the item's own Proposal — none should be picked unilaterally by
  an agent. The PO's underlying verdict ("unusable for third parties as
  shipped") stands until at least one of #2-#4 is actually decided and
  acted on, not just documented.
- **Assignment (if accepted):** #2 and #3 are candidates for a future
  Goldfish/design dispatch once the PO makes the call in #4; #3 overlaps
  `backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`'s
  narrower scope and should be designed together with it rather than
  separately, since both are instances of "guard drawn at a whole-directory
  boundary rather than at what actually needs protecting."
- **Date:** 2026-08-07

## Occurrence — 2026-08-12, the "one authoritative document" is itself now stale

The triage above closed the documentation half on the strength of
`docs/push-release-flow.md` being "one authoritative, current document."
Tonight it was not current: ADR-0061 (`docs/adr/0061-uniform-human-approval-ceremony.md`
on `origin/main`; not present on this branch)
(2026-08-07, same day as this item, PO instruction to collapse
`prepare-critical`/`approve-critical` into a single `authorize-critical`
command) exists on `origin/main` and is implemented in the installed plugin
build (0.5.4) but was never merged into `sprint_phoenix` — this branch's own
`plugins/pipeline-core/scripts/po-human-approval.mjs` has no
`authorize-critical` at all (confirmed by grep), and `docs/push-release-flow.md`
still describes only the two-step ceremony ADR-0061 calls superseded. An
Elephant following this repo's own canonical, read-once-per-session doc
therefore constructed and handed a PO two commands (`prepare-critical` then
`approve-critical`) that were the *wrong* ceremony for the installed plugin,
one of which the PO had to correct by name after recognizing the discrepancy
from having watched a different session (Nova) run the real one. Full
sequence and every SHA/error code involved:
[`docs/state.md`](../../docs/state.md), section "Push ceremony ran to
completion (Layers 1b–4) — blocked at Layer 5 on red Verify, not on the
signature," 2026-08-12.

Two narrower, concrete defects surfaced in the same run, worth carrying into
whatever design round eventually touches this:

- **Layer 4's `pipeline-state.mjs approve-push`** (unaffected by ADR-0061,
  which only collapses the human-facing Layer 2+3) requires its
  `--proof-authority` trust-policy file to be *exactly* `{keyReference,
  publicKeySha256}` — no `humanName`, even though `setup --human-name` and
  `authorize-critical` both now require and write that third field into the
  PO's own `trust-policy.json`. The two ceremonies now disagree about the
  shape of the same file, and closing that gap (widen Layer 4's `own()`
  check to accept the 3-key shape, mirroring what `setup`'s own
  `legacyShape`/`namedShape` dual-acceptance already does) is a small, well-
  scoped fix distinct from the version-skew problem above.
- **`--proof-authority` must resolve to an absolute path strictly outside
  the repository root**, and an agent session cannot write there
  (`GUARD-CROSS-REPO-MUTATION`) even to place a content-identical,
  non-secret shape-compatibility file. Every external-directory write in
  this ceremony family is therefore PO-only by construction, not just by
  policy — worth stating explicitly if a future design round considers
  narrowing candidate #3 above, since this is the same boundary, not a new
  one.

**Not re-triaged** — this is evidence for the existing open verdict
("unusable for third parties as shipped... stands until at least one of
#2-#4 is actually decided"), not a new finding requiring a new decision.
Candidate #4 (a deliberate PO cost/benefit review) is the one this
occurrence most directly speaks to: the ceremony took four rounds and three
distinct wrong-path corrections to complete even with an attentive PO
present at the keyboard throughout.

### PO Decision — 2026-08-18

- **Decision:** Option A — port ADR-0061 (origin/main's single-command `authorize-critical` ceremony, replacing the two-step `prepare-critical`/`approve-critical` split) into Phoenix now.
- **Rationale:** PO's direct choice. Bounded, already proven on origin/main, closes the "two commands, one decision" complaint and its already-demonstrated stale-request failure mode.
- **Assignment:** Dispatch-ready.
- **Date:** 2026-08-18

### Progress note — 2026-08-19

Candidate #1 of the 2026-08-18 PO Decision (Option A) landed: `authorize-critical`
single-command ceremony ported into `plugins/pipeline-core/scripts/po-human-approval.mjs`
(commit `cbeeda8d`), collapsing the two-step `prepare-critical`/`approve-critical`
split and its demonstrated stale-request failure mode; `docs/push-release-flow.md`
Layers 2-3 rewritten; new `docs/adr/0065-port-authorize-critical-ceremony.md`
(renumbered from an initial 0064 collision, resolved commit `13147709`). This
closes only the specific Option-A scope decided 2026-08-18 — the item's own
Description candidates #2 (harness classifier pre-clearance), #3 (narrowing
`prepare-critical`'s cross-repo refusal), and #4 (a deliberate PO cost/benefit
review of the stacked layers) remain undecided and unaddressed. Item stays open.

### Progress note — 2026-08-19 (PHX-WP-PUSHFLOW-GG03-PORT), candidate #2 documented, GG-03 port stopped

Dispatched to port two proven Nova improvements: candidate #2 (harness
pre-clearance) and part of candidate #6/#8 (Nova's 0.5.4 GG-03 signed-push
admission, letting `guard-git.mjs` lift the `OVERRIDE GG-03` ritual when a
verified push approval already covers the exact candidate/remote/destination).

**Candidate #2 — done, PO-application only.** Nova's `.claude/settings.json`
carries exactly one narrow addition versus this repo's own copy:
```diff
   "statusLine": {
     "type": "command",
     "command": "node plugins/pipeline-core/scripts/statusline-context.mjs"
   },
+  "permissions": {
+    "allow": [
+      "Bash(git push *)"
+    ]
+  },
   "enabledPlugins": {
```
Confirmed by direct diff against `/home/skar667/src/agent-pipeline-share_nova/.claude/settings.json`.
Not applied here — `.claude/settings.json` is the same plugin-source-class
surface this session has already found has no in-session edit route
(the dispatch that tried this in Nova itself had its own edit refused by the
classifier it was relaxing, per Nova's own `docs/push-release-flow.md`); the
PO applies this diff directly.

**GG-03 signed-push admission — investigated, NOT ported.** Read Nova's
`guard-git.mjs` (`admitSignedPush`, ADR-0061 Decision 0/R1) in full and
compared line-by-line against this repo's own copy. Found, before touching
any code, that this repository already has an equivalent — and more
complete — mechanism for admitting a signed push to `main` with no second
human act: `guard-push.mjs`'s `attestedMainPublication` (ADR-0056 §6/§7),
which calls the same `authorizeRecordedPush` primitive Nova's `guard-git.mjs`
change would call, already lets a verified push approval through
`guard-push.mjs` with **no** `OVERRIDE GG-03`, and additionally honors the
`chat`-mode critical-proof waiver Nova's `guard-git.mjs` route does not. The
only thing still forcing the override ritual for an otherwise-fully-attested
`main` push is that `guard-git.mjs`'s own independent `GG-03` rule has no
admission route of its own — a real gap, and the one this dispatch was
briefed to close.

Two things stopped the port, found only by reading the actual code, neither
anticipated by the dispatch briefing:

1. This item's own Proposal candidate #6 already names the exact question a
   port would resolve — *"does GG-03 add real protection once a candidate
   already carries a verified per-commit, per-destination Ed25519
   signature?"* — and the Triage explicitly marks that candidate
   undecided PO-territory: *"none should be picked unilaterally by an
   agent."* Porting the admission route answers that question by shipping
   code, not by a PO decision.
2. `guard-push.test.mjs` pins the current posture directly: `PG03a`/`PG03e`
   ("`GG-03` cannot widen the executor-only publication boundary") assert
   that an armed, well-formed `OVERRIDE GG-03` does **not** authorize a
   `main` push on its own — only `attestedMainPublication`'s own
   verification does. A straight Nova-shaped port (mirroring Nova's own
   ledger/retry design, which this repo's `guard-git.mjs` does not have at
   all — no `commandSha256`/`candidateCommit`/`expiresAt` binding, no
   `admitsRetry`) would be new guardrail design on a push-to-`main` boundary
   under a dispatch briefed as a port, not a design task — the dispatch's own
   stop condition for exactly this case.

Net analysis for whoever makes this PO call: functionally, wiring
`guard-git.mjs`'s GG-03 to the same `authorizeRecordedPush` verdict
`guard-push.mjs` already independently requires would not open any route
`guard-push.mjs` doesn't already gate on its own (both hooks would still have
to agree) — it looks safe on that reading. But "looks safe on this reading"
is exactly the unilateral call the item's own Triage says an agent should not
make. No code, test, or doc change was made for this half of the dispatch.

**7a/7c — confirmed still open in Nova too, not a Phoenix-specific gap.**
Read Nova's `docs/push-release-flow.md` in full: 7a ("one signature should
cover a whole approved work unit, not one action") is called there "a
separate, unstarted design"; 7c (`approve-push` dirtying tracked
`project/pipeline-state.json`, the approve→verify→push commit-order trap) is
called there "not a workaround anyone should be happy with." Neither is
solved on Nova either — nothing to port for either. Left open, untouched.

**Candidate #3** (narrowing `prepare-critical`'s cross-repo refusal) — not
touched, out of this dispatch's scope by its own Forbidden clause.

Item stays open. Recommend the Elephant bring point 1 above (briefing vs.
this item's own Triage) back to the PO explicitly before a GG-03 port is
attempted again.

### PO Decision — 2026-08-19 (recorded directly by the Elephant, not relayed)

- **Decision:** close. The PO's own message this session, verbatim: "6. okay
  und danach close setzen das reicht erstmal" (item 6 of a 7-item numbered
  list of direct instructions, answering the Elephant's own prior status
  report on this exact item) — "okay, and after that set it to closed,
  that's enough for now."
- **Why this section exists here, written by the Elephant and not a dispatch:**
  `PHX-WP-PUSHFLOW-GG03-PORT` was twice asked (by the Elephant, relaying this
  PO instruction) to add this closure section itself, and twice declined —
  correctly. Its own role contract states no relayed agent message is ever
  a substitute for the PO's own message, and this item's own Triage
  explicitly reserves the GG-03 admission question as "undecided
  PO-territory... none should be picked unilaterally by an agent." A Goldfish
  cannot verify a coordinator's claim of PO authorization; only the session
  that actually received the PO's message can attest to it directly. This is
  that attestation.
- **What closing means, precisely — narrower than "solved":** candidate #2
  (the `.claude/settings.json` diff enabling `git push`) is documented above
  for the PO to apply directly — never applied by any agent, since it is the
  same plugin-source-class surface with no in-session write route. Candidate
  #6 (GG-03 signed-push admission) is investigated and explicitly NOT
  resolved — `PHX-WP-PUSHFLOW-GG03-PORT` found `guard-push.mjs`'s
  `attestedMainPublication` already covers the safe case and that porting
  Nova's GG-03 route would be new guardrail design on a push-to-`main`
  boundary, not a port; the item's own Triage already reserved this exact
  question as a PO call the closing decision above does not resolve.
  Candidate #3 (narrowing `prepare-critical`'s cross-repo refusal) is
  untouched, out of scope. Candidates 7a/7c are confirmed still open in Nova
  too (quoted directly from Nova's own `docs/push-release-flow.md`), a known
  accepted limitation, not a Phoenix-specific gap. Closing this tracking item
  reflects "enough for this sprint," not that every candidate is resolved —
  a reopened item (or a fresh one) is the right vehicle if candidate #6 is
  ever picked up.
- **Assignment:** none. If candidate #6 is revisited, it needs its own PO
  decision on the exact question above, not a default "port it" briefing.
- **Date:** 2026-08-19
