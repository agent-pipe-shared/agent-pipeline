fix(windows): admit the owner-route and controller records and find a killed owner-route call

The bridge publishes invocations/owner-route-* and invocations/controller-*, but the Windows path check listed only child and current, so neither route could ever start on native Windows (WINDOWS-REQUESTER-REF-PATH). The inspection behind the heal used a POSIX owner check that throws on Windows, so a killed owner-route call read as no owner-route binding; it now reads the record through the native private-file reader.

AI-Assisted: true
Dispatch: stage-0 (elephant)
