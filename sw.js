const CACHE = 'nos-ai-v2';
const ASSETS = [
  '/NOS-AI/',
  '/NOS-AI/index.html',
  '/NOS-AI/manifest.json',
  '/NOS-AI/icon.svg'
];

/* تثبيت — كاش الملفات الأساسية */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
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

/* طلبات — من الكاش لو موجود، وإلا من النت */
self.addEventListener('fetch', e => {
  /* تجاهل طلبات الـ API */
  if(e.request.url.includes('workers.dev') ||
     e.request.url.includes('groq.com') ||
     e.request.method !== 'GET') return;

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
