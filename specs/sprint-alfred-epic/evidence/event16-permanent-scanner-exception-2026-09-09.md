# Event 16 permanent scanner exception — 2026-09-09

The PO explicitly approved this exact exception permanently on 2026-09-09:
`content-v1` bound to the deterministic public content fingerprint, immutable
event path `governance/events/human/16-evt-hgo-deny-cc612114562e4c5069cb6c66c06dda55-0.json`,
rule `generic-api-key`, line 1, column 987. There is no expiry or review-date
condition. The event bytes remain immutable.

The pre-edit `.gitleaksignore` SHA-256 was
`df51a473b4aa013e482f25b8f4bf4de60f08fafc3ea27004cd6056757281f02e`; after
the exact prepared addition, the file SHA-256 is
`1aa63cbd6da79e7d7db2d6f2baefb61008a191097cca78d0024ea23e5f365186`. The event
SHA-256 remains `388d642aded73d90a0789c70a036d527db692cf21bd7c35bd67b31508c6994e6`.

The sanctioned fixture probe recorded two findings before the exception and
one after it; the other control path remained reported. The live ignore
mutation and readback match the expected hash. Candidate Security and Full
Verify remain separate pending gates.
