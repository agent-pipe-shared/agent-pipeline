fix(native-host): give an unclassified CAS refusal the fixed rounds, and pin the slice id of a whole stop

The race list of the integration retry was picked by name; which
SDC-AUTHORITY-CAS reasons a sibling stop can cause on the integration
path is not measured, and the live K-38 refusal recorded no reason. A
CAS reason outside the named races is now repeated for the fixed eight
rounds (a few seconds) and then returned, never for the whole budget;
the named races keep the budget; every other code still returns at
once.

NGHS72 now asserts that both whole stops carry the briefed slice id in
their delivery result, which the hook writes into the stop outcome.

AI-Assisted: true
Dispatch: stage-0 (elephant)
