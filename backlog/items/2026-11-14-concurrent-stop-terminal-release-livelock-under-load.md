---
schema: pipeline.backlog-item.v1
id: pipeline.concurrent-stop-terminal-release-livelock-under-load
type: defect
owner: pipeline
status: open
created: 2026-11-14
source: "Candidate 29d clean-clone runs (stop-pair suite NGSP7, NGSP9D) and the NGSP7 red of an earlier Full Verify"
sprint: alfred
done_when: manual
---

# Two concurrent stops can invalidate each other's terminal release until the budget ends

## Description

Under load, two sibling stops that settle at the same time can keep invalidating each other's terminal-release preimage. Each round one of them sees `SDC-AUTHORITY-CAS` (reference preimage changed) or `SDC-AUTHORITY-UNAVAILABLE` (domain-membership race), retries, and changes the shared state the other one just read. Neither makes progress until the stop budget runs out (about 100 s), and the stop ends red.

Measured in candidate 29d: the stop-pair suite cases NGSP7 and NGSP9D are red in 1-worker and 2-worker clean-clone runs, both before and after the K-38 change (so K-38 does not cause it). NGSP9D is green when run alone. In an alternating A/B probe the terminal-release class was red in 5 of 24 runs with the K-34 library change and 0 of 17 without it; by code reading K-34 only adds a stop-outcome file read in the refuse branch of the concurrent plan, taken on every settle round, so the likely mechanism is a shifted timing window of a pre-existing livelock rather than a K-34 defect. A separate, rarer flake (attempt-terminal association, "original private pending invocation unavailable") was seen once without K-34.

Later 29d runs: NGSP1 red in a 2-worker run of 366 suites, NGSP7 + NGSP9E red in a 1-worker run of the suite alone, and the same suite green 21/21 in the checkout right after. The red cases rotate among the concurrent-stop cases; the failure reasons of these two runs were not captured, so their class is assumed, not measured. Capturing the stop failure detail of each red case is the first step.

## Done when

The terminal release makes progress against a sibling (an ordered retry, or one boundary for both writes), the K-34 outcome read is done once per plan instead of once per settle round, and NGSP7 and NGSP9D are green in repeated 2-worker clean-clone runs.
