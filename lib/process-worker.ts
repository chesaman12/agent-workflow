import type { ProcessOptions } from './process.ts';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const spec = JSON.parse(readFileSync(0, 'utf8')) as Required<ProcessOptions> & { bin: string; args: string[] };
const child = spawn(spec.bin, spec.args, { cwd: spec.cwd, env: spec.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
let bytes = 0;
let error: { message: string } | null = null;
function kill(message: string) {
  error ??= { message };
  try {
    if (!child.pid) return;
    if (process.platform === 'win32') child.kill('SIGKILL');
    else {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Already gone. */ } }, 250);
    }
  } catch { /* The process group may already have exited. */ }
}
const timer = setTimeout(() => kill(`Command timed out after ${spec.timeoutMs} ms`), spec.timeoutMs);
process.on('SIGTERM', () => kill('Command supervisor stopped'));
process.on('SIGINT', () => kill('Command supervisor interrupted'));
function capture(kind: 'stdout' | 'stderr', data: string) {
  bytes += data.length;
  if (bytes > spec.maxBuffer) { kill('Command output exceeded its limit'); return; }
  if (kind === 'stdout') stdout += data;
  else stderr += data;
}
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (data) => capture('stdout', data));
child.stderr.on('data', (data) => capture('stderr', data));
child.on('error', (cause) => { error = { message: cause.message }; });
child.on('close', (status, signal) => {
  clearTimeout(timer);
  process.stdout.write(JSON.stringify({ status: error ? null : status, signal, stdout, stderr, error }));
});
