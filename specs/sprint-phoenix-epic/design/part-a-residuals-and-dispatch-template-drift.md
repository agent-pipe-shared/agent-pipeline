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

---

## Part I — Bootstrap attestation residuals (R1 + R2)

### I.1 R1 — the attestation's own `.git`-presence gate is not gate-strength-protected

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

#### I.2.3 The anchor problem, which both candidate directions must solve

For a non-git copy there is nothing locally authoritative to compare against: no `remote get-url`,
no commit, no clean/dirty signal. An integrity check needs a **trusted expected value** — a pin —
and that pin cannot be derived from the artifact being checked. Both candidate directions need one;
they differ in where the pin's *content* comes from and in what they pay for it. This is the axis
the choice actually turns on, and neither the backlog item nor Part A states it explicitly.

A second, harder truth belongs here rather than in a footnote: **the preflight script and any pin
module ship inside the very subtree being attested.** An adversary who can rewrite the installed
copy can rewrite the checker and the pin together. No purely client-side check whose code and
anchor both live inside the artifact can be sound against that adversary. What such a check *can*
detect — reliably, and this is worth having — is unsigned or foreign copies, post-install drift and
hand-edits (including an agent's), partial or corrupted installs, and version-string spoofing. Any
design that claims more than this is repeating Part A's F4 overclaim.

#### I.2.4 Direction comparison and recommendation

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

**Recommendation: direction 1, staged.** It is the only one of the two that satisfies constraint 1,
it reuses three existing primitive families instead of introducing a network tier, and its cost is
paid once at release time rather than on every session. Direction 2's sole advantage (limitation 2)
is better served by extending the same signed-release pin to the git topology later — offline —
than by adding a remote read to bootstrap. This is a recommendation with a real cost attached (a
signing step in the release process and a key the PO must hold), so §I.2.10 states plainly which
parts of it need a PO decision before implementation starts.

#### I.2.5 Design of the recommended direction

**Release-side artifact.** One file inside the plugin subtree,
`.pipeline-attestation/release-attestation.json`, schema
`pipeline.public-core-release-attestation.v1`:

```
{ schema, plugin: { name, version }, manifestSha256, contentSha256, keyReference, publicKey, signatureBase64 }
```

`contentSha256` is computed over the subtree **excluding the attestation file itself** — otherwise
the value would have to contain its own hash. The signed payload is the canonical JSON of
`{ schema, plugin, manifestSha256, contentSha256 }`; `keyReference`/`publicKey`/`signatureBase64`
are the envelope, exactly the split `verifyAttestation` expects.

**Client-side verification**, in the R1 gate module (§I.1.3), on the branch where
`pluginRootHasSelfApplicationGit()` is false — i.e. replacing today's unconditional skip:

1. Snapshot the installed subtree with the existing machinery, excluding the attestation path, and
   parse the manifest. This needs one new export from `public-core-observation.mjs` —
   `observeInstalledContentIdentity({ installedPluginRoot }, deps)` — composed of
   `physicalDirectory` + `snapshotPluginRoot` + `parseManifest`, i.e. `observe()` (`:323-357`)
   **minus** `resolveSourceLayout` and `observeGit`. `snapshotPluginRoot` gains one optional
   exclusion parameter, defaulting to "exclude nothing" so the git path is bit-for-bit unchanged.
   The naming constraints of `resolveSourceLayout` are deliberately not applied: an installed copy's
   directory names are the host's business, not the plugin's (`ASSUMPTION U1`).
2. Read `.pipeline-attestation/release-attestation.json`. Absent or unparseable → outcome
   `unattested`.
3. Verify the pin: `sha256(publicKey) === PUBLIC_CORE_RELEASE_TRUST.publicKeySha256` and
   `keyReference === PUBLIC_CORE_RELEASE_TRUST.keyReference`, from the new module
   `plugins/pipeline-core/lib/public-core-release-trust.mjs` (constants only, nothing else — GS-8's
   shape).
4. Verify the signature with `verifyAttestation`, then compare the attested `contentSha256`,
   `manifestSha256`, `plugin.name` and `plugin.version` against the observed snapshot.
5. Outcomes: all match → `{ attempted: true, failed: false }`; any mismatch, bad signature, failed
   pin or rejected snapshot → `{ attempted: true, failed: true }`; no attestation file →
   `{ attempted: false, failed: false }` (`unattested`).

**Status handling.** `failed: true` feeds the same `attestationFailed` term the git path already
uses, landing in the existing `"plugin-refresh-required"` branch with the advisory `nextAction`
(`pipeline-start-preflight.mjs:333-344`, exit `0`). No new status, no new exit code — constraint 3
satisfied by reuse, not by promise.

**Staged rollout.**
- *Stage 1 (this design's scope):* client verification plus the `unattested` skip. Behaviour change
  for existing installs: none — no release is signed yet, so every installed copy is `unattested`.
- *Stage 2 (this design's scope, release process):* the release procedure produces and signs the
  attestation. From then on a genuine release verifies, and a tampered or foreign copy fails into
  the advisory branch.
- *Stage 3 (explicitly OUT of scope, PO-gated later):* treating `unattested` as failed once every
  supported channel ships signed releases. That is the step that can newly block real users, and it
  deserves its own decision with real deployment data.

**Guarantee statement, deliberately narrow.** After stage 2 this proves: the installed subtree's
content hash and manifest hash match a value signed by the holder of the pinned release key, for
the same plugin name and version. It does **not** prove freshness (an older, genuinely signed
release verifies), and it is not sound against an adversary who rewrites the checker and the pin
together (§I.2.3).

#### I.2.6 An adjacent lever, disclosed rather than designed

`installedPipelineIdentityCodex` already reads the host's own record of *where the installed copy
came from* (`entry.marketplaceSource.sourceType`, `pipeline-start-preflight.mjs:94-97`) and throws
away `entry.marketplaceSource.source`. If — `ASSUMPTION U3` — a git-sourced record carries the
marketplace URL in that field, an offline **origin** check for the installed topology is available
almost for free: compare it against `PUBLIC_SELF_APPLICATION_ORIGINS`, the same allowlist GS-8
already protects. That would attest *where the copy came from* without attesting *what it now
contains*, so it complements direction 1 rather than replacing it.

This is disclosed, not designed and not recommended: it is neither of the two directions the PO put
in front of this design, and its central premise could not be verified in this session (the only
host registry observable here records a `directory` source, and no Codex host plugin list was
available). If the PO wants it, it is a small, cheap follow-up item that needs one observation on a
real marketplace install first.

#### I.2.7 Exact file-level implementation inventory (R2)

| File | Change |
| --- | --- |
| `plugins/pipeline-core/lib/public-core-observation.mjs` | add the exported `observeInstalledContentIdentity` of §I.2.5 step 1; add one optional exclusion parameter to `snapshotPluginRoot` (`:250`), defaulting to no exclusion. `observe()`, `observePublicCoreIdentity`, `observeCodexPublicCoreIdentity` and every `SNT-A2-*` code path stay unchanged. |
| `plugins/pipeline-core/lib/public-core-release-trust.mjs` | **new.** Constants only: `PUBLIC_CORE_RELEASE_TRUST = { keyReference, publicKeySha256 }` and the attestation-file relative path constant. |
| `plugins/pipeline-core/hooks/guard-gate-strength.mjs` | add `GS-10` protecting `plugins/pipeline-core/lib/public-core-release-trust.mjs` — the pin is a gate-deciding constant of exactly GS-8's kind, and leaving it unprotected would reopen §I.1.1's hole a third time. |
| `plugins/pipeline-core/lib/self-application-attestation-gate.mjs` (from R1) | replace the "no `.git` → skip" branch with the installed-copy path of §I.2.5; export the three outcomes. |
| `plugins/pipeline-core/scripts/release-attestation.mjs` | **new.** `plan` emits the digest-only signing request (`createAttestationRequest`/`validateSigningRequest`, `provenance-attestation.mjs:10-13`/`:40-42`); `apply` writes the attestation file from a detached signature. No private key is read, held or written by this script, and none enters the repository. |
| `plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md` | extend the `"plugin-refresh-required"` entry Part A adds so it names the installed-copy attestation failure as one of its causes. |
| `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md` | repoint §A.1 limitation 1, §A.5 case 2 and §A.7's first bullet at this document per §0.3. Markdown only. |
| tests | `public-core-observation.test.mjs`: additions for the new export (no edits to existing assertions). `self-application-attestation-gate.test.mjs`: the cases in §I.2.8. New `release-attestation.test.mjs` for the plan/apply shapes. |

#### I.2.8 Test/verification approach (R2)

Fixtures are directory trees in a temp dir — the existing `.git`-presence tests already build both
shapes (`pipeline-start-preflight.test.mjs:571-591` for the git fixture, and a no-`.git` fixture for
the F2/F4(c) cases at `:607`/`:625`), so the non-git fixture pattern is established, not new.

- No attestation file → `unattested`; `status` identical to today's (`"ready"` for a matching
  version). This is the regression test that stage 1 changes nothing for existing installs.
- Valid attestation over the fixture, signed with a test key whose SHA-256 is injected as the pin →
  `failed: false`, `status` unchanged.
- One byte changed in any file after signing → `failed: true` → `status:
  "plugin-refresh-required"`, `nextAction.kind === "advisory"`, exit code `0`.
- Signature valid but public key not matching the pin → `failed: true` (a fork that signs with its
  own key must not pass).
- Attestation naming a different `plugin.version` than the manifest → `failed: true`.
- Malformed/truncated attestation JSON → `failed: true`, never a thrown exception: the observers'
  fail-closed-internally contract (`public-core-observation.mjs:354-356`) must hold for the new
  export too.
- The git topology's existing behaviour is unchanged: all Part-A attestation tests pass unmodified.

#### I.2.9 Acceptance criteria (R2)

- **AC-R2-1** With no attestation file present, a non-git fixture produces exactly today's `status`
  and `nextAction` — proven by a test that fails if the outcome changes.
- **AC-R2-2** A tampered non-git fixture with a valid-but-stale attestation yields `status:
  "plugin-refresh-required"`, `nextAction.kind === "advisory"`, exit code `0` — never
  `"plugin-identity-unavailable"` and never exit `2`.
- **AC-R2-3** A copy signed with a non-pinned key fails.
- **AC-R2-4** `observeInstalledContentIdentity` never throws for malformed input; every failure is a
  typed `rejected` result.
- **AC-R2-5** `GATE_STRENGTH_PATHS` contains GS-10 for the pin module; GST17 passes unmodified.
- **AC-R2-6** No private key material, no machine-specific path and no host identifier appears in
  any committed file (`release-attestation.mjs` consumes a detached signature, it does not produce
  one).
- **AC-R2-7** Every pre-existing Part-A attestation assertion passes unmodified.
- **AC-R2-8** The three Part-A passages of §0.3 point at this document.
- **AC-R2-9** The project's configured verify gate is green.

#### I.2.10 Open questions for the PO (R2)

1. **Release signing is a process commitment, not only code.** Stage 2 requires the PO to hold a
   release key (a second key alongside the push-approval key), to sign each release, and to accept
   that an unsigned release verifies as `unattested`. Implementation of stage 2 should not start
   before that is confirmed.
2. **Where the pin lives.** This design pins inside the plugin (`public-core-release-trust.mjs` +
   GS-10) because it adds no new configuration surface (constraint 2). A strictly stronger anchor
   would put the pin outside the attested artifact — in the governed project's configuration tier —
   at the cost of the new key the Part-A design deliberately avoided adding. Not decided here.
3. **Stage 3** (treating `unattested` as a failure) stays a separate, later PO decision (§I.2.5).
4. **The adjacent lever** of §I.2.6 — worth one observation on a real marketplace install; not
   designed here.

### I.3 Coupling and sequencing of R1 and R2

1. R2's code changes land **in the module R1 creates**. Once GS-9 is enforcing — after the plugin
   refresh that follows R1's landing (§I.1.6) — no agent session can edit that module at all; only a
   PO hand-edit outside an agent session can. **Therefore: land R2 before the refresh that makes
   GS-9 enforcing, or accept that R2's gate-module work becomes a PO hand-edit.** The same applies
   to GS-10 and `public-core-release-trust.mjs`. This is the one hard ordering constraint between
   the two packages, and it is a consequence of the guard family's own design, not a preference.
2. R1's "behaviour-preserving" claim covers the *move* only. R2 then deliberately changes behaviour
   on the non-git branch. Reviewing them as one diff would blur the two claims; the recommended
   split is two implementation dispatches and two Critic passes, ordered R1 → R2 with no plugin
   refresh in between.
3. If the PO prefers to refresh between them, R2's inventory must be re-scoped to a PO-hand-edit
   step for the gate module. Stating this now avoids discovering it as a blocked write mid-dispatch.

---

## Part II — R3: dispatch templates cite restructured operating-model sections

### II.1 Problem, re-derived against the current files

`docs/operating-model.md`'s current English structure, read directly: §1 `:16`, §2 `:38`, §3 `:57`,
§4 `:87`, §5 `:164`, §6 `:227`, §7 `:244`, §8 `:280`, §9 `:288`, §10 `:302` (everything from `:325`
is the German reference translation and is not a citation target). Only §3 and §5 carry `###`
children: `### Profiles` `:63`, `### Duties` `:78`, `### Gate discipline and autonomous happy path`
`:185`. **No `§N.M` subsection numbering exists anywhere in the document.** Every numbered
subsection citation in either template is therefore stale by construction.

Complete verified inventory — wider than the backlog item recorded, which listed four of the eight:

| Location | Cited | Status |
| --- | --- | --- |
| `templates/prompts/critic-review.md:5` | OM §2.4 (Critic contract + report format) | **stale** — content is at `:45` (roles table, Critic row) + §6 `:233-236` |
| `templates/prompts/critic-review.md:6` | OM §4.2 (trigger matrix; "canonical German trigger wording — authoritative") | **stale, twice** — see §II.3 |
| `templates/prompts/critic-review.md:15` | `review-protocol.md §2.1` | **path incomplete** — the file is `harness/review-protocol.md`; §2.1 `:33` is correct |
| `templates/prompts/critic-review.md:142` | OM §2.3 field 6 | **stale** |
| `templates/prompts/goldfish-task.md:5` | OM §2.3 (canonical briefing field list) | **stale** — see §II.2 |
| `templates/prompts/goldfish-task.md:7` | OM §2.3 | **stale** |
| `templates/prompts/goldfish-task.md:15` | OM §3.2 step 4 (briefing-format check) | **stale, not recorded in the backlog item** — §3 has no numbered steps; §4's numbered step 4 is the human plan gate, not a briefing-format check |
| `templates/prompts/goldfish-task.md:129` | OM §3.3 (light profile) | **stale, not recorded in the backlog item** — and §3's `### Profiles` `:63-72` is a *different* concept (`mini`/`feature`/`epic`), not the dispatch `light`/`standard` profile |
| `templates/prompts/goldfish-task.md:8` | `harness/session-bootstrap.md` §6.2 | **correct** (`:298`) |
| `templates/prompts/critic-review.md:7` | `harness/session-bootstrap.md` §6.3 | **correct** (`:308`) |
| `templates/prompts/goldfish-task.md:160` | `roles/goldfish.md` §6 | **correct** (`:86`, "Completion report (GF-09)") |

Two findings the backlog item does not contain:

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

**Consequence to carry into implementation:** the template's field name "Forbidden"
(`goldfish-task.md:6`) and GF-01's "Prohibitions" must be reconciled — one of the two, used
everywhere. Recommendation: keep GF-01's "Prohibitions" as canonical and note "(Forbidden)" once in
the template, because the operating model's §4 step 5 also says "prohibitions".

### II.3 Decision — should section numbers be cited at all

**No — cite machine-checkable anchor links, with the heading title in the link text.**

`harness/scripts/check-doc-contracts.mjs` validates Markdown links and their fragments: it collects
heading anchors (`:163-187`), resolves every relative link target (`:414-438`), and reports "anchor
not found" when a fragment does not resolve (`:451-454`). It does **not** validate prose `§N.M`
references — nothing does. So a citation written as a Markdown link with the destination
`docs/operating-model.md#4-the-lifecycle` (spelled relative to the citing file — from
`templates/prompts/` that is two levels up) is checked by the existing verify gate on every run,
while `§4.2` is checked by nobody. The extractor is line-based and contains no HTML-comment
handling, so links inside the templates' `<!-- ... -->` header blocks are validated exactly like
body links — which is precisely where the stale citations sit.

Two properties of the checker the implementation must respect, both measured in this session rather
than assumed (§III.4): the extractor does **not** exempt inline-code spans, so even an *example*
link written inside backticks is resolved and must be correct; and destinations are resolved
relative to the citing file, so the same citation needs a different `../` depth in
`templates/prompts/` than in `roles/`.

The residual is honest and small: an anchor slug contains the section number
(`#4-the-lifecycle`), so a renumbering still breaks the link — but it breaks it **red**, in the
verify gate, instead of silently. Turning a silent-drift class into a failing-check class is the
whole point. Where a link is impossible (the trigger-wording reference to a table row), cite the
heading *title* plus the file, never a number.

**Falsifiability requirement for the implementation:** after the edit, deliberately break one
fragment, confirm `node harness/scripts/check-doc-contracts.mjs` exits non-zero, restore it, confirm
exit 0. A check that has not been observed failing is not evidence.

### II.4 Exact corrected references

| Location | Replace with |
| --- | --- |
| `critic-review.md:5` | Critic contract: `docs/operating-model.md` — roles table, Critic row (`#2-roles-and-boundaries`) **and** `#6-evidence-review-and-recovery`; report format: `harness/review-protocol.md` `#24-findings-format-transfer-format-3-om-24` |
| `critic-review.md:6` | trigger decision table: `harness/review-protocol.md` `#21-trigger-decision-table`; drop "canonical German trigger wording" — the canonical wording quoted at `harness/review-protocol.md:53-55` is English (ADR-0011 makes this Public Core English-canonical), and the `docs/operating-model.md §3.3/§4.2` word-identity claim in that same line is itself stale (§II.6) |
| `critic-review.md:15` | `harness/review-protocol.md` `#23-isolation-levels` for T-row semantics; keep the §2.1 reference but with the full path |
| `critic-review.md:142` | "Dispatch metadata (`roles/goldfish.md` GF-01 field 6, critic variant)" — per §II.2 |
| `goldfish-task.md:5` and `:7` | "Source of truth: `roles/goldfish.md` GF-01 — the canonical six-field briefing list" (link to `../../roles/goldfish.md#2-input-contract`) |
| `goldfish-task.md:15` | the briefing-format duty is `roles/goldfish.md` GF-01/GF-02 (`:21-31`) plus `docs/operating-model.md` `#4-the-lifecycle` step 5 (`:144-146`); there is no "§3.2 step 4" |
| `goldfish-task.md:129` | drop the `§3.3` citation. The light/standard *dispatch* profile is defined by the template and `roles/goldfish.md` §6 (`:86`); the nearest operating-model concept is `#3-v3-routing-profiles-duties-and-phases` → Duties (`:78-85`), which is about `implement`/`mechanic`/`deep`, not the report shape. Cite Duties for the routing half and `roles/goldfish.md` §6 for the report half — do not invent a section for the rest |

Anchor slugs above follow GitHub's convention (lowercase, spaces → `-`, punctuation dropped); the
implementation must confirm each one against `collectAnchors` (`check-doc-contracts.mjs:163-187`)
by running the check, not by assuming the slug.

### II.5 Inventory, tests, acceptance criteria (R3)

| File | Change |
| --- | --- |
| `templates/prompts/critic-review.md` | four citation lines per §II.4 (`:5`, `:6`, `:15`, `:142`) |
| `templates/prompts/goldfish-task.md` | four citation lines per §II.4 (`:5`, `:7`, `:15`, `:129`); reconcile "Forbidden"/"Prohibitions" per §II.2 |
| `roles/goldfish.md` | **at most one sentence** in §2 marking GF-01's list as the canonical carrier the templates cite. No renumbering, no restructuring. |

Verification is the existing gate: `node harness/scripts/check-doc-contracts.mjs` exits 0 with every
new anchor resolving, plus the deliberate-break falsification of §II.3. There is no unit test for
prose citations and this design does not invent one.

- **AC-R3-1** No `§N.M` reference to `docs/operating-model.md` remains in either template
  (`rg -n "operating-model" templates/prompts/` shows only links or heading-title citations).
- **AC-R3-2** Every citation added is either a link whose fragment resolves under
  `check-doc-contracts.mjs`, or a file + heading-title reference with no number.
- **AC-R3-3** `node harness/scripts/check-doc-contracts.mjs` exits 0, and has been observed exiting
  non-zero for a deliberately broken fragment in the same files.
- **AC-R3-4** Both templates still contain all six field names and the "never freehand" contract
  intact — this is a citation repair, not a rewrite of dispatch semantics.
- **AC-R3-5** The `roles/goldfish.md` edit is one sentence and changes no rule id.

### II.6 Adjacent drift, disclosed and not fixed here

`harness/review-protocol.md` — the file the corrected citations point *to* — carries the same defect
class in four places: `:35` ("normative definitions: OM §4.2"), `:53` ("word-identical in
`docs/operating-model.md` §3.3/§4.2"), `:58` ("OM §4.2") and the §2.4 heading itself at `:140`
("transfer format 3, OM §2.4"). None of those sections exists.

This is outside R3's stated scope (the backlog item names the two templates), and this design does
**not** silently widen that scope. It is recorded here because repointing the templates at a file
whose own cross-references are broken fixes one hop of a two-hop chain. Recommendation: fold these
four lines into R3's implementation package as a bounded, enumerated addition — they are the same
defect, the same fix shape, and the list is complete above. The scope call is the PO's/Elephant's,
not this document's.

---

## Part III — Scope honesty

### III.1 What this document does not cover

- **Any code, test, template or configuration change.** This is a specification; the inventories
  above are instructions for later dispatches (§0 header).
- **Part A's open question §A.4** (whether `normalizeRulesetSource`'s tautological comparison should
  be replaced by a second, independently sourced observation). Untouched; R1 moves that code without
  changing it.
- **Part A's disclosed limitation 2** (an allowlisted origin at an arbitrary committed history).
  §I.2.4 notes that a signed-release pin could close it offline; designing that is not in scope.
- **Stage 3 of R2** (making `unattested` a failure) — explicitly deferred to a later PO decision.
- **A Claude-side equivalent of Codex's host-path attestation** — still a separate design, per Part
  A §A.7.
- **Key custody, rotation and revocation** for the release key: the process side of §I.2.10 item 1.
  This design specifies the verification, not the operational procedure.
- **The four `harness/review-protocol.md` citations** of §II.6 — disclosed, scope call left open.
- **The adjacent lever** of §I.2.6 — disclosed, not designed.

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
  A hardlinking installer would make every installed-copy attestation fail closed. **This must be
  measured on a real install before R2 stage 2 ships**; it is the single most likely way the
  recommended direction fails in practice.
- **U5** — that the release key is Ed25519. `verifyAttestation` calls `crypto.verify(null, ...)`
  (`provenance-attestation.mjs:22`), which suits Ed25519 and matches the repo's existing detached
  approval key; the actual algorithm is a release-process choice, not a fact verified here.

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
