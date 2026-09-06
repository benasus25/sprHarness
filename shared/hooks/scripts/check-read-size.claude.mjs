// Claude Code PreToolUse hook on Read (Spotify "shunt" layer 1).
// Blocks untargeted reads of large files and points the model at the
// bulk-reader worker instead. Targeted reads (offset/limit) always pass.
// Threshold configurable via SPRHARNESS_MAX_READ_LINES (default 400).
// Fails open on any error — never brick the agent over a hook bug.
import fs from 'node:fs';

const THRESHOLD = parseInt(process.env.SPRHARNESS_MAX_READ_LINES || '400', 10);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|exe|dll|woff2?|ttf|mp[34]|mov|bin)$/i;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    const ti = payload.tool_input || {};
    const filePath = ti.file_path || '';
    if (!filePath || ti.offset || ti.limit || BINARY_EXT.test(filePath)) process.exit(0);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) process.exit(0);
    // Cheap pre-check: small files can't exceed the line threshold.
    if (stat.size < THRESHOLD * 20) process.exit(0);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').length;
    if (lines > THRESHOLD) {
      process.stderr.write(
        `sprHarness token-thrift: ${filePath} is ${lines} lines (>${THRESHOLD}). ` +
        `Do not pull it into the main context. Either (a) delegate the question to the ` +
        `bulk-reader subagent, or (b) do a targeted Read with offset/limit, or Grep for ` +
        `the part you need. See the token-thrift skill.`
      );
      process.exit(2);
    }
  } catch {
    // fail open
  }
  process.exit(0);
});
