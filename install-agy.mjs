#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// Keep the documented repository-root command while maintaining one installer.
const { runInteractiveInstaller } = await import("./plugins/pipeline-core/install-agy.mjs");
runInteractiveInstaller();
