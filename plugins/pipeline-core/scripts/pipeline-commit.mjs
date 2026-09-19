#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { commitPipeline } from "../lib/pipeline-commit.mjs";
function parse(argv) { const out = { root: process.cwd(), execute: false }; for (let i = 0; i < argv.length; i += 2) { const key = argv[i]; if (key === "--execute") { out.execute = true; i -= 1; continue; } const value = argv[i + 1]; if (!value || !["--root", "--type", "--scope", "--message", "--dispatch-record", "--timeout-ms"].includes(key)) throw new Error("usage"); out[key.slice(2).replace(/-([a-z])/gu, (_, c) => c.toUpperCase())] = key === "--timeout-ms" ? Number(value) : value; } if (!out.type || !out.scope || !out.message || !out.dispatchRecord) throw new Error("usage"); return out; }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(commitPipeline(parse(process.argv.slice(2))))}\n`); } catch (error) { process.stderr.write(`pipeline-commit: ${error.code ?? "PC-FAILED"}: ${error.message}\n`); process.exitCode = 2; } }
export { parse };
