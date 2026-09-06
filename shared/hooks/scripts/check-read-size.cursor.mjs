// Cursor beforeReadFile hook: token-thrift guard, Cursor protocol.
// Input JSON on stdin (file_path, conversation_id, ...); reply JSON on
// stdout with a permission decision. Honors `bare:` bypass. Fails open.
import { readStdinJson, thriftBypassed, threshold, lineCount, BINARY_EXT } from './hooklib.mjs';

const payload = await readStdinJson();
let reply = { permission: 'allow' };
try {
  const filePath = payload.file_path || payload.filePath || '';
  if (filePath && !BINARY_EXT.test(filePath) && !thriftBypassed(payload)) {
    const max = threshold();
    const lines = lineCount(filePath, max);
    if (lines > max) {
      reply = {
        permission: 'deny',
        agent_message:
          `sprHarness token-thrift: ${filePath} is ${lines} lines (>${max}). Delegate the question to the ` +
          `bulk-reader subagent or grep for the specific part. Prefix the prompt with "bare:" to bypass once.`,
      };
    }
  }
} catch { /* fail open */ }
process.stdout.write(JSON.stringify(reply));
