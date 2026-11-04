# w198 — the analysis-run command is named in the implementation continuation reference (candidate 19c)

Found by the first Full Verify of the whole 19c chain (`product-capability-inventory-tests`: PCI24 and, as a consequence, PCI30). The defect predates the chain: `analysis-run.mjs` has been admitted by `lib/guard` since w148 but named by no skill, guard or prompt template (HAW-B01, "admitted but unnamed").

- `skills/pipeline-start/references/implementation-continuation.md` gets one paragraph that names the installed command with its exact argument shape, what it does (registered verify command of a commit in a throwaway clone, one JSON line) and what it is not (never Verify evidence, satisfies no gate).
- PCI30 expects exactly one forced failure and saw two; it follows from PCI24.
- Evidence: the reachability check run alone against the chain clone reports one finding, against the work clone none; `critic-course-admission.test.mjs` 85/85 (it names the reference). The full `check-product-capability-inventory.test.mjs` could not be started by the agent (the control-plane script scan refuses it, see the FV finding in the plan) and is covered by the Verify run only.
