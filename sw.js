// Service Worker - 骨架版离线缓存
const CACHE = 'ai-learning-v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './auth.js', './config.js', './debug.js', './js/supabase.min.js', './js/marked.min.js', './js/purify.min.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 只缓存本站静态资源；Supabase 数据接口一律直连不落缓存（防私有数据进入 CacheStorage、防数据陈旧）
  const isStatic = url.origin === self.location.origin && !/^\/(rest|auth|functions)\//.test(url.pathname);
  if (e.request.method !== 'GET' || !isStatic) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
