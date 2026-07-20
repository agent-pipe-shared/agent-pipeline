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

## Marketplace admission evidence

For the committed public coordinate `agent-pipe-shared/agent-pipeline`, a
review-time external observation on 2026-07-20 found the public canonical
repository URL `https://github.com/agent-pipe-shared/agent-pipeline`, with both
`HEAD` and `refs/heads/main` at
`9344a5a9b5f246584da1c9946d396f1bd88c1ce2`. This observation is not a
cryptographic pin, automatic-update authorization, or a substitute for future
source review.

## Threats, controls, and residual risk

| Threat | Controls | Residual risk |
| --- | --- | --- |
| A pull request silently changes the marketplace coordinate or enabled plugin. | Treat `.claude/settings.json` as reviewed, versioned source; inspect the exact `extraKnownMarketplaces` coordinate and `enabledPlugins` entry in normal diff, Verify, and review. | A reviewer can still approve a malicious or mistaken coordinate; the setting is declarative, not a publisher signature. |
| The configured public repository, its release metadata, or a maintainer account is compromised. | The project binding makes the intended repository visible; ordinary Git review, protected upstream governance, and the marketplace/plugin update flow provide the available control points. | This repository does not claim independent cryptographic provenance, reproducible builds, or protection from a compromised upstream maintainer. |
| Cached plugin bytes are stale or an update is applied from the wrong scope. | Bootstrap staleness detection derives the remote from the committed binding. Project scope is the only canonical update target. The supported sequence is `claude plugin marketplace update agent-pipeline`, `claude plugin update pipeline-core@agent-pipeline --scope project`, then `/reload-plugins`. | A cache can remain stale while offline or until the operator performs the sequence; reload does not retroactively change an already-running session. |
| A user-scope registration, local cache, or runtime selection shadows the project binding. | Do not create a second user-scope installation; inspect the selected plugin/cache state during bootstrap and treat a mismatched or unavailable state as non-current rather than as success. | Local client behavior and cache integrity are outside this repository's enforcement boundary. |
| Credentials or network traffic are exposed while fetching a private fork. | The public upstream needs no private-repository credential claim; private forks require operator-managed credentials and keep the documented detect-and-prompt update posture. | This document does not govern GitHub credential helpers, tokens, workstation compromise, or network transport beyond the client and provider controls. |
| A slim private overlay smuggles identity, credential, machine-local, receipt, cache, evidence, or runtime material into the Public-Core activation context. | Activation admits only Markdown below four closed namespaces, rejects unsafe topology, and checks every path segment after Unicode compatibility normalization, case folding, separator splitting, and CamelCase splitting. Password, API-key, and private-key labels are prohibited. File content also rejects assignment-shaped secret labels and PEM private-key blocks before an authenticated batch can be consumed. Evidence contains only digests and counts. | This deterministic filter is a fail-closed boundary, not a general DLP or secret scanner. Deliberately obfuscated or otherwise unrecognized material can evade lexical checks, while assignment-shaped examples can be false positives. Credentials and machine-local authority must remain outside the overlay and still require the repository security scan and human review. |

## Private-overlay activation boundary

The overlay is an untrusted input to the installed Public Core even when its
Git repository and `core.lock.json` are privately controlled. The lock binds a
reviewed Public source commit/tree and one installed plugin manifest, but it
does not attest the overlay content. Admission therefore validates the exact
filesystem snapshot independently, and the authenticated in-process result is
single-use. A copied evidence object, changed input, replay, or later readback
mismatch cannot authorize activation.

Secret-material rejection intentionally examines both names and content. Name
classification is invariant across ordinary case, `_`, `.`, hyphen-like
Unicode separators, and CamelCase spellings. Content classification is narrow
and deterministic: named secret assignments and PEM private-key blocks are
rejected, while ordinary prose about keeping credentials outside the overlay
is allowed. Operators must rewrite assignment-shaped examples as prose rather
than weaken this admission boundary.

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
