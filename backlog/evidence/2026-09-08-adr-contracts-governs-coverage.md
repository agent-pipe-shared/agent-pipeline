# Contracts-8 responsibility rationale

The four accepted decisions retain their historical normative text. Their
`Governs:` headers name current root-canon, direct enforcement, and direct-test
owners. They do not claim that every obligation already has a complete
implementation. `node scratch/NVA-B-ADR-GOVERNS-CONTRACTS-8/check.mjs` uses the
real reconciliation parser, proves every declared target resolves to a tracked
file, rejects duplicate declarations, compares all remaining ADR bytes to
`9f8d13d2f56ef84288dc50a5dc2d6d6336606112`, and writes current source hashes
and status-classifier results to its private scratch report.

## ADR-0013 — central git guard and project deny configuration

`guardrails/git.md` is the canonical instruction-level explanation of the
deterministic precedence. `guard-git.mjs` is the shared deny implementation,
its direct test proves union and project-extra behavior, and `hooks.json`
wires the Claude path. Codex and Antigravity each select and execute that same
guard through their native pretool adapters; both adapters and their direct
tests are named because their `guardNames` arrays contain `guard-git.mjs` for
Git-bearing Bash input. `project-authority.mjs` resolves the neutral
`project/guard-config.json` authority (with legacy fallback) that the guard
loads, and its direct test binds that authority contract. The generated destination is
`plugins/pipeline-core/docs/adr/0013-git-guard-union.md`; the root ADR remains
the authority, and parent owns serial generation and byte-identity verification.

## ADR-0014 — independent read-only Critic

The operating model, Critic role, protocol, checklist, template, agent
definition, and Critic skill carry the role's input, independence, reporting,
and read-only obligations. The citation checker and direct test bind their
references. The declared compatibility source/schema/module/test plus
preflight, Claude native-bare, and Codex selected-host/AppServer/bridge/receipt
and isolated-contract entrypoints are the current selected-runner and
functional-equivalent paths. Their direct tests and verdict schema bind the
actual isolation and result claims. The generated destination is
`plugins/pipeline-core/docs/adr/0014-critic-contract.md`; parent owns its
serial generation.

## ADR-0015 — Pipeline self-application

`CLAUDE.md`, calibration, operating model, canonical handover, language policy,
and Elephant/Critic/protocol/template carriers make the Pipeline repo subject to
the same lifecycle, language, evidence, and independent-review method. The
self-application attestation gate and its test, its public-origin/source inputs,
and bootstrap preflight plus direct test make the current source-attestation
path concrete. This ADR is explicitly self-only in the vendored-canon manifest,
so it has no generated destination.

## ADR-0016 — GitHub baseline and the distinct GitLab pilot

`docs/adr/README.md` exposes the historic re-review record and
`docs/design-decisions.md` records the current GitHub server-side context. The
marketplace manifest owns the source-plugin distribution identity. The public
origin observer and allowlist bind the reviewed GitHub source origins.
`github-forge-adapter.mjs` and its direct test own the GitHub.com-only,
credential-free target mapping; `forge-capability.mjs`, its direct test, and
its schema own the neutral capability boundary. `github-issue-operations.mjs`
and its direct test own the narrow preview/readback contract for GitHub issue
work. ADR-0049 is deliberately named because it admits a constrained GitLab CI
executor pilot without turning it into a hosting migration or a blanket forge
policy. No tracked tooling-radar file currently contains GH-T1–GH-T7 or M1–M8;
that promised observation mechanism is therefore missing/deferred, not
represented as an implementation owner. ADR-0016 is not in the vendored-canon
universal list, so it has no generated destination.

## Validation boundary

The check reports only this package's local `4/4` declarations. It does not
hardcode parallel global coverage counts, run vendor generation, modify a
vendored copy, or mutate runtime, policy, schema, checker, test, authority, or
ledger state.
