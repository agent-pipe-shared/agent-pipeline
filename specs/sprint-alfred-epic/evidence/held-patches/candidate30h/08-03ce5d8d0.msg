fix(critic): trustBoundaryChanged no longer steers a Critic diff round

A delta request no longer escalates to a full round on trustBoundaryChanged; the key stays accepted and ignored so no existing record or digest changes; impactAmbiguous and the first full round are unchanged.

AI-Assisted: true
Dispatch: C30G-E2 (goldfish)
