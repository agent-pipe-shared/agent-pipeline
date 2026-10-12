# Attended signing and canonical custody

The installed signer requires `--request` inside the repository's own scratch
directory. The first invocation using the canonical implementation path was
refused before signing. A byte-identical request mirror was prepared at
`scratch/alfred-portable-checkpoint-20261012/quality-request.json`; both copies
had SHA256 `3566d90adcdc8ade2c99abec6d95f6c4df7cf79a2dbca0585ef56a5784e27b12`.
The human then signed intent
`ee0b27b272019a22e935c85ccc4efebb713f2577fe6245ead641d3e6f36d1aae`.

The signer's own scratch proof mirror was available. An unnecessary attempted
copy from the external public-proof directory was refused by the lifecycle
guard before execution; no external mutation or key-file read occurred.
The agent used the existing own-repository mirror instead. The installed
quality-package materializer returned `QUALITY-PACKAGE-COMMIT-AUTHORIZED`;
the native commit hooks accepted the exact 317-path integration commit
`d02409a8a7e63067f3cc2964b98e7d39e6ab57b6`.

Canonical public proof SHA256:
`9cf25e59b9005b73f09d02aeaa443331b9831ca44a63b72c6a2686bee97c31b4`.
Canonical signing review material SHA256:
`dc8264ae704306a8ac51eafe6883fa543789eee695b1160b374a4ded677c1c79`.
No private key, passphrase, private host authority or native session state is
part of this checkpoint. Scratch is a signing transport mirror only; the
request, public proof and review bytes are retained at canonical paths.
