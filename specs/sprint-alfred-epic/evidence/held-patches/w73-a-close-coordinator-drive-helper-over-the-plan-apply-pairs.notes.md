# w73 — the close coordinator gets a `drive` helper over its plan/apply pairs (candidate 17)

Applies after w72 and before the derived-files commit (it edits `harness/verify-suites.json` and `docs/product-capability-inventory.json`, which the derived refresh reads). PO decisions of 2026-11-02:
the close orchestration belongs in 17, and it is a helper or driver in the spirit of the onboarding driver, not a replacement for the running commands.

## What it adds

- `close-coordinator.mjs drive --root <root> --lifecycle <id> --actor <name> [--phase <phase>] [transition inputs] [--apply]`. Per call it:
  - reads the coordinator phase and prints the remaining chain with, per step, the needed inputs, the evidence schema and who produces it;
  - without `--apply`: names the missing input (`inputs-missing`), or plans the next step read-only (`planned`, with the plan digest and the existing apply action), and changes nothing;
  - with `--apply`: applies exactly that one planned step through the same `transitionPlan`/`applyTransition` the plan/apply verbs use, so every refusal passes through unchanged;
  - at `cleanup-complete` without `--evidence` it writes the cleanup receipt itself (the sanctioned producer) and uses it; a read-only call only says it would;
  - stops before every human-gate phase (`publication-authorized`, `release-eligible`, `promoted`) with status `human-gate` and applies none of them. The verb has no `--authorized` flag (a call with it is refused as `CLOSE-ARGS`);
  - where the chain forks it takes the first branch; `--phase` picks the other one (for example `cleanup-complete` straight after the green Verify). A phase that is not reachable is refused (`CLOSE-ORDER`).
- `lib/close-chain-guide.mjs`: the pure requirement table per phase (`describeCloseChain`, `missingCloseInputs`). `lib/close-chain-guide.test.mjs` pins it to the coordinator source: one entry per reachable phase, human gates
  equal the phases that need `--authorized`, and the evidence schema names appear in `transitionPlan`'s source or equal the executor-result constant.
- Docs: a row in the close-feature verb table, one sentence at the head of its Continuity close list, one sentence in the happy-path guide. Registration of the new suite in `verify-suites.json` and the capability inventory.

## Checks

- `close-coordinator.test.mjs`: 47 of 47 pass, including the new process case: missing evidence is named, a planned step changes nothing, one step is applied, the first branch after a green Verify is a human gate,
  `--authorized` is refused, a read-only call writes no receipt, `--apply` writes it and moves to `cleanup-complete`, then `closed-local`, then the next human gate.
- New guide suite 5 of 5. Registration, case-completion, touched close pins and `finish-feature` suites pass.
- Three PCI cases of `check-product-capability-inventory.test.mjs` are red in every slice clone, with or without this patch, because the committed inventory baseline predates the suite registrations; the derived-files commit of the chain refreshes it and the chain rehearsal shows them green.

## Not changed / not proven

- Not an automatic chain: one step per call, and every step needs the evidence the earlier tools or the human produced. The audit request and Critic/Verify lifecycle for rigor >= 1 are inputs, not something the driver derives.
- The human-gate phases and the push stay on the existing sanctioned verbs. Antigravity's single `finish-feature.mjs` entry is unchanged.
- The full Verify run was not made.
