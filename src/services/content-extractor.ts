import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { DocumentType } from '@/types';

const TEXT_TYPES: Set<DocumentType> = new Set(['txt', 'md', 'csv', 'rtf']);

// Cap how much text we store in the search index / FTS to avoid DB bloat and OOM.
const MAX_INDEXED_CHARS = 100_000;
// Above this size, read only the head of plain-text/code files (full read can exhaust memory).
const MAX_FULL_TEXT_READ = 2 * 1024 * 1024;

export async function extractTextFromDocument(path: string, type: DocumentType): Promise<string> {
  let text = '';
  if (TEXT_TYPES.has(type) || type === 'code') {
    text = await extractFromTextFile(path);
  } else {
    switch (type) {
      case 'epub':
        text = await extractFromEpub(path);
        break;
      case 'doc':
      case 'docx':
        text = await extractFromDocx(path);
        break;
      case 'xls':
      case 'xlsx':
        text = await extractFromXlsx(path);
        break;
      case 'ppt':
      case 'pptx':
        text = await extractFromPptx(path);
        break;
      default:
        text = '';
    }
  }
  return text.length > MAX_INDEXED_CHARS ? text.slice(0, MAX_INDEXED_CHARS) : text;
}

async function extractFromTextFile(path: string): Promise<string> {
  try {
    const file = new File(path);
    const info = file.info();
    const size = info.size ?? 0;
    if (size > MAX_FULL_TEXT_READ) {
      const { FileMode } = await import('expo-file-system');
      const handle = file.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(MAX_FULL_TEXT_READ);
        return typeof TextDecoder !== 'undefined'
          ? new TextDecoder('utf-8').decode(bytes)
          : '';
      } finally {
        handle.close();
      }
    }
    return await file.text();
  } catch {
    return '';
  }
}

async function extractFromEpub(path: string): Promise<string> {
  try {
    const file = new File(path);
    const base64 = await file.base64();
    const zip = await JSZip.loadAsync(base64, { base64: true });

    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) return '';

    const container = new DOMParser().parseFromString(containerXml, 'text/xml');
    if (!container.documentElement) return '';
    const rootfile = container.documentElement.getElementsByTagName('rootfile')[0];
    const opfPath = rootfile?.getAttribute('full-path');
    if (!opfPath) return '';

    const opfDir = opfPath.includes('/') ? opfPath.split('/').slice(0, -1).join('/') : '';
    const opfContent = await zip.file(opfPath)?.async('string');
    if (!opfContent) return '';

    const opf = new DOMParser().parseFromString(opfContent, 'text/xml');

    if (!opf.documentElement) return '';
    const manifestEl = opf.documentElement.getElementsByTagName('manifest')[0];
    const items = manifestEl ? Array.from(manifestEl.getElementsByTagName('item')) : [];
    const manifest: Record<string, { href: string; mediaType: string }> = {};
    for (const item of items) {
      manifest[item.getAttribute('id') || ''] = {
        href: item.getAttribute('href') || '',
        mediaType: item.getAttribute('media-type') || '',
      };
    }

    if (!opf.documentElement) return '';
    const spineEl = opf.documentElement.getElementsByTagName('spine')[0];
    const spineItems = spineEl ? Array.from(spineEl.getElementsByTagName('itemref')) : [];

    const textParts: string[] = [];
    for (const ref of spineItems) {
      const idref = ref.getAttribute('idref');
      if (!idref || !manifest[idref]) continue;

      const item = manifest[idref];
      const itemPath = opfDir ? `${opfDir}/${item.href}` : item.href;
      if (!item.mediaType.includes('html') && !item.mediaType.includes('xhtml')) continue;

      const content = await zip.file(itemPath)?.async('string');
      if (!content) continue;

      const doc = new DOMParser().parseFromString(content, 'text/html');
      const body = doc.getElementsByTagName('body')[0];
      if (body) {
        textParts.push(stripHtml(body.textContent || ''));
      }
    }

    return textParts.join('\n\n').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function extractFromDocx(path: string): Promise<string> {
  try {
    const file = new File(path);
    const base64 = await file.base64();
    const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch {
    return '';
  }
}

async function extractFromXlsx(path: string): Promise<string> {
  try {
    const file = new File(path);
    const base64 = await file.base64();
    const workbook = XLSX.read(base64, { type: 'base64' });
    const textParts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        textParts.push(`Sheet: ${sheetName}\n${csv}`);
      }
    }
    return textParts.join('\n\n');
  } catch {
    return '';
  }
}

async function extractFromPptx(path: string): Promise<string> {
  try {
    const file = new File(path);
    const base64 = await file.base64();
    const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files).filter((f) => f.match(/ppt\/slides\/slide\d+\.xml$/)).sort();

    const textParts: string[] = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('string');
      const texts: string[] = [];
      const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      for (const m of textMatches) {
        const inner = m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, '');
        if (inner.trim()) texts.push(inner.trim());
      }
      if (texts.length > 0) {
        textParts.push(texts.join(' '));
      }
    }
    return textParts.join('\n\n');
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
