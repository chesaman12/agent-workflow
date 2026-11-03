type CommentStyle = 'c' | 'hash' | 'sql';
import path from 'node:path';

const QUOTES = new Set(["'", '"', '`']);
const LINE_MARK = { c: '//', hash: '#', sql: '--' };
const LEAD = /^[\s*/!#-]+/;
const TAIL = /[\s*/]+$/;
const STAR_LINE = /^\s*\*(?:\s|$)/;
const MAX_COMMENT = 2000;

const clean = (text: string) => text.replace(LEAD, '').replace(TAIL, '');

function isLineMark(text: string, i: number, style: CommentStyle) {
  if (!text.startsWith(LINE_MARK[style], i)) return false;
  if (style === 'hash') return i === 0 || /\s/.test(text[i - 1]);
  return style !== 'c' || text[i - 1] !== ':';
}

// Walks one line. `state` carries an open block comment or template string over to the next added line.
function readLine(text: string, style: CommentStyle, state: { inBlock: boolean; inTemplate: boolean }) {
  const found = [];
  let i = 0;
  let quote = state.inTemplate ? '`' : null;
  if (state.inBlock) {
    const end = text.indexOf('*/');
    if (end < 0) return [text];
    found.push(text.slice(0, end));
    state.inBlock = false;
    i = end + 2;
  }
  while (i < text.length) {
    const char = text[i];
    if (char === '\\') {
      i += 2;
    } else if (quote) {
      if (char === quote) quote = null;
      i += 1;
    } else if (QUOTES.has(char)) {
      quote = char;
      i += 1;
    } else if (isLineMark(text, i, style)) {
      found.push(text.slice(i + LINE_MARK[style].length));
      break;
    } else if (style !== 'hash' && text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      found.push(text.slice(i + 2, end < 0 ? undefined : end));
      state.inBlock = end < 0;
      if (end < 0) break;
      i = end + 2;
    } else {
      i += 1;
    }
  }
  state.inTemplate = quote === '`';
  return found;
}

// Comment text on added lines. Lines that are not next to each other start fresh, because the lines between them are unseen.
export function addedComments(added: { text: string; line: number }[], style: CommentStyle) {
  const state = { inBlock: false, inTemplate: false };
  const comments = [];
  let last: number | null = null;
  for (const { line, text } of added) {
    if (last !== null && line !== last + 1) Object.assign(state, { inBlock: false, inTemplate: false });
    last = line;
    const isStar = style === 'c' && !state.inBlock && !state.inTemplate && STAR_LINE.test(text);
    const parts = isStar ? [text] : readLine(text, style, state);
    for (const part of parts) {
      const comment = clean(part.slice(0, MAX_COMMENT));
      if (comment !== '') comments.push({ line, text: comment });
    }
  }
  return comments;
}

export const commentStyleFor = (rel: string, styles: Record<string, CommentStyle>) => styles[path.extname(rel)] ?? null;
