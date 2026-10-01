# Implementation dispatch and ordinary continuation

Load when a ready Elephant starts an approved implementation dispatch or
prepares its Critic review. A recorded PRD/Spec approval mandates execution
of its accepted scope; no new PO touch is needed for routine work.

Goldfish dispatch begins with the first implementation edit under an `epic`
or `feature` profile. The Elephant does not write the diff. A `mini` profile
is the sole direct-implementation exception. Build the dispatch briefing
from `templates/prompts/goldfish-task.md`, never freehand. For Workflow fan-out
load `references/workflow-dispatch.md`. This is a followed instruction, not a
technically guard-enforced one; a skipped dispatch creates no refusal to
catch later.

Before sealing a model-bearing native dispatch packet, run the installed
`scripts/model-role-dispatch-select.mjs --repo-root <absolute-repo> --runner <current-runner> --task-route <registered-route>`.
For Antigravity append
`--host-session-id <id-from-this-session's-native-hook>`. Use the declared
`profile.<profile>.<phase>` or `duty.<duty>` route from the registered source;
the role is task-derived, never guessed from model names. `ready` selects the
exact returned `modelId`/effort. `legacy-v3` explicitly keeps the returned
`v3Route.selector` and `v3Route.effort` from the validated V3 cell. Copy both
into the native packet before sealing; never leave the model blank or inherit
the Elephant's model silently.

A missing identity, policy, observation, defective optional model-role
receipt, or derived role source yields a visible diagnostic and the exact V3
fallback, never a partial lifecycle or unapproved model. `unavailable` is
reserved for an invalid V3 source or task with no admitted V3 route; it stops
only that dispatch. Do not derive a model from its name or probe an
uninstalled runner. The selected model must enter the packet before its
digest is sealed; host alteration after sealing is not recovery. Before any
Antigravity `invoke_subagent` request including a Pipeline role, load
`references/antigravity-native-dispatch.md` regardless of Workflow or
worktree choice.

For native host-commit dispatches, select the binding from the caller being
invoked: Claude `Agent`/`Task` uses the v1 functional `agentType`; Codex
`spawn_agent` uses the v2 `nativeAgentType: "worker"` while retaining the
functional `pipeline-core:goldfish-implementor` or
`pipeline-core:goldfish-mechanic` role. Insert one selected binding and one
host directive into the complete six-field Goldfish briefing. Keep unused
runner examples out of the dispatched message so hook preparation sees one
unambiguous marker.

A feature's implementation is incomplete until the `critic-review` skill has
dispatched a Critic review and returned a result, whether pass or documented
fail-then-fix. This applies in consuming projects. After applicable plan and
deterministic gates, the Elephant validates bounded review input, starts the
supported Critic route, monitors it, reads its result and continues authorized
disposition and repair. Ordinary Critic execution creates no Pipeline PO
gate or obligatory user terminal step. Use normal host execution permissions
when needed; actual host/security denials or unavailable execution must be
reported, never bypassed or counted as completed review. Review admission,
isolation, correction/review budgets and expressly defined PO gates still
apply.

The Workflow tool and Agent tool fan-out are Elephant-only. Do not delegate
them to a fork or `general-purpose` subagent that inherits the full parent
toolset. Read `references/workflow-dispatch.md` before using either.

Choose implementation details, sequencing, bounded recovery, test fixes and
internal alternatives within the accepted scope without asking again; record
material choices and return results for acceptance. Ask only where
alternatives materially change accepted scope, criteria, priority, risk,
cost, an external or irreversible consequence, or configured decision gate.
Never turn routine uncertainty into serial PO approvals.
