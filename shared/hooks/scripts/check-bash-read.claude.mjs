// Claude Code PreToolUse hook on Bash (Spotify "shunt" layer 1).
// Catches full-file dumps of large files via cat/type/Get-Content.
// Piped commands and pagers/head/tail pass — those are targeted reads.
// Threshold: SPRHARNESS_MAX_READ_LINES (default 400). Fails open.
import fs from 'node:fs';

const THRESHOLD = parseInt(process.env.SPRHARNESS_MAX_READ_LINES || '400', 10);
const DUMP_RE = /(?:^|[;&(]\s*)(?:cat|type|gc|Get-Content)\s+(.+)$/im;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    const command = (payload.tool_input && payload.tool_input.command) || '';
    if (!command || command.includes('|') || command.includes('>')) process.exit(0);
    const match = DUMP_RE.exec(command);
    if (!match) process.exit(0);
    // First token that exists on disk is the file being dumped.
    const candidates = match[1].split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ''));
    for (const candidate of candidates) {
      if (candidate.startsWith('-')) continue;
      let stat;
      try { stat = fs.statSync(candidate); } catch { continue; }
      if (!stat.isFile()) continue;
      if (stat.size < THRESHOLD * 20) break;
      const lines = fs.readFileSync(candidate, 'utf8').split('\n').length;
      if (lines > THRESHOLD) {
        process.stderr.write(
          `sprHarness token-thrift: dumping ${candidate} (${lines} lines >${THRESHOLD}) into ` +
          `context is blocked. Delegate the question to the bulk-reader subagent, or use a ` +
          `targeted read (grep/head -n/Read with offset+limit). See the token-thrift skill.`
        );
        process.exit(2);
      }
      break;
    }
  } catch {
    // fail open
  }
  process.exit(0);
});
