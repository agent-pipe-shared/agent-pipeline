test(agy): give the installer fixtures the publication readback hook script

The shipped hooks manifest names the publication readback hook since candidate
27, but the two G6 fixtures only created the four older scripts, so the refresh
stopped on a missing file. Production code does not change.

AI-Assisted: true
Dispatch: stage-0 (elephant)
