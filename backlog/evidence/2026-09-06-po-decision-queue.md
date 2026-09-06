# PO decision queue — collected 2026-09-06

Everything that is blocked on the PO rather than on work. Collected because
the PO is mobile and cannot sign today. Ordered by what unblocks the most.

Nothing here is urgent in the sense of decaying. Each item states what it
costs, what it unblocks, and what happens if it is never done — so the PO can
skip any of them deliberately rather than by omission.

---

## 1. TP-3 signature: register `guard-slicing.test.mjs` in the verify gate

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

---

## Not on this list, deliberately

The verify-runtime optimisation. The four-module thesis was **refuted** by
audit: `pipeline-state.mjs` and `human-guard-override.mjs` are process-global,
so the two heavy suites the win was expected from cannot be evicted. Twelve
lane members remain eligible on that criterion alone, gated by two further
modules. That is ordinary work, not a PO decision, and it is not promised for
this candidate.
