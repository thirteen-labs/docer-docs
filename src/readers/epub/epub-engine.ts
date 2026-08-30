import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { File, Paths, Directory } from 'expo-file-system';
import { cacheFileName } from '@/services/uri-resolver';

export interface EpubChapter {
  index: number;
  title: string;
  content: string;
  href: string;
}

export interface EpubMetadata {
  title: string;
  creator: string | null;
  language: string | null;
}

export interface EpubData {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  coverPath: string | null;
}

async function resolveFileBuffer(path: string): Promise<ArrayBuffer> {
  let resolvedPath = path;
  if (path.startsWith('content://')) {
    try {
      const src = new File(path);
      const info = src.info();
      if (info.exists) {
        const cacheDir = new Directory(Paths.cache, 'epub-cache');
        try { await cacheDir.create({ intermediates: true }); } catch {}
        const tmp = new File(cacheDir, cacheFileName(path, 'book.epub'));
        if (tmp.exists) return await tmp.arrayBuffer();
        const { FileMode } = await import('expo-file-system');
        try {
          const handle = src.open(FileMode.ReadOnly);
          try {
            const bytes = handle.readBytes(info.size ?? 0);
            const data = bytes.length > 0 ? bytes : new Uint8Array(await src.arrayBuffer());
            tmp.write(data);
          } finally { handle.close(); }
        } catch {
          const buf = await src.arrayBuffer();
          tmp.write(new Uint8Array(buf));
        }
        resolvedPath = tmp.uri;
      }
    } catch {}
  }
  const file = new File(resolvedPath);
  return file.arrayBuffer();
}

export async function parseEpub(path: string): Promise<EpubData> {
  const buffer = await resolveFileBuffer(path);
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: missing META-INF/container.xml');

  const container = parseXml(containerXml);
  const rootfile = findChild(container.documentElement, 'rootfile');
  const opfPath = rootfile ? rootfile.getAttribute('full-path') : null;
  if (!opfPath) throw new Error('Invalid EPUB: missing rootfile in container.xml');

  const opfDir = opfPath.includes('/') ? opfPath.split('/').slice(0, -1).join('/') : '';
  const opfContent = await zip.file(opfPath)?.async('string');
  if (!opfContent) throw new Error('Invalid EPUB: missing OPF file');

  const opf = parseXml(opfContent);
  const metadata = findChild(opf.documentElement, 'metadata');
  const title = text(metadata ? findChild(metadata, 'title') : null) || 'Untitled';
  const creator = text(metadata ? findChild(metadata, 'creator') : null) || null;
  const language = text(metadata ? findChild(metadata, 'language') : null) || null;

  const manifestEl = findChild(opf.documentElement, 'manifest');
  const items = manifestEl ? getChildren(manifestEl, 'item') : [];
  const manifest: Record<string, any> = {};
  for (const item of items) {
    manifest[item.getAttribute('id') || ''] = {
      id: item.getAttribute('id') || '',
      href: item.getAttribute('href') || '',
      mediaType: item.getAttribute('media-type') || '',
    };
  }

  let coverPath: string | null = null;
  const metaEls = metadata ? getChildren(metadata, 'meta') : [];
  for (const meta of metaEls) {
    if (meta.getAttribute('name') === 'cover') {
      const coverId = meta.getAttribute('content');
      if (coverId && manifest[coverId]) {
        coverPath = opfDir ? `${opfDir}/${manifest[coverId].href}` : manifest[coverId].href;
      }
    }
  }
  if (!coverPath) {
    const coverItem = Object.values(manifest).find((i: any) =>
      i.href.toLowerCase().includes('cover') && i.mediaType.startsWith('image/')
    );
    if (coverItem) coverPath = opfDir ? `${opfDir}/${coverItem.href}` : coverItem.href;
  }

  const spineEl = findChild(opf.documentElement, 'spine');
  const spineItems = spineEl ? getChildren(spineEl, 'itemref') : [];

  const chapters: EpubChapter[] = [];
  let index = 0;

  for (const ref of spineItems) {
    const idref = ref.getAttribute('idref');
    if (!idref || !manifest[idref]) continue;

    const item = manifest[idref];
    const itemPath = opfDir ? `${opfDir}/${item.href}` : item.href;

    if (!item.mediaType.includes('html') && !item.mediaType.includes('xhtml')) continue;

    const content = await zip.file(itemPath)?.async('string');
    if (!content) continue;

    const contentDoc = parseXml(content);
    const titleEls = contentDoc.getElementsByTagName('title');
    const chapterTitle = titleEls.length > 0 ? text(titleEls[0]) : `Chapter ${index + 1}`;
    const bodies = contentDoc.getElementsByTagName('body');
    const bodyContent = bodies.length > 0 ? serializeBody(bodies[0]) : content;
    const inlined = await inlineResources(bodyContent, zip, opfDir);

    chapters.push({ index, title: chapterTitle, content: inlined, href: itemPath });
    index++;
  }

  if (chapters.length === 0) {
    throw new Error('No readable content found in EPUB');
  }

  return { metadata: { title, creator, language }, chapters, coverPath };
}

function parseXml(xml: string): any {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function findChild(parent: any, tag: string): any {
  // Prefer direct children first, fallback to descendant search for namespaced epubs
  if (parent?.childNodes) {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i];
      if (c.nodeType === 1) {
        const name = (c.localName || c.nodeName || '').toLowerCase();
        if (name === tag.toLowerCase() || c.nodeName === tag) return c;
      }
    }
  }
  const kids = parent.getElementsByTagName(tag);
  return kids.length > 0 ? kids[0] : null;
}

function getChildren(parent: any, tag: string): any[] {
  // Return only direct children with matching tag to avoid double-counting nested items
  const direct: any[] = [];
  if (parent?.childNodes) {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i];
      if (c.nodeType === 1) {
        const name = (c.localName || c.nodeName || '').toLowerCase();
        if (name === tag.toLowerCase() || c.nodeName === tag) direct.push(c);
      }
    }
  }
  if (direct.length > 0) return direct;
  return Array.from(parent.getElementsByTagName(tag));
}

function text(el: any): string {
  return el?.textContent?.trim() ?? '';
}

function serializeBody(body: any): string {
  let html = '';
  const serializer = new XMLSerializer();
  const nodes = body.childNodes as any[];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 1) {
      try {
        html += serializer.serializeToString(node);
      } catch {
        html += node.toString();
      }
    } else if (node.nodeType === 3) {
      const txt = node.textContent ?? '';
      if (txt.trim()) html += `<p>${txt.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`;
    }
  }
  return html || body.toString();
}

function resolveHref(href: string, baseDir: string): string {
  const frag = href.split('#')[0].split('?')[0];
  if (!frag) return '';
  if (frag.startsWith('/')) return frag.slice(1);
  const stack = baseDir ? baseDir.split('/').filter((p) => p && p !== '.') : [];
  for (const part of frag.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'css': return 'text/css';
    default: return 'application/octet-stream';
  }
}

// Inline relative image/CSS resources as data: URIs so chapters render correctly
// when loaded from an HTML string (the WebView has no baseUrl into the zip).
async function inlineResources(html: string, zip: JSZip, baseDir: string): Promise<string> {
  const imgRe = /src\s*=\s*("([^"]*)"|'([^']*)')/gi;
  const cssRe = /<link\b[^>]*\bhref\s*=\s*("([^"]*\.css)"|'([^']*\.css)')[^>]*>/gi;
  const toInline: Array<{ find: string; replace: string }> = [];

  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = imgRe.exec(html)) !== null) {
    const val = m[2] ?? m[3];
    if (!val || seen.has(val)) continue;
    if (/^(data:|https?:|mailto:|blob:|#)/i.test(val)) continue;
    seen.add(val);
    const resolved = resolveHref(val, baseDir);
    const entry = zip.file(resolved);
    if (!entry) continue;
    try {
      const data = await entry.async('base64');
      toInline.push({ find: m[0], replace: `src="data:${mimeFromName(resolved)};base64,${data}"` });
    } catch {}
  }

  while ((m = cssRe.exec(html)) !== null) {
    const val = m[2] ?? m[3];
    if (!val || seen.has(val)) continue;
    seen.add(val);
    const resolved = resolveHref(val, baseDir);
    const entry = zip.file(resolved);
    if (!entry) continue;
    try {
      const css = await entry.async('string');
      toInline.push({ find: m[0], replace: `<style>${css}</style>` });
    } catch {}
  }

  let out = html;
  for (const it of toInline) {
    out = out.split(it.find).join(it.replace);
  }
  return out;
}

export function getEpubHtml(content: string, theme: { bg: string; text: string }, fontSize: number, lineSpacing: number): string {
  return [
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">',
    `<style>*{margin:0;padding:0;box-sizing:border-box}`,
    `body{font-family:Georgia,serif;font-size:${fontSize}px;line-height:${lineSpacing};color:${theme.text};background:${theme.bg};padding:24px;max-width:700px;margin:0 auto}`,
    `h1{font-size:${fontSize*1.5}px;margin:24px 0 12px;font-weight:700}`,
    `h2{font-size:${fontSize*1.3}px;margin:20px 0 10px;font-weight:600}`,
    `h3{font-size:${fontSize*1.15}px;margin:16px 0 8px;font-weight:600}`,
    `p{margin:12px 0}img{max-width:100%;height:auto}a{color:${theme.text}}`,
    `</style></head><body>${content}</body></html>`,
  ].join('');
}
