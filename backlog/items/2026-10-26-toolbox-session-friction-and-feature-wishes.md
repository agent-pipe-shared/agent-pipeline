---
schema: pipeline.backlog-item.v1
id: pipeline.toolbox-session-friction-and-feature-wishes
type: improvement
owner: pipeline
status: open
created: 2026-10-26
priority: P2
release: 0.7.1
sprint: none
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, findings D10-D13, D19, D20, D22, D23, D26 and two side findings), classified P2/P3 by the consumer"
done_when: manual
---

# Friction, misleading messages and feature wishes from the Toolbox session (P2/P3)

Not in the 0.7.0 matrix. The P0/P1 findings of the same handover have their own items (see
`pipeline.dispatch-authority-store-check-fails-on-windows`, `pipeline.design-course-and-registrar-disagree-on-the-feature-directory`,
`pipeline.windows-private-state-check-counts-acls-inherited-from-above-the-repository`,
`pipeline.brownfield-architecture-gate-never-passes`, `pipeline.missing-docs-adr-directory-blocks-implementation-entry`,
`pipeline.fitness-class-6-blocks-documentation-modules-without-a-verification-entry`,
`pipeline.half-moved-feature-directory-locks-every-shell-and-source-write`,
`pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers`).

## P2

- **D10** `architecture-adoption.mjs prepare` without `--decided-at` ends in a TypeError
  (`decidedAt must be canonical ISO-8601`, `architecture-adoption-authority.mjs:86`) instead of naming the flag; the
  value must be identical in `prepare` and `apply`.
- **D11** The briefing generator does not fit a Playwright consumer: `check` must be a `*.test.mjs|cjs|js`
  (`DBG-CHECK-NOT-TEST`); an item needs a criterion (`DBG-AC-ROW-MISSING`), its slug may not contain a dot
  (`DBG-ITEM-SLUG`); a delivery binds exactly one AC. An estimate above the implementor tool cap silently routes to
  `goldfish-deep` and reports only `DBG-EFFORT-ROUTE-CONTRADICTION`; the field `facts` may contradict the host commit
  rule without a warning.
- **D12** One error text for different causes: `CVCT-FILE`, `CAC-REGISTRATION-INVALID` and
  `AGY-AUTHORITY-PRIVATE-PATH` point to the same repair hints. A single dispatch-readiness preflight (all
  preconditions at once) would save repeated runs.
- **D13** Windows input and guards: `sign-intent` takes no Enter before the passphrase (only after readline prompts);
  `refresh-mandatory-hooks.mjs` is executable only in the PowerShell native form; Glob/Grep with `{a,b}` or a negated
  pattern is refused as `GUARD-READ-TARGET` although read-only.
- **D19** The Phoenix ceremony uses fixed file names in the key folder (`phoenix-authority-revision-{request,proof}.json`);
  `prepare` refuses to overwrite and the PO must rename by hand first. Other ceremonies use hash names.
- **D23** The finding-id format of design review receipts is undocumented: `F1` is refused with `DRR-FINDING-IDS`;
  allowed is `^[A-Z][A-Z0-9]*(-[A-Z0-9]+){1,7}$` (`lib/design-review-receipt.mjs:38`).
- **D26** Commit trailers: the Pipeline (GIT-03) allows only `Dispatch:` and `AI-Assisted: true`, the Claude Code
  harness additionally demands `Co-Authored-By` and `Claude-Session`. The Pipeline rule wins; the plugin should name the
  conflict. Recorded on the existing item `pipeline.git-03-forbids-provider-trailers-the-runner-environment-demands`.

## P3

- **D20** The key folder grows without retention (hundreds of `proof-*`, `signer-*`, `request-*` in a synced folder).
  Same topic as `pipeline.po-key-directory-fills-up-with-signing-artifacts` (0.7.1).
- **D22 (feature wish)** A `migrate`/`repair-feature` command that checks preconditions (D6-D9), shows a preview
  including what is voided (D17), plans path rebind, adoption, plan rebinding and a possible review order as ONE
  transaction, and demands one collective signature over the combined intent. On the consumer day: three adoption or
  revision signatures and two plan signatures. Consistent with the design-course line "one bundled design signature".
- Side finding: `session-authority-repair.mjs release-lock` reported `EPERM fsync` but set the lock aside (wrong error
  status). Addressed by `D165-S5` (exit 2 for `retained`); native Windows behaviour not measured.
- Side finding: Ctrl+C during `apply` leaves `.git/agent-pipeline/session-authority/registry.lock` (related to
  `pipeline.agent-dispatch-leaves-a-dead-registry-lock-that-blocks-the-next-dispatch`).
- Side finding: `bootstrap-trust-recovery.mjs apply` swallowed the next stdin line after the readline confirmation
  (passphrase prompt got an empty line, "bad decrypt"). Addressed by `D165-S5` (byte-wise line reader).
