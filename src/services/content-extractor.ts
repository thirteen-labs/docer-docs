import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { DocumentType } from '@/types';

const TEXT_TYPES: Set<DocumentType> = new Set(['txt', 'md', 'csv', 'rtf']);

export async function extractTextFromDocument(path: string, type: DocumentType): Promise<string> {
  if (TEXT_TYPES.has(type) || type === 'code') {
    return extractFromTextFile(path);
  }
  switch (type) {
    case 'epub':
      return extractFromEpub(path);
    case 'doc':
    case 'docx':
      return extractFromDocx(path);
    case 'xls':
    case 'xlsx':
      return extractFromXlsx(path);
    case 'ppt':
    case 'pptx':
      return extractFromPptx(path);
    default:
      return '';
  }
}

async function extractFromTextFile(path: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return '';
  }
}

async function extractFromEpub(path: string): Promise<string> {
  try {
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(b64, { base64: true });

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
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch {
    return '';
  }
}

async function extractFromXlsx(path: string): Promise<string> {
  try {
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
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
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
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
