# Security Guardrails

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
> Audience: every agent role in every pipeline-bound project and in this repo. Highest-stakes zone: <PROJECT_B> (real devices, alarm system, locks — a living house).

**Precedence and enforcement:** as defined in `guardrails/global.md` (header). Security diffs are always risk class HIGH: every security-relevant change triggers a Critic review in `--bare` isolation, with the review tier escalated to a higher-capability model for these security-class diffs (canonical trigger wording: `docs/operating-model.md` §4.2).

Rule IDs: `SEC-xx`.

---

## SEC-01 — Secrets never appear in artifacts

- **MUST NOT** write secret values (tokens, API keys, passwords, credentials, private URLs/paths that grant access) into ANY persisted artifact: docs, specs, briefings, prompts, completion reports, commit messages, telemetry rows, HISTORY/handover entries, code comments, or test fixtures.
- **MUST** reference secrets by NAME and location only (e.g. `{{ENV_VAR_NAME}} from the runtime environment`, `secrets.yaml key {{KEY_NAME}}`), never by value.
- If a secret value has leaked into an artifact: STOP, report to the PO immediately (the value must be rotated — deleting the text does not un-leak a committed secret).
- **Why:** The repos are distributed across two machines and a remote; git history makes every leak permanent. Briefings and reports are persisted and quoted (three-artifacts archive, `docs/operating-model.md` §7) — a secret placed there spreads uncontrollably.
- **Verification:** Secret-hygiene step in the `/close` ritual; the Critic checks artifacts for credential-shaped strings in security reviews. **RESOLVED (SEC-06 below):** the deterministic secret scanner is `harness/scripts/security-scan.mjs`'s `gitleaks` adapter — a manifest-driven, opt-in verify-chain phase, not a per-project ad-hoc decision anymore.

## SEC-02 — Secret-file staging block (guard-enforced)

- **MUST NOT** stage, commit, or push secret-bearing files. Minimum deny set (union across projects): `.env` and `.env.*`, `secrets.yaml`, `.storage/`, credential/key/token files, live databases. Project calibration adds project-specific denies via committed `.claude/settings.json` / guard deny-config — configuration, never a guard fork.
- **Why:** Staging is the last automated interception point before a secret becomes permanent history; the <PROJECT_B> guard proved this block in production.
- **Verification:** git-guard union denies the staging commands with exit 2 + plain-text reason; the bootstrap check verifies the committed denies exist (`harness/session-bootstrap.md` step 3). Union implemented: `plugins/pipeline-core/hooks/guard-git.mjs`; per-deny-rule test cases: `plugins/pipeline-core/hooks/guard-git.test.mjs`.

## SEC-03 — Goldfish receive no secrets

- **MUST NOT** place secret values in Goldfish briefings, context files, or dispatch metadata. Goldfish work is designed to be secret-free: secrets live in the runtime environment or ignored local files, injected by the PO or the runtime where needed.
- A Goldfish whose task appears to REQUIRE a secret value **MUST** trigger its stop condition and report back — never ask around, never read secret stores on its own initiative.
- **Why:** Briefings and completion reports are persisted, versioned artifacts (three-artifacts archive) and get quoted into other contexts; fresh execution contexts have no need-to-know. The cheapest secret to protect is the one never handed out.
- **Verification:** Briefing format check (6 mandatory fields, `docs/operating-model.md` §2.3 — none carries credential values); "task requires secret" is a listed stop condition in briefing templates; the Critic flags credential material in dispatch artifacts.

## SEC-04 — Slopsquatting: verify every new dependency

- Before adding ANY new dependency (package, action, container image, plugin), **MUST** verify: (a) it exists in the official registry under exactly that name (hallucinated names differ subtly), (b) it is the intended, maintained project (repo link, release history, download signals), (c) **the proposed VERSION is current in the registry right now — not a stale, training-cutoff version.** A model's training data freezes at a point in time; the version it "remembers" as latest may be several majors behind, deprecated, or yanked since — check the registry's actual current/recommended listing at verification time, do not pin from memory. Evidence: registry URL + version pinned.
- **MUST** list every new dependency in the completion report under a "new dependencies" item with that evidence; **MUST NOT** slip dependencies in silently.
- New dependencies are at least risk class MEDIUM → Critic trigger per matrix (`docs/operating-model.md` §4.2); CI actions are SHA-pinned (tooling-policy W7).
- **Why:** Slopsquatting is an active attack vector: adversaries register the package names AI models frequently hallucinate. A typo-level name difference is a supply-chain compromise — and a stale training-cutoff version pinned with full confidence is the same failure mode one layer down: correct name, wrong evidence.
- **Verification:** Completion report rubric "new dependencies" filled with registry evidence; lockfile diff is part of the reviewed diff; Critic rubric contains the dependency reality check "do all new imports/packages exist under exactly that name, with registry evidence?" — landed in `plugins/pipeline-core/agents/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, and `harness/checklists/critic-review.md`.

## SEC-06 — Security-scan phase is mandatory when declared; SKIPPED is never PASS

- When the project manifest (`.claude/pipeline.yaml`) declares the `security-scan` phase and the `security` gate is not `mode: off`, the security-scan phase **MUST** run as part of the verify chain — adapters gitleaks (secrets), osv-scanner (known vulnerabilities), semgrep (rule-based static findings, `rules_dir` from the manifest), license-check (declared `third-party-licenses.json` vs. an allowlist).
- Each adapter reports one of exactly four statuses: `PASS | FINDINGS | SKIPPED | ERROR`. **MUST NOT** treat `SKIPPED` (tool not installed/available) as `PASS` — it is reported honestly in the evidence artifact and in any completion report referencing it (QG-05 gate honesty: a gate that silently checks less than assumed produces confident-wrong "done").
- `ERROR` (adapter crashed) is fail-closed — never treated as clean, always blocking-class regardless of findings.
- A finding whose severity is contained in the manifest's `security.thresholds.block_on` (default `[critical, high]`; set-membership check — the list enumerates the blocking severities explicitly, not an ordinal "at or above" relation) blocks the push gate; the gate mode (`blocking|warn|off`) governs how the block surfaces (exit 2 / warn / no-op) — see `guardrails/quality-gates.md` QG-06 and `docs/adr/0027-gate-philosophy.md` for the mode-is-calibration argument.
- **MUST NOT** run the security-scan phase itself inside the gate hook (10s hook budget) — the gate hook only reads evidence freshness (`evidence/security-latest.json`: `exitCode 0` + `commit == HEAD`), never recomputes (`docs/adr/0029-file-handoffs-status.md`).
- **Why:** Slopsquatting (SEC-04) and secret leaks (SEC-01) are exactly the failure modes a scanner catches mechanically and cheaply — but only if a skipped tool is never mistaken for a clean result, and a project without the manifest is never silently unprotected without saying so.
- **Verification:** `evidence/security-latest.json` (schema `pipeline.security-evidence.v0`) carries every adapter's status + the applied thresholds; absent manifest/gate → phase does not run at all (opt-in, no silent partial enforcement); `harness/scripts/security-scan.mjs` is the reference runner.

## SEC-07 — Sandboxing is defense-in-depth, not a replacement for the guards

- Running work inside a sandbox (isolated worktree, container, restricted execution environment) **complements** the guard union (git-guard, testpath-guard, security-scan) — it does **NOT** replace any rule in this file or in `guardrails/quality-gates.md` / `guardrails/token-budget.md`.
- A sandboxed session still needs every SEC-xx rule in this file enforced inside it: secrets stay out of artifacts, staging denies still apply, dependency verification still happens, security-scan still runs where declared. A sandbox narrows the blast radius of a mistake; it does not make the mistake acceptable, and it does not make any guard rule optional.
- **Why:** Defense-in-depth means layers that each hold independently. Treating a sandbox as "the guards are handled elsewhere" reintroduces exactly the single point of failure the layered approach exists to avoid.
- **Verification:** No standalone check — this is a framing/discipline note. If a future sandbox mechanism is adopted for this pipeline, its calibration entry MUST name which guards remain active inside it; "none, the sandbox is enough" is not a valid answer.

## SEC-08 — The agent never handles deploy-target credentials (Release/Deploy phase)

- **MUST NOT** type, store, or otherwise handle DEPLOY-TARGET credentials (the secret that authenticates directly against the deploy destination — a cloud provider API key/token, a registry publish token, a hosting-platform deploy key). This is deliberately NARROW: ambient git-push credentials (the credential that authenticates `git push` itself) are sanctioned, ordinary practice and stay entirely untouched by this rule.
- **MUST** use a reference mechanism instead of an inline value: the preferred form is OIDC/keyless (short-lived, workload-identity-federated tokens minted per CI run, never a long-lived secret at rest); a named CI secret (`ci-secret`, referenced by name only, injected by the CI runner) is the documented fallback where OIDC is unavailable.
- **MUST** treat publish tokens (npm publish token, GitHub Release token, package-registry API keys) AS deploy-target credentials under this rule — they are not a lesser category just because the sanctioned publish path "looks like a normal push".
- **MUST** restrict a deploy adapter's `credentials` field (`templates/deploy-adapter.md`) to exactly one of `{oidc, ci-secret, external}` — an inline credential value in that field is itself a finding, never a valid configuration.
- **Why:** A deploy-target credential grants direct write access to a real destination (a cloud account, a package registry, a hosting platform) — exactly the class of secret SEC-01 already forbids in artifacts, restated here specifically for the deploy surface because the Release/Deploy phase is the first place the pipeline routinely talks to external deploy targets at all, and the ambient-git-push carve-out needs to be explicit so it is not read as a loophole for deploy secrets too.
- **Verification:** `templates/deploy-adapter.md`'s reference form and every shipped example admit only `{oidc, ci-secret, external}` in the `credentials` field, never an inline value; the Critic checks new adapter/deploy diffs for an inline credential the same way it checks for any other secret-shaped string (SEC-01 pattern).
