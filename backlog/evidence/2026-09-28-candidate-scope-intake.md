# Next local 0.7 candidate: additional PO intake

Recorded 2026-09-28. This records the PO's requested candidate scope and decisions;
it grants no implementation, signature, release or publication authority.

## Accepted scope

1. `pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin` is the leading
   Agy item. The earlier stale-run item is superseded, with its historical facts
   and version-correct live acceptance carried forward. Deduplication is not a fix.
2. `pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in`: one shared
   explicit activation contract, no project governance or unsolicited writes in
   ungoverned/declined repositories, durable decline and wiring-derived regression
   coverage for Claude, Codex and Antigravity.
3. `pipeline.no-uninstall-path-for-a-repository-that-once-opted-in`: a separate
   derived, digest-bound, resumable uninstall route preserving content/history,
   removing only proven owned mechanics and Git shims before private state, and
   finishing in declined state. Foreign/modified hooks must remain untouched.

## Explicit PO policy decision

The PO answered the activation question on 2026-09-28:
“Ja, Git-Konventionen nur in Pipeline-Repos (empfohlen)”.

- Destructive Git protection applies globally.
- Pipeline commit trailers and publication-executor conventions apply only in
  repositories that explicitly opted in.
- The installation hint is the other allowed ungoverned effect; durable decline
  suppresses it. Ordinary hooks otherwise remain silent and do not write state.

## Delivery ordering and ownership

First establish the shared activation/decline interface and validated ownership
inventory. Runner integration, Agy topology diagnostics and uninstall derivation
can then proceed in disjoint files. Changes to shared wrappers, hook installers
and registration lists require a single owner and sequenced integration.

Acceptance must cover ungoverned Git/non-Git repositories, declined repositories,
governed enforcement, onboarding again after uninstall, content retention,
interrupted uninstall and local commit/push behavior with hooks active. A stale
managed Agy snapshot and a registry entry are separate observations; neither
proves loader precedence or the exact executed plugin path.

The supplied broad hook probe is preserved as analysis evidence, not adopted
unreviewed as a release gate. Independent reproduction must record actual
terminal outcomes and distinguish approximate payload fixtures from native runner
observations. No real user HOME, global settings, external publication or provider
invocation is used as a probe target.

The previously presented design package covers the earlier scope. A sanctioned
reopen has returned the current feature to Design/Draft so these requirements
can be incorporated before the single final package approval. Existing receipts
remain historical evidence; they do not claim readiness of the extended scope.

## Independent operational cleanup

The PO-reported Claude `PreToolUse` capture hook for `Bash|Read` in the archived
Nova checkout was independently confirmed and removed on 2026-09-28. Actual
terminal `ec3248` exited 0; readback `694808` found no matching legacy hook.
Other settings were preserved. Capture logs and private signing keys were not
read. This cleanup is separate from candidate runtime acceptance.
