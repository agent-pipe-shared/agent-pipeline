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

**IN PROGRESS 2026-09-06** — hook installed, Claude Code restarted, one
read-only subagent ran in the new session; awaiting the PO's `remove` and
`show` of the capture log.

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

**Needs:** one word from the PO — "accept".

`docs/adr/draft-parallel-dispatch-slicing-enforcement.md` has had two T1
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

---

## Not on this list, deliberately

The verify-runtime optimisation. The four-module thesis was **refuted** by
audit: `pipeline-state.mjs` and `human-guard-override.mjs` are process-global,
so the two heavy suites the win was expected from cannot be evicted. Twelve
lane members remain eligible on that criterion alone, gated by two further
modules. That is ordinary work, not a PO decision, and it is not promised for
this candidate.
