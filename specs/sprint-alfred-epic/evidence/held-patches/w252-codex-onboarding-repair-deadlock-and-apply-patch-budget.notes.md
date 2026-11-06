# w252: the Codex onboarding repair deadlock and the apply-patch guard budget (candidate 20)

Base: `72ef2e315` (19m applied, stamped and installed; greenfield running). Built by the Elephant in the slice clone `scratch/agent-out/w252`.
The PO started the 19m greenfield and then asked for fixes of what is already visible ("du kannst die fehler aus dem greenfield schon anfangen
das zu korrigieren was wir schon sehen"). Held for candidate 20; no apply script yet, more greenfield findings may join it.

## G20-1 (P0): the guard refused the repair the inspection returned

- **Seen:** a Codex greenfield session at `bootstrap-binding-required` got `intake-spec-marker-apply` as inspect's nextAction. The lifecycle
  guard refused exactly that command (`GUARD-LIFECYCLE-NOT-READY`), and also `plan-repair`. The session could not continue.
- **Cause:** `observedOnboardingCommandMatch` (`lib/guard/command-catalogue.mjs`) required the command's interpreter to equal
  `nextAction.executable` byte for byte. That value is the `process.execPath` of whichever process inspected. The guard inspects inside the
  hook, under the hook's Node (a version-manager Node). The agent's escalated-sandbox shell resolved `node` to a different installation and
  used that path. The argv was identical; only the interpreter differed.
- **Fix:** equality stays the first rule. In addition, `sameNodeInterpreter` admits a different interpreter only when the observed executable
  is itself a Node (basename `node`/`node.exe`) and the command names either `node` from PATH or an absolute `node`/`node.exe` that resolves
  to an executable regular file outside the project root. The argv stays byte-exact.
- **What this admits that was refused before:** the same exact command run by another real Node installation of this machine. It does not
  admit a Node-named file inside the repository (so an agent cannot plant its own `scratch/node`), a non-Node interpreter, a changed argv,
  or any interpreter swap when the observed executable is not a Node.
- **Tests:** `onboarding-inspect-prefilter.test.mjs`. The legacy-equivalence table is restated in place (QG-04, no case dropped): every legacy
  match is still returned identically, and a legacy refusal may match now only when the interpreter word alone differs and
  `sameNodeInterpreter` admits it. New case for the deadlock and for the refusals that remain. 76/76 green with the two devplan recovery suites.

## G20-2 (P1): the 4 s child cap of guard-apply-patch

- **Seen:** every Codex design write (`apply_patch` on the staging PRD and Spec) failed with `Guard timed out` while the machine was busy.
- **Measured:** `guard-lifecycle-ready` alone takes 3.7 to 4.9 s on this Linux machine without the sandbox, and 3.1 to 3.7 s with the 19h
  plugin, so this is not a 19m regression. The cap of 4 s per child left no margin.
- **Fix:** each child guard gets 12 s. The whole script stays bounded by the 36 s cap `codex-pretool-guard.mjs` gives it. A shared 30 s
  deadline was tried and rejected: the lifecycle children run one per path in order, and the multi-file fan-out test showed that a patch over
  many files legitimately needs the sum. The timeout message now names the guard that ran out of time and how to retry.
- **Tests:** `guard-apply-patch.test.mjs` 29/29. The extracted `runGuard` harness gets the 12 s value and the new `childTimeoutMs`.
  New GAP-BUDGET01 pins the value, the timer use, the fit inside the outer cap and the message.

## G20-3 (P2, Antigravity): a guessed plugin path was refused as a credential problem

- **Seen:** in one agy greenfield run, seven native Reads of plugin files were refused with `GUARD-READ-TARGET: use an exact passive path
  outside protected credential roots`. All seven paths were inside the agy runner view (the registered plugin root) and none of them exists
  (for example `lib/architecture-design-package.mjs`, `PIPELINE_FLOW.md`, `templates/architecture/adr-template.md`). No skill names them.
  The agent had guessed, and the refusal sent it looking for a credential or root problem.
- **Fix:** `readToolScopeVerdict` (`lib/guard/read-scope.mjs`) names a Read of a missing file lexically inside a registered plugin root
  as `GUARD-READ-TARGET-MISSING`, with the relative plugin path and the nearest existing plugin directory to list with Glob. The read stays
  refused. The credential-labelled refusal (K105) keeps precedence, and missing paths outside the plugin root keep their label.
- **Tests:** the registered-plugin read test in `guard-lifecycle-ready.test.mjs` is extended. The full suite is green (427 pass, 0 fail,
  3 skipped).

Not yet: live greenfield retest of all three, Full Verify, Critic, PO acceptance.
