# Lifecycle denial override boundary

`GUARD-LIFECYCLE-NOT-READY` is centrally rejected by both human-override
entry points before request planning or capability consumption. This is
code-specific: other denials emitted by `guard-lifecycle-ready.mjs` retain
their existing recovery and override behavior.

Both native adapters turn that typed result into a concise denial without an
authorization or signature ceremony. Raw rejected `apply_patch` bodies remain
host tool-call rendering; neither adapter emits those bytes.

The final native fixtures use sanctioned onboarding producers and a disclosed
test-only runtime readback to reach ready state before exercising ordinary
overrides. Invalid lifecycle cases assert repair-required denial; they do not
stand in for an unreachable external-repository observation branch. Both
adapters consume the same disclosure helper, with secret suppression, closed
copy-command shape, per-shell length bounds and exact POSIX reconstruction
covered by direct tests. Tests use disposable repositories.

An already armed legitimate capability remains armed, with unchanged capability
and audit bytes, when the same action also has a lifecycle-not-ready denial.
No new request or consumption can override that denial.

Final machine capture
`scratch/NVA-B-NATIVE-HGO-FIXTURES-2/native-hgo-full-rerun.txt` exited 0:
112 Node test cases, including the standalone Codex and Antigravity adapter
suites and the central override and repair-map tests. The separate
`consumer-safe-paths.txt` capture in the same directory passed all 9 checks.
Earlier red fixture-migration captures remain preserved. This is source-level
fixture verification; no installed-plugin or live-user override is claimed.
