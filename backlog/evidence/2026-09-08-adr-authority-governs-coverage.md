# Authority Governs coverage rationale

The four source ADR headers name current, tracked owners. They are declarations of
decision scope, not claims that a staged or successor implementation is complete.
The runnable, fixed-baseline proof is
`node scratch/NVA-B-ADR-GOVERNS-AUTHORITY-9/check.mjs`; its machine report and
terminal capture are retained under that task's scratch directory.

## ADR-0046 — project authority layering

The header names the portable source (`pipeline.user.yaml`), neutral templates,
the resolver and migration writer, bootstrap/onboarding, manifest and state writers,
and the runner-projection path with direct tests. `post-compact-reground`, the
development-plan guard, and the push guard are direct resolved-state consumers.
This records the layer decision's actual portable authority surface without treating
`.claude/**` projections as a second source of authority.

## ADR-0054 — three-tier resolution

The header follows the ADR's reader classification. It includes category-A direct
readers (checks, setup, session power, toolchain and artifact lifecycle), category-B
tier-union classifiers (runner adapters and guards), and category-C deliberate
projection writers. The resolver, migration and `pipeline.user.yaml` own top-tier
selection. `critic-dispatch-preflight` remains a candidate-tree reader, so it is
declared as a boundary-aware consumer rather than mislabelled as a live resolver
reader.

The ADR's original category-B table predates the current
`antigravity-pretool-guard.mjs` classifier. Its `lifecycleGoverned` marker array now
recognises both `project/` and `.claude/` manifest/calibration paths, so it is a
direct tier-union owner and is declared with its direct test. No
`antigravity-session-start-hint` path is declared because no such tracked consumer
exists.

The staged status is preserved. The declaration does not assert that the third tier,
configurable location, write migration, completeness check, or cleanup action has
landed universally; those remain the ordered implementation steps recorded by the
ADR.

## ADR-0055 — proof-policy waiver

The shared proof-policy reader, sanctioned state writer, push guard and push-prepare
path are listed with direct tests. The authorization, human preparation, publication
and release-preflight consumers are included because they apply the remaining
`deploy`/`publication`/`release-preflight` proof-policy kinds. Canonical operator
and security sources are root documents, so the generator can carry their citations
to consumer copies.

ADR-0056 refines `push`: `pipeline.user.yaml` supplies the push mode and the policy
waiver is no longer the push control. The header deliberately retains the proof-policy
reader and non-push consumers; it does not claim the later push mode is a waiver or
that every kind shares a `pipeline.user.yaml` key.

## ADR-0064 — release-preflight consent

The declaration follows the plan/proof/consume path: the critical-action request
builds and verifies the bound proof, `po-human-approval` prepares it, the CLI rebuilds
the observed subject and maps a verified result to the five consent fields, and
`release-preflight` consumes the result. Publication consumers are declared to make
the deliberately separate later publication authorization visible. The canonical
push-release guide and its contract test own the human-facing fourth-kind guidance.

ADR-0061 remains the wider uniform-ceremony authority. This header does not claim the
whole architecture is implemented, does not close matrix rows #56 or #98, and does
not make a preflight consent a final publication authorization.

## Deliberate omissions

Generated plugin ADR copies are not edited here; repository-root documents are the
canonical sources and parent integration owns the serial vendored-canon update.
No policy, waiver, signature, schema, authority, or ceremony bytes were changed.
