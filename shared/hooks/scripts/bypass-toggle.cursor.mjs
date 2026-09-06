// Cursor beforeSubmitPrompt hook: `bare:` / `/bare` bypass switch, Cursor
// protocol. Sets/clears the session-scoped thrift-bypass flag that the
// Cursor read-size hook honors. Always lets the prompt continue.
import { readStdinJson, BARE_RE, setThriftBypass, noteBarePrompt } from './hooklib.mjs';

const payload = await readStdinJson();
const prompt = String(payload.prompt || payload.text || '');
if (BARE_RE.test(prompt)) {
  setThriftBypass(payload, true);
  noteBarePrompt(payload);
} else {
  setThriftBypass(payload, false);
}
process.stdout.write(JSON.stringify({ continue: true }));
