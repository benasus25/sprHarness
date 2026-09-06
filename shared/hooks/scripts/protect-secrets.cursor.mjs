// Cursor beforeReadFile hook: receives event JSON on stdin, replies with a
// permission decision on stdout. See https://cursor.com/docs/agent/hooks
const SECRET_PATTERNS = [/\.env(\.|$)/i, /(^|[\\/])secrets?(\.|[\\/]|$)/i, /\.pem$/i];

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let permission = 'allow';
  try {
    const payload = JSON.parse(input || '{}');
    const filePath = payload.file_path || payload.filePath || '';
    if (filePath && SECRET_PATTERNS.some((re) => re.test(filePath))) {
      permission = 'deny';
    }
  } catch {
    // Fail open on parse errors.
  }
  process.stdout.write(JSON.stringify({ permission }));
});
