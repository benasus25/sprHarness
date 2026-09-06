import path from 'node:path';
import { dirs, harnessFile } from '../lib/paths.mjs';
import { readJson, readText, exists, listDirs, listFiles, isDir } from '../lib/fsutil.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { hostIds } from '../hosts/index.mjs';
import { c, sym, heading } from '../lib/ui.mjs';

// Validates the portable content before it is committed or installed. A
// typo in SKILL.md frontmatter silently makes a skill invisible to every
// host, so this is the pre-commit / CI gate. Errors fail (exit 1);
// warnings only fail with --strict.

const CLAUDE_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop',
  'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd']);
const CURSOR_EVENTS = new Set(['sessionStart', 'sessionEnd', 'preToolUse', 'postToolUse', 'postToolUseFailure',
  'subagentStart', 'subagentStop', 'beforeShellExecution', 'afterShellExecution', 'beforeMCPExecution',
  'afterMCPExecution', 'beforeReadFile', 'afterFileEdit', 'beforeSubmitPrompt', 'preCompact', 'stop',
  'afterAgentResponse', 'afterAgentThought', 'beforeTabFileRead', 'afterTabFileEdit', 'workspaceOpen']);
const MODEL_ALIASES = new Set(['haiku', 'sonnet', 'opus', 'inherit']);
const HOOK_CATEGORIES = new Set(['thrift', 'safety', 'telemetry', 'bypass', 'other']);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function check(args) {
  const strict = args.includes('--strict');
  const problems = [];
  const err = (where, msg) => problems.push({ level: 'error', where, msg });
  const warn = (where, msg) => problems.push({ level: 'warn', where, msg });
  const rel = (p) => path.relative(dirs.local + '/..', p).split(path.sep).join('/');

  heading('Harness check');

  // harness.json + host configs
  const state = readJson(harnessFile, null);
  if (!state) err('harness.json', 'missing — run `harness setup`');
  else {
    for (const id of Object.keys(state.hosts || {})) {
      if (!hostIds().includes(id)) err('harness.json', `unknown host '${id}'`);
      const cfgFile = path.join(dirs.config, `${id}.json`);
      const tpl = readJson(path.join(dirs.templates, 'hosts', `${id}.json`), {}) || {};
      const cfg = safeJson(cfgFile, err);
      if (cfg) {
        for (const key of Object.keys(cfg)) {
          if (!key.startsWith('$') && !(key in tpl)) warn(rel(cfgFile), `unknown key '${key}' (not in template — ignored by the adapter)`);
        }
      }
    }
  }

  // Content layers: shared + every profile
  const layers = [dirs.shared, ...listDirs(dirs.profiles).map((p) => path.join(dirs.profiles, p))];
  let counts = { skills: 0, agents: 0, prompts: 0, hooks: 0, mcp: 0 };
  for (const root of layers) {
    // skills
    for (const name of listDirs(path.join(root, 'skills'))) {
      const dir = path.join(root, 'skills', name);
      const file = path.join(dir, 'SKILL.md');
      if (!exists(file)) { err(rel(dir), 'missing SKILL.md'); continue; }
      counts.skills++;
      const { data } = parseFrontmatter(readText(file, ''));
      if (!data) { err(rel(file), 'no YAML frontmatter (--- block)'); continue; }
      if (data.__malformed) err(rel(file), `malformed frontmatter line(s): ${data.__malformed.join(' | ')}`);
      if (!data.name) err(rel(file), 'frontmatter missing `name`');
      else if (data.name !== name) err(rel(file), `name '${data.name}' must equal folder name '${name}'`);
      else if (!NAME_RE.test(data.name)) err(rel(file), `name '${data.name}' must be lowercase letters/digits/hyphens`);
      if (data.name && data.name.length > 64) err(rel(file), 'name longer than 64 chars');
      if (!data.description) err(rel(file), 'frontmatter missing `description` (hosts use it to decide when to load the skill)');
      else if (String(data.description).length > 1024) err(rel(file), 'description longer than 1024 chars');
      else if (String(data.description).length < 40) warn(rel(file), 'description is very short — say WHEN to use the skill, not just what it is');
    }
    // agents
    for (const fileName of listFiles(path.join(root, 'agents'), '.md')) {
      const file = path.join(root, 'agents', fileName);
      counts.agents++;
      const base = fileName.replace(/\.md$/, '');
      const { data, body } = parseFrontmatter(readText(file, ''));
      if (!data) { err(rel(file), 'no YAML frontmatter'); continue; }
      if (data.__malformed) err(rel(file), `malformed frontmatter line(s): ${data.__malformed.join(' | ')}`);
      if (!data.name) err(rel(file), 'missing `name`');
      else if (data.name !== base) err(rel(file), `name '${data.name}' must equal file name '${base}'`);
      if (!data.description) err(rel(file), 'missing `description` (drives automatic delegation)');
      else if (!/proactively|use when|use after|use for|use at|use before/i.test(String(data.description))) {
        warn(rel(file), 'description does not say when to use it (e.g. "Use PROACTIVELY when…") — automatic delegation will be weak');
      }
      if (data.model && !MODEL_ALIASES.has(String(data.model)) && !/^[a-z0-9.-]+$/i.test(String(data.model))) {
        warn(rel(file), `model '${data.model}' is neither an alias (${[...MODEL_ALIASES].join('/')}) nor a model id`);
      }
      if (!body.trim()) err(rel(file), 'empty agent body (system prompt)');
    }
    // prompts
    for (const fileName of listFiles(path.join(root, 'prompts'), '.md')) {
      counts.prompts++;
      const file = path.join(root, 'prompts', fileName);
      if (!readText(file, '').trim()) err(rel(file), 'empty prompt');
      if (!NAME_RE.test(fileName.replace(/\.md$/, ''))) warn(rel(file), 'command name should be lowercase-hyphenated');
    }
    // hooks
    const hooksFile = path.join(root, 'hooks', 'hooks.json');
    if (exists(hooksFile)) {
      const h = safeJson(hooksFile, err);
      if (h) {
        for (const shared of h.shared || []) {
          if (!exists(path.join(root, 'hooks', shared))) err(rel(hooksFile), `shared file not found: ${shared}`);
        }
        const ids = new Set();
        for (const hook of h.hooks || []) {
          const where = `${rel(hooksFile)}#${hook.id || '?'}`;
          if (!hook.id) { err(rel(hooksFile), 'hook without id'); continue; }
          if (ids.has(hook.id)) err(where, 'duplicate id');
          ids.add(hook.id);
          counts.hooks++;
          if (hook.category && !HOOK_CATEGORIES.has(hook.category)) warn(where, `unknown category '${hook.category}'`);
          if (!hook.claude && !hook.cursor) warn(where, 'maps to no host — it will never run');
          for (const [host, events] of [['claude', CLAUDE_EVENTS], ['cursor', CURSOR_EVENTS]]) {
            const spec = hook[host];
            if (!spec) continue;
            if (!spec.event) err(where, `${host}: missing event`);
            else if (!events.has(spec.event)) warn(where, `${host}: event '${spec.event}' not in the known list (hosts add events; verify)`);
            if (!spec.script) err(where, `${host}: missing script`);
            else if (!exists(path.join(root, 'hooks', spec.script))) err(where, `${host}: script not found: ${spec.script}`);
            else if (!/\.(mjs|cjs|js)$/.test(spec.script)) warn(where, `${host}: script is not Node — it will not be cross-platform`);
          }
        }
      }
    }
    // mcp
    const mcpFile = path.join(root, 'mcp', 'servers.json');
    if (exists(mcpFile)) {
      const m = safeJson(mcpFile, err);
      for (const [name, def] of Object.entries((m && m.servers) || {})) {
        if (name.startsWith('$')) continue;
        counts.mcp++;
        if (!def.command && !def.url) err(`${rel(mcpFile)}#${name}`, 'needs `command` (stdio) or `url` (http/sse)');
        for (const hid of def.hosts || []) if (!hostIds().includes(hid)) err(`${rel(mcpFile)}#${name}`, `unknown host '${hid}'`);
        for (const [k, v] of Object.entries(def.env || {})) {
          if (/(key|token|secret|password)/i.test(k) && typeof v === 'string' && !/^\$\{\w+\}$/.test(v)) {
            err(`${rel(mcpFile)}#${name}`, `env ${k} looks like an inline secret — use \${${k}} and \`harness env set ${k} …\``);
          }
        }
      }
    }
    // instructions size (every session pays for these)
    let instrChars = 0;
    for (const f of listFiles(path.join(root, 'instructions'), '.md')) instrChars += readText(path.join(root, 'instructions', f), '').length;
    for (const sub of listDirs(path.join(root, 'instructions'))) {
      if (!hostIds().includes(sub)) warn(rel(path.join(root, 'instructions', sub)), `instructions subfolder is not a host id (${hostIds().join('/')}) — it will be ignored`);
      for (const f of listFiles(path.join(root, 'instructions', sub), '.md')) instrChars += readText(path.join(root, 'instructions', sub, f), '').length;
    }
    if (instrChars > 4000) warn(rel(path.join(root, 'instructions')), `${instrChars} chars of always-on instructions (~${Math.round(instrChars / 4)} tokens per session) — consider moving detail into skills`);
  }

  // bench suite (optional)
  const suiteFile = path.join(dirs.bench, 'suite.json');
  if (exists(suiteFile)) {
    const s = safeJson(suiteFile, err);
    if (s) {
      if (!s.target || (!s.target.git && !s.target.path)) err(rel(suiteFile), 'target needs `git` or `path`');
      const ids = new Set();
      for (const t of s.tasks || []) {
        if (!t.id || !t.prompt) err(rel(suiteFile), `task missing id/prompt: ${JSON.stringify(t).slice(0, 60)}`);
        if (ids.has(t.id)) err(rel(suiteFile), `duplicate task id ${t.id}`);
        ids.add(t.id);
        if (!t.expect && !t.expectFiles && !t.verify) warn(`${rel(suiteFile)}#${t.id}`, 'no expect/expectFiles/verify — success will only mean "did not error"');
      }
    }
  }

  // Report
  const errors = problems.filter((p) => p.level === 'error');
  const warnings = problems.filter((p) => p.level === 'warn');
  for (const p of problems) {
    console.log(`  ${p.level === 'error' ? sym.err : sym.warn} ${c.dim(p.where)}  ${p.msg}`);
  }
  if (problems.length) console.log('');
  console.log(`  ${counts.skills} skills, ${counts.agents} agents, ${counts.prompts} prompts, ${counts.hooks} hooks, ${counts.mcp} MCP servers checked`);
  if (errors.length === 0 && (warnings.length === 0 || !strict)) {
    console.log(`\n${sym.ok} ${errors.length === 0 && warnings.length === 0 ? 'All checks passed' : `No errors (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`}`);
  } else {
    console.log(`\n${sym.err} ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}${strict ? ' (--strict)' : ''}`);
    process.exitCode = 1;
  }
}

function safeJson(file, err) {
  try { return readJson(file, null); } catch (e) { err(path.basename(file), e.message); return null; }
}
