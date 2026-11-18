# w30j19 — the start-time tool check judges "usable" by the scan's trust rule and names the fix (candidate 30j, C30J-J19)

Applies AFTER the integrated 30i tree (the clone base9): the patch is the delta `69ac37983f..HEAD` of the slice clone and does not apply to the real checkout before that tree. `apply --check` against the clone base9: exit 0.
Source binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/trusted-tool-resolution.mjs`: `untrustedToolFix(name, foundPath, options)`, a pure text builder next to `trustedToolRepairHint`. For a tool that is installed at `foundPath` but refused by the trust rule it names the one documented registration as a
  named human step: add the directory of the direct `<tool>.exe` to the per-machine roots file (`trustedToolRootsFilePath()`) as the exact JSON of schema `pipeline.trusted-tool-roots.v1`. For a `.cmd`, `.bat` or `.ps1` wrapper it first says that only a direct `.exe` is accepted
  (the roots file cannot make a wrapper trusted), and shows the JSON with a placeholder directory. Nothing is written.
- `scripts/toolchain-preflight.mjs`: when the trusted resolver reports `binary_missing` for gitleaks, osv-scanner, semgrep or trivy, the preflight now takes the two steps the scan takes before it reports `SKIPPED untrusted_path`: the adapter's own PATH discovery
  (`isInstalled(process.env)`, the exported function of each adapter, only on the host's own platform) and then `assessTrustedExecutablePath(path, { platform })`, the one trust rule (imported, no second copy). If that rule answers `untrusted_path`, the result is
  `untrusted_path` (code `TCP-UNTRUSTED-PATH`, as the existing status precedence and exit code already treat it) and its `guidance` is the fix text instead of an install route. Test seams: `deps.findInstalledFn`, `deps.assessExecutableFn`.
- The environment readiness finding `scanner-<tool>` (the bootstrap's non-gating tool check) shows the same fix as its attended repair (prerequisite `<tool>-trusted-location`) instead of the install text.
- New cases: lib 2 (the JSON of the fix makes `assessTrustedExecutablePath` accept the tool under the same fixture that refused it; wrapper text); preflight 4 (J19a installed at an untrusted path, J19b wrapper, J19c missing / not refused by the rule / already trusted stay as before, J19d the readiness finding).

## Test first

J19a, J19b, J19d and the lib cases were run RED against the original code (missing export; `TCP-BINARY-MISSING` instead of `TCP-UNTRUSTED-PATH`; cause `binary_missing`), then GREEN after the change. J19c is the "unchanged" pin and was green on both sides.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `trusted-tool-resolution.test.mjs` (via `test-in.mjs` in the clone): green, exit 0.
- `toolchain-preflight.test.mjs`: 59 of 59 pass, exit 0 (55 existing plus 4 new).
- `w30j19-...check.test.mjs`: patch exists, touches only the five briefed files.

## Not changed / not proven

- What the scan counts as passed, skipped or failed, the security gate in the close, `security-close-status.mjs`, the adapters, and the output schema (`toolchain-preflight.schema.json` is untouched: the fix lives in the existing `guidance` string; no field added). A missing tool and a trusted tool keep their output byte for byte.
- A tool that the PATH holds at a location the rule ACCEPTS but that the trusted resolver does not list (possible on POSIX, where the rule checks only the file type) is still reported `binary_missing` by the preflight, while the scan would run it. That is a different divergence in the other direction, left as it is (pinned in J19c as unchanged).
- Not proven on a real Windows host: the cases run with a mocked `win32` platform and injected PATH discovery; the consumer's real PATH layout and the roots file round trip on a real machine are unchecked. The German/English wording is English only.
- The clone commit carries only the subject line (the clone helper takes one line); the trailers belong to the host commit.
