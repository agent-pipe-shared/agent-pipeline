# Adoption reference pages and Verify measurements — 2026-09-08

This tracked note preserves the source identities behind the adoption pages. It records evidence metadata, not a compliance or performance conclusion.

## Source inventory

- `docs/product-capability-inventory.json`, repository commit `b25c8696993e303ce7533512c5215aa21eb1348a`, SHA-256 `4983f83814a6bfcd647e05be887aa8d5fc5a665491e49f4633db6ec94e826d8b`, identifies audit/evidence tools and the security control catalog as optional, explicit caller surfaces.
- `backlog/evidence/2026-09-06-lane-eviction-measured-result.md`, SHA-256 `2dd90f4418e3932770c8a12cc471f9ab211bfb04694e4c937aa78b5faabf9cff`, defines the historical suite-span comparisons and lane-eviction results.
- `scratch/verify-envelope-comparison-20260908.json`, read on 2026-09-08, SHA-256 `a488248ee3cb2c61ab4cd435c64f414db29503f5733a4d68278116b6639be927`, compared six historical receipts. Its source is temporary; this tracked record preserves those receipt identities and the stated comparison boundary. The latest receipt is a separately inspected additional input.

## Full-Verify receipt identities

Measurement type: whole-run envelope (`startedAt` to `finishedAt`). Receipt hashes are SHA-256 of the receipt files as read on 2026-09-08.

| Input set | Receipt | Candidate | Started (UTC) | Envelope | Passed / steps | SHA-256 |
| --- | --- | --- | --- | ---: | ---: | --- |
| Historical comparison | `verify-1788698714338-b1e8e78a01b92e8f.json` | `f16ab25436e5ddbe27eb19878965ff7cfa71b0b4` | 2026-09-06T12:45:14.338Z | 489.712s | 514/515 | `ee27655bc14f150833e4981cba75950a0db129b878426ab05722b5877455b5d7` |
| Historical comparison | `verify-1788706259955-4fefb56662cd3860.json` | `fcaf8d5e51d77319a1c08a6570cf8eb48c94ca03` | 2026-09-06T14:50:59.956Z | 462.285s | 514/515 | `b0377625cfdde2c054729ccb8e63250bf02b988440ba21696c6226c43ead1287` |
| Historical comparison | `verify-1788733763876-e7f59eb566619702.json` | `1c03ab9cf306a26b73d6c552e93be2074e203c0d` | 2026-09-06T22:29:23.877Z | 446.923s | 516/516 | `fa6c9da76a6a58d1eb0c4c6f432207d977d59bb208a977d85874c8bcaa265101` |
| Historical comparison | `verify-1788804570885-aba4a4f89112d7ae.json` | `f94882ba6e59cc093b4500af3ad50c3fb50f818c` | 2026-09-07T18:09:30.886Z | 469.781s | 517/517 | `9aefa7475ba8f1feeffe9cdae7a8face49aea0059da069a03344b1560702a76e` |
| Historical comparison | `verify-1788823644708-c3279dedde58cddd.json` | `94bbc6a6ac0e17c91af08e1370810d5b06e55af3` | 2026-09-07T23:27:24.708Z | 578.897s | 505/517 | `6b8737c1e9d419dffbcd2d8f86f673e0cd4f7b16f1c3dc65efca1a30f7d80321` |
| Historical comparison | `verify-1788844434239-28f4021290f9de3d.json` | `12556ed0ead9ab9ad12cf4892f7886c36b0bc73b` | 2026-09-08T05:13:54.240Z | 595.413s | 515/517 | `23edb72c5c42205292c4591e5cc8543bdd122924e6e31798904f1cd531d45452` |
| Additional latest | `verify-1788893559906-fd5c81249bddf0d9.json` | `37aa24fc327b910e6b74ba26bdcb8e1601605e7a` | 2026-09-08T18:52:39.906Z | 697.804s | 514/517 | `199e176769a1479e9e1a881b47ae054f53402d7f40f5737888c41f9e4df1867c` |

No 4.5-minute full-gate receipt appeared in the six historical inputs or the separately inspected latest receipt. Serial and pool durations are not summed as wall time, and the timings do not establish a cause for host or code variation.
