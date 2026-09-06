// Claude Code SessionEnd hook: passive benchmark telemetry (local only).
// Parses the session transcript and appends one CSV row: tokens split into
// orchestrator vs worker (subagent) traffic, per-model totals, tool counts,
// and whether the session used `bare:` bypass — so real-world harness vs
// non-harness usage can be compared with `harness bench sessions`.
// Log path comes from --log (baked in at install: <repo>/local/bench/sessions.csv).
import path from 'node:path';
import {
  readStdinJson, analyzeTranscript, totalTokens, appendCsvRow, argValue,
  readBareCount, clearSessionState, stateDir,
} from './hooklib.mjs';

const payload = await readStdinJson();
const transcript = payload.transcript_path;
const logFile = argValue('--log', path.join(stateDir(), 'sessions.csv'));

if (transcript) {
  const a = analyzeTranscript(transcript);
  const bare = readBareCount(payload);
  const mode = bare === 0 ? 'harness' : bare >= a.userPrompts ? 'bare' : 'mixed';
  const models = Object.entries(a.byModel)
    .map(([m, t]) => `${m}=${totalTokens(t)}`)
    .join(';');
  appendCsvRow(
    logFile,
    ['ended_at', 'session_id', 'cwd', 'mode', 'bare_prompts', 'user_prompts', 'assistant_turns',
      'orch_input', 'orch_cache_create', 'orch_cache_read', 'orch_output', 'orch_total',
      'worker_input', 'worker_cache_create', 'worker_cache_read', 'worker_output', 'worker_total',
      'worker_invocations', 'compactions', 'models', 'reason'],
    [new Date().toISOString(), payload.session_id || '', payload.cwd || '', mode, bare, a.userPrompts, a.turns,
      a.orchestrator.input, a.orchestrator.cacheCreate, a.orchestrator.cacheRead, a.orchestrator.output, totalTokens(a.orchestrator),
      a.workers.input, a.workers.cacheCreate, a.workers.cacheRead, a.workers.output, totalTokens(a.workers),
      a.workerInvocations, a.compactions, models, payload.reason || '']
  );
}
clearSessionState(payload);
process.exit(0);
