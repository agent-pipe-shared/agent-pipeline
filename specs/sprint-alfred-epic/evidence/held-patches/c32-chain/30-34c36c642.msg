feat(architecture): the boundary check reads the local script sources of an HTML file as dependency edges

The Codex greenfield report (candidate 31 run): the app was composed in the classic browser way, an HTML file loading its module scripts with <script src>, so the boundary check passed with no finding and no edge while it could not see a single dependency of the app. Its output says so honestly (Not seen: HTML and CSS references), but a project built this way had its module boundaries unchecked.

An HTML file (.html, .htm) that belongs to exactly one module is now read for its script sources: comments are skipped, and an absolute URL, a protocol-relative or site-root path, a data URI, a query string and a fragment are not part of a project path. Each local script that lies in another module is an edge, counted in the measurement like an import, and when the caller module does not list the target's module in its allowedDependencies it is a forbidden-dependency finding at the HTML file (target: the script), which an exception can accept like any other. A script that is generated output (a bundle, a minified file, dist/) and an HTML file of no module are not read, and HTML files are still no source files of the project, so they are neither measured for size nor an ownership finding. The coverage statement now says what is read (the local <script src> of HTML files of a module) and what is still not seen (runtime or browser globals, CSS references, scripts an inline script loads, bundler output, other languages, runtime-built paths); the one test that pinned the old text is restated (QG-04).

Cases: an allowed edge passes and is measured, a forbidden one names the HTML file and the script (a query string does not hide it), an exception covers it, and URLs, site-root paths, comments, inline scripts, generated bundles and an HTML file of no module make no edge; the extractor is pinned directly.

AI-Assisted: true
Dispatch: stage-0 (elephant)
