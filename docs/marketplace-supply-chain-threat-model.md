# Marketplace supply-chain and trust-boundary threat model

## Scope and trust boundary

This document covers distribution of `pipeline-core` through the public
`agent-pipeline` marketplace. The committed project binding in
`.claude/settings.json` is part of that boundary: it declares
`extraKnownMarketplaces.agent-pipeline.source.repo` as
`agent-pipe-shared/agent-pipeline` and enables
`pipeline-core@agent-pipeline`. The change from the former
`agent-pipeline/agent-pipeline` coordinate is therefore a supply-chain change,
not a local preference or a self-authenticating proof of publisher identity.

The trusted path is: a reviewed repository commit supplies the marketplace
coordinate; the configured GitHub repository supplies marketplace metadata and
plugin bytes; the client stores and loads a local plugin cache; and the runtime
loads the enabled plugin's skills and hooks. A repository checkout, GitHub,
the client update mechanism, the local cache, and the runtime each form a
separate trust boundary. Trust in one does not automatically attest another.

## Threats, controls, and residual risk

| Threat | Controls | Residual risk |
| --- | --- | --- |
| A pull request silently changes the marketplace coordinate or enabled plugin. | Treat `.claude/settings.json` as reviewed, versioned source; inspect the exact `extraKnownMarketplaces` coordinate and `enabledPlugins` entry in normal diff, Verify, and review. | A reviewer can still approve a malicious or mistaken coordinate; the setting is declarative, not a publisher signature. |
| The configured public repository, its release metadata, or a maintainer account is compromised. | The project binding makes the intended repository visible; ordinary Git review, protected upstream governance, and the marketplace/plugin update flow provide the available control points. | This repository does not claim independent cryptographic provenance, reproducible builds, or protection from a compromised upstream maintainer. |
| Cached plugin bytes are stale or an update is applied from the wrong scope. | Bootstrap staleness detection derives the remote from the committed binding. Project scope is the only canonical update target. The supported sequence is `claude plugin marketplace update agent-pipeline`, `claude plugin update pipeline-core@agent-pipeline --scope project`, then `/reload-plugins`. | A cache can remain stale while offline or until the operator performs the sequence; reload does not retroactively change an already-running session. |
| A user-scope registration, local cache, or runtime selection shadows the project binding. | Do not create a second user-scope installation; inspect the selected plugin/cache state during bootstrap and treat a mismatched or unavailable state as non-current rather than as success. | Local client behavior and cache integrity are outside this repository's enforcement boundary. |
| Credentials or network traffic are exposed while fetching a private fork. | The public upstream needs no private-repository credential claim; private forks require operator-managed credentials and keep the documented detect-and-prompt update posture. | This document does not govern GitHub credential helpers, tokens, workstation compromise, or network transport beyond the client and provider controls. |

## Update boundary

The committed binding chooses a repository; it does not authorize unattended
replacement of loaded code. No committed `autoUpdate` setting is used. A
coordinate change, marketplace update, plugin update, and session reload are
separate events with separate review or operator decisions. The staleness check
can detect and prompt, but it cannot prove that an update is safe, force a
reload, or validate an untrusted coordinate. See
[ADR-0001](adr/0001-distribution-plugin-marketplace.md) for the distribution
decision and canonical project-scope update procedure.

## Residual-risk statement

This is a transparent trust boundary, not a supply-chain guarantee. The project
accepts dependency on the configured public marketplace, the client cache, and
operator update decisions in exchange for centrally versioned plugin and hook
distribution. A stronger claim would require independently specified provenance
verification and release-integrity controls that are not currently implemented.
