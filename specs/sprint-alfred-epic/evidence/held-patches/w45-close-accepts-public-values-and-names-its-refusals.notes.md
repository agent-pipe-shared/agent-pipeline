# w45 — the close accepts deliberately public values and names its refusals (16b close hotfix)

Found by the two real consumer closes after 16a:

1. One consumer's last Security finding is a public IndexNow key. The sanctioned ignore route (`gitleaks-repair-ignore.mjs`) refused it:
   the reproduction gate admitted only a plain domain as the reviewed value (`reviewed value is not a plain domain`), so a value that is
   public by design had no sanctioned suppression at all.
2. Refusal texts did not say what failed (`FCA-QUALIFICATION`, `FCA-PACKAGE`), the registration hint said "do NOT commit" without the
   boundary, and the private-evidence mode (0600) and the cleanup receipt shape were documented nowhere.

## Change

- Gate (`security-adapters/gitleaks-reproduction-gate.mjs`): `reviewedValueClass(rootDir, value)` returns `domain` (unchanged), `public-key-file`
  or `null`. `public-key-file` needs ALL of: a hex value of 32..64 characters, a regular, non-linked file `public/<value>.txt` of at most 4096
  bytes whose whole content (trailing newline ignored) is exactly that value, and that file tracked by Git (`git ls-files --error-unmatch`).
  Everything else is refused with one text that names what is accepted (`REVIEWED_VALUE_REFUSAL`). The gate JSON, its key set and the value
  binding (`valueSha256`) are unchanged; the value never enters the gate.
- CLI (`gitleaks-repair-ignore.mjs`): a `public-key-file` value requires `--reason "<why>"` (at least 10 characters); the command prints it so
  the chat confirmation and the close report can quote it. `--reason` is a closed, single-use flag. Outputs say "public value" instead of "domain".
- `feature-close-audit-preflight.mjs`: `FCA-QUALIFICATION` names the mode the evidence needs (`--mode candidate`, full, nothing omitted; a release
  run satisfies only release/push) and lists each candidate-evidence file with the reason it was rejected; `FCA-PACKAGE` names the failing
  condition (validation, feature, state, or the package candidate versus the requested one with the re-register hint).
- `feature-package-registration.mjs`: the `next` hint says when committing becomes allowed again.
- `skills/close-feature/SKILL.md`: private evidence rules (mode 0600, single link, name, size, directory), the public-value route, the cleanup
  receipt shape with its missing producer, `uncertain` versus `complete`, and the PO rule of 2026-11-01 (empty-input digest, explicitly stated,
  only when no session descriptor exists).
- Tests: three new tests in the existing gate suite (public key class with controls: untracked, absent, differing content, malformed values,
  closed CLI flag), two extended assertions in the audit preflight suite. A mutation of the tracked-file check fails the control.

## Not proven here

- The scanner's behaviour on a real project was not run: the gate tests use the synthetic scanner seam of the existing suite. The consumer must
  run `--prepare-gate`/`--approve-new` with its admitted scanner.
- The reason is printed, not stored: a recorded ignore list with reason and expiry in the close evidence stays for 0.7.1, as does a producer
  command for the cleanup receipt, Windows scanner-path admission unification, and the hook for a stale `docs/state.md`.
- The `public/<key>.txt` proof covers IndexNow-style keys only; other public values (site-verification tokens, public keys) are not covered.
