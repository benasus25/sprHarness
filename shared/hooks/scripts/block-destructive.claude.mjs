// Claude Code PreToolUse hook on Bash: SAFETY guard (never bypassed by `bare:`).
// Blocks a narrow set of irreversible commands and asks the model to confirm
// with the user instead. Deliberately conservative to avoid false positives.
import { readStdinJson } from './hooklib.mjs';

const RULES = [
  { re: /\bgit\s+push\b[^|;&]*\s(--force|-f)\b[^|;&]*\b(main|master)\b/i, why: 'force-push to main/master' },
  { re: /\bgit\s+push\b[^|;&]*\b(main|master)\b[^|;&]*\s(--force|-f)\b/i, why: 'force-push to main/master' },
  { re: /\bgit\s+reset\s+--hard\b/i, why: 'git reset --hard discards uncommitted work' },
  { re: /\bgit\s+clean\s+-[a-z]*x/i, why: 'git clean -x deletes ignored files (env files, local state)' },
  { re: /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME|\.)(\s|$)/i, why: 'recursive delete of a root, home, or current directory' },
  { re: /\bRemove-Item\b[^|;&]*-Recurse[^|;&]*\s(\/|~|\$env:USERPROFILE|C:\\?)(\s|$)/i, why: 'recursive delete of a root or home directory' },
];

const payload = await readStdinJson();
const command = String((payload.tool_input && payload.tool_input.command) || '');
for (const rule of RULES) {
  if (rule.re.test(command)) {
    process.stderr.write(
      `sprHarness safety hook blocked this command (${rule.why}). ` +
      `If the user explicitly wants this, ask them to confirm in chat, then have them run it — ` +
      `or they can disable 'block-destructive' in shared/hooks/hooks.json.`
    );
    process.exit(2);
  }
}
process.exit(0);
