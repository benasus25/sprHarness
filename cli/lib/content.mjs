import path from 'node:path';
import { dirs, loadMachine } from './paths.mjs';
import { readText, readJson, listDirs, listFiles, isDir } from './fsutil.mjs';

// Resolves the *effective* portable content: the shared/ layer, overlaid by
// the active profile's layer (profiles/<name>/ mirrors shared/'s structure).
// Overlay wins by name: a profile skill/agent/prompt with the same name
// replaces the shared one; instructions are appended; MCP servers and hook
// definitions merge by id.

function layerRoots() {
  const roots = [dirs.shared];
  const machine = loadMachine();
  if (machine.profile) {
    const profileRoot = path.join(dirs.profiles, machine.profile);
    if (isDir(profileRoot)) roots.push(profileRoot);
  }
  return roots;
}

export function activeProfile() {
  return loadMachine().profile || null;
}

export function loadContent() {
  const roots = layerRoots();

  const skills = new Map();
  const agents = new Map();
  const prompts = new Map();
  const instructionParts = [];
  const hostInstructionParts = {}; // host id → [parts]
  const hooks = new Map();
  const mcpServers = {};

  for (const root of roots) {
    for (const name of listDirs(path.join(root, 'skills'))) {
      skills.set(name, { name, dir: path.join(root, 'skills', name) });
    }
    for (const file of listFiles(path.join(root, 'agents'), '.md')) {
      agents.set(file, { name: file.replace(/\.md$/, ''), file: path.join(root, 'agents', file) });
    }
    for (const file of listFiles(path.join(root, 'prompts'), '.md')) {
      prompts.set(file, { name: file.replace(/\.md$/, ''), file: path.join(root, 'prompts', file) });
    }
    for (const file of listFiles(path.join(root, 'instructions'), '.md')) {
      const text = readText(path.join(root, 'instructions', file), '').trim();
      if (text) instructionParts.push(text);
    }
    // instructions/<hostId>/*.md applies only to that host (e.g. Claude-only
    // routing rules that reference subagents Codex doesn't have).
    for (const sub of listDirs(path.join(root, 'instructions'))) {
      for (const file of listFiles(path.join(root, 'instructions', sub), '.md')) {
        const text = readText(path.join(root, 'instructions', sub, file), '').trim();
        if (text) (hostInstructionParts[sub] = hostInstructionParts[sub] || []).push(text);
      }
    }
    const hookConfig = readJson(path.join(root, 'hooks', 'hooks.json'), null);
    if (hookConfig && Array.isArray(hookConfig.hooks)) {
      for (const hook of hookConfig.hooks) {
        if (hook.id) hooks.set(hook.id, { ...hook, root: path.join(root, 'hooks') });
      }
    }
    const mcp = readJson(path.join(root, 'mcp', 'servers.json'), null);
    if (mcp && mcp.servers) {
      for (const [name, def] of Object.entries(mcp.servers)) {
        if (name.startsWith('$')) continue; // $comment keys
        mcpServers[name] = def;
      }
    }
  }

  return {
    skills: [...skills.values()],
    agents: [...agents.values()],
    prompts: [...prompts.values()],
    instructions: instructionParts.join('\n\n'),
    instructionsFor(hostId) {
      return [...instructionParts, ...(hostInstructionParts[hostId] || [])].join('\n\n');
    },
    hooks: [...hooks.values()].filter((h) => h.enabled !== false),
    hooksAll: [...hooks.values()],
    mcpServers,
  };
}

export function loadHostConfig(host) {
  return readJson(path.join(dirs.config, `${host}.json`), null);
}
