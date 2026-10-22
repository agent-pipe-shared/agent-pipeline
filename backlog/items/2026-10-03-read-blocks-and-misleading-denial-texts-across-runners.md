---
schema: pipeline.backlog-item.v1
id: pipeline.read-blocks-and-misleading-denial-texts-across-runners
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO observation after the 0.7.0 three-runner greenfield tests, 2026-10-03, plus live observations in the Agent-Pipeline Claude/Windows session the same day."
sprint: alfred
done_when: manual
---

# Too many read blocks, and denial texts that say "not present" instead of "blocked"

## Description

**PO observation (all runners):** there are still too many read blockades. In
some places the agent-visible text still says that something is not present or
does not exist, when the truth is that the guard blocked the read. Agents then
draw wrong conclusions.

Concrete cases observed in the Claude/Windows session on 2026-10-03:

- Every in-repo read was refused (separate root-cause item
  `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md`).
- Native `Read` of a user-supplied report on a WSL UNC path
  (`\\wsl.localhost\...`) is refused with `GUARD-READ-TARGET`, while a Windows
  drive path outside the repo is admitted. The PO handed over three such paths
  as working material.
- Native `Grep` with a `glob` filter is always refused. `readToolScopeVerdict`
  only admits Grep when `selector === undefined`, so a scoped search such as
  `glob: "2026-09-2*-*.md"` inside the repo is denied.
- Native `Grep` on an in-repo **directory** (for example `path: plugins/pipeline-core`,
  no glob) is refused. Grep only admits exact files or registered plugin
  directories (`isSafeExactPassiveFile` / `isSafeRegisteredPluginDirectory`), so
  the normal "search this subtree" usage needs a Bash `rg` workaround. Native
  `Glob` with a `*` pattern and no path is refused as well.
- The Claude test run reports read-only `ls`/`Glob` on the transcript directory
  and `node scratch/forensics.mjs` refused (Claude analysis V-8).

## Acceptance

- Ordinary passive reads (Read, Grep with or without glob/type filters, Glob,
  `cat`/`head`/`rg`) inside the project root, scratch and user-supplied exact
  files are admitted on all runners and platforms, including WSL UNC paths.
  Credential roots stay denied.
- Every denial says "blocked by guard <code>" and never implies absence. Audit
  all refusal texts and tool fallbacks for "not found" / "not present" wording
  on guard-denied paths.
- One cross-runner test matrix covers these read shapes.

## Evidence 2026-10-22 (runner rows of the matrix)

The pin `plugins/pipeline-core/lib/pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs` now carries
a Codex row and an Antigravity row next to the Claude row; both start the real native adapters
(`hooks/codex-pretool-guard.mjs`, `hooks/antigravity-pretool-guard.mjs`) as processes. Run: `node --test` on that file,
18 cases, 14 pass, 0 fail, 1 skip (the WSL UNC case, a Linux-host typed skip), 3 todo.

- Admitted on all three runners (green): in-root `cat`, `head`, `rg`, `rg -g` and scratch reads.
- Denied on all three runners with a `BLOCKED (guard-...): GUARD-<code>` text and no absence wording (green): `cat` of an
  in-root credential file and of `~/.ssh/id_rsa`; `cat` of a missing file and `grep -R` are audited when denied.
- Codex has no native Read, Grep or Glob tool; each is refused by name (green), but that adapter-level text carries no
  `GUARD-` code.
- Open, as `todo` cases (real assertions, they flip to plain passes when fixed):
  - M5: an Antigravity native `view_file` of a credential file is allowed, because the adapter allows every read-only tool
    at once (its own test pins that as intended). Acceptance 1 says credential roots stay denied on all runners. Needs a
    product decision: gate the native read tools, or accept the gap and amend the acceptance.
  - M6: the Codex-surfaced `GUARD-READ-COMMAND-UNSUPPORTED` text tells the agent to "use the Read, Glob or Grep tools",
    which Codex refuses. Fix site `lib/guard/grammar-denials.mjs` (protected); a runner-neutral wording patch is prepared.
  - M7: an in-root credential read (`cat vault/id_rsa`) is refused with `GUARD-READ-COMMAND-UNSUPPORTED`, whose text says
    the refusal is about flags or spelling and not a path. The path is the cause. Needs a distinct typed code or wording
    (`lib/guard/evaluate.mjs`, protected); the choice of code is a decision.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — Run the WSL UNC exact-file admission case (U3) on native Windows or WSL, where it is not skipped
  U3 (pins/read-blocks-and-misleading-denial-texts-across-runners.test.mjs line 306) skips on a non-win32 host (typed Linux-host skip) and runs on win32; run that pin with Windows node via cmd.exe on a /mnt/d clone against a \\wsl.localhost path reachable through interop. Minutes.
