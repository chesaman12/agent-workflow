export interface ProcessOptions { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number }
export interface ProcessResult { status: number | null; stdout: string; stderr: string; error?: { message: string } | null }
// A synchronous caller with a separate supervisor that kills the whole command group on timeout.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const WORKER = fileURLToPath(new URL('./process-worker.ts', import.meta.url));
export function runBounded(bin: string, args: string[], { cwd, env = process.env, timeoutMs = 1200000, maxBuffer = 64 * 1024 * 1024 }: ProcessOptions = {}): ProcessResult {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Command timeout must be a positive integer');
  const run = spawnSync(process.execPath, [WORKER], {
    input: JSON.stringify({ bin, args, cwd, env, timeoutMs, maxBuffer }),
    encoding: 'utf8', maxBuffer: maxBuffer * 2 + 65536,
  });
  try { return JSON.parse(run.stdout) as ProcessResult; }
  catch { return { status: null, stdout: '', stderr: '', error: { message: run.error?.message ?? 'Command supervisor failed' } }; }
}
