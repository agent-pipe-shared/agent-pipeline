# Git Guardrails

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3
> Audience: every agent performing git operations in any pipeline-bound project and in this repo (self-application).

**Precedence and enforcement:** as defined in `guardrails/global.md` (header). Deterministic enforcement of the destructive-operation rules is the git-guard union (`docs/adr/0013-git-guard-union.md`); everything it does not catch binds as instruction.

Rule IDs: `GIT-xx`.

> **Windows note (non-rule):** the `gh` CLI under Git-Bash rewrites a leading slash in API paths to a filesystem path before sending the request — always call `gh api repos/...`, never `gh api /repos/...` (the leading slash form silently breaks).

---

## GIT-01 — Commit message format: Conventional Commits, English

- **MUST** write commit messages as Conventional Commits: `type(scope): summary` with `type` ∈ {feat, fix, docs, refactor, test, chore, build, ci, perf, style}; body explains the WHY (cause → effect), not a file list.
- **MUST** write Public Core commit messages in English, per ADR-0011's English-canonical public boundary. The Conventional-Commits format core above (`type(scope): summary`, the type vocabulary, and the GIT-03 trailers) is unaffected and stays non-negotiable. A private overlay may use its configured operator-facing language for its own local history; that configuration never changes Public Core history.
- **SHOULD** carry verification status and decision authorship in the body where applicable — e.g. `Verified: live on device` / `Decision: the PO`. Use the three-valued vocabulary where verification is partial: verified / open / not testable. Field labels (`Verified:`, `Decision:`) and the three-valued status tokens stay ENGLISH (parseable audit trail); free-text values follow the project human-facing language (default English). Example: `Verified: verify green 109/109`.
- A project calibration MAY define an additional message prefix convention on top; the Conventional-Commits core and the trailers (GIT-03) are non-negotiable.
- **Why:** A uniform, parseable history is the cheapest audit trail the pipeline has; the WHY-body is the only place future sessions find intent without replaying chats.
- **Verification:** `git log --oneline -20` sample-check at close; the Critic flags non-conforming messages in reviewed diffs.

## GIT-02 — Atomic commits per work package

- **MUST** commit exactly one coherent work package per commit; **MUST NOT** bundle unrelated themes ("one Goldfish = one task = one revertable unit").
- **MUST NOT** mix functional changes and unrelated doc/housekeeping sweeps in one commit; doc-sync commits accompanying a merge are their own commit.
- **Why:** Theme-mix commits destroy revert granularity — the proven marathon-session failure.
- **Verification:** Each merge/PR maps to one task/spec reference; the Critic flags recognizable theme-mix in diffs (tooling-policy AP-T3, verification section).

## GIT-03 — Anonymous AI-assistance trailer (mandatory, all projects)

- **MUST** end every agent-authored commit message with this trailer:

  ```text
  AI-Assisted: true
  ```

- **MUST NOT** put provider- or model-specific co-author trailers, session URLs or IDs, account identifiers, or any other private correlation data into commit metadata. The anonymous marker is the complete AI-assistance signal; `Dispatch:` may identify a grounded work package but must not encode a provider, account, or session.
- **Why:** Commit history needs a durable, provider-neutral assistance signal without turning public history into a correlation index. Work-package provenance remains in the versioned dispatch record and its grounded `Dispatch:` trailer; full chat logs are not archived.
- **Verification:** `git log -5 --format=%B | rg "^AI-Assisted: true$"` samples the marker; the `/close` ritual checks the current block for prohibited correlation metadata.

## GIT-04 — No force-push, no history rewrite, no destructive bulk operations (guard union)

- **MUST NOT** rewrite history that has been pushed/shared (`rebase` onto published history, `commit --amend` on pushed commits, `filter-branch`/`filter-repo`). Enforcement path: rewritten history only propagates via force-push — which the guard denies.
- **MUST NOT** execute the following, all denied by the git-guard union (union of the three proven project guards, `docs/adr/0013-git-guard-union.md`):
  - force-push in any form (`--force`, `--force-with-lease`, `+refspec`),
  - `reset --hard`, `checkout -- .` / blanket discards of uncommitted work,
  - `clean -f` variants (including against untracked content packs),
  - deleting `main`/protected branches or protected tags (e.g. `archive/*`),
  - `rm -rf` against the repo working tree,
  - staging secret-bearing files (see `guardrails/security.md` SEC-02).
- **MUST NOT** weaken, bypass, or locally patch the guard (no editing of hook config to make a command pass).
- **MUST NOT** rely on interposed global git options (`git -C <path> push --force`, `-c`, `--git-dir`, etc.) to evade the rules above — recognized global options are normalized away before rule matching, closing a known evasion via interposed global options.
- **MUST NOT** rely on GNU long-form `rm` flags (`--recursive`, `--recur`, …) to evade the `rm -rf` rule above — long forms and their unambiguous abbreviations are matched directly.
- **MUST NOT** rely on PowerShell `-Recurse` abbreviations (`-r`, `-re`, `-rec`, `-recu`, `-recur`, `-recurs`) to evade the `Remove-Item` rule above — every unambiguous abbreviation is matched directly.
- **MUST NOT** rely on quoting a destructive command inside an interpreter/remote wrapper (`ssh`, `bash -c`, `pwsh -Command`, `cmd /c`) to evade quote-stripping — a small, high-risk raw-string rule list (`GG-14`/`GG-15`/`GG-16`) additionally matches quoted interpreter payloads, a quoted `git add` of a protected target, and a quoted recursive `rm`/`Remove-Item` of a protected target; the general quote-stripping trade-off (see the guard header, `plugins/pipeline-core/hooks/guard-git.mjs`) remains otherwise unchanged.
- **Double-confirmation override procedure — the legitimate escape when the guard blocks a needed command:**
  1. The Elephant explains the blocked command, the reason, and the risk, and asks the PO.
  2. The PO confirms.
  3. The PO gives a second, explicit confirmation with the fixed phrase `OVERRIDE <rule-id>`.
  4. Execution runs through the documented guard-override mechanism — one-time use, reason recorded, logged loudly, and entered in the handover/telemetry.

  A guardrail diff that implements the override mechanism is itself Critic-mandatory (trigger T1).
- **Mechanism status: shipped.** Every deny rule (union `GG-01`…`GG-16`, file order, append-only; per-project extras `PX-<n>` or an explicit `"id"`) prints its stable rule ID in every BLOCK message — the referent `OVERRIDE <rule-id>` needs. **MUST NOT** (agents): self-arm the override — arming is for the PO's confirmed decision only, never an agent's own initiative.
  - **Arming (visible inline prefix, parsed from the raw command before quote-stripping):**
    - Bash: `PIPELINE_GUARD_OVERRIDE="<RULE-ID>|<token>|<reason>" <blocked command>`
    - PowerShell: `$env:PIPELINE_GUARD_OVERRIDE='<RULE-ID>|<token>|<reason>'; <blocked command>`
    - `process.env.PIPELINE_GUARD_OVERRIDE` is honored as a fallback for the PO's own session-level arming; if both an inline prefix and the env var are present, the inline prefix wins and the ignored env arming is noted on stderr.
  - **Token/reason contract:** the value is exactly three segments split on the first two `|` (the reason may itself contain `|`); `token` is a fresh one-time value (convention `YYYYMMDD-<n>`); `reason` is mandatory and non-empty. A `rule|token` pair is consumed forever after first successful use — re-presenting it blocks, naming the prior consumption.
  - **Ledger:** `.claude/guard-override.log.jsonl` under `$CLAUDE_PROJECT_DIR` (same lookup as `guard-config.json`) — one JSON line per successful override, `{ts, rule, token, reason, command}`; committed as the audit trail.
  - **Fail-closed rule (deliberate inversion of the guard's own fail-open):** malformed arming (fewer than three segments, empty token/reason, or an unknown rule ID) is ignored — rules evaluate as if unarmed, and an "override malformed" warning is always emitted, never silently. A ledger that cannot be appended (e.g. `.claude/` missing) means the override is NOT applied — normal block, explanatory reason. All deny rules are always evaluated; the token is consumed only when EVERY matching rule is the single armed rule — if any other rule also matches, the guard blocks via that rule and consumes/ledgers nothing.
  - **Fallback (mechanism unavailable, e.g. ledger directory missing on this machine):** the original emergency escape stays — STOP and let the PO run the command manually in his own terminal.
- **Project-local `PX-<n>` pattern-writing guidance:** `PX-<n>` entries are project-local `extraDenyPatterns` — the union cannot fix a project's own regex, only document how to write a correct one. Abbreviation classes (a flag with several accepted unambiguous prefixes) MUST be encoded GG-13-style as a nested-optional regex, never as a hand-enumerated alternation that can silently miss a valid prefix — worked example for `Remove-Item -Recurse`: `-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b` matches every unambiguous abbreviation (`-r`, `-re`, `-rec`, `-recu`, `-recur`, `-recurs`, `-recurse`) in one pattern. This is documentation only — no union code change; a project's own regex gaps stay the project's own fix.
- Guard design invariants (do not "fix" them away): broad allows + targeted deny, exit 2 with plain-text reason, fail-open as safety net not prison, why-header per guard (ADR-0013).
- **Why:** These operations destroy work irreversibly; the union exists because the three project guards diverged and NO single incarnation was a superset — every gap was an unprotected project.
- **Verification:** PreToolUse guard active is a bootstrap-check condition (`harness/session-bootstrap.md` step 1/3); guard lives ONLY in the plugin, project repos carry deny-config only — a guard copy in a project repo is itself a finding. Union implemented: `plugins/pipeline-core/hooks/guard-git.mjs`; per-deny-rule test cases (block + allow counter-case each): `plugins/pipeline-core/hooks/guard-git.test.mjs` (run with `node`).

## GIT-05 — Branch, merge, and push rules follow the project calibration

- **MUST** follow the committed project calibration (`.claude/pipeline.json`: `branchModel`, `autonomy`, `wipLimit`, `worktree`) for branching (pr-flow vs. direct-push+staging), merge form, and push autonomy; **MUST NOT** improvise a different flow.
- **MUST** pass the project's defined merge/completion gate before anything reaches `main`: deterministic checks green + evidence (`guardrails/quality-gates.md`) + Critic per risk class (`docs/operating-model.md` §4.2).
- Push/merge autonomy is whatever the calibration grants — and no more; consent for outward-effective actions never carries across contexts (`guardrails/global.md` GL-04). In this repo: pushing `main` at work-package boundaries is standing-approved by PO directive; destructive push forms remain guard-blocked.
- Writing tasks run in a worktree per project calibration (ADR-0008); OPEN (Phase 4): validated worktree tier + fallback per project.
- **Why:** The gate is the central invariant, the form is calibrated — <PROJECT_C>'s PR flow and <PROJECT_A>/<PROJECT_B> direct-push are deliberate differences, not drift.
- **Verification:** Calibration file names the branch model; gate evidence exists before merge; the WIP rule (max 1 open human-gate item per project) is checked at dispatch time.

## GIT-06 — Merge-completion gate

- After every merge/block completion, **MUST** update the project's single handover file (and append the HISTORY entry with lessons) BEFORE the block counts as closed; the "open items / next block" section in HISTORY is generated from or references the handover file — never hand-duplicated.
- **MUST NOT** end a session between merge and handover update ("merge now, doc sync later" is the proven drift point).
- **Why:** Exactly at the post-merge step the documented handover lie arose (<PROJECT_C>: CLAUDE.md claimed a PR unmerged while HEAD was already the merge).
- **Verification:** Deterministic post-merge check in the `/close` skill blocks until the handover file reflects the new state (Phase 3 hook; until then a mandatory ritual step). The session-end commit containing the handover update exists (`git log` shows it after the merge commit).

## GIT-07 — Hook-bypass forms technically blocked by the git-guard (gate honesty)

- **MUST NOT** rely on the following hook-bypass forms to skip the pre-commit/commit-msg hooks (`git commit`) or the pre-push hook (`git push`) — the git-guard technically blocks each, by rule id: `--no-verify` on any `git` subcommand (`GG-17`); the `git commit -n` short flag (`GG-18` — note `-n` on `git push` means `--dry-run` and on `git merge` means `--no-stat`, neither is a hook-skip, and both stay allowed); `-c`/`--config-env core.hooksPath` transient rebind (`GG-19`); `git config [set] core.hooksPath` persistent rebind (`GG-20`).
- **MUST NOT** claim hook-bypass is "impossible" — it is not. The following vectors are documented, not silently claimed covered, in the guard header's "WHAT THIS GUARD DOES NOT BLOCK" section (`plugins/pipeline-core/hooks/guard-git.mjs`): the quoted-value form `git -c "core.hooksPath=..."` (the general quote-stripping trade-off, same as elsewhere in this guard); `--config-env` breaking `git commit` adjacency, which evades `GG-18` specifically (`GG-17` still catches the `--no-verify` form of the same intent); `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` environment-variable config injection; `GIT_CONFIG_GLOBAL=<file>` indirection (uncatchable — the key never appears in the command string); and alias indirection (`git -c alias.x="commit -n" x`).
- The GIT-04 double-confirmation override mechanism applies to `GG-17`…`GG-20` exactly like every other rule id — no separate procedure.
- **Why:** A ruleset that claims more than the guard technically enforces is worse than no rule at all — a false sense of protection invites exactly the bypass it claims to prevent (operating-model §4.1, gate honesty).
- **Verification:** `plugins/pipeline-core/hooks/guard-git.test.mjs` carries a BLOCK case and an ALLOW counter-case per rule id (`GG-17`…`GG-20`); `node harness/scripts/verify.mjs` runs the full suite.

## GIT-08 — Standing push approval does NOT cover a deploy-triggering ref

- **MUST NOT** treat the standing push approval (GIT-05) as covering a push to a deploy-triggering ref (a release tag/branch pattern declared under a manifest `release` section, e.g. `refs/tags/v*`). `standing-approved` covers ORDINARY commits to `main`; it is explicitly carved out for deploy triggers.
- **MUST** obtain a fresh `deployApproval` bound to `{artifact, environment}` (`harness/scripts/pipeline-state.mjs approve-deploy --env <env> --artifact <tag-or-sha> --by <name>`) before a push that fires a `promote:prod`-class deployment to a `human-gate` environment — even when the repo's push gate is otherwise `standing-approved`.
- Enforced by the `guard-push` deploy branch: the deploy branch's approval check runs INDEPENDENT of `gates.push.approval`, so it is never satisfied by the standing approval — see `guardrails/deploy.md` DP-01 for the full rule and `docs/adr/0017-push-policy-standing-approval.md`'s follow-up note for the ADR-side carve-out.
- **Why:** Without this carve-out, `git push origin v1.0.0` would auto-pass under the standing approval and silently fire a prod deploy in CI — a composition bypass. A blanket "pushing to main is fine" approval was never meant to also mean "promoting to prod is fine".
- **Verification:** `plugins/pipeline-core/hooks/guard-push.test.mjs` carries a case where a deploy-triggering push is BLOCKED despite `gates.push.approval === "standing-approved"`; `node harness/scripts/verify.mjs` runs the full suite.
