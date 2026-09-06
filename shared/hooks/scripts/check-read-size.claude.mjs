// Claude Code PreToolUse hook on Read (Spotify "shunt" layer 1).
// Blocks untargeted reads of large files and points the model at the
// bulk-reader worker instead. Targeted reads (offset/limit) always pass, and
// so does everything when `bare:` bypass is active for the session.
// Threshold: SPRHARNESS_MAX_READ_LINES (default 400). Fails open.
import { readStdinJson, thriftBypassed, threshold, lineCount, BINARY_EXT } from './hooklib.mjs';

const payload = await readStdinJson();
try {
  const ti = payload.tool_input || {};
  const filePath = ti.file_path || '';
  if (filePath && !ti.offset && !ti.limit && !BINARY_EXT.test(filePath) && !thriftBypassed(payload)) {
    const max = threshold();
    const lines = lineCount(filePath, max);
    if (lines > max) {
      process.stderr.write(
        `sprHarness token-thrift: ${filePath} is ${lines} lines (>${max}). ` +
        `Do not pull it into the main context. Either (a) delegate the question to the ` +
        `bulk-reader subagent, or (b) do a targeted Read with offset/limit, or Grep for the ` +
        `part you need. (Prefix the prompt with "bare:" to bypass for one prompt.) See the token-thrift skill.`
      );
      process.exit(2);
    }
  }
} catch { /* fail open */ }
process.exit(0);
