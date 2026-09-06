// Minimal YAML-frontmatter reader — enough for SKILL.md / agent files:
// `key: value` lines between --- fences; quoted strings unwrapped; booleans
// and simple comma lists recognized. Not a YAML parser; nested structures
// are returned as raw strings and flagged by `harness check`.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^﻿/, ''));
  if (!m) return { data: null, body: text, raw: '' };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) { data.__malformed = (data.__malformed || []).concat(line); continue; }
    let value = kv[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    data[kv[1]] = value;
  }
  return { data, body: m[2], raw: m[1] };
}
