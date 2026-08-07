// SPDX-License-Identifier: SUL-1.0

/**
 * The two reviewed Public-Core origins the bootstrap self-application check
 * (`observePipelineStartPreflight` in `../scripts/pipeline-start-preflight.mjs`)
 * is allowed to trust. This module holds nothing else -- no shaping logic, no
 * calling code -- so `guard-gate-strength.mjs`'s protecting `GATE_STRENGTH_PATHS`
 * entry (GS-8) can cover exactly this gate-deciding constant without blocking
 * ordinary, unrelated maintenance of the rest of `pipeline-start-preflight.mjs`.
 * See design
 * `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
 * §A.1/§A.3 item 1. Verified byte-identical to the pre-merge constant retired
 * from `codex-host-plugin-list.mjs` at commit `998a609`.
 */

export const PUBLIC_MARKETPLACE_URL = "https://github.com/agent-pipe-shared/agent-pipeline.git";

export const PUBLIC_SELF_APPLICATION_ORIGINS = new Set([
  PUBLIC_MARKETPLACE_URL,
  "git@github-public:agent-pipe-shared/agent-pipeline.git",
]);
