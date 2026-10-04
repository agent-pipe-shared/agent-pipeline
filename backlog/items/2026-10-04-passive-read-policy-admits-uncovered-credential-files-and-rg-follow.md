---
schema: pipeline.backlog-item.v1
id: pipeline.passive-read-policy-admits-uncovered-credential-files-and-rg-follow
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Code reading during the Alfred W1-5 read-policy prework (2026-10-04); not probed against a real credential store."
sprint: alfred
done_when: manual
---

# Passive read policy admits uncovered credential files, and the rg grammar admits `-L`

## Description

Security candidates found by code reading. Neither was probed: no credential store was read.

- The passive-read credential list in `plugins/pipeline-core/lib/passive-read-policy.mjs:115-118` and
  the secret basename pattern at `:10` cover neither `~/.git-credentials` nor `~/.pypirc`. An
  exact-file host read of either file therefore passes the user-visible-host-path rule (`:185-191`).
  `.netrc` and `.npmrc` are covered only through the basename pattern. `/etc/shadow` is covered only
  on POSIX hosts. No shared credential constant exists, although Spec §21.2 requires one list for host
  and WSL distro paths.
- `plugins/pipeline-core/hooks/guard-command-grammar.mjs:16-21` admits `rg -L` and documents it as
  `--files-without-match`. In ripgrep `-L` is `--follow`, so the grammar admits symlink traversal. The
  policy's secret inventory (`rg --files`, `passive-read-policy.mjs:49-55`) does not follow symlinks
  and never sees what that traversal reaches.

## Acceptance

- One shared credential-root constant covers at least the Spec §21.2 list plus `.git-credentials`,
  `.pypirc`, `.netrc`, `.npmrc` and `/etc/shadow`. It applies to every spelling: host, WSL UNC and
  distro home. A synthetic-home test proves a refusal for each entry.
- `rg -L` / `--follow` is refused, or admitted only with a follow-aware inventory. A test pins the
  decision.
- Owner: Spec §21.2 R2 (plan WP W1-5); prework in `scratch/prework/W1-5-read-policy/`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
