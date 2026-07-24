# Contributor gate trust, privacy, and recovery

This document is the technical privacy and threat review for
`contributor-gates / cla-and-dco`. It is bound at run time to the exact pull
request candidate by the receipt's PR number, author login, event action and
sender login, base SHA, and head SHA. The repository contract checker binds
this review to the workflow and checker surfaces. It is not legal advice.

## Personal acceptance and contributor workflow

The gate accepts a CLA checkbox only when the GitHub event proves a personal
action by the PR author:

- on `opened`, the sender must be the PR author and the exact current
  CLA-version/digest line must already be checked;
- on `edited`, the sender must be the PR author, `changes.body.from` must not
  contain that exact checked line, and the current body must contain it exactly
  once; and
- `synchronize` and `reopened` intentionally fail with
  `CLA_ACCEPTANCE_REFRESH_REQUIRED`. The author must edit the PR body to
  uncheck and then personally re-check the current line on the current head.

A maintainer, bot, or other account therefore cannot create the accepted
transition for the contributor. The receipt binds the accepted action to the
current base and head while DCO checks every candidate commit in that range.

## Trust boundaries and failure modes

The workflow has three distinct authorities:

1. `trusted-gate` is checked out at `pull_request.base.sha`. Its checker and
   exact CLA bytes/version/digest are trusted gate inputs.
2. `candidate` is the untrusted PR checkout. It supplies Git objects and the
   DCO range only; rewriting its checker or CLA cannot control acceptance.
3. The GitHub `pull_request` event supplies the contributor-auth boundary:
   PR author, event sender, action, body transition, PR number, and exact base
   and head SHAs. No repository text can substitute for those event fields.

Both checkouts disable persisted credentials, workflow permissions are
read-only, and the workflow consumes no secrets. Missing or malformed event
fields, incomplete Git history, unavailable commits, a proxy actor, an edited
event without a body transition, stale CLA data, `synchronize`, and `reopened`
all fail closed. Branch protection must additionally require this check and an
up-to-date branch; repository files cannot prove that server-side setting.

## Technical data-privacy review

The job-log receipt contains only the PR number, public account logins, event
action, transition type, base/head commit IDs, base branch, CLA version and
digest, DCO commit count/status, and typed error codes. DCO processing reads
commit author email addresses locally only to compare author-matching
`Signed-off-by` trailers; it never writes an email address into the receipt.
Tests enforce that exclusion. No credential, secret, private address, private
account link, PR body, or commit message is emitted.

The receipt is printed to the current GitHub Actions job log and written with
mode `0600` under runner-temporary storage. It is not uploaded as an artifact
or copied into repository history. GitHub's configured job-log retention and
access controls therefore govern the only retained copy; the temporary file
dies with the runner. Maintainers must select the shortest operationally
adequate Actions retention period and restrict log access consistently with
repository visibility.

Technical minimization review status: approved for candidate commit
`f83803c767f90dceacea936ac3bd52c63dc24bd1`, tree
`9bdd679db74aa0b1b7877984df7324ffb880be86`, and its recorded license surface
set. On 2026-07-23 André Twachtmann supplied the separate named-human privacy
approval: “Review ist erfolgreich durchgeführt und erledigt! Ich, André
Twachtmann, genehmige den kandidatgebundenen Datenschutzreview für
f83803c/9bdd679d und 30 Tage Actions-Log-Retention.” The authenticated
server-side read-back reported 30 days, a maximum allowed value of 90 days,
on 2026-07-23. The closed-schema disposition is recorded in
[`2026-07-23-snt-1-privacy-disposition.json`](../backlog/evidence/2026-07-23-snt-1-privacy-disposition.json).
This candidate-bound approval does not imply release consent, publication, or
a backlog evidence amendment.

On 2026-07-24 André Twachtmann confirmed: “bestätigt ausdrücklich die Privacy-Freigabe für den gebundenen Freeze-Kandidaten 79a2c9b0b979d171d69217df6493db8cc75b9484 / Tree 9fc4320bf00c0af7a08304c8afeeb2014c083508, einschließlich 30 Tagen Actions-Log-Retention”. The candidate-specific disposition remains separate from the historical approval above and does not widen it to later candidates.

On 2026-07-24 André Twachtmann also confirmed: “Lizenz- und Privacy-Freigabe einschließlich 30 Tagen Actions-Log-Retention bestätigt für den gebundenen Freeze-Kandidaten 9a7ee7bdf072189817a7b59f291d583d8632bf64 / Tree 51d33be9108c618cecb6c7eee2f753c67e706522”. This later freeze supersedes the SNT-1 disposition only for its exact seven-surface digest set.

## Rollback and recovery order

If the checker, workflow, or server ruleset is wrong, recovery is fail-closed:

1. Freeze merges without removing the required check or up-to-date-branch
   rule, record the affected base/head SHAs, and preserve the failed receipt.
2. Revert the bad checker/workflow/template/privacy-contract commits through
   ordinary commits; never rewrite shared history or run untrusted PR code.
3. Re-run focused contributor-gate and license-contract tests, then land the
   last-known-good trusted-base gate through the normal protected path.
4. Restore or repair the server ruleset so it requires exactly
   `contributor-gates / cla-and-dco` and an up-to-date branch, then perform an
   authenticated server-side read-back.
5. Re-run the gate for every affected exact PR head. The PR author must make a
   fresh personal checkbox transition when required; old green results are
   not reused.
6. Resume merges only after the workflow result and ruleset read-back agree.

If server protection itself is the fault, merges remain frozen while steps
2–5 restore both repository and server authorities. Deleting the check,
weakening permissions, accepting a proxy checkbox, or manually overriding a
red result is not recovery.
