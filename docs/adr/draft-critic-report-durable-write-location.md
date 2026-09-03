# ADR-{{NNNN}}: Where a Critic's report can durably live

> Agent-Pipeline · Sprint Nova-B · as of 2026-09-03

**Status:** proposed — decision package only; no option selected. Numbered only at
acceptance per [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision
2 (drafts are unnumbered `docs/adr/draft-<slug>.md`, referenced by slug, added to
the index only when accepted). Until then this file is `docs/adr/draft-critic-report-durable-write-location.md`.

**Basis:** `backlog/items/2026-09-01-a-critic-has-no-writable-location-for-its-own-report.md`
(status: open) — reported independently by two Critic dispatches (NVA-CR-D,
NVA-CR-E) on 2026-09-01, each falling back to CR-06-D and disclosing that report
persistence was unavailable.

## Context

Two independent Critic rounds hit the identical wall on the same day and disclosed
it in the same terms: no location was available to them that was simultaneously
(a) durable across the dispatch's own end, (b) reachable given their tool grant,
and (c) consistent with the read-only contract they operate under. Both fell back
to CR-06-D (`roles/critic.md` §5.5) and returned the report directly in their reply
text; one had already created an empty directory inside the repository before
discovering it could not write into it.

**This is a composition failure, not a bug in any one part.** Four constraints
converge on the Critic, and each is independently correct:

1. **The Critic is read-only** (`roles/critic.md` CR-08: "no Write/Edit, no
   `memory`, no fixes... no commits, no pushes, no state changes"). This is the
   entire point of the role — an independent verifier that cannot alter what it
   reviews, and cannot quietly repair what it finds.
2. **The containment guard refuses a write outside the project root**
   (`GUARD-CROSS-REPO-MUTATION`, `guard-lifecycle-ready.mjs`): "a governed
   consumer session may write only inside its own physical project root." Correct
   — a session must not scribble into another repository, the plugin cache, or an
   arbitrary host path.
3. **The closed shell grammar refuses the obvious content-writing shapes.**
   Redirects (`>`, `2>&1`, `| tee`) are `GUARD-REDIRECT-UNAPPROVED`; `echo` only
   reaches stdout. Correct — an unbounded shell is the standing attack surface
   this grammar exists to close.
4. **The role holds no Write/Edit tool.** `plugins/pipeline-core/agents/critic.md`
   grants exactly `Read, Grep, Glob, Bash`; the frontmatter comment states the
   omission is deliberate ("no `memory` field — deliberate: memory auto-activates
   Read/Write/Edit and would break every read-only guarantee").

Each of the four is defensible on its own. **What fails is their intersection:**
there is no location simultaneously inside the project root, reachable by a
role with no write tool, and durable once the dispatch ends.

### A correction to the item's own diagnosis, established from the guard source rather than assumed

The item states two things that this dispatch's own reading of
`guard-lifecycle-ready.mjs`, plus a live empirical test, does not support as
written:

> "The session scratchpad lies outside the repository. Writing there is refused
> by `guard-lifecycle-ready.mjs` with `GUARD-CROSS-REPO-MUTATION`."
> "No admitted shell shape writes file content: redirects are
> `GUARD-REDIRECT-UNAPPROVED`, and `echo` reaches stdout only."

`isProjectWritePath`/`GUARD-CROSS-REPO-MUTATION` fires only for `Edit`/`Write`/
`NotebookEdit` tool calls (`WRITE_TOOLS`), or for a Bash command matching
`isForbiddenCrossRepositoryMutation` — a list of **named** patterns (specific
`codex plugin` operations, the cachebuster script, and shell-redirect targets)
plus a redirect-target check. It is enumerated-deny, not an allow-list. A Bash
command that writes file content through an interpreter payload rather than a
shell redirect — `node -e "require('fs').writeFileSync(...)"` — parses as one
ordinary simple command under the closed grammar (no operator, no redirect) and
is not covered by any of those named patterns.

This dispatch verified this empirically rather than inferring it: a `node -e`
Bash call targeting the exact class of external, outside-root location the item
names (the session scratchpad) wrote a file there with no guard denial. The
guard's own source comments confirm the class of gap is known: the
`GS-1..GS-6` gate-strength write check documents "`node -e` is an ordinary
simple command under the closed grammar" as the reason a Bash-mediated write to
a gate-strength config file had to be closed separately, by exact substring
matching on that specific enumerated set of paths — a fix that closes the gap
for *that* named class only. A second, narrower mechanism
(`protectedTestPathShellRefusalHit`, the `opaque-interpreter-code` lane) resolves
an interpreter payload's write target for **protected test paths** only, and
fails closed (refuses) exactly when it cannot resolve that target — again, one
named class, not a general rule.

**Nothing enumerates a Critic report destination, in either direction.** No rule
refuses it; no rule admits it as sanctioned. This changes what constraints 2 and
3 actually are: they hold for the specific classes the guard's authors already
named (protected test paths, gate-strength config, redirect targets, specific
cross-repo command patterns) and for the `Edit`/`Write`/`NotebookEdit` tool
surface — they do not hold as a blanket "no Bash command can write content"
claim, which is false as demonstrated.

**Constraint 1 is normative, not mechanical.** The guard has no concept of
"role" at all — nothing in `guard-lifecycle-ready.mjs` inspects which agent role
issued a command. The Critic's read-only property today is enforced entirely by
the role contract's own discipline (CR-08) and by the absence of a Write/Edit
*tool grant* — not by any guard rule that would refuse a content-writing Bash
command from a Critic dispatch specifically, because the guard cannot tell a
Critic dispatch from any other session. **Constraint 4 stands as written** (the
`tools:` field genuinely grants no `Write`/`Edit`), and **constraint 2 stands**
for the classes it actually covers.

The practical consequence: the Critic, today, already has a latent, unscoped,
undocumented ability to write file content anywhere reachable by a `node -e`
(or `python3 -c`) Bash payload — in the repository or outside it — subject to
nothing except its own contractual promise not to. `roles/critic.md` CR-06-D
already relies on exactly this route: it instructs a Critic to persist
`critic-notes.md` into `scratch/dispatch/<codename>/` "using your existing Bash
grant," which is only mechanically possible via this same interpreter-payload
shape, since a shell redirect is refused. The gap this ADR is about, precisely
stated, is therefore not "the Critic cannot write anything" — it is: **the one
write route that exists is an accident of grammar-parser scope, not a declared
capability, so (a) a future hardening pass could silently break the
`scratch/`-based CR-06-D mechanism the contract already depends on, exactly as
happened for gate-strength paths, with no test protecting it; and (b) the
`scratch/` location CR-06-D already uses is gitignored and never committed, so
even a successful write there is not durable across anything that prunes
untracked files, and is invisible to the next session unless someone goes
looking.**

## Options

Each option is evaluated against: what it costs to build, and what it does to
the Critic's read-only property specifically — **survives intact**, **narrowed
by exception**, or **abandoned**. Given the normative-only status of constraint 1
established above, no option can claim it "preserves a mechanically enforced
read-only boundary," because none exists today to preserve; the honest axis is
**scoped-and-audited vs. unscoped-and-undocumented**, applied to a capability the
role already holds in practice.

### Option A — Grant the Critic a real write tool, scoped to one directory

Add `Write` (or `Edit`) to `plugins/pipeline-core/agents/critic.md`'s `tools:`
list, and extend `guard-lifecycle-ready.mjs`'s write-admission logic with new,
role-aware, path-scoped permission (e.g. only `docs/critic-reports/**`) for a
session identified as a Critic dispatch.

- **Read-only property:** narrowed by exception, and the *widest* narrowing of
  the four options. A `Write`/`Edit` tool grant is not natively path-scoped by
  `tools:` — the guard has no concept of "this session is a Critic dispatch,
  restrict its writes to one directory," so this requires building that concept
  from nothing: a new signal the guard can trust (dispatch metadata is
  agent-supplied, not a trustworthy identity boundary on its own), plus new
  admission logic, plus new tests. Until that machinery exists, granting the
  tool at all is a strictly wider exception than the DoD or CR-08 currently
  admits.
- **Cost:** highest. New guard capability (role-aware path scoping does not
  exist anywhere in the codebase today — this would be new, not a reuse of an
  existing pattern), a `roles/critic.md` CR-08 amendment, new tests, and a wider
  attack surface for the threat SEC-10 actually names (a prompt-injected Critic
  dispatch, reading a hostile diff, manipulated into writing where the tool
  grant technically allows).
- **Does not, by itself, solve durability:** a write inside the repo is still
  untracked unless something commits it, and CR-08's "no commits, no state
  changes" would have to be revisited separately, or Option B layered on top.

### Option B — Orchestrator transcription becomes an enforced dispatch-completion step

The dispatching Elephant's own duty gains a mechanical check: a Critic dispatch
is not complete until its findings exist at a named, tracked-or-citable path
(e.g. `backlog/evidence/`), verified the same way a Goldfish's dispatch record
is verified today (`dispatch-authorship-verify.mjs`-style binding). No change
to the Critic at all.

- **Read-only property:** **survives fully intact.** Zero new write surface,
  zero tool grant, zero guard change on the Critic's side — this option changes
  nobody's capability except the Elephant's own obligation.
- **Cost:** cheapest to build (a checklist/verification addition on the
  orchestrator side, comparable in shape to the existing
  `Dispatch: <TASK_ID> (goldfish)` binding check). But it inherits the
  weakness the backlog item already names: it moves the durability guarantee
  onto the party with the least direct incentive to honor it under time
  pressure, and it does not close the crash/compaction window — if the
  orchestrating session ends between the Critic's reply and the transcription
  step, the findings are still lost, exactly as happened (informally) on
  2026-09-01. It formalizes what was already done ad hoc; it does not make the
  window disappear.

### Option C — Status quo: CR-06-D stays the recorded answer

No change. `scratch/dispatch/<codename>/critic-notes.md` remains the documented
persistence location (in-repo, gitignored), written via the already-latent
`node -e`-through-Bash route; when no writable scratch exists, the Critic
states so and emits the report as the first thing after Phase 2, as CR-06-D
already prescribes.

- **Read-only property:** survives intact *as written* (`CR-08`'s text does not
  change), but this is the option that leaves the actual gap **least honestly
  described**: the contract and the `critic.md` frontmatter both assert "holds
  no write tool," which is true of the `tools:` grant and false of the
  session's actual mechanical capability, established in Context above. A
  future reader — or a threat-model review under SEC-10 — reasoning from "the
  Critic cannot write" would be reasoning from a claim this dispatch just
  falsified.
- **Cost:** zero engineering cost, at the price already paid twice on
  2026-09-01: findings surviving only because an Elephant hand-transcribed them
  under time pressure, with no mechanism behind it, and the transcription
  itself gitignored.

### Option D — A single-purpose, identity-matched wrapper script; no tool-grant change

Reuse the pattern already in this repository (`GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`
/ `scripts/critic-dispatch-preflight.mjs`: a Bash invocation admitted by *exact
script identity*, not by directory shape) to add one new, narrow,
argument-closed script — e.g. `scripts/critic-report-persist.mjs` — whose entire
job is "append the supplied content to the fixed per-dispatch path under
`scratch/dispatch/<codename>/`," nothing else, no path parameter, no arbitrary
target. The guard admits exactly this script by identity, exactly as it already
admits `critic-dispatch-preflight.mjs` for a different purpose. `tools:` stays
`Read, Grep, Glob, Bash` — unchanged.

- **Read-only property:** narrowed by exception, but the **narrowest** of the
  three exception-bearing options. No `Write`/`Edit` tool is added (constraint 4
  is untouched in the tool sense); the exception is one exact script, one fixed
  path shape (already the CR-06-D-sanctioned `scratch/` location, already
  treated by the existing contract as not a "state change" because it is
  gitignored and never committed), with no traversal and no other side effect.
  It converts an *accidental*, unscoped capability the Critic already has
  (established above) into a *declared*, scoped, testable one — a reduction in
  actual attack surface relative to the status quo (Option C), not an
  expansion, because the accidental route (arbitrary `node -e` payload,
  reachable in or out of the project root) keeps working under Option C and is
  additionally *replaced*, not merely supplemented, if the guard is later
  hardened to require this script specifically.
- **Cost:** moderate. One new script plus its guard-admission entry plus its own
  test (the existing `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` pattern is a
  precedent for both the mechanism and the test shape). It does **not** by
  itself solve the tracked-durability half of the problem — `scratch/` stays
  gitignored, so this closes the "can the Critic reliably persist material at
  all, in a way future hardening won't silently break" question, not the "is it
  committed to history" question.

## Recommendation (not a decision)

**D, combined with B.** Neither alone closes the gap the backlog item reports;
together they do, at the smallest available narrowing of the read-only
property:

- **D** turns the Critic's already-latent, unscoped write capability into a
  declared, scoped, single-purpose, tested one — closing the risk that a future
  guard hardening pass (of exactly the kind already applied to gate-strength
  paths) silently breaks CR-06-D's existing `scratch/`-based persistence with no
  warning, and closing the honesty gap Option C leaves open (a contract that
  says "no write tool" while a session-level capability says otherwise).
- **B** closes the actual durability failure the item reports — findings
  existing only in a task notification — by making transcription to a
  tracked/citable location a checked dispatch-completion obligation rather than
  a habit, the same shape already used for Goldfish dispatch-record binding.

**A is not recommended** as the primary mechanism: it is the only option that
requires inventing new, role-aware, path-scoped guard machinery that does not
exist anywhere in the codebase today, for a capability the Critic already has
through the D-shaped route at far smaller cost and blast radius. It remains
available to the PO as the more invasive alternative if a future need (e.g. the
Critic writing tracked material directly) makes the narrower options
insufficient.

**What this recommendation does not settle:** whether `scratch/`'s gitignored,
untracked nature is acceptable long-term for review findings specifically, or
whether Critic findings should eventually move to a tracked, citable location
the way `backlog/evidence/` already works for other durable citation targets
(ADR-0063's directory-kinds table). That is a genuine follow-on question, not
answered here.

## Consequences

**Positive (if D+B is chosen):** the Critic's actual write capability stops
being an undocumented accident and becomes a tested, narrow, single-purpose
surface; durable transcription becomes a checked obligation instead of a habit;
neither change requires a new Write/Edit tool grant or new role-aware guard
machinery.

**Negative:** CR-08's "holds no write tool" framing needs a stated, narrow
exception (D); the Elephant's own dispatch-completion checklist grows one
mandatory step (B), adding friction to every Critic dispatch regardless of
whether findings existed.

**Risk:** D's script is a new addition to the guard's identity-matched exemption
list — every such addition is a permanent surface that must be kept in sync
with the script's own behavior (the existing `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`
comment already documents this class of drift risk). B does not close the
crash/compaction window between a Critic's reply and the transcription step
existing; it only makes the step itself unskippable once reached.

## Alternatives considered

- **A — broad Write/Edit tool grant with new role-aware path scoping.**
  Rejected as the primary mechanism: highest cost, widest exception, and solves
  nothing D does not already solve at a fraction of the blast radius. See
  Options above for the full analysis.
- **C — status quo.** Rejected as a recommendation (not as an option — the PO
  may still choose it): cheapest, but leaves the contract's "holds no write
  tool" claim false in practice, established in Context, and leaves the
  CR-06-D mechanism exposed to being silently broken by a future guard
  hardening pass with no test protecting it.
- **Closing the `node -e` gap generally, in this same dispatch.** Out of
  scope — this dispatch is explicitly forbidden from touching any guard, hook,
  role contract, or admission rule (briefing NVA-B-CRITICWRITE-1, field 4).
  Named here as a real, live finding for the PO/Elephant to weigh separately;
  not fixed, and not filed as a new backlog item by this dispatch (also outside
  the briefed scope — `backlog/items/**` is forbidden to this dispatch).

## Follow-up

- PO decision on this ADR (A/B/C/D, or a combination) at the next decision
  gate; number and index-row assignment happen at acceptance per ADR-0069 D2.
- If D is chosen: build `scripts/critic-report-persist.mjs`, its guard-admission
  entry, and its test, following the `critic-dispatch-preflight.mjs` precedent.
- If B is chosen: extend the dispatch-completion check (the
  `dispatch-authorship-verify.mjs`-style binding) to require a Critic dispatch
  name a persisted findings path before it is considered closed.
- Separately from this ADR's decision: the `node -e`/`python3 -c` Bash-write gap
  established in Context is a real, live finding independent of which option is
  chosen here (it exists today regardless of the PO's choice) and should be
  weighed by the PO/Elephant for its own remediation, on its own timeline —
  this dispatch surfaces it and does not act on it.

---

## Register entry (draft, for `docs/state.md` — not applied by this dispatch)

> **A Critic report has no durable write location; a decision package is ready.**
> `docs/adr/draft-critic-report-durable-write-location.md` lays out the
> composition (Critic read-only by contract only, not mechanically; containment
> is enumerated-deny and does not name a Critic report destination either way;
> the closed shell grammar admits an interpreter-payload write the item's own
> diagnosis missed, confirmed live) and four options (broad tool grant;
> enforced orchestrator transcription; status quo/CR-06-D; a narrow
> identity-matched wrapper script). Recommends D+B, not decided. PO gate
> pending.
