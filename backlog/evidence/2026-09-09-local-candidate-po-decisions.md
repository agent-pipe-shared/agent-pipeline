# Local candidate PO decisions — 2026-09-09

## Standing Critic consent

After a concrete preview identifying the private repository diff, 88 selected
references and the configured Codex service with Astra/max, the PO answered:

> Critic Freigabe liegt hiermit dauergaft vor

This grants standing consent for genuine Critic reviews of this repository
through its configured Codex route, including necessary private review inputs.
It is chat-attributed consent, not a cryptographic signature or a PASS verdict.
The reviewed preview packet has SHA-256
`6a849cf4b799f7998fc487922327f5794701f605f89af5cf2404360cbda7e562`.

## Protected GG22 regression insertion

The PO applied the prepared `guard-git-22-pathspec` step and reported 239/239
passing cases. After the normal pre-commit backstop refused TP-1, the PO used
its explicitly human-only terminal route. Agent execution did not bypass it.
Readback confirms commit `bdaa374b303dee04b1a6a3311c1b4a76c0c1d748` adds
exactly the seven prepared cases (72 lines). The new commit requires fresh
full Verify binding; the prior 517/517 result binds only `c3daf1a2`.

## Feature-branch push after completion

The PO subsequently requested a push once the local candidate is final.
This supersedes the earlier no-push instruction for the completed candidate
only. The configured upstream is `origin/feat/sprint-nova-codex-v046`.
Preserve the local version stamp, satisfy the normal push prerequisites, and
read back the remote commit. This grants no release, force push, or exchange
of installed plugins.
