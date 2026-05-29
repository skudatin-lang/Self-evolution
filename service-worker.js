// ════════════════════════════════════════
//  SERVICE WORKER — Life Control v3
//  service-worker.js (в корне репозитория)
//  Репозиторий: /Self-evolution/
// ════════════════════════════════════════

const CACHE_NAME = "self-evolution-v3";
const BASE = "/Self-evolution";

const STATIC_ASSETS = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/css/main.css",
  BASE + "/js/app.js",
  BASE + "/js/firebase.js",
  BASE + "/js/db.js",
  BASE + "/js/modal.js",
  BASE + "/js/router.js",
  BASE + "/js/forms.js",
  BASE + "/js/calendar.js",
  BASE + "/js/storage.js",
  BASE + "/js/utils.js",
  BASE + "/js/survey.js",
  BASE + "/js/ai-plan.js",
  BASE + "/js/avatar.js",
  BASE + "/js/profile.js",
  BASE + "/js/actions-bank.js",
  BASE + "/js/tabs/dashboard.js",
  BASE + "/js/tabs/plan.js",
  BASE + "/js/tabs/goals.js",
  BASE + "/js/tabs/ideas.js",
  BASE + "/js/tabs/diary.js",
  BASE + "/manifest.json",
  BASE + "/icons/icon-192.png",
  BASE + "/icons/icon-512.png"
];

// ── Установка: кешируем статику ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn("[SW] Cache install error:", err))
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
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Firebase, Google APIs — только сеть, не кешируем
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase") ||
    url.includes("gstatic.com") ||
    url.includes("googleapis.com") ||
    url.startsWith("chrome-extension")
  ) {
    return;
  }

  // Всё остальное: сначала сеть, при ошибке — кеш
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Для навигации — отдаём index.html из кеша
          if (event.request.mode === "navigate") {
            return caches.match(BASE + "/index.html");
          }
        })
      )
  );
});
