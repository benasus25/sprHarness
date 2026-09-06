import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cliRoot, repoRoot, dirs, homeDir } from '../lib/paths.mjs';
import { readJson, writeJson, readText, writeText, exists, isDir, ensureDir, copyFile, listDirs } from '../lib/fsutil.mjs';
import { runVersion } from '../hosts/detect.mjs';
import { median, quartiles, delta, fmtInt, fmtPct, fmtDuration } from '../lib/stats.mjs';
import { c, sym, heading, table } from '../lib/ui.mjs';

// ── harness bench ────────────────────────────────────────────────────────
// A/B measurement of the harness against a bare baseline on a fixed task
// suite, plus summaries of the passive per-session log. The primary metric
// is ORCHESTRATOR context tokens (input + cache-create + cache-read on
// non-sidechain messages): that is what the expensive model consumes and
// what subscription rate limits weigh most. Total tokens and success rate
// are reported alongside so a cheaper failure is never mistaken for a win.
//
// Conditions:
//   harness      normal install
//   bare         same install, SPRHARNESS_BYPASS=1 + "bare:" prefix
//   uninstalled  (--hard-baseline) harness removed for the run, reinstalled after
//   mock         (--runner mock)   synthetic numbers to exercise the pipeline

const runsDir = () => path.join(dirs.local, 'bench', 'runs');
const targetsDir = () => path.join(dirs.local, 'bench', 'targets');
const sessionsCsv = () => path.join(dirs.local, 'bench', 'sessions.csv');

export async function bench(args) {
  const sub = args[0] || 'help';
  const rest = args.slice(1);
  if (sub === 'init') return init(rest);
  if (sub === 'run') return run(rest);
  if (sub === 'report') return report(rest);
  if (sub === 'sessions') return sessions(rest);
  if (sub === 'list') return list();
  console.log(`
${c.bold('harness bench')} — measure harness vs. bare usage

  bench init                         create bench/suite.json from the default suite
  bench run [--n 3] [--conditions harness,bare] [--tasks id,id] [--category read-heavy]
            [--hard-baseline] [--runner claude|mock] [--suite path]
  bench report [runId|latest]        markdown report for a run (also written to the run dir)
  bench sessions                     summarize the passive per-session log (local/bench/sessions.csv)
  bench list                         list recorded runs
`);
}

function flag(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}

// ── init ─────────────────────────────────────────────────────────────────
async function init() {
  const dest = path.join(dirs.bench, 'suite.json');
  const src = path.join(cliRoot, 'bench', 'suite.json');
  if (exists(dest)) {
    console.log(`${sym.ok} bench/suite.json already exists — edit it, then \`harness bench run\``);
  } else {
    ensureDir(dirs.bench);
    copyFile(src, dest);
    console.log(`${sym.ok} created bench/suite.json from the default suite`);
  }
  const det = runVersion(['claude']);
  console.log(det.installed
    ? `${sym.ok} claude CLI found (${det.version})`
    : `${sym.warn} claude CLI not on PATH — real runs need it (see README "Benchmarking"); \`--runner mock\` works without it`);
}

// ── run ──────────────────────────────────────────────────────────────────
async function run(args) {
  const suiteFile = flag(args, '--suite', path.join(dirs.bench, 'suite.json'));
  const suite = readJson(suiteFile, null);
  if (!suite) { console.error(`${sym.err} no suite at ${suiteFile} — run \`harness bench init\``); process.exitCode = 1; return; }

  const n = parseInt(flag(args, '--n', '3'), 10) || 3;
  const runner = flag(args, '--runner', 'claude');
  let conditions = (flag(args, '--conditions', 'harness,bare')).split(',').map((s) => s.trim()).filter(Boolean);
  if (args.includes('--hard-baseline') && !conditions.includes('uninstalled')) conditions.push('uninstalled');
  const onlyTasks = flag(args, '--tasks');
  const onlyCategory = flag(args, '--category');
  let tasks = suite.tasks || [];
  if (onlyTasks) { const ids = new Set(onlyTasks.split(',')); tasks = tasks.filter((t) => ids.has(t.id)); }
  if (onlyCategory) tasks = tasks.filter((t) => t.category === onlyCategory);
  if (tasks.length === 0) { console.error(`${sym.err} no tasks selected`); process.exitCode = 1; return; }

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + (runner === 'mock' ? '-mock' : '');
  const outDir = path.join(runsDir(), runId);
  ensureDir(outDir);

  heading(`Benchmark run ${runId}`);
  console.log(`  suite ${c.cyan(suite.name || path.basename(suiteFile))} · ${tasks.length} task(s) × ${conditions.length} condition(s) × n=${n} = ${tasks.length * conditions.length * n} sessions · runner ${runner}`);

  let target = null;
  let claudeCmd = suite.claudeCommand || 'claude';
  if (runner !== 'mock') {
    const det = runVersion([claudeCmd]);
    if (!det.installed) {
      console.error(`\n${sym.err} '${claudeCmd}' is not on PATH. Install the Claude Code CLI (README → Benchmarking) or use --runner mock.`);
      process.exitCode = 1; return;
    }
    console.log(`  claude ${c.dim(det.version)}`);
    target = resolveTarget(suite.target);
    if (!target) { process.exitCode = 1; return; }
    console.log(`  target ${c.dim(target)}`);
  }
  console.log('');

  const analyze = await loadAnalyzer();
  const runsFile = path.join(outDir, 'runs.jsonl');
  const meta = { runId, suite: suite.name, suiteFile, conditions, n, runner, target, startedAt: new Date().toISOString(), tasks: tasks.map((t) => ({ id: t.id, category: t.category })) };
  writeJson(path.join(outDir, 'meta.json'), meta);

  let done = 0;
  const total = tasks.length * conditions.length * n;
  for (const condition of conditions) {
    if (condition === 'uninstalled' && runner !== 'mock') harnessCli(['uninstall', 'claude']);
    try {
      for (const task of tasks) {
        for (let i = 1; i <= n; i++) {
          done++;
          const tag = `[${String(done).padStart(String(total).length)}/${total}] ${condition.padEnd(11)} ${task.id.padEnd(22)} #${i}`;
          process.stdout.write(`  ${tag} … `);
          const rec = runner === 'mock'
            ? mockRun(condition, task, i)
            : realRun({ condition, task, iteration: i, suite, target, claudeCmd, analyze });
          Object.assign(rec, { runId, condition, taskId: task.id, category: task.category || 'uncategorized', iteration: i });
          fs.appendFileSync(runsFile, JSON.stringify(rec) + '\n');
          const orch = rec.analysis ? rec.analysis.orchContext : rec.usageContext;
          console.log(`${rec.success ? sym.ok : sym.err} orch ${fmtInt(orch)} tok · ${rec.analysis ? rec.analysis.workerInvocations : 0} workers · ${fmtDuration(rec.durationMs)}${rec.error ? c.red(' ' + rec.error.slice(0, 60)) : ''}`);
        }
      }
    } finally {
      if (condition === 'uninstalled' && runner !== 'mock') harnessCli(['install', 'claude']);
    }
  }
  meta.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, 'meta.json'), meta);
  console.log('');
  await report([runId]);
}

function harnessCli(cliArgs) {
  const r = spawnSync(process.execPath, [path.join(cliRoot, 'cli', 'harness.mjs'), ...cliArgs], { encoding: 'utf8', env: { ...process.env, SPRHARNESS_ROOT: repoRoot } });
  if (r.status !== 0) console.log(`  ${sym.warn} harness ${cliArgs.join(' ')} exited ${r.status}`);
}

function resolveTarget(t) {
  if (!t) { console.error(`${sym.err} suite has no target`); return null; }
  if (t.path) {
    const p = path.resolve(repoRoot, t.path);
    if (!isDir(p)) { console.error(`${sym.err} target path not found: ${p}`); return null; }
    return p;
  }
  const dir = path.join(targetsDir(), t.dir || path.basename(t.git, '.git'));
  if (!isDir(dir)) {
    ensureDir(targetsDir());
    console.log(`  cloning ${t.git} (${t.ref || 'default branch'}) …`);
    const cloneArgs = ['clone', '--depth', '1', ...(t.ref ? ['--branch', t.ref] : []), t.git, dir];
    const r = spawnSync('git', cloneArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) { console.error(`${sym.err} clone failed: ${(r.stderr || '').trim().slice(0, 300)}`); return null; }
  }
  return dir;
}

function resetTarget(target) {
  if (!isDir(path.join(target, '.git'))) return;
  spawnSync('git', ['checkout', '--', '.'], { cwd: target, stdio: 'ignore' });
  spawnSync('git', ['clean', '-fdq'], { cwd: target, stdio: 'ignore' });
}

async function loadAnalyzer() {
  const lib = path.join(cliRoot, 'shared', 'hooks', 'scripts', 'hooklib.mjs');
  const mod = await import(pathToFileURL(lib).href);
  return mod.analyzeTranscript;
}

// Claude Code stores transcripts under ~/.claude/projects/<cwd with every
// non-alphanumeric char replaced by '-'>/<session_id>.jsonl
function transcriptPath(cwd, sessionId) {
  const encoded = cwd.replace(/[^A-Za-z0-9]/g, '-');
  return path.join(homeDir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`);
}

function realRun({ condition, task, suite, target, claudeCmd, analyze }) {
  resetTarget(target);
  const prompt = condition === 'bare' ? `bare: ${task.prompt}` : task.prompt;
  const env = { ...process.env };
  if (condition === 'bare') env.SPRHARNESS_BYPASS = '1';
  const cliArgs = ['-p', '--output-format', 'json', '--max-turns', String(task.maxTurns || suite.maxTurns || 40)];
  if (suite.allowedTools && suite.allowedTools.length) cliArgs.push('--allowedTools', suite.allowedTools.join(','));
  const started = Date.now();
  // The prompt goes in on stdin so quoting is identical on every platform/shell.
  const r = spawnSync(claudeCmd, cliArgs, {
    cwd: target, env, input: prompt, encoding: 'utf8', shell: process.platform === 'win32',
    timeout: (task.timeoutSec || suite.timeoutSec || 900) * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const rec = { durationMs, exitCode: r.status, success: false, error: null, usage: null, usageContext: null, turns: null, costUsd: null, sessionId: null, analysis: null, resultExcerpt: '' };
  if (r.error) rec.error = r.error.code === 'ETIMEDOUT' ? 'timeout' : String(r.error.message);
  let out = null;
  try { out = JSON.parse((r.stdout || '').trim()); } catch {
    const idx = (r.stdout || '').lastIndexOf('{"type":"result"');
    if (idx !== -1) { try { out = JSON.parse(r.stdout.slice(idx)); } catch { /* unparseable */ } }
  }
  if (!out) {
    rec.error = rec.error || `no JSON result (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`;
    return rec;
  }
  rec.sessionId = out.session_id || null;
  rec.turns = out.num_turns ?? null;
  rec.costUsd = out.total_cost_usd ?? null;
  rec.usage = out.usage || null;
  if (rec.usage) rec.usageContext = (rec.usage.input_tokens || 0) + (rec.usage.cache_creation_input_tokens || 0) + (rec.usage.cache_read_input_tokens || 0);
  const text = typeof out.result === 'string' ? out.result : JSON.stringify(out.result || '');
  rec.resultExcerpt = text.slice(0, 400);
  if (out.is_error) rec.error = `is_error: ${text.slice(0, 120)}`;

  if (rec.sessionId) {
    const tp = transcriptPath(target, rec.sessionId);
    if (exists(tp)) {
      const a = analyze(tp);
      rec.analysis = {
        orchContext: a.orchestrator.input + a.orchestrator.cacheCreate + a.orchestrator.cacheRead,
        orchOutput: a.orchestrator.output,
        orchTotal: a.orchestrator.input + a.orchestrator.cacheCreate + a.orchestrator.cacheRead + a.orchestrator.output,
        workerTotal: a.workers.input + a.workers.cacheCreate + a.workers.cacheRead + a.workers.output,
        workerInvocations: a.workerInvocations,
        turns: a.turns,
        compactions: a.compactions,
        byModel: a.byModel,
        toolCalls: a.toolCalls,
      };
    }
  }
  rec.success = verify(task, text, target) && !out.is_error;
  return rec;
}

function verify(task, text, target) {
  const lower = text.toLowerCase();
  if (task.expect && !task.expect.every((s) => lower.includes(String(s).toLowerCase()))) return false;
  if (task.expectFiles && !task.expectFiles.every((f) => exists(path.join(target, f)))) return false;
  if (task.verify) {
    const r = spawnSync(task.verify, { cwd: target, shell: true, encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) return false;
  }
  return true;
}

// Deterministic synthetic results so the pipeline (run → jsonl → report) can
// be exercised in CI or before the CLI is installed. Clearly tagged mock.
function mockRun(condition, task, i) {
  const seed = hash32(`${condition}|${task.id}|${i}`);
  const jitter = (k) => 0.8 + ((seed >> (k * 5)) % 41) / 100; // 0.80–1.20
  const cat = task.category || 'tiny';
  const base = { 'read-heavy': [62000, 11000, 38000], generation: [36000, 19000, 24000], tiny: [6000, 8500, 2500] }[cat] || [20000, 12000, 10000];
  const isHarness = condition === 'harness';
  const orch = Math.round((isHarness ? base[1] : base[0]) * jitter(1));
  const workers = isHarness ? Math.round(base[2] * jitter(2)) : 0;
  const success = (seed % 10) !== 0; // ~90 %
  return {
    mock: true, durationMs: Math.round((isHarness ? 70000 : 55000) * jitter(3)), exitCode: 0, success, error: null,
    usage: null, usageContext: orch, turns: Math.round((isHarness ? 9 : 14) * jitter(4)), costUsd: null, sessionId: null,
    analysis: { orchContext: orch, orchOutput: Math.round(orch * 0.08), orchTotal: Math.round(orch * 1.08), workerTotal: workers,
      workerInvocations: isHarness ? 1 + (seed % 3) : 0, turns: null, compactions: 0, byModel: {}, toolCalls: {} },
    resultExcerpt: '(mock)',
  };
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// ── report ───────────────────────────────────────────────────────────────
function loadRun(idOrLatest) {
  const ids = listDirs(runsDir());
  if (ids.length === 0) return null;
  const id = !idOrLatest || idOrLatest === 'latest' ? ids[ids.length - 1] : idOrLatest;
  const dir = path.join(runsDir(), id);
  const lines = readText(path.join(dir, 'runs.jsonl'), '').split('\n').filter(Boolean);
  return { id, dir, meta: readJson(path.join(dir, 'meta.json'), {}), records: lines.map((l) => JSON.parse(l)) };
}

function orchOf(r) { return r.analysis ? r.analysis.orchContext : r.usageContext; }
function totalOf(r) { return r.analysis ? r.analysis.orchTotal + r.analysis.workerTotal : (r.usageContext || 0) + ((r.usage && r.usage.output_tokens) || 0); }
function workersOf(r) { return r.analysis ? r.analysis.workerTotal : 0; }
function invocationsOf(r) { return r.analysis ? r.analysis.workerInvocations : 0; }

function summarize(records) {
  const succ = records.filter((r) => r.success).length;
  return {
    runs: records.length,
    successRate: records.length ? succ / records.length : null,
    orch: median(records.map(orchOf)),
    orchIqr: quartiles(records.map(orchOf)),
    total: median(records.map(totalOf)),
    workers: median(records.map(workersOf)),
    invocations: median(records.map(invocationsOf)),
    turns: median(records.map((r) => (r.analysis && r.analysis.turns) || r.turns)),
    duration: median(records.map((r) => r.durationMs)),
    errors: records.filter((r) => r.error).length,
  };
}

async function report(args) {
  const run = loadRun(args[0]);
  if (!run) { console.error(`${sym.err} no benchmark runs yet — \`harness bench run\``); process.exitCode = 1; return; }
  const { records, meta } = run;
  const conditions = meta.conditions || [...new Set(records.map((r) => r.condition))];
  const baseline = conditions.includes('uninstalled') ? 'uninstalled' : conditions.includes('bare') ? 'bare' : conditions.find((x) => x !== 'harness') || conditions[0];
  const isMock = records.some((r) => r.mock);

  const md = [];
  md.push(`# Harness benchmark — ${run.id}${isMock ? '  ⚠️ MOCK DATA (pipeline test, not real measurements)' : ''}`);
  md.push('');
  md.push(`Suite **${meta.suite || '?'}** · runner ${meta.runner} · n=${meta.n} per task per condition · baseline = **${baseline}**${meta.target ? ` · target \`${meta.target}\`` : ''}`);
  md.push('');
  md.push('Primary metric: **orchestrator context tokens** (input + cache-create + cache-read on the main model). Guard metric: success rate. Medians; negative Δ = cheaper than baseline.');
  md.push('');

  // Per condition
  md.push('## By condition');
  md.push('');
  md.push('| condition | runs | success | orch ctx tokens (IQR) | worker tokens | total tokens | workers/run | turns | duration | errors |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  const byCond = {};
  for (const cnd of conditions) {
    const s = summarize(records.filter((r) => r.condition === cnd));
    byCond[cnd] = s;
    md.push(`| ${cnd} | ${s.runs} | ${fmtPct(s.successRate).replace('+', '')} | ${fmtInt(s.orch)} (${fmtInt(s.orchIqr.q1)}–${fmtInt(s.orchIqr.q3)}) | ${fmtInt(s.workers)} | ${fmtInt(s.total)} | ${s.invocations === null ? '–' : s.invocations} | ${fmtInt(s.turns)} | ${fmtDuration(s.duration)} | ${s.errors} |`);
  }
  md.push('');
  if (byCond.harness && byCond[baseline] && baseline !== 'harness') {
    const d = delta(byCond[baseline].orch, byCond.harness.orch);
    const dt = delta(byCond[baseline].total, byCond.harness.total);
    const ds = (byCond.harness.successRate ?? 0) - (byCond[baseline].successRate ?? 0);
    md.push(`**Overall:** harness vs ${baseline} — orchestrator context tokens ${fmtPct(d)}, total tokens ${fmtPct(dt)}, success rate ${ds >= 0 ? '+' : ''}${(ds * 100).toFixed(0)} pts.`);
    md.push('');
  }

  // Per category
  const categories = [...new Set(records.map((r) => r.category))];
  md.push('## By category');
  md.push('');
  md.push(`| category | ${conditions.map((cnd) => `${cnd} orch / success`).join(' | ')} | harness Δ vs ${baseline} |`);
  md.push(`|---|${conditions.map(() => '---').join('|')}|---|`);
  const verdicts = [];
  for (const cat of categories) {
    const cells = [];
    const sums = {};
    for (const cnd of conditions) {
      const s = summarize(records.filter((r) => r.category === cat && r.condition === cnd));
      sums[cnd] = s;
      cells.push(`${fmtInt(s.orch)} / ${fmtPct(s.successRate).replace('+', '')}`);
    }
    const d = sums.harness && sums[baseline] && baseline !== 'harness' ? delta(sums[baseline].orch, sums.harness.orch) : null;
    md.push(`| ${cat} | ${cells.join(' | ')} | ${fmtPct(d)} |`);
    if (d !== null) {
      const succDrop = (sums.harness.successRate ?? 0) < (sums[baseline].successRate ?? 0) - 0.15;
      if (d > 0.05 || succDrop) verdicts.push(`- **${cat}**: harness is ${d > 0 ? `${fmtPct(d)} more expensive` : 'not cheaper'}${succDrop ? ' and less successful' : ''} → use \`bare:\` for these tasks.`);
      else if (d < -0.25) verdicts.push(`- **${cat}**: harness saves ${(-d * 100).toFixed(0)}% orchestrator tokens${(sums.harness.successRate ?? 0) >= (sums[baseline].successRate ?? 0) ? ' with no success loss' : ' (watch success rate)'}.`);
      else verdicts.push(`- **${cat}**: roughly neutral (${fmtPct(d)}).`);
    }
  }
  md.push('');

  // Per task
  md.push('## By task');
  md.push('');
  md.push(`| task | category | ${conditions.map((cnd) => `${cnd} orch / success`).join(' | ')} | harness Δ |`);
  md.push(`|---|---|${conditions.map(() => '---').join('|')}|---|`);
  for (const t of meta.tasks || [...new Set(records.map((r) => r.taskId))].map((id) => ({ id, category: records.find((r) => r.taskId === id).category }))) {
    const cells = [];
    const sums = {};
    for (const cnd of conditions) {
      const s = summarize(records.filter((r) => r.taskId === t.id && r.condition === cnd));
      sums[cnd] = s;
      cells.push(`${fmtInt(s.orch)} / ${fmtPct(s.successRate).replace('+', '')}`);
    }
    const d = sums.harness && sums[baseline] && baseline !== 'harness' ? delta(sums[baseline].orch, sums.harness.orch) : null;
    md.push(`| ${t.id} | ${t.category} | ${cells.join(' | ')} | ${fmtPct(d)} |`);
  }
  md.push('');
  if (verdicts.length) { md.push('## Verdict'); md.push(''); md.push(...verdicts); md.push(''); }

  // Models seen (real runs only)
  const models = {};
  for (const r of records) for (const [m, t] of Object.entries((r.analysis && r.analysis.byModel) || {})) {
    models[m] = models[m] || { tokens: 0, sidechain: t.sidechain };
    models[m].tokens += t.input + t.cacheCreate + t.cacheRead + t.output;
  }
  if (Object.keys(models).length) {
    md.push('## Models observed');
    md.push('');
    for (const [m, v] of Object.entries(models).sort((a, b) => b[1].tokens - a[1].tokens)) md.push(`- \`${m}\` — ${fmtInt(v.tokens)} tokens${v.sidechain ? ' (worker traffic)' : ''}`);
    md.push('');
  }
  const errors = records.filter((r) => r.error);
  if (errors.length) {
    md.push('## Errors');
    md.push('');
    for (const r of errors.slice(0, 20)) md.push(`- ${r.condition}/${r.taskId}#${r.iteration}: ${r.error}`);
    md.push('');
  }

  const text = md.join('\n');
  writeText(path.join(run.dir, 'report.md'), text + '\n');
  console.log(text);
  console.log(c.dim(`\nreport written to ${path.join(run.dir, 'report.md')}`));
}

async function list() {
  const ids = listDirs(runsDir());
  if (ids.length === 0) { console.log(c.dim('no runs yet')); return; }
  const rows = ids.map((id) => {
    const meta = readJson(path.join(runsDir(), id, 'meta.json'), {});
    const n = readText(path.join(runsDir(), id, 'runs.jsonl'), '').split('\n').filter(Boolean).length;
    return [id, meta.runner || '?', (meta.conditions || []).join(','), `${n} runs`, meta.finishedAt ? '' : c.yellow('(incomplete)')];
  });
  table(rows);
}

// ── sessions (passive log) ───────────────────────────────────────────────
async function sessions() {
  const file = sessionsCsv();
  const text = readText(file, null);
  if (!text) { console.log(c.dim(`no passive log yet at ${file} — it fills in as Claude Code sessions end (session-log hook)`)); return; }
  const rows = parseCsv(text);
  if (rows.length === 0) { console.log(c.dim('log is empty')); return; }
  heading('Passive session log');
  console.log(c.dim(`  ${rows.length} session(s) in ${file}\n`));
  const modes = ['harness', 'bare', 'mixed'];
  const out = [['mode', 'sessions', 'prompts', 'orch ctx tok/prompt (median)', 'worker share', 'workers/session', 'compactions']];
  for (const mode of modes) {
    const rs = rows.filter((r) => r.mode === mode);
    if (rs.length === 0) continue;
    const perPrompt = rs.map((r) => { const p = num(r.user_prompts) || 1; return (num(r.orch_input) + num(r.orch_cache_create) + num(r.orch_cache_read)) / p; });
    const share = rs.map((r) => { const w = num(r.worker_total), o = num(r.orch_total); return o + w > 0 ? w / (o + w) : 0; });
    out.push([mode, String(rs.length), String(rs.reduce((a, r) => a + num(r.user_prompts), 0)), fmtInt(median(perPrompt)),
      fmtPct(median(share)).replace('+', ''), String(median(rs.map((r) => num(r.worker_invocations)))), String(rs.reduce((a, r) => a + num(r.compactions), 0))]);
  }
  table(out);
  const h = rows.filter((r) => r.mode === 'harness'), b = rows.filter((r) => r.mode === 'bare');
  if (h.length && b.length) {
    const pp = (rs) => median(rs.map((r) => (num(r.orch_input) + num(r.orch_cache_create) + num(r.orch_cache_read)) / (num(r.user_prompts) || 1)));
    console.log(`\n  harness vs bare, orchestrator context tokens per prompt: ${fmtPct(delta(pp(b), pp(h)))}`);
  }
  console.log(c.dim('\n  Real-work sessions differ in size; treat this as a trend, and use `harness bench run` for a controlled comparison.'));
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const cells = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).map((l) => { const cells = parseLine(l); const o = {}; header.forEach((h, i) => (o[h] = cells[i])); return o; });
}
