// A synchronous caller with a separate supervisor that kills the whole command group on timeout.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const WORKER = fileURLToPath(new URL('./process-worker.mjs', import.meta.url));
export function runBounded(bin, args, { cwd, env = process.env, timeoutMs = 1200000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Command timeout must be a positive integer');
  const run = spawnSync(process.execPath, [WORKER], {
    input: JSON.stringify({ bin, args, cwd, env, timeoutMs, maxBuffer }),
    encoding: 'utf8', maxBuffer: maxBuffer * 2 + 65536,
  });
  try { return JSON.parse(run.stdout); }
  catch { return { status: null, stdout: '', stderr: '', error: { message: run.error?.message ?? 'Command supervisor failed' } }; }
}
