# Semgrep six-tool CI PATH correction

The first clean Push Verify ran against commit
`cdcd6fb45ca48c723995b24ce2a98514b9811531` and tree
`17b156dfdd9cfd2c1233d66949edf76300008852` with the workflow's former
five-tool PATH (`node`, `git`, `bash`, `sh`, `openssl`). Its immutable private
suite receipt is in run `verify-1789143396507-c7061cf9a7a9b1bb`, suite
`security-scan`, receipt SHA-256
`8f735fd17ac84e09b2ea94547f8875e96e85a6b82c7b82d1b67e01cf62deecbf`.
The suite exited 2. The bound log reports Semgrep's exact failure:

> `Failed to create system store X509 authenticator: run ['uname' '-s']: No such file or directory`

Commit `96b8bf8d28a9b21190f85d3d3270cc832417837e` added only the host `uname`
executable to the synthetic Core Verify PATH and pinned that workflow contract
in the topology-preflight test.

On 2026-09-11 the correction was exercised at the real host process boundary
against the later clean candidate
`ca3a2f1b7b63c5345c9a89554b2f4c7c35d9b44c`, tree
`4df73b1f1876935d8741391ea68775a4eaf36bdc`. A detached temporary worktree was
used so scanner evidence could not dirty the source checkout. Its PATH
contained exactly symlinks for `node`, `git`, `bash`, `sh`, `openssl`, and
`uname`, matching `.github/workflows/verify.yml`. The direct command was:

```text
PATH=<six-tool-directory> <six-tool-directory>/node \
  <temporary-worktree>/plugins/pipeline-core/scripts/security-scan.mjs \
  --root <temporary-worktree>
```

It exited 0. Results were: gitleaks clean, osv-scanner honestly skipped because
the repository has no package sources, Semgrep clean with zero findings, and
license-check clean. This is the local fail-before/pass-after proof for the
altered execution path. The historical Main CI backlog item remains open until
a future authorized push supplies a new remote GitHub Actions result.
