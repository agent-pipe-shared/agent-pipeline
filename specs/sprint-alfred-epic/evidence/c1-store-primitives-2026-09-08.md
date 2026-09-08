# C1 local storage primitive observation — 2026-09-08

This records an actual disposable-fixture probe supporting the planned C1 local
store. It is not an implementation test, interruption observation, independent
review, deployment qualification or start of the interruption baseline.

Command executed by the coordinator:

```text
node scratch/alfred-c1-store-primitives-probe.mjs
```

The process exited 0. The probe's machine-written result is preserved verbatim
in the sibling `c1-store-primitives-2026-09-08.json` when this evidence is
integrated. Its observed Git binding was identical before and after the probe:

- Commit: `ecc15e54bf2b3bc0a7e156c922e6879cbca5b786`.
- Tree: `5d24f2632b3036bfde3977f744a195c7fe3524c6`.
- Runtime: Linux, Node `v24.15.0`.
- Observed filesystem type magic: `0xef53`. This value alone does not identify
  a specific ext-family filesystem version or certify mount properties.

The probe created a fresh unique fixture below repository `scratch/`, exercised
the actual filesystem operations and cleaned only that fixture in its owning
`finally` block. The actual checks passed:

1. Exclusive file creation, complete write, file synchronization and readback.
2. Directory synchronization before and after create-only hard-link publication.
3. No-follow opening refused a symbolic-link leaf.
4. A separate Node process could not acquire an already-held atomic mkdir lock.

The probe modified no live C1 store, installed plugin, source file or remote.
Its result supports these primitive choices on this local runtime/filesystem.
Production backend eligibility must still be defined and enforced by the store;
runtime platform name alone is insufficient.

No C1 store implementation was tested. Power-loss durability, crash recovery,
hostile concurrent ancestor replacement, distributed filesystems and Windows
remain outside this observation. Real store failure/concurrency tests, actual
controller integration, full verification and required independent review remain
separate work. The observation establishes no collection population or coverage.
