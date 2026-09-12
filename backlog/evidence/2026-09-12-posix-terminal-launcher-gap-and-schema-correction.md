# POSIX terminal launcher gap and schema correction

Date: 2026-09-12

## Exact green baseline

Before this correction, Full Verify ran on clean commit
`1e66739557a26c53d39490f4f42a70e18ec45ff1`, tree
`0293641ce576bba952317e172999b91e83ca4590`. Run
`verify-1789190187745-453056d9cdc07532` completed all 534 registered steps
with exit code 0, no omitted suites, and a fresh `security-scan` exit code 0.
The ignored machine receipt is
`evidence/verify-1789190187745-453056d9cdc07532.json`; start and finish carry
the same clean commit/tree and `binding: "exact"`.

This is the clean baseline for the later schema-only delta. It is not a native
Codex sandbox or App-Server readiness claim under WSL.

## Reachability audit

The prepared-instance library already refuses `run` without injected trusted
caller evidence. The public CLI does not create that evidence, so its real run
path remains fail-closed. The audit considered deriving provenance from
stdin/stdout TTY descriptors plus an opened and `isatty`-verified `/dev/tty`.

That proposal failed its own adversarial probe. Running the CLI under the
standard POSIX `script` utility created a pseudo-terminal for a workspace tool.
With a deliberately nonexistent request, the result advanced from
`HTA-RUN-INVOCATION-FORBIDDEN` to `HTA-PRIVATE-DIRECTORY`, proving that the
tool-created pseudo-terminal had passed the proposed provenance check. No
action child ran and no product state was mutated by the probe.

The TTY-derived implementation was removed before commit. The accepted design
continues to require a host adapter whose external-launch provenance is not a
caller-controlled flag, environment value, or allocatable TTY property.

## Schema correction

The Runtime boundary validator accepts `host`, `external-terminal`, and
`attended-external-terminal`. The registered installed-plugin attestation uses
`host`, but the published `human-terminal-action-instance` JSON Schema admitted
only the two external-terminal values. The schema now matches the Runtime
contract. The focused suite also asserts the three-value schema enum and keeps
an exact producer-boundary mismatch fail-closed before child spawn.

Focused checks:

- `node --test harness/scripts/check-auth-gate-inventory-drift.test.mjs`
- `node harness/scripts/check-auth-gate-inventory-drift.mjs`
- `git diff --check`

All passed. The correction does not activate a launcher, add a PO gate, or
change native Windows support.
