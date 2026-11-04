# w192 — the kernel closure lists the modules that the whole chain adds

Candidate 19c, found by running `guard-maintenance-window-kernel-closure.test.mjs` on the rehearsal clone after w175 (the closure suite is green on each slice clone alone and red on the sum).

- **What:** `NEVER_LIFTABLE_KERNEL_PATHS` (and the Protected-assets prose of `docs/guard-maintenance-window-threat-model.md`, pinned by GMWKC03) gain `lib/authority-seal-reader.mjs` (imported by five readers since w177), `lib/evidence-carry-forward-reader.mjs` and `lib/evidence-carry-forward.mjs` and `scripts/security-adapters/gitleaks.mjs` (imported by push-prepare and the pre-push hook since w162/w171), and `scripts/security-readiness/probe-retry.mjs` (imported by the three readiness probes since w172). The `DYNAMIC_IMPORT_EDGES` entry of `scripts/pre-push-hook-install.mjs` is restated from ten to its twelve real call sites (`evidence-freshness-codes`, `evidence-carry-forward-reader`), under QG-04, with a comment saying why.
- **Why:** these first-party modules execute inside kernel modules; a maintenance window must not be able to rewrite them.
- **Not changed:** any module, the closure test logic, any other pin.
- **Verified in the rehearsal clone:** kernel closure 1/1, `guard-maintenance-window` lib 1/1 and script 16/16, `guard-split-contract` 5/5.
- **Not proven:** a Full Verify of the chain.
- **Criterion:** AC-108 is the closest accepted criterion; PRD and Spec are unchanged.
- **Apply order:** after w175 (the last slice that adds an imported module); until then the order of the other steps does not matter for this patch's own hunks, but the closure suite is red without it.
