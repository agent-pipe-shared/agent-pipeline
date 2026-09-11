# Consumer runner permission onboarding

Date: 2026-09-11

Implementation commit: `d0857abbedb6f86d3e57436cd443f5878ff1eded`

V3 onboarding now derives and records the complete runner permission set used
by the installed pipeline. For file-managed Claude settings this covers Bash
and PowerShell lanes and both slash spellings where the platform can expose
them. Host-managed Codex permissions are reported as `not-applicable` rather
than represented as a file projection.

The Ready gate recomputes the expected ordered entries and rejects incomplete
projections. A valid partial `.claude/settings.json` receives a digest-bound
merge action that preserves unrelated top-level and allow-list values.
Malformed present shapes such as scalar or null `permissions`, or a non-array
`permissions.allow`, are typed `unrepairable`; planning and activated apply
leave the original bytes unchanged and expose only a manual planning action.

Focused tests passed:

- project onboarding: 169/169
- runner profile migration: 51/51
- onboarding Ready gate: 19/19
- settings allow-list merge: 17/17
- documentation contracts and canonical/template prompt equality

The final independent correction Critic returned PASS. It independently
verified exact Ready comparison, bound preservation for repairable partial
settings, and fail-closed byte preservation for malformed settings. Its local
sandbox could not run the eager host `git init` portion of the monolithic
onboarding suite; the reported complete onboarding run is therefore the
implementation host's focused result, while the Critic directly reran the
Ready and settings-merge suites.
