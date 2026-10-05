# Critic record — FANOUT bundle remainder (bounded re-review)

- Review object (enumerated): `ee8c016b5` (full), `e83579302` and `f02a811d8` (registry's unreached scope only)
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 24 of 24 (5 spent on guard refusals); notes persistence unavailable (`GUARD-DEVPLAN-SHELL` on the notes write; no write tool). This file is the Elephant's record of the returned report.
- **Verdict: withheld — partial review** (category 7 not reached for any commit). F1–F3 stand independently.

## Findings

### F1 — major: the git spawn named in registry F-A persists in the default `requiresEnforcement` path

`stop-fanout.mjs:153-155` calls `observeGovernanceScope({ rootDir: cwd })` whenever the config carries no boolean
`requiresEnforcement` (header `:51-52` names this the default and says it spawns git transitively), on every configured
Stop before `evaluate` (`:162`). That reaches `discoverRepository` (`governance-scope.mjs:9`), which runs git three
times (`worktree-lifecycle.mjs:257`, `:264`, `:277`). No test covers the route (test comment: "that route is not
exercised here"); the remedy is deferred to S8 wiring in a comment without owner/expiry. Making the boolean mandatory
would bypass design §3.3 rule 3 (same admission rule every hook uses), so the conflict needs a decision. Latent (hook
unwired, shadow default). Spec-ref: design §3.6, §8 Native Windows, §3.3 rule 3; QG-06.

### F2 — major: `commonDir` is now a required absolute host path; without it the governor is silently inert

`ee8c016b5` made `commonDir` required and absolute (absent → fail open silently, no ledger write, no `stop-eval`, no
diagnostic; SF21 pins it). The design derives `<git-common-dir>` via `resolveGitCommonDir` (§3.2, §5) and forbids host
paths in configuration (§8 Repository/Consumer row). `guard-dispatch.mjs:273-279` still falls back to
`resolveGitCommonDir(cwd)`, contradicting its own claim (`:141`) that it mirrors `stop-fanout.mjs`. Effect: dispatch
checks stay active while the turn-end governor (design §0 verdict 2) is silently off; shadow mode never accumulates the
would-have-blocked counts that gate the move to enforce (§3.3 Modes). Supplying the key puts a machine path into
config (§8). Latent until S8.

### F3 — major: on native Windows the hook spawns `powershell.exe`, and SF22 was written to tolerate it

`scratch/FANOUT-F5b/green.log` records 4 `spawnSync powershell.exe` via
`windows-private-state.mjs > private-boundary.mjs > fanout-ledger.mjs > stop-fanout.mjs` in one enforce evaluation;
`red.log` shows SF22's original strict form failing on exactly those. The committed SF22 filters out spawns whose chain
includes `fanout-ledger.mjs` and only emits a diagnostic. Design §8 Native Windows: "no shell, no git … spawns nothing".
Documented in the header, "tracked separately" in the message, but no reference in the diff (the separate item is
`backlog/items/2026-10-06-fanout-ledger-spawns-powershell-on-every-stop-on-windows.md`). `windowsHide` not checked.
Spec-ref: design §8; QG-06; category 5 (newly tolerant check).

## Deliberately not flagged (summary)

`scopeWithin` and slice-queue scope functions (refusals of absolute, home-relative, drive-letter, parent-segment and
unterminated-class scopes; structural cover; literal-file fallback; `*` never covers `**`); `liveSlices`/`derive` union
per §3.2 (heartbeat `agentId` producer binding not verified — candidate only); `ee8c016b5` early exits precede
state/ledger access, no `node:child_process`; SF20 stricter, SF23 proves the tripwire records; corpus 20→23; scope
matches design §6 S5; authorship records cover committed files, `Commit-Act: orchestrator` disclosed; security,
dependencies, language clear.

## Trajectory

Consistent for stop-fanout: red (SF21, SF22 fail), red2 (SF21 only), green 23/23, exit codes match. Not verifiable:
"governor 33/33; consumer-safe-paths 9/9" (no artifact); logs carry no timestamps or tree hashes.

## Not reached

Category 7 for all three commits (`guardrails/global.md`, `guardrails/quality-gates.md`, `guardrails/security.md`,
`CLAUDE.md`); `governance-scope.mjs:230-396`; `fanout-ledger.mjs:286-296`; `slice-queue.mjs:1-185`;
`windows-private-state.mjs`; `private-boundary.mjs`.

## Briefing violations

None. Commit-message narrative read as claims to test.
