# w8-discard-fixture-home-fits-a-socket-address (held patch, not applied)

Cause of the red `signing-help-delegation-qualification` cases SHDQ002 to SHDQ006 (`SP-ADDRESS: physical OS home cannot hold a Linux socket address`), also red in the main
checkout: `lib/po-discard-fixture-isolation.fixture.mjs` replaces `os.userInfo().homedir` with a synthetic home at `<checkout>/scratch/po-discard-isolation/owned-…/home`. The
session power address namespace lives under that home (`.apsp/<16>/<24>.sock`) and must fit 107 bytes with no group- or world-writable ancestor, so the synthetic home may be at
most 54 bytes. A path inside any realistic checkout is longer, and a directory under `/tmp` (mode 1777) fails the ancestry check. The fixture's only escape,
`PO_DISCARD_PRIVATE_PARENT`, is set by nothing in the repository.

Change (test fixture only, no product change): without an explicit private parent the home is `mkdtemp($HOME/p-…)` under the process's own `HOME` captured before replacement (the
Full Verify gives a short private `HOME`; a shell has its own), refused above 40 bytes, and removed at exit with the same identity check as the other owned paths. With no usable
`HOME` the previous in-checkout location is kept. `PO_DISCARD_PRIVATE_PARENT` still wins.

Evidence (clean clone): `signing-help-delegation-qualification` 7/7 (SHDQ002 to SHDQ006 red before), `po-only-discard-boundary` 8/8, the only other importer. Applies to the repository HEAD.
