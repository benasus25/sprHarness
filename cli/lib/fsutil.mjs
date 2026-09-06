import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function readText(file, fallback = null) {
  // Strip a UTF-8 BOM if present — Windows editors and PowerShell add them,
  // and JSON.parse rejects a BOM'd document.
  try { return fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { return fallback; }
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

export function readJson(file, fallback = null) {
  const text = readText(file);
  if (text === null) return fallback;
  try { return JSON.parse(text); } catch {
    throw new Error(`Could not parse JSON in ${file} — fix or remove the file and retry.`);
  }
}

export function writeJson(file, obj) {
  writeText(file, JSON.stringify(obj, null, 2) + '\n');
}

export function copyDir(src, dest) {
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true, force: true });
}

export function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

export function removePath(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function listDirs(root) {
  if (!isDir(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function listFiles(root, ext = null) {
  if (!isDir(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isFile() && (!ext || d.name.endsWith(ext)))
    .map((d) => d.name)
    .sort();
}

// Timestamped backup of a file we are about to merge into (not files we own
// outright). Returns the backup path, or null if the file does not exist yet.
export function backupFile(file, backupsDir) {
  if (!exists(file)) return null;
  ensureDir(backupsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir, `${path.basename(file)}.${stamp}.bak`);
  fs.copyFileSync(file, dest);
  return dest;
}
