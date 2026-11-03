import type { Design, SourceLink } from './types.ts';
import type { ReviewBlock, ReviewModel } from './report.ts';
type EvidenceLink = (label: string | undefined, filename?: string, line?: number | null, thumbnail?: boolean) => string;
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, ROOT } from './config.ts';
import { findings } from './quality.ts';

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const e = escapeHtml;

function evidenceLinks(model: ReviewModel) {
  const files: Record<string, string> = {};
  const roots = [model.folder, model.source, ...model.blocks.map(b => b.repo), path.join(ROOT, 'skills')].filter(Boolean).filter(p => existsSync(p)).map(p => realpathSync(p));
  function link(label: string | undefined, filename?: string, line: number | null = null, thumbnail = false): string {
    if (!filename || !existsSync(filename)) return `<span class="muted">${e(label)} (not recorded)</span>`;
    const absolute = realpathSync(filename);
    if (!roots.some(root => absolute.startsWith(root + path.sep)) || /(^|\/)(\.git|\.env[^/]*|\.npmrc|id_rsa|id_ed25519)(\/|$)/.test(absolute)) return `<span class="muted">${e(label)}</span>`;
    const key = digest(absolute).slice(0, 24);
    files[key] = absolute;
    const anchor = typeof line === 'number' && Number.isInteger(line) && line > 0 ? `#L${line}` : '';
    return `<a href="${e(pathToFileURL(absolute).href + anchor)}" data-route="evidence/${key}${anchor}">${thumbnail && /\.(png|jpe?g|webp)$/i.test(absolute) ? `<img class="screenshot" src="${e(pathToFileURL(absolute).href)}" data-route="evidence/${key}" alt="${e(label)}" loading="lazy">` : e(label)}</a>`;
  }
  return { files, link };
}

function designView(design: Partial<Design>, link: EvidenceLink, repo: string) {
  if (!design?.summary) return '';
  const parts = Array.isArray(design.components) ? design.components.filter(p => p && typeof p === 'object').slice(0, 6) : [];
  return `<div class="design"><p>${e(design.summary)}</p>${parts.length ? `<div class="owners">${parts.map(part => `<div><strong>${e(part.label)}</strong><span>${e(part.owns)}</span></div>`).join('')}</div>` : ''}${Array.isArray(design.patterns) && design.patterns.length ? `<p class="links">Patterns: ${design.patterns.filter(p => p && typeof p.file === 'string').slice(0, 4).map(p => link(p.label, path.resolve(repo, p.file), p.line)).join(' · ')}</p>` : ''}</div>`;
}

function blockView(block: ReviewBlock, link: EvidenceLink) {
  const issues = findings(block.review);
  const required = findings(block.openReview).filter(f => f.blocking);
  const detail = block.detail;
  const readFirst: SourceLink[] = Array.isArray(detail.readFirst) ? detail.readFirst.filter(p => p && typeof p.file === 'string').slice(0, 5) : block.files.slice(0, 3).map(file => ({ file, label: file }));
  const evidence = block.evidenceCurrent ? 'Checks match current source' : block.checks ? 'Earlier source checked; use final evidence' : 'Checks not recorded';
  return `<section class="block" id="block-${e(block.id)}"><div class="block-head"><h2>${e(block.title)}</h2><span class="tag">${e(block.status.replaceAll('_', ' '))}</span></div>
    <p>${e(detail.outcome ?? block.review?.summary ?? 'The lead will record the outcome here.')}</p>
    ${block.reason ? `<p class="attention">${e(block.reason)}</p>` : ''}
    ${designView(block.design, link, block.repo ?? '')}
    <div class="block-grid"><div><h3>Read these first</h3><ul class="reading">${readFirst.map(item => `<li>${link(item.label ?? item.file, path.resolve(block.repo ?? '', item.file), item.line)}${item.why ? `<span>${e(item.why)}</span>` : ''}</li>`).join('') || '<li>No changed files recorded.</li>'}</ul></div>
    <div><h3>Review and repair</h3><p>${block.repairAttempts} repair ${block.repairAttempts === 1 ? 'pass' : 'passes'} · ${required.length} open required findings</p><p class="links">${link('Independent review', block.reviewPath)} · ${link('Check evidence', block.checksPath)}</p><p class="muted">${e(evidence)}</p></div></div>
    ${required.length ? `<ul class="findings">${required.map(f => `<li><strong>${e(f.category)}:</strong> ${e(f.message)} ${link(`${f.file}:${f.line}`, path.resolve(block.repo, f.file), f.line)}<p>${e(f.suggestion)}</p></li>`).join('')}</ul>` : ''}
    ${detail.demonstration ? `<div class="demo"><h3>Try it</h3><p>${e(detail.demonstration)}</p></div>` : ''}
    ${Array.isArray(detail.screenshots) ? detail.screenshots.filter(p => p && typeof p.file === 'string').slice(0, 3).map(item => `<p>${link(item.caption || 'Screenshot', path.resolve(block.repo, item.file), null, true)} <span class="muted">Screenshot evidence only unless an interaction result is linked.</span></p>`).join('') : ''}
    <details id="detail-${e(block.id)}"><summary>Advice, closures and all changed files</summary>
    ${issues.filter(f => !f.blocking).map(f => `<p><strong>Advice:</strong> ${e(f.message)}</p>`).join('')}
    ${(Array.isArray(block.review?.closed) ? block.review.closed.filter(c => c && typeof c === 'object') : []).map(c => `<p><strong>Closed ${e(c.id)}:</strong> ${e(c.reason)}</p>`).join('')}
    <ul>${block.files.map(file => `<li>${link(file, path.join(block.repo, file))} · ${link('Before review', path.join(block.firstSnapshot, file))}</li>`).join('')}</ul></details></section>`;
}

export function writeReviewPage(model: ReviewModel) {
  const { link, files } = evidenceLinks(model);
  const allFindings = model.blocks.flatMap(b => findings(b.openReview));
  const finalFindings = findings(model.final?.openReview ?? model.final?.review);
  const decisions = Array.isArray(model.presentation.decisions) ? model.presentation.decisions.slice(0, 5) : [];
  const ready = model.blocks.filter(b => ['accepted', 'review_ready'].includes(b.status)).length;
  const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(model.title)} | Review</title><style>
    :root{color-scheme:light dark;--bg:#f5f3ed;--paper:#fffef9;--ink:#202b2b;--muted:#566564;--line:#d5dcd5;--accent:#175d52;--soft:#e5efe7;--warn:#874321}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:44px 30px 100px}a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}h1{font-size:clamp(28px,4vw,44px);line-height:1.15;letter-spacing:-1px;margin:14px 0}h2{font-size:23px;line-height:1.3;margin:0}h3{font-size:14px;text-transform:uppercase;letter-spacing:.06em;margin:20px 0 8px}.eyebrow,.muted{color:var(--muted)}.eyebrow{font-size:12px;letter-spacing:.13em;text-transform:uppercase}p{margin:10px 0}.lede{font-size:19px;max-width:760px}.tag{font-size:12px;border:1px solid var(--line);border-radius:20px;padding:4px 10px;white-space:nowrap}.status{display:inline-block;background:var(--soft);color:var(--accent);padding:6px 12px;border-radius:7px;font-weight:650}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:26px 0}.stat{border-top:2px solid var(--accent);padding:10px 0}.stat strong{display:block;font-size:30px;font-weight:550}.stat span{color:var(--muted);font-size:14px}.flow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:20px 0 32px}.flow b{background:var(--paper);padding:7px 12px;border:1px solid var(--line);border-radius:5px}.flow span{color:var(--muted)}.block,.notes,.decisions{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:24px;margin:22px 0}.block-head{display:flex;align-items:center;justify-content:space-between;gap:20px}.block-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:35px}.reading{padding-left:18px}.reading li{margin:9px 0}.reading span{display:block;color:var(--muted);font-size:14px}.owners{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:16px 0}.owners>div{background:var(--soft);padding:12px;border-radius:6px}.owners strong,.owners span{display:block}.owners span{font-size:13px;color:var(--muted)}.attention{border-left:3px solid var(--warn);padding:8px 12px;color:var(--warn)}.links{font-size:14px}.findings{padding-left:20px}.demo{border-left:3px solid var(--accent);padding-left:14px}details{border-top:1px solid var(--line);padding-top:14px;margin-top:20px}summary{cursor:pointer;color:var(--accent);font-weight:600}textarea{width:100%;min-height:180px;padding:14px;font:15px/1.6 ui-monospace,monospace;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);resize:vertical}button{background:var(--accent);color:white;border:0;border-radius:6px;padding:9px 15px;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.notes footer{display:flex;align-items:center;gap:16px;margin-top:10px}.save-error{color:var(--warn)}.conflict{white-space:pre-wrap;max-height:300px;overflow:auto}.screenshot{display:block;max-width:100%;max-height:360px;object-fit:contain;border:1px solid var(--line);border-radius:8px;margin:12px 0}.footer{font-size:13px;color:var(--muted);margin-top:30px}@media(max-width:650px){main{padding:24px 16px 70px}.block,.notes,.decisions{padding:18px}.block-grid{grid-template-columns:1fr;gap:4px}.block-head{align-items:flex-start;flex-direction:column;gap:8px}}@media(prefers-color-scheme:dark){:root{--bg:#151c1c;--paper:#1c2525;--ink:#e8eee7;--muted:#acbbb5;--line:#35463f;--accent:#9bd3b9;--soft:#263e34;--warn:#efb28a}button{background:#205e49;color:#fff}}@media print{body{background:white;color:black}.notes,button{display:none}details{display:block}.block{break-inside:avoid}}
    </style></head><body data-run-id="${e(model.id)}"><main><div class="eyebrow">${e(model.mode)} · Review brief</div><h1>${e(model.title)}</h1><span class="status">${e(model.status)}</span><p class="lede">${e(model.presentation.summary ?? 'Review the outcome, the design and the few code locations that matter. Detailed evidence is linked below.')}</p>
    <p class="links">${link('Approved task', model.taskPath)} · ${link('Saved notes', model.notesPath)} · ${link('Markdown copy', path.join(model.folder, 'REVIEW.md'))}</p>
    <div class="stats"><div class="stat"><strong>${ready}/${model.blocks.length}</strong><span>blocks passed automated review</span></div><div class="stat"><strong>${allFindings.filter(f => f.blocking).length + finalFindings.filter(f => f.blocking).length}</strong><span>open required findings</span></div><div class="stat"><strong>${model.blocks.reduce((n,b) => n + b.repairAttempts, 0)}</strong><span>repair passes used</span></div></div>
    <div class="flow" aria-label="Build and review loop"><b>Design</b><span>→</span><b>Build</b><span>→</span><b>Check</b><span>→</span><b>Independent review</b><span>→</span><b>Your review</b><span>Required findings return to bounded repair.</span></div>
    ${decisions.length || model.stopReason || finalFindings.some(f => f.blocking) ? `<section class="decisions"><h2>Needs your attention</h2>${model.stopReason ? `<p>${e(model.stopReason)}</p>` : ''}<ul>${decisions.map(d => `<li>${e(d)}</li>`).join('')}${finalFindings.filter(f => f.blocking).map(f => `<li>${e(f.message)} ${link(`${f.file}:${f.line}`, path.resolve(model.source, f.file), f.line)}</li>`).join('')}</ul></section>` : ''}
    ${model.blocks.map(block => blockView(block, link)).join('')}
    ${model.final ? `<section class="block"><h2>Final integrated evidence</h2><p>${model.final.status === 'review_ready' && model.final.evidenceCurrent ? 'Checks and independent review match the current combined source.' : 'Final current-source verification and review are still required.'}</p><p class="links">${link('Final checks', model.final.checksPath)} · ${link('Final review', model.final.reviewPath)}</p></section>` : ''}
    <section class="notes" id="your-notes"><h2>Your notes</h2><p>Use this page or your normal conversation. Notes live separately from generated content.</p><textarea id="notes" aria-label="Your review notes" disabled></textarea><footer><button id="save" disabled>Save notes</button><span id="save-state" role="status">Open the served review to edit durable notes.</span></footer><div id="conflict" hidden><p class="attention">The saved notes changed in another tab or editor. Your draft is still above. Copy or merge it before reloading.</p><pre class="conflict" id="saved-copy"></pre><button id="use-latest">Load saved version</button> <button id="use-draft">Save my merged draft</button></div></section>
    <p class="footer">Automated acceptance is separate from your approval. Source evidence does not establish freshness of ignored build output. Screenshots alone do not establish interaction coverage.</p>
    </main><script>${pageScript}</script></body></html>`;
  writeFileSync(path.join(model.folder, 'REVIEW.html'), content);
  writeFileSync(path.join(model.folder, 'evidence-map.json'), JSON.stringify(files, null, 2) + '\n');
}

const pageScript = `
(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  for (const link of document.querySelectorAll('[data-route]')) { if (link.tagName === 'IMG') link.src = link.dataset.route; else link.href = link.dataset.route; }
  const notes = document.querySelector('#notes');
  const saveButton = document.querySelector('#save');
  const status = document.querySelector('#save-state');
  let revision = null, savedText = '', saving = false, ready = false, timer;
  let conflict = false;
  const draftKey = 'harness-notes-draft:' + document.body.dataset.runId;
  const rememberDraft = () => { try { localStorage.setItem(draftKey, JSON.stringify({ text: notes.value, revision })); } catch {} };
  const forgetDraft = text => { try { const held = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (held?.text === text) localStorage.removeItem(draftKey); } catch {} };
  const showStatus = (text, error = false) => { status.textContent = text; status.className = error ? 'save-error' : ''; };
  async function saveNotes() {
    if (!ready || saving || conflict || notes.value === savedText) return;
    saving = true;
    const draft = notes.value;
    let saved = false;
    showStatus('Saving…');
    try {
      const response = await fetch('notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, text: draft }), keepalive: true });
      const result = await response.json();
      if (response.status === 409) {
        conflict = true;
        document.querySelector('#conflict').hidden = false;
        document.querySelector('#saved-copy').textContent = result.text;
        showStatus('Conflict: your draft has not replaced the saved notes.', true);
        document.querySelector('#use-draft').onclick = () => { revision = result.revision; savedText = result.text; conflict = false; document.querySelector('#conflict').hidden = true; saveNotes(); };
        document.querySelector('#use-latest').onclick = () => {
          if (!confirm('Replace this visible draft with the saved version? Copy any unsaved text first.')) return;
          try { localStorage.removeItem(draftKey); } catch {}
          notes.value = savedText = result.text; revision = result.revision; conflict = false;
          document.querySelector('#conflict').hidden = true; showStatus('Loaded saved version.');
        };
      } else if (!response.ok) throw Error(result.error || 'Save failed');
      else { revision = result.revision; savedText = draft; saved = true; forgetDraft(draft); showStatus('Saved to NOTES.md'); }
    } catch (error) { showStatus('Not saved: ' + error.message + '. Your draft is still here.', true); }
    finally { saving = false; if (saved && !conflict && notes.value !== savedText) { clearTimeout(timer); timer = setTimeout(saveNotes, 1500); } }
  }
  saveButton.onclick = saveNotes;
  notes.addEventListener('input', () => { rememberDraft(); showStatus('Unsaved changes'); clearTimeout(timer); timer = setTimeout(saveNotes, 500); });
  const view = () => ({ scrollY, open: [...document.querySelectorAll('details[open]')].map(d => d.id) });
  let viewTimer;
  function saveView() { if (ready) fetch('view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(view()), keepalive: true }).catch(() => {}); }
  addEventListener('scroll', () => { clearTimeout(viewTimer); viewTimer = setTimeout(saveView, 200); });
  for (const detail of document.querySelectorAll('details')) detail.addEventListener('toggle', saveView);
  addEventListener('pagehide', () => { saveNotes(); saveView(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveNotes(); saveView(); } });
  addEventListener('beforeunload', event => { if (ready && notes.value !== savedText) { event.preventDefault(); event.returnValue = ''; } });
  fetch('owner').then(response => { if (!response.ok) throw Error('Saved notes unavailable'); return response.json(); }).then(result => {
    notes.value = savedText = result.text; revision = result.revision;
    let held = null; try { held = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch {}
    if (held && held.text !== result.text) {
      notes.value = held.text;
      if (held.revision !== result.revision) {
        conflict = true; document.querySelector('#conflict').hidden = false;
        document.querySelector('#saved-copy').textContent = result.text;
        document.querySelector('#use-draft').onclick = () => { conflict = false; document.querySelector('#conflict').hidden = true; saveNotes(); };
        document.querySelector('#use-latest').onclick = () => { if (confirm('Replace the recovered draft with saved notes? Copy unsaved text first.')) { try { localStorage.removeItem(draftKey); } catch {} location.reload(); } };
      }
    }
    for (const id of result.view?.open ?? []) { const item = document.getElementById(id); if (item?.tagName === 'DETAILS') item.open = true; }
    requestAnimationFrame(() => { scrollTo(0, result.view?.scrollY ?? 0); ready = true; if (!conflict && notes.value !== savedText) saveNotes(); });
    notes.disabled = saveButton.disabled = false; showStatus(conflict ? 'Recovered draft conflicts with saved notes. Both are preserved.' : 'Saved notes loaded.', conflict);
  }).catch(error => showStatus(error.message + '. Editing is disabled to protect existing notes.', true));
})();`;
