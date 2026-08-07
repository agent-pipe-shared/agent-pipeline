# Bootstrap origin-allowlist and Codex-under-WSL freshness boundary — design

Owner: Pipeline maintainers. Status: DESIGN ONLY — no `.mjs`/`.json`/`.yaml` file was
changed to produce this document; every claim below was checked against the real files on
this branch (commit `cbf3050` and descendants), not inferred from the backlog items alone.
Companion backlog items:
`backlog/items/2026-08-07-self-application-integrity-check-absent.md` (Part A) and
`backlog/items/2026-08-07-ruleset-freshness-wsl-subsystem-absent.md` (Part B). Both record
binding 2026-08-07 PO decisions that this design does not re-litigate; see each item's
Triage section for the exact wording.

**Model-policy disclosure (added per Critic finding F7 against commit `a75a45d`):** the
design-phase dispatch that originally produced this document ran on `claude-sonnet-5` (per
its scratchpad `dispatch-record.json`), below the Design-tier model `policies/model-policy.md`
MP-23 mandates for design-phase/design-latitude work ("When in doubt whether a design-phase
step ... needs the Design-tier model, it does"), with no rationale recorded at the time. This
cannot be corrected retroactively for the artifact already produced; it is disclosed here,
flagged by the Critic review, for the PO's awareness.

**Extended per Critic finding A (MINOR, second Critic pass against commit `8c526dd`):** the
same disclosure duty applies to the dispatch that produced the corrections above, not only to
the original dispatch. That rework (commit trailer `Dispatch: WP2-WP3-design-rework
(goldfish)`) also ran on `claude-sonnet-5`, the same below-Design-tier model, with no
rationale recorded at the time — the identical pattern, not a one-off confined to the
document's first draft. This too cannot be corrected retroactively; it is disclosed here
plainly, rather than leaving only the earlier dispatch named and the more recent one's
identical gap unstated.

**Extended a second time per Critic finding 3 (MINOR, third Critic pass against commit
`d99e59f`):** the same gap recurred one level down, in the dispatch that wrote the paragraph
above. `WP2-WP3-design-rework-2` (commit trailer `Dispatch: WP2-WP3-design-rework-2
(goldfish)`, commit `d99e59f`; its scratchpad `dispatch-record.json` records `"model":
"claude-sonnet-5"` and carries no rationale field) also ran below the Design tier, with no
rationale recorded. Naming the two earlier dispatches while the dispatch that authored the
disclosure itself carried the identical gap would have reproduced exactly the pattern the
disclosure exists to expose, so it is named here too — three dispatches, one recurring
pattern, none of them correctable retroactively.

**Pattern closed structurally from this revision onward:** the dispatch that produced *this*
correction (`WP2-WP3-design-rework-3`) was routed on the Design-tier model (`claude-opus-5`,
effort `xhigh`, per its dispatch metadata), explicitly citing MP-22/MP-23 ("When in doubt
whether a design-phase step ... needs the Design-tier model, it does") as its stated model
justification rather than leaving the tier choice implicit. It is the first dispatch touching
this document to run on the Design tier. The three below-tier dispatches disclosed above stay
uncorrectable for the artifacts they already produced, but the pattern ends here for
design-phase authorship of this document going forward: any further dispatch that authors or
reworks this design is a design-phase step and is dispatched on the Design-tier model, with
its model recorded in the dispatch metadata either way.

This design covers two related, independently shippable repairs. Part A changes the
bootstrap readiness gate's `status` semantics (blast radius, **rescoped per Critic finding F2,
MAJOR, delta re-review `412d33d`**: the changed code path is reached by every session and every
project on the next plugin refresh, but the new origin/content attestation can only change a
session's `status` where a real `.git` sits two directories above `pluginRoot` — the
self-application/dev-checkout topology. A marketplace-installed copy skips the attestation
entirely and keeps today's version-only outcome (§A.5 case 2). The "every session, every
project" framing of the *effect* predates the F2 gate and is refuted by it). Part B repairs a
Codex+WSL-only advisory freshness path (blast
radius: Codex-under-WSL sessions only, and only in the direction "was `unknown`, may now
resolve"). They share one document because they were investigated together and because
Part B's pre-merge implementation imported from Part A's pre-merge implementation, but they
are two separate implementation dispatches and two separate Critic reviews.

**A verification note up front, because the lesson from this same session's WP5 review was
about unverified primitive claims:** the backlog items and PO decisions state that
`public-core-observation.mjs`/`ruleset-source.mjs` are "already proven safe in production
use" via `private-overlay-activation.mjs:230,573` and
`private-overlay-bootstrap-status.mjs:49`. Checked directly (`grep -rn
"normalizeRulesetSource\|compareLoadedRulesetIdentity" --include="*.mjs" plugins/`): that
claim is accurate for `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity`, which
those three call sites do invoke — but **`normalizeRulesetSource` and
`compareLoadedRulesetIdentity` have zero production callers on main today.** Their only
caller anywhere in the tree is their own test file, `ruleset-source.test.mjs`. This does not
block following the PO decision (the decision names `normalizeRulesetSource` as an existing,
unchanged, reusable primitive, which is true), but Part A below is the **first production
call site** for it, not a revalidation of an already-proven one. This is stated explicitly
rather than silently smoothed over — see §1.3.

---

## Part A — self-application / public-marketplace-origin allowlist

### A.1 What guarantee is being restored

**Corrected per Critic finding F4 (MAJOR, commit `a75a45d`'s review):** the original text of
this section claimed the check proves plugin code is "byte-identical to a clean checkout" of
an allowlisted origin. Checked directly against Part A's actual mechanism
(`observeGit`/`observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` in
`public-core-observation.mjs`): it performs **no remote read at all** — only local
`rev-parse`/`remote get-url origin`/`status --porcelain`. It cannot prove byte-identity to any
canonical remote copy; the "clean checkout" framing overclaimed what a purely local check can
deliver.

Concretely, the guarantee Part A actually restores is narrower, and — **corrected per Critic
finding F-A (MAJOR, delta re-review `7aa84f0` of the F2 implementation fix)** — scoped to only
the topology where a real git checkout sits at the self-application layout (a `.git` entry two
directories above `pluginRoot`, gated by `pluginRootHasSelfApplicationGit()` in
`pipeline-start-preflight.mjs`): **the origin URL is one of
the two reviewed Public-Core origins** — `https://github.com/agent-pipe-shared/agent-pipeline.git`
or `git@github-public:agent-pipe-shared/agent-pipeline.git` — or, for local development, the
verified self-application layout — **AND the plugin subtree carries no *uncommitted* local
modification** (`git status --porcelain` clean). Without this check,
`observePipelineStartPreflight` currently only compares version *strings* (`version` read
from the loaded manifest vs. `installedVersion` read from the host's plugin list,
`pipeline-start-preflight.mjs:211-215`) — it has no opinion on where those bytes actually
came from, whether the working tree is dirty, or whether the manifest was hand-edited without
touching the version string. A forked or locally altered marketplace clone with a matching
version string currently passes readiness undetected; Part A closes exactly that gap, no
more — and only inside a self-application/dev checkout, per the scoping above.

**Disclosed limitation 1 (topology scope), added per Critic finding F-A:** the scoping above
is not a phrasing nuance — for a real marketplace-installed (non-git) copy, e.g.
`~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`, the topology every ordinary
end-user install actually ships to, this integrity check does not run at all (see §A.5 case
2); readiness falls through unmodified to the pre-existing version-only decision that
predates Part A. This is a distinct, tracked, disclosed gap, not closed by this design — see
`backlog/items/2026-08-07-marketplace-install-topology-unattested.md`, which records it as the
residual of *how* Critic finding F2 (`WP2-WP3-partA-rework-1`) was resolved, and names the PO
as its decision owner. **Citation corrected per Critic finding F1 (MAJOR, delta re-review
`412d33d`):** this sentence previously cited
`backlog/items/2026-08-07-self-application-integrity-check-absent.md` — a link that resolves,
but whose target tracks the *original* 0.5.2 merge-loss gap Part A closes, not this residual.
Until the item cited above existed, the limitation disclosed here had no tracking item at all.

**Disclosed limitation 2 (content scope), not closed by this design (stated plainly, matching
this document's own diligence standard elsewhere):** a clone whose remote origin is genuinely
one of the two
allowlisted URLs, but which is checked out at an arbitrary *committed* local commit/history
(e.g. a locally amended, rebased, or cherry-picked history, or a detached-HEAD checkout of an
arbitrary committed tree, on a clone that still reports one of the two allowlisted origin
URLs), would still pass both checks — the origin-URL comparison only inspects the configured
remote string, and `status --porcelain` only detects *uncommitted* drift, not which commit is
checked out or whether that commit's history matches the real, reviewed origin's history.
This is a real, disclosed limitation this design does not close, not a guarantee it
provides.

Verified byte-identical constant for the allowlist (pre-merge
`plugins/pipeline-core/lib/codex-host-plugin-list.mjs:21-24` at commit `998a609`):

```
PUBLIC_MARKETPLACE_URL = "https://github.com/agent-pipe-shared/agent-pipeline.git"
PUBLIC_SELF_APPLICATION_ORIGINS = { PUBLIC_MARKETPLACE_URL, "git@github-public:agent-pipe-shared/agent-pipeline.git" }
```

### A.2 Exact integration point

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, function
`observePipelineStartPreflight()` (current main, lines 172–255). Concrete anchors, verified
by reading the current file, not the pre-merge one:

- `pluginRoot` is resolved at line 180 (`resolve(dirname(fileURLToPath(scriptUrl)), "..")`)
  — this is exactly `<clone>/plugins/pipeline-core`, matching the directory-layout
  requirement `resolveSourceLayout()` enforces in `public-core-observation.mjs:87-97`
  (`basename(source.path) === "pipeline-core"`, `basename(pluginsRoot) === "plugins"`).
- `runner` is resolved at line 190 (`env.CLAUDECODE === "1" ? "claude" : "codex"`) —
  computed *before* the identity read, exactly as the comment on lines 181-189 already
  requires for every runner-dependent read in this function.
- `version` (loaded manifest version) is resolved at lines 192-200.
- `status` is currently decided at lines 211-215 from `version`/`installedIdentity`/
  `installedVersion` only.

The new step belongs **between** the `version`/`installedIdentity` reads (line ~203) and the
`status` decision (line 211): observe the origin/content identity of `pluginRoot`, then let
a negative result widen the existing `status` ternary (see §A.5) rather than replacing it.

### A.3 What is reused vs. new

**Reused, unchanged, calling-convention-matched:**

- `observeCodexPublicCoreIdentity` / `observePublicCoreIdentity` from
  `plugins/pipeline-core/lib/public-core-observation.mjs` (378 lines, read in full; no
  change needed to this file).
- `normalizeRulesetSource` from `plugins/pipeline-core/lib/ruleset-source.mjs` (154 lines,
  read in full; no change needed to this file).
- The exact runner-branch calling pattern already established in
  `plugins/pipeline-core/scripts/private-overlay-activation.mjs`: `main()` defaults to
  `observe: deps.observe ?? observePublicCoreIdentity` (line 230); `mainCodexHost()`
  overrides with `observeCodexPublicCoreIdentity` (lines 569-578). Part A's design mirrors
  this exactly: `runner === "codex"` → `observeCodexPublicCoreIdentity`; `runner ===
  "claude"` → `observePublicCoreIdentity`. No third branch, no new runner concept.
- Call shape: `observe({ sourcePluginRoot: pluginRoot, installedPluginRoot: pluginRoot },
  {})` — self-referential (loaded root IS the root being attested), which `observe()`
  already special-cases at `public-core-observation.mjs:334-336` (`installed = ... ===
  layout.sourcePluginRoot ? source : snapshotPluginRoot(...)`, avoiding a second directory
  walk).

**New, and why it cannot be avoided by reuse alone:**

1. **The origin-allowlist constant + comparison itself.** Neither
   `public-core-observation.mjs` nor `ruleset-source.mjs` hard-codes the two specific
   Public-Core URLs anywhere — `public-core-observation.mjs`'s `validRepository()` (lines
   132-150) accepts *any* syntactically well-formed credential-free `https`/`git@` origin,
   not just the two reviewed ones. The literal 2-entry allowlist Set and the ~5-line
   comparison of `observation.candidate.repository` against it must be declared fresh using
   the same two literal values verified in §A.1 — reusing the *values*, not the retired
   *module*. **Resolved per Critic finding F5 (MAJOR, commit `a75a45d`'s review), see also
   §A.7:** this constant is declared in its own small, new, dedicated module (e.g.
   `plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, containing only the
   allowlist Set and nothing else) rather than inline inside `pipeline-start-preflight.mjs` —
   deliberately, so the gate-strength protection added in item 3 below can cover exactly this
   gate-deciding constant without blocking ordinary, unrelated maintenance of the rest of
   `pipeline-start-preflight.mjs`.
2. **The shaping code that builds a `pipeline.ruleset-source.v1` object and calls
   `normalizeRulesetSource` on it.** No existing helper does this today; pre-merge, this
   shaping lived entirely inside the now-retired `observeCodexRulesetSource`
   (`codex-host-plugin-list.mjs:204-271` at `998a609`). Because `sourcePluginRoot ===
   installedPluginRoot` by construction in this self-referential call, `loadedIdentity` and
   `installedIdentity` fed into `normalizeRulesetSource` are necessarily equal — see the
   open question in §A.4.
3. **A `GATE_STRENGTH_PATHS` entry protecting the new allowlist module.** Added per Critic
   finding F5: `guard-gate-strength.mjs`'s `GATE_STRENGTH_PATHS` (GS-1..GS-5, GS-7) does not
   cover `pipeline-start-preflight.mjs` or any new constant module today, and GS-6 covers only
   the *installed* live plugin root, not the source tree — so, before this design's fix, an
   agent in a self-application session could weaken the new bootstrap gate by editing its own
   two-URL allowlist with no PreToolUse refusal, and §A.5's failure-mode taxonomy had no
   "allowlist constant was edited" case (a QG-06 gap: a known risk with no owner or
   next-step). Direction chosen: **(a)**, not (b) — this is a small, disclosed, in-scope
   addition, not an accepted-risk writeup: `guard-gate-strength.mjs` gains one new rule (next
   free id after GS-7) whose `path` is the new module from item 1 above, refusing any
   agent-session `Edit`/`Write` to it the same way GS-1..GS-7 already refuse writes to the
   other gate-deciding files, with the same PO-edits-it-directly escape hatch. See §A.7 for
   how this narrows, rather than voids, that section's scope exclusion.

   **Disclosed exception to GS-6's own stated policy, and its operational consequence (added
   per Critic finding C, second Critic pass):** verified directly against
   `guard-gate-strength.mjs`'s current `GATE_STRENGTH_PATHS` array — all six existing entries
   (GS-1, GS-2, GS-3, GS-4, GS-5, GS-7) protect configuration files (`pipeline.user.yaml`,
   `project/critical-human-proof.json`, `project/pipeline.yaml`, `project/guard-config.json`,
   `.claude/pipeline.yaml`, `.claude/guard-config.json`); none protects product *source*. The
   new entry this item adds is therefore the **first** `GATE_STRENGTH_PATHS` entry in this
   repo to protect a product-source file rather than a config file, and it does so inside
   `plugins/pipeline-core/` — the exact directory GS-6's own file-header rationale states is
   *deliberately* left writable in a source checkout, "because in a development session the
   enforcing copy is the installed one and the repository copy is ordinary product source
   under Verify, Critic and the PO gate." Unlike GS-6 (which only ever matches the currently
   *enforcing* live plugin root via `insideLivePlugin()`, exempting the source-tree copy by
   design), a plain `GATE_STRENGTH_PATHS` entry matches by repo-relative path
   (`gateStrengthRuleFor()`), so it protects the new module's *source-tree* copy too, not only
   an installed one. This is a deliberate, disclosed, narrow exception to GS-6's stated policy,
   not an oversight: it is warranted here because the new allowlist module is not ordinary
   product source under active development — it is a fixed, review-gated 2-URL allowlist that
   should not change casually, so trading away its in-session editability is the correct
   default, unlike the rest of `pipeline-start-preflight.mjs` and its siblings. The operational
   consequence, stated plainly because the guard has no in-session override (verified directly
   against the file's own header comment: "There is no in-session override, because an
   in-session override for 'may I weaken my own gate' is the same hole with an extra step," and
   no override mechanism is defined anywhere in the file): once this new rule is *enforcing*, no
   agent session can create or maintain the module at all (e.g. adding a third reviewed origin) —
   only a PO hand-edit made directly, outside an agent session, can, exactly like the escape hatch
   every other `GATE_STRENGTH_PATHS` entry already relies on.

   **Corrected per Critic finding 1 (MINOR, third Critic pass against commit `d99e59f`):** *when*
   "enforcing" begins is what the original text of this paragraph got wrong. It concluded that an
   agent session landing this new `GATE_STRENGTH_PATHS` entry could not also create the allowlist
   module in that same session, "because the very next write attempt is already refused by the
   freshly-edited guard" — carrying the (correct) re-read-on-every-invocation property one step too
   far, and contradicting this same section's adjacent, correct statement that the guard binds the
   *installed* copy. The cited doc-comment says so itself
   (`guard-gate-strength.mjs:98-100`): the immediate-disarm case it describes is "writing
   `process.exit(0)` into the **installed** `guard-push.mjs`," not into a source checkout's copy.
   Re-verified directly for this correction, against the wiring rather than
   against the prior text: the PreToolUse hook runs `node
   "${CLAUDE_PLUGIN_ROOT}/hooks/guard-gate-strength.mjs"`
   (`plugins/pipeline-core/hooks/hooks.json:39`), so the script re-read on every invocation is the
   *installed* copy under the host's plugin cache
   (`~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`), a different directory from
   this source checkout — and this repository's own `.claude/settings.json` wires no source-tree
   hooks at all. An edit that lands the new entry in the source checkout's
   `plugins/pipeline-core/hooks/guard-gate-strength.mjs` therefore changes nothing the
   currently-enforcing guard reads; the new rule first takes effect on the **next plugin refresh**,
   exactly like every other change to this plugin's code and exactly as this document already
   frames Part A's arrival elsewhere — "on the next plugin refresh" in the opening Part-A
   summary and again in §A.5's F1 correction. (Those two passages also stated a *reach*, "every
   session, every project"; that part is rescoped per Critic finding F2, delta re-review
   `412d33d`, because the attestation reaches self-application/dev checkouts only. The refresh
   *timing* quoted here is unaffected by that rescoping.)

   So the real consequence is a **window, not a same-session lockout**: between the commit that
   lands the rule and the plugin refresh that installs it, the new allowlist module stays freely
   agent-writable in the source tree, because the protection this item adds is not yet enforcing
   for anyone. Sequencing note for the implementation dispatch, corrected accordingly: **the
   same-session ordering constraint does not apply** — one session may land the allowlist module
   and the `GATE_STRENGTH_PATHS` entry that protects it together, in either order; the earlier
   advice to land the module's content first, or in a session distinct from the rule, rested on
   the false premise above and is withdrawn. The constraint that does apply is at plugin-refresh
   granularity: once the refresh makes the new rule enforcing, `gateStrengthRuleFor()` matches by
   repo-relative path (unlike GS-6's live-root-only `insideLivePlugin()`), so from that point on
   the module's *source-tree* copy is refused to agent sessions too, and the PO-hand-edit escape
   hatch above is the only remaining route. The implementation dispatch should therefore treat the
   module's content as settled before that refresh rather than plan a follow-up agent session to
   touch it up afterwards.

**Explicitly not revived:** the ~270-line plugin-list-parsing/`sourceClass`-computation
machinery from pre-merge `codex-host-plugin-list.mjs` (`selectedPluginRecord`,
`observedPluginRecord`, `classifyGitMarketplaceSource`, `safeMarketplaceSource`,
`observeCodexRulesetSource`, `PUBLIC_SELF_APPLICATION_ORIGINS`) — all of it is superseded by
reusing `observeCodexPublicCoreIdentity`, which already performs an equivalent (and
independently tested) host-list re-read via `observeSelectedCodexPipelinePlugin` (the
*current*, non-retired export of `codex-host-plugin-list.mjs`, confirmed present at 151
lines) plus its own internal `SNT-A2-CODEX-HOST-MISMATCH` check
(`public-core-observation.mjs:327-329`).

### A.4 Open question flagged for the PO (Part A's most important one)

Because `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` already enforce
`sourcePluginRoot === installedPluginRoot` bit-identity by construction when called
self-referentially, feeding their output through `normalizeRulesetSource`'s
loaded-vs-installed comparison is **tautological in this exact calling pattern** — it can
only ever report `"ready"` or reject on schema/shape grounds, never a genuine
loaded-vs-installed *mismatch*, because there is only one observed root, not two
independently sourced ones. `normalizeRulesetSource` therefore functions here as a
schema-closure/validation pass, not a second independent identity source.

**Question for the PO:** is that acceptable (the real guarantee comes entirely from
`observeCodexPublicCoreIdentity`'s host-path attestation + allowlisted origin URL +
clean-git-state — **not** an independent content-hash match: per the paragraph above, that
comparison is tautological in this exact self-referential calling pattern, so it is corrected
here, per Critic finding F4, to remove that overclaim — and `normalizeRulesetSource` is
exercised only for its schema closure and to establish it as a genuine production caller —
see the verification note up front), or does
the PO want a *second*, independently sourced installed-identity observation (e.g. calling
`observeSelectedCodexPipelinePlugin` directly for its own path/version, independent of what
`observeCodexPublicCoreIdentity` re-derives internally) so `normalizeRulesetSource`'s
comparison carries real information? The second option is more expensive (an extra host
round-trip) for a guarantee that is largely redundant with `SNT-A2-CODEX-HOST-MISMATCH`. This
design recommends the first (simpler) option but does not treat the choice as its own to
make silently.

### A.5 Failure mode

1. **Negative attestation result** (origin not in the allowlist, dirty git tree,
   `SNT-A2-*` rejection of any kind, or `normalizeRulesetSource` returning any non-`"ready"`
   status): fold into the **existing** `"plugin-refresh-required"` branch of `status`
   (`pipeline-start-preflight.mjs:213-214`) — do **not** invent a new hard-fail status. This
   exactly matches pre-merge precedent: `!sourceVersionBound` folded into the identical
   branch at pre-merge `pipeline-start-preflight.mjs:154` (`998a609`).
   `pipelineStartPreflightExitCode` (current main, lines 257-259) already treats
   `"plugin-refresh-required"` as exit `0`.

   **Corrected per Critic finding F1 (BLOCKER, commit `a75a45d`'s review):** "exit `0`" is not
   the same as "soft/advisory," and the original text of this section wrongly conflated them.
   Checked directly: this branch sets `nextAction: null`
   (`pipeline-start-preflight.mjs:225`); the mandatory bootstrap skill
   (`plugins/pipeline-core/skills/pipeline-start/SKILL.md:22-24` accepts this status but
   requires `nextAction` "when ready"; `SKILL.md:59-61` requires executing the returned
   `nextAction`; `SKILL.md:80-83` forbids printing the mandatory confirmation line on
   non-ready state) — and `references/onboarding-recovery.md` has no documented recovery
   entry for `"plugin-refresh-required"` (grep: no match). A session that trips this branch
   today, pre-Part-A, already has nothing to execute and no printable confirmation; Part A
   does not create this defect, but it multiplies its population — **rescoped per Critic
   finding F2 (MAJOR, delta re-review `412d33d`), which refuted the "every session, on the next
   plugin refresh" figure this sentence carried before** — from "version-mismatch sessions
   only" to "version-mismatch sessions, plus every session running the plugin out of a real git
   checkout at the self-application layout whose origin/content attestation comes back
   negative" (§A.5 case 2: a marketplace-installed session never reaches the attestation at
   all). That population is far narrower than this document originally stated, and it is not
   empty; for a session that does trip the branch nothing about the outcome improves, so this
   is still not soft/advisory in any operationally meaningful sense as things stand.

   **Resolution chosen — direction (a): a distinct, minimal advisory `nextAction`, not a
   softened claim.** Part A's implementation scope is widened (disclosed here, not silently
   built in) to include a small change to `observePipelineStartPreflight`'s `nextAction`
   computation, plus two companion doc files (`SKILL.md`, edited in two separate places below,
   and `references/onboarding-recovery.md`) — three distinct files at this anchor, which are
   part of, not the whole of, the five-file total §A.6 states and owns as the single source of
   that figure. So the branch this design widens actually has something safe to do:
   - `pipeline-start-preflight.mjs`: when `status === "plugin-refresh-required"`, return a
     new, non-mutating, non-executing `nextAction` shape (e.g. `{kind: "advisory", executable:
     null, argv: [], mutation: false, requiresConfirmation: false, executionBoundary,
     expected: {schema: "pipeline.plugin-refresh-advisory.v1"}}`) instead of `null`.
     `"ready"` keeps its existing onboarding action unchanged; `"plugin-identity-unavailable"`
     keeps `nextAction: null` unchanged — that status stays the genuine hard block (exit `2`
     per `pipelineStartPreflightExitCode`), untouched by this resolution.
   - `SKILL.md` Step 1 (lines 59-61): recognize the `"advisory"` `nextAction` kind as "nothing
     to execute, proceed to Step 2, surface the advisory" rather than an onboarding action to
     run.
   - `SKILL.md` Step 4 (lines 80-83): clarify the "non-ready" language that forbids the
     confirmation line to mean "not `ready` and not `plugin-refresh-required`" — matching the
     status list Step 0/`SKILL.md:22-24` already (inconsistently, today) accepts — so a
     session that only trips an advisory refresh notice can still complete bootstrap and print
     its confirmation, carrying the advisory forward, instead of being silently stuck with no
     action and no confirmation.
   - `references/onboarding-recovery.md`: add the missing documented entry for
     `"plugin-refresh-required"` — advisory-only, no recovery action required, bootstrap
     continues normally with the advisory noted in the confirmation line.

   None of these three files is touched by this design-document revision itself (this document
   stays design-only, per the header) — and neither are the two further files §A.3 items 1 and 3
   touch (the new constant module, and `guard-gate-strength.mjs`, which gains the one
   `GATE_STRENGTH_PATHS` entry protecting that module), which together with these three make up
   the **five files touched in total** §A.6 states, **corrected here
   per Critic finding 2 (MINOR, third Critic pass) from this section's earlier "three companion
   files"/"these four files" framing**, which double-counted `SKILL.md` across its own two
   bullets and therefore diverged from §A.6's category breakdown. §A.6 is the single source of
   this count; this section enumerates only its own local surface and defers the total there.
   These files are the disclosed follow-on implementation surface
   Part A's implementation dispatch must carry in addition to the origin/content attestation
   itself — see §A.6 for the rollout framing and the PO's actual choice, including the
   alternative (day-one hard block) this design does not recommend but discloses.
2. **The check cannot run at all — two distinct sub-cases (corrected per Critic finding F-A,
   MAJOR, delta re-review `7aa84f0`, which found the original text below conflated them):**
   - **Non-git flat-copy install** (no `.git` entry two directories above `pluginRoot` — the
     real marketplace-installed-plugin-cache topology, e.g.
     `~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`): gated by
     `pluginRootHasSelfApplicationGit()` in `pipeline-start-preflight.mjs`, the F2 fix's own
     attestation-gating decision. The observer (`observeCodexPublicCoreIdentity`/
     `observePublicCoreIdentity`) is **never even invoked** in this case — attestation is
     skipped entirely, not attempted, not failed — and `status` falls through unmodified to
     the pre-existing version/installedIdentity/installedVersion-only decision that predates
     Part A (case 1's `"plugin-refresh-required"` branch does **not** apply here; a matching
     version passes as `"ready"`, exactly as it did before Part A shipped). This is the
     topology every ordinary end-user install ships to; see §A.1's corrected guarantee, §A.7's
     matching exclusion entry, and the tracked, disclosed gap in
     `backlog/items/2026-08-07-marketplace-install-topology-unattested.md` (citation repointed
     per Critic finding F1, delta re-review `412d33d`: the item cited here before,
     `…-self-application-integrity-check-absent.md`, tracks the original merge-loss gap, not
     this residual).
   - **Missing `git` binary, or an unhandled exception inside the observer, when a `.git`
     checkout IS present at the self-application layout:** both `observeCodexPublicCoreIdentity`
     and `observePublicCoreIdentity` already fail closed *internally* — every code path
     returns `{status: "rejected", reasonCodes: [...]}` inside a top-level `try`/`catch`
     (`public-core-observation.mjs:323-357`, `:368-377`); neither function is documented or
     observed to throw for an expected failure. A "rejected" observation here is therefore
     just case 1 again, not a separate branch.
3. **Explicit non-goal for this design:** the check must not, on first ship, newly produce a
   *hard* block (`"plugin-identity-unavailable"`, exit `2`) — see the migration note (§A.6)
   for why.

### A.6 Migration/rollout note

**Today, before this ships:** `status` is decided from `version`/`installedIdentity`/
`installedVersion` only (lines 211-215) — no origin/content attestation exists in the
ordinary bootstrap path at all. Every session that currently reports `"ready"` continues to.

**The first session that bootstraps after this ships:** the origin/content attestation runs
in production, ordinary-bootstrap context, for the first time (previously it only ran on the
private-overlay path, which is opt-in and much less traveled) — but only in sessions whose
plugin copy sits in the self-application/dev-checkout topology.

**Rescoped per Critic finding F2 (MAJOR, delta re-review `412d33d`):** this paragraph
previously rested on an assumption this design inherited rather than re-checked — that a real
marketplace-git install (not just local development) preserves a `.git` directory at exactly
`<clone>/plugins/pipeline-core`. That assumption is refuted, and its refutation is what the
earlier Critic finding F2 (`WP2-WP3-partA-rework-1`) responded to: a marketplace-installed
plugin copy (e.g. `~/.claude/plugins/cache/<marketplace>/pipeline-core/<version>`) has no
`.git` at all. The shipped attestation is therefore gated on a real `.git` two directories
above `pluginRoot` (`pluginRootHasSelfApplicationGit()`, `pipeline-start-preflight.mjs`) and is
skipped entirely — not attempted, not failed — for the installed topology (§A.5 case 2). The
rollout reach this whole section reasons about is consequently the self-application/dev-checkout
population only, never "every session everywhere"; the residual for the installed topology is
disclosed in §A.1 (limitation 1) and scoped out in §A.7, both of which carry the citation of
the backlog item that tracks it.

**Corrected per Critic finding F1 (BLOCKER):** the original text below this point asserted a
worst-case outcome that was not actually true of the mechanism as originally specified (see
§A.5's correction). The framing here is now conditioned explicitly on whether §A.5's
companion `nextAction`/`SKILL.md`/`onboarding-recovery.md` fix ships together with the
origin/content attestation, because that fix is what makes the soft outcome real rather than
asserted.

**If the §A.5 companion fix ships together with Part A's attestation** (this design's
recommendation): given the `.git` gating above, the worst realistic day-one outcome is a
previously-silent "please refresh your plugin" advisory newly appearing on some
self-application/dev-checkout sessions, with a working `nextAction` and a printable
confirmation line — never a new
bootstrap failure, and never a new exit-code-2 case. This mirrors the *shape* of WP5's
rollout choice (`specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md` §5:
soft-launch before hard enforcement) even though the mechanism differs — WP5 used an opt-in
`pipeline.user.yaml` key because its blast radius was zero-populated-ledgers-on-day-one; Part
A instead reuses an already-existing status branch (now repaired to actually be soft, not
merely labelled so), because DoD constrains this design to reused primitives and minimal new
surface. **Rescoped per Critic finding F2 (MAJOR, delta re-review `412d33d`):** the second
justification this sentence used to carry — "every session everywhere hits this path
immediately", so a config-gated rollout would be overkill — is refuted by the F2 gate; after
it, the attestation reaches self-application/dev checkouts only, and blast radius no longer
argues for or against a config-gated rollout. What still stands on its own is the narrower
reason: a config-gated rollout would need its own new `pipeline.user.yaml` key, i.e. new
surface the DoD constrains, which this design deliberately avoids adding.

**If Part A's origin/content attestation ships WITHOUT the §A.5 companion fix:** the outcome
is not the soft one described above — it reproduces the F1 defect for every session the new
attestation newly routes into `"plugin-refresh-required"` (`nextAction: null`, no printable
confirmation, no documented recovery path). **Rescoped per Critic finding F2 (MAJOR, delta
re-review `412d33d`):** that population is not the "new, wider scale" this paragraph asserted
before — the F2 gate confines it to sessions running the plugin out of a real git checkout at
the self-application layout (local development and self-application checkouts); a
marketplace-installed session never reaches the attestation at all (§A.5 case 2). Narrower than
stated, not zero, and undiminished in severity for a session that does hit it. This design does
not recommend shipping Part A's attestation on its own for that reason.

**Flagged for the PO (secondary to §A.4, corrected scope):** is treating the §A.5 companion
fix as a hard prerequisite of Part A's ship (not a follow-up) — i.e., accepting the small,
disclosed widening of Part A's own implementation surface — one new `nextAction` shape in the
core script (`pipeline-start-preflight.mjs`, already Part A's own integration point per §A.2),
two companion doc files (`SKILL.md`, `references/onboarding-recovery.md`), one new constant
module, and one new guardrail-protection entry (the latter two per §A.3 items 1 and 3) — five
files touched in total, **corrected here (Critic finding B, second Critic pass) from this
section's earlier, now-inaccurate "four files instead of one" framing**, and this category
breakdown is the single source of that count, which §A.5 now defers to rather than restating
(Critic finding 2, third Critic pass) — so that
"soft/advisory" is actually true — an acceptable reading of "fail closed, consistent
with established convention" for this specific gate? Or does the PO instead want Part A's
origin/content attestation to ship alone, accepting that its day-one failure mode is a
genuine, undocumented bootstrap block (not the soft outcome originally promised) until a later
follow-up repairs it — the honest "day-one hard block" alternative this correction discloses
rather than glosses over?

**Both alternatives above are re-framed on the true post-F2 blast radius per Critic finding F2
(MAJOR, delta re-review `412d33d`); the question itself stays open and is not decided here.**
The second alternative was previously weighed as an "every-session-eligible bootstrap block on
a currently broad blast radius". That premise is refuted: after the F2 gate a hard block can
only reach sessions running the plugin out of a real git checkout at the self-application
layout — local development and self-application sessions — and never a marketplace-installed
one (§A.5 case 2). What the PO is therefore weighing is a bounded, disclosed five-file widening
of Part A's implementation surface against an undocumented hard-block failure mode on a narrow
but developer-facing population — not on the broad population this section asserted before. The
recommendation §A.6 already records (ship the companion fix together with the attestation) is
unchanged by this re-framing and remains a recommendation, not a decision; what changed is the
cost of the alternative, so that the decision is taken on true rather than refuted facts.

### A.7 Explicitly out of scope (Part A)

- **A real integrity check for the installed non-git (marketplace flat-copy) case — added per
  Critic finding F-A (MAJOR, delta re-review `7aa84f0`), which found the code's own citation of
  this exclusion pointed at a bullet that did not yet exist.** The origin/content attestation
  is gated on `.git` presence at the self-application layout
  (`pluginRootHasSelfApplicationGit()`, `pipeline-start-preflight.mjs`) and is skipped
  entirely, not attempted, for the real installed (non-git) topology — see §A.1's corrected
  guarantee and §A.5 case 2. Closing that gap for the real installed topology is tracked
  separately in `backlog/items/2026-08-07-marketplace-install-topology-unattested.md` (`Owner:
  PO`, concrete next step recorded, three candidate directions disclosed and none
  pre-selected), not this design. **Citation repointed per Critic finding F1 (MAJOR, delta
  re-review `412d33d`):** the item cited here before,
  `…-self-application-integrity-check-absent.md`, tracks the original 0.5.2 merge-loss gap this
  design closes; it never tracked this residual, so the link resolved while the claim it
  carried did not hold.
- Reviving `codex-host-plugin-list.mjs`'s retired API surface
  (`observeCodexRulesetSource`, `PUBLIC_SELF_APPLICATION_ORIGINS`) — explicitly forbidden by
  the PO decision; superseded per §A.3.
- A Claude-Code-side equivalent of `observeSelectedCodexPipelinePlugin`'s host-path
  attestation. Main's Claude path (`installedPipelineIdentityClaude`,
  `pipeline-start-preflight.mjs:131-150`) has no analogous "the host itself independently
  confirms this exact path is currently selected" guarantee — `observePublicCoreIdentity`
  alone doesn't provide it either. A Claude-side session's origin-allowlist check is
  therefore inherently weaker on the host-attestation dimension than Codex's. Closing that
  specific gap, if wanted, is a separate design.
- Promoting the failure mode from soft (`"plugin-refresh-required"`) to a new hard status —
  left as an explicit, PO-gated follow-up per §A.6.
- Any change to `.claude/settings.json`, `.codex-plugin/plugin.json`, or any other
  guardrail/config surface — **narrowed per Critic finding F5 (MAJOR, commit `a75a45d`'s
  review):** this exclusion no longer covers the one `guard-gate-strength.mjs`
  `GATE_STRENGTH_PATHS` addition specified in §A.3 item 3, which protects the new
  origin-allowlist module itself. That one guardrail-surface change is now explicitly *in*
  Part A's scope, disclosed here rather than left unprotected behind this blanket exclusion —
  it does not reopen the exclusion for anything else (settings.json, plugin manifests, hook
  wiring, or any other guardrail/config surface stay out of scope, unchanged).

---

## Part B — Codex-under-WSL freshness boundary

### B.1 What guarantee is being restored

On a Codex session running **inside WSL specifically** — where an ordinary sandboxed `git
ls-remote`/`fetch` against the public marketplace is known to fail on a DNS-limited network
path — the plugin-update-availability check
(`inspectPipelineUpdateAvailability` in `ruleset-freshness.mjs`) can complete a genuine,
App-Server-attested read of the public marketplace instead of unconditionally degrading to
`status: "unknown"` on every single Codex+WSL session, as it does today (confirmed: main's
`inspectPipelineUpdateAvailability` has no host-boundary delegation of any kind — it always
calls `spawnSync` directly, per `run()` at lines 38-46, unless a caller overrides
`options.spawn`, which nothing on main currently does). The read stays attested through the
Codex App-Server's own control-channel identity (`observeCodexAppServer`/
`hostControlBinding`) and executed via a literal, sterile `/usr/bin/git` invocation from `/`
with a closed environment — consistent with the threat model's existing "ambient PATH/config
retargets the reviewed public read" mitigation
(`docs/phoenix-governance-threat-model.md:33`).

### B.2 Exact integration point

Two concrete anchors, both verified against the current file, not assumed:

**(a) The scoping bug, independent of the import-chain break.**
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, lines 208-210:

```
const wsl = [env.WSL_DISTRO_NAME, env.WSL_INTEROP]
  .some((value) => typeof value === "string" && value.trim() !== "");
const executionBoundary = wsl ? "host-authorized-wsl" : "default";
```

This computes `executionBoundary` from WSL presence **alone**, not from `runner` (computed
two lines above, at line 190, but never referenced here). Verified against pre-merge
(`998a609`, lines 149-151): the same, equally runner-blind computation existed
pre-merge too — this is not a merge regression, it is a pre-existing bug this design also
repairs while it's in scope. Fix: `const executionBoundary = wsl && runner === "codex" ?
"host-authorized-wsl" : "default";`.

**(b) The freshness read itself.**
`plugins/pipeline-core/scripts/ruleset-freshness.mjs`, `inspectPipelineUpdateAvailability`
(lines 281-379). Its network-touching calls already flow through an injectable seam —
verified by reading `run()` (lines 38-46: `(options.spawn ?? spawnSync)(command, args,
{...})`) and confirming every call site passes `options` through: `selectedChannelTarget`
line 185, the bare-repo `init` at line 315, the `fetch` at line 333, `readMarketplaceVersion`'s
`show` at line 244. **`options.spawn` is an existing, already-present extension point on
main — no new parameter needs to be added to `inspectPipelineUpdateAvailability` itself.**
The repair's integration point is supplying a WSL-host-attested `spawn` implementation as
`options.spawn` from the CLI entrypoint (`runPipelineUpdateAvailabilityCli`, lines 428-437)
precisely when the corrected condition in (a) holds.

### B.3 What is reused vs. new

**Reused, untouched:** `PIPELINE_UPDATE_AVAILABILITY_SCHEMA`/`inspectPipelineUpdateAvailability`'s
entire orchestration model — channel resolution, tag selection, disposable-bare-repo fetch,
policy disposition. The deprecated alias `inspectRulesetFreshness` (line 382) is untouched
and nothing in this design defines a second symbol under that name — confirmed no collision.
`options.spawn` (lines 38-46) is the reused seam, not a new one.

**Reused from the Codex App-Server health path (confirmed still resolvable on main by direct
`node -e "import(...)"`):** `observeCodexAppServer`/`CODEX_APP_SERVER_HEALTH_SCHEMA` from
`codex-app-server-health.mjs` — this import in `ruleset-freshness-host.mjs:32` is **not**
part of the broken chain (see §B.evidence below). The host-control-attestation pattern
(`hostControlBinding`, `canonicalDaemonIdentity`, the sterile `/usr/bin/git` +
`WSL_SYSTEM_GIT_ENV` invocation, `ruleset-freshness-host.mjs:44-156`) transplants cleanly
because none of it depends on the retired single-fixed-action model.

**Not reused, by explicit technical necessity, not just PO preference:**
`ruleset-freshness-host.mjs`'s current `executeRulesetFreshnessHostAction`/
`createFreshnessHostAction` model hard-codes exactly **one** fixed action — literally `git
ls-remote <PUBLIC_MARKETPLACE_URL> HEAD` (`ruleset-freshness-host.mjs:110,138`, pre-merge
`ruleset-freshness.mjs:91-104`). Main's `inspectPipelineUpdateAvailability` needs a
**materially richer** set of reads: `git ls-remote <url> refs/heads/main` (alpha channel —
this repo's own configured channel, per `harness/session-bootstrap.md`'s "Channel
authority" bullet), `git ls-remote <url> refs/tags/*` (stable/beta), and a `git fetch
<sha>:refs/pipeline/marketplace` into a disposable bare repo followed by `git show
refs/pipeline/marketplace:<manifest path>` (needed specifically for alpha, where
`selected.version` is `null` and the version must be read from the fetched commit). A literal
revival of the old single-action model cannot express this — it would, at best, cover only
an approximation of the alpha-channel `HEAD` read (and `HEAD` is not guaranteed identical to
`refs/heads/main`) and leave stable/beta channel reads unrepaired.

**Corrected per Critic finding F2 (MAJOR, commit `a75a45d`'s review):** the original text of
this paragraph listed exactly 5 members and claimed the family covers "the operations
`inspectPipelineUpdateAvailability` actually performs" — that overclaimed. Checked directly,
line by line, against every `run()`/`git()` call site in `ruleset-freshness.mjs`: the function
makes **8** distinct git invocations in total, and only **2** of them touch the network at
all — `ls-remote` (`:185`, resolving the channel target) and `fetch` (`:333`, pulling the
selected commit into the disposable bare repo). The other **6** are local-disk-only and touch
no network whatsoever:

- `:84` `rev-parse --verify HEAD` — reads the LOADED plugin's own `.git` at `pluginRoot`
  (`loadedIdentity()`). Purely local.
- `:236` `rev-parse --git-path objects` — also reads the LOADED plugin's own `.git` at
  `pluginRoot` (`pluginObjectPath()`), to locate the local objects directory used as a fetch
  alternate. Purely local.
- `:244` `--git-dir <temporary> show refs/pipeline/marketplace:<path>` — reads from the
  **disposable LOCAL bare repo** (`temporary`, created at `:315` and fetched into at `:333`),
  not the remote; by the time this runs, the manifest content already exists locally in
  `temporary`'s object store.
- `:255` `--git-dir <temporary> update-ref refs/pipeline/loaded <sha>` — writes a ref inside
  the same disposable LOCAL bare repo, pointing it at the already-known loaded commit. No
  network.
- `:263` `--git-dir <temporary> rev-list --left-right --count ...` — a local ref-graph
  comparison entirely inside the same disposable LOCAL bare repo. No network.
- `:315` `init --bare --quiet <temporary>` — creates the disposable LOCAL bare repo itself, in
  the OS tmpdir. No network.

**Resolution — both (a) and (b), reconciled, not a choice between them:** all 8 invocations
get a typed, individually validated shape in the closed family — preserving the "boundary ID
+ request hash, no argv drift" property the threat model's asset table requires
(`docs/phoenix-governance-threat-model.md`, "Host network capability" row) for every command
that can pass through the injected `options.spawn`, not only the network-touching ones — but
the family is now explicitly **two classes**, not one flat list of 5:

1. **Network-delegated class (2 members): `ls-remote-refs-heads-main`/`ls-remote-refs-tags`,
   `fetch-commit(sha)`** (`sha` validated against `^[0-9a-f]{40}$` before it can enter an
   argv). These are the only two shapes actually routed through the WSL-host-attested
   App-Server channel (§B.1/§B.2(b)) — the genuine reason this design exists, since these are
   the only two calls a Codex+WSL sandbox cannot complete directly.
2. **Local-passthrough class (6 members): `rev-parse-verify-head`, `rev-parse-git-path-objects`,
   `show-marketplace-manifest`, `update-ref-loaded`, `rev-list-left-right-count`,
   `init-bare`.** Each is still matched against its own exact expected shape before it runs
   (same argv-drift discipline as the network class), but on a match the substitute `spawn`
   implementation executes it via the **ordinary, unrestricted local `spawnSync`** directly —
   never through the App-Server host-attestation channel — because none of these six ever
   leaves the local machine; the Codex+WSL sandbox DNS restriction this design exists to work
   around does not apply to them at all, with or without this design.

**The fork this finding identifies is resolved explicitly:** a command matching one of these
8 typed shapes is executed (via the network-attested channel or local passthrough, per its
class); a command matching **none** of the 8 shapes is **rejected** — the substitute `spawn`
never falls through to plain, unvalidated `spawnSync` execution for anything outside this
closed set. This is what keeps the threat model's "No direct fallback after restricted
preflight" mitigation (`docs/phoenix-governance-threat-model.md:31`) intact: an unrecognized
command never reaches a process at all, network-touching or not; only the recognized
local-only shapes are consciously, deliberately excused from the host-attestation detour, not
silently smuggled through it. This also corrects this paragraph's own opening framing: the
family now genuinely covers every operation `inspectPipelineUpdateAvailability` performs (all
8, not 5), and this document's claim to that effect is accurate rather than aspirational. This
is genuinely new design work, not present in either pre-merge or main today; see §B.5 for the
alternative this design rejects and why.

### B.4 Runner/host scoping condition

**`runner === "codex" && wsl`**, using two mechanisms that already exist in this codebase —
neither invented for this design:

- **`runner`:** `env.CLAUDECODE === "1" ? "claude" : "codex"` — verified identical at
  `pipeline-start-preflight.mjs:190`, and, via repo-wide grep, the same pattern (checking
  `CLAUDECODE`) appears as the sole runner-identity mechanism in five other non-test files:
  `session-cleanup.mjs`, `pipeline-state.mjs`, `worktree-create.mjs`,
  `guard-apply-patch.mjs`, `codex-pretool-guard.mjs`. It is also consistent with the
  established `RUNNERS_WITHOUT_APP_SERVER`/`RUNNERS_WITHOUT_NATIVE_READBACK = new
  Set(["claude"])` convention (`codex-onboarding-app-server.mjs:25`,
  `v3-bootstrap-authority.mjs:44`) — "codex" is consistently the fallback identity whenever
  `CLAUDECODE` is not `"1"`, everywhere in this codebase, not just here.
- **`wsl`:** `[env.WSL_DISTRO_NAME, env.WSL_INTEROP].some((v) => typeof v === "string" &&
  v.trim() !== "")` — verified present, byte-identical, in both pre-merge
  (`998a609:plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:149-150`) and current
  main (`pipeline-start-preflight.mjs:208-209`). **Corrected per Critic finding F3 (MAJOR,
  commit `a75a45d`'s review):** the original text here claimed a "repo-wide grep" confirmed
  this the sole mechanism, but the Verification log at the end of this document records that
  grep as scoped to `plugins/` only. Re-run genuinely repo-wide for this correction
  (`grep -rln 'WSL_DISTRO_NAME\|WSL_INTEROP' --include='*.mjs' --include='*.md'
  --include='*.json' .`, excluding `node_modules`): the only matches outside prose
  documentation (this design document itself and the backlog item it cites, both of which
  quote the mechanism rather than implement it) are
  `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` and its own test file,
  `pipeline-start-preflight.test.mjs`. Confirmed the **sole** WSL-detection mechanism in code
  across the whole tree, now checked at the scope the claim actually asserts.

**Confirmation for every other combination** (required by DoD item 4): Claude Code on any
host (`runner === "claude"`, `wsl` true or false) → `executionBoundary` stays `"default"`.
Codex on a non-WSL host (`runner === "codex"`, `wsl` false) → `executionBoundary` stays
`"default"`. In both cases `inspectPipelineUpdateAvailability` runs with the plain
`spawnSync` default — main's current, entirely unmodified direct-read path — and neither
`ruleset-freshness-host.mjs` nor the new host-attested `spawn` substitute is ever
constructed or invoked. Only `runner === "codex" && wsl` routes through the repaired
boundary. This directly closes the concrete bug found in §B.2(a): today, a Claude Code
session running inside a WSL shell (a real, unremarkable setup — Claude Code is an ordinary
CLI, nothing stops it running under WSL) already computes `executionBoundary:
"host-authorized-wsl"` even though Claude Code has no App-Server-attested control-channel
mechanism at all (`hostControlBinding`/`observeCodexAppServer` are Codex-specific).

**Corrected per Critic finding F3 (MAJOR, commit `a75a45d`'s review):** the original text here
claimed that value "is currently inert (nothing consumes it)." That is false, checked
directly: `executionBoundary: "host-authorized-wsl"` is consumed today, live, as a mandatory
host execution profile by
`plugins/pipeline-core/skills/pipeline-start/SKILL.md:71-76` ("Treat
`executionBoundary: "host-authorized-wsl"` as a mandatory host execution profile: submit the
exact returned action directly at that boundary..."). A prior, already-closed backlog item —
`backlog/items/2026-08-05-pipeline-state-rebind-codex-default-runner.md` (status `closed`,
`closed_at: 2026-08-06`) — already recorded this exact defect as one of two cosmetic siblings
of its primary finding: "a Claude Code session under WSL therefore receives Codex-specific
instructions with no documented Claude-side equivalent." That prior item's own fix (commit
`7514fb9`) reworded the adjacent Codex-sandbox-specific sentence in `SKILL.md:75-76` to be
explicitly scoped to Codex ("For Codex, never first retry it..."), but left the first
sentence — the one that treats `executionBoundary: "host-authorized-wsl"` itself as
unconditionally mandatory, regardless of runner — untouched, because fixing the *source* of
the mis-scoped value (this exact `pipeline-start-preflight.mjs:210` computation) was out of
that fix's scope. So today, before Part B ships, a Claude-Code-under-WSL session is actively,
incorrectly instructed to route through a host-attestation boundary it has no mechanism for.
This is a real, live latent defect this backlog item's investigation was launched to find —
not a dormant one — and Part B's §B.2(a) fix genuinely corrects it, which is a point in this
design's favor, not the "nothing to see here, purely inert" framing the original text used.

### B.5 Failure mode

- **Boundary condition holds (Codex+WSL) but host attestation itself fails** — App-Server
  not `CAS-READY`, daemon identity mismatch, git spawn error/timeout, or a returned OID that
  doesn't match `^[0-9a-f]{40,64}$`: the host-attested `spawn` substitute returns a
  failed/non-zero-equivalent result for that specific `run()` call. This is **already**
  handled by `inspectPipelineUpdateAvailability`'s existing logic — it becomes `status:
  "unknown"` with the matching `reason` (`"remote-unavailable"`, `"timeout"`,
  `"comparison-init-failed"`, etc.; lines 190-199, 295-310, 350-361). Nothing new needs to be
  built for this branch: it is the exact, already-fail-open-safe behavior
  `harness/session-bootstrap.md:162` documents today ("Offline/unavailable output is
  `unknown`, fail-open, and never a freshness claim").
- **The scoping condition itself is ambiguous** (missing/malformed `env`): both `runner` and
  `wsl` are already total, side-effect-free computations that default safely — `runner`
  defaults to `"codex"` when `CLAUDECODE` is absent (the historical default, unchanged by
  this design); `wsl` defaults to `false`/`"default"` boundary when neither WSL variable is a
  non-empty string. No new ambiguous state is introduced.
- **This never becomes a hard bootstrap failure.** Per the repo's established convention
  (**corrected per Critic finding F8 (MINOR, commit `a75a45d`'s review)** —
  `harness/session-bootstrap.md:159,162`, not `:154,162,167`: line `154` sits inside an
  unrelated private-overlay bullet and does not support this claim; verified directly that
  `:159` ("Ordinary marketplace drift is advisory metadata and never repository write
  authority") and `:162` ("Offline/unavailable output is `unknown`, fail-open, and never a
  freshness claim") are the two lines that actually state it; threat-model asset table row
  "Public ruleset freshness"), an unavailable/ambiguous freshness read is advisory metadata
  only — it never blocks bootstrap or write authority by itself (only the separate
  `repositoryFreshness` mechanism gates writes). Part B's repair only *widens* when a genuine
  successful read can occur; it never introduces a new way for freshness to fail *harder*
  than `unknown` already does today.

### B.6 Doc updates required

**`harness/session-bootstrap.md:159` — go.** Current sentence: *"On Codex, use the
host-authorized network-open/read-only command boundary directly instead of first producing
a known sandbox DNS failure."* This is exactly the sentence that reads as a universal
Codex requirement rather than a Codex+WSL-specific one, and it is what created the ambiguity
this backlog item's own investigation flagged. Proposed replacement text (substance required,
exact phrasing is the implementation dispatch's to finalize against house style):

> "On Codex running under WSL (detected the same way `pipeline-start-preflight.mjs` computes
> `executionBoundary`: `WSL_DISTRO_NAME`/`WSL_INTEROP` present, AND the runner is Codex, not
> Claude Code), use the host-authorized network-open/read-only command boundary directly
> instead of first producing a known sandbox DNS failure. On every other runner/host
> combination — Claude Code on any host, or Codex on a non-WSL host — the direct read above
> already succeeds without any boundary delegation; do not route those sessions through the
> WSL boundary."

**`docs/phoenix-governance-threat-model.md:61-70` (host receipt package rollback section) —
go, but narrower.** Current text names the rollback unit as `ruleset-freshness-host.mjs`, its
binding in `ruleset-freshness.mjs`, and matching tests/spec inventory. That framing stays
**structurally accurate** after Part B ships (the same three-artifact rollback unit still
exists), but the phrase "its binding in `ruleset-freshness.mjs`" currently points at exports
(`createFreshnessHostAction`, the `FRESHNESS_HOST_*_SCHEMA` family, `inspectCliRulesetFreshness`,
`PUBLIC_MARKETPLACE_URL`, `WSL_FRESHNESS_BOUNDARY_ID`) that will no longer exist under those
names once the new closed action-family (§B.3) replaces the single-action model. **This
design does not propose exact replacement wording**, because the final export names aren't
fixed until the implementation dispatch resolves §B.3's open action-family shape — but it
flags, explicitly, that a follow-up edit to this section is required at implementation time.
Not flagging this now would repeat the exact kind of doc/code drift this session's
investigation already found once (`harness/session-bootstrap.md:159` itself was one such
drift) — see the open item this leaves for the PO/Critic in §B.8.

**`docs/phoenix-governance-threat-model.md:15` (the "Host network capability" asset-table row)
— go. Added per Critic finding F6 (MINOR, commit `a75a45d`'s review):** §B.3 justifies the
widening from one fixed host action to a family by citing exactly this row's "Required
control" text — "WSL/restricted preflight binds one network-open, read-only host action by
boundary ID and request hash" — but the original doc-update list here did not flag that this
row is precisely what the widening falsifies. §B.3's corrected resolution (per F2) makes the
row's accurate replacement text concrete: **two** network-open, read-only host actions
(`ls-remote-refs-heads-main`/`ls-remote-refs-tags`, `fetch-commit`), each still bound by
boundary ID and request hash — not one, and not the full 8-member closed family, since the
other 6 members are the local-passthrough class that never crosses the host-network boundary
this row describes at all. Like the sibling entry above, this design does not propose exact
replacement wording beyond that substance, for the same reason (§B.3's action-family naming
isn't finalized here) — flagged for the same follow-up edit at implementation time, tracked
alongside it in §B.8's open item.

### B.7 Migration/rollout note

Lower risk than Part A, and no opt-in flag is proposed. Today, **every** Codex+WSL session
already gets `unknown`/fail-open freshness output, because the boundary is broken — that is
the current status quo, and it is already advisory-only (§B.5). After Part B ships, the
first Codex+WSL session to run it attempts the real host-attested read for the first time:
if it succeeds, the session sees a genuine freshness comparison where it previously always
saw `unknown` — a strict improvement, nothing existing is removed. If any part of the
attestation fails, the code path degrades to the **exact same** `unknown`/fail-open output
sessions already receive today. There is therefore no plausible path from "working" to
"broken" for Codex+WSL sessions.

**Corrected per Critic finding F3 (MAJOR, commit `a75a45d`'s review):** the original text here
also claimed "**zero** behavioral change for every other runner/host combination." That is
false, falsified by this design's own §B.2(a) fix and §B.4's confirmation section: a
Claude-Code-under-WSL session sees exactly one behavior change — it stops being incorrectly
instructed (via `SKILL.md:71-76`, per §B.4's correction above) to route through a
host-attestation boundary it has no mechanism for, because `executionBoundary` correctly
computes `"default"` for it after this fix instead of the wrong `"host-authorized-wsl"`. The
accurate claim is narrower: **the one behavior change for a non-Codex/non-WSL-Codex
combination is this exact bug fix, and it is strictly a fix, never a regression** — Claude
Code under WSL had no way to satisfy the mandatory boundary instruction it was incorrectly
given (no App-Server-attested control channel exists for it), so the prior state was a latent
defect, not a working behavior this design changes for the worse. Every runner/host
combination other than Codex+WSL and Claude-under-WSL is genuinely unaffected. No
`pipeline.user.yaml` gate key is needed for Part B, unlike Part A — the failure mode is
symmetric with the pre-repair baseline, which is exactly the condition under which WP5's own
design (§5 there) treats an opt-in flag as unnecessary.

### B.8 Explicitly out of scope (Part B)

- **Making the WSL boundary path universal/default for any other runner or host** —
  explicitly forbidden by the PO decision and by this dispatch's prohibitions.
- **Reviving PHX-0B's full identity-comparison model** (`compareLoadedRulesetIdentity`/
  `normalizeRulesetSource`-driven self-application-vs-marketplace source classing *inside the
  freshness path itself*, as pre-merge `inspectRulesetFreshness` did at
  `ruleset-freshness.mjs:306-334`, `998a609`) — main's channel/tag-based
  `inspectPipelineUpdateAvailability` stays the **one** freshness orchestration model, per
  this dispatch's explicit "must not disturb" instruction (§B.3).
- **A Claude-Code-under-WSL host boundary.** Claude Code has no App-Server-attested
  control-channel identity mechanism analogous to `observeCodexAppServer` — building an
  equivalent, if ever wanted, is an entirely separate design, not a re-scoping of this one.
- **Finalizing the exact closed action-family schema/names** for the new host-action family
  (§B.3). This is real remaining design surface, flagged rather than resolved here given its
  security sensitivity (it widens the boundary's action surface from one fixed action to a
  family); recommended as a fast-follow granular sub-design with its own Critic pass before
  implementation, not folded into this document's scope.
- Any change to `.claude/settings.json`, `.codex-plugin/plugin.json`, or any other
  guardrail/config surface.

**Open item (not an out-of-scope exclusion — carried forward from §B.6; added per Critic
finding D, second Critic pass), owner: implementation dispatch, trigger: once §B.3's
action-family shape is finalized.** §B.6's two threat-model doc-update entries
(`docs/phoenix-governance-threat-model.md:61-70`'s host receipt package rollback section, and
`docs/phoenix-governance-threat-model.md:15`'s "Host network capability" asset-table row) both
need exact replacement wording once the new action-family's final export names/shapes are
fixed. This document deliberately does not propose that wording now, for the same reason the
bullet above leaves the action-family schema/names themselves unresolved: the wording depends
on names this design does not fix. The implementation dispatch that resolves §B.3's
action-family shape must carry both threat-model wording updates as part of its own scope —
not leave them to a silent, undocumented follow-up — this bullet is the tracking entry §B.6
points to.

---

## Verification log (commands actually run this session)

- `git rev-parse --short HEAD` → `cbf3050`; `git merge-base --is-ancestor cbf3050 HEAD` →
  confirmed ancestor (HEAD equals the ruleset SHA exactly).
- `node -e "import('./plugins/pipeline-core/scripts/ruleset-freshness-host.mjs')"` →
  `SyntaxError: The requested module './ruleset-freshness.mjs' does not provide an export
  named 'FRESHNESS_HOST_CONTROL_SCHEMA'` — confirms the broken import chain directly, not
  just by reading the backlog item's claim.
- Counted exactly which of `ruleset-freshness-host.mjs`'s 10 non-`codex-app-server-health.mjs`
  imports are missing on main: all 8 named imports from `./ruleset-freshness.mjs`
  (`createFreshnessHostAction`, `FRESHNESS_HOST_RESULT_SCHEMA`, `FRESHNESS_HOST_CONTROL_SCHEMA`,
  `FRESHNESS_HOST_RECEIPT_SCHEMA`, `FRESHNESS_HOST_TRANSPORT_SCHEMA`,
  `inspectCliRulesetFreshness`, `PUBLIC_MARKETPLACE_URL`, `WSL_FRESHNESS_BOUNDARY_ID`), plus
  `freshnessHostActionForPreflight` from `./pipeline-start-preflight.mjs`, plus
  `observeCodexRulesetSource` from `../lib/codex-host-plugin-list.mjs` — matches the backlog
  item's "8 named exports" claim exactly, with the two additional missing imports named
  explicitly here for completeness.
- `node -e "import('./plugins/pipeline-core/scripts/codex-app-server-health.mjs').then(m =>
  console.log(Object.keys(m)))"` → confirmed `CODEX_APP_SERVER_HEALTH_SCHEMA` and
  `observeCodexAppServer` both resolve on main — this specific import in
  `ruleset-freshness-host.mjs:32` is **not** part of the broken chain, and both symbols are
  reusable as-is for Part B.
- `grep -rn "normalizeRulesetSource\|compareLoadedRulesetIdentity" --include="*.mjs"
  plugins/` → confirmed zero production callers outside the primitives' own test file (see
  the verification note at the top of this document).
- `diff -q` between pre-merge (`998a609`) and current `ruleset-freshness-host.mjs` → no
  output (byte-identical) — confirms the backlog item's "merged cleanly, never a conflict"
  claim.
- `grep -rln "CLAUDECODE"` / `"WSL_DISTRO_NAME\|WSL_INTEROP"` across `plugins/` (excluding
  test files) → grounds §B.4's scoping-condition citations in real, existing call sites
  rather than an invented mechanism.
