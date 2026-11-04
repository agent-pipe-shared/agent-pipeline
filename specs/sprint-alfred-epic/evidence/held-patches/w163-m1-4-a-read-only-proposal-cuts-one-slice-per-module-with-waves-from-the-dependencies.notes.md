# w163 — a read-only proposal cuts one slice per module, with waves from the dependencies (candidate 19, M1.4)

Delta on w161. Elephant-built, in a clone that carries the whole chain. M1.4 ("slices follow modules") was only guidance (w150): the slice planner knew nothing about modules, and nothing helped cut the cut.

## What it changes

- `lib/module-slice-proposal.mjs` (new, pure): `proposeSlicesFromModules(modules)` takes the `id`, `ownedPaths` and `allowedDependencies` of the approved design and returns one slice per module, ordered in waves (a module that may depend on another follows it), with modules whose owned paths overlap serialized (the later id waits, unless the dependencies already order the pair), so no wave holds two slices writing the same path. A dependency cycle, an unknown or self dependency, a scope the queue cannot take (absolute, parent segments, a comma that `slice-queue add` would split) and more than 64 modules are typed refusals (`MSP-CYCLE`, `MSP-INPUT`); it never throws. It also warns (`MSP-SHARED-SURFACE`) when a module owns a file only the Elephant writes (`docs/state.md` and the other default shared surfaces), which the queue library would refuse.
- `scripts/module-slice-proposal.mjs` (new): `--prd <repository-relative path> [--root <dir>]` parses the `pipeline-architecture-design` block with the same parser the design approval uses and prints ONE JSON document: waves, slices, serialized pairs, warnings and the `slice-queue.mjs add` argument lists. Read-only; exit 0 proposal, 2 usage, 3 design or proposal refused. It refuses an absolute path, a path outside the root, a symlink and a file over 4 MiB.
- `skills/pipeline-start/references/happy-path.md`: names the command next to the existing "cut along the modules" guidance (the existing pin that the guide names only existing scripts passes).
- `harness/verify-suites.json`, `docs/product-capability-inventory.json`: registration of `module-slice-proposal-tests`.

## Checks

- Clone: `module-slice-proposal` 7/7 (MSP1 to MSP6 incl. MSP5b), among them: the printed add commands are run through the real `slice-queue` CLI and the queue validates (3 slices); the shared-surface warning names a scope the real queue library then refuses; a real PRD with a design block is parsed and proposed from. With `happy-path-guide-names-only-existing-scripts`, `runner-capabilities` and `check-consumer-safe-paths` 23/23. Registration checker: 1161 registered, 0 unregistered; case-completion checker valid (389); doc contracts valid; architecture-boundary findings equal to the base (78 over-line-bound, 54 unowned-path). `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- Nothing writes a queue or dispatches: the proposal is advice, and `slice-queue.mjs` stays the only judge of a queue. The briefings still have to be generated from the template per slice.
- `dispatch-briefing.mjs` does not derive scopes from modules, and nothing enforces the cut; a design with one module yields one slice (the readiness question about decomposition is the place to raise that).
- Ownership overlap is judged with the queue library's own scope overlap; a module that owns only a file the design lists elsewhere is not detected beyond that.
- No Full Verify; no independent Critic review (suspended by the PO).
