# Recon notes: remainder of the preflight prerequisite row and the Phoenix plan path row (INTERIM, budget-stopped)

Status: read-only recon, notes only, NO patch, no clone made. Candidate 24fe84cdd. Paths are repository-relative.
The Phoenix apply code site was NOT located (budget); that part is marked unverified. Several `rg` spellings (`-l`, `--glob`,
two path arguments) are refused by the shell grammar and cost calls.

## Row 1: pipeline.preflight-establishes-runner-prerequisites (stage 50, node probe delivered)

Grounded:
- Node stable-candidate probe is delivered: `plugins/pipeline-core/lib/node-sandbox-probe.mjs` now has `findStableNode(...)`
  (line 52) and returns `stableNode` plus `NODE_NO_STABLE_REMEDY` (lines 39-42). Commit chain: `50678a5d3` (held patch), applied in the
  17-patch sitting. Backlog Wanted 3 is therefore delivered; Wanted 4 (no sudo, no install) holds for the node probe.
- Typed per-tool readback exists, but not in the start preflight: `plugins/pipeline-core/scripts/toolchain-preflight.mjs`
  `FIXED_TOOLS` (line 75) lists node, git, gitleaks, osv-scanner, semgrep, license-check; `REQUIRED_CAPABILITIES` (78); scanner probes
  imported at lines 68-70 and run at 259-263 in `runToolchainPreflight`.
- Missing scanner no longer counts as clean: e244c7b3d (`required-capability-missing`, per earlier recon, security-scan.mjs:746).
- The start preflight (`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`) reads back only
  `observeEnvironmentReadiness()` (line 2246, calls `runEnvironmentReadinessReport` of toolchain-preflight) and `nodeSandbox`
  (line 2361). `ENVIRONMENT_FINDING_IDS` (toolchain-preflight.mjs:331) has eight ids: git-version, signing-toolchain, po-key-directory,
  trust-anchor-match, git-hooks, bound-paths-tracked, orphan-descriptors, approval-verifiable. NO node-stable, gitleaks, osv-scanner or
  semgrep finding, so the preflight start line never reports scanner prerequisites (Wanted 1 and 2 open).
- Hard-coded install commands remain: `installCommandFor` (toolchain-preflight.mjs:87-123) emits `sudo apt-get ...` (lines 90-102),
  `go install ...@latest`, `brew install`, `winget install`. This contradicts backlog Wanted 4 and the D164 addendum (no pinned
  versions, no hard-coded commands, no sudo); the GUIDANCE table (lines 80-83) pins "Node.js 24 or newer".

Remaining gap and slices (implementation order):
1. `feat(preflight): report gitleaks, osv-scanner and semgrep as typed prerequisite findings` - files
   `scripts/toolchain-preflight.mjs` (+ schema json) and `scripts/toolchain-preflight.test.mjs`. Add finding ids
   `scanner-gitleaks|osv-scanner|semgrep` to `ENVIRONMENT_FINDING_IDS` and `DEFAULT_FINDING_PROBES` (487), reusing the existing
   probes via `runToolchainPreflight` statuses; a missing tool is `attended`, never ready, never clean. RED: injected missing scanner
   gives non-ready attended finding; injected ready scanner gives ready; payload budget unchanged except the three findings.
2. `refactor(preflight): replace hard-coded install commands with a capability contract and a no-sudo attended action` - same files;
   drop `installCommandFor` sudo branches, return the contract (tool, probe, source-naming hint), user runs, re-read. RED: no returned
   action text contains `sudo` or a fixed version.
3. `feat(preflight): include nodeSandbox stable-node result in environment readiness` - optional, only if a node-stable finding is
   wanted in the same list; otherwise `nodeSandbox.stableNode` already covers it.
Protected/custody: `pipeline-start-preflight.mjs` and `toolchain-preflight.*` are plugin kernel paths (held patch, PO applies). The
preflight envelope key set and payload budget are pinned (see start-preflight lines 2240-2245 and 2287-2315); add findings inside
`environmentReadiness`, no new top-level key.
Native-host-only: WSL/Windows install and re-read behaviour; "deliberately off" gate confirmation (collect-input design question).
To call it technically delivered: slices 1 and 2 landed with pins green; Verify, Critic, native runs and PO acceptance remain gates after 75.

## Row 2: pipeline.design-course-and-registrar-disagree-on-the-feature-directory (stage 50)

Backlog Wanted list: (1) one directory rule, (2) Phoenix apply sets `activeFeature.planPath` or the gate derives the directory from the
authority PRD path, (3) `reopen-design` previews what it voids, (4) byte-identical path rebind keeps receipts, (5) cardinality message.

Delivered (grounded):
- Wanted 1: D170 `17e002a67` (design package follows the registrar folder rule; refuses an unregistrable folder at promote plan).
- Wanted 5: D171 `bff5c444e`; `plugins/pipeline-core/lib/po-gate-authority.mjs` lines 881-901 now name the feature directory, the bound
  plan path, the files found, and the PO-GATE-PLAN-PATH-MISMATCH text, with a hint that points to the sanctioned revision route.
- Draft-guard admission of the read-only phoenix-authority-revision plan argv: `77db3153e` (D166-PH). That is the "w7-phoenix-plan-admission"
  patch; it does NOT touch `activeFeature.planPath`.

Not delivered / unverified:
- Wanted 2: no evidence found that Phoenix apply rebinds `activeFeature.planPath`. Searches in `lib/continuity-authority-revision*.mjs`
  and `harness/scripts/pipeline-state.mjs` for `continuity-authority-revision-apply` and `reopen-design` returned nothing with my
  spellings; the owning file was NOT found. Next step: `rg -n "continuity-authority-revision" plugins/pipeline-core/scripts` one
  directory at a time (the grammar refuses `-l`, `--glob`, two paths) and read the apply transaction. UNVERIFIED which file and line.
- Wanted 3 (`reopen-design` preview) and Wanted 4 (hash-bound receipts / sanctioned rebind): not located, treat as open until a rg for
  `reopen` in the state machine proves otherwise.
Slices (provisional, order): (a) Phoenix apply rebinds `activeFeature.planPath` in the same transaction (or po-gate derives the directory
from `continuity.authority.prd.path`; the second option touches only `po-gate-authority.mjs`, line ~860 where `featureDirectory` is
derived from `active.planPath`); RED: revise to a new folder, then `submit-plan` passes without `discard-feature`. (b) `reopen-design
--dry-run` preview listing signature, receipts, reviews voided. (c) receipt binding by content hash for byte-identical rebind.
Protected: `po-gate-authority.mjs`, state machine, Phoenix wrapper are kernel paths (held patches). Native-host-only: none identified;
the Phoenix ceremony needs a PO passphrase step (human).
Technically delivered when: Wanted 2, 3, 4 landed with pins; Wanted 1 and 5 already are.

## Confidence
Row 1: medium-high (sites read). Row 2: delivered parts high, remaining parts low (apply site unlocated).
