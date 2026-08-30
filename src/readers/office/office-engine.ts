import { File, Paths, Directory } from 'expo-file-system';
import { cacheFileName } from '@/services/uri-resolver';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

async function resolveToLocal(filePath: string): Promise<string> {
  if (!filePath.startsWith('content://')) return filePath;
  try {
    const src = new File(filePath);
    const info = src.info();
    if (!info.exists) return filePath;
    const cacheDir = new Directory(Paths.cache, 'office-cache');
    try { await cacheDir.create({ intermediates: true }); } catch {}
    const ext = filePath.split('.').pop()?.split('?')[0] || 'bin';
    const tmp = new File(cacheDir, cacheFileName(filePath, `office.${ext}`));
    if (tmp.exists) return tmp.uri;
    const { FileMode } = await import('expo-file-system');
    try {
      const handle = src.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(info.size ?? 0);
        if (bytes.length > 0) tmp.write(bytes);
        else {
          const buf = await src.arrayBuffer();
          tmp.write(new Uint8Array(buf));
        }
      } finally { handle.close(); }
    } catch {
      const buf = await src.arrayBuffer();
      tmp.write(new Uint8Array(buf));
    }
    return tmp.uri;
  } catch { return filePath; }
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function renderDocx(filePath: string): Promise<string> {
  const resolved = await resolveToLocal(filePath);
  const file = new File(resolved);
  const base64 = await file.base64();
  const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const body = result.value || '<p>No content</p>';
  if (result.messages?.length) console.log('mammoth messages', result.messages);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Georgia,serif;padding:24px;max-width:700px;margin:0 auto;line-height:1.6;color:#1c1c1e}h1,h2,h3{margin:20px 0 10px}h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}p{margin:10px 0}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f5f5f5}</style></head><body>${body}</body></html>`;
}

export async function renderXlsx(filePath: string): Promise<string> {
  const resolved = await resolveToLocal(filePath);
  const file = new File(resolved);
  const base64 = await file.base64();
  const workbook = XLSX.read(base64, { type: 'base64' });
  if (workbook.SheetNames.length === 0) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:monospace;padding:24px}</style></head><body><p>No sheets found.</p></body></html>`;
  }
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const safe = sanitizeId(name);
    const html = XLSX.utils.sheet_to_html(sheet, { id: `sheet-${safe}` });
    return { name, safe, html };
  });

  const tabs = sheets.map((s, i) => `
    <button class="tab ${i === 0 ? 'active' : ''}" data-sheet="sheet-${s.safe}" onclick="document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.sheet').forEach(s=>s.style.display='none');document.getElementById('sheet-${s.safe}').style.display='block'">${s.name}</button>
  `).join('');

  const bodies = sheets.map((s, i) => `
    <div id="sheet-${s.safe}" class="sheet" style="display:${i === 0 ? 'block' : 'none'}">${s.html}</div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:monospace;padding:12px;background:#fff}.tabs{display:flex;gap:4px;margin-bottom:12px;overflow-x:auto;padding-bottom:4px}.tab{padding:6px 14px;border-radius:8px;border:none;background:#f0f0f0;font-size:13px;cursor:pointer;white-space:nowrap}.tab.active{background:#0a84ff;color:#fff}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d0d0d0;padding:4px 8px;text-align:left;white-space:nowrap}th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}</style></head><body><div class="tabs">${tabs}</div>${bodies}</body></html>`;
}

export async function renderPptx(filePath: string): Promise<string> {
  const resolved = await resolveToLocal(filePath);
  const file = new File(resolved);
  const base64 = await file.base64();
  const arrayBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files).filter((f) => f.match(/ppt\/slides\/slide\d+\.xml$/)).sort((a,b)=>{
    const na = parseInt(a.match(/slide(\d+)\.xml$/)?.[1]||'0',10);
    const nb = parseInt(b.match(/slide(\d+)\.xml$/)?.[1]||'0',10);
    return na-nb;
  });
  if (slideFiles.length === 0) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;padding:24px}</style></head><body><p>No slides found.</p></body></html>`;
  }
  const slides: { title: string; content: string }[] = [];

  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('text');
    const texts: string[] = [];
    const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    for (const m of textMatches) {
      const inner = m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, '');
      const decoded = inner.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      if (decoded.trim()) texts.push(decoded.trim());
    }
    slides.push({ title: texts[0] || `Slide ${slides.length + 1}`, content: texts.slice(1).join('<br>') || '&nbsp;' });
  }

  const slideHtml = slides.map((s, i) => `
    <div class="slide ${i === 0 ? 'active' : ''}" data-index="${i}">
      <div class="slide-content">
        <h2>${s.title}</h2>
        <p>${s.content}</p>
      </div>
      <div class="slide-number">Slide ${i + 1} of ${slides.length}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;padding:12px;background:#f0f0f0;margin:0}.slide{background:#fff;border-radius:12px;padding:32px;min-height:350px;display:none;flex-direction:column;justify-content:center;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.1);margin-bottom:12px}.slide.active{display:flex}.slide-content{text-align:center;max-width:600px}.slide-content h2{font-size:28px;margin-bottom:16px;color:#1c1c1e}.slide-content p{font-size:18px;color:#555;line-height:1.6}.slide-number{font-size:13px;color:#999;margin-top:24px}.nav{display:flex;justify-content:center;gap:12px;padding:8px 0}.nav button{padding:8px 20px;border-radius:20px;border:none;background:#0a84ff;color:#fff;font-size:14px;cursor:pointer}.nav button:disabled{background:#ccc;cursor:default}</style></head><body><div class="slides">${slideHtml}</div><div class="nav"><button id="prev" onclick="changeSlide(-1)">Previous</button><button id="next" onclick="changeSlide(1)">Next</button></div><script>var current=0;var total=${slides.length};function changeSlide(d){var slides=document.querySelectorAll('.slide');slides[current].classList.remove('active');current=Math.max(0,Math.min(total-1,current+d));slides[current].classList.add('active');document.getElementById('prev').disabled=current===0;document.getElementById('next').disabled=current===total-1}</script></body></html>`;
}
