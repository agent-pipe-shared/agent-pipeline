---
name: capture-observation
description: Sanitize, preview, publish, and read back a canonical public GitHub observation. Use for an observed bug, a candidate known error that is not yet confirmed, runner or sandbox friction, or another concrete behavior report that needs durable public intake without automatic backlog promotion.
---

# Capture Observation

Create one public observation only after its target, privacy, labels, and exact payload are verified.

## Workflow

1. Resolve the repository-owned allowlisted public GitHub `owner/repo`. Accept a repository only from committed public configuration or an explicit user selection that matches the public remote. Return `setup-required` for a missing or ambiguous target. Never publish to a private overlay, an arbitrary current remote, or a repository inferred from machine-local data.
2. Require a GitHub tool that can list labels, search open and closed issues, create an issue, and read it back. Fail closed when the tool, authentication, or network is unavailable.
3. Collect the shared intake fields: `area`, `actual`, `expected`, `reproduction`, `frequency`, `observed environment`, `sanitized evidence`, and `source backlog links`. Use `unknown` or `omitted` instead of guessing.
4. Add runtime context only when directly observable: runner, plugin version, Pipeline version, public candidate SHA, coarse OS class, and typed capability status. Never infer model identity, isolation, a root cause, or confirmation from configuration or route selection.
5. Route any possible vulnerability, permission bypass, unintended write, secret exposure, or scope escape to the repository's private vulnerability-reporting path before constructing a public issue. Return `private-routing-required`; create no public issue.
6. Reject secret-like material and raw prompts, chat history, or raw logs. Redact usernames, hostnames, email addresses, home paths, private remotes, and private network coordinates. Reject every GitHub repository URL that does not match the resolved public target, including otherwise public-looking cross-repository coordinates; never render it in a preview. Do not retain rejected or pre-sanitized input.
7. List the repository labels. Require exactly `kind:observation`, `triage:needs-review`, and one closed-enum `area:<value>` label. If any is absent, return `setup-required` with the missing names; never substitute `bug`, `question`, or another label.
8. Run `node scripts/observation-intake.mjs --repository owner/repo` with the resolved public target and the closed JSON input on stdin. Use its canonical title, body, labels, and redaction report. The script is local-only and must never publish. A referenced GitHub repository with no resolved target returns `setup-required`; a mismatched target returns `privacy-rejected` without echoing the coordinate.
9. Search open and closed issues using the sanitized title, actual behavior, area, and distinctive public error codes. Show duplicate candidates; never silently merge, comment, close, or relabel them.
10. Show the exact public repository, title, body, labels, redactions, and duplicate candidates. State that publication is public. Require an explicit publish confirmation for this exact preview; absence, refusal, or changed content is a non-success.
11. Create the issue with the GitHub tool using the previewed payload. Do not set `confirmed`, `known-error`, `backlog-linked`, assignees, milestones, or projects. Never create or edit a backlog item.
12. Read the created issue back with the GitHub tool. Require the expected repository, title, body, and exact initial labels plus a stable issue number and URL. Only then return the number and URL. A missing, mismatched, or failed readback is `publish-unverified`, never success.

## Repository Issue Form

For manual intake, use the repository-owned
[`observation.yml`](../../../../.github/ISSUE_TEMPLATE/observation.yml). It uses
the same fields and privacy/security boundary but applies only the two fixed
labels `kind:observation` and `triage:needs-review`. GitHub Issue Forms cannot
derive a label from the selected Area, so triage applies the `area:*` label.
The controlled skill path may apply its verified area label at creation.

The GitHub Issue remains the observation and triage single source. Follow
[`docs/observation-intake.md`](../../../../docs/observation-intake.md) for the
confirmed/known-error disposition and reciprocal backlog-link contract. Never
promote an observation to the backlog automatically.

## Deterministic helper

Run `node scripts/observation-intake.mjs --schema` to inspect the accepted input. Run `node --test scripts/observation-intake.test.mjs` after changing the shared headings, privacy rules, area enum, or initial-label policy.
