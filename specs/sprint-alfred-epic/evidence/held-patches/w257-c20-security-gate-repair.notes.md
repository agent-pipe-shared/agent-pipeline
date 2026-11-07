# w257: a critical project without a security gate is blocked, and the refusal names the one command that configures it (candidate 20, G20-25, AC-108)

Base: `eed1a325d` (the candidate-20 chain incl. w254). Built in the slice clone `scratch/agent-out/s-secgate`. One held patch. Closest
criterion: AC-108 (PRD and Spec unchanged).

## What

- `lib/security-close-status.mjs`: new typed refusal `SEC-CLOSE-GATE-NOT-CONFIGURED` (`securityGateNotConfiguredRefusal(root, where)`). It is
  returned only for a critical calibration (same `isCriticalStakes` rule as w254) and names the exact repair argv: `node <absolute plugin
  script> --root <root>`. Any other calibration (standard, absent, unrecognised `stakes`) gets `null` and keeps today's `not applicable`.
- The two sites that used to print `not applicable` for a critical project now refuse with it:
  `scripts/check-close-security-completeness.mjs` (close.pre entry, exit 2) and `runSecurityCloseCheck` in `scripts/consumer-verify-check.mjs`
  (Verify, return 1).
- New `scripts/security-gate-configure.mjs --root <abs root>`: sets `gates.security` to the block onboarding writes
  (`mode: blocking`, `type: automated`) and changes no other byte (comments, order, CRLF/LF, other gates). Cases: no manifest (created
  only at the path the loader reads), manifest without `gates`, `gates` without `security`, `security.mode: off` (the `mode` value, and
  a non-`automated` `type`, are replaced in place). Idempotent: a gate that is configured in any mode but `off` is reported
  ("already configured") and left alone. Nothing is written unless the edited bytes re-parse, validate as a manifest with a blocking
  security gate, and equal the original apart from `gates.security`; otherwise exit 1 with `SEC-GATE-CONFIGURE-REFUSED` and nothing
  written (no temp file, no directory).
- Guard admission: `SECURITY_GATE_CONFIGURE_SCRIPT` in `lib/guard/constants.mjs` (so every separator/case spelling resolves) and one
  `exactRoot(args, root, 0) && args.length === 2` clause in `lib/guard/command-catalogue.mjs`, like `READBACK_SCRIPT`. The agent runs the
  repair itself; no PO ceremony.
- Pins: `security-close-chain-is-hard-per-calibration.test.mjs` +4 cases C9-C12 (13/13; C9, C10, C12 RED first against the original
  code, C11 guards the unchanged standard/absent/unrecognised behaviour); `catalogue-admit-prescribed-lifecycle-verbs.test.mjs` +1 case
  (admit the exact shape, 8 near-misses refused).

## Why

PO decision 2026-11-07: a critical calibration with no configured security gate must not pass close or Verify as `not applicable`, and
the refusal must say how to fix it ("muss in die Meldung wie es geht"). The repair is a sanctioned writer, not hand-editing, because the
manifest is a twin pair (`project/pipeline.yaml` mirrors `.claude/pipeline.yaml`; `classifyProjectAuthority` reports `PA-MANIFEST-DRIFT`
when they differ): the writer gives every existing tier the same edit, so a byte-identical pair stays byte-identical. After the repair,
the same close/Verify run reaches the w254 scanner chain.

Manifest binding checked: nothing re-verifies the manifest's bytes against a digest after onboarding (the calibration identity binds
`pipeline.json` only; the runtime projection owns `language`, `modelRouting`, `criticExport`, `session.keep_awake`, never `gates`; the
authority journal records digests at migration time only). No existing sanctioned route is bypassed and no binding is weakened.

## Not changed

- `hooks/guard-push.mjs` (push). The briefing names push as a blocked path, but the push decision lives in the hook, which skips the
  security branch when no security gate is configured, and the permitted surfaces for this patch are `lib/`, `scripts/` and `skills/`.
  Needed outside the write scope (a Coordinator edit, ~3 lines at the `securityGate = gateConfig(manifest, "security")` line): when the
  gate is absent or `off`, push `securityGateNotConfiguredRefusal(evidenceProjectDir, "this push")` (if not null) into `securityFailures`
  with the same blocking dispatch; note the hook exits earlier when `gates.push` is also absent, which a project onboarded by the
  Pipeline never is.
- An absent or unrecognised `stakes` stays non-critical (case C11 pins it). Nothing in `lib/path-spelling.mjs` or the separator-sweep sites.
- The vendored `docs/operating-model.md` / `guardrails/security.md` text (w254's list of originals to edit) is unchanged; one more sentence
  there (critical + no gate = `SEC-CLOSE-GATE-NOT-CONFIGURED`, repair `security-gate-configure.mjs`) belongs to the same Coordinator doc edit.
- `gates.security.mode: warn` counts as configured (the existing activation rule `mode !== "off"`), so it is not rewritten.
- Flow-style `gates: {}` / `security: {...}` and an invalid manifest are refused, not rewritten (reported with the reason; edit by hand
  or repair the manifest first).

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, a run against real installed scanners, the push-time block, Windows/macOS
execution of the writer (it uses only `node:fs`/`node:path`, no shell and no separator literal).

## Needs the Coordinator

- Register the changed pin set as before (no new test file: the cases extend two registered pins).
- The `guard-push.mjs` edit above, and the one-sentence documentation addition.
