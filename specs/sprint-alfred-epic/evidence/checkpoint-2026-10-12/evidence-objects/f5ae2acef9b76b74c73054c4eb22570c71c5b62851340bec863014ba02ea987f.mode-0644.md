# Admin steps inventory per runner

Inventory of the human admin steps a user of Agent-Pipeline performs, per
runner, each classified as `required because <gate>` or `automatable (<how>)`
(PO decision AO, `specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md:47`).
It lists only steps that its sources name; it is not a setup guide (see
[SETUP.md](../SETUP.md)) and not a claim that a listed automation exists.
A step marked `automatable` is still manual today.

Runner list and evidence boundaries: `docs/runner-support.md:16-20`. Rows `C1`-`C9`
are runner-neutral and apply to every runner; they are listed once below.
Source refs use `file:line`. `T<n>` = row of
`specs/sprint-alfred-epic/evidence/toil-log-2026-10-06-07.md`.

## Runner-neutral rows (C1-C9, apply to Claude Code, Codex and Antigravity)

| ID | Step | When | Who | Classification | Source |
|---|---|---|---|---|---|
| C1 | Install `commit-msg` hook: `commit-msg-hook-install.mjs --install` | per host | PO terminal | automatable (bootstrap typed next action, HOOKREFRESH) | T53 (toil log:57); `plugins/pipeline-core/scripts/commit-msg-hook-install.mjs:534` |
| C2 | Install `pre-commit` hook: `pre-commit-hook-install.mjs --install` | per host | PO terminal | automatable (bootstrap typed next action, HOOKREFRESH) | T53 (toil log:57); `plugins/pipeline-core/scripts/pre-commit-hook-install.mjs:1030` |
| C3 | Install `pre-push` hook: `pre-push-hook-install.mjs --install` | per host | PO terminal | automatable (install with the plugin or clone provisioning) | T4 (toil log:10); `plugins/pipeline-core/scripts/pre-push-hook-install.mjs:800` |
| C4 | Set `gates.push_approval` in `pipeline.user.yaml` | per project (once) | PO | required because the push gate has an approval mode to choose (ADR-0056) | `docs/push-release-flow.md:80-88` |
| C5 | Create the external PO key directory and Ed25519 key (outside the checkout) | per host (once) | PO terminal | required because the agent must be unable to produce the proof (ADR-0055) | `docs/push-release-flow.md:80-88`, `:369-371` |
| C6 | Make the key directory known to the tool (`PIPELINE_PO_APPROVAL_DIRECTORY` or `--directory`) | per host | PO terminal | automatable (resolve machine-wide and offer a typed setup action; T14) | `docs/push-release-flow.md:218-227`; toil log:20 |
| C7 | Run `authorize-critical`: type `approve`, enter passphrase | per push / per release | PO signature | required because the push and release-preflight gates need a detached human proof (ADR-0061, ADR-0064) | `docs/push-release-flow.md:151-216`, `:263-281` |
| C8 | Run the signing command in an attended terminal, never through the session | per push / per release | PO terminal | required because openssl needs a controlling terminal for the passphrase | `docs/push-release-flow.md:208-216` |
| C9 | Ensure openssl is resolvable for signing (non-default Git install root) | per host | PO terminal | automatable (toolchain check and resolution by the Pipeline; T15/T16) | toil log:21-22 |
| C10 | Check GitHub ruleset `protect-main` before a release (Layer 6) | per release | PO (repo admin) | required because the remote ruleset is outside the checkout and only the PO can change it | `docs/push-release-flow.md:556-588`, `:621` |
| C11 | Approve `gh release create` for tag and release | per release | PO | required because release creation needs a separate action-bound PO authority | `docs/push-release-flow.md:590-608` |
| C12 | Hand-run lifecycle verbs refused to the agent (`present-plan`, `design-course-session --run-v2`, continuity writes) via `!` | per design course | PO terminal | automatable (catalogue-admit every prescribed verb; T21, T23, T24) | toil log:27, :29, :30 |

Agent-executable layers (1b reconcile, `push-init`, `push-prepare`, `approve-push`,
`git push`) need no human step: `docs/push-release-flow.md:610-622`.

## Claude Code

| Step | When | Who | Classification | Source |
|---|---|---|---|---|
| Install plugin via `/plugin` menu, confirm, `/reload-plugins` | install | PO | required because a committed binding alone does not reliably trigger the install prompt; hooks only reach a project through the plugin | `harness/session-bootstrap.md:279`, `:66` |
| Trust the project folder (install prompt for the committed `.claude/settings.json` binding) | install | PO | required because the binding is a declaration, enforced only once trusted | `harness/session-bootstrap.md:56` |
| Marketplace/plugin update plus `/reload-plugins` when update is recommended | per session (when notified) | PO | automatable (the helper deliberately never updates; a typed next action could offer it) | `harness/session-bootstrap.md:211`, `:181` |
| Run `git restore` etc. in own terminal when the auto-mode classifier refuses | per push (when refused) | PO terminal | required because the classifier is a harness layer outside the Pipeline | `docs/push-release-flow.md:516-554` |
| Edit `.claude/settings.json` guard/permission surfaces | on demand | PO | required because the self-sealing surface rejects agent edits | `docs/push-release-flow.md:544-554` |
| Do not use Desktop WSL sessions for a governed repository | per session | PO | required because those sessions load no plugins, so no guard runs | `docs/runner-support.md:33` |
| Run signing and `!` commands in the integrated or an external terminal (Desktop) | per push | PO terminal | required because of C8 | `docs/runner-support.md:35` |

## Codex

| Step | When | Who | Classification | Source |
|---|---|---|---|---|
| Update via `/plugins` then `/new` when update is recommended | per session (when notified) | PO | automatable (helper never updates or restarts; operator boundary stays explicit) | `harness/session-bootstrap.md:211` |
| Select official versus local Pipeline source for the shared Codex App Server (affected sessions closed) | per host | PO | required because one App Server cannot run different Pipeline versions per repository | `harness/session-bootstrap.md:185` |
| Install and bootstrap only for the runner in use; confirm model routing | install | PO | required because model routes this runner cannot use stay unavailable | `docs/runner-support.md:10-14` |
| Run Codex design-readiness bootstrap script on a fresh host | per host | PO terminal | automatable (fold into the bootstrap typed next action) | `plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs` (no toil row; cited as existing script only) |

## Antigravity (agy)

| Step | When | Who | Classification | Source |
|---|---|---|---|---|
| Bind the workspace-local native plugin and confirm installed host and hook readback for the actual workspace | install / per host | PO | required because live enforcement is not proven by Codex/Claude tests | `docs/runner-support.md:20` |
| Verify commit authorship after a headless implementation return | per dispatch | agent or PO | required because a headless return alone is not commit authorship evidence | `docs/runner-support.md:20` |
| Install only for the runner in use; confirm model routing | install | PO | required because unavailable routes stay explicit | `docs/runner-support.md:10-14` |

Counts (rows; C-rows counted once): neutral 12 = 6 required, 6 automatable;
Claude Code 7 = 6 required, 1 automatable; Codex 4 = 2 required, 2 automatable;
Antigravity 3 = 3 required, 0 automatable.

## Planned automation

- **HOOKREFRESH (planned, decision M):** acceptance check from T53 (toil log:57): a
  fresh host installs and refreshes all three hooks (C1-C3) through the
  bootstrap's typed next action, without manual commands.

Candidate backlog items (titles and proposals only; no files created, due dates
to be set by the PO):

1. **Auto-install pre-push hook with the plugin** (C3, T4): provision it during install or clone provisioning.
2. **Machine-wide key directory resolution** (C6, T14): resolve `poKeyDirectory` once and offer a typed setup action when absent.
3. **Signing toolchain readiness** (C9, T15/T16): check and resolve openssl in the readiness report with a typed repair per finding.
4. **Catalogue-admit prescribed lifecycle verbs** (C12, T21/T23/T24): every verb the course prescribes runs for the agent in its state.
5. **Typed plugin-update next action** (Claude, Codex): bootstrap offers the runner's update command instead of prose.
6. **Codex bootstrap in the typed next action** (Codex): include the design-readiness bootstrap in the fresh-host action.
