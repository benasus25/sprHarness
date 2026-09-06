import { spawnSync } from 'node:child_process';

// Shared binary probe. shell:true so Windows resolves .cmd/.exe shims the way
// the user's own terminal would.
export function runVersion(binaries) {
  for (const bin of binaries) {
    try {
      const res = spawnSync(`${bin} --version`, { shell: true, timeout: 15000, encoding: 'utf8' });
      if (res.status === 0 && res.stdout) {
        return { installed: true, binary: bin, version: res.stdout.trim().split('\n')[0] };
      }
    } catch {
      // fall through to the next candidate binary
    }
  }
  return { installed: false, binary: binaries[0], version: null };
}

export function runCommand(command, timeout = 10000) {
  try {
    const res = spawnSync(command, { shell: true, timeout, encoding: 'utf8' });
    return { status: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
  } catch {
    return { status: -1, stdout: '', stderr: '' };
  }
}
