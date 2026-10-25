// SPDX-License-Identifier: SUL-1.0
// Test-only adapter: execute the exact production address-chain function with
// supplied filesystem ports. This module never creates an address root.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';

const noncePrefix = 'g17c-';
const nonceWidth = 6; // Node's mkdtemp suffix on this fixture's Linux route.
const socketSuffix = join('.apsp', '0'.repeat(16), '0'.repeat(24) + '.sock');

export function prospectiveSocketBytes(parent) {
  if (typeof parent !== 'string' || !isAbsolute(parent) || resolve(parent) !== parent || parent.includes('\0')) {
    throw new Error('G17-PRIVATE-PARENT: explicit normalized absolute parent required');
  }
  const home = join(parent, noncePrefix + '0'.repeat(nonceWidth));
  const socket = join(home, socketSuffix);
  const bytes = Buffer.byteLength(socket, 'utf8');
  if (bytes > 107) throw new Error(`G17-SOCKET-LENGTH: ${bytes} bytes exceeds 107`);
  return { home, socket, bytes };
}

function productionAddressChain(ports) {
  const source = readFileSync(new URL('../lib/session-power.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function addressStat(s){');
  const end = source.indexOf('function addressRootRecord(', start);
  if (start < 0 || end < 0 || source.indexOf('function strictAddressChain(', start) < 0) {
    throw new Error('G17-ADDRESS-SOURCE: production validator unavailable');
  }
  const body = source.slice(start, end);
  return runInNewContext(`${body}\nstrictAddressChain`, {
    isAbsolute, resolve, parse, relative, sep, join,
    lstatSync: ports.lstatSync, realpathSync: ports.realpathSync,
    process: { getuid: ports.getuid },
    fail: (code, message) => { throw new Error(`${code}: ${message}`); },
  });
}

export function validatePrivateParent(parent, ports = { lstatSync, realpathSync, getuid: () => process.getuid() }) {
  const length = prospectiveSocketBytes(parent); // no filesystem access
  productionAddressChain(ports)(parent, { privateLeaf: true });
  return length;
}

export function validateCreatedHome(home) {
  productionAddressChain({ lstatSync, realpathSync, getuid: () => process.getuid() })(home, { privateLeaf: true });
}
