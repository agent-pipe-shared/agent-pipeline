# Project-scoped GitHub Issue operations

The matching pipeline skill is
[`github-issue-operations`](../plugins/pipeline-core/skills/github-issue-operations/SKILL.md).
It is the safe execution contract; this page is the operator setup and command
reference.

This guide describes the safe user setup for letting Agent-Pipeline work with
Issues in a consuming project, such as a web application. It covers the
authentication and command contract currently available to the project. The
pipeline integration itself is tracked as
[`2026-07-20-project-scoped-github-issue-operations.md`](../backlog/items/2026-07-20-project-scoped-github-issue-operations.md).

This is separate from the Public Core
[`capture-observation`](observation-intake.md) workflow. Observation capture
has a fixed repository target and privacy boundary; it must not silently use a
consuming project's remote.

## One-time user login

Install and authenticate the GitHub CLI locally. The browser flow keeps the
credential out of the repository and chat:

```sh
gh auth login --hostname github.com
```

Choose GitHub.com, HTTPS, and the browser-based sign-in flow. If a token is
required, create a fine-grained token restricted to the exact repository and
grant only:

- **Issues:** Read and write
- **Metadata:** Read

Keep the token in the local GitHub credential store. Never paste it into a
conversation, commit it, put it in a `.env` file, or include it in an issue.
For a private repository, the token must explicitly include that repository.

Verify the local session without printing the credential:

```sh
gh auth status --hostname github.com
gh api user --jq .login
gh repo view --json nameWithOwner
```

The last command should resolve the consuming project's repository. If the
project has multiple remotes, the user must explicitly select the intended
`OWNER/REPO`; the pipeline must display that target before a write.

## Safe operation contract

The project-scoped capability is intended to support read/list/search plus
explicit create and narrow edit operations:

```sh
gh issue list --repo OWNER/REPO --state open
gh issue view NUMBER --repo OWNER/REPO
gh issue create --repo OWNER/REPO --title "Title" --body "Body"
gh issue edit NUMBER --repo OWNER/REPO --title "New title" --body "New body"
```

The pipeline must resolve and display the target, verify authentication and
issue access, show the exact issue payload or edit delta, and obtain explicit
confirmation before each mutation. Afterward it must read the issue back and
report the stable issue number and URL only when the target and changed fields
match.

By default, this capability does not delete issues, transfer issues, change
repository settings or permissions, alter Actions/secrets, or silently close,
relabel, assign, or comment on issues. Such operations need a separately
approved capability and narrower confirmation.

## Target and privacy rules

- A project remote is a candidate target, not implicit write authorization.
- A target change between preview and write invalidates the confirmation.
- Credentials, private paths, hostnames, raw logs, prompts, and private
  evidence never enter issue content or machine evidence.
- An authentication, target, permission, or readback failure is a typed
  non-success; the pipeline does not retry a different repository silently.
- Public observation reports continue to use the fixed Public Core target and
  the `capture-observation` privacy/label workflow.

## Troubleshooting

`gh auth status` failing means the local login must be repaired before the
pipeline can operate. A repository or permission error means the selected
fine-grained token does not include the target repository or Issues permission.
Do not work around either failure by copying credentials into the project or by
using a broader token than the task requires.

The feature backlog item defines the remaining adapter, confirmation, and
readback tests. Until that implementation is delivered, the commands above
are the supported manual equivalent and must still follow the preview and
target rules when used on behalf of a project.
