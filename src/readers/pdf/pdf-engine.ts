import { Platform } from 'react-native';
import { File, Paths, Directory } from 'expo-file-system';
import { cacheFileName } from '@/services/uri-resolver';

export function getPdfSourceUri(path: string): string {
  if (Platform.OS === 'web') return path;
  if (path.startsWith('content://') || path.startsWith('file://')) return path;
  return `file://${path}`;
}

export async function resolvePdfUri(path: string): Promise<string> {
  if (!path.startsWith('content://')) return getPdfSourceUri(path);
  try {
    const src = new File(path);
    const info = src.info();
    if (!info.exists) return path;
    const cacheDir = new Directory(Paths.cache, 'pdf-cache');
    try { await cacheDir.create({ intermediates: true }); } catch {}
    const tmp = new File(cacheDir, cacheFileName(path, 'pdf'));
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
  } catch { return path; }
}

let cachedPdfJsBase64: string | null = null;
let cachedWorkerBase64: string | null = null;

async function loadPdfJsAssets(): Promise<{ pdfJs: string; worker: string }> {
  if (cachedPdfJsBase64 && cachedWorkerBase64) {
    return { pdfJs: cachedPdfJsBase64, worker: cachedWorkerBase64 };
  }
  try {
    const pdfJsFile = new File(Paths.bundle, 'assets', 'pdfjs', 'pdf.min.js');
    const workerFile = new File(Paths.bundle, 'assets', 'pdfjs', 'pdf.worker.min.js');
    cachedPdfJsBase64 = await pdfJsFile.base64();
    cachedWorkerBase64 = await workerFile.base64();
    return { pdfJs: cachedPdfJsBase64, worker: cachedWorkerBase64 };
  } catch {
    // Assets missing (e.g., dev / web) — return empty so engine falls back to CDN/native
    return { pdfJs: '', worker: '' };
  }
}

export async function getViewerHtml(): Promise<string> {
  let pdfJs = '';
  let worker = '';
  try {
    const assets = await loadPdfJsAssets();
    pdfJs = assets.pdfJs;
    worker = assets.worker;
  } catch {
    pdfJs = '';
    worker = '';
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#525659}
#viewer{width:100%;height:100%;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:8px 0}
.page{margin:4px auto;box-shadow:0 2px 8px rgba(0,0,0,.3);background:#fff;position:relative}
.page canvas{display:block;width:100%;height:auto}
.page .text-layer{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;opacity:0.2}
.page .text-layer span{cursor:text;color:transparent;position:absolute;white-space:pre;transform-origin:0% 0%}
.highlight{background:rgba(255,255,0,0.6)!important;opacity:1!important;color:transparent!important}
.active-highlight{background:rgba(255,150,0,0.8)!important;opacity:1!important;color:transparent!important}
.search-result{margin:2px 0;padding:6px 10px;cursor:pointer;border-radius:6px;font-size:13px;font-family:sans-serif;word-break:break-all}
.search-result:hover,.search-result.active{background:rgba(255,255,0,0.3)}
#search-panel{position:fixed;top:0;right:0;width:280px;height:100%;background:#2c2c2c;color:#eee;z-index:1000;display:none;flex-direction:column;font-family:sans-serif;padding:12px;overflow-y:auto;box-shadow:-2px 0 8px rgba(0,0,0,.4)}
#search-panel.open{display:flex}
#search-panel input{width:100%;padding:8px 12px;border:none;border-radius:8px;font-size:14px;background:#3c3c3c;color:#eee;margin-bottom:8px;outline:none}
#search-panel .close-btn{position:absolute;top:8px;right:8px;background:none;border:none;color:#aaa;font-size:20px;cursor:pointer}
#search-panel .stats{font-size:12px;color:#aaa;margin-bottom:8px}
#search-panel .results{flex:1;overflow-y:auto}
.loading,.error{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:sans-serif;font-size:15px;text-align:center;padding:20px;line-height:1.6}
.loading{color:#aaa}
.error{color:#ff6b6b}
</style>
</head>
<body>
<div id="viewer"><div class="loading">Loading PDF\u2026</div></div>
<div id="search-panel">
  <button class="close-btn" onclick="toggleSearch()">\u00d7</button>
  <div style="margin-bottom:4px;font-size:13px;font-weight:600;color:#ccc">Search</div>
  <input id="search-input" type="text" placeholder="Search text..." oninput="doSearch(this.value)">
  <div class="stats" id="search-stats"></div>
  <div class="results" id="search-results"></div>
</div>
<script>
var W=window, P=W.pdfjsLib, D=document, pdfDoc=null, scale=1.5, cache={}, textCache={}, searchMatches=[], searchIdx=-1;
var PDFJS_BASE64='${pdfJs}';
var WORKER_BASE64='${worker}';
function injectPDFjs(cb){
  if(typeof pdfjsLib!=='undefined'&&pdfjsLib){cb();return}
  if(!PDFJS_BASE64){
    var s2=D.createElement('script');
    s2.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s2.onload=function(){
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      cb();
    };
    s2.onerror=function(){ D.getElementById('viewer').innerHTML='<div class="error">Failed to load PDF engine.</div>'; W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'PDF engine unavailable'})) };
    D.head.appendChild(s2);
    return;
  }
  var bin=atob(PDFJS_BASE64);
  var arr=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  var blob=new Blob([arr],{type:'application/javascript'});
  var url=URL.createObjectURL(blob);
  var s=D.createElement('script');
  s.src=url;
  s.onload=function(){
    URL.revokeObjectURL(url);
    if(WORKER_BASE64){
      var wbin=atob(WORKER_BASE64);
      var warr=new Uint8Array(wbin.length);
      for(var j=0;j<wbin.length;j++)warr[j]=wbin.charCodeAt(j);
      var wblob=new Blob([warr],{type:'application/javascript'});
      pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(wblob);
    }
    cb();
  };
  s.onerror=function(){ D.getElementById('viewer').innerHTML='<div class="error">Failed to load PDF engine.</div>' };
  D.head.appendChild(s);
}
function render(n,thumbScale){
  var el=D.getElementById('p'+n);
  if(!el)return
  pdfDoc.getPage(n).then(function(pg){
    var vp=pg.getViewport({scale:thumbScale||scale});
    el.style.height=vp.height+'px';
    el.innerHTML='';
    var cv=D.createElement('canvas');
    cv.width=vp.width;cv.height=vp.height;
    el.appendChild(cv);
    pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise.then(function(){cache[n]=1;update()});
    pg.getTextContent().then(function(tc){
      textCache[n]=tc;
      if(!(thumbScale))buildTextLayer(n,pg,tc,vp);
    });
  });
}
function buildTextLayer(n,pg,tc,vp){
  var el=D.getElementById('p'+n);
  if(!el)return;
  var layer=D.createElement('div');
  layer.className='text-layer';
  layer.style.height=vp.height+'px';
  var tx=vp.transform;
  for(var i=0;i<tc.items.length;i++){
    var item=tc.items[i];
    var tfm=item.transform;
    var span=D.createElement('span');
    span.textContent=item.str;
    var fontSize=Math.sqrt(tfm[0]*tfm[0]+tfm[1]*tfm[1]);
    var left=tfm[4];
    var top=tfm[5]-fontSize;
    span.style.left=left+'px';
    span.style.top=top+'px';
    span.style.fontSize=fontSize+'px';
    span.style.fontFamily='sans-serif';
    layer.appendChild(span);
  }
  el.appendChild(layer);
}
function renderAll(){if(!pdfDoc)return;for(var i=1;i<=pdfDoc.numPages;i++)!function(p){setTimeout(function(){render(p)},p*80)}(i)}
function renderThumbnails(){
  var container=D.getElementById('thumbnails');
  if(!container)return;
  container.innerHTML='';
  for(var i=1;i<=pdfDoc.numPages;i++){
    var wrap=D.createElement('div');
    wrap.id='t'+i;
    wrap.style.cssText='margin:4px;cursor:pointer;border:2px solid transparent;border-radius:4px;overflow:hidden';
    wrap.onclick=function(p){return function(){goToPage(p)}}(i);
    container.appendChild(wrap);
    pdfDoc.getPage(i).then(function(pg,idx){
      var vp=pg.getViewport({scale:0.2});
      var cv=D.createElement('canvas');
      cv.width=vp.width;cv.height=vp.height;
      cv.style.cssText='width:100%;height:auto;display:block';
      pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise.then(function(){
        var el=D.getElementById('t'+idx);
        if(el)el.appendChild(cv);
      });
    }.bind(null,i));
  }
}
function update(){
  if(!pdfDoc)return;
  W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'pages',total:pdfDoc.numPages}));
}
function loadPDF(url){
  D.getElementById('viewer').innerHTML='<div class="loading">Loading PDF\u2026</div>';
  injectPDFjs(function(){
    pdfjsLib.getDocument(url).promise.then(function(doc){
      pdfDoc=doc;cache={};textCache={};
      var h='';
      for(var i=1;i<=doc.numPages;i++)h+='<div id="p'+i+'" class="page"></div>';
      D.getElementById('viewer').innerHTML=h;
      renderAll();
      W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'loaded',pages:doc.numPages}));
    },function(err){
      D.getElementById('viewer').innerHTML='<div class="error">'+err.message+'</div>';
      W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:err.message}));
    });
  });
}
function goToPage(p){
  var el=D.getElementById('p'+p);
  if(el){el.scrollIntoView({behavior:'smooth',block:'start'})}
  W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'pageChanged',page:p}));
}
function toggleSearch(){
  var p=D.getElementById('search-panel');
  p.classList.toggle('open');
  if(p.classList.contains('open'))setTimeout(function(){D.getElementById('search-input').focus()},100);
  W.ReactNativeWebView&&W.ReactNativeWebView.postMessage(JSON.stringify({type:'searchToggled',open:p.classList.contains('open')}));
}
function doSearch(q){
  if(!q.trim()){D.getElementById('search-results').innerHTML='';D.getElementById('search-stats').textContent='';clearHighlights();searchMatches=[];searchIdx=-1;return}
  clearHighlights();searchMatches=[];searchIdx=-1;
  var query=q.toLowerCase();
  D.getElementById('search-results').innerHTML='<div style="color:#aaa;font-size:13px;padding:8px">Searching...</div>';
  var promises=[];
  for(var i=1;i<=pdfDoc.numPages;i++){
    if(textCache[i]){promises.push(Promise.resolve(textCache[i]))}
    else{promises.push(pdfDoc.getPage(i).then(function(pg){return pg.getTextContent()}))}
  }
  Promise.all(promises).then(function(texts){
    searchMatches=[];
    for(var i=0;i<texts.length;i++){
      var pg=i+1;
      var full=texts[i].items.map(function(it){return it.str}).join(' ');
      var idx=full.toLowerCase().indexOf(query);
      if(idx!==-1){
        var snippet=full.substring(Math.max(0,idx-20),idx+query.length+40);
        searchMatches.push({page:pg,snippet:snippet,fullIdx:idx});
      }
    }
    var resultsEl=D.getElementById('search-results');
    var statsEl=D.getElementById('search-stats');
    if(searchMatches.length===0){
      statsEl.textContent='No results found';
      resultsEl.innerHTML='';
    }else{
      statsEl.textContent=searchMatches.length+' result'+(searchMatches.length>1?'s':'');
      resultsEl.innerHTML=searchMatches.map(function(m,i){
        return '<div class="search-result" onclick="goToSearchResult('+i+')">Page '+m.page+': '+m.snippet+'</div>';
      }).join('');
    }
  });
}
function goToSearchResult(idx){
  searchIdx=idx;
  var m=searchMatches[idx];
  if(!m)return;
  goToPage(m.page);
  var docs=document.querySelectorAll('.search-result');
  docs.forEach(function(d,i){d.classList.toggle('active',i===idx)});
}
function clearHighlights(){
  document.querySelectorAll('.highlight').forEach(function(e){e.classList.remove('highlight')});
}
W.addEventListener('message',function(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='load')loadPDF(m.url);
    if(m.type==='go'&&pdfDoc){goToPage(Math.max(1,Math.min(m.page,pdfDoc.numPages)))}
    if(m.type==='zi'&&pdfDoc){scale=Math.min(5,scale+.25);cache={};renderAll()}
    if(m.type==='zo'&&pdfDoc){scale=Math.max(.5,scale-.25);cache={};renderAll()}
    if(m.type==='search'){toggleSearch()}
    if(m.type==='thumbnails'){var s=D.getElementById('thumbnails');if(s.style.display!=='none'){s.style.display='none'}else{s.style.display='block';renderThumbnails()}}
  }catch(e){}
});
</script>
</body>
</html>`;
}
