---
schema: pipeline.backlog-item.v1
id: pipeline.no-uninstall-path-for-a-repository-that-once-opted-in
type: requirement
owner: pipeline
status: open
created: 2026-09-28
source: "PO request 2026-09-28 (read-only diagnosis session): once the Pipeline was activated in a repository, there is no sanctioned way to remove it again without deleting content or leaving something broken. Findings from source reading of scripts/project-reset.mjs, scripts/{pre-push,pre-commit,commit-msg}-hook-install.mjs, lib/project-onboarding-v3.mjs, and the ungoverned-hook probe."
sprint: alfred
done_when: manual
---

# No uninstall path for a repository that once opted in

## Description

A repository that once opted into the Pipeline cannot leave it again in a
sanctioned way. The PO's requirement:
- uninstall removes the Pipeline **mechanics** from the repository;
- it keeps **all content** (code, docs, specs/design packages, ADRs, backlog,
  handover records, git history);
- afterwards, everything keeps working: `git commit`/`git push`, build, tests,
  and the agent runners in that repo.

The closest existing mechanism, `scripts/project-reset.mjs` (plan/apply,
digest-bound, journaled), has a different purpose. It returns a stuck project
to a **pre-onboarding** state so it can onboard again. It deletes seeded state
such as the handover and the calibration, and it expects the repository to be
governed again afterwards. Reusing it as an uninstall would delete records the
PO wants to keep, and it would break git (see B1).

## What breaks or goes wrong if someone "just deletes the Pipeline files" today

- **B1: git commit and push stop working.** The git-level backstops install a
  `/bin/sh` shim into `.git/hooks/{pre-push,pre-commit,commit-msg}` (or the
  `core.hooksPath` directory) whose only line is
  `exec node "<git-common-dir>/agent-pipeline/<hook>/impl.mjs" "$@"`
  (`pre-push-hook-install.mjs` `renderShim`). Remove `.git/agent-pipeline/`
  (which `project-reset` does wholesale), and every push and commit fails:
  node cannot find the impl, the hook exits non-zero, and git aborts. The
  shims must be removed first, through each installer's own `--remove` verb,
  which verifies the marker hash before touching anything. `project-reset.mjs`
  does not handle these shims at all (no reference to `hooks/`,
  `pre-push`, `pre-commit`, or `commit-msg`).
- **B2: latent variant of B1 without any uninstall.** The impl bakes an
  **absolute plugin lib path** fixed at install time (`pluginLibDir`, "baked in
  as an absolute path fixed at install time"). A plugin update that prunes the
  old versioned cache directory (Claude `~/.claude/plugins/cache/…/<version>/`,
  Codex `~/.codex/plugins/cache/…/<version>/`, agy's pruning since CLI 1.2.7),
  or a global plugin uninstall, can therefore break commits and pushes in
  every repository that once installed the hooks. **This needs verification
  as a separate defect.** Uninstall and upgrade must both handle it.
- **B3: the repository immediately gets the ungoverned-repo behaviour.** Once
  the governance markers are gone, the repo is "ungoverned", and today that
  means blocked writes, contradicting injections, and state writes (see
  `2026-09-28-pipeline-hooks-act-in-repositories-that-never-opted-in.md`
  F1–F11). An uninstalled repo must end in a durable **declined** state, or
  the Pipeline starts asking and blocking again the next session.
- **B4: key-level projections.** The Pipeline patches owned **keys** into
  project-owned files. `project-reset` classifies such a present file as a
  typed refusal ("key-level surgery is unimplemented"). An uninstall needs
  that surgery: remove exactly the owned keys and leave the rest of the file
  byte-identical.
- **B5: the agent-composed `rm -rf` risk.** It returns, exactly as recorded in
  `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` (`docs/` swept
  whole). The paths must be **derived**, never recalled.

## Footprint inventory (derive per repository; never hardcode)

Reuse `project-reset.mjs`'s derivation, which resolves the authority tier via
`resolveAuthorityArtifactPath`/`AUTHORITY_ARTIFACTS`, reads
`calibration.handover`, and reads the runtime-projection manifest
`loadRuntimeProjectionV3OwnedKeys().targets`. Extend it with the rows marked
new below.

| Area | Items | Uninstall default |
|---|---|---|
| Authority/config | `pipeline.user.yaml`, `project/pipeline.{json,yaml}` or legacy `.claude/pipeline.*`, `project/pipeline-state.json`, `guard-config.json`, critical-human-proof policy file | **remove** (mechanics) — option `--archive` moves them to an archive folder instead |
| Runtime projections, whole-file | `.codex/agents/*.toml` (Pipeline role prose) | remove |
| Runtime projections, key-level | owned keys in project files (for example Claude model routing, human-role display) | **strip keys only** (B4) |
| Preserve-only files | `.claude/settings.json`, `.codex/config.toml` | keep. **New:** also strip a project-level `enabledPlugins` entry for `pipeline-core`, **only if** onboarding or setup wrote it (verify who writes it; this repo's own `.claude/settings.json` carries one) |
| Seeded entry/docs | `AGENTS.md` (onboarding target `project-entry`), `architecture/map/*` | **content by default: keep.** Offer removal only if the bytes are unchanged since seeding (digest match); otherwise keep |
| Handover/records | `docs/state.md` (or the configured `calibration.handover`), `specs/**` design packages, `docs/adr/**`, `backlog/**` | **keep** (content). Unpromoted kickoff anchors `specs/kickoff-<16hex>/` may be removed |
| `.gitignore` | seeded whole-file (only if onboarding created it) or lines the agent appended (`/scratch/`, `/evidence/`, `/project/pipeline-state.json`) | keep by default. Removal only for the exact seeded file with an unchanged digest |
| Working dirs | `scratch/`, `evidence/` | keep `evidence/` (records); `scratch/` removable with confirmation |
| Consent markers **new** | `.claude/.pipeline-install-consent-*.json` | remove |
| Git hooks **new** | `.git/hooks/{pre-push,pre-commit,commit-msg}` shims or the `core.hooksPath` equivalents | remove via each installer's `--remove`, **before** private state (B1). A foreign or modified hook is never touched: report it |
| Private state | `.git/agent-pipeline/**` (ledgers, HGO audit keys and requests, budgets, slicing, run locks, bootstrap receipts, hook impls) | remove **last**. Offer `--archive-private-state <dir>` first, because the audit ledgers may matter |
| Workspace runner bindings **new** | agy `.agents/plugins.json` Pipeline entry, `.agents/hooks.json` Pipeline entries; Claude/Codex project-scoped plugin enablement, if the per-project scoping from the agy item is adopted | remove only the Pipeline entries, with the installer's atomic registry writer |
| Outside the repo | user-scope plugin enablement, runner trust entries, Claude/Codex transcripts under the HOME stores | **never touched** by a per-repo uninstall. State this explicitly |

## Proposal

1. **Command:** `node <plugin>/scripts/project-uninstall.mjs plan|apply --root <repo> [--archive <dir>] [--archive-private-state <dir>]`.
   It shares derivation and journal code with `project-reset.mjs`, factored into
   a lib, and it is a separate mode with its own classification: keep content,
   remove mechanics. `plan` is read-only and prints `remove` / `strip-keys` /
   `keep` / `neverTouched` / `foreign-untouched`. `apply` is bound to the plan's
   digest.
2. **Order inside `apply` (resumable, journaled):**
   1. Re-verify the plan digest and a clean-enough tree. Refuse if the tree has
      unrelated uncommitted changes in affected files.
   2. Remove the git hook shims via the installers' `--remove`.
   3. Strip the owned keys.
   4. Remove whole-file projections and consent markers.
   5. Remove or archive the authority artifacts.
   6. Remove workspace runner bindings.
   7. Write the durable **declined** marker (from the ungoverned-hooks item,
      for example `git config agent-pipeline.optOut true`).
   8. Remove or archive `.git/agent-pipeline/` **last**. The journal must live
      where it survives until the final step, or be deleted as the final step.

   An interrupted apply leaves either the original state or a state the next
   `apply` resumes from. It never leaves a state in which the remaining steps
   lose their authority (the lesson from the start-over item).
3. **Readback (part of `apply`, not a separate promise):**
   - no governance marker remains, and the state is `declined`;
   - no file in the repo, `.git/config`, or `.git/hooks` references the plugin
     path or `.git/agent-pipeline`;
   - `git commit` (allow-empty in a temp index or scratch branch) and a
     `git push` dry run to a local bare remote succeed with hooks active;
   - content files listed as `keep` are byte-identical to before (digest list
     in the journal);
   - the ungoverned-hook probe reports inert for this repo.
4. **The uninstall itself must be permitted.** Several steps touch paths the
   guards protect (for example GG-12 on `.git/agent-pipeline`, gate-strength
   paths). The uninstall runs as a sanctioned lifecycle command (admitted like
   `project-reset`), with one explicit PO confirmation at plan time. There
   must be no chain of per-step override ceremonies.
5. **Commit guidance:** the uninstall leaves a working-tree diff. The tool
   prints a suggested Conventional Commit. Under the ungoverned-hooks
   proposal, GIT-03 trailers must no longer be demanded for that commit in a
   now-declined repo. Until then, name that conflict.
6. **Re-onboarding later:** `opt-in` clears the declined marker. Onboarding
   must accept a repo with retained records (`docs/state.md`, `specs/`)
   without clobbering them.
7. **Tests (fixtures per runner: Claude, Codex, agy):**
   - onboard → install all three git hooks → create content → uninstall →
     assert the readback in item 3;
   - an interrupted apply at every journal stage is resumable;
   - a foreign `pre-push` hook is untouched;
   - a modified `AGENTS.md` is kept;
   - an `--archive` variant;
   - a later re-onboarding works.
   Plus a B2 test: remove the plugin directory the impl was baked against →
   the hooks must fail *safe with a clear message* or be re-pointed. Decide
   the policy.
8. **Docs:** a SETUP.md "Uninstalling from a repository" section, and a
   statement that a global runner-level plugin uninstall is a separate step
   and does not clean repositories. Mention B2 as the reason to run the
   per-repo uninstall first.

## Open questions for the spike

- Who writes a project-level `enabledPlugins: pipeline-core` into a
  consumer's `.claude/settings.json`: setup, onboarding, or the user?
  Classify it accordingly.
- The full list of seeded files per onboarding path (greenfield vs adoption)
  and per runner. Derive it from `project-onboarding-v3.mjs` targets rather
  than from this item.
- Should `evidence/` and the HGO audit ledgers be archived by default,
  since they are governance records?

## Related

- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` (closed; its R2
  reset is the reuse base and the design constraints still apply: derive,
  never recall; remove seeded files by name, never containers; atomic or
  refuse to begin).
- `2026-08-09-project-reset-does-not-classify-the-proof-policy-artifact.md`.
- `2026-09-28-pipeline-hooks-act-in-repositories-that-never-opted-in.md`
  (declined state, inert contract).
- `2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md`
  (runner-level bindings).

## Triage

Independent targeted verification confirmed B1 through canonical reset and an
actual failed Git commit. B2's install-time path dependency was reproduced with
a controlled library copy; actual runner cache pruning remains unverified. See
the [tracked diagnostic evidence](../evidence/2026-09-28-activation-uninstall-targeted-verification.md).
B4's key-surgery limitation exists in source but is currently unreachable from
the present projection manifest; it remains an uninstall design requirement.

- **Decision:** Accepted into the next local 0.7 candidate by explicit PO request.
  Implement a separate repository uninstall lifecycle; reset is not uninstall.
- **Rationale:** Preserve user content and history, retire only proven Pipeline
  mechanics, remove owned Git shims before their implementations, and leave a
  durable declined state. The absolute plugin-path dependency is reproduced in
  isolation; actual upgrade pruning is still not a measured live failure.
- **Assignment:** Uninstall plan/apply and ownership inventory slice. Depends on
  the shared activation/decline contract; coordinate hook removal with their
  installers and runtime binding removal with the Agy topology slice. Use local
  isolated repositories and remotes for acceptance, never the PO's live project
  as a destructive test fixture.
- **Date:** 2026-09-28
- **Scope record:** [Candidate scope intake](../evidence/2026-09-28-candidate-scope-intake.md).
