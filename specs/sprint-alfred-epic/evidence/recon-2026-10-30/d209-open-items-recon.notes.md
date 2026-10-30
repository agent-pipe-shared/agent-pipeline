# D209 recon: the nine entries below 75 (2026-10-30)

Read-only recon on HEAD `e687e6d06` (installed candidate 11 = stamp `0cf2cba73`) for PO decision D209 ("all
entries below 75 are built for 0.7.0") plus the consumer findings N30-N32. A read-only subagent did the
reconnaissance; the Elephant spot-checked the ancestry claims and corrected one of them (G13, see below).

| Item | Built today | Missing for "technically delivered" | Size | Native host | PO decision |
|---|---|---|---|---|---|
| AC-175 forensics | Claude/Codex transcript export (`runner-transcript-recovery.mjs`), bootstrap drift advisory (`pipeline-start-preflight.mjs` `continuityAuthorityDrift`), pure `audit-index.mjs`, Verify collect at implementation entry | S1 drift check at dispatch (`dispatch-briefing.mjs`); S2 audit-index driver called from the close course; S3 child provenance and turn markers; AGY export (layout unknown); D152 sanitized auditor manifest | L | AGY export | scope: own-session export only? AGY export in 0.7.0? Verify contract at entry enough? |
| AC-190 greenfield comparisons | `lib/greenfield-public-comparison.mjs` + CLI, admitted in the command catalogue | no test; no published observation inputs or comparison output; no refusal-code/phase fields; no citation check | M | no | which runs form the first public set |
| AC-209 (+ AC-147 catalog half) | D96/D108/D109 (`5b3990a37`): single SKILL.md reads outside root admitted; pin ALF-B8-AC147 green | seven NATIVE_HOLD skipped cases in `lib/pins/lifecycle-read-scope-blocks-host-declared-system-skill.test.mjs` written on pre-D96 premises; bounded-form diagnostic parity; catalog carrier not built (protected `read-scope.mjs`, Codex host) | S (restate) / L (catalog) | catalog only | has D96 superseded the D29 catalog half? |
| G11 rev expression not a push | fixed in `c80bd9e97` (ancestor of the stamp), pins PG-K153-01..10 in `hooks/guard-push.test.mjs` | run evidence; check `guard-git.mjs` for the same brace shape | S | no | none |
| G12 close/commit signatures | `close-coordinator.mjs --help`; trailer named in policy, guardrails and obligations | signature table in the close-feature/close-block skills; `-m` and `git add -u` refusal texts name the allowed form; pin | S-M | no | none |
| G13 AGY artifact-image copy | `821cd35c1` (current-session artifact export, wired in the AGY pretool guard and evaluate; IS an ancestor of the stamp `0cf2cba73`; the subagent's "not in candidate 11" was wrong) | route hint in the refusal/reference, maintenance-window threat-model line, native AGY proof | S + native | yes | none |
| G15 onboarding question bundling | intake consent, initial answers and design questions are each one bundled round | no PO-turn count in the e2e walk; merging the first rounds undecided; reference text | M | optional | turn budget; keep Claude's separate consent step? |
| G16 credential route | push-approval.md stop-and-ask for a missing key directory; D109 admits `.ssh/config`, `known_hosts`, `*.pub` | transport credential versus PO approval proof distinction in push-approval.md and push-release-flow.md; one-question rule; pin | S | no | none |
| N30-N32 close reconcile | `feature-package-reconcile` verb, `resultBootstrapCompletion` returns `planSha256` and a prose next action; `po-human-approval.mjs` accepts `--kind feature-package-reconcile` | N30 a builder printing the exact signing command and subject digest (kind-parametric sibling of `authorizeCriticalPushCommand`); N31 order and N32 `closeEvidence` rules ({path, sha256}, differs from `result`, unique across closed features) in the skill and the two refusal texts | M + S | no | confirm a combined Verify/Critic receipt may be `closeEvidence` |

Suggested order: G11, G13 re-verify, G16, G12, N31/N32 docs; then N30 builder and the AC-209 restatement; then
AC-190, AC-175 S1-S3, G15. Native: AC-175 AGY export, G13 proof, G15 optional, AC-147 catalog half.
