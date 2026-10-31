# w8-parallel-work-pin-uses-a-generated-briefing (held patch, not applied)

Cause of the red PARWORK pin (`parallel-work-in-one-checkout-is-unsafe`): since D185 a productive Goldfish dispatch needs a briefing built by the generator with an
item-delivery binding against an approved course. The pin still dispatched with hand-written briefing text, so the guard refused it before the case under test ran.

Change: a shared fixture library, `plugins/pipeline-core/lib/test-generated-goldfish-briefing-fixture.mjs`, with `prepareGeneratedDispatchRoot` (approved course,
recorded consent, scratch directory) and `buildGeneratedGoldfishBriefing` (writes the slice package, runs the dispatch-briefing `build` route, returns the generated
text). The pin builds both briefings before it opens the record and passes the real payload shape (session id, Agent tool name), so the overlap cases (M6, M6e)
exercise the debug-scope overlap and not the authority-unavailable refusal.

Evidence (clean clone): the pin suite 19/19 green. The fixture library is test-only and grants no authority. Applies to the repository HEAD.
