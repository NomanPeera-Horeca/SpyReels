const CACHE='compounder-shell-v2';
const SHELL=['/mobile.css','/manifest.webmanifest','/compounder-icon.svg','/monthly-chart.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')) return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(async res=>{
      const type=res.headers.get('content-type')||'';
      if(!type.includes('text/html')) return res;
      let html=await res.text();
      if(!html.includes('/monthly-chart.js')) html=html.replace('</body>','<script src="/monthly-chart.js?v=2"></script></body>');
      return new Response(html,{status:res.status,statusText:res.statusText,headers:res.headers});
    }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match(req)));
});