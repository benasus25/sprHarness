import { readText, writeText } from './fsutil.mjs';

// Managed marker blocks let the harness own a region inside a file that also
// contains user content (CLAUDE.md, AGENTS.md, config.toml). Everything
// between the markers is replaced on install and removed on uninstall;
// everything outside is never touched.

function markers(style, id) {
  if (style === 'html') {
    return {
      start: `<!-- >>> sprharness:${id} — managed by sprHarness, do not edit between markers >>> -->`,
      end: `<!-- <<< sprharness:${id} <<< -->`,
    };
  }
  // '#' comment style (TOML, shell-like files)
  return {
    start: `# >>> sprharness:${id} >>> managed by sprHarness, do not edit between markers`,
    end: `# <<< sprharness:${id} <<<`,
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockRe(style, id) {
  const m = markers(style, id);
  return new RegExp(`${escapeRe(m.start)}[\\s\\S]*?${escapeRe(m.end)}`, 'g');
}

export function upsertBlock(file, id, body, style) {
  const m = markers(style, id);
  const block = `${m.start}\n${body.trimEnd()}\n${m.end}`;
  const existing = readText(file);
  if (existing === null) {
    writeText(file, block + '\n');
    return { created: true, changed: true };
  }
  const re = blockRe(style, id);
  if (re.test(existing)) {
    const next = existing.replace(blockRe(style, id), block);
    const changed = next !== existing;
    if (changed) writeText(file, next);
    return { created: false, changed };
  }
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  writeText(file, existing + sep + block + '\n');
  return { created: false, changed: true };
}

export function removeBlock(file, id, style) {
  const existing = readText(file);
  if (existing === null) return { changed: false };
  let next = existing
    .replace(blockRe(style, id), '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
  // The block was appended after a separator; drop it again so a file the
  // user owned before install comes back byte-for-byte on uninstall.
  next = next.replace(/\n+$/, '\n');
  if (next === existing) return { changed: false };
  writeText(file, next);
  return { changed: true };
}
