# Antigravity greenfield report: verified disposition (2026-09-27)

Source report: `/home/skar667/src/Rune_Test1_agy_70_113/docs/agent-pipeline-review.md`.
This review used the consumer repository's public files and the installed
plugin manifest. The referenced Antigravity transcript was outside the
current session's admitted read scope; no transcript-level claim is made.

| Report claim | Readback and disposition |
| --- | --- |
| Signature mode reached implementation without a signature | The consumer declares `gates.human_approval: signature`. Its state records name-only plan approval and no signature/acknowledgement receipt. The project's permitted Antigravity script root reports plugin 0.6.2, imported on 2026-09-15; current 0.7 source forbids `--by` under global signature mode. Strong version-skew explanation, but actual invoked command path was not in the report. The run is not valid 0.7 acceptance evidence. Tracked in `backlog/items/2026-09-27-agy-greenfield-run-used-stale-plugin.md`. |
| Design questions required an artificial answer | Confirmed in current source: `applyOnboardingIntakeDesignQuestions` and the checkpoint validator both reject an empty answer array. Tracked in `backlog/items/2026-09-27-zero-open-design-questions-force-fabricated-answer.md`. |
| Browser E2E failed because `libnspr4.so` was missing | Confirmed in Playwright `error-context.md`. Directly running current 0.7 `browser-evidence-preflight.mjs --root <consumer>` returned `BEP-BROWSER-E2E-READY` with exit 0 for the same root. Tracked in `backlog/items/2026-09-27-browser-preflight-misses-missing-host-library.md`. |
| `ps aux | grep` and mutating `&&` chains were blocked | Plausible for the closed grammar. Plain `ps aux` succeeded in this 0.7 session, so a direct process read exists. No blanket shell relaxation follows from the old run; a measured 0.7 case is needed before widening a protected command grammar. |
| Repeated `pipeline-start` injections and 45/30/25 effort split | The report contains these assertions without an event trace or measured timings. They remain observations, not quantified 0.7 defects. |

The PO's separate requirement that contained `scratch/` always work is tracked
in `backlog/items/2026-09-27-scratch-must-remain-writable-across-lifecycle-states.md`.
The current Alfred design/draft scratch-write probe passed, while the source
guard test still expects denial for `session-capability-unavailable`.
