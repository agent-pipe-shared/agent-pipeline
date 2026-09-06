# PO decision queue — collected 2026-09-06

Everything that is blocked on the PO rather than on work. Collected because
the PO is mobile and cannot sign today. Ordered by what unblocks the most.

Nothing here is urgent in the sense of decaying. Each item states what it
costs, what it unblocks, and what happens if it is never done — so the PO can
skip any of them deliberately rather than by omission.

---

## 1. TP-3 signature: register `guard-slicing.test.mjs` in the verify gate

**DONE 2026-09-06** — signed at the desk, landed as `eecb4273`; the
inventory obligation the registration created is met in `ec0b158c`.

**Needs:** an Ed25519 signature at a desktop, ~2 minutes.

**Effect:** the gate goes from 514/515 to fully green. The 33 `guard-slicing`
tests begin running in CI; today they run in no gate at all.

The edit is two lines in `harness/scripts/verify.mjs`, after the
`guard-dispatch-tests` entry:

```js
{ name: "guard-slicing-tests", file: join(hooksDir, "guard-slicing.test.mjs") },
```

**Note on the ceremony:** the one seeded on 2026-09-06 binds to HEAD
`0768bbff` and lapses at 12:27:41Z. It is expected to expire unused. Re-seeding
is two minutes of work and produces a fresh digest — do NOT try to reuse the
old one.

**If never done:** the gate stays red for one suite, and the slicing tests
stay invisible to CI. Everything else keeps working.

## 2. `hooks.json` wiring for `guard-slicing.mjs`

**Needs:** an attended operator-tool run outside any agent session.
`hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`; no in-session route exists,
by design.

**Effect:** the slicing nudge starts firing at all. Until then the module is
built, tested and inert.

**Do item 3 first.** Wiring this before knowing why the sibling guard never
fires risks a second registered, tested, silently inert guard.

**If never done:** the increment-1 experiment never runs, and increment 2 has
no data to be decided on.

## 3. Payload capture: why does `guard-dispatch-budget.mjs` never fire?

**DONE 2026-09-06 — answered, and the answer is actionable.** The capture ran
against two live dispatches. Every payload, from a dispatched subagent as much
as from the orchestrator, carries the PARENT session's `transcript_path` and
`session_id`; no payload ever carries a `subagents/agent-<id>.jsonl` path. The
guard's discriminator therefore never matches, which is exactly why its
counter never moved. The real discriminator is the key set: a subagent payload
carries `agent_id` and `agent_type`, an orchestrator payload does not, and
`agent_type` additionally names the agent definition, so a budget could be
tiered per tier. The capture hook itself was dead for hours for an unrelated
reason worth remembering: its inline `node -e` program carried the log path in
double quotes inside a double-quoted program, the shell stripped the inner
pair, node died on a SyntaxError, and a `PreToolUse` hook exiting
non-zero-but-not-2 reports only to the user — invisible from inside the
session. The sink is a file now. Full record:
`scratch/payloadcapture-finding.md`, to be filed as evidence.

**No longer blocked on the PO.** The guard fix (swap the discriminator to the
presence of `agent_id`, with tests pinning both payload shapes) is ordinary
work and is filed as its own backlog item.

**Needs:** a temporary hook in the user-level `~/.claude/settings.json` plus a
Claude Code restart — the same cheap route the channel probe used, no
repository ceremony.

**Effect:** answers the most consequential open question of the day. The guard
is registered, its logic is proven correct by direct probe, and after four
dispatches its state directory holds no counter and no diagnostic log. The
probe resolved `maxTurns: 80` and a working cap of 65 — **this guard, working,
would have prevented all four of the day's harness truncations**, two of which
lost their entire dispatch report.

Leading hypothesis to confirm or refute: a real subagent's `PreToolUse`
payload may carry the PARENT session's `transcript_path`, which would classify
every subagent call as the orchestrator and silently count nothing.

**If never done:** every tool budget in every briefing stays advisory with no
mechanism behind it, and dispatches keep being cut mid-run.

## 4. Attribution conflict: session instruction vs. GIT-03

**Needs:** a decision, no tooling.

A session-level instruction in this environment asks for `Co-Authored-By` and
a session URL on every commit. `guardrails/git.md` GIT-03 forbids provider or
model co-author trailers, session URLs and correlation identifiers, and says
"there is no override" — the guard enforces it, and refused such a commit
today. A dispatch independently reached the same conclusion and flagged it.

The repository rule is currently winning, which is correct behaviour for an
agent. Whether that is what the PO *wants* is not an agent's call. If the
attribution instruction is meant to apply here, it needs a deliberate decision
(an ADR amendment), not a silent per-commit choice.

**If never done:** commits keep carrying `AI-Assisted: true` only. No harm;
the conflict simply stays unresolved and will be rediscovered.

## 5. Stale installed plugin copy

**DONE 2026-09-06** — the PO ran the marketplace copy, `claude plugin update`
and `/reload-plugins`; the preflight reads back
`0.6.1+claude.20260906172530.87af6b6` as the loaded version, so this
checkout's own sessions now enforce the current guards. No restart was needed:
`hooks.json` changed only inside its `$comment` between the installed build
and this one.

**Needs:** a marketplace/plugin update plus `/reload-plugins`.

`docs/state.md` records that the installed copies of at least two guards are
stale, and an open backlog item tracks it
(`pipeline.installed-plugin-copy-stale-vs-repo-source`). Today's diagnosis
showed the dispatch-budget registration is NOT stale, so this is narrower than
feared — but it is unmeasured for the rest.

**If never done:** fixes that land in the repository may not be enforced for
this checkout's own sessions, and the gap is invisible.

## 6. GitLab evidence for B2/B4

**Needs:** the PO's project name or URL, and whether the API key still lives.

The PO stated a real GitLab repository was built and tested against, and that
it worked. No durable trace of that run exists anywhere in this repository's
branches or history. Either the evidence lives outside the repo, or the items
are documented as more proven than they are.

**If never done:** B2/B4 keep claiming a live-tested state that this
repository cannot evidence.

## 7. B1 / Codex: one live provider probe

**Needs:** explicit approval; the run itself is an agent action.

`local-worker-supervisor.mjs` has never executed a real provider. Its only
production caller runs it in `fixture` mode, and the `codex-exec` path
requires `allowProviderExecution: true`, never passed. The PO decided to
retain the supervisor for Codex/AGY runner neutrality; that decision is
recorded but unexercised.

**If never done:** the supervisor stays retained on paper and unproven in
practice.

## 8. One real end-to-end Codex Critic review run

**Needs:** explicit approval for a live provider execution, plus a working
Codex the run can reach.

Handed over from the Alfred checkout: the selected-Codex-Critic transport has
a producer and no consumer, so the `selected-runner-transport` gate has no
implementation. Criteria 1–4 of that handover (the host-side consumer, real
launch under the selected profile, correctly bound receipts, safe refusal) are
buildable here without the PO and are being built.

Criterion 5 is not. "At least one real successful end-to-end review run" means
executing a live provider, the same class as item 7. An agent must not
authorize that for itself, and satisfying it with a fixture while reporting it
as real would reproduce precisely the defect the handover is complaining
about — "existing tests with substituted functions do not prove this
connection" — one level higher up.

**If never done:** the transport ships tested but never once exercised against
a real Codex, which is a weaker claim than the handover asks for and must be
reported as such rather than rounded up.

Analysis: `backlog/evidence/2026-09-06-codex-selected-critic-transport-gap.md`.

## 9. Accept the slicing design as ADR-0080

**DONE 2026-09-06** — accepted by the PO in session ("accept", all five decisions); renamed and indexed in this commit.

**Needs:** one word from the PO — "accept".

`docs/adr/0080-parallel-dispatch-slicing-enforcement.md` has had two T1
Critic rounds (FAIL then PASS-bounded-by-step-1), its blocking precondition is
cleared by the channel probe, its open parameter is resolved by measurement,
and the mechanism it describes is built and tested. ADR-0069 D2 allocates a
number *"in the act of being accepted into the trunk — the same moment its
`Status:` becomes `accepted`"*. That is a PO act, not an agent's. On
acceptance the file is renamed to `0080-…`, its status set, and every
slug reference rewritten in the same commit — the agent does that; the PO
says the word.

**If never done:** the design stays a draft referenced by slug. Nothing
breaks; ADR-0069's counter simply never learns of it.

## 10. Where the reader's review is anchored so it cannot be skipped

**Needs:** a decision on placement, not on whether it happens — the PO already
required the review itself.

A reader's Critic (Lektor) reads the user-facing documents as a user and
judges comprehensibility, order, granularity and weighting, with a hunt for
the recency inversion agent-written documentation reliably produces. The first
round ran on 2026-09-06 and produced findings no structural check produces
(`backlog/evidence/2026-09-06-doc-reader-review-round1.md`): the word "audit"
appears in two of six front-door documents while the decided audience is
teams carrying audit obligations.

The placement problem is the PO's own: a review at the release preflight
produces findings, which produce documentation changes, which produce a new
candidate the preflight would have to review again. The proposal on the table
is to split the expensive judgment from the cheap binding — run the review
inside the documentation block, record it against the documentation state it
read, and let the preflight check only that binding, exactly the way
`check-doc-reconciliation.mjs` binds an obligation to a commit range. Full
reasoning in `backlog/items/2026-09-06-documentation-has-no-reader-facing-review-and-no-machine-binding-for-one.md`.

**If never done:** the review stays a practice one Elephant remembers, which
is the failure mode the reconciliation check's own header warns about.

## 11. TP-3 signature: run the done-predicate checker as a gate check

**Needs:** one PO signature on `harness/scripts/verify.mjs`, whenever the PO
is at the desk — the same ceremony as item 1.

`check-backlog-done-predicate.mjs` finds items whose declared completion
predicate contradicts their status. It is registered in the gate **only as a
test suite**, so the checker itself never runs against the live tree. Its
sibling `check-backlog-sprint-assignment.mjs` IS registered as an executable
check, so the asymmetry is visible in one file. Running it today reports three
items in `status: open` whose predicate is already satisfied — work that is
finished and still counted as open.

**If never done:** the backlog's own contradiction detector stays advisory and
the open counts drift quietly.

## 12. Does the reconciliation precedent get its coverage back?

**Needs:** a priority call, not a signature.

`check-doc-reconciliation.mjs` enforces only against ADRs carrying a
`**Governs:**` line: 12 of 80 today. The rest are counted and never enforced,
deliberately, so the check was usable on day one. Adding the missing lines is
mechanical and cheap; the question is only whether it is worth doing before
the reader-review record is built on the same mechanism.

**If never done:** the push-time documentation gate keeps covering roughly a
sixth of the decisions it was built to cover, and any new mechanism modelled
on it inherits the same quiet gap.

## 13. The change-request procedure is Nightwing, not Alfred — decide whether that stands

**Needs:** a scheduling call, and only that. No signature, no ceremony.

The PO asked on 2026-09-06 whether the change-request procedure should be
pulled forward, and wondered whether it might already be coming with Alfred.
Measured: it is issue #97, "Support PO-approved design amendments during
implementation without full rebaseline", labelled `sprint:nightwing`, P1/L,
with an activation gate on issue #67 (the integrated Nova/Cyborg/Phoenix
baseline). Alfred does not carry it.

It is not a process rule that can be adopted quickly. It defines a
rebase-stable Authority Revision over a closed authority boundary and
deliberately dissolves the mutable digest chain that currently binds the PRD
to the Spec — a foundation change, not a procedure laid alongside the
existing one.

What is separable, and worth knowing: issue #97's scope item 7 already states
the principle a blocked session needs, in almost these words — unapproved
authority drift must return a typed result with sanctioned recovery actions
rather than a generic lifecycle deadlock, and the guard must admit exactly
those actions. That principle is therefore settled and no longer needs
deciding. What is open is only whether it gets applied to other triggers at
their own size, which the continuity-deadlock item now proposes.

**If never decided:** the procedure waits for #67, which is the current plan,
and each deadlock class gets handled on its own as it appears.

## 14. Should the bootstrap-receipt gate (GL-09) actually start gating subagents?

**Needs:** a yes or no. No signature, no ceremony, but it is not an
implementor's call.

GL-09 in `guard-lifecycle-ready.mjs` is built to require a bootstrap preflight
receipt before a dispatched agent's first `Edit`/`Write`/`NotebookEdit`. It has
never gated anything, because it identifies a subagent by a transcript-path
shape no payload carries — the same measured defect as the budget guard's.

Correcting the discriminator does not merely fix bookkeeping there: **it turns
the gate on.** Every dispatched agent in every session would then be denied its
first write until a preflight receipt exists. That is very probably what GL-09
was built for, and it is a real change in what the guard admits, so a dispatch
briefed only to re-scope state correctly refused to make it silently
(`NVA-B-GLIDENT-1`, stopped clean, nothing touched).

Two smaller questions ride along and only matter if the answer is yes: a
payload with a relative transcript path is denied today through an
invalid-identity sentinel and would flip to admitted; and about a dozen test
cases exercise identity states the corrected two-state check has no analogue
for.

The third call site in the same file (`denialClassesScopeKey()`) is
admission-neutral and needs no decision — it proceeds as ordinary work whatever
you answer here.

**If never decided:** GL-09 stays dead, and a dispatched agent can write before
its bootstrap is proven. Nothing breaks that is not already broken; the gate
simply never becomes real. Full analysis in
`backlog/items/2026-09-01-subagent-identity-may-never-resolve-so-per-agent-scoping-is-inert.md`.

---

## Not on this list, deliberately

The verify-runtime optimisation. The four-module thesis was **refuted** by
audit: `pipeline-state.mjs` and `human-guard-override.mjs` are process-global,
so the two heavy suites the win was expected from cannot be evicted. Twelve
lane members remain eligible on that criterion alone, gated by two further
modules. That is ordinary work, not a PO decision, and it is not promised for
this candidate.
