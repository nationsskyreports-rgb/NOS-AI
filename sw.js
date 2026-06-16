const CACHE = 'nos-ai-v3';

/* تثبيت — كاش الملفات الثابتة فقط */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      '/NOS-AI/',
      '/NOS-AI/index.html',
      '/NOS-AI/manifest.json',
      '/NOS-AI/icon.svg'
    ]).catch(() => {}))
  );
  self.skipWaiting();
});

/* تفعيل — حذف الكاش القديم */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* طلبات */
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  /* app.js و style.css — دايماً من النت (Network First) */
  if(url.pathname.endsWith('app.js') || url.pathname.endsWith('style.css')){
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  /* API calls — مش بنكاشهم */
  if(url.hostname.includes('workers.dev') ||
     url.hostname.includes('supabase.co') ||
     url.hostname.includes('groq.com')) return;

  /* باقي الملفات — Cache First */
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if(res && res.status === 200){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
