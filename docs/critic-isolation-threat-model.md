# Threat model for the isolated Codex Critic

**Status:** Batman F1 with Hawkeye HAW-S · specification and evidence boundary;
not yet a strong production activation

**Reference contract:**
[ADR-0037 — Batman bounded assurance](adr/0037-batman-bounded-assurance.md#decision)

## Claim boundary

In Hawkeye, the intermediate class applies not only to the Critic, but also to
the three explicit Codex read-only duties: `advisory`, `readiness`, and
`critic`. Before a child process, each path must use the same selected,
network-open read-only transport, profile readback, and receipt bound to
dispatch and execution. This neither extends input/network isolation nor raises
the permitted assurance beyond the intermediate class stated below.

A review may make four independent claims. Each claim has the state `proven`,
`disproven`, or `not-proven` and its own evidence references. Evidence for one
claim does not establish another:

1. `briefingBounded`: The briefing names only the permitted materials.
2. `inputConfined`: The Critic could read only the materialized inputs bound
   before dispatch.
3. `technicallyIsolatedReadOnly`: A technical boundary prevented unauthorized
   reads as well as all unauthorized writes and network connections.
4. `verdictIntegrity`: The complete schema-valid verdict came from this exact
   run and was returned unchanged.

`not-proven` is never promoted. `proven` and `disproven` require at least one
typed byte-level proof; `not-proven` carries no apparent evidence. Conflicting
or unknown states are invalid. The closed machine form is in
`plugins/pipeline-core/scripts/codex-isolated-critic-claims.schema.json`.

## Permitted inputs

Review material consists solely of the ordered materialized bytes of the named
specification, the fixed candidate diff, the named guardrails/constraints, and
the named evidence. Before dispatch, every entry is bound by kind, normalized
relative path, byte count, and SHA-256. Digests are bindings, not a substitute
for review material.

Chat history, handover, memory, automatically loaded repository instructions,
implementor rationale, global user configuration, and repository paths not on
the list do not belong in the isolated lane. Runtime dependencies such as the
resolved Node binary and loader read set are bound separately; they are not
review material.

## Threats and controls

| Threat | Prevention | Detection | Residual risk |
| --- | --- | --- | --- |
| Prompt confinement is presented as isolation | Separate claims and closed assurance classes prohibit inferring technical isolation from a short briefing. | The receipt and claim object must name the actual evidence for each property. | A model can misinterpret a permitted document; that is review quality, not a boundary violation. |
| Context or autoload contamination | Fresh context; materialized input allowlist; handover, chat, memory, user configuration, and autoload paths are excluded. | Negative canaries and read denials for unlisted paths; input-manifest digest in the receipt. | Process-internal runner metadata remains visible only to the extent the runner necessarily injects it; without negative evidence, `inputConfined` remains `not-proven`. |
| External file reads or path aliases bypass the allowlist | Resolved real paths, root deny, symlink-/hardlink-aware checking, and a separate runtime read set. | A/B probes for direct paths, symlinks, hardlinks, parent paths, and relocated sensitive roots. | Kernel, mount, or sandbox changes after preflight invalidate compatibility; they are not assumed. |
| Write or write-then-restore | Only a fresh output directory is writable; all other roots are read-only or denied. | Before/after hashes and canaries after every positive and negative case. | An unobserved write path remains possible until the test matrix covers it; the post-state alone is not prevention evidence. |
| Access to credentials, SSH, remotes, or global Git/user configuration | Resolved HOME, credential, SSH, Git-config, and non-approved repository roots are explicitly outside the profile. | Denial probes with synthetic canaries; receipts include only redacted classes. | Newly added or platform-specific credential locations require a profile/preflight update. |
| Network exfiltration | The strong lane technically disables networking; `network.enabled=true` may yield only the intermediate class. | Loopback canary and profile readback; the network mode is digest-bound in the receipt. | The intermediate class is explicitly network-open and makes no input/network-isolation claim. |
| Advisory, readiness, or Critic startup bypasses the selection | All three Codex read-only duties build a shared selector request only from bound dispatch facts; the host may start the adapter only after exact-ID readback. | Selection, execution, and duty receipts bind the same ID, the same request, and the profile readback; drift returns `no-usable-review` without a child process. | A host without a current selection is unusable; it may neither try the known network-restricted variant first nor fall back to operator knowledge. |
| Child, stdin/EOF, or stdout/stderr loss | Fixed tool-free payload and bound process group; A/B control outside and inside the boundary. | Semantic byte comparison of stdin/EOF, stdout, stderr, and child exit. | A green minimal payload does not prove every later CLI output shape; CLI/schema changes invalidate the gate. |
| Lifecycle stall is confused with a live PID | Bound first-event, no-progress, and total runtime; PID liveness does not count as semantic progress. | Structured lifecycle events and heartbeats with new semantic bytes. | Scheduler or host pressure can classify a real run as a timeout; fail-closed prevents only a false success. |
| PID reuse or foreign cleanup | A new owned process group; before TERM/KILL, group and ownership binding are checked again. | Cleanup events distinguish `cleanup-not-owned` and `cleanup-failed`; foreign-process canary. | If ownership is not provable, the process may remain; the review is then invalid. |
| Verdict schema error, truncation, or replay | Closed verdict schema; run/packet/input/lifecycle bindings; bounded streams and unique IDs. | Completeness, digest, schema, ordering, and replay checks before admission. | Digest binding does not authenticate a provider; effective model identity remains a separate provenance claim. |
| Silent failure creates a success claim | Fail-closed terminal codes; success requires a schema-valid verdict and matching isolation evidence. | The coordinator distinguishes verdict, schema, permission, setup, child/stdio, stall, timeout, and cleanup errors. | Coordinator failure before a persisted receipt produces no usable review, even if the model internally finished. |
| CLI, OS, WSL, or filesystem drift | A versioned compatibility gate binds the exact CLI version, profile bytes, platform class, and filesystem class. | Preflight for each target class and a fresh local compatibility receipt. | A previously untested platform is `unsupported` or `diagnostic-only`, not implicitly compatible. |
| Provider export bypasses local data release | Both production candidate-packet hosts must validate the closed V3 policy against the full packet and derived export view before their first provider handoff. Runner and provider are fixed together (`claude`/`anthropic`, `codex`/`openai`). The packet preflight also materializes the exact binary base-to-commit diff as a private file in the checkout. | Before dispatch, the coordinator persists exactly one mode-0600 `pipeline.critic-export-receipt.v1` for each actually selected assurance class in the private packet directory; export view, dispatch, and final review receipt bind base, commit, tree, and path/byte-count/SHA-256 of snapshots revalidated against `git diff` before every lifecycle step. | The receipt proves local authorization, not acceptance or processing by the provider. Additional host/provider safety gates remain independent and visible. |
| The strong Claude path fails only after preflight | Strong authorization must not cover weak export. The weak same-runner fallback rechecks the policy and receives its own receipt before its dispatch material is produced. | Separate `export-native.json` and `export-fallback.json` receipts and different assurance digests prevent silent reinterpretation. | If the second authorization is incomplete or the packet has meanwhile expired, the claimed run remains blocked without a usable review; this cannot produce success. |

## Assurance boundaries

- `technically-isolated` requires all four proven claims and a green,
  network-restricted strong preflight.
- `sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted`
  proves a technical write barrier outside the exact coordinator scratch root
  and complete child/stdio lifecycle data, but neither input confinement nor
  network blocking.
- `functional-equivalent-read-only; OS isolation not asserted` remains exactly
  one weak same-runner fallback. Its read-only boundary is contractual, not
  proven by the operating system.
- A missing or invalid verdict, missing boundary evidence, stall, timeout, or
  cleanup uncertainty yields `no-usable-review`.

There is no silent cascade from strong through the intermediate class to weak,
no second fallback, and no automatic runner switch. The strong isolated lane
remains upstream-gated. The V3 export authority is active in both existing
candidate-packet hosts; it changes neither their technical isolation nor the
permitted assurance claims.
