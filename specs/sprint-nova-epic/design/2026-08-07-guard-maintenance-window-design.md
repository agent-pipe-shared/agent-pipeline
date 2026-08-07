# Guard Maintenance Window — implementation design

Source evidence: [ADR-0058](../../../docs/adr/0058-guard-maintenance-window.md),
[the threat model](../../../docs/guard-maintenance-window-threat-model.md).
This note is the concrete API/schema/file-list companion those two documents
intentionally do not carry, written for a Goldfish dispatch to build against.

## Reused primitives (do not reinvent)

- `plugins/pipeline-core/lib/po-approval-proof.mjs` — `createPoApprovalIntent({kind, featureId, planSha256, specSha256, candidate, policyRevision, subjectSha256, decision})`
  and `verifyPoApprovalProof({intent, trustPolicy, proof})`. Reuse both
  as-is; do not modify this file. `kind: "guard-lift"`, `decision: "lift"`
  (a single closed value — this primitive has no other decision outcome for
  this kind). `trustPolicy` comes from `project/critical-human-proof.json`'s
  existing `trustAnchor` field (same one push approval already uses) — if
  that field is absent, the feature is simply unavailable
  (`GMW-TRUST-ANCHOR-MISSING`), matching how ADR-0056 already treats a
  missing anchor for push.
- `plugins/pipeline-core/lib/human-guard-override.mjs` for STYLE reference
  only (owner-private storage hardening: `secureDirectory`, `safePrivateFile`,
  `writeAtomic`, the physical `topology()`/`physicalRoot()` helpers, and the
  HMAC audit-ledger pattern in `appendAudit`/`verifiedAuditEntries`). Do not
  import from it directly unless a helper is already exported; if a needed
  helper (e.g. `topology`, `physicalRoot`) is not exported, either export it
  from `human-guard-override.mjs` and import it (preferred — one definition
  of physical-safety checks, not two), or ask in your stop-condition report
  rather than silently reimplementing a divergent copy.
- `plugins/pipeline-core/hooks/guard-gate-strength.mjs`'s `GATE_STRENGTH_PATHS`,
  `LIVE_PLUGIN_RULE`, `livePluginRoots()`, `insideLivePlugin()` — read, do not
  duplicate the live-plugin-root detection logic.

## New file: `plugins/pipeline-core/lib/guard-maintenance-window.mjs`

Exports (exact names, adjust signatures only where the storage/crypto
primitives above require it):

- `LIFTABLE_RULE_IDS` — closed `Set`/array constant: `["GS-6"]` plus every
  `TP-*` id is liftable in principle (TP ids are dynamic per project config,
  so match by prefix `TP-`, not an enumerated list). GS-1, GS-2, GS-3, GS-4,
  GS-5, GS-7 are NEVER in this set — a scope entry naming one of them makes
  the whole window request invalid, not silently dropped.
- `NEVER_LIFTABLE_KERNEL_PATHS` — closed array of repository-relative paths,
  checked by exact match (same normalization as `gateStrengthRuleFor`:
  forward-slashed, case-insensitive): `plugins/pipeline-core/hooks/guard-gate-strength.mjs`,
  `plugins/pipeline-core/lib/guard-maintenance-window.mjs` (this file itself),
  `plugins/pipeline-core/hooks/hooks.json`, `plugins/pipeline-core/lib/tool-write-target.mjs`,
  `plugins/pipeline-core/hooks/guard-command-grammar.mjs`,
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`,
  `project/critical-human-proof.json`. A path in this list is refused
  unconditionally by the calling guard BEFORE it ever calls into this
  module's window lookup — enforce this ordering in the calling guard, and
  add a same-file test proving a kernel path is refused even when a valid,
  correctly-scoped window is armed and covers it (construct a real armed
  window in the test fixture, then assert the kernel path is still denied).
- `MAX_WINDOW_TTL_MS` — fixed constant, `4 * 60 * 60 * 1000` (4 hours).
- `prepareGuardMaintenanceWindowRequest({ rootDir, scopeRuleIds, ttlSeconds, reason, featureId, planSha256, specSha256, policyRevision, nowMs = Date.now() })`
  — agent-safe. Validates `scopeRuleIds` against `LIFTABLE_RULE_IDS` (reject
  anything else, including any `NEVER_LIFTABLE_KERNEL_PATHS`-adjacent rule
  id), clamps `ttlSeconds` to `MAX_WINDOW_TTL_MS`, computes the live-plugin
  tree hash at prepare time (reuse/export `pluginSourceTreeSha256`-equivalent
  logic already in `human-guard-override.mjs` rather than re-deriving it),
  generates a fresh nonce (`randomBytes(16).toString("hex")`), captures
  physical repo/common-dir identity via the shared `topology()` helper,
  builds the `subjectSha256` from a canonical `{ scopeRuleIds, ttlSeconds, reason, repoFingerprintSha256, openingTreeSha256, nonce }`,
  and returns `{ intent, subject }` (via `createPoApprovalIntent`) plus the
  request written to owner-private storage (same directory-hardening
  discipline as `storage()` in `human-guard-override.mjs`, a sibling
  subdirectory: `<git-common-dir>/agent-pipeline/guard-maintenance-window/`).
  Prints/returns the intent digest for the PO to inspect and sign externally,
  exactly mirroring `po-approval-request.mjs prepare`'s existing output shape
  — read that script before writing this one so the two CLIs feel like one
  family, not two.
- `installGuardMaintenanceWindow({ rootDir, request, trustPolicy, proof, nowMs = Date.now() })`
  — agent-safe (verify-and-place only). Re-derives the request's binding
  (physical repo identity, opening tree hash) fresh and rejects on drift
  (same "fresh preimage must equal every bound value" discipline as
  `planHumanGuardOverride`). Calls `verifyPoApprovalProof`; on success,
  atomically writes the window record (`writeAtomic`, owner-private) to
  `window.json` in the same storage directory. No separate "activate" call
  exists or is needed — installation IS the window becoming visible.
- `currentGuardMaintenanceWindow({ rootDir, nowMs = Date.now() })` — the
  function every guard calls. Reads `window.json` if present, re-verifies
  its proof against the trust anchor fresh (never trusts a cached/self-
  declared "valid" field), computes effective expiry as
  `min(parsedSignedExpiresAt, openedAtMs + MAX_WINDOW_TTL_MS)`, and returns
  either `{ status: "absent" }`, `{ status: "expired", ...same fields... }`,
  or `{ status: "active", scopeRuleIds, expiresAtMs, reason, openingTreeSha256, remainingMs }`.
  **Fail-closed expiry parsing is mandatory and must have its own test**:
  a missing, non-string, or unparseable `expiresAt` must resolve to
  `"expired"`/invalid — never to "active"/unbounded. Write the check as
  `Number.isFinite(parsedMs) && nowMs < parsedMs`, not the inverted
  `expired = ... <= nowMs` shape that produced the known bug elsewhere in
  this codebase (`human-guard-override.mjs`) — that inversion is exactly
  the failure mode to avoid; do not copy that line's structure.
- `windowCoversRule({ rootDir, ruleId, nowMs = Date.now() })` — convenience
  wrapper: `NEVER_LIFTABLE_KERNEL_PATHS` callers do not use this at all (they
  deny before reaching here); other callers pass the exact rule id
  (`"GS-6"`, or the matched `TP-<n>`/custom id) and get back
  `{ covered: boolean, window }` for logging.
- `closeGuardMaintenanceWindow({ rootDir })` — agent-safe, unauthenticated
  (closing only narrows capability). Deletes/invalidates `window.json` if
  present; no-op if absent.

## New file: `plugins/pipeline-core/scripts/guard-maintenance-window.mjs`

Thin CLI, same shape/flag conventions as `plugins/pipeline-core/scripts/po-approval-request.mjs`
(read that file for the exact flag-parsing/output style before writing this
one):

- `prepare --repo-root <path> --scope <comma-separated rule ids> --ttl-seconds <n> --reason <text> [--feature-id <id>] [--plan <path>] [--spec <path>]`
  → prints the `pipeline.guard-maintenance-window-request.v1` JSON (including
  the intent digest) to stdout, and writes the durable request file.
  `--feature-id`/`--plan`/`--spec` default to this session's currently bound
  authority (`specs/sprint-nova-epic/prd_sprint-nova-epic.md`,
  `specs/sprint-nova-epic/spec.md`, feature id `sprint-nova-epic`) when
  omitted — do not require the caller to look these up by hand every time.
- `install --repo-root <path> --request <path> --authority <path> --proof <path>`
  → verifies and installs; prints the resulting window status.
- `status --repo-root <path>` → read-only, prints `currentGuardMaintenanceWindow`'s
  result as JSON. This is what the bootstrap check will shell out to (see
  Follow-up dispatch below — not part of this one).
- `close --repo-root <path>` → closes an active window early.
- No `sign` mode, ever — identical refusal shape to `po-approval-request.mjs`.

## Guard integration: `plugins/pipeline-core/hooks/guard-gate-strength.mjs`

Only the `LIVE_PLUGIN_RULE` (GS-6) branch changes. Immediately after
`insideLivePlugin(absolute)` matches (i.e. `matched = LIVE_PLUGIN_RULE`),
before falling through to the existing unconditional `process.exit(2)`:

1. Normalize `filePath` the same way the rest of the file does and check it
   against `NEVER_LIFTABLE_KERNEL_PATHS` (exact, case-insensitive,
   forward-slashed match). If it matches, proceed straight to the existing
   deny — no window lookup at all.
2. Otherwise call `windowCoversRule({ rootDir: projectDir, ruleId: "GS-6" })`.
   If `covered`, `process.exit(0)` after writing a one-line
   `[pipeline-guard-maintenance-window] GS-6 lifted: expires <iso>, reason: <reason>`
   to stderr (visible, not silent) — this is the ONLY new allow path added to
   this file. Otherwise fall through to the existing deny unchanged.

GS-1 through GS-5 and GS-7 branches are NOT touched — do not add a window
check there; that is the point of ADR-0058 Decision 2.

## Guard integration: `plugins/pipeline-core/hooks/guard-testpath.mjs`

Add a check between the existing `matched` computation and the existing
`overrideAdmitted`/HGO branch: before falling into the chat-mode-only HGO
logic, call `windowCoversRule({ rootDir: projectDir, ruleId: matched.id })`.
If covered, `process.exit(0)` after the same one-line stderr notice shape as
above (adjust the rule id in the message). This check is independent of
`gates.push_approval` mode — a signed window is a real proof regardless of
push-approval mode, unlike HGO's `chat`-mode branch. If NOT covered, fall
through to the existing logic exactly as it is today (including the
`overrideAdmitted` HGO path) — this is a pure addition, not a replacement.

## Explicitly NOT in this dispatch's scope

- `guard-lifecycle-ready.mjs`'s shell lane: GS-6 has no shell-lane
  enforcement today (accepted, documented gap — see its own
  `gateStrengthShellRefusal` comment), and TP-* likewise has no shell lane.
  There is nothing to add a window check to there. Do not touch this file.
- The SessionStart bootstrap warning and `hooks.json` wiring for it — separate
  follow-up dispatch, once this dispatch's `currentGuardMaintenanceWindow`/
  `status` output is proven correct and Critic-reviewed.
- Any change to `lib/po-approval-proof.mjs` or `lib/human-guard-override.mjs`
  themselves — read-only references for this dispatch.

## Follow-up (separate dispatch, after NOVA-GMW-1 lands and is Critic-reviewed): bootstrap warning

Not part of NOVA-GMW-1 — depends on its `currentGuardMaintenanceWindow`/
`status` output being correct and reviewed first. Recorded here now so the
next dispatch has a ready contract.

New file `plugins/pipeline-core/hooks/guard-maintenance-window-check.mjs`,
wired into `plugins/pipeline-core/hooks/hooks.json`'s existing SessionStart
`startup|resume|clear` matcher (same group as `staleness-check.mjs` and
`setup-check.mjs` — read `setup-check.mjs` first for the exact output
contract and fail-open discipline to mirror):

- Calls `currentGuardMaintenanceWindow({ rootDir })` directly (import the lib
  function; do not shell out to the CLI from a hook).
- `status: "absent"` → silent, exit 0 (the normal case — nothing to report).
- `status: "active"` → non-silent: `{ systemMessage, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }`
  on stdout, exit 0 (NEVER exit non-zero — this hook must never block
  startup, matching every other hook in this matcher group). Message states
  scope, reason, and remaining time plainly, e.g. "Guard maintenance window
  active: GS-6, expires in 41 min, reason: <reason>."
- `status: "expired"` (a record exists but is past its effective expiry) →
  one informational line, not a repeated nag: e.g. "A guard maintenance
  window expired at <iso> and is now inert (GS-6 refuses again). No action
  needed; run `guard-maintenance-window.mjs close` to clear the record if
  you want it gone." Do not treat this as equivalent severity to `active`.
- If the just-closed/expired window's scope included `GS-6`: additionally
  compare the CURRENT live-plugin tree hash (same computation
  `prepareGuardMaintenanceWindowRequest` used) against the window's recorded
  `openingTreeSha256`. A mismatch is stated as fact, not a verdict: "The
  plugin root changed during this window (opening tree <hash>, current tree
  <hash>) — confirm this matches an intended, reviewed change." No mismatch
  → say nothing extra.
- Any read/parse error anywhere in this chain → silent, exit 0 (fail-open,
  identical discipline to every sibling hook in this file).
- Test fixtures: an absent window, an active window, an expired-but-present
  window, and an expired GS-6 window with a tree-hash mismatch — four cases,
  each asserting the exact stdout shape (or lack of it) and exit code 0 in
  every case including a simulated internal error.

## Test expectations (in addition to the DoD checks in the briefing)

- A request naming a non-liftable rule id (e.g. `GS-2`, or an unknown id) is
  rejected at `prepare` time, before any signing would even be possible.
- A request/window whose `scopeRuleIds` includes anything in
  `NEVER_LIFTABLE_KERNEL_PATHS`'s effective coverage is still refused by the
  calling guard for that exact kernel path, even with a fully valid, signed,
  unexpired window — construct a real fixture proving this, not just an
  assertion about the code's shape.
- Expiry: a window with a missing/malformed/absent `expiresAt` is treated as
  NOT active (fail-closed) — explicit test, mirroring the exact bug shape
  already found once in `human-guard-override.mjs`.
- TTL clamp: a signed window claiming `ttlSeconds` beyond `MAX_WINDOW_TTL_MS`
  is honored only up to the clamp, not the claimed value.
- Physical-repo binding: a window prepared/installed for one physical
  repository does not verify for a different one (reuse whatever fixture
  pattern `human-guard-override.mjs`'s own tests already use for this).
- A tampered `window.json` (any byte changed post-install) fails
  `currentGuardMaintenanceWindow` — proof re-verification catches it, not a
  cached boolean.
