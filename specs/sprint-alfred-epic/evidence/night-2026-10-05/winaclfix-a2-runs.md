# WINACLFIX-A2 run evidence (commit `b54b108d9`)

Durable copy of the machine-written captures (`capture-evidence.mjs`, host paths redacted) that lived only under the
ignored `scratch/WINACLFIX-A2/` (Critic finding F3). Native Windows, single files, own repository. Summary lines are
quoted verbatim from each capture; the full logs stay in scratch.

## New helper suite — `node --test plugins/pipeline-core/lib/hardened-private-directory.test.mjs`

```text
exitCode: 0
✔ non-win32 platform creates one 0o700 directory per segment and never touches the DACL helpers
✔ win32 hardens every directory it created before descending and only assesses pre-existing ones
✔ win32 refuses a pre-existing insecure directory instead of silently re-hardening it
✔ win32 fails closed when hardening a directory it just created does not end secure
✔ a target outside the anchor and a non-directory segment are refused on every platform
✔ real native Windows: created directories assess secure; a pre-existing insecure one is refused and stays unhardened
✔ pre-commit installer creates its private state directories with a secure DACL
✔ commit-msg installer creates its private state directories with a secure DACL
ℹ tests 8 · pass 8 · fail 0 · skipped 0
```

## Installer suites, before (unfixed) and after (`b54b108d9`)

| Suite (`node <file>`) | Before | After |
|---|---|---|
| `scripts/pre-push-hook-install.test.mjs` | exit 0 · tests 44 · pass 44 · fail 0 | exit 0 · tests 44 · pass 44 · fail 0 |
| `scripts/commit-msg-hook-install.test.mjs` | exit 1 · tests 22 · pass 20 · fail 2 (CMI002, CMI018) | exit 1 · tests 22 · pass 20 · fail 2 (CMI002, CMI018) |
| `scripts/pre-commit-hook-install.test.mjs` | exit 1 · tests 56 · pass 5 · fail 51 | exit 1 · tests 56 · pass 5 · fail 51 |

The pre-commit reds fail in fixture setup (`freshRepo`, governance-enrollment `commonPath` separator) and say nothing
about this change. No RED capture exists for the helper suite before the module (the guard refused that run).
Open per Critic F1: no `applyInstall` DACL case yet (fix slice WINACLFIX-F).
