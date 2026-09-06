// Claude Code PreToolUse hook on Bash (Spotify "shunt" layer 1).
// Catches full-file dumps of large files via cat/type/Get-Content. Piped
// commands, redirects, and head/tail pass — those are targeted reads.
// Honors `bare:` bypass. Threshold: SPRHARNESS_MAX_READ_LINES. Fails open.
import { readStdinJson, thriftBypassed, threshold, lineCount } from './hooklib.mjs';

const DUMP_RE = /(?:^|[;&(]\s*)(?:cat|type|gc|Get-Content)\s+(.+)$/im;

const payload = await readStdinJson();
try {
  const command = String((payload.tool_input && payload.tool_input.command) || '');
  if (command && !command.includes('|') && !command.includes('>') && !thriftBypassed(payload)) {
    const match = DUMP_RE.exec(command);
    if (match) {
      const max = threshold();
      const candidates = match[1].split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ''));
      for (const candidate of candidates) {
        if (candidate.startsWith('-')) continue;
        const lines = lineCount(candidate, max);
        if (lines === 0) continue;
        if (lines > max) {
          process.stderr.write(
            `sprHarness token-thrift: dumping ${candidate} (${lines} lines >${max}) into context is ` +
            `blocked. Delegate the question to the bulk-reader subagent, or use a targeted read ` +
            `(grep / head -n / Read with offset+limit). (Prefix the prompt with "bare:" to bypass.) See the token-thrift skill.`
          );
          process.exit(2);
        }
        break;
      }
    }
  }
} catch { /* fail open */ }
process.exit(0);
