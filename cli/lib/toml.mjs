// Minimal TOML *emitter* — enough to express the tables the Codex adapter
// writes ([profiles.x], [mcp_servers.x]). We never parse TOML: the harness
// only ever appends/replaces its own marker-delimited block, which by design
// contains tables only (a bare top-level key appended after an existing table
// would silently land inside that table — a classic TOML trap).

function tomlValue(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(tomlValue).join(', ') + ']';
  if (v !== null && typeof v === 'object') {
    // inline table (used for env maps)
    const parts = Object.entries(v).map(([k, val]) => `${bareKey(k)} = ${tomlValue(val)}`);
    return '{ ' + parts.join(', ') + ' }';
  }
  throw new Error(`Cannot serialize value to TOML: ${v}`);
}

function bareKey(k) {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
}

export function tomlTable(headerPath, entries) {
  const header = '[' + headerPath.map(bareKey).join('.') + ']';
  const lines = [header];
  for (const [k, v] of Object.entries(entries)) {
    if (v === null || v === undefined) continue;
    lines.push(`${bareKey(k)} = ${tomlValue(v)}`);
  }
  return lines.join('\n');
}
