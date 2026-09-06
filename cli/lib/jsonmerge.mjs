import { readJson, writeJson } from './fsutil.mjs';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge `patch` into `target`. Objects merge recursively; arrays and
// scalars replace; null values in the patch are skipped (meaning "leave the
// host's setting alone"). Records every leaf it changes with its previous
// value so the merge can be undone key-by-key on uninstall.
export function deepMergeTracked(target, patch, basePath = [], changes = []) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;
    const keyPath = [...basePath, key];
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMergeTracked(target[key], value, keyPath, changes);
    } else {
      const prev = target[key];
      const next = isPlainObject(value) ? JSON.parse(JSON.stringify(value)) : value;
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        changes.push({ path: keyPath, prev: prev === undefined ? undefined : prev });
        target[key] = next;
      }
    }
  }
  return changes;
}

export function mergeIntoJsonFile(file, patch) {
  const data = readJson(file, {}) || {};
  const changes = deepMergeTracked(data, patch);
  if (changes.length > 0) writeJson(file, data);
  return changes;
}

function getAt(obj, keyPath) {
  let cur = obj;
  for (const k of keyPath) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

// Undo a tracked merge: restore each changed key to its previous value, or
// delete it if it did not exist before. Prunes containers left empty.
export function revertJsonChanges(file, changes) {
  const data = readJson(file, null);
  if (data === null) return;
  for (const change of changes) {
    const parentPath = change.path.slice(0, -1);
    const key = change.path[change.path.length - 1];
    const parent = parentPath.length ? getAt(data, parentPath) : data;
    if (!isPlainObject(parent)) continue;
    if (change.prev === undefined) delete parent[key];
    else parent[key] = change.prev;
  }
  prune(data);
  writeJson(file, data);
}

function prune(obj) {
  if (!isPlainObject(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    if (isPlainObject(v)) {
      prune(v);
      if (Object.keys(v).length === 0) delete obj[k];
    }
  }
}
