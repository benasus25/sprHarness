export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function quartiles(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { q1: null, q3: null };
  const at = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return { q1: at(0.25), q3: at(0.75) };
}

export function mean(values) {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function fmtInt(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtPct(n, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const s = (n * 100).toFixed(digits);
  return (n > 0 ? '+' : '') + s + '%';
}

// Relative change of b vs a (negative = b is smaller/cheaper).
export function delta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return (b - a) / a;
}

export function fmtDuration(ms) {
  if (!Number.isFinite(ms)) return '–';
  const s = ms / 1000;
  return s < 90 ? `${s.toFixed(0)}s` : `${(s / 60).toFixed(1)}m`;
}
