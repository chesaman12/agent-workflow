import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CLIInputs, NativeInputs } from './types.ts';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, realpathSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { digest, json, ROOT } from './config.ts';
import { escapeHtml } from './review-page.ts';
import { report } from './report.ts';

const readNotes = (folder: string) => {
  const text = readFileSync(path.join(folder, 'NOTES.md'), 'utf8');
  return { text, revision: digest(text) };
};
function atomic(file: string, value: string) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, value);
  renameSync(temp, file);
}
function ownerState(folder: string) {
  const view = path.join(folder, 'view.json');
  return { ...readNotes(folder), view: existsSync(view) ? json(view) : {} };
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type'] !== 'application/json') throw Error('Use application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw Error('Request is too large');
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Use a JSON object');
  return value as Record<string, unknown>;
}
function saveNotes(folder: string, value: Record<string, unknown>) {
  if (typeof value.text !== 'string' || typeof value.revision !== 'string') throw Error('Notes need text and revision');
  const lock = path.join(folder, 'notes.lock');
  let fd;
  if (existsSync(lock)) {
    try {
      const owner = json<{ pid: number }>(lock);
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') unlinkSync(lock); }
      }
    } catch {}
  }
  try { fd = openSync(lock, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid })); } catch { return { status: 409, value: { ...readNotes(folder), error: 'Another save is in progress' } }; }
  try {
    const current = readNotes(folder);
    if (value.revision !== current.revision) return { status: 409, value: current };
    const history = path.join(folder, 'notes-history');
    mkdirSync(history, { recursive: true });
    writeFileSync(path.join(history, `${Date.now()}-${current.revision.slice(0, 12)}.md`), current.text);
    atomic(path.join(folder, 'NOTES.md'), value.text);
    return { status: 200, value: readNotes(folder) };
  } finally { closeSync(fd); unlinkSync(lock); }
}

function sourceResponse(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const imageType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[ext];
  if (imageType) return { type: imageType, body: readFileSync(filename) };
  const content = readFileSync(filename, 'utf8');
  const lines = content.split('\n').map((line, index) => `<span class="line" id="L${index + 1}"><a href="#L${index + 1}">${index + 1}</a>${escapeHtml(line)}</span>`).join('\n');
  return { type: 'text/html; charset=utf-8', body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(path.basename(filename))}</title><style>body{margin:24px;font:14px system-ui;color:#23332e;background:#fbfaf6}header{position:sticky;top:0;background:#fbfaf6;padding:10px 0;border-bottom:1px solid #ccd5ce}pre{font:13px/1.65 ui-monospace,monospace;tab-size:2;white-space:pre;overflow:auto}.line{display:block;scroll-margin-top:90px}.line>a{display:inline-block;width:48px;color:#678071;text-decoration:none;user-select:none}.line:target{background:#f8e1a6}a{color:#175d52}</style><header><a href="../">Back to review</a><p>${escapeHtml(filename)}</p></header><pre>${lines}</pre></html>` };
}

export async function startReviewServer(folder: string, { port = 0 } = {}) {
  folder = path.resolve(folder);
  report(folder);
  const inputs = json<CLIInputs | NativeInputs>(path.join(folder, 'inputs.json'));
  const roots = [folder, inputs.project.repo, path.join(ROOT, 'skills')].map(p => realpathSync(p));
  const token = randomBytes(24).toString('hex');
  const prefix = `/${token}/`;
  let origin = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send = (status: number, value: unknown, type = 'application/json') => { response.writeHead(status, { 'Content-Type': type }); response.end(type === 'application/json' ? JSON.stringify(value) : value as string | Buffer); };
    try {
      if (request.headers.host !== new URL(origin).host || request.headers.origin && request.headers.origin !== origin) return send(403, { error: 'Local review origin required' });
      const route = new URL(request.url ?? '/', origin).pathname;
      if (!route.startsWith(prefix)) return send(404, { error: 'Unknown review' });
      const action = route.slice(prefix.length);
      if (request.method === 'GET' && !action) return send(200, readFileSync(path.join(folder, 'REVIEW.html')), 'text/html; charset=utf-8');
      if (request.method === 'GET' && action === 'owner') return send(200, ownerState(folder));
      if (request.method === 'POST' && action === 'notes') {
        const result = saveNotes(folder, await body(request));
        return send(result.status, result.value);
      }
      if (request.method === 'POST' && action === 'view') {
        const value = await body(request);
        if (typeof value.scrollY !== 'number' || !Number.isFinite(value.scrollY) || value.scrollY < 0 || !Array.isArray(value.open) || value.open.length > 100 || value.open.some(v => typeof v !== 'string' || v.length > 100)) throw Error('Invalid reading position');
        atomic(path.join(folder, 'view.json'), JSON.stringify(value));
        return send(200, { saved: true });
      }
      if (request.method === 'GET' && /^evidence\/[a-f0-9]{24}$/.test(action)) {
        const filename = json<Record<string, string>>(path.join(folder, 'evidence-map.json'))[action.split('/')[1]];
        if (!filename || !existsSync(filename)) return send(404, { error: 'Evidence is not available' });
        const canonical = realpathSync(filename);
        if (canonical !== filename || !roots.some(root => canonical.startsWith(root + path.sep)) || /(^|\/)(\.git|\.env[^/]*|\.npmrc|id_rsa|id_ed25519)(\/|$)/.test(canonical)) return send(403, { error: 'Evidence path is outside this review' });
        const result = sourceResponse(canonical);
        return send(200, result.body, result.type);
      }
      send(404, { error: 'Unknown review action' });
    } catch (error) { send(400, { error: error instanceof Error ? error.message : String(error) }); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const url = origin + prefix;
  writeFileSync(path.join(folder, 'REVIEW_URL.txt'), url + '\n');
  return { server, url };
}
