// Claude Code PreToolUse hook: receives tool-call JSON on stdin.
// Exit 0 = allow. Exit 2 = block (stderr is shown to the model as the reason).
const SECRET_PATTERNS = [/\.env(\.|$)/i, /(^|[\\/])secrets?(\.|[\\/]|$)/i, /\.pem$/i];

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    const filePath = (payload.tool_input && payload.tool_input.file_path) || '';
    if (filePath && SECRET_PATTERNS.some((re) => re.test(filePath))) {
      process.stderr.write(`Blocked by sprHarness protect-secrets hook: ${filePath} looks like a secrets file.`);
      process.exit(2);
    }
  } catch {
    // On parse errors, fail open — never brick the agent over a hook bug.
  }
  process.exit(0);
});
