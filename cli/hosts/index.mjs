import claude from './claude.mjs';
import cursor from './cursor.mjs';
import codex from './codex.mjs';

// Adding a future host = add an adapter module here plus a template in
// templates/hosts/. Nothing else in the CLI hard-codes host identities.
export const hosts = [claude, cursor, codex];

export function getHost(id) {
  return hosts.find((h) => h.id === id) || null;
}

export function hostIds() {
  return hosts.map((h) => h.id);
}
