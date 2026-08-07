# ADR-0051: Dual-runner (Claude Code + Codex), tri-platform (Windows/macOS/Unix-WSL) development contract

> Agent-Pipeline · Sprint Nova · as of 2026-08-04

**Status:** accepted by PO directive (Sprint Nova session) · **Basis:** PO directive, 2026-08-04, given directly in response to the runner-routing defect fixed in commit `7f5ac97` (see Context)

## Context

This session diagnosed and fixed a concrete defect: a Claude Code bootstrap
failed `CAS-DAEMON-INVALID-OBSERVATION` because `pipeline-start-preflight.mjs`
never told `project-onboarding-v3.mjs` which runner was actually
bootstrapping. Every session silently defaulted to `runner: "codex"` and
inherited a Codex-only App-Server/native-readback requirement it had no way to
satisfy — even though this exact repo's own `pipeline.user.yaml` already
declares `runners.default: "claude"`, and the code already defines
`RUNNERS_WITHOUT_APP_SERVER` / `RUNNERS_WITHOUT_NATIVE_READBACK` exemption
sets naming `"claude"` explicitly. The exemption existed in the vocabulary and
was simply unreachable, because no caller threaded the invoking session's own
identity through. Ten separate `lifecycleResult()` call sites in the ready
path silently dropped the caller-supplied runner back to the `"codex"`
default.

This is the signature of an *aspirational* rather than *structural*
dual-runner requirement: code and tests get written and pass under an
implicit single-runner assumption, and the other runner's exemption path rots
silently even while it is declared in the type/Set vocabulary. The same
pattern recurs for platforms: `docs/state.md`'s Cyborg-sprint history records
a shell-dependent red set on native Windows (11 suites red in both Git-Bash
and PowerShell, 25 red in PowerShell alone), a trusted-tool-resolution gap
that makes `security-scan` "clean because skipped" rather than "clean because
scanned" outside an immutable Windows root allowlist, and native-Windows
DACL/durability gaps in `afk-ledger`/`advisory-host-bridge`/
`codex-isolated-critic-contract` — all discovered only when someone actually
ran Verify on that platform, not caught by a structural requirement.

Both runners are already live and configured for this repo
(`pipeline.user.yaml`: `runners.enabled: ["claude", "codex"]`); this ADR does
not introduce either one. It converts an implicit expectation into a checked
contract.

## Decision

> PO directive, 2026-08-04: Agent-Pipeline development is always built for
> both Claude Code and Codex as runners, and must support Windows, macOS, and
> Unix/WSL as platforms, whenever something is built.

Clarification:

- Every capability, script, hook, or gate added to this repo must work under
  **both** Claude Code and Codex. A runner-specific implementation is
  acceptable only paired with an explicit, tested path for the other runner
  (the `RUNNERS_WITHOUT_APP_SERVER` pattern this ADR is a response to is the
  reference shape) — never a silent single-runner default.
- Session/runner identity is threaded explicitly, never inferred implicitly
  or defaulted silently. New gating logic accepts and honors an explicit
  runner parameter/flag; it does not hardcode one runner as the fallback
  default. This is the exact defect commit `7f5ac97` fixed.
- Windows (native, not only WSL), macOS, and Unix/WSL are all supported
  platforms for anything built. A platform-specific code path is acceptable
  only paired with an explicit, tested equivalent for the other platforms, or
  a dated, explicit, PO-accepted gap recorded in `docs/state.md` (the existing
  Cyborg native-Windows precedent is the reference shape) — never a silent
  single-platform assumption.
- A third runner, **Antigravity**, is planned but not yet realized (tracked
  observation: "the planned Gemini/Anti Gravity third runner has not been
  tested", `docs/state.md`). It is explicitly **out of scope** for this hard
  requirement until it lands; it does not retroactively become a required
  target by virtue of this ADR.
- "Support" means focused tests exist and pass for the claimed
  runner/platform combination, or a dated, explicit, PO-accepted gap is
  recorded — an unverified claim of support is not support.
- This is a standing constraint on all future development in this repo, not a
  one-time backfill obligation. Critic review of a checkpoint deliverable
  treats an unaddressed single-runner or single-platform assumption in new
  code as a finding.

## Consequences

**Positive:** closes the exact class of defect just found — a silent
single-runner default reachable through gate-critical bootstrap code —
before it recurs elsewhere. Makes runner/platform coverage an explicit,
checkable property of a deliverable instead of an implicit hope.

**Negative:** raises the cost of every future change. A feature can no longer
ship "Codex-only for now" without either building the Claude Code equivalent
or recording an explicit, dated gap. This will surface more latent
single-runner/single-platform assumptions already in the codebase (for
example: the restart-barrier/native-readback machinery in
`project-onboarding-v3.mjs` still calls `readRestartBarrier` unconditionally
in a code path this ADR's own motivating fix left untouched, because no
concrete failure evidenced it as blocking; see Follow-up).

**Risk:** retrofitting the existing codebase for full compliance is a
multi-session undertaking, not a single PR. Mitigation: this ADR does not
mandate an immediate freeze-and-retrofit; it governs *new* work from
2026-08-04 forward, while discovered gaps in existing code are tracked as
their own dated backlog items (matching the existing Windows-baseline
precedent already established in `docs/state.md`'s Cyborg-sprint history)
rather than blocking unrelated work.

## Alternatives considered

- **A full runner-neutral abstraction layer hiding Codex/Claude differences**
  — rejected: the existing architecture already has principled per-runner
  exemption points (`RUNNERS_WITHOUT_APP_SERVER`,
  `RUNNERS_WITHOUT_NATIVE_READBACK`); a full abstraction layer would be a
  much larger rewrite for marginal gain over threading the real session
  identity through the exemption points that already exist.
- **Codex-primary, Claude Code as best-effort/unsupported** — rejected: this
  repo's own persisted configuration already declares
  `runners.default: "claude"`, and Claude Code is the CLI that surfaced this
  defect in the first place; treating it as best-effort would contradict the
  project's own declared configuration.
- **Defer all platform hardening to a dedicated future sprint, decide nothing
  now** — rejected as the sole approach: the sequencing is retained (see
  Consequences/Risk — this is not a freeze-and-retrofit mandate), but the
  contract itself is adopted now so that no *new* work compounds the gap
  while dedicated hardening is pending.

## Follow-up

- When Antigravity (or any further runner) is actually realized, this ADR is
  revisited and superseded to bring it into the same hard requirement.
- Track discovered runner/platform gaps as dated backlog items referencing
  this ADR, starting with: the unconditional Codex-specific restart-barrier
  read in `project-onboarding-v3.mjs`'s ready path (noted above, out of
  scope for commit `7f5ac97` because no concrete Claude Code failure
  evidenced it), and the native-Windows Verify red-suite class from the
  Cyborg-sprint history in `docs/state.md`.
