# Known Issues

## 0.7.0: limits you can meet on the feature path

Found in end-to-end runs on all three runners and listed with what to do. None
of them is hidden by a green check; each ends in a typed refusal or notice. The
path itself is in [usage](usage.md#from-an-idea-to-the-implementation-phase).

| Limit | Where you meet it | What to do |
| --- | --- | --- |
| A node installed under a version manager may not start inside a runner's sandbox. | The start preflight reports `NODE-SANDBOX-UNREACHABLE`; on Codex a published `node` action failed with `EPERM`. | The onboarding Driver now runs its own interpreter for the actions it spawns. For the rest, follow the one-time remedy the preflight prints: a system `node`, or allow the version-manager directory in the runner's sandbox. |
| A wildcard in the architecture block's owned paths is refused. | The design inspection, before the review. | Write the exact files or directories; the refusal names the field, the rule and the rejected value. |
| A very long hyphenated word in a resume-hint field is read as a key and refused. | `resume-hint.mjs capture`. | The refusal names the word; shorten it or write it as separate words. |
| A commit between `present-plan` and the signature makes the presented request stale. | The next `present-plan`, refused with `DWP-REQUEST-EXISTS-DRIFT`. | Delete the one scratch file the refusal names, present again, and make no commit before the signature. |
| A project command that already uses the reserved Verify id `browser-smoke` for another tool is taken over by the browser preflight. | The browser smoke step of the Verify. | Rename the project command ([Verify reference](usage.md#verify-reference)). |
| `0.7.0` is not released: its full verification, the independent review and the final acceptance are outstanding. | Every statement about `0.7.0`. | See [what's new in 0.7.0](whats-new-0.7.0.md#what-remains-open). |

The maintainer-side record of the V3 foundation transfer and its rollback scope
moved to [the maintainer transfer record](maintainer-v3-transfer-record.md).
