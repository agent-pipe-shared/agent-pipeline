fix(onboarding): the bootstrap-binding-required diagnostic names the draft markers that are still present

Claude and Codex greenfield runs searched the plugin source for the marker that keeps the bootstrap bind blocked (DRAFT TEMPLATE, AUTHORING REQUIRED, REPLACE) before removing it. The inspect result said only that the generated PRD and Spec still contain draft framing. The diagnostic message now lists, per document, which of the four markers the bytes still hold: the DRAFT TEMPLATE comment, a table row that still says REPLACE, an architecture block value that still starts with REPLACE, the generated placeholder criterion.

The labels come from the same function as the signal (stagingDesignNeedsAuthoring is exactly "some marker is left"), derived from the file bytes on every call, nothing stored; the next action, the status and every other field are unchanged. A case pins the labels, the empty list for an authored pair and the agreement of signal and labels; the registered assertion count of that suite is restated to the measured 51 (QG-04, extension only).

AI-Assisted: true
Dispatch: stage-0 (elephant)
