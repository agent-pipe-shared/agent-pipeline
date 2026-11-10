# C28-SECURITY-COVERAGE held patch notes (AC-108 is the closest criterion; PRD and Spec unchanged)

Status: targeted delivery green for every suite listed under "GREEN" below; the security-scan "rule provenance" pin was restated in place (QG-04) after the checkpoint.
Batch review and PO acceptance stay pending.

## What

1. Default web/Node rule pack, same file `plugins/pipeline-core/security/semgrep/pipeline.yml` (plain Semgrep rules, no new tool). Both original rules kept untouched.
   New ids: dom-injection-sink (innerHTML, outerHTML, insertAdjacentHTML, document.write/writeln, literals excluded), eval-like-call (new Function, string timers,
   `$G.eval`), unsafe-url-scheme (javascript:/vbscript: into href, src, location, window.open), unvalidated-redirect (non-literal location/redirect target),
   postmessage-no-origin-check (handler text never reads `.origin`), prototype-pollution (`__proto__`, `constructor.prototype`, nested dynamic write inside for-in),
   child-process-shell-string (`child_process.exec/execSync` with a non-literal, spawn with `shell: true`; require/import aliases are resolved by Semgrep),
   hardcoded-secret (ERROR: provider-shaped key/token), hardcoded-credential-assignment (WARNING). All heuristic rules are WARNING (medium, not blocking under the default
   `block_on`): a default pack must never newly block a project that did not choose it. Fixtures: positive and negative per rule in the registered-by-name
   suite `plugins/pipeline-core/config/security/semgrep-default-rules.test.mjs`, one Semgrep spawn for all of them; secret-shaped values are assembled at run time.
2. Honest states (`lib/security-close-status.mjs`, `scripts/security-scan.mjs`): `markNotRunScans` marks a PASS that ran on an unbound/dirty candidate, or from semgrep
   with zero loaded rules, `reportStatus: "not-run"` with `notRun` and the reason. It reads "not executed" everywhere the state is read (elements, scan verdict
   PARTIAL/INCOMPLETE instead of CLEAN, rule-set line). `status` and the exit decision are untouched, so no gate becomes newly blocking; findings are never hidden.
   `securityCloseWarnings` prints one `WARNING:` line per element that did not run, was skipped as not configured (the license check) or covered only part of the tree,
   each with its next step; the scan summary and the close entry print them, and the close never prints its GREEN line with a warning (new line: ADMITTED WITH WARNINGS).
3. Declared requirements: manifest field `security.required_capabilities` (block list of secrets|sast|sca|license; schema `pipeline-manifest.schema.json`, validated by
   `harness/scripts/validate-manifest.mjs` unchanged). `requiredCapabilityRefusals` refuses with `SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN`, naming the capability, its
   scanner and the install/run step, in `check-close-security-completeness.mjs` (close.pre, exit 2) and `security-close-check.mjs` (Verify, exit 1). Readings chosen:
   critical-style (a skipped license check did not run); a scanner with no evidence entry or a disabled scanner is refused; "no package sources" is nothing to scan,
   not a refusal; a valid named exception (critical calibrations only) answers it as everywhere else; a gate that is absent or `mode: off` does not hide a
   declaration (every declared capability is refused). Without a declaration the same states stay warnings.

## Test-first record (RED before the first production edit, in the clone)

- semgrep-default-rules suite: RED, 1 failed file, 26 FAIL lines (missing rule ids, no fixture fired). Real semgrep was installed, so fixtures ran.
- pin suite `security-close-chain-is-hard-per-calibration` (C22, C22b, C22c, C23, C23b, C24, C24b, C25): RED, 24 pass, 8 fail.
- `harness/scripts/validate-manifest.test.mjs`: RED, the accept case failed with `security.required_capabilities: unknown field`.
- GREEN: pin suite 32/32 (after fixture-shape corrections below), validate-manifest 1/1 file pass, semgrep-default-rules 1/1 file pass (every fixture), check test 2/2.
- Fixture corrections after implementation (not weakening, tied to the criterion): the close fixtures first listed fewer than the four scanners; a real scan lists every enabled
  scanner. The close/Verify cases use the license check (no binary, skipped on every machine) instead of an installed scanner, so they do not depend on the machine.
  The first fixtures also used YAML flow lists, which the manifest reader does not support; block lists are used.

## Not changed (on purpose)

- `scripts/finish-feature.mjs` (the close driver): no change needed for the refusal when the close runs `check-close-security-completeness.mjs` as its close.pre entry; its
  `closeSecurityScope` reads the v2 verdict, which does not carry `not-run` (see Not proven). Exact change if the PO wants the scope line to say it: pass the evidence's
  `reportStatus` into `checksNotRun`.
- `lib/security-completeness-gate.mjs` (push gate) and the v2 envelope/verdict: unchanged; `markNotRunScans` only touches the v1 entries.
- No new lib file, so GMWKC03 needs no new entry; `security-close-status.mjs` is a kernel path and gained no import. No Critic-preimage file touched.
- Invalid-manifest declaration: a malformed manifest is caught by the manifest validator in Verify, not by the close reader (no fail-open change made there).

## Not proven / remaining

- The security-scan case "rule provenance: semgrep lists the rule ids of that file" pinned exactly the two original ids and saw eleven (RED). Restated in place with a
  QG-04 comment: the original two stay first, then the nine new ids, in file order. security-scan.test.mjs is green after it.
- GREEN after the final edits, one suite at a time (clone helper, exit 0): security-scan 1/1 file, semgrep adapter 30 tests (28 pass, 2 skipped by the suite itself),
  check-close-security-completeness 1/1, security-completeness-gate 11/11, close-quality-readback 12/12, guard-maintenance-window-kernel-closure 1/1.
- Not run: consumer-release and push-threat-model-gate have no suite next to them by that name, finish-feature.test.mjs was not run (its import of `closeSecurityScope` is
  unchanged), and the project-onboarding-v3 suite result is reported separately in the dispatch report. No importer deep-equal failed, so no further restate was needed.
- The semgrep-default-rules suite is not listed in `harness/verify-suites.json` by file name (searched); registration is a protected path (TP-13), so it is reported, not changed.
- Windows/CRLF: no line-ending change in any touched file; paths in the new code are plugin-relative strings only. Not run on native Windows.
