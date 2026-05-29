// ════════════════════════════════════════
//  SERVICE WORKER — Life-control PWA
//  service-worker.js (в корне проекта)
// ════════════════════════════════════════

const CACHE_NAME = "life-control-v3";

const STATIC_ASSETS = [
  ".",
  "./index.html",
  "./css/main.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/db.js",
  "./js/modal.js",
  "./js/router.js",
  "./js/forms.js",
  "./js/calendar.js",
  "./js/storage.js",
  "./js/utils.js",
  "./js/tabs/dashboard.js",
  "./js/tabs/plan.js",
  "./js/tabs/goals.js",
  "./js/tabs/ideas.js",
  "./js/tabs/diary.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// ── Установка: кешируем статику ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => {
      console.warn("[SW] Cache install error:", err);
    })
  );
  self.skipWaiting();
});

// ── Активация: удаляем старые кеши ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: сначала сеть, при ошибке — кеш ──
// Firebase и Google Fonts загружаем только из сети
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Пропускаем Firebase-запросы и Chrome-расширения — только сеть
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase") ||
    url.includes("gstatic.com") ||
    url.includes("googleapis.com") ||
    url.startsWith("chrome-extension")
  ) {
    return; // браузер обработает сам
  }

  // Для остального: сначала сеть, при ошибке — кеш
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Кешируем свежий ответ
        if (response && response.status === 200 && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Нет сети — отдаём из кеша
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Если нет даже в кеше — отдаём index.html (для SPA)
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
