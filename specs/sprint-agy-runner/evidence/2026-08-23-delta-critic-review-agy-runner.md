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
is currently failing open would be the wrong move — but not for the reason that
phrasing suggests. The current state is not unknown, it is known-inert, and
`48591844` is the evidence; a change that is at worst also inert cannot be
worse. The real reason is that an unconfirmed fix to a security control reads
as a fixed control: the commit would claim the registration was corrected, the
layer would appear restored everywhere it is described, and no guard would have
been observed to fire. That is the exact shape of F5 in the first review — a
control that existed in source, was believed to work, and never executed.

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

## PO disposition, 2026-08-24

The PO reviewed D1–D7 above and decided the fix scope: D1, D2, D3, D4 and D6
fixed in code; D7 fixed as an unverified config-value correction pending an
empirical check in a running Antigravity session; D5 accepted as **closed**,
disposed of the same way the first review's F2 was.

**D4 — fixed, via the audited signature ceremony, not PO hand-application.**
The AGY-FIX2-PUSHGUARD dispatch's briefing (Elephant-authored) incorrectly
claimed `guard-push.test.mjs` was agent-writable in this correction round,
citing `ea1432e9` as precedent. That citation was wrong: `ea1432e9`'s own
commit message records it as applied by the PO BY HAND, specifically because
no agent tier may write that protected test path
(`templates/prompts/agent-obligations.md` §2) — the same fact this record's
own F11 disposition already stated. The dispatch caught the contradiction
itself (read the cited commit, checked the guard-testpath override route,
consulted its Advisor), correctly refused to force a write through, and
delivered the fixable half then: D1 (the `resolveDeclaredPushProject`
`-C`-branch cwd fix) landed and was verified independently (156/156
`guard-push.test.mjs` cases).

D4's own dedicated test coverage (`resolveShellCwd()`/`declaredCwd` unit
tests, plus the regression test proving D1 itself) was drafted and verified
against the real, already-fixed guard in `scratch/` first, then applied
through the audited `pipeline-author-repair` signature ceremony
(`guard-human-override.mjs`; request `05d60da5...`, plan `0b9c049c...`) —
never the earlier-considered PO-hand-paste shortcut. That ceremony first hit
two real obstacles, both resolved in-session and recorded here rather than
routed around:

1. An Elephant-authored file write (a new backlog item) between seeding the
   request and running `authorize-by-signature` changed the tracked working
   tree, which changed `statusSha256` and triggered `HGO-DRIFT` — CLAUDE.md's
   own documented failure mode for exactly this sequencing. Recovered by
   moving the new file into the gitignored `scratch/` temporarily, restoring
   the original preimage, and retrying — no second signature needed.
2. The PO's local signing key had been regenerated on 2026-08-17 (a different
   machine) without the repository's committed trust anchor
   (`project/critical-human-proof.json`) being updated to match, so the first
   signed proof failed `HGO-PROOF-INVALID: PO-APPROVAL-TRUST-MISMATCH`. The
   PO confirmed the new key live in session and applied the trust-anchor
   rotation directly in their own terminal (commit `93b7775e`) — the same
   route the two prior rotations in this file's own git history document,
   since a signature cannot bootstrap trust in the very key it would need to
   already trust. The D4 ceremony was then re-seeded against the new HEAD and
   completed cleanly on the next attempt.

159/159 `guard-push.test.mjs` cases pass, including the 156 pre-existing ones
unchanged.

**D5 — closed, not repaired.** Seven of the twenty commits in the reviewed
range carry no machine-parseable `Dispatch:` trailer and stay
`UNVERIFIABLE` to `dispatch-authorship-verify` permanently — history is not
rewritten to add one (GIT-05, no force-push/rewrite). This is the same
defect class as the first review's F2, disposed of the same way: accepted
and carried, not repaired. It is not a discipline failure going forward —
every commit in this session after the delta review, including the
AGY-FIX2-* correction wave dispatched to close D1/D2/D3/D4/D6/D7, carries a
correctly parsed `Dispatch:` trailer, checked directly against
`git log --format="%h %(trailers:key=Dispatch,valueonly) %s"` rather than
assumed.

D2's own severity is narrower than this record's findings section states in
isolation: `antigravity-pretool-guard.mjs` is wired only through Antigravity's
own hook registration (`.agents/plugins.json`), never through
`.claude/settings.json` — confirmed by grep, no match. Every Critic dispatch
this session, including the one that produced this record, ran through
Claude Code's own Agent/Task mechanism, which `antigravity-pretool-guard.mjs`
never intercepts. D2 therefore did not block any dispatch actually issued in
this session; its urgency is real but forward-looking, and specifically
coupled to D7 — fixing D7 without D2 would have turned a currently silent gap
into an active block on the CLAUDE.md-mandated Critic-dispatch path in a real
Antigravity session. Both are fixed together in the same correction round for
exactly this reason.
