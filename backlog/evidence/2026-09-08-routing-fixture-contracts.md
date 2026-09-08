# Routing fixture contract classification — 2026-09-08

`NVA-B-GATE-ROUTE-FIXTURES-1` updated stale fixture expectations against the
approved routing sources. The V1 Codex implementation request is the observed
`gpt-5.6-luna` selector at `xhigh`; historical Fable/Sol and the dedicated
P3B Terra adapter cases remain explicit compatibility tests. The historical
Terra **alias** fixture is independent of the current Luna direct default: it
accepts a matching host-attested alternate concrete model and rejects the same
CLI-only evidence. `route-receipt-terra-alias-restored.txt` is its 119/119
terminal-green capture.

The V3 projection checker now derives the complete Codex advisor file from the
already validated advisory duty cell. Its test covers the configured selector
and effort, rejects selector/effort registry corruption before projection, and
detects bytes tampered on disk. The normal-Critic checker compares the
host-native requested route to the canonical host-duty projection; it does not
claim that route was effectively executed or that it is this project's V3
selected Critic.

Final terminal capture:
`scratch/NVA-B-GATE-ROUTE-FIXTURES-1/owned-five-final-fixture-classification.txt`.
`setup.test.mjs` is green (187 checks). The routing test is 55/56; its only
failure is RP14, the parent-owned committed projection drift.

After the sanctioned mirror migration, the parent captured all four routing,
setup, receipt and consumer suites in
`scratch/candidate-routing-final-20260908.txt`, terminal exit 0. The separate
language and authority-tier checks also pass in
`scratch/candidate-authority-agreement-20260908.txt`. These supersede the
remaining RP14 failure above; the historical red artifact remains intact.

RR96 is authorized behavior, not a defect: `runner-mappings.json` registers
direct Terra as an observed Deep selector, and `validateRouteReceipt` accepts
a concrete selector when the receipt and host evidence match it. The P3B
adapter remains a narrower compatibility check.

The historical Terra-alias and P3B direct-Terra CLI negatives now use evidence
that exactly matches their receipts. RR20, RR95, and RR98 assert the actual
`terra-requires-host-evidence` rejection rather than passing on an earlier
trusted-binding mismatch. Capture:
`scratch/NVA-B-GATE-ROUTE-FIXTURES-1/route-receipt-host-only-reasons.txt`
(119/119, exit 0).

The historical V2 Sol fixtures C02/U13/U27 remain separately red in the final
five-suite capture and need a receipt-binding investigation; they do not by
themselves prove anything about V3 support. A distinct source-level support
gap is concrete: `runner-usage-v1.mjs` overlays Antigravity cells from V3 but
its `requestedShapeValid` allowlist still admits only Gemini 3.7, and its
Codex branch only Sol/Terra, while the approved V3 matrix requests Gemini 3.8
and Astra/Luna. U31 independently demonstrates that admitted Antigravity
`cached_tokens` is not projected to a common cache metric. Those adapter
changes are outside this fixture package.
