# Delta Critic review — sprint-agy-runner correction range (2026-08-23)

Bounded delta re-review of the correction wave that answered the first full
review (`specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`).

- **Base:** `51dd7fc6`
- **Head:** `ea1432e96904f13f52cf591678b239d2f6a6d563`, tree `ba4df6fc5ad6661f021e9129dfac2cc07c58525b`
- **Object:** 20 enumerated commit SHAs; the Critic independently confirmed the
  range resolves to exactly those SHAs in that order.
- **Route:** requested `claude-opus-5 at max`; effective identity
  `claude-opus-5[1m]` from direct same-dispatch evidence. Effort level is not
  observable from inside a dispatch and is recorded as unobserved, not confirmed.
- **Lane:** functional-equivalent-read-only; OS isolation not asserted.
- **Budget:** base cap 24 tool uses reached; closed out through the +5 allowance.
- **Critic notes:** `scratch/critic-agy-d5d73f224b68/critic-notes.md` (gitignored).

## Verdict: **FAIL**

Five majors, two minors, no proven blocker. Findings are numbered D1–D7 here to
keep them distinct from the first review's F1–F19.

## Findings

**D1 — major — The cwd fix reached only one of the two resolution paths.**
`a8f861cc` added `resolveShellCwd()` so push checks follow the host-declared
execution directory. `parsePushBinding` was fully converted; in
`resolveDeclaredPushProject` the bare candidate uses the new resolver while a
relative `git -C` argument is still resolved against `process.cwd()`. For one
command the two functions can therefore resolve to two different repositories —
the exact divergence class the commit set out to close.
*Evidence:* `plugins/pipeline-core/hooks/guard-push.mjs:449`, `:452` against the
converted sibling at `:389`–`:390`.
*Spec-ref:* `prd_agy-runner.md` §2 invariant 1; QG-04.
*Scope honesty:* the inconsistency is proven from source; no end-to-end approval
bypass was demonstrated and none is claimed.

**D2 — major — The Critic contamination check denies the canonical Critic dispatch.**
The prose detector treats the bare word `review` as prose, so a paths-only
dispatch naming `templates/prompts/critic-review.md` — which CLAUDE.md *mandates*
— or any `*-critic-review-*.md` evidence path is refused. The guard pressures
agents toward stripping the canonical reference, i.e. toward a degraded briefing.
*Evidence:* `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs:358`.
The neighbour-case test sidesteps the collision: its fixture contains none of the
five trigger words and it asserts only `doesNotMatch(/Contamination Rule/)`
rather than `decision === "allow"` as its three sibling cases do.
*Spec-ref:* CLAUDE.md "Dispatch from the template, never freehand"; `spec.md` §8.3.

**D3 — major — The subagent controls inspect only `Subagents[0]`.**
`normalizeAntigravityToolInput` derives `subagent_type` and `prompt` from the
first array element, so an `invoke_subagent` call carrying the Critic at index 1
or later is classified by whatever sits at index 0 and never reaches the check.
No test covers a multi-subagent envelope.
*Evidence:* `antigravity-pretool-guard.mjs:210`, consumer at `:353`.
*Spec-ref:* `prd_agy-runner.md` §2 invariant 1; `spec.md` §8.3.

**D4 — major — The new push-guard input path ships untested.**
`declaredCwd` (`guard-push.mjs:237`–`:260`) adds an agent-authored input that
redirects which repository's evidence and approval state the push guard reads.
Nothing exercises `resolveShellCwd()`. The usual mitigation — that
`guard-push.test.mjs` is protected path TP-5 and thus a stop condition — does not
apply here, because this same delta successfully added tests to that exact file
(`ea1432e9`). A route that was demonstrably open was not used for the change that
needed it. D1 is the concrete evidence that the change was not self-consistent.
*Spec-ref:* QG-04; `templates/prompts/agent-obligations.md` §2.

**D5 — major — Seven of twenty commits carry neither `Dispatch:` trailer form.**
`3bf8b89f`, `ff6ad2bd`, `f9ccadda`, `351e3525`, `0be61ccd`, `94c46241`,
`ea1432e9`. Two are not documentation: `94c46241` changes `.gitignore`
(gate-enabling config) and `ea1432e9` changes a protected security-test suite.
Both narrate orchestrator authorship in prose — which is precisely the
`Dispatch: stage-0 (elephant)` fast path the second trailer form exists to make
machine-visible. Prose in a body is not a trailer, and those seven are
`UNVERIFIABLE` to `dispatch-authorship-verify`. Sharpened by `0be61ccd`, which
records the prior round's F2 (34 of 35 commits without a trailer): the
remediation delta reproduces the same defect on 35% of its own commits, where
nothing prevented compliance.
*Spec-ref:* `agent-obligations.md` §6; OM §3.3; EL-01/EL-16.

**D6 — minor — Inline-execution containment omits the common inline forms.**
The regex covers `node|python3?|ruby|perl|php` with `-e`/`-c`, but not `sh -c`,
`bash -c`, `node --eval`, `node -p`, `node -pe` or `env node -e`, while its own
deny text calls it "OS-level / interpreter inline code execution containment".
*Evidence:* `antigravity-pretool-guard.mjs:365`–`:367`.
*Spec-ref:* `prd_agy-runner.md` §2 invariant 1.

**D7 — minor as filed, escalated to blocker by post-review verification —
`.agents/plugins.json` and its installer disagree on what `entries[].path` means.**
See the dedicated section below: the Critic rated this minor only because it
could not settle the resolution semantics inside its budget and said so
explicitly. They were settled afterwards, and the answer is the bad one.

## D7 escalation — the Antigravity enforcement layer is very likely not loading

Verified by the Elephant after the review returned, against the object database
and the working tree. This is the most consequential result of the round.

**`entries[].path` denotes a plugin root.** `install-agy.mjs:28`–`:33` resolves
`corePluginPath` by locating the directory that contains `plugin.json`, and
`:72` writes exactly that value into the entry. In this repository
`plugins/pipeline-core/plugin.json` exists and `plugins/plugin.json` does not.

**The tracked value is one level too high.** `bd112cc0` created the file with
`"path": "plugins"` while its own commit message says it registers
`plugins/pipeline-core`. `5925e7f2` then replaced a machine-absolute
`/home/…/plugins/pipeline-core` — which pointed at the real plugin root — with
that same `"plugins"`, describing it as restoring the repo-relative entry. The
repo-relative equivalent of the absolute value is `plugins/pipeline-core`; the
final path component was lost. The absolute path was the only value in this
file's history that ever pointed at a plugin root.

**There is direct historical evidence that the entry did not load.**
`48591844` — *"fix: bypass plugins.json and write directly to hooks.json for
reliable loading"* — deleted `.agents/plugins.json` outright and wrote
`.agents/hooks.json` instead. `ffa55f78` later migrated back.

**No repository code resolves the path.** `rg` finds `plugins.json` only in the
two `install-agy.mjs` copies, which write it and never read it at runtime.
Resolution happens inside the Antigravity runner, and nothing in this repository
establishes that it accepts a relative path at all, or what it would resolve one
against.

**Consequence.** With the tracked value, the PreToolUse enforcement layer very
likely does not load — a fail-open of the entire Antigravity guard layer rather
than a defect inside it. This is a live candidate root cause for two things the
record previously left open: the push escape the PO observed and confirmed, and
F10 of the first review, whose mechanism ("how were protected test paths
written?") was explicitly recorded as unexplained. A guard that never loads
explains both without needing either lane to be mis-wired — and both lanes were
confirmed wired, which is why the earlier hypothesis was correctly rejected.

**Correcting an Elephant statement made earlier the same evening.** During the
correction wave this session stated that `.agents/plugins.json` points at the
repository-relative `plugins` directory and that the Antigravity lane therefore
loads the repo copy including the fixes. That inference was wrong: pointing at
`plugins` is not pointing at a plugin root. It was also used to dismiss a
concern about the stale marketplace copy, so that dismissal does not stand
either.

**Why no fix was applied.** The obvious edit (`plugins` → `plugins/pipeline-core`)
is not verifiable from here: no Antigravity runner is available in this session,
and relative-path support is unestablished. The alternatives trade off against
each other and the choice is the PO's — a machine-absolute path works but
violates CLAUDE.md and breaks on the second machine; a relative path is
policy-clean but unproven; writing `.agents/hooks.json` directly is the route
history already fell back to. Applying an unverifiable change to a control that
is currently failing open would replace a known-bad state with an unknown one.

## Disposition of the first review's findings

The delta review did not re-clear F1–F19 individually; it reviewed the
correction range on its own merits, which is what a bounded delta review is.
Where its findings bear on earlier ones, that is recorded above: D4 concerns the
same file as F11 and D5 is the same defect class as F2.

## Trajectory check

**consistent.** `evidence/verify-latest.json` binds commit `ea1432e9` and tree
`ba4df6fc` identically at `candidate.start` and `candidate.finish` with
`binding: "exact"`; `registeredSuiteCount` 385 equals `terminalReceiptCount` 385;
the command is the project's own gate; timestamps and per-suite durations are
machine-shaped. Exactly one suite fails, matching the disclosed environment
condition with no unexplained second failure. Nine `AGY-FIX-*` dispatch records
plus `AGY-VERIFYFIX-1` are present, and the thirteen trailer-bearing commits name
task IDs drawn from that set.

The one inconsistency is D5: seven commits assert nothing machine-readable about
their own authorship, so their trajectory is not verifiable even though the
surrounding evidence is sound.

## Briefing violations

**None.** References only — spec paths, enumerated SHAs, guardrail paths,
evidence paths, ruleset SHA, route and matrix row. The prior findings registry
arrived as bare IDs `F1..F19` without titles, status or justification, per the
fix-verification input contract. The Verify failure was disclosed as a bounded
environment condition rather than pre-judged.

## Scope not cleared

The Critic reached its base cap and closed out honestly rather than clearing
material it had not read. Worked through via grep only or not opened:
`backlog/index.json`, `backlog/STATUS.md`, `backlog/transitions.ndjson`,
`specs/sprint-agy-runner/evidence/2026-08-23-critic-review-agy-runner.md`,
`plugins/pipeline-core/guardrails/quality-gates.md`, and the three backlog item
bodies beyond their owner/expiry fields. These are explicitly **not** cleared.

## Deliberately not flagged (examined and cleared)

Spec fidelity for §3/§8.2/§9 row 3 (all three corrections confirmed against the
delivered code); scope (every changed path enumerated or a direct consequence of
a named fix); test integrity in the positive direction (`afecc8d2` makes the
shared `decision()` oracle assert instead of synthesizing `allow` on empty or
unparseable stdout — a crashed guard previously passed its own suite);
QG-06 (both new risk items carry `owner: pipeline` / `due: 2026-08-30` in
front-matter plus prose Owner and Expiry); dependency reality (zero new
packages, actions, images or plugins anywhere in the delta); ADR-0011 language
assignment.
