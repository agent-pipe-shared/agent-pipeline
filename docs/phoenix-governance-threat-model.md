# PHX-0 governance threat model

Owner: Pipeline maintainers. Review this document with any PHX-0 transport,
source-observation, or privacy-contract change.

## Assets and trust boundaries

| Asset | Trust boundary | Required control |
| --- | --- | --- |
| Selected Pipeline source identity | Codex registry and loaded-plugin observation | Typed source observation; no local path is published. |
| Public ruleset freshness | Public-Core `HEAD` only | A fixed, read-only `git ls-remote` action; private marketplace coordinates are never a freshness authority. |
| Host network capability | Workspace sandbox to selected host boundary | WSL/restricted preflight binds one network-open, read-only host action by boundary ID and request hash. |
| Consumer repository and private runtime | Project, HOME, plugin cache, credentials | Never include paths, cache roots, environment values, tokens, or private remotes in action/result diagnostics. |
| Freshness result | Host adapter back to bootstrap | Accept only a schema-valid receipt that binds the exact action, fixed Git completion, public object ID, and validated host-control identity digest. |

## Abuse cases and mitigations

| Abuse | Mitigation | Recovery |
| --- | --- | --- |
| Restricted sandbox attempts direct network access | No direct fallback after restricted preflight; use the selected host adapter only. | Return `host-transport-required` with the fixed bound action. |
| Copied, substituted, or stale host request | Boundary ID and request hash must match exactly. | Reject as `host-transport-unavailable`; obtain a fresh preflight plan. |
| Ambient `PATH`, repository context, or Git URL rewrite retargets the reviewed public read | The WSL adapter invokes only `/usr/bin/git` from `/` with a sterile environment that disables system/global/repository configuration and all inherited `GIT_*` state. | Return `unavailable`; do not resolve Git from PATH, inherit a Git directory, or retry an alternate URL. |
| Private source gains public-freshness authority | Only the reviewed Public-Core coordinate is selectable. | Return typed private/local source status; do not probe it. |
| Same-version substituted or stale daemon/control endpoint forges version-only host freshness | Canonically hash the complete validated host daemon observation into the Freshness receipt; the receipt excludes raw paths and the common consumer requires its 64-hex identity digest. | Treat a missing, malformed, or incomplete control identity binding as unavailable; no write permission follows. |
| Host output forges a success | Require result schema, exact request hash, completion state, valid Git ID, and the matching host-control identity digest. | Treat malformed output as unavailable; no write permission follows. |
| Diagnostic leaks private topology | Output is limited to status, source class, hashes, counts, typed reason, and (when needed) fixed public action. | Stop publication, remove the leaking field, and rerun privacy tests. |

## Operating and recovery rules

The in-process plan builder is not an executor. A host integration may execute
only the returned action through its sanctioned read-only/network-open boundary
and must pass the matching host transport to the normal freshness entrypoint.
If that adapter is absent, unavailable, or mismatched, the CLI returns the
data-minimized action and exits non-successfully; it must not retry in the
workspace sandbox. A remote timeout without a restricted-boundary request
remains a typed offline observation, never proof of freshness.

The productive WSL adapter has no durable state, lockfile, repository mutation,
or fallback executor. It performs one public observation from the fixed host
directory and returns only a validated public object ID plus the privacy-safe
host-control identity digest. A platform, trust, or privacy regression therefore
rolls back the identity-digest pair together with the prior complete PHX-0B host
receipt package: `ruleset-freshness-host.mjs`, its binding in
`ruleset-freshness.mjs`, and its matching tests/spec inventory. A new local
compensating revert candidate must then carry fresh exact Verify, Security, and
independent Critic evidence; no reset, history rewrite, remote action, or stale
evidence can claim recovery.

## Acceptance mapping

| Acceptance criterion | Evidence in this model |
| --- | --- |
| AC13 — transport binding | Fixed public action, boundary ID, request hash, no direct restricted-sandbox fallback, and fail-closed recovery. |
| AC14 — privacy/output | Asset inventory and diagnostic allowlist prohibit HOME, cache, credential, private remote, and consumer-coordinate disclosure. |
