// Claude Code UserPromptSubmit hook: the `bare:` / `/bare` switch.
// A prompt starting with `bare:` (or `/bare`) runs WITHOUT token-thrift
// routing: this hook sets a session-scoped flag that the thrift hooks honor,
// and injects a one-line instruction telling the model to work directly.
// Any following prompt without the prefix clears the flag — bypass is
// per-prompt, so you can drop out and back in freely within one session.
// Safety hooks (secrets, destructive git) ignore the flag by design.
import { readStdinJson, BARE_RE, setThriftBypass, noteBarePrompt } from './hooklib.mjs';

const payload = await readStdinJson();
const prompt = String(payload.prompt || '');

if (BARE_RE.test(prompt)) {
  setThriftBypass(payload, true);
  noteBarePrompt(payload);
  process.stdout.write(
    'sprHarness BYPASS is active for this prompt: work on it directly in this context. ' +
    'Do not delegate to scout/bulk-reader/code-writer/reviewer subagents, and ignore the ' +
    'model-routing instructions; large-file read limits are lifted for this prompt only. ' +
    'Treat the text after the "bare:" / "/bare" prefix as the actual request.'
  );
} else {
  setThriftBypass(payload, false);
}
process.exit(0);
