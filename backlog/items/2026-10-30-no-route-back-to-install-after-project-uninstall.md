---
schema: pipeline.backlog-item.v1
id: pipeline.no-route-back-to-install-after-project-uninstall
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (third consumer, build 0.7.0+claude.20261030131902.8fc9c8b, all observations read-only); PO direction 2026-10-30: major, into candidate 11; after an uninstall no new version can be installed"
done_when: manual
---

# No route back to an install after `project-uninstall`

## Evidence

A consumer ran `project-uninstall.mjs apply --activate` earlier. Installing the current version afterwards has
no executable route; the controlling actions form a circle (all with `--runner claude`, all non-mutating):

| # | Command | Result |
|---|---|---|
| 1 | `project-onboarding-v3.mjs inspect` | `partial`, only diagnostic `$.manifest manifest_invalid`, `nextAction` `plan-manifest-repair`; runner permissions `drifted` |
| 2 | `plan-manifest-repair` | `unrepairable`, `canonical_manifest_requires_owner_repair`: "repair project/pipeline.yaml through its owning authority workflow", no command named |
| 3 | `plan-reinstall` | `not-applicable`, `reinstall_manifest_unowned` |
| 4 | `plan-source-recovery` | `unrepairable`, `source_is_current`, guidance "rerun the V4 lifecycle inspection" (back to 1) |
| 5 | `project-authority-migration.mjs plan` | `noop`, `source: neutral` |
| 6 | `plan-runtime` | same as 1 |
| 7 | `project-uninstall.mjs` | verbs `plan`, `apply`, `resume` only |

The uninstall left the generated manifests half stripped (`language.human_facing`, `session.keep_awake`,
`modelRouting`, `criticExport` removed, the skeleton kept). That state is neither absent (new onboarding would
apply) nor the current generated projection (`plan-reinstall` would apply). `pipeline.user.yaml` is untouched.
Restoring the files from HEAD is wrong: HEAD is not the pre-uninstall state. The uninstall journal
(`.git/pipeline-uninstall/<scope>/<plan>/journal.json`, `pipeline.project-uninstall-journal.v1`, `completed`)
knows the source digest, the projection digests, the hook footprint and the retained state (an old state file
with `closedFeatures`).

## Wanted

1. A reinstall route after an uninstall: detected from a completed uninstall journal, it plans regenerating
   every projection from the current source plus migrations to the current version, hooks and runner
   permissions included; it is reached from `inspect` as the controlling action.
2. `inspect` never recommends an action that leads back to itself; with no route it says so.
3. `canonical_manifest_requires_owner_repair` names the owning command (script and verb).
4. Uninstall is all or nothing for generated projections: fully removed or fully kept, never stripped.
5. The retained state (`closedFeatures`) is restored on reinstall, documented.
6. Regression test: uninstall, plugin update, reinstall, `pipeline-start` ready, `closedFeatures` kept; plus a
   replay from the stripped state described above.
