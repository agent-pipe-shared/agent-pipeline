# Antigravity feature-close route

Use this only for an actual approved feature close, never a normal restart,
handover, Compact or runtime transfer. The installed
`scripts/finish-feature.mjs` is the single local entry point for Antigravity.
It wraps the existing coordinator and State writer; it does not grant a PO
approval, release, push or publication authority.

Before invocation, read back the active feature and its approved Result,
the exact Critic/Verify lifecycle receipt ID, the architecture-impact
disposition, and the repository-relative feature-close audit request. If the
active continuity requires a close request, supply its existing
repository-relative path too. Do not invent or infer any of these values.
`--by` is an actor attribution, not a substitute for approval.

Invoke `node "${PIPELINE_PLUGIN_ROOT}/scripts/finish-feature.mjs"` with
`--root <physical-repository-root>`, `--by <actor>`,
`--architecture-impact <architecture-conforms|architecture-changed|no-architecture-impact>`,
`--audit-request <repo-relative-json>`, and
`--critic-verify-lifecycle <exact-64-hex-id>`; add
`--continuity-close-request <repo-relative-json>` when required. Pass these
as separate argv values at the host-authorized execution boundary. The
driver verifies the candidate-bound Audit Bundle and runs only the exact
coordinator-returned State close action. A successful response reports
`status: closed` and a lifecycle ID; independently read back the closed State
and `audit-bundles/<feature-id>/<candidate-commit>/README.md` before telling
the user the close is complete.

If the driver fails, its error reports the lifecycle ID. Preserve that ID and
the existing audit output, repair the stated prerequisite, then rerun with
the same inputs plus `--resume-lifecycle-id <id>`. The resume path inspects
the durable coordinator phase, skips already-applied transitions and replays
an already-prepared transition only under its recorded digest. Never start a
new lifecycle to conceal a partial close. A second refusal remains a real
block; do not use `--no-verify`, manually edit State, or claim the feature
closed merely because a bundle directory exists.
If the State writer already removed the active feature but the original CLI
response was lost, the driver intentionally refuses another close. Read back
the exact `closedFeatures` coordinator and audit references instead of
starting a new lifecycle or treating that refusal as proof of failure.
