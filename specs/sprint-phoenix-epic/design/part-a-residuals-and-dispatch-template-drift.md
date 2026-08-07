# Part-A residuals (bootstrap attestation) and dispatch-template citation drift — design

Owner: Pipeline maintainers. Status: **DESIGN ONLY, without exception** — this document specifies
changes to `.mjs`/`.json`/`.md` files; it makes none of them. No revision of this document may
change a `.mjs`, `.json`, `.yaml`, test or template file: the sibling Part-A design was
Critic-flagged (finding F4, delta re-review `412d33d`) for a five-line comment edit that broke
exactly this rule, and the rule is restated here so the next revision cannot argue it did not
know. The only non-design files this dispatch touches are the three backlog items' `status:`
frontmatter and one pointer line each.

**Model-policy disclosure (convention inherited from the Part-A document):** the dispatch that
authored this document (`Dispatch: PHX-RESIDUALS-design (goldfish)`) ran on the Design-tier model
`claude-opus-5` at effort `xhigh`, citing `policies/model-policy.md` MP-22/MP-23 ("When in doubt
whether a design-phase step ... needs the Design-tier model, it does", `policies/model-policy.md:138`)
as its stated justification. This is design-phase authorship with real in-task latitude — §I.2
chooses between two architecturally different directions — so the tier is not a formality here.

The 2026-08-07 threat-model rework (`Dispatch: PHX-R2-THREATMODEL-rework (goldfish)`), which added
§0.5 and re-derived §I.2.3–§I.2.10, ran on the same tier (`claude-opus-5`, effort `xhigh`) for a
stronger version of the same reason: re-deriving a security-relevant recommendation against a
changed threat model carries more in-task latitude than authoring it did, not less. **Standing rule
for this package:** any dispatch that authors or reworks a design in it runs on the Design tier
(MP-22/MP-23), and its briefing says so explicitly.

The 2026-08-07 R3 re-scope (`Dispatch: PHX-R3-RESCOPE (goldfish)`), which re-derived the whole of
Part II against the operating model's measured structure, ran on the same tier (`claude-opus-5`,
effort `xhigh`) under that standing rule. It changed no file but this one: it re-scopes R3, it does
not perform it.

## 0. Scope, sources, and what is deliberately not re-opened

### 0.1 The three residuals

This document turns three PO-accepted backlog items into implementable scope:

| Id | Backlog item | Subject |
| --- | --- | --- |
| **R1** | `backlog/items/2026-08-07-attestation-git-presence-gate-not-gs8-protected.md` | the attestation's own `.git`-presence gate is not gate-strength-protected |
| **R2** | `backlog/items/2026-08-07-marketplace-install-topology-unattested.md` | no origin/content check runs for the non-git marketplace-install topology |
| **R3** | `backlog/items/2026-08-07-dispatch-templates-cite-restructured-operating-model-sections.md` | both dispatch templates cite `operating-model.md` sections that no longer exist |

R1 and R2 are coupled and share Part I: R1 protects the gate that decides whether the attestation
runs, R2 extends that same gate to the topology where it currently does not run. They touch the
same function and, after R1, the same module — §I.3 records the sequencing constraint that follows.
R3 is a different subject (dispatch-template infrastructure) and is kept in its own Part II; it is
in this document only because the PO directed all three residuals be taken into the Phoenix design
together.

### 0.2 Decisions this document does NOT re-open

Each item's `Triage` block records a binding 2026-08-07 PO decision. Taken as given, not re-argued:

- **R1:** candidate direction **1** (a narrow GS-9 entry, which requires the constant-extraction
  refactor first) is the chosen direction; direction 2 ("accept the residual as-is") is overridden.
  This document designs *how*, not *whether*.
- **R2:** decision (a) is answered **YES** — the marketplace-install topology **is** to get an
  integrity check; candidate direction 3 ("accept as a permanent scope boundary") is overridden.
  Decision (b) is answered YES: its own design pass first — this document. Choosing between
  candidate directions 1 and 2 is explicitly *not* pre-decided and is done in §I.2.4.
- **R3:** implement; proposal items 1+2 are mechanical, item 3 is design work — done in §II.2.
  *(Corrected 2026-08-07: the "mechanical" half of that framing does not survive the re-derivation.
  **What** to change is mechanical; **which files** to change is a scope decision the PO still owes,
  because the defect is 344 citations over 57 files rather than the eight in the two templates —
  §II.1.3, §II.6.)*

### 0.3 Relationship to the Part-A design document, and what this supersedes

`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md` discloses
R2's gap in three places: §A.1 disclosed limitation 1, §A.5 case 2 (the "non-git flat-copy install"
sub-case), and §A.7's first bullet. All three describe it as *tracked, not closed by that design*,
and cite R2's backlog item as the owner.

**What changes:** those passages stay factually accurate about Part A's own scope — Part A does not
close the gap, and nothing here retro-fits it. What is superseded is their **status implication**:
the gap is no longer an open scoping question with three undecided directions. It is PO-accepted
work with a chosen direction (§I.2.4). §A.7's bullet header "A real integrity check for the
installed non-git (marketplace flat-copy) case" therefore stops being an exclusion-with-no-plan and
becomes an exclusion-with-a-successor-design. Repointing those three passages at this document is
an explicit line item in R2's implementation inventory (§I.2.7); doing it earlier would mean this
design editing the sibling design before its own Critic pass.

### 0.4 Verification posture

Every `file:line` and every `§N` in this document was checked by reading the target in this
session; the commands are listed in §III.4. Claims that could **not** be verified here are marked
`ASSUMPTION Un` inline and collected in §III.3. This posture is not decoration: the Part-A document
was Critic-failed twice for inherited assumptions — once for an overclaimed guarantee ("byte-identical
to a clean checkout"), once for a topology assumption refuted by a single command.

### 0.5 Threat model — who these mechanisms defend against (standing constraint)

**PO decision, 2026-08-07.** Stated once, here, and binding for every part of this document.
It is stated at all because the first revision of §I.2 derived a recommendation without ever
naming its adversary, and over-built as a direct result.

1. **The adversary is the agent.** Every mechanism discussed here — the GS-\* rules, GS-6's
   live-plugin rule, the bootstrap attestation — exists because an agent session can edit the
   files that authorize its own actions: *"An agent that can weaken its own gate has no gate"*
   (`plugins/pipeline-core/hooks/guard-gate-strength.mjs:15`). That is the threat being modelled.
2. **A human attacker with local write access is out of scope.** Someone who can already write
   into the plugin cache, the project directory or the host's plugin registry is outside what a
   client-side check running on that same machine can answer. Mechanisms are not to be sized
   against that adversary, and a residual only that adversary can reach is a **stated boundary,
   not a defect**.
3. **The existing detached-signature burden is the ceiling.** ADR-0056 `signature` mode already
   costs the PO one Ed25519 key held outside the repository and one signing act per push approval
   (`docs/adr/0056-push-approval-mode.md:45-49`). **No new human key, no new ceremony and no
   per-release signing step may be introduced** by anything specified in this document. A
   requirement that genuinely cannot be met without one is reported to the PO, not designed in.

The consequence that shapes §I.2, and the reason this block sits above Part I rather than inside
it: a client-side check whose verifier **and** whose trust anchor both ship inside the artifact it
checks cannot establish authenticity against any party able to write into that artifact. Under (1)
and (2) the parties that can write there are exactly the ones such a check cannot answer, and the
parties it could answer are the ones the write-lane guard already refuses (§I.2.3) — so the only
thing left for it to detect honestly is **drift nobody maintained the anchor for**, i.e. an
accident. §I.2 is re-derived from that below. R1 (§I.1) is unaffected: its adversary is already the
agent session, and its mechanism is a path guard, not an anchored comparison.

---

## Part I — Bootstrap attestation residuals (R1 + R2)

### I.1 R1 — the attestation's own `.git`-presence gate is not gate-strength-protected

*Threat model: §0.5. R1's adversary is the agent session that edits the gate, which is what the
GS-\* family already models; the 2026-08-07 correction changes nothing in the derivation below and
R1 is not re-opened by it.*

#### I.1.1 Problem, re-derived from the code

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` decides the bootstrap readiness
`status` at `:294-298`. The origin/content attestation contributes exactly one term to that
decision, `attestationFailed`, computed at `:273-293`. Whether it is computed at all is decided by
one line, `:274`:

```
if (version && pluginRootHasSelfApplicationGit(pluginRoot)) {
```

with the predicate itself at `:204-206` — a single `existsSync(resolve(pluginRoot, "..", "..", ".git"))`.

The gate-strength surface (`plugins/pipeline-core/hooks/guard-gate-strength.mjs`) protects a closed
list of paths, `GATE_STRENGTH_PATHS` at `:51-98`. GS-8 (`:88-97`) protects
`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs` — the two-URL allowlist the attestation
compares its origin against (`public-core-origin-allowlist.mjs:16-21`, consumed at
`pipeline-start-preflight.mjs:277`). Nothing in that list matches
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, and GS-6 (`LIVE_PLUGIN_RULE`,
`:100-103`) matches only the *currently enforcing* installed plugin root
(`livePluginRoots()`/`insideLivePlugin()`, `:118-140`), deliberately leaving a source checkout's
`plugins/pipeline-core/` writable (`:113-116`).

So: GS-8 makes it impossible for an agent session to silently widen *what* the attestation accepts,
while the decision *whether the attestation is consulted at all* — a strictly stronger lever, since
disabling it disables the allowlist comparison too — sits in an unprotected file one level up. That
is the hole GS-8 exists to close, reopened one level up. Kept minor by the originating Critic
review because `pipeline-start-preflight.mjs` remains under Verify/Critic/PO review either way:
this is a hardening gap, not an active bypass.

#### I.1.2 The constraint that shapes every option: guards match paths, not lines

`gateStrengthRuleFor()` (`guard-gate-strength.mjs:143-151`) normalizes a repo-relative path and
compares it to `rule.path` — whole files only, no line, symbol or AST granularity. The shell lane
(`guard-lifecycle-ready.mjs:194-214`) derives its needles as `basename(rule.path)` (`:206`) — again
whole files. There is therefore **no mechanism in this guard family that can protect "the specific
gate-deciding line"** the backlog item's direction 1 asks for. The only available unit of
protection is a file. This is why the item itself pairs direction 1 with a constant-extraction
refactor, and it is the reason the module boundary (not the line) is what this design has to get
right.

#### I.1.3 Chosen approach: extract the whole gate evaluation, then protect that module with GS-9

Move the *entire* attestation evaluation — the `.git` predicate, the runner-dependent observer
default, the allowlist comparison and the `normalizeRulesetSource` shaping — into one new, small,
dedicated module, and give that module a `GATE_STRENGTH_PATHS` entry:

`plugins/pipeline-core/lib/self-application-attestation-gate.mjs`, exporting exactly two symbols:

- `pluginRootHasSelfApplicationGit(pluginRoot)` — moved verbatim from
  `pipeline-start-preflight.mjs:204-206` together with its doc comment (`:175-203`).
- `evaluateSelfApplicationAttestation({ pluginRoot, runner, version, observe })` → `{ attempted,
  failed }` — the body of `pipeline-start-preflight.mjs:271-293`, unchanged in logic: the observer
  default (`observe ?? (runner === "codex" ? observeCodexPublicCoreIdentity : observePublicCoreIdentity)`),
  the `version && pluginRootHasSelfApplicationGit(pluginRoot)` condition, the self-referential
  `observe({ sourcePluginRoot: pluginRoot, installedPluginRoot: pluginRoot }, {})` call, the
  `PUBLIC_SELF_APPLICATION_ORIGINS.has(observation.candidate?.repository)` comparison and the
  `normalizeRulesetSource` schema-closure pass.

`pipeline-start-preflight.mjs` keeps one import, one call and the existing `status` ternary:

```
const attestationFailed = evaluateSelfApplicationAttestation({ pluginRoot, runner, version, observe }).failed;
```

New `GATE_STRENGTH_PATHS` entry, appended after GS-8 (`guard-gate-strength.mjs:97`), in the
existing frozen-object shape:

```
Object.freeze({
  id: "GS-9",
  path: "plugins/pipeline-core/lib/self-application-attestation-gate.mjs",
  reason: "self-application-attestation-gate.mjs decides whether the bootstrap origin/content attestation runs at all and whether its result fails -- disabling it disables the GS-8 allowlist comparison with it.",
}),
```

`id` is the next free number after GS-8; GS-6 stays the live-plugin rule and is not renumbered
(`guard-gate-strength.mjs:77-79` records why renumbering is forbidden).

**Why the whole evaluation and not only the predicate.** Protecting only the predicate leaves
`attestationFailed` computed in the unprotected file, where `attestationFailed = !originAllowlisted
|| normalized?.status !== "ready"` (`:292`) can be edited to a constant `false` — a smaller edit than
weakening the predicate, with the identical effect. Moving the whole evaluation means every
*semantic* lever of the gate sits behind GS-9; what remains outside is only the wiring (§I.1.4).

**What GS-9 does not close, stated plainly.** The import line, the call site and the
`|| attestationFailed` disjunct in the `status` ternary (`:296`) stay in
`pipeline-start-preflight.mjs`, which is not gate-strength-protected and (per §I.1.2) cannot be,
short of protecting the whole file. An agent could still delete the call. GS-9 therefore raises the
bar from "silently widen the gate's semantics" to "delete a visible call site in a reviewed file",
and no further. The compensating control for the wiring is behavioural test coverage, not a guard
(§I.1.6) — and that is exactly the protection level the originating Critic review judged sufficient
when it kept this finding minor.

#### I.1.4 Rejected alternatives, with tradeoffs

1. **A GS entry on `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` itself.** Rejected.
   The file carries the manifest read (`:229-237`), both hosts' installed-identity parsers
   (`:63-169`), the WSL `executionBoundary` computation (`:245-247`), the `nextAction` shape
   (`:308-345`) and the exit-code mapping (`:356-358`) — freezing all of it against agent edits to
   protect one term. Concretely disqualifying: the sibling Part-B design (§B.2(a) of the Part-A
   document) specifies an edit to `:247` in this same file; once a whole-file GS entry is
   enforcing, that fix could only be made by a PO hand-edit outside an agent session.
2. **Extract only `pluginRootHasSelfApplicationGit`.** Rejected as under-protective, for the reason
   in §I.1.3. Recorded as the smaller-churn fallback if the PO prefers the most minimal possible
   move: it is strictly better than today and strictly weaker than the chosen option.
3. **A content-aware guard** (refuse edits that change a specific line/symbol rather than a file).
   Rejected: no such mechanism exists in this guard family (§I.1.2); building one is new guard
   machinery with its own T1 review, far larger and riskier than a module boundary, and it would
   have to parse JavaScript in a PreToolUse hook with a fail-open budget.
4. **Accept the residual** (the item's direction 2). Not available — overridden by PO Triage (§0.2).

#### I.1.5 Exact file-level implementation inventory (R1)

| File | Change |
| --- | --- |
| `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` | **new.** SPDX header, doc comment stating the GS-9 protection and why the module exists; the two exports of §I.1.3; imports `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` from `./public-core-observation.mjs`, `PUBLIC_SELF_APPLICATION_ORIGINS` from `./public-core-origin-allowlist.mjs`, `normalizeRulesetSource`/`RULESET_SOURCE_SCHEMA` from `./ruleset-source.mjs`, `existsSync` from `node:fs`, `resolve` from `node:path`. |
| `plugins/pipeline-core/lib/self-application-attestation-gate.test.mjs` | **new.** Unit coverage for the moved logic (§I.1.6). |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` | delete `:175-206` (doc comment + predicate) and `:271-293` (the attestation block, keeping its explanatory comment in the new module); replace with one import and the one-line call of §I.1.3. Drop the now-unused imports: `existsSync` from `node:fs` (`:6`; its only use in this file is `:205`), `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` (`:13`), `PUBLIC_SELF_APPLICATION_ORIGINS` (`:14`), `normalizeRulesetSource`/`RULESET_SOURCE_SCHEMA` (`:15`). `readFileSync` stays (used at `:60`, `:211`). |
| `plugins/pipeline-core/hooks/guard-gate-strength.mjs` | append the GS-9 entry of §I.1.3 to `GATE_STRENGTH_PATHS` after `:97`. Nothing else; GS-6/GS-8 and the GMW block (`:196-209`) are untouched. |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` | no assertion changes. Additions only, if the implementor wants the wiring test of §I.1.6. |

The exported symbol `pluginRootHasSelfApplicationGit` disappears from
`pipeline-start-preflight.mjs`'s public surface. Verified safe: a repo-wide search over `*.mjs`
finds the name only at its definition and its one call site inside that file (§III.4) — no test and
no other script imports it.

#### I.1.6 Behaviour preservation, test approach, and two disclosed consequences

**Behaviour preservation.** The move is textual: same predicate, same short-circuit order
(`version &&` first, so an unreadable manifest still skips the observer), same observer defaults per
runner, same self-referential call shape, same allowlist comparison, same `normalizeRulesetSource`
input object, same resulting boolean. The injectable `observe` seam is forwarded through the new
function's parameter object, so `observePipelineStartPreflight({ observe })` keeps working
unchanged — that seam is what the existing tests use (`pipeline-start-preflight.test.mjs:96`,
`:480`, `:503`, `:516`, `:529`, `:542`).

**How the existing tests stay green.**
- The `.git`-presence tests (`pipeline-start-preflight.test.mjs:548` onwards — the fixture builder
  at `:571-591`, the "attestation must still be attempted" case at `:603`, the F2 skip case at
  `:607`/`:619`, the no-stub F4(c) case at `:625`) all drive the behaviour through
  `observePipelineStartPreflight` with a `scriptUrl` override, never by importing the predicate.
  They are indifferent to which module the predicate lives in and must pass **unmodified**.
- `guard-gate-strength.test.mjs` GST17 (`:245-278`) iterates `GATE_STRENGTH_PATHS` and asserts both
  lanes refuse every entry. A new GS-9 row is picked up automatically and must pass without editing
  the test. GST18 (`:280-288`) names config tiers explicitly and is unaffected.
- `public-core-origin-allowlist.test.mjs` is untouched (GS-8's module does not change).

**New tests** in `self-application-attestation-gate.test.mjs`, mirroring the GS-8 module's own
shape (`public-core-origin-allowlist.test.mjs:20-24` asserts the module's exact export set):
`{ attempted: false, failed: false }` when no `.git` sits two levels above `pluginRoot`; the
observer is never invoked in that case; `failed: true` for a non-allowlisted origin; `failed: true`
for a `rejected` observation; `failed: false` for an allowlisted, `ready` observation; and an
export-set assertion so the module cannot silently grow calling code.

**Optional wiring test** (recommended, cheap): the existing fork-origin case
(`pipeline-start-preflight.test.mjs:480`) already goes red if the call site is deleted, because
`status` would fall back to `"ready"`. That is the honest compensating control for §I.1.3's
disclosed residual: the wiring is covered by the verify gate, not by a guard.

**Disclosed consequence 1 — a source-tree GS entry takes effect only on the next plugin refresh.**
Verified independently rather than restated from the Part-A document's §A.3: the PreToolUse hook is
wired as `node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-gate-strength.mjs"`
(`plugins/pipeline-core/hooks/hooks.json:39`), so the script re-read on every invocation is the
*installed* copy, and this repository's `.claude/settings.json` wires no hooks at all (its only
command is the statusline script). An edit landing GS-9 in the source checkout therefore changes
nothing the currently-enforcing guard reads; the rule first binds after the plugin refresh that
installs it. From that point on `gateStrengthRuleFor()` matches by repo-relative path — unlike
GS-6's live-root-only `insideLivePlugin()` — so the new module's *source-tree* copy is refused to
agent sessions too, with the PO-hand-edit escape hatch (`guard-gate-strength.mjs:211-223`) as the
only remaining route. One session may land the module and the rule together, in either order.

**Disclosed consequence 2 — the module's basename becomes a shell needle.** The shell lane derives
its needles from `basename(rule.path)` (`guard-lifecycle-ready.mjs:206`) and matches them as
substrings of any non-read-only command (`:207-209`), deliberately over-refusing (`:188-192`):
after the refresh, any write-classified shell command whose text contains
`self-application-attestation-gate.mjs` — including a `git commit -m` message that merely names the
file — is refused with `GUARD-GATE-STRENGTH-SHELL`. Read-only diagnostics stay exempt (`:196`).
This is why the module name must be long and distinctive rather than generic: a name like
`preflight-gate.mjs` would be a plausible substring of unrelated commands. The implementation
dispatch must be told to use `-F` or descriptive wording in commit messages, exactly as GS-8's
module already requires.

#### I.1.7 Acceptance criteria (R1)

- **AC-R1-1** `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` exists and exports
  exactly `pluginRootHasSelfApplicationGit` and `evaluateSelfApplicationAttestation` — asserted by
  its own test's export-set check.
- **AC-R1-2** `GATE_STRENGTH_PATHS` contains a frozen entry with `id: "GS-9"` and `path:
  "plugins/pipeline-core/lib/self-application-attestation-gate.mjs"`; GST17 passes unmodified, so
  both lanes refuse it.
- **AC-R1-3** `pipeline-start-preflight.mjs` contains no `existsSync`, no
  `PUBLIC_SELF_APPLICATION_ORIGINS` and no `normalizeRulesetSource` reference; its attestation
  surface is one import plus one call.
- **AC-R1-4** Every pre-existing assertion in `pipeline-start-preflight.test.mjs` and
  `guard-gate-strength.test.mjs` passes **unmodified** (additions allowed, edits are a stop
  condition — the tests are the contract this refactor is measured against).
- **AC-R1-5** The project's configured verify gate is green on the final state.
- **AC-R1-6** The implementation's report states that GS-9 binds only after the next plugin refresh
  and that the module's basename is a shell needle from then on.

### I.2 R2 — no integrity check runs for the marketplace-install topology

#### I.2.1 Problem, re-derived from the code

The attestation is reached only through `pluginRootHasSelfApplicationGit(pluginRoot)`
(`pipeline-start-preflight.mjs:274`), which tests for a `.git` entry two directories above
`pluginRoot`. The gate exists because the observers require a real git checkout *by construction*:
`observe()` calls `resolveSourceLayout()` (`public-core-observation.mjs:330`, definition `:87-97`),
which demands `basename(sourcePluginRoot) === "pipeline-core"` and `basename(parent) === "plugins"`
and three canonical, non-symlink physical directories (`physicalDirectory`, `:65-85`); then
`observeGit()` (`:332`, definition `:152-179`) runs `rev-parse --show-toplevel`, `rev-parse HEAD`,
`rev-parse HEAD^{tree}`, `symbolic-ref --short HEAD`, `remote get-url origin` and
`status --porcelain=v1` against that root, failing closed with `SNT-A2-GIT-*` if any of them cannot
run. All six are local commands; the observer performs **no remote read at all**.

A marketplace-installed copy has no `.git` (`ASSUMPTION U1` on the exact path shape), so the
condition at `:274` is false, `attestationFailed` stays `false`, and `status` falls through at
`:294-298` to the pre-existing `version`/`installedIdentity`/`installedVersion` decision that
predates Part A. Nothing is attempted and nothing fails: **in the topology every ordinary end-user
install ships to, no origin check and no content check runs at all.** A forked or locally altered
copy whose version string matches passes readiness undetected there — the exact gap Part A was
created to close, closed only for the self-application/dev-checkout topology.

Note what the code *already* computes and discards in that topology:
`installedPipelineIdentityCodex` reads `entry.marketplaceSource.sourceType === "git"` and maps it to
`source: "remote"` (`pipeline-start-preflight.mjs:94-97`) without ever comparing
`entry.marketplaceSource.source` — the recorded marketplace location — to anything. §I.2.6 returns
to this.

#### I.2.2 The constraints any answer has to satisfy

Derived from the Part-A design's own DoD framing and from the code, not invented here:

1. **No network dependency in the bootstrap readiness path.** Part A performs only local git reads
   (§I.2.1). Bootstrap must complete offline; the one remote-reading path in this codebase
   (`inspectPipelineUpdateAvailability`) is advisory and fail-open by contract
   (`harness/session-bootstrap.md:162`, "Offline/unavailable output is `unknown`, fail-open, and
   never a freshness claim").
2. **Reused primitives, minimal new surface.** Part A's DoD constrained it to reusing
   `public-core-observation.mjs`/`ruleset-source.mjs` rather than reviving retired machinery, and it
   declined a config-gated rollout specifically because that would need a new `pipeline.user.yaml`
   key.
3. **No new hard block on first ship.** Part A's §A.5 non-goal 3: the check must not newly produce
   `"plugin-identity-unavailable"` (exit `2`). The sanctioned failure shape is the existing
   `"plugin-refresh-required"` branch plus the advisory `nextAction`
   (`pipeline-start-preflight.mjs:333-344`), which `pipelineStartPreflightExitCode` maps to `0`
   (`:356-358`).
4. **Whatever is claimed must be true.** The guarantee statement has to survive the same scrutiny
   that removed "byte-identical to a clean checkout" from Part A §A.1.
5. **No new human key, ceremony or per-release signing step** — §0.5 point 3, added by the
   2026-08-07 threat-model correction. The first revision of §I.2.4 recommended a direction whose
   stage 2 violated this constraint; that is what §I.2.3–§I.2.5 below are the re-derivation of.

#### I.2.3 What an agent can actually write, and the anchor problem

Re-derived 2026-08-07 against §0.5. The first revision of this section named an "adversary who can
rewrite the installed copy" without ever asking whether the adversary in scope *can*. Answering that
question from the code is what changes the recommendation.

**(a) The write lane refuses it.** `guard-gate-strength.mjs` is wired into a PreToolUse matcher of
exactly `Edit|Write|NotebookEdit` (`plugins/pipeline-core/hooks/hooks.json:34-42`). Its GS-6 rule
(`LIVE_PLUGIN_RULE`, `guard-gate-strength.mjs:100-103`) matches **any** path inside a
currently-enforcing plugin root, is evaluated first and independently of the governance-marker check
that scopes the path table (`:168-177` vs. `:179-188`), and refuses with exit 2 and no in-session
override (`:211-223`). `livePluginRoots()` (`:118-132`) resolves the root the guard is itself
running from (`:120`) plus a `CLAUDE_PLUGIN_ROOT` that passes a shape check (`:122-130`);
`insideLivePlugin()` (`:135-140`) is a containment test. On a marketplace install the installed copy
**is** the enforcing copy, so every Edit/Write into it — the preflight script, an attestation file,
a pin module, the guards themselves — is refused. In the same tool call the second write hook
refuses any target outside the physical project root as a cross-repository mutation
(`guard-lifecycle-ready.mjs:920-924`, `isProjectWritePath` `:244-257`), which an out-of-project
install always is.

**(b) The GMW lift does not change (a) into a usable path.** The maintenance-window block
(`guard-gate-strength.mjs:196-209`) is the only allow path in that file and fires only for GS-6. It
checks the hardcoded kernel list first and unconditionally (`:198-199`; list at
`guard-maintenance-window.mjs:120-128` — the gate-strength hook, the window module, `hooks.json`,
the write-target helper, the grammar guard, the lifecycle guard, and the critical-human-proof
policy). Everything else inside the live root — including `pipeline-start-preflight.mjs`,
`public-core-observation.mjs` and anything R2 would add — is liftable *in principle*, but only while
a window is active, and a window exists only because `installGuardMaintenanceWindow` verified a
genuine detached Ed25519 proof over a digest-bound intent (`guard-maintenance-window.mjs:418-419`),
re-verified on every read (`:529-530`) and capped at four hours (`:175`, `:542-545`). An agent
cannot open one for itself. **So through the write lane, an agent alters the installed copy only
inside a window a human deliberately opened and signed.**

**(c) The shell lane is *not* defended for the live plugin root — finding SL-1.** The shell-side
gate-strength refusal derives its needles from `GATE_STRENGTH_PATHS.map(basename)`
(`guard-lifecycle-ready.mjs:206`), and GS-6 is not in that array: it is a separate export
(`guard-gate-strength.mjs:100-103`, beside the table at `:51-98`). The exclusion is deliberate and
its reason is sound — matching the live root would refuse the very recovery commands the gate prints
(`guard-lifecycle-ready.mjs:197-202`). The compensating control that comment names —
"shell WRITES into the enforcing plugin root are already refused by GUARD-CROSS-REPO-MUTATION
whenever the installed copy sits outside the project root" (`:202-204`) — is narrower than the
claim. `isForbiddenCrossRepositoryMutation` (`:514-578`) is an enumerated list: redirects escaping
the root (`:519-527`), the Codex CLI's plugin/marketplace subcommands (`:534-542`, executable-scoped
to `codex` at `:534`), the cachebuster script (`:544-550`), `git -C` outside the root (`:552-559`),
the mutating-executable set `cp mv rm mkdir rmdir touch chmod chown chgrp ln install truncate tee
rsync` (`:561-570`) and `sed -i` (`:571-576`) — then `return false` (`:577`). An interpreter write
(`node -e …`, `python3 -c …`) naming an absolute path inside the live plugin root is on none of
them, and `guard-gate-strength.mjs:32-34` records for the configuration paths that exactly this
shape ("`node -e` is an ordinary simple command under the closed grammar") is how the Edit refusal
"could simply be stepped around" before the shell lane existed.

This was **not executed**: confirming it means attempting a write into the enforcing guard code,
which is neither a design pass's job nor inside this dispatch's scope. It is a static read of both
lanes, it is escalated as its own item rather than designed around (§I.2.10 item 5), and §I.2.4's
conclusion is deliberately built so that it holds whether SL-1 is closed or left open.

**(d) The anchor problem, unchanged and now load-bearing.** For a non-git copy there is nothing
locally authoritative to compare against: no `remote get-url`, no commit, no clean/dirty signal. An
integrity check needs a **trusted expected value** — a pin — and that pin cannot be derived from the
artifact being checked. **The preflight script, any pin module and any attestation file ship inside
the very subtree being attested.** A party able to write inside that subtree rewrites the checker,
the pin and the attestation in one pass. The first revision recorded this as "a second, harder
truth" and then designed past it; under §0.5 it *is* the answer, because it applies to every party
(a)+(b) leave standing, and the parties it does not apply to are the ones (a)+(b) already refuse.
What such a check can still detect, reliably, is **drift nobody maintained the anchor for**: a
partial or interrupted install, a stale file left by a refresh, a corrupted cache entry, a hand-edit
made without regenerating the anchor. That is an accident detector, not an authenticity gate — and
any design claiming more is repeating Part A's F4 overclaim.

**(e) Therefore the signature buys nothing.** A detached signature over the content digest adds no
adversary-resistance while the pinned public key ships inside the attested subtree: whoever can edit
the digest file can edit the pin module in the same pass, and whoever cannot edit either is already
refused by (a)+(b). It would only start to pay if the pin lived **outside** the artifact — a second
human key plus a signing act per release, which §0.5 point 3 forbids. This finding decides §I.2.4.
It is independent of SL-1 (it holds whether or not the shell lane is closed), independent of who the
writing party is, and it is the one thing the first revision could not see because it never named
its adversary.

#### I.2.4 Direction comparison and recommendation

**Status: re-derived 2026-08-07 under §0.5.** The two candidate records below stand exactly as
written — they are the PO's two directions with their measured tradeoffs, and this revision does not
erase them. What changes is the conclusion drawn from them, for the reason in §I.2.3(e).

**The residual, decomposed by adversary class.** R2's originating text names "a forked or locally
altered marketplace copy whose version string matches"
(`backlog/items/2026-08-07-marketplace-install-topology-unattested.md:36-40`). That is four
different problems wearing one sentence:

| Class | What it is | Reachable today? | Disposition |
| --- | --- | --- | --- |
| **A — agent, write lane** | an agent session edits the installed copy with Edit/Write/NotebookEdit | **No.** GS-6 refuses unconditionally (§I.2.3a); only a human-signed GMW window opens it, and never for the kernel paths (§I.2.3b) | Already closed, by a guard. An attestation would fire only after a write that never lands — **no new mechanism justified** |
| **A′ — agent, shell lane** | the same agent, via an interpreter command naming the live root | **Not refused by any rule that names the live plugin root** (§I.2.3c, finding SL-1) | The fix belongs in the guard lane. An in-tree attestation is no answer: the same capability rewrites it, or simply deletes it and lands on the benign "no anchor present" outcome. **Escalated as its own item (§I.2.10 item 5); guard code, out of this document's scope** |
| **B — accidental drift** | partial or interrupted install, stale file after a refresh, corrupted cache entry, an un-anchored debugging hand-edit, a `directory`-sourced marketplace pointing at a dirty checkout | **Yes, routinely** — and it is the class the existing `plugin-refresh-required` branch already exists for | **The only class a client-side check can honestly close.** This is what survives of R2 (§I.2.5) |
| **C — human attacker with local write access** | rewrites the cache, the pin and the checker together | Yes, and unanswerable from inside the artifact | **Out of scope** by §0.5 point 2 → a stated permanent boundary, i.e. a partial reinstatement of the item's direction 3 |
| **D — foreign or compromised distribution channel** | the whole subtree arrives from a non-Public-Core source, pin and checker included | Yes | Not closable in-tree (§I.2.3e). The one cheap partial signal is the host's own record of *where* the copy came from — §I.2.6, which this correction promotes |

Read against that table, R2's original motivation was in substantial part a **class C** scenario. The
"locally altered" half splits into A (already closed), A′ (a guard defect, not an attestation gap)
and C (out of scope); the "forked" half is D, plus the entirely ordinary case of a user who *chose* a
fork and is nobody's adversary. What is left for a bootstrap check to do is class B, and class D only
as a provenance label.

**Candidate direction 1 — non-git content attestation against a trusted expected value.**

- Satisfies constraint 1 completely: purely local, works offline, no latency.
- Reuse is high (constraint 2): the file-snapshot and hashing machinery already exists
  (`snapshotPluginRoot`, `public-core-observation.mjs:250-284`, producing exactly the
  `contentSha256` the git path already consumes at `pipeline-start-preflight.mjs:288-289`), and a
  signature-verification primitive with the right shape already exists —
  `verifyAttestation({ keyReference, payload, publicKey, signatureBase64 })` in
  `plugins/pipeline-core/lib/provenance-attestation.mjs:16-25`, with the digest-only signing-request
  helpers at `:10-13` and `:40-42` whose doc comment already states "signing remains an external key
  duty".
- The pin pattern also exists: `verifyPoApprovalProof` pins `{ keyReference, publicKeySha256 }` and
  verifies that the public key travelling with the proof hashes to the pinned value
  (`plugins/pipeline-core/lib/po-approval-proof.mjs:33-35`). The repo already operates a detached
  Ed25519 approval key whose private half lives outside the repository (CLAUDE.md, push policy), so
  the key-custody model is established rather than invented.
- Cost: a distribution-side step (releases must be signed) and one new pinned constant module. Until
  releases are signed, the check must treat "no attestation present" as *unattested*, not as failed
  — otherwise every existing install trips the branch on day one.
- **What §0.5 does to this direction (added 2026-08-07).** Its cost line is now disqualifying, not
  merely expensive: "releases must be signed" is a per-release human signing step and a second key,
  which §0.5 point 3 forbids. And its benefit line does not survive §I.2.3(e) either — with the pin
  shipping inside the attested subtree, the signature adds no adversary-resistance over an unsigned
  digest for any of classes A/A′/B/C/D. What remains usable is the *reuse* half of the bullets
  above: `snapshotPluginRoot`/`contentSha256` (`public-core-observation.mjs:250-284`, consumed at
  `pipeline-start-preflight.mjs:288-289`) and the `attempted/failed` outcome shape. That residue is
  what §I.2.5 builds on. The signature envelope, the pinned key module, the pin-verification step
  and `verifyAttestation` are dropped (§I.2.7).

**Candidate direction 2 — a remote-read check at bootstrap.**

- Violates constraint 1 head-on: it puts a network read in the mandatory readiness path that Part A
  deliberately has none of, and bootstrap must work offline.
- It is known-broken in the exact environment the sibling Part B exists for: a Codex+WSL sandbox
  cannot complete an ordinary `git ls-remote` against the public marketplace at all. There it must
  fail open (constraint 3), which means an adversary who can drop packets — or simply an offline
  developer — disables the check. A security gate that any network condition can switch off is
  advisory metadata wearing a gate's clothes.
- It does **not** escape the anchor problem (§I.2.3): a non-git copy has no local origin to read, so
  direction 2 still needs a pinned statement of which origin/identity to expect *plus* the network
  dependency. It is strictly direction 1's problem with an extra failure mode.
- One genuine advantage, recorded rather than buried: it would also close Part A's disclosed
  limitation 2 (an allowlisted origin checked out at an arbitrary *committed* history) for the git
  topology, which direction 1 does not address as specified.

- **Unaffected by the correction (added 2026-08-07).** Direction 2's rejection rests on the offline
  constraint, on being known-broken in the Codex+WSL sandbox, and on not escaping the anchor
  problem. None of those depends on who the adversary is, so the rejection stands exactly as
  recorded above and is not re-opened.

**Revised recommendation (supersedes "direction 1, staged").** Neither direction as scoped. Build
the smallest thing the threat model actually justifies, and state the rest as a boundary:

1. **Drop the signature entirely** — the release key, the signing step, the pinned-key module, the
   `keyReference`/`publicKey`/`signatureBase64` envelope, the `verifyAttestation` call, GS-10, and
   the whole of the first revision's *stage 2*. Reason: §0.5 point 3 forbids the ceremony, and
   §I.2.3(e) shows it buys nothing even if it were allowed. Both reasons are independently
   sufficient; this is not a cost/benefit call that better funding would reverse.
2. **Keep, at most, an unsigned content-drift check (R2-min-A, §I.2.5)** — a release-side content
   digest emitted by a script (mechanical, no key, no human act) and compared at bootstrap. It
   closes class B and claims nothing else.
3. **Prefer the provenance lever (R2-min-B, §I.2.6) if — and only if — U3 measures true.** It is the
   only available check whose *expected* value is not inside the bytes it judges, it needs no
   release step at all, and it addresses class D as a label rather than as a gate.
4. **Accept the boundary for classes A′ (via this document), C and D-as-a-gate.** A′ is escalated to
   the guard family where it belongs; C is out of scope by §0.5 point 2; D-as-a-gate is unreachable
   in-tree.
5. **Nothing is implemented before OBS-1 (§I.2.5) is measured.** U4 alone can make item 2 unbuildable
   — and if U4 and U3 both come back unfavourable, the honest answer is item 4 for all of R2, i.e.
   the item's direction 3 in full. That is a legitimate outcome of this re-derivation, not a failure
   of it, and §I.2.10 item 1 puts it in front of the PO as such rather than manufacturing a
   replacement mechanism to fill the gap.

**Reconciliation with the PO's 2026-08-07 override of direction 3.** That override
(`backlog/items/2026-08-07-marketplace-install-topology-unattested.md:112-124`) was taken before the
threat model was stated, and this design reconciles the two rather than quietly preferring either:

- **Still standing.** The override's *finding* — that leaving the topology every ordinary end-user
  install ships to entirely unchecked "would hollow out Part A's purpose" (`:120-124`) — is
  untouched, and item 2/item 3 above honour it: something does run in that topology, and it is not
  nothing. The override's procedural half (decision (b): its own design pass first, `:125-131`) also
  stands and is what this document is.
- **Superseded.** The override's implicit premise — that closing the gap means *attesting
  authenticity*, which is what both of its candidate directions offer — does not survive §0.5.
  Authenticity against a party who can write inside the artifact is unreachable client-side without
  the refused ceremony. What is reachable is integrity-against-accident.
- **Therefore, partially reinstated, and this needs the PO's confirmation (§I.2.10 item 1):** for
  classes C and D-as-a-gate, direction 3's exact wording is the correct answer — "the integrity
  guarantee is claimed only for self-application/dev checkouts, end-user installs rely on the
  marketplace/host distribution channel's own integrity" (`:98-102`). This design does not take that
  decision; it is the PO's to reinstate, because the override was the PO's.

#### I.2.5 Design of what remains (R2-min-A), and the measurement that gates it

**OBS-1 — the measurement that decides whether any of this is buildable.** One observation on a
real marketplace install, before any implementation dispatch:

1. Does `snapshotPluginRoot` complete on the installed cache tree — i.e. is every entry a regular
   file with `nlink === 1n` and no symbolic link? `stableFile` fails closed with
   `SNT-A2-PLUGIN-NONREGULAR` otherwise (`public-core-observation.mjs:203-205`, and the directory
   walk's own rejection at `:271`). This is assumption **U4** (§III.3), and it is the single most
   likely way R2-min-A fails in practice: a hardlinking installer turns the check into a permanent
   false failure for every user — the same shape as Critic finding F2, which this feature already
   paid for once.
2. Is `.codex-plugin/plugin.json` present in the installed tree, as `parseManifest` requires
   (`public-core-observation.mjs:27`)? Assumption **U2**.
3. Does the host's plugin record for a git-sourced install carry the marketplace URL in
   `entry.marketplaceSource.source` (`pipeline-start-preflight.mjs:94-97`)? Assumption **U3**, and
   the precondition for the preferred R2-min-B (§I.2.6).

If (1) or (2) is false, R2-min-A is not buildable as specified and the honest answer for class B is
the boundary of §I.2.10 item 1. If (3) is true, R2-min-B is available at near-zero cost and is the
better of the two. Cost of OBS-1: one session on a machine with a real marketplace install.

**Release-side artifact.** One file inside the plugin subtree,
`.pipeline-attestation/content-digest.json`, schema `pipeline.public-core-content-digest.v1`:

```
{ schema, plugin: { name, version }, manifestSha256, contentSha256 }
```

`contentSha256` is computed over the subtree **excluding the digest file itself** — otherwise the
value would have to contain its own hash. **No envelope, no key, no signature**: the withdrawn
`keyReference`/`publicKey`/`signatureBase64` fields are exactly what §I.2.3(e) shows to be inert
here, and exactly what §0.5 point 3 forbids paying a human ceremony for. The file is emitted by a
release-time script, which is a mechanical build step, not a signing act.

**Client-side verification**, in the R1 gate module (§I.1.3), on the branch where
`pluginRootHasSelfApplicationGit()` is false — i.e. replacing today's unconditional skip:

1. Snapshot the installed subtree with the existing machinery, excluding the digest path, and
   parse the manifest. This needs one new export from `public-core-observation.mjs` —
   `observeInstalledContentIdentity({ installedPluginRoot }, deps)` — composed of
   `physicalDirectory` + `snapshotPluginRoot` + `parseManifest`, i.e. `observe()` (`:323-357`)
   **minus** `resolveSourceLayout` and `observeGit`. `snapshotPluginRoot` gains one optional
   exclusion parameter, defaulting to "exclude nothing" so the git path is bit-for-bit unchanged.
   The naming constraints of `resolveSourceLayout` are deliberately not applied: an installed copy's
   directory names are the host's business, not the plugin's (`ASSUMPTION U1`).
2. Read `.pipeline-attestation/content-digest.json`. Absent or unparseable → outcome `undigested`.
3. Compare the recorded `contentSha256`, `manifestSha256`, `plugin.name` and `plugin.version`
   against the observed snapshot. (Steps 3 and 4 of the withdrawn signed design — pin verification
   and `verifyAttestation` — are dropped; §I.2.3(e), §I.2.7.)
4. Outcomes: all match → `{ attempted: true, failed: false }`; any mismatch or rejected snapshot →
   `{ attempted: true, failed: true }`; no digest file → `{ attempted: false, failed: false }`
   (`undigested`).

**Status handling.** `failed: true` feeds the same `attestationFailed` term the git path already
uses, landing in the existing `"plugin-refresh-required"` branch with the advisory `nextAction`
(`pipeline-start-preflight.mjs:333-344`, exit `0`). No new status, no new exit code — constraint 3
satisfied by reuse, not by promise.

**Rollout — two steps, and what became of the first revision's three.**
- *Step 1:* client comparison plus the `undigested` skip. Behaviour change for existing installs:
  none — no release carries a digest file yet, so every installed copy is `undigested`.
- *Step 2:* the release procedure emits the digest file (a script run, no key, no human act). From
  then on a genuine release compares clean and a drifted copy lands in the advisory branch.
- *Withdrawn:* the first revision's **stage 2** (releases are signed) is dropped outright — it is
  the refused commitment (§0.5 point 3) and it buys nothing (§I.2.3e). Its **stage 3** (treating the
  no-anchor outcome as a failure) is unchanged in status: still explicitly out of scope, still a
  later PO decision needing real deployment data, and now additionally weaker, because a party who
  can write in the subtree deletes the digest file rather than forging it (§I.2.4, class A′).

**Guarantee statement, deliberately narrow.** After step 2 this proves: the installed subtree's
content hash and manifest hash match the values recorded for this plugin name and version by
whoever produced the copy. It proves **nothing about who produced it**, it does **not** prove
freshness (an older release compares clean against its own digest), and it is **not** a defence
against any party able to write inside the installed subtree — which today includes an agent
session through the shell lane (§I.2.3c). Its one honest claim is class B: drift nobody maintained
the anchor for.

**Marginal value, stated rather than assumed.** The readiness decision already compares the host's
recorded installed version against the manifest version (`pipeline-start-preflight.mjs:296`), which
catches the most common real accident — a stale or half-refreshed install sitting at a different
version. R2-min-A adds exactly one case on top of that: **same version, different bytes** (an
interrupted copy, a leftover file from a previous version, an un-anchored hand-edit). That case is
real and it is small. Against it stand a full-subtree hash on every bootstrap in the installed
topology, one new export plus an optional parameter on a `SNT-A2-*` code path, a release-side script,
and the U4 risk of OBS-1. This design recommends building it, but puts the "is that worth it?"
question to the PO explicitly (§I.2.10 item 2) rather than presenting the answer as obvious.

#### I.2.6 The provenance lever (R2-min-B) — promoted by the threat-model correction

`installedPipelineIdentityCodex` already reads the host's own record of *where the installed copy
came from* (`entry.marketplaceSource.sourceType`, `pipeline-start-preflight.mjs:94-97`) and throws
away `entry.marketplaceSource.source`. If — `ASSUMPTION U3` — a git-sourced record carries the
marketplace URL in that field, an offline **origin** check for the installed topology is available
almost for free: compare it against `PUBLIC_SELF_APPLICATION_ORIGINS`, the same allowlist GS-8
already protects. That would attest *where the copy came from* without attesting *what it now
contains*, so it complements R2-min-A rather than replacing it.

**What changed on 2026-08-07.** The first revision disclosed this lever and declined to recommend
it, on the grounds that it was neither of the two directions the PO put in front of the design.
Under §0.5 it is now the *better* of the two things still on the table, for one structural reason:
its observed value comes from the host's plugin registry, which sits **outside** the attested
subtree and outside the project root, and its expected value is the GS-8-protected allowlist
(`guard-gate-strength.mjs:93-97`). It is the only check on offer whose input is not inside the bytes
it is judging — the exact property §I.2.3(d) shows every in-tree pin to lack. A write to that
registry is refused as a cross-repository mutation in the write lane
(`guard-lifecycle-ready.mjs:920-924`), though it carries the same shell-lane residual as everything
else (finding SL-1, §I.2.3c). It costs no key, no release step and no human act, so §0.5 point 3 is
satisfied trivially.

**Still not designed here, and honestly bounded.** Its premise U3 could not be verified in the
authoring session (the only host registry observable there records a `directory` source, and no
Codex host plugin list was available), so it is OBS-1 item 3. It cannot survive a party who rewrites
the comparison code in-tree, so it is a class-D *label*, not a gate. If OBS-1 confirms U3, this
becomes R2's preferred first implementation step — ahead of R2-min-A — and needs its own small
design pass for the Claude-host equivalent of the Codex record.

#### I.2.7 Exact file-level implementation inventory (R2)

| File | Change |
| --- | --- |
| `plugins/pipeline-core/lib/public-core-observation.mjs` | add the exported `observeInstalledContentIdentity` of §I.2.5 step 1; add one optional exclusion parameter to `snapshotPluginRoot` (`:250`), defaulting to no exclusion. `observe()`, `observePublicCoreIdentity`, `observeCodexPublicCoreIdentity` and every `SNT-A2-*` code path stay unchanged. |
| `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` (from R1) | replace the "no `.git` → skip" branch with the installed-copy comparison of §I.2.5; export the three outcomes. |
| `plugins/pipeline-core/scripts/release-content-digest.mjs` | **new**, and far smaller than the withdrawn `release-attestation.mjs`: snapshot the subtree excluding the digest path and write `.pipeline-attestation/content-digest.json`. No key, no signing request, no proof, no envelope — one deterministic build step. |
| `plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md` | extend the `"plugin-refresh-required"` entry Part A adds so it names the installed-copy attestation failure as one of its causes. |
| `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md` | repoint §A.1 limitation 1, §A.5 case 2 and §A.7's first bullet at this document per §0.3. Markdown only. |
| tests | `public-core-observation.test.mjs`: additions for the new export (no edits to existing assertions). `self-application-attestation-gate.test.mjs`: the cases in §I.2.8. New `release-content-digest.test.mjs` for the emitter's determinism and its exclusion of the digest path. |

**The whole inventory above is gated on OBS-1 (§I.2.5) and on §I.2.10 items 1–2.** It is what to
build *if* the PO confirms building it; it is not a green light on its own.

**Withdrawn from the first revision's inventory** — dropped by the 2026-08-07 threat-model
correction, recorded here rather than deleted so the change is auditable:

| Dropped | Why |
| --- | --- |
| `plugins/pipeline-core/lib/public-core-release-trust.mjs` (the pinned `{ keyReference, publicKeySha256 }` module) | a pin shipping inside the artifact it anchors adds no adversary-resistance (§I.2.3e); moving it outside needs the key §0.5 point 3 refuses. |
| `GS-10` in `guard-gate-strength.mjs` | there is no pin module left to protect. GS-9 (R1) is unaffected. |
| `plugins/pipeline-core/scripts/release-attestation.mjs` (`plan`/`apply`, detached signature) | its whole purpose was stage 2's signing commitment. Replaced by the far smaller `release-content-digest.mjs`. |
| the `keyReference`/`publicKey`/`signatureBase64` envelope and the `verifyAttestation` call (`provenance-attestation.mjs:16-25`) | §I.2.3(e). `provenance-attestation.mjs` itself is untouched — simply not recruited by R2. |
| the first revision's *stage 2* (releases are signed) and the release key it required | §0.5 point 3, and §I.2.3(e) independently. |
| `ASSUMPTION U5` (the release key is Ed25519) | retired with the signature; kept in §III.3 with its reason rather than removed. |

#### I.2.8 Test/verification approach (R2)

Fixtures are directory trees in a temp dir — the existing `.git`-presence tests already build both
shapes (`pipeline-start-preflight.test.mjs:571-591` for the git fixture, and a no-`.git` fixture for
the F2/F4(c) cases at `:607`/`:625`), so the non-git fixture pattern is established, not new.

- No digest file → `undigested`; `status` identical to today's (`"ready"` for a matching version).
  This is the regression test that step 1 changes nothing for existing installs.
- Matching digest over the fixture → `failed: false`, `status` unchanged.
- One byte changed in any file after the digest was emitted → `failed: true` → `status:
  "plugin-refresh-required"`, `nextAction.kind === "advisory"`, exit code `0`.
- Digest naming a different `plugin.version` than the manifest → `failed: true`.
- A digest file whose own path was not excluded from the snapshot → the emitter's test must show
  this is impossible by construction, not merely unobserved.
- Malformed/truncated digest JSON → `failed: true`, never a thrown exception: the observers'
  fail-closed-internally contract (`public-core-observation.mjs:354-356`) must hold for the new
  export too.
- The git topology's existing behaviour is unchanged: all Part-A attestation tests pass unmodified.

#### I.2.9 Acceptance criteria (R2)

- **AC-R2-0** OBS-1 (§I.2.5) has been measured and its three answers recorded, and §I.2.10 items 1–2
  have PO answers, **before** any implementation dispatch starts.
- **AC-R2-1** With no digest file present, a non-git fixture produces exactly today's `status` and
  `nextAction` — proven by a test that fails if the outcome changes.
- **AC-R2-2** A drifted non-git fixture (digest present, one byte changed) yields `status:
  "plugin-refresh-required"`, `nextAction.kind === "advisory"`, exit code `0` — never
  `"plugin-identity-unavailable"` and never exit `2`.
- **AC-R2-3** The implementation introduces **no key, no signature and no pin**: no reference to
  `verifyAttestation`, no `publicKeySha256` constant, no new `GS-` entry for R2, and no new
  human-facing release ceremony. A diff that reintroduces any of them contradicts §0.5 point 3 and
  is a stop condition, not a judgement call.
- **AC-R2-4** `observeInstalledContentIdentity` never throws for malformed input; every failure is a
  typed `rejected` result.
- **AC-R2-5** `GATE_STRENGTH_PATHS` is unchanged by R2 — GS-9 (R1) remains the only addition this
  package makes to it; GST17 passes unmodified.
- **AC-R2-6** No machine-specific path and no host identifier appears in any committed file, and the
  emitted digest file contains only the four fields of §I.2.5.
- **AC-R2-7** Every pre-existing Part-A attestation assertion passes unmodified.
- **AC-R2-8** The three Part-A passages of §0.3 point at this document.
- **AC-R2-9** The project's configured verify gate is green.

#### I.2.10 Open questions for the PO (R2)

Rewritten 2026-08-07. The first revision's item 1 (will the PO hold a release key and sign each
release?) is **withdrawn, not deferred**: §0.5 point 3 answers it *no*, and §I.2.3(e) makes the
answer moot. Its item 2 (where the pin lives) is **closed the same way**: both placements are gone
with the pin. They are recorded here as answered rather than deleted.

1. **Does the PO confirm the partial reinstatement of direction 3?** This is the decision this
   re-derivation actually needs. Under §0.5, classes C and D-as-a-gate (§I.2.4) cannot be closed by
   anything this design may build, so for those the item's direction 3 — "accept the residual as an
   explicit, permanent scope boundary" — becomes the correct final answer, while the PO's override
   of direction 3 continues to hold for class B. The override was the PO's; only the PO can
   partially reinstate what it set aside.
2. **Is R2-min-A worth building at all?** Its whole marginal value over today's behaviour is the
   "same version, different bytes" case (§I.2.5), against a full-subtree hash per bootstrap, a new
   export on a `SNT-A2-*` path, a release-side script, and U4's risk of a permanent false failure.
   **"Build nothing and record the boundary" is a legitimate answer here** — it is direction 3 in
   full, and this design says so plainly rather than manufacturing a mechanism to fill the gap.
3. **OBS-1 first (§I.2.5).** One observation on a real marketplace install answers U4, U2 and U3.
   If U3 holds, R2-min-B (§I.2.6) is the preferred first step, ahead of R2-min-A. Nothing in the
   implementation inventory (§I.2.7) should be dispatched before this measurement exists.
4. **The former stage 3** — treating the no-anchor outcome as a failure — stays a separate, later
   PO decision, unchanged in status and now additionally weaker (§I.2.5).
5. **Finding SL-1 needs its own backlog item and its own T1 review.** §I.2.3(c) reports that no rule
   in the guard family names the live plugin root on the shell lane, and that the compensating
   control its own comment cites (`guard-lifecycle-ready.mjs:202-204`) is an enumerated list that an
   interpreter write is not on. That is guard code and a separate subject: it is **not** designed,
   fixed or worked around here, and no part of R2 should be justified by it. It is reported because
   the honest answer to "can an agent alter the live plugin copy?" is "not through the write lane,
   and through the shell lane nothing says otherwise".

### I.3 Coupling and sequencing of R1 and R2

1. R2's code changes land **in the module R1 creates**. Once GS-9 is enforcing — after the plugin
   refresh that follows R1's landing (§I.1.6) — no agent session can edit that module at all; only a
   PO hand-edit outside an agent session can. **Therefore: land R2 before the refresh that makes
   GS-9 enforcing, or accept that R2's gate-module work becomes a PO hand-edit.** The same applies
   to GS-10 and `public-core-release-trust.mjs`. This is the one hard ordering constraint between
   the two packages, and it is a consequence of the guard family's own design, not a preference.
   *(Updated 2026-08-07: the GS-10/pin-module half of this sentence is moot — §I.2.7 withdraws both.
   The constraint itself is unchanged and still binds, because R2-min-A still lands its code in the
   GS-9-protected module R1 creates.)*
2. R1's "behaviour-preserving" claim covers the *move* only. R2 then deliberately changes behaviour
   on the non-git branch. Reviewing them as one diff would blur the two claims; the recommended
   split is two implementation dispatches and two Critic passes, ordered R1 → R2 with no plugin
   refresh in between.
3. If the PO prefers to refresh between them, R2's inventory must be re-scoped to a PO-hand-edit
   step for the gate module. Stating this now avoids discovering it as a blocked write mid-dispatch.

---

## Part II — R3: dispatch templates cite restructured operating-model sections

### II.1 Problem, re-derived from the operating model's actual structure

**Status: re-derived 2026-08-07 (`Dispatch: PHX-R3-RESCOPE`). Supersedes the first revision's
inventory**, which measured only the two dispatch templates and therefore reported a defect of 8
citations in 2 files where the repository has 344 in 57. Nothing below is inherited from that count;
the structure was re-read and the inventory re-derived by an attribution-aware scan over every
tracked file (§II.8). The first revision's two substantive findings (the "light" profile and the
"trigger matrix") survive verbatim and are kept at the end of this section.

#### II.1.1 The measured structure of `docs/operating-model.md`

Read directly, English part only (`:1-322`; the German reference-translation marker is at `:323`,
the file is 671 lines and everything below the marker is the German reader copy):

- **10 `##` sections, all numbered 1–10:** §1 `:16` *What the model protects* · §2 `:38` *Roles and
  boundaries* · §3 `:57` *V3 routing: profiles, duties and phases* · §4 `:87` *The lifecycle* ·
  §5 `:164` *Rigor, risk and gates* · §6 `:227` *Evidence, review and recovery* · §7 `:244`
  *Project calibration and extensions* · §8 `:280` *Operating shapes* · §9 `:288` *Authority
  precedence* · §10 `:302` *Glossary*.
- **3 `###` children, none of them numbered:** `### Profiles` `:63` and `### Duties` `:78` (under
  §3), `### Gate discipline and autonomous happy path` `:185` (under §5). §1, §2, §4, §6, §7, §8,
  §9 and §10 have no children at all.

Two consequences follow from the structure alone, and they are the reason the inventory has to be
counted twice rather than once:

1. **There is no `§N.M` anywhere in the document.** Every `§N.M` citation of the operating model, in
   any file, is dead by construction — it cannot be repaired by picking a better minor number.
2. **The `##` numbering is not stable across the restructuring, and the shift is not a constant
   offset.** Reconstructed from the surviving citation topics (`CLAUDE.md:27`, `roles/elephant.md:273`
   and `templates/CLAUDE.project.md:4` each preserve an old topic label next to its old number), the
   old numbering was roughly §3 SDLC · §4 review system · §5 session lifecycle · §6 handover ·
   §7 feedback loop · §8 project calibration. Today §3 is V3 routing, §4 is the lifecycle, §5 is
   rigor/risk/gates, §6 is evidence/review/recovery, §7 is project calibration, §8 is operating
   shapes — and handover, the feedback loop/retro and session lifecycle no longer have a section of
   their own at all (handover and retro are now lifecycle step 8, `:160-162`). So a `§N` citation
   written before the restructuring still *resolves*, and now points at different content. That is a
   second, distinct defect, and it is invisible to any check that only asks "does the target exist?"

#### II.1.2 Two defect kinds — they need different fixes

| Kind | Definition | How it is detected | How it is repaired |
| --- | --- | --- | --- |
| **A — target does not exist** | a `§N.M` (no numbered subsection exists), or a `§N` outside 1–10 | mechanically: the token's shape against the measured structure | must be re-pointed at a section, a `###` title or a different file; there is nothing to renumber to |
| **B — target exists, description is wrong** | a `§N` that resolves to an existing `##` section whose heading does not match the topic the citing line states (`review system (§4)` → §4 is *The lifecycle*) | only by reading the citing sentence against the heading | re-point at the section that now carries the topic |

Kind A is what the backlog item and the first revision of this section describe. **Kind B is
undetectable by any mechanism currently in the repository, is roughly a third of the defect by
volume, and is the more dangerous of the two** — a dead `§2.4` announces itself to a reader, whereas
`review system (§4)` sends an agent to a section that reads plausibly and is about something else.

#### II.1.3 Measured inventory (attribution-aware, whole repository)

Method (§II.8): every tracked file was scanned for `§N`/`§N.M` tokens; each token was attributed to
the **nearest preceding document reference on its line**, so a line citing two documents does not
inflate the operating-model count; tokens below a file's own German-reference marker are counted
separately as the German mirror of the same defect. One verified false positive was dropped by hand
(`roles/critic.md:190` `§3` is a self-reference to that file's own §3).

**Totals: 344 operating-model section citations across 57 tracked files** — 230 of kind A, 114 that
resolve. Of the 114, the 68 that sit in live artifacts (i.e. outside `specs/`/`backlog/`) were
topic-checked one by one against the measured headings: **51 are confirmed kind B**, 5 are correct,
11 state no topic at all (a bare number in a reference list — not adjudicable from the citing text),
1 is a meta-note *about* this defect (`docs/state.md:700`).

| Class | Files | A | B (resolves) | Notes |
| --- | --- | --- | --- | --- |
| **C1 the two dispatch templates** — R3's scope today | 2 | 8 | 0 | `critic-review.md` 4, `goldfish-task.md` 4 |
| **C2 other prompt templates** | 3 | 6 | 3 | `elephant-kickoff.md`, `kickoff-new-project.md`, `session-bootstrap-check.md` |
| **C3 role contracts** | 3 | 39 | 9 | `elephant.md` 23+9, `critic.md` 10, `goldfish.md` 6 |
| **C4 root canon** | 2 | 4+1 de | 8 | **`CLAUDE.md` 3 + 8**, `README.md` 1+1 de |
| **C5 harness** | 8 | 41+6 de | 14+4 de | `review-protocol.md` 12, `definition-of-done.md` 12, `session-bootstrap.md` 20 |
| **C6 guardrails + policies** | 5 | 20+5 de | 4+2 de | `global.md` 7, `model-policy.md` 14 |
| **C7 project-facing templates** | 9 | 17 | 17 | `spec.md` 8, `CLAUDE.project.md` 9, `pipeline.json.example` 5 |
| **C8 shipped plugin artifacts** | 7 | 16 | 8 | `close-block/SKILL.md` 11, `critic-review/SKILL.md` 4, 4 agent files, `guard-git.mjs` 5 |
| **C9 docs (ADR / state / deploy)** | 10 | 22+15 de | 5+4 de | dated records, see §II.6 |
| **C10 archival (specs / backlog)** | 8 | 30 | 36 | includes this document's own 43 quotations of the defect |

Named instances, each confirmed by reading the file (not by trusting a search hit):

**Kind A —**
- `templates/prompts/critic-review.md:5` OM §2.4 · `:6` §4.2 · `:142` §2.3 · **`:215` `OM §3.3`**
  — the fourth was missed by the first revision *and* by the backlog item because both searched for
  the string `operating-model`, and this line uses the `OM §` shorthand. See AC-R3-1.
- `templates/prompts/goldfish-task.md:5` §2.3 · `:7` §2.3 · `:15` §3.2 step 4 · `:129` §3.3.
- `roles/goldfish.md:7` §2.3 · `:103` §3.3 · `:126` §2.3, §3.2, §4.1, §4.3 — six dead citations in
  the file §II.2 makes the canonical carrier the templates are to cite.
- `roles/critic.md:10` §2.4, §4.2 · `:72` §3.3, §4.2 · `:138` §3.3 · `:190` §4.2 · `:211` §2.4,
  §4.2, §4.3, §3.4.
- `harness/review-protocol.md:5` §4.3 · `:22` §4.3 · `:35` §4.2 · `:53` §3.3, §4.2 · `:58` §4.2 ·
  `:140` §2.4 (inside a heading) · `:161` §2.4 · `:188` §3.4 · `:206` §4.3 · `:213` §4.2.
- `CLAUDE.md:20` §2.3 · `:22` §5.1 · `:44` §5.2.

**Kind B —**
- `CLAUDE.md:27` — `SDLC (§3), review system (§4), session lifecycle (§5), handover (§6), feedback
  loop (§7), project calibration (§8)`: six labelled citations, six wrong topics, in the file every
  session in this repository loads. Only `roles (§2)` is right.
- `roles/elephant.md:273` — the same six-way shift in the Elephant contract's reference list;
  `:247` cites §5 for "lifecycle self-management" (§5 is rigor/risk/gates, the lifecycle is §4).
- `harness/session-bootstrap.md:171`, `:175`, `:397` cite §8 for the calibration field sketch
  (calibration is §7; §8 is *Operating shapes*); `:398` cites §6 for the handover.
- `harness/review-protocol.md:5` — "Operationalizes `docs/operating-model.md` §4 (review system)":
  §4 is *The lifecycle*.
- `templates/retro.md:4`, `:22`, `:37` cite §7 for the feedback loop (§7 is project calibration).
- `plugins/pipeline-core/skills/close-block/SKILL.md:94` §8 for calibration, `:123`/`:142` §7 for
  the CLAUDE.md length gate and the self-retro; `plugins/pipeline-core/hooks/guard-git.mjs:7`/`:134`
  §8 for calibration.
- `harness/scripts/check-claude-md-lines.mjs:59` puts `(operating-model §7)` into the **user-facing
  fix string the gate prints** — the only instance that reaches an operator through a tool's output.

Two findings from the first revision, re-verified and unchanged:

- **The word "light" as a dispatch profile has no counterpart in `operating-model.md` at all.** Its
  single occurrence, `:96`, is "for work above the light path" inside lifecycle step 3. So
  `goldfish-task.md:129` cannot be repointed; the nearest genuine content is §3 `### Duties`
  (`:78-85`), which names `implement`/`mechanic`/`deep` — the routing concept behind
  `goldfish-implementor`/`goldfish-mechanic`, but not the light/standard report shape.
- **The "trigger matrix" is not in `operating-model.md` and never was under that name.** It is
  `harness/review-protocol.md` §2.1 "Trigger decision table" (`:33`), rows T0–T6 at `:39-47`, with
  the canonical trigger wording quoted at `:53-55`. The backlog item's proposal to repoint this at
  OM §5 is therefore imprecise: §5 (`:164-183`) carries rigor/risk/gates in general, but the actual
  table the templates mean lives in `harness/review-protocol.md`.

One correctness note carried from the first revision: `templates/prompts/critic-review.md:15` cites
`review-protocol.md §2.1` with an **incomplete path** (the file is `harness/review-protocol.md`;
§2.1 `:33` is correct). It is not an operating-model citation and is not counted above; it is listed
in §II.4 because the same edit pass touches that line.

### II.2 Decision — where the six-field briefing list canonically lives

The three disclosed options rest on a premise that direct reading refutes. The list does **not**
live only in `templates/prompts/goldfish-task.md`. There are three carriers today:

1. `roles/goldfish.md:23` (GF-01) — "the 6-field briefing (Goal · Context files · DoD checks ·
   Prohibitions · Stop conditions · Dispatch metadata)". Normative, named, complete.
2. `templates/prompts/goldfish-task.md:6-7` — the same six, one name differing ("Forbidden" vs
   "Prohibitions").
3. `docs/operating-model.md:144-146` (§4, lifecycle step 5, "Dispatch") — "Give a Goldfish one
   outcome, exact context paths, DoD checks, prohibitions, stop conditions and route metadata": the
   same six items, in the same order, under different words. The backlog item's grep missed it
   because it searched for "briefing"/"six field", and this passage uses none of those words. The
   claim "not present in `operating-model.md` at all" is therefore **too strong**: the *named
   canonical field list* is absent; the *substance* is present and normative.

**Decision: option (c), in the form that adds no new file — `roles/goldfish.md` §2 (GF-01) is the
canonical carrier.** `roles/` is already the repo's home for role contracts (CLAUDE.md, "Role
contracts live in `roles/`"), GF-01 already names all six fields normatively, and it is already
what every Goldfish briefing quotes. The template's source-of-truth line points there;
`operating-model.md` §4 step 5 stays exactly as it is, as the lifecycle-level statement of the same
duty. No new file, no restructuring of a normative document, one authoritative carrier and one
lifecycle mention that agrees with it.

Rejected, with tradeoffs:

- **(a) Restore a canonical briefing-field section to `docs/operating-model.md`.** It would restore
  the citation literally, but it means editing the normative core to add a fourth statement of a
  list that already exists twice, and `operating-model.md` is deliberately terse at that level (its
  §4 step 5 states duties, not artifact formats). It also does not remove the drift risk: a new
  numbered section is exactly the kind of thing the next restructuring renumbers.
- **(b) Declare `templates/prompts/goldfish-task.md` the carrier and delete the outbound claim.**
  Smallest change, but it makes a fill-in template the normative source of a role contract, and it
  leaves `roles/goldfish.md` GF-01 — which is normative and *is* read by Goldfish agents — as an
  uncited duplicate. Worse: a template is copied and adapted per dispatch, which is precisely the
  property a canonical source must not have.
- **(c) with a new file under `docs/`.** Adds a fourth carrier to a defect whose cause is having
  three. Rejected for that reason alone.

**Consequence 1 to carry into implementation:** the template's field name "Forbidden"
(`goldfish-task.md:6`) and GF-01's "Prohibitions" must be reconciled — one of the two, used
everywhere. Recommendation: keep GF-01's "Prohibitions" as canonical and note "(Forbidden)" once in
the template, because the operating model's §4 step 5 also says "prohibitions".

**Consequence 2, measured by the 2026-08-07 re-derivation and not visible to the first revision:**
`roles/goldfish.md` — the file this decision promotes to canonical carrier — **carries six dead
operating-model citations of its own** (`:7` §2.3, `:103` §3.3, `:126` §2.3/§3.2/§4.1/§4.3;
§II.1.3). Promoting it while leaving those in place makes the newly-declared source of truth a
carrier of the exact defect R3 exists to remove, and the §II.5 inventory's "at most one sentence" in
that file does not cover them. The decision itself is unaffected — `roles/` is still the right home
and GF-01 is still the complete, normative list — but **the scope options in §II.6 that exclude
`roles/goldfish.md` are inconsistent with this decision**, and that is one of the two facts the
boundary call has to weigh.

### II.3 Decision — should section numbers be cited at all

**Status: re-examined 2026-08-07 against the repository's own anchor data. The answer to the
question stays "no". The *justification* the first revision gave for it — "anchor links are
machine-checked, therefore this defect class becomes non-recurring" — is refuted by measurement and
is withdrawn.** The first revision reasoned from the checker's source; this one reasoned from the
links that already exist.

#### II.3.1 What the checker does, and what it does not do

`harness/scripts/check-doc-contracts.mjs` validates Markdown links and their fragments: it collects
heading anchors (`collectAnchors`, `:160-188`), resolves every relative link target (`:414-433`),
and reports "anchor not found" when a fragment does not resolve (`:445-455`). It does **not**
validate prose `§N.M` references, and it does not validate backticked path citations — nothing in
the repository does. Two properties the implementation must respect, both measured rather than
assumed: the extractor does not exempt inline-code spans, so even an *example* link written inside
backticks is resolved and must be correct; and destinations are resolved relative to the citing
file, so the same citation needs a different `../` depth in `templates/prompts/` than in `roles/`.
The extractor is line-based with no HTML-comment handling, so links inside the templates'
`<!-- ... -->` header blocks are validated exactly like body links.

**On the current tree the gate reports `490 Markdown file(s), 776 link(s), 13 anchor check(s)` and
exits 0.** Thirteen. The anchor check is not a broad safety net; it is whatever fragments happen to
have been written as links, and today that is 13 out of 776 links and 0 out of 344 section
citations.

#### II.3.2 The measured refutation: the anchor form has already drifted, green

Five of those 13 fragment links point at `docs/operating-model.md`, all from `backlog/README.md`
(`:16`, `:35`, `:54`, `:68`, `:77`). **Four of the five name a heading that no longer exists**, and
the gate is green anyway:

- `#7-feedback-loop` (`backlog/README.md:16`, `:54`, `:68`) resolves only through a hand-planted
  `<a id="7-feedback-loop"></a>` at `docs/operating-model.md:563` — which sits above the **German**
  `## 6. Evidenz, Review und Recovery` (`:565`), i.e. above neither a feedback-loop section nor an
  English one.
- `#8-projekt-kalibrierungsschicht` (`:77`) resolves through the same trick at
  `docs/operating-model.md:583`, above the German `## 7. Projektkalibrierung und Erweiterungen`.
- Only `#6-evidence-review-and-recovery` (`:35`) is genuinely correct.

Those two `<a id>` tags are the only ones in the whole repository outside the checker's own tests.
They are a compatibility alias for exactly the drift R3 is about, and their effect is that a stale
citation stays green forever. **The mechanism the first revision proposed as the fix is already
deployed on this document, has already drifted, and did not go red.** A design cannot recommend a
control whose one existing deployment demonstrates the opposite of the claim made for it.

Three further measured properties of the anchor namespace, all from `collectAnchors` run over
`docs/operating-model.md`:

1. **31 anchors for 20 headings.** English and German slugs share one flat namespace, so
   `#4-the-lifecycle` and `#4-der-lifecycle` are both valid and nothing marks one as the normative
   half. A citation can silently resolve into the German reference translation that CLAUDE.md's
   bilingual skip convention forbids agents to read.
2. **Collision suffixes are silent.** The document contains `duties` and `duties-1`, `profile` and
   `profiles`, `agent-pipeline-operating-model-v3` and `-1`. A link to `#duties` resolves to
   whichever came first; a later edit that adds a heading can move which one that is, without any
   check firing.
3. **A slug carries whatever is in the heading, including a stale citation.**
   `harness/review-protocol.md:140` is `### 2.4 Findings format (transfer format 3, OM §2.4)`, so
   its slug is `#24-findings-format-transfer-format-3-om-24`. Citing that slug — which the first
   revision's §II.4 did — pins the stale reference into the link, and correcting the heading breaks
   every link that pinned it.

#### II.3.3 Revised remedy

1. **Do not cite section numbers of `docs/operating-model.md` — cite the file plus the stable
   heading title** ("`docs/operating-model.md`, *Evidence, review and recovery*"). This half of the
   first revision's answer is confirmed and strengthened: numbers are dead (kind A) or misleading
   (kind B), and the title is what survives a renumbering and what a reader can actually find.
2. **A Markdown link may be added for convenience** — destination spelled relative to the citing
   file, English slug only, each slug confirmed against `collectAnchors` by running the gate rather
   than by assuming GitHub's convention. It is a convenience, **not the control**: per §II.3.2 it
   proves only that some string exists somewhere in the file, including in the German half and
   including via an alias.
3. **The class only becomes non-recurring with a checker that validates the citation itself.** Two
   candidate shapes, both code, both outside R3's stated scope, both needing their own briefed task
   and Critic pass, neither designed here: **(i)** a lint that fails on any `§N`/`§N.M` reference to
   `docs/operating-model.md` in non-archival paths — this is the one that mechanically closes the
   class, and it is cheap because the target set is exactly the inventory of §II.1.3; **(ii)**
   anchor hygiene in `check-doc-contracts.mjs` — reject alias `<a id>` anchors and cross-language
   slug resolution in bilingual documents, so a fragment link means what §II.3.1 claimed it means.
   Both are recorded as follow-up items in §II.6, not folded into R3 by this document.
4. **Falsifiability requirement for the implementation, corrected.** Deliberately break one fragment,
   confirm `node harness/scripts/check-doc-contracts.mjs` exits non-zero, restore it, confirm exit 0.
   State plainly what that proves: **that fragment checking runs at all** — not that any citation is
   correct, and not that the inventory is complete. `check-doc-contracts.mjs` exiting 0 is not
   evidence about `§N.M` prose or backticked path citations, because it never looks at them.

### II.4 Exact corrected references (the two dispatch templates)

Revised 2026-08-07: citations are given as **file + stable heading title**, per §II.3.3; where an
anchor slug is named it is the optional link half, and the implementation must confirm it against
`collectAnchors` (`check-doc-contracts.mjs:160-188`) by running the gate, never by assuming
GitHub's convention. This table covers scope option **B1** only; options B2/B3 (§II.6) add the
corresponding tables for the further files, which this document does not pre-write because the
boundary is undecided.

| Location | Replace with |
| --- | --- |
| `critic-review.md:5` | Critic contract: `docs/operating-model.md` — *Roles and boundaries* (the roles table's Critic row, `:45`) **and** *Evidence, review and recovery* (`:233-236`); report format: `harness/review-protocol.md` §2.4 *Findings format*. Do **not** pin the current slug of that heading: it contains the stale `OM §2.4` (§II.3.2 item 3), so either the heading is corrected in the same package or the citation stays title-only |
| `critic-review.md:6` | trigger decision table: `harness/review-protocol.md` §2.1 *Trigger decision table* (`:33`); drop "canonical German trigger wording" — the canonical wording quoted at `harness/review-protocol.md:53-55` is English (ADR-0011 makes this Public Core English-canonical), and the `docs/operating-model.md §3.3/§4.2` word-identity claim in that same line is itself stale (§II.7) |
| `critic-review.md:15` | keep the §2.1 reference — it is correct — but with the full path `harness/review-protocol.md`; add §2.3 *Isolation levels* (`:74`) for T-row semantics. This is a path repair, not an operating-model citation |
| `critic-review.md:142` | "Dispatch metadata (`roles/goldfish.md` GF-01 field 6, critic variant)" — per §II.2 |
| **`critic-review.md:215`** | `OM §3.3` → `docs/operating-model.md`, *Rigor, risk and gates* (rigor 0, `:170`) — the stage-0 fast-path *criteria* the line relies on (≤ 2 files, ≤ ~25 diff lines, no architecture/schema/API/test/guardrail/security surface, trivially revertable) are enumerated in `roles/elephant.md` EL-01's exception bullet (`:35`), not in any numbered operating-model subsection — and that bullet cites `§3.3` itself, so it is part of the same defect. **Not in the first revision's table and not in the backlog item**; found only by searching for `§` rather than for the string `operating-model` |
| `goldfish-task.md:5` and `:7` | "Source of truth: `roles/goldfish.md` GF-01 — the canonical six-field briefing list" (optional link `../../roles/goldfish.md#2-input-contract`; that slug was confirmed to exist) |
| `goldfish-task.md:15` | the briefing-format duty is `roles/goldfish.md` GF-01/GF-02 (`:21-31`) plus `docs/operating-model.md` *The lifecycle* step 5 (`:144-146`); there is no "§3.2 step 4" |
| `goldfish-task.md:129` | drop the `§3.3` citation. The light/standard *dispatch* profile is defined by the template and `roles/goldfish.md` §6 (`:86`); the nearest operating-model concept is *V3 routing* → `### Duties` (`:78-85`), which is about `implement`/`mechanic`/`deep`, not the report shape. Cite Duties for the routing half and `roles/goldfish.md` §6 for the report half — do not invent a section for the rest |

`goldfish-task.md:8` (`harness/session-bootstrap.md` §6.2 → `:298`), `critic-review.md:7` (§6.3 →
`:308`) and `goldfish-task.md:160` (`roles/goldfish.md` §6 → `:86`) were re-checked and are correct;
they are not to be touched.

### II.5 Inventory, tests, acceptance criteria (R3)

The inventory below is written for scope option **B1** (§II.6), because that is the option the
backlog item's literal wording names. **It is not a green light: §II.6 is an open PO decision, and
B2/B3 extend this table file by file from §II.1.3.** The acceptance criteria are written so that
they hold under whichever option is chosen.

| File | Change |
| --- | --- |
| `templates/prompts/critic-review.md` | **five** citation lines per §II.4 (`:5`, `:6`, `:15`, `:142`, `:215`) — the first revision said four |
| `templates/prompts/goldfish-task.md` | four citation lines per §II.4 (`:5`, `:7`, `:15`, `:129`); reconcile "Forbidden"/"Prohibitions" per §II.2 |
| `roles/goldfish.md` | **at most one sentence** in §2 marking GF-01's list as the canonical carrier the templates cite. No renumbering, no restructuring. **Under B1 this file keeps its own six dead citations** (§II.2 consequence 2) — a disclosed inconsistency of B1, not an oversight. |

Verification is the existing gate: `node harness/scripts/check-doc-contracts.mjs` exits 0, plus the
deliberate-break falsification of §II.3.3 item 4. There is no unit test for prose citations and this
design does not invent one — which is precisely why §II.3.3 item 3 records the lint as a follow-up
rather than pretending the gate covers this.

- **AC-R3-1** No `§N`/`§N.M` reference to `docs/operating-model.md` remains in any file the chosen
  scope admits. **The check must search for the section sign, not for the string `operating-model`:**
  `rg -n "§" <scope paths>` and `rg -n "OM §" <scope paths>`. Searching for `operating-model` is what
  made both the backlog item and the first revision of this section miss
  `templates/prompts/critic-review.md:215`, and it is not an acceptable verification of this AC.
- **AC-R3-2** Every citation added is a file + heading-title reference with no number; an optional
  Markdown link may accompany it, with an English slug confirmed by running the gate. A link alone
  does not satisfy this AC (§II.3.2).
- **AC-R3-3** `node harness/scripts/check-doc-contracts.mjs` exits 0, and has been observed exiting
  non-zero for a deliberately broken fragment in the same files. The implementation report states
  what that proves and what it does not (§II.3.3 item 4).
- **AC-R3-4** Both templates still contain all six field names and the "never freehand" contract
  intact — this is a citation repair, not a rewrite of dispatch semantics.
- **AC-R3-5** The `roles/goldfish.md` edit is one sentence and changes no rule id (B1); under B2/B3
  the six citations of `:7`/`:103`/`:126` are additionally repaired, still with no rule-id change.
- **AC-R3-6** For every file the chosen scope admits that carries a German reference half
  (`README.md`, `harness/session-bootstrap.md`, `policies/model-policy.md`, `docs/adr/*`), the German
  mirror of each corrected citation is corrected in the same commit, or the file is explicitly
  excluded. A half-corrected bilingual file is a new defect, not a partial fix.
- **AC-R3-7** No file outside the chosen scope is touched, and the implementation report enumerates
  the citations it deliberately left in place with their counts, so the residual stays measurable.

### II.6 The implementation boundary — an open PO decision

The first revision drew no boundary: it fixed two templates and disclosed "four" further citations
in `harness/review-protocol.md` as an open scope call. The measurement changes both halves of that.
The `harness/review-protocol.md` figure is **twelve, not four** (`:5` ×2, `:22`, `:35`, `:53` ×2,
`:58`, `:140`, `:161`, `:188`, `:206`, `:213`), and the same defect class runs through 57 files.
**This design does not choose the boundary.** The choice is the PO's, for the reason the backlog
item already records: `templates/prompts/*.md` and `roles/*.md` are normative dispatch artifacts
under CLAUDE.md's "Dispatch from the template, never freehand" rule, and the volume decides whether
R3 stays a mechanical task or becomes a package. The three defensible options, with what each buys
and costs:

| Option | Scope | Size | What it buys | What it leaves |
| --- | --- | --- | --- | --- |
| **B1 literal** | the two dispatch templates (+ the one sentence in `roles/goldfish.md`) | 3 files, 9 citations | exactly what the backlog item asks for; smallest review surface; matches the Triage's "mechanical" framing | the templates then cite `roles/goldfish.md` (6 dead) and `harness/review-protocol.md` (12 dead) — **it repairs the first hop of a chain whose next two hops are broken**, and leaves `CLAUDE.md` (3 dead + 6 wrong-topic), the highest-traffic carrier in the repo, untouched |
| **B2 citation-chain closure** | B1 + `roles/goldfish.md` (all 6) + `roles/critic.md` (10) + `harness/review-protocol.md` (12) + `CLAUDE.md` (11) | 6 files, ~47 citations | closes every hop an agent traverses when it follows a dispatch template, and makes §II.2's decision coherent (the canonical carrier stops carrying the defect) | everything else: `roles/elephant.md` (32), `harness/session-bootstrap.md` (20), `templates/**`, the shipped plugin. Still a real reduction, still a stated residual |
| **B3 all live agent-facing artifacts** | classes C1–C8 of §II.1.3, both language halves | 39 files, ~232 citations | removes the class from every artifact an agent or a new project actually reads | touches the **shipped plugin** (`plugins/pipeline-core/**`, 7 files — a distribution change with plugin-refresh implications), one `.mjs` (`harness/scripts/check-claude-md-lines.mjs`, incl. an operator-visible fix string), and all nine project-facing templates, which changes what every new project inherits. This is a package with its own Critic pass, not a task |

**Excluded under every option, with reasons — this part is not a decision, it is a boundary:**

- **`docs/adr/**` (C9, 46 citations over 10 files, incl. `docs/state.md` and `docs/deploy/README.md`).**
  ADRs are dated records of what was decided against the document as it then stood; rewriting an
  ADR's `**Basis:**` line rewrites the record. `docs/adr/0003-role-implementation-subagents.md:21`
  already models the correct handling — it says "Historical trigger wording from 2026-07-03 (matched
  the then-current `operating-model.md` §4.2/§3.3)". Recommendation: leave them, and if anything, add
  that same "then-current" framing where it is missing. Not R3's work.
- **`specs/**` and `backlog/**` (C10, 66 citations over 8 files).** Archival. Includes this document,
  whose 43 hits are quotations *of* the defect.
- **The German reference halves as a separate scope.** They are not separately scoped: a bilingual
  file is fixed in both halves or not at all (AC-R3-6).
- **Any change to `docs/operating-model.md` itself.** R3 repairs citations; it does not restructure
  the target. In particular the two alias anchors at `:563`/`:583` are **reported, not removed** —
  removing them turns `backlog/README.md`'s three stale links red, which is a correct outcome but a
  different task with a different blast radius.

**Two follow-up items this re-derivation raises, neither folded into R3 here** (§II.3.3 item 3):

1. **A citation lint** that fails on `§N`/`§N.M` references to `docs/operating-model.md` outside
   archival paths — the only mechanism that would make this class non-recurring. Cheap, because the
   target set is exactly §II.1.3.
2. **Anchor hygiene in `check-doc-contracts.mjs`** — alias `<a id>` anchors and cross-language slug
   resolution in bilingual documents let a fragment link stay green while pointing at the wrong (or
   German) content. That is a gate-honesty defect in the checker, on the same footing as the
   guardrail the repo applies to its other gates, and it is guard/harness code with its own review
   path.

### II.7 Adjacent drift, disclosed and not fixed here

**Corrected 2026-08-07: the first revision reported four citations in `harness/review-protocol.md`.
There are twelve, across ten lines.** The undercount came from searching that file for the string
`operating-model`; six of the twelve use the `OM §` shorthand and one sits inside a heading.
Complete list, each read in the file:

`:5` §4 *and* §4.3 ("Operationalizes `docs/operating-model.md` §4 (review system) and §4.3") ·
`:22` §4.3 · `:35` §4.2 ("normative definitions: OM §4.2") · `:53` §3.3 *and* §4.2 ("word-identical
in `docs/operating-model.md` §3.3/§4.2") · `:58` §4.2 · `:140` §2.4 — **inside the heading**
`### 2.4 Findings format (transfer format 3, OM §2.4)` · `:161` §2.4 · `:188` §3.4 · `:206` §4.3 ·
`:213` §4.2. Eleven are kind A; `:5`'s `§4` is kind B (§4 is *The lifecycle*, not the review
system).

Three things follow that the first revision could not see:

1. **The heading at `:140` is load-bearing twice over.** It carries a stale citation *and* its slug
   (`#24-findings-format-transfer-format-3-om-24`) is what the first revision's §II.4 proposed the
   templates link to. Correcting the heading and pinning its slug are mutually exclusive; §II.4 now
   cites it by title.
2. **This is no longer a two-hop chain but a three-hop one.** `templates/prompts/*` → both
   `harness/review-protocol.md` (12) and `roles/goldfish.md` (6, §II.2 consequence 2) →
   `docs/operating-model.md`. B1 repairs hop one only.
3. The scope call is therefore not a small addendum to R3 but part of the boundary decision itself,
   and it has moved into §II.6 where it belongs. This section no longer makes a recommendation of
   its own; §II.6 option B2 is where these twelve lines are decided.

Two further adjacent observations, recorded and deliberately not acted on:

- **`docs/operating-model.md`'s German half carries a `### H5 Close-Koordinator` heading (`:649`)
  with no English counterpart** — observed from the heading scan alone (the German prose was not
  read, per the bilingual skip convention). An EN/DE structural divergence in the normative document,
  outside R3 entirely, mentioned so the next reader of §II.1.1 does not mistake it for a measurement
  error.
- **`docs/state.md:700` already records this defect** ("`:22` \"operating-model §5.1\", `:44`
  \"§5.2/P5\"; §5 has no numbered children"). It is a note *about* the defect, not an instance of it,
  and it is counted as such in §II.1.3.

### II.8 Verification log for the 2026-08-07 re-derivation (Part II only)

Method and commands actually run. Part I's log stays in §III.4 and is untouched.

- **Read in full:** `docs/operating-model.md:1-322` — the English part only; the German reader copy
  below the marker at `:323` was deliberately **not** read (CLAUDE.md bilingual skip convention), and
  every statement about it in §II.3.2/§II.7 comes from the heading scan and from two `<a id>` lines
  read in place. Also read in full: both dispatch templates' header blocks, `roles/goldfish.md`,
  R3's backlog item, and `harness/scripts/check-doc-contracts.mjs` (`:1-85`, `:150-199`, `:355-460`).
- `rg -n "^#{1,4} " docs/operating-model.md` and `rg -n "DE-REFERENCE-BELOW" docs/operating-model.md`
  → the 10 `##` / 3 `###` / 0 numbered-`###` structure of §II.1.1 and the marker line `:323`.
- **The inventory of §II.1.3** comes from an attribution-aware scan over `git ls-files`: every
  `§N`/`§N.M` token is attributed to the **nearest preceding document reference on its line**, so a
  line citing two documents does not inflate the operating-model count; rows below a file's own
  German marker are counted separately; one verified false positive was dropped by hand
  (`roles/critic.md:190`). The scan tooling was written under `.git/` and is deliberately **not** a
  repository artifact — this dispatch adds no file to the tree.
- `rg -n "\]\([^)]*\.md#" .` → the 13 fragment-bearing links, five of them from `backlog/README.md`
  to `docs/operating-model.md`; `rg -n "<a id=" docs/operating-model.md` → the two alias anchors,
  both then read in place at `:563` and `:583`.
- A probe importing `collectAnchors` from `harness/scripts/check-doc-contracts.mjs` → 31 anchors for
  20 headings; `#7-feedback-loop`, `#8-projekt-kalibrierungsschicht` and `#4-der-lifecycle` all
  resolve. This is the measurement §II.3.2 rests on.
- `rg -n "^#{1,4} " harness/review-protocol.md roles/goldfish.md`, `rg -n "^#{2,4} 6"
  harness/session-bootstrap.md`, `rg -n "^#{1,4} |^### EL-0" roles/elephant.md` → the replacement
  targets named in §II.4 (`review-protocol` §2.1 `:33`, §2.3 `:74`, §2.4 `:140`; `goldfish.md` §2
  `:19`, GF-01 `:21`, §6 `:86`; `session-bootstrap` §6.2 `:298`, §6.3 `:308`; the stage-0 criteria
  in `elephant.md` EL-01's exception `:35`).
- `node harness/scripts/check-doc-contracts.mjs` → exit 0 both before and after this revision:
  `490 Markdown file(s), 776 link(s), 13 anchor check(s)`.
- **Every `file:line` quoted in Part II was confirmed by reading the file**, not by trusting a search
  hit: `rg` output in this environment can render the matched needle itself as a placeholder, which
  is how the `<a id=` hits first appeared and why they were re-read before being relied on.
- **Not run, and disclosed rather than substituted:** the project's configured verify gate. It is
  unreachable in this checkout for a reason outside a dispatch's control, so the doc-contract checker
  was run on its own. A single checker is **not** the gate, and §II.5's AC-R3-3 is written against the
  gate, not against this session's substitute.

---

## Part III — Scope honesty

### III.1 What this document does not cover

- **Any code, test, template or configuration change.** This is a specification; the inventories
  above are instructions for later dispatches (§0 header).
- **Part A's open question §A.4** (whether `normalizeRulesetSource`'s tautological comparison should
  be replaced by a second, independently sourced observation). Untouched; R1 moves that code without
  changing it.
- **Part A's disclosed limitation 2** (an allowlisted origin at an arbitrary committed history).
  The first revision noted that a signed-release pin could close it offline; the 2026-08-07
  correction withdraws that pin (§I.2.7), so the limitation stays open with no successor mechanism
  proposed here.
- **The former stage 3 of R2** (making the no-anchor outcome a failure) — explicitly deferred to a
  later PO decision (§I.2.10 item 4).
- **A Claude-side equivalent of Codex's host-path attestation** — still a separate design, per Part
  A §A.7.
- **Key custody, rotation and revocation.** No longer applicable: the 2026-08-07 correction removes
  the release key entirely (§I.2.7). Recorded rather than deleted so the withdrawal is visible.
- **The shell-lane residual for the live plugin root (finding SL-1, §I.2.3c).** Reported, escalated
  to §I.2.10 item 5, and deliberately not designed, fixed or worked around here — it is guard code
  and a T1 subject of its own.
- **The twelve `harness/review-protocol.md` citations** of §II.7 — disclosed; the scope call moved
  into §II.6 as part of R3's boundary decision, which this document deliberately leaves to the PO.
- **R2-min-B (§I.2.6)** — promoted to the preferred option if U3 holds, but still not designed; it
  needs OBS-1 and its own small pass for the Claude-host record.

### III.2 Adjacent oddities observed and deliberately left alone

- `guard-lifecycle-ready.mjs:197` still says the shell needles are "scoped to the five configuration
  paths (GS-1..GS-5)"; the table has carried GS-7 and GS-8 for some time and the code derives
  needles from the whole array (`:206`). A stale comment, not a behaviour defect — and any edit to
  it is a code change this document may not make.
- `templates/prompts/*.md` are dated "v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03" in their header
  blocks. Not touched.

### III.3 Assumptions this document did not verify

- **U1** — the marketplace-installed path shape (`~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`)
  is inherited from the Part-A document and could not be re-observed here: the only host registry
  available in this session records a `directory`-sourced marketplace, not a git-sourced one. The
  design does not depend on the exact shape (§I.2.5 step 1 deliberately drops the layout naming
  requirement), but any claim about *where* the installed copy sits carries this assumption.
- **U2** — that a marketplace-installed tree contains `.codex-plugin/plugin.json`, which
  `parseManifest` requires (`public-core-observation.mjs:27`, `:286-305`). True of the source tree;
  assumed of the installed tree. If false for a Claude-only distribution, `observeInstalledContentIdentity`
  needs a runner-aware manifest path — a small, contained change, but it must be measured first.
- **U3** — that the host plugin-list record for a git-sourced install exposes the marketplace URL
  (§I.2.6). Unverified; the lever is disclosed, not designed on.
- **U4** — that the plugin cache stores ordinary regular files with `nlink === 1`. `stableFile`
  rejects anything else with `SNT-A2-PLUGIN-NONREGULAR` (`public-core-observation.mjs:205`), and the
  snapshot machinery has so far only been exercised against checkouts and the private-overlay path.
  A hardlinking installer would make every installed-copy attestation fail closed. **Carried
  forward and promoted by the 2026-08-07 correction:** it is no longer a pre-ship check for a later
  stage but OBS-1 item 1 (§I.2.5) — the measurement that decides whether R2-min-A is buildable at
  all. With the signature gone, U4 is the largest remaining risk in the whole of R2, because the
  payoff it is weighed against is now much smaller.
- **U5** — that the release key is Ed25519. `verifyAttestation` calls `crypto.verify(null, ...)`
  (`provenance-attestation.mjs:22`), which suits Ed25519 and matches the repo's existing detached
  approval key; the actual algorithm is a release-process choice, not a fact verified here.
  **Retired 2026-08-07:** the signature and the release key are withdrawn (§I.2.7), so this
  assumption has no subject left. Kept with its reason rather than deleted, so a later reader can
  see it was answered rather than forgotten.

### III.4 Verification log (commands actually run for this document)

- Read in full: the three backlog items; `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`;
  `plugins/pipeline-core/lib/public-core-observation.mjs`;
  `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs` and its test;
  `plugins/pipeline-core/hooks/guard-gate-strength.mjs`;
  `plugins/pipeline-core/lib/provenance-attestation.mjs`; the Part-A design document.
- `rg -n "^#{1,3} " docs/operating-model.md` → the §1–§10 structure of §II.1; `###` children only
  under §3 and §5.
- `rg -n "briefing|light|six" docs/operating-model.md` → one "briefing" hit (`:300`, unrelated), one
  "light" hit (`:96`) — the basis for §II.1's two additional findings.
- Read `docs/operating-model.md:38-167` and `:164-243` → the roles table (`:40-45`), §4 step 5
  (`:144-146`), §5 (`:164-183`), §6's Critic paragraph (`:233-236`).
- `rg -n "^#{1,3} " harness/review-protocol.md` → §2.1 `:33`, §2.4 `:140`; read `:31-75` → the T0–T6
  table and the English canonical wording at `:53-55`.
- `rg -n "operating-model" templates/prompts/critic-review.md templates/prompts/goldfish-task.md`
  and `rg -n "§" templates/prompts/goldfish-task.md` → the eight-line citation inventory of §II.1
  (four more than the backlog item recorded).
- `rg -n "^#{1,3} " harness/session-bootstrap.md roles/goldfish.md` and read `roles/goldfish.md:19-33`
  → §6.2 `:298`, §6.3 `:308`, `roles/goldfish.md` §6 `:86`, GF-01's six-field list `:23`.
- `rg -n "GATE_STRENGTH_PATHS" plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and
  `rg -n "GUARD-GATE-STRENGTH-SHELL" -B 25 …` → the shell lane's `basename(rule.path)` needles
  (`:206`) and the read-only exemption (`:196`).
- Read `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs:190-309` → GST17's table-driven
  both-lanes assertion.
- `rg -n "SelfApplicationGit|\.git|observe:|scriptUrl" plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
  → the fixture and injection points cited in §I.1.6.
- Repo-wide `rg` for `pluginRootHasSelfApplicationGit` over `*.mjs` → definition and one call site,
  both inside `pipeline-start-preflight.mjs`; no external importer.
- `rg -n "guard-gate-strength|CLAUDE_PLUGIN_ROOT" plugins/pipeline-core/hooks/hooks.json` → `:39`
  wires the hook via `${CLAUDE_PLUGIN_ROOT}`; `rg -n "hooks|command" .claude/settings.json` → only a
  statusline command, no hook wiring. Together these verify §I.1.6's refresh-timing claim
  independently of the Part-A document.
- `rg -n "trustPolicy|publicKeySha256|keyReference" plugins/pipeline-core/lib/po-approval-proof.mjs`
  → the pin pattern of §I.2.4.
- `rg -n "anchor|slug|\]\(|LINK|headings" harness/scripts/check-doc-contracts.mjs` → the link/anchor
  validation of §II.3 (`:163-187`, `:288-302`, `:414-454`); no HTML-comment handling exists.
- `node harness/scripts/check-doc-contracts.mjs` → green before this document was written
  ("480 Markdown file(s), 776 link(s), 13 anchor check(s)"), and green again on the final state
  ("481 Markdown file(s), 776 link(s), 13 anchor check(s)").
- One red→green cycle in between, on this document itself, and it is the evidence behind §II.3
  rather than an anecdote: an *example* citation written inside backticks was still resolved as a
  real link and failed with `DOC-CONTRACT … -> ../../docs/operating-model.md#4-the-lifecycle: target
  is not tracked`, because the destination's `../` depth was written for a file in
  `templates/prompts/` while the citing file lives three levels deep under `specs/`. Two facts
  measured, not assumed: the checker does not exempt inline-code spans, and it resolves
  destinations relative to the citing file. It also only checks links from *tracked* files, so the
  finding appeared on the commit, not on the first run against the untracked draft — an
  implementation dispatch that runs the gate only before committing will not see this class.

**Added by the 2026-08-07 threat-model rework** (`Dispatch: PHX-R2-THREATMODEL-rework`), which
re-derived §0.5 and §I.2.3–§I.2.10. Every `file:line` in those sections was read in this session:

- Read in full: `plugins/pipeline-core/hooks/guard-gate-strength.mjs`,
  `plugins/pipeline-core/lib/guard-maintenance-window.mjs`,
  `plugins/pipeline-core/hooks/hooks.json`, and R2's backlog item. Read the cited ranges of
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (`:150-280`, `:514-613`, `:866-946`) and
  `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` (`:265-305`, `:326-361`).
- `rg -n "crossRepositoryMutationBlocked|GUARD-CROSS-REPO-MUTATION" guard-lifecycle-ready.mjs` → the
  refusal at `:161-171` and its two call sites (`:923`, `:933`).
- `rg -n "function isForbiddenCrossRepositoryMutation" -A 60 guard-lifecycle-ready.mjs` → the
  enumerated list quoted in §I.2.3(c), ending in `return false` at `:577`.
- `rg -n` for the plugin/marketplace subcommand branch → hits only at `:535`/`:539`, both inside the
  `codex`-scoped condition at `:534`; no equivalent branch for any other installer CLI.
- `rg -n "nlink|SNT-A2-PLUGIN-NONREGULAR|…" public-core-observation.mjs` → `stableFile`'s
  `nlink !== 1n` rejection (`:203-205`), the directory walk's own rejection (`:271`) and
  `contentSha256` (`:280-283`) — the evidence behind U4 and §I.2.5.
- `rg -n "export function verifyAttestation" -A 10 provenance-attestation.mjs` → `:16-25`, the
  envelope shape §I.2.7 withdraws.
- `rg -n "signature|ceremony|detached|human" docs/adr/0056-push-approval-mode.md` → the two modes at
  `:45` and `:48-49`, cited in §0.5 point 3.
- `rg -n "^#{1,3} |SEC-" guardrails/security.md` → SEC-01..SEC-09 carry no adversary-model statement
  that §0.5 could contradict; SEC-07 ("sandboxing is defense-in-depth, not a replacement for the
  guards") is the nearest neighbour and is consistent with it.
- `node harness/scripts/check-doc-contracts.mjs` → exit 0 on this document's final state.
- **Not run, deliberately:** no attempt was made to write into the live plugin root through either
  lane. §I.2.3(a)–(c) is a static read of the two guards; confirming (c) empirically would mean
  attempting to disarm the enforcing guard code, which is outside a design pass's business.
