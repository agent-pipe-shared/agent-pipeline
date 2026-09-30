---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-1-2-13-blocks-managed-refresh
type: bug
owner: pipeline
status: open
created: 2026-09-29
source: "Antigravity greenfield 0.7.0 report: installed agy 1.2.13 is refused by the source's exact 1.2.12 topology refresh checks; a stale managed copy remains loaded."
sprint: alfred
done_when: manual
---

# Allow the observed Antigravity 1.2.13 plugin lifecycle

The topology planner and refresh host both pinned the CLI to 1.2.12. The
observed host reports 1.2.13 and still exposes the plugin validate, install,
uninstall and list commands. The old 0.6.2 managed copy cannot be refreshed
to the current source through the documented global installer route.

## Acceptance

- Admit the observed 1.2.13 plugin lifecycle at both plan and apply boundaries
  while retaining a refusal for unobserved future versions.
- Preserve the physical source, import, registry, hook and installed-attestation
  readbacks before reporting success.
- Test 1.2.13 with a stale managed copy and an unknown version that remains
  blocked; confirm the three-runner manifest build after a fresh stamp.
- Re-run the actual Agy global update and first greenfield preflight on the
  newly installed local candidate. A fixture pass alone does not close this.

## Source progress

The shared version check and 1.2.13 regression are implemented. Refresh
13/13, topology integration 9/9 and installer 14/14 pass. Installed-host
acceptance on the next stamped candidate remains open.
